"""
Fine-tune jobs: one at a time, in a child process (ml/finetune.py), so a crash or
the memory torch takes never touches the API process.

A new personal model is installed only when it is no worse than the one it was
trained from: base validation accuracy may drop by at most MAX_BASE_DROP, and
accuracy on the learner's held-out samples must not drop at all.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from .config import Settings
from .store import Store

MAX_BASE_DROP = 0.01
LOG_TAIL = 40


class Jobs:
    def __init__(self, settings: Settings, store: Store):
        self.s = settings
        self.store = store
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="finetune")
        self.active: dict[str, str] = {}  # learner → job id
        self.lock = threading.Lock()

    def start(self, learner: str) -> dict:
        with self.lock:
            running = self.active.get(learner)
            if running:
                return self.store.job(running) or {}
            job = {"id": uuid.uuid4().hex, "learner": learner, "status": "queued", "createdAt": time.time(), "log": []}
            self.active[learner] = job["id"]
            self.store.save_job(job)
        self.pool.submit(self._run, job)
        return job

    def _run(self, job: dict) -> None:
        learner = job["learner"]
        d = self.store.dir(learner)
        samples_file = d / "finetune-samples.json"
        out = d / "model.next.json"
        try:
            job.update(status="running", startedAt=time.time())
            self.store.save_job(job)
            samples_file.write_text(json.dumps({"version": 1, "samples": self.store.samples(learner)}), encoding="utf-8")
            cmd = [
                self.s.python, "finetune.py",
                str(self.s.base_model), str(samples_file), str(self.s.base_data), str(out), str(self.s.finetune_epochs),
            ]
            env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
            proc = subprocess.Popen(cmd, cwd=self.s.ml_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", env=env)
            for line in proc.stdout:  # type: ignore[union-attr]
                job["log"] = (job["log"] + [line.rstrip()])[-LOG_TAIL:]
                self.store.save_job(job)
            if proc.wait() != 0:
                raise RuntimeError(job["log"][-1] if job["log"] else f"finetune.py exited with {proc.returncode}")

            metrics = json.loads(out.with_name(out.name + ".metrics.json").read_text(encoding="utf-8"))
            job["metrics"] = metrics
            verdict, reason = passes(metrics)
            ok = verdict == "installed"
            if ok:
                target = self.store.personal_model(learner)
                os.replace(out, target)
                (target.with_suffix(".metrics.json")).write_text(json.dumps(metrics), encoding="utf-8")
            job.update(status="done", installed=ok, verdict=verdict, reason=reason)
        except Exception as e:  # noqa: BLE001 — any failure ends the job, never the server
            job.update(status="failed", error=str(e))
        finally:
            job["finishedAt"] = time.time()
            for p in (samples_file, out, out.with_name(out.name + ".metrics.json")):
                p.unlink(missing_ok=True)
            self.store.save_job(job)
            with self.lock:
                self.active.pop(learner, None)


def passes(m: dict) -> tuple[str, str]:
    """A verdict the web app translates (installed / worse_base / worse_personal), and the same in English."""
    before, after = m["before"], m["after"]
    if after["baseValid"] < before["baseValid"] - MAX_BASE_DROP:
        return "worse_base", "It got worse at other people's handwriting, so the current model was kept."
    if "personalHeldOut" in after and after["personalHeldOut"] < before["personalHeldOut"]:
        return "worse_personal", "It didn't read your handwriting any better, so the current model was kept."
    return "installed", "Installed: your handwriting model is updated."
