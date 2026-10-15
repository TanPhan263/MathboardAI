"""
Write src/lib/ink/__fixtures__/parity.json: a few real glyphs with the picture,
features and class probabilities Python computes from the exported model.
raster.test.ts checks the TypeScript side gives the same numbers.

  python parity.py <mathwriting dir> <model.json>
"""
import base64
import json
import os
import sys
from pathlib import Path

import numpy as np

from prepare import box, read_ink, unit_height
from raster import features, render

# The web app (default: ../mathcanvas next to this service) keeps the fixture its tests read.
WEB = Path(os.environ.get("WEB_DIR", Path(__file__).resolve().parents[2] / "mathcanvas"))
OUT = WEB / "src/lib/ink/__fixtures__/parity.json"


def forward(model, img, feat):
    x = img.astype(np.float64)[None] / 255  # (1, 32, 32)
    flat = None
    for l in model["layers"]:
        q = np.frombuffer(base64.b64decode(l["w"]), dtype=np.int8).astype(np.float64)
        if l["type"] == "conv":
            w = (q.reshape(l["cout"], -1) * np.array(l["scale"])[:, None]).reshape(l["cout"], l["cin"], 3, 3)
            c, s = x.shape[0], x.shape[1]
            pad = np.pad(x, ((0, 0), (1, 1), (1, 1)))
            out = np.zeros((l["cout"], s, s))
            for ky in range(3):
                for kx in range(3):
                    out += np.einsum("oc,chw->ohw", w[:, :, ky, kx], pad[:, ky:ky + s, kx:kx + s])
            x = np.maximum(out + np.array(l["b"])[:, None, None], 0)
            if l["pool"]:
                x = x.reshape(l["cout"], s // 2, 2, s // 2, 2).max((2, 4))
        else:
            if flat is None:
                x = np.concatenate([x.reshape(-1), feat.astype(np.float64)])
                flat = True
            w = q.reshape(l["nout"], l["nin"]) * np.array(l["scale"])[:, None]
            x = w @ x + np.array(l["b"])
            if l["relu"]:
                x = np.maximum(x, 0)
    e = np.exp(x - x.max())
    return e / e.sum()


def main(root, model_path):
    model = json.load(open(model_path, encoding="utf-8"))
    root = Path(root)
    cases = []
    for line in open(root / "symbols.jsonl", encoding="utf-8"):
        e = json.loads(line)
        path = root / "train" / f"{e['sourceSampleId']}.inkml"
        if not path.exists():
            continue
        _, strokes = read_ink(path)
        idx = [k for k in e["strokeIndices"] if k < len(strokes)]
        if not idx:
            continue
        H = unit_height([box(s) for s in strokes])
        glyph = [strokes[k] for k in idx]
        img = render(glyph)
        feat = features(glyph, H)
        cases.append({
            "label": e["label"],
            "unit": H,
            "strokes": [[{"x": float(p[0]), "y": float(p[1])} for p in s] for s in glyph],
            "image": img.reshape(-1).tolist(),
            "features": feat.tolist(),
            "probs": forward(model, img, feat).tolist(),
        })
        if len(cases) == 6:
            break
    OUT.parent.mkdir(exist_ok=True)
    json.dump({"classes": model["classes"], "cases": cases}, open(OUT, "w", encoding="utf-8"))
    print(f"wrote {OUT} ({len(cases)} cases)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
