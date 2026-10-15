import importlib
import json
import math
import time
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT.parent / "mathcanvas" / "src" / "lib" / "ink" / "__fixtures__" / "parity.json"
LEARNER = "test-learner-0001"


def two(i: int, jitter: float) -> dict:
    """A hand-made "2": an arc, then the diagonal and the base line."""
    rng = np.random.default_rng(i)
    j = lambda: float(rng.uniform(-jitter, jitter))
    arc = [[20 + 15 * math.cos(t / 10 * math.pi + math.pi) + j(), 12 + 12 * math.sin(t / 10 * math.pi + math.pi) + j()] for t in range(11)]
    return {"label": "2", "strokes": [arc + [[35 + j(), 15 + j()], [5 + j(), 40 + j()], [38 + j(), 40 + j()]]], "unit": 40}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # A tiny stand-in training set: enough rows for fine-tuning to run end to end.
    from app import ML_DIR  # noqa: F401 — puts ml/ on the import path
    from raster import features, render
    from symbols import CLASSES

    X, F, Y, SRC = [], [], [], []
    for i in range(240):
        s = two(i, 3)
        strokes = [np.asarray(st, dtype=np.float64) for st in s["strokes"]]
        X.append(render(strokes))
        F.append(features(strokes, 40))
        Y.append(CLASSES.index("2"))
        SRC.append(2 if i % 4 == 0 else 0)
    npz = tmp_path / "base.npz"
    np.savez(npz, X=np.stack(X), F=np.stack(F), Y=np.array(Y, dtype=np.int64), SRC=np.array(SRC))

    monkeypatch.setenv("MC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MC_BASE_DATA", str(npz))
    monkeypatch.setenv("MC_MIN_SAMPLES", "20")
    monkeypatch.setenv("MC_FINETUNE_EPOCHS", "1")
    import app.main as main

    importlib.reload(main)
    return TestClient(main.app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_network_matches_the_typescript_fixture():
    """Server probabilities equal the ones the browser computed (ml/parity.py fixture)."""
    from app.classifier import SymbolNet
    from raster import features, render
    import torch

    net = SymbolNet(ROOT / "models" / "base.json")
    for case in json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]:
        strokes = [np.asarray([[p["x"], p["y"]] for p in s], dtype=np.float64) for s in case["strokes"]]
        img = render(strokes)
        assert np.abs(img.astype(int).ravel() - np.asarray(case["image"])).max() <= 1
        assert np.allclose(features(strokes, case["unit"]), case["features"], atol=1e-4)
        x = torch.tensor(case["image"], dtype=torch.float32).reshape(1, 1, 32, 32) / 255
        p = net.probabilities(x, torch.tensor([case["features"]], dtype=torch.float32))[0].numpy()
        assert np.allclose(p, case["probs"], atol=1e-3), case["label"]


def test_classify_reads_a_fixture_symbol(client):
    case = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"][0]
    strokes = [[[p["x"], p["y"]] for p in s] for s in case["strokes"]]
    r = client.post("/v1/classify", json={"groups": [{"strokes": strokes, "unit": case["unit"]}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "∅" not in body["classes"] and len(body["costs"][0]) == len(body["classes"])
    best = body["classes"][int(np.argmin(body["costs"][0]))]
    expected = max(range(len(case["probs"])), key=lambda i: case["probs"][i])
    from symbols import CLASSES

    assert best == CLASSES[expected]


def test_rejects_bad_input(client):
    assert client.post("/v1/classify", json={"groups": [{"strokes": [], "unit": 40}]}).status_code == 422
    assert client.post("/v1/learners/x/samples", json={"samples": [two(0, 1)]}).status_code == 422  # id too short
    bad = {**two(0, 1), "label": "√"}
    assert client.post(f"/v1/learners/{LEARNER}/samples", json={"samples": [bad]}).status_code == 422


def test_samples_and_forget(client):
    r = client.post(f"/v1/learners/{LEARNER}/samples", json={"samples": [two(i, 2) for i in range(3)]})
    assert r.status_code == 201 and r.json()["total"] == 3
    info = client.get(f"/v1/learners/{LEARNER}").json()
    assert info["samples"] == 3 and info["byLabel"] == {"2": 3} and info["model"]["personal"] is False
    assert client.post(f"/v1/learners/{LEARNER}/finetune").status_code == 422  # too few
    assert client.delete(f"/v1/learners/{LEARNER}").status_code == 204
    assert client.get(f"/v1/learners/{LEARNER}").json()["samples"] == 0


def test_finetune_job_runs_and_reports(client):
    client.post(f"/v1/learners/{LEARNER}/samples", json={"samples": [two(i, 2) for i in range(30)]})
    r = client.post(f"/v1/learners/{LEARNER}/finetune")
    assert r.status_code == 202, r.text
    job_id = r.json()["id"]
    deadline = time.time() + 240
    while time.time() < deadline:
        job = client.get(f"/v1/jobs/{job_id}").json()
        if job["status"] in ("done", "failed"):
            break
        time.sleep(1)
    assert job["status"] == "done", job
    assert {"before", "after"} <= set(job["metrics"])
    info = client.get(f"/v1/learners/{LEARNER}").json()
    assert info["model"]["personal"] is job["installed"]
    # Reading now uses the learner's own model when one was installed.
    case = two(99, 2)
    r = client.post("/v1/classify", json={"learner": LEARNER, "groups": [{"strokes": case["strokes"], "unit": 40}]})
    assert r.json()["personal"] is job["installed"]
