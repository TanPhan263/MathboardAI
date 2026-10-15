"""
Files on disk, one folder per learner:

  data/learners/<id>/samples.jsonl     symbols the learner fixed by hand (one JSON per line)
  data/learners/<id>/model.json        their fine-tuned network, once one passed the checks
  data/learners/<id>/model.metrics.json  how it scored when it was installed
  data/jobs/<job id>.json              fine-tune job status and log
"""

from __future__ import annotations

import json
import shutil
import threading
from collections import Counter
from pathlib import Path

from .classifier import SymbolNet
from .config import Settings

_lock = threading.Lock()


class Store:
    def __init__(self, settings: Settings):
        self.s = settings
        self.learners = settings.data_dir / "learners"
        self.jobs = settings.data_dir / "jobs"
        self.learners.mkdir(parents=True, exist_ok=True)
        self.jobs.mkdir(parents=True, exist_ok=True)
        self._nets: dict[Path, tuple[float, SymbolNet]] = {}

    # ── samples ──

    def dir(self, learner: str) -> Path:
        return self.learners / learner

    def samples_path(self, learner: str) -> Path:
        return self.dir(learner) / "samples.jsonl"

    def add_samples(self, learner: str, samples: list[dict]) -> int:
        with _lock:
            d = self.dir(learner)
            d.mkdir(parents=True, exist_ok=True)
            with open(self.samples_path(learner), "a", encoding="utf-8") as fh:
                for s in samples:
                    fh.write(json.dumps(s, ensure_ascii=False) + "\n")
        return self.count(learner)

    def samples(self, learner: str) -> list[dict]:
        p = self.samples_path(learner)
        if not p.exists():
            return []
        return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

    def count(self, learner: str) -> int:
        p = self.samples_path(learner)
        return sum(1 for line in p.open(encoding="utf-8") if line.strip()) if p.exists() else 0

    def by_label(self, learner: str) -> dict[str, int]:
        return dict(Counter(s["label"] for s in self.samples(learner)))

    def delete(self, learner: str) -> None:
        with _lock:
            shutil.rmtree(self.dir(learner), ignore_errors=True)
            self._nets.pop(self.dir(learner) / "model.json", None)

    # ── models ──

    def personal_model(self, learner: str) -> Path:
        return self.dir(learner) / "model.json"

    def model_for(self, learner: str | None) -> tuple[SymbolNet, bool]:
        """The learner's own network when they have one, else the shared one."""
        if learner:
            p = self.personal_model(learner)
            if p.exists():
                return self._net(p), True
        return self._net(self.s.base_model), False

    def _net(self, path: Path) -> SymbolNet:
        # Reloaded when the file changes (a fine-tune finished, or a new base model was copied in).
        mtime = path.stat().st_mtime
        with _lock:
            hit = self._nets.get(path)
            if hit and hit[0] == mtime:
                return hit[1]
        net = SymbolNet(path)
        with _lock:
            self._nets[path] = (mtime, net)
        return net

    def model_info(self, learner: str) -> dict:
        p = self.personal_model(learner)
        m = p.with_suffix(".metrics.json")
        return {
            "personal": p.exists(),
            "metrics": json.loads(m.read_text(encoding="utf-8")) if m.exists() else None,
        }

    # ── jobs ──

    def save_job(self, job: dict) -> None:
        (self.jobs / f"{job['id']}.json").write_text(json.dumps(job), encoding="utf-8")

    def job(self, job_id: str) -> dict | None:
        p = self.jobs / f"{job_id}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
