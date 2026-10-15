"""
Fine-tune the installed symbol network on a learner's own handwriting.

  python finetune.py <model.json> <samples.json> <base.npz> <out.json> [epochs]

<samples.json> is {"samples": [...]}: symbols a learner fixed by hand on the board,
plus "∅" groupings they split or joined away. The API (app/jobs.py) writes it
from the samples learners sent, runs this script, and installs the result only
if it passes the checks below. Scores go to <out.json>.metrics.json.
Samples are mixed with a random slice of the original training data each epoch so
the network learns this hand without forgetting everyone else's.

Reports accuracy before and after on:
  - held-out personal samples (20 %, when there are at least 20), and
  - the base validation split (should not drop by more than a point or so).
"""

import base64
import json
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from raster import features, render
from symbols import CLASSES
from train import Net, augment, export

torch.manual_seed(0)
rng = np.random.default_rng(0)


def load_model(path: str) -> tuple[Net, dict]:
    """Rebuild a trainable Net from the exported int8 weights (batch-norm already folded in)."""
    m = json.load(open(path, encoding="utf-8"))
    layers = m["layers"]
    width = m.get("meta", {}).get("width") or layers[0]["cout"] // 16
    net = Net(len(CLASSES), width)

    def weight(layer, shape):
        q = np.frombuffer(base64.b64decode(layer["w"]), dtype=np.int8).astype(np.float32)
        q = q.reshape(shape[0], -1) * np.asarray(layer["scale"], dtype=np.float32)[:, None]
        return torch.from_numpy(q.reshape(shape))

    with torch.no_grad():
        for blk, layer in zip(net.convs, layers[:5]):
            conv, bn = blk[0], blk[1]
            conv.weight.copy_(weight(layer, conv.weight.shape))
            # Folded: batch-norm becomes y = x + b.
            bn.weight.fill_(1.0)
            bn.bias.copy_(torch.tensor(layer["b"]))
            bn.running_mean.zero_()
            bn.running_var.fill_(1.0 - bn.eps)
        for lin, layer in zip((net.fc1, net.fc2), layers[5:]):
            lin.weight.copy_(weight(layer, lin.weight.shape))
            lin.bias.copy_(torch.tensor(layer["b"]))
    return net, m.get("meta", {})


def load_samples(path: str):
    data = json.load(open(path, encoding="utf-8"))
    X, Fe, Y = [], [], []
    for s in data["samples"]:
        if s["label"] not in CLASSES or not s["strokes"]:
            continue
        strokes = [np.asarray(st, dtype=np.float64).reshape(-1, 2) for st in s["strokes"] if st]
        X.append(render(strokes))
        Fe.append(features(strokes, s["unit"]))
        Y.append(CLASSES.index(s["label"]))
    return (torch.from_numpy(np.stack(X)).float().unsqueeze(1) / 255, torch.from_numpy(np.stack(Fe)), torch.tensor(Y))


def accuracy(net, X, Fe, Y):
    net.eval()
    with torch.no_grad():
        pred = torch.cat([net(X[i:i + 1024], Fe[i:i + 1024]).argmax(1) for i in range(0, len(Y), 1024)])
    return (pred == Y).float().mean().item()


def main(model_path, samples_path, base_path, out_path, epochs=4):
    net, meta = load_model(model_path)
    Xp, Fp, Yp = load_samples(samples_path)
    n = len(Yp)
    print(f"personal samples: {n}  ({', '.join(f'{c}:{int((Yp == i).sum())}' for i, c in enumerate(CLASSES) if (Yp == i).any())})")
    if n < 5:
        sys.exit("Need at least 5 samples: fix more symbols on the board first.")

    order = torch.from_numpy(rng.permutation(n))
    held = order[: n // 5] if n >= 20 else order[:0]
    fit = order[n // 5:] if n >= 20 else order

    d = np.load(base_path)
    SRC = d["SRC"]
    train_idx = np.flatnonzero(SRC != 2)
    valid_idx = rng.choice(np.flatnonzero(SRC == 2), size=min(10000, int((SRC == 2).sum())), replace=False)
    base = lambda idx: (torch.from_numpy(d["X"][idx]).float().unsqueeze(1) / 255, torch.from_numpy(d["F"][idx]), torch.from_numpy(d["Y"][idx]))
    Xv, Fv, Yv = base(np.sort(valid_idx))

    metrics = {"samples": n, "heldOut": int(len(held))}

    def report(tag):
        m = {"baseValid": accuracy(net, Xv, Fv, Yv), "personalFit": accuracy(net, Xp[fit], Fp[fit], Yp[fit])}
        if len(held):
            m["personalHeldOut"] = accuracy(net, Xp[held], Fp[held], Yp[held])
        metrics[tag] = {k: round(v, 4) for k, v in m.items()}
        print(f"{tag}: " + "  ".join(f"{k} {v:.4f}" for k, v in m.items()), flush=True)

    report("before")
    opt = torch.optim.AdamW(net.parameters(), lr=3e-4, weight_decay=1e-4)
    # Personal samples make up about a fifth of every batch, repeated as needed.
    per_epoch_base = min(40000, len(train_idx))
    reps = max(1, round(per_epoch_base / 4 / len(fit)))
    for ep in range(epochs):
        idx = np.sort(rng.choice(train_idx, size=per_epoch_base, replace=False))
        Xb, Fb, Yb = base(idx)
        X = torch.cat([Xb, Xp[fit].repeat(reps, 1, 1, 1)])
        Fe = torch.cat([Fb, Fp[fit].repeat(reps, 1)])
        Y = torch.cat([Yb, Yp[fit].repeat(reps)])
        perm = torch.randperm(len(Y))
        net.train()
        # Batch-norm is folded into fixed offsets: keep it frozen.
        for m in net.modules():
            if isinstance(m, nn.BatchNorm2d):
                m.eval()
        total = 0.0
        for i in range(0, len(Y), 256):
            b = perm[i:i + 256]
            x, f = augment(X[b], Fe[b])
            loss = F.cross_entropy(net(x, f), Y[b], label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * len(b)
        print(f"epoch {ep + 1}/{epochs}  loss {total / len(Y):.3f}", flush=True)
    report("after")
    export(net, out_path, {**meta, "finetunedOn": int(len(fit)), "baseValidAccuracy": metrics["after"]["baseValid"]})
    with open(out_path + ".metrics.json", "w", encoding="utf-8") as fh:
        json.dump(metrics, fh)
    print(f"saved {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]) if len(sys.argv) > 5 else 4)
