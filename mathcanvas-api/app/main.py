"""
HTTP API for the board's handwriting reader.

  POST   /v1/classify                    score stroke groups (the board's reader calls this)
  POST   /v1/learners/{id}/samples       store symbols the learner fixed by hand
  GET    /v1/learners/{id}               samples stored, personal model, last job
  DELETE /v1/learners/{id}               forget the learner (samples and model)
  POST   /v1/learners/{id}/finetune      train a personal model on their samples
  GET    /v1/jobs/{id}                   fine-tune progress

Learner ids are random ids made by the browser. There is no sign-in yet: put
real authentication in front of this before it is public (see README.md).
"""

from __future__ import annotations

from typing import Annotated

import numpy as np
from fastapi import FastAPI, HTTPException, Path, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .classifier import SYMBOL_CLASSES
from .config import Settings
from .jobs import Jobs
from .store import Store
from symbols import CLASSES

settings = Settings()
store = Store(settings)
jobs = Jobs(settings, store)

app = FastAPI(title="MathCanvas handwriting API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

LearnerId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{8,64}$")]
Point = tuple[float, float]
# Limits keep one request cheap: a busy line is a few dozen groups of a few strokes.
Stroke = Annotated[list[Point], Field(min_length=1, max_length=2000)]
Strokes = Annotated[list[Stroke], Field(min_length=1, max_length=16)]


class Group(BaseModel):
    strokes: Strokes
    unit: float = Field(gt=0, lt=1e6)


class ClassifyRequest(BaseModel):
    learner: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{8,64}$")
    groups: list[Group] = Field(max_length=600)


class ClassifyResponse(BaseModel):
    classes: list[str]
    costs: list[list[float]]
    personal: bool


class Sample(BaseModel):
    label: str
    strokes: Strokes
    unit: float = Field(gt=0, lt=1e6)
    at: float = 0

    @field_validator("label")
    @classmethod
    def known(cls, v: str) -> str:
        if v not in CLASSES:
            raise ValueError(f"unknown label {v!r}")
        return v


class SamplesRequest(BaseModel):
    samples: list[Sample] = Field(min_length=1, max_length=500)


MAX_SAMPLES_PER_LEARNER = 20000


@app.get("/health")
def health() -> dict:
    net, _ = store.model_for(None)
    return {"ok": True, "model": net.meta, "finetune": settings.base_data is not None}


@app.post("/v1/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    net, personal = store.model_for(req.learner)
    groups = [([np.asarray(s, dtype=np.float64) for s in g.strokes], g.unit) for g in req.groups]
    return ClassifyResponse(classes=SYMBOL_CLASSES, costs=net.classify(groups), personal=personal)


@app.post("/v1/learners/{learner}/samples", status_code=status.HTTP_201_CREATED)
def add_samples(learner: LearnerId, req: SamplesRequest) -> dict:
    if store.count(learner) + len(req.samples) > MAX_SAMPLES_PER_LEARNER:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Sample limit reached for this learner")
    total = store.add_samples(learner, [s.model_dump() for s in req.samples])
    return {"total": total}


@app.get("/v1/learners/{learner}")
def learner_info(learner: LearnerId) -> dict:
    running = jobs.active.get(learner)
    return {
        "samples": store.count(learner),
        "byLabel": store.by_label(learner),
        "minSamples": settings.min_samples,
        "model": store.model_info(learner),
        "job": store.job(running) if running else None,
    }


@app.delete("/v1/learners/{learner}", status_code=status.HTTP_204_NO_CONTENT)
def forget(learner: LearnerId) -> None:
    if jobs.active.get(learner):
        raise HTTPException(status.HTTP_409_CONFLICT, "A training run is in progress")
    store.delete(learner)


@app.post("/v1/learners/{learner}/finetune", status_code=status.HTTP_202_ACCEPTED)
def finetune(learner: LearnerId) -> dict:
    if settings.base_data is None or not settings.base_data.exists():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Training is not set up on this server")
    n = store.count(learner)
    if n < settings.min_samples:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Fix at least {settings.min_samples} symbols first ({n} so far)")
    return jobs.start(learner)


@app.get("/v1/jobs/{job_id}")
def job(job_id: Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]) -> dict:
    j = store.job(job_id)
    if not j:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such job")
    return j
