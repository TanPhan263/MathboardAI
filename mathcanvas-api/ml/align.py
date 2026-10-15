"""
Forced alignment: split an ink into symbols using the trained network AND the
known label. The label fixes *which* symbols appear in which order; the network
only decides which strokes form each one. This recovers inks the plain grouping
rules split wrongly, so they can become training data.

Used by prepare.py when a model is given (--model).
"""

import base64
import json
import math

import numpy as np
import torch
import torch.nn.functional as F

from raster import features, render
from symbols import CLASSES


class ExportedNet(torch.nn.Module):
    """The browser model (folded batch-norm, int8 weights) rebuilt in torch for fast batches."""

    def __init__(self, path):
        super().__init__()
        spec = json.load(open(path, encoding="utf-8"))
        assert spec["classes"] == CLASSES, "model classes differ from symbols.py"
        self.layers = []
        for l in spec["layers"]:
            q = np.frombuffer(base64.b64decode(l["w"]), dtype=np.int8).astype(np.float32)
            rows = l["cout"] if l["type"] == "conv" else l["nout"]
            w = q.reshape(rows, -1) * np.array(l["scale"], dtype=np.float32)[:, None]
            if l["type"] == "conv":
                w = w.reshape(l["cout"], l["cin"], 3, 3)
            self.layers.append((l, torch.from_numpy(w), torch.tensor(l["b"], dtype=torch.float32)))

    @torch.no_grad()
    def log_probs(self, images: np.ndarray, feats: np.ndarray) -> np.ndarray:
        x = torch.from_numpy(images).float().unsqueeze(1) / 255
        f = torch.from_numpy(feats).float()
        flat = False
        for l, w, b in self.layers:
            if l["type"] == "conv":
                x = F.relu(F.conv2d(x, w, b, padding=1))
                if l["pool"]:
                    x = F.max_pool2d(x, 2)
            else:
                if not flat:
                    x = torch.cat([x.flatten(1), f], 1)
                    flat = True
                x = F.linear(x, w, b)
                if l["relu"]:
                    x = F.relu(x)
        return F.log_softmax(x, 1).numpy()


def atoms(strokes, boxes, H, strokes_cross):
    """Stroke clusters that are surely one symbol (crossing or stacked), like segment() in recognize.ts."""
    n = len(strokes)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            a, b = boxes[i], boxes[j]
            wa, wb = max(a[2], 0.15 * H), max(b[2], 0.15 * H)
            ca, cb = a[0] + a[2] / 2, b[0] + b[2] / 2
            overlap = min(ca + wa / 2, cb + wb / 2) - max(ca - wa / 2, cb - wb / 2)
            stacked = overlap >= 0.8 * min(wa, wb) and abs((a[1] + a[3] / 2) - (b[1] + b[3] / 2)) < 0.9 * H
            if stacked or strokes_cross(strokes[i], strokes[j], a, b):
                parent[find(i)] = find(j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    out = []
    for g in groups.values():
        x0 = min(boxes[k][0] for k in g)
        x1 = max(boxes[k][0] + boxes[k][2] for k in g)
        y0 = min(boxes[k][1] for k in g)
        y1 = max(boxes[k][1] + boxes[k][3] for k in g)
        out.append((g, (x0, y0, x1 - x0, y1 - y0)))
    out.sort(key=lambda a: a[1][0] + a[1][2] / 2)
    return out


def forced_align(net, strokes, boxes, H, toks, strokes_cross, min_p=0.05, mean_p=0.4):
    """Groups of stroke indices, one per label token — or None if the network disagrees."""
    at = atoms(strokes, boxes, H, strokes_cross)
    n, m = len(at), len(toks)
    if m > n or m == 0:
        return None
    # Every run of 1–4 neighbouring atoms that could be one symbol.
    cands = []
    for i in range(n):
        for k in range(1, 5):
            if i + k > n:
                break
            run = at[i:i + k]
            if k > 1:
                x0 = min(a[1][0] for a in run)
                x1 = max(a[1][0] + a[1][2] for a in run)
                y0 = min(a[1][1] for a in run)
                y1 = max(a[1][1] + a[1][3] for a in run)
                if x1 - x0 > 1.6 * H or y1 - y0 > 1.8 * H:
                    break
                if any(run[r][1][0] - (run[r - 1][1][0] + run[r - 1][1][2]) > 0.35 * H for r in range(1, k)):
                    break
            idx = [s for a in run for s in a[0]]
            cands.append((i, k, idx))
    imgs = np.stack([render([strokes[s] for s in c[2]]) for c in cands])
    feats = np.stack([features([strokes[s] for s in c[2]], H) for c in cands])
    lp = net.log_probs(imgs, feats)
    tok_idx = [CLASSES.index(t) for t in toks]
    by_start = {}
    for r, (i, k, idx) in enumerate(cands):
        by_start.setdefault(i, []).append((k, r))
    INF = math.inf
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n):
        for j in range(m):
            if dp[i][j] == INF:
                continue
            for k, r in by_start.get(i, []):
                c = dp[i][j] - lp[r, tok_idx[j]]
                if c < dp[i + k][j + 1]:
                    dp[i + k][j + 1] = c
                    back[i + k][j + 1] = (i, r)
    if dp[n][m] == INF:
        return None
    groups, probs = [], []
    i, j = n, m
    while j > 0:
        pi, r = back[i][j]
        groups.append(cands[r][2])
        probs.append(math.exp(lp[r, tok_idx[j - 1]]))
        i, j = pi, j - 1
    groups.reverse()
    if min(probs) < min_p or math.exp(sum(math.log(p) for p in probs) / len(probs)) < mean_p:
        return None
    return groups
