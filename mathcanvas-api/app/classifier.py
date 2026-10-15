"""
The symbol network, served. Same maths as the browser used to run
(mathcanvas/src/lib/ink/model.ts): the 32×32 picture and size features from
ml/raster.py, three slightly slanted views averaged, softmax, −log p per class.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from raster import SIZE, features, render
from symbols import CLASSES, JUNK

SLANTS = (0.0, 0.12, -0.12)
MIN_PROB = 1e-6


class SymbolNet:
    """Exported model file → float32 tensors (int8 × per-row scale, batch-norm already folded in)."""

    def __init__(self, path: Path):
        spec = json.loads(Path(path).read_text(encoding="utf-8"))
        if spec.get("version") != 1 or spec.get("input") != SIZE:
            raise ValueError("Unsupported handwriting model")
        if spec["classes"] != CLASSES:
            raise ValueError("Model classes differ from ml/symbols.py")
        self.classes: list[str] = spec["classes"]
        self.meta: dict = spec.get("meta", {})
        self.layers = []
        for l in spec["layers"]:
            rows = l["cout"] if l["type"] == "conv" else l["nout"]
            q = np.frombuffer(base64.b64decode(l["w"]), dtype=np.int8).astype(np.float32).reshape(rows, -1)
            w = torch.from_numpy(q * np.asarray(l["scale"], dtype=np.float32)[:, None])
            b = torch.tensor(l["b"], dtype=torch.float32)
            if l["type"] == "conv":
                self.layers.append(("conv", w.reshape(l["cout"], l["cin"], 3, 3), b, l["pool"]))
            else:
                self.layers.append(("dense", w, b, l["relu"]))

    @torch.no_grad()
    def probabilities(self, images: torch.Tensor, extra: torch.Tensor) -> torch.Tensor:
        """images (N,1,32,32) in 0..1, extra (N,3) → (N, classes)."""
        x = images
        flat = False
        for kind, w, b, opt in self.layers:
            if kind == "conv":
                x = F.relu(F.conv2d(x, w, b, padding=1))
                if opt:
                    x = F.max_pool2d(x, 2)
                continue
            if not flat:
                x = torch.cat([x.flatten(1), extra], 1)
                flat = True
            x = F.linear(x, w, b)
            if opt:
                x = F.relu(x)
        return torch.softmax(x, 1)

    def classify(self, groups: list[tuple[list[np.ndarray], float]]) -> list[list[float]]:
        """
        One cost (−log p) per real symbol, in CLASSES order without "∅", for each
        group of strokes. The junk class is left out on purpose: its share of the
        probability raises every real symbol's cost, which steers the split.
        """
        if not groups:
            return []
        images, extra = [], []
        for strokes, unit in groups:
            f = features(strokes, unit)
            for k in SLANTS:
                images.append(render(strokes if k == 0 else slant(strokes, k)))
                extra.append(f)
        x = torch.from_numpy(np.stack(images)).float().unsqueeze(1) / 255
        e = torch.from_numpy(np.stack(extra)).float()
        p = self.probabilities(x, e).reshape(len(groups), len(SLANTS), -1).mean(1)
        keep = [i for i, c in enumerate(self.classes) if c != JUNK]
        cost = -torch.log(p[:, keep].clamp(min=MIN_PROB))
        return [[round(v, 5) for v in row] for row in cost.tolist()]


def slant(strokes: list[np.ndarray], k: float) -> list[np.ndarray]:
    """Lean the strokes by k (x shifts with height), around their middle."""
    y0 = min(float(s[:, 1].min()) for s in strokes)
    y1 = max(float(s[:, 1].max()) for s in strokes)
    mid = (y0 + y1) / 2
    out = []
    for s in strokes:
        t = s.copy()
        t[:, 0] = s[:, 0] + k * (mid - s[:, 1])
        out.append(t)
    return out


SYMBOL_CLASSES = [c for c in CLASSES if c != JUNK]
