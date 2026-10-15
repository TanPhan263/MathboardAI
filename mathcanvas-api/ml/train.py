"""
Train the symbol network and export it for the browser.

  python train.py <data.npz> <out.json> [epochs] [width]

Progress is checkpointed to <out.json>.ckpt.pt after every epoch; running the
same command again resumes from it (a long run survives sleep or a crash).

Network: 3 conv blocks (16-16 / 32-32 / 64) on the 32×32 picture, then the
3 size features join a small dense head. Batch-norm is folded into the convs and
weights are stored as int8 with one scale per output channel, so the browser
model is a few hundred KB and runs in plain TypeScript (src/lib/ink/model.ts).
"""

import base64
import json
import math
import os
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from symbols import CLASSES

torch.manual_seed(0)
np.random.seed(0)
torch.set_num_threads(max(1, torch.get_num_threads()))


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU())


class Net(nn.Module):
    def __init__(self, n, width=1):
        super().__init__()
        a, b, c = 16 * width, 32 * width, 64 * width
        self.convs = nn.ModuleList([block(1, a), block(a, a), block(a, b), block(b, b), block(b, c)])
        self.pool_after = {1, 3, 4}  # 32 → 16 → 8 → 4
        self.fc1 = nn.Linear(c * 4 * 4 + 3, 128 * width)
        self.drop = nn.Dropout(0.3)
        self.fc2 = nn.Linear(128 * width, n)

    def forward(self, x, f):
        for i, c in enumerate(self.convs):
            x = c(x)
            if i in self.pool_after:
                x = F.max_pool2d(x, 2)
        x = torch.cat([x.flatten(1), f], 1)
        return self.fc2(self.drop(F.relu(self.fc1(x))))


def augment(x, f):
    """Random slant, rotation, squash, shift and pen thickness — handwriting is messy."""
    n = x.shape[0]
    ang = (torch.rand(n) - 0.5) * math.radians(24)
    shear = (torch.rand(n) - 0.5) * 0.5
    sx = 1 + (torch.rand(n) - 0.5) * 0.3
    sy = 1 + (torch.rand(n) - 0.5) * 0.3
    tx = (torch.rand(n) - 0.5) * 0.15
    ty = (torch.rand(n) - 0.5) * 0.15
    c, s = torch.cos(ang), torch.sin(ang)
    theta = torch.zeros(n, 2, 3)
    theta[:, 0, 0] = c * sx
    theta[:, 0, 1] = -s * sx + shear
    theta[:, 1, 0] = s * sy
    theta[:, 1, 1] = c * sy
    theta[:, 0, 2] = tx
    theta[:, 1, 2] = ty
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    x = F.grid_sample(x, grid, align_corners=False, padding_mode="zeros")
    thick = torch.rand(n) < 0.3
    if thick.any():
        x[thick] = torch.maximum(x[thick], 0.6 * F.max_pool2d(x[thick], 3, 1, 1))
    f = f.clone()
    f[:, :2] += torch.randn(n, 2) * 0.12
    # Some samples (HASYv2 pictures) come without a known line height or stroke
    # count; show other samples that way too, so missing size info isn't a class hint.
    blind = torch.rand(n) < 0.1
    f[blind, 0] = 0.0
    f[blind, 2] = 0.5
    return x, f


def export(model: Net, path: str, meta: dict):
    model.eval()
    layers = []

    def q(w):
        """int8 with one scale per output row/channel."""
        w = w.detach().double()
        flat = w.reshape(w.shape[0], -1)
        scale = flat.abs().max(1).values.clamp(min=1e-8) / 127
        qi = torch.round(flat / scale[:, None]).clamp(-127, 127).to(torch.int8)
        return base64.b64encode(qi.numpy().tobytes()).decode(), scale.float().tolist()

    for i, blk in enumerate(model.convs):
        conv, bn = blk[0], blk[1]
        k = bn.weight / torch.sqrt(bn.running_var + bn.eps)
        w = conv.weight * k[:, None, None, None]
        b = bn.bias - bn.running_mean * k
        data, scale = q(w)
        layers.append({"type": "conv", "cin": conv.in_channels, "cout": conv.out_channels,
                       "w": data, "scale": scale, "b": b.detach().tolist(), "pool": i in model.pool_after})
    for name in ("fc1", "fc2"):
        lin = getattr(model, name)
        data, scale = q(lin.weight)
        layers.append({"type": "dense", "nin": lin.in_features, "nout": lin.out_features,
                       "w": data, "scale": scale, "b": lin.bias.detach().tolist(), "relu": name == "fc1"})
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"version": 1, "classes": CLASSES, "input": 32, "layers": layers, "meta": meta}, fh)


def main(data_path, out_path, epochs=14, width=1):
    d = np.load(data_path)
    X = torch.from_numpy(d["X"]).float().unsqueeze(1) / 255
    Fe = torch.from_numpy(d["F"])
    Y = torch.from_numpy(d["Y"])
    SRC = d["SRC"]
    val = SRC == 2
    if val.sum() < 200:  # tiny datasets (the excerpt): hold out 10 % at random
        val = np.random.rand(len(Y)) < 0.1
    tr = ~val
    Xt, Ft, Yt = X[tr], Fe[tr], Y[tr]
    Xv, Fv, Yv = X[val], Fe[val], Y[val]
    print(f"train {len(Yt)}  valid {len(Yv)}")

    counts = torch.bincount(Yt, minlength=len(CLASSES)).float()
    weight = (counts.sum() / counts.clamp(min=1)).sqrt()
    weight = weight / weight.mean()

    model = Net(len(CLASSES), width)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    steps = epochs * math.ceil(len(Yt) / 256)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=steps)
    best = (0.0, None)
    start = 0
    ckpt = out_path + ".ckpt.pt"
    if os.path.exists(ckpt):
        c = torch.load(ckpt, weights_only=False)
        model.load_state_dict(c["model"])
        opt.load_state_dict(c["opt"])
        sched.load_state_dict(c["sched"])
        torch.set_rng_state(c["rng"])
        best, start = c["best"], c["epoch"]
        print(f"resumed after epoch {start}  best valid acc {best[0]:.4f}")
    for ep in range(start, epochs):
        model.train()
        perm = torch.randperm(len(Yt))
        t0 = time.time()
        total = 0.0
        for i in range(0, len(Yt), 256):
            idx = perm[i:i + 256]
            x, f = augment(Xt[idx], Ft[idx])
            loss = F.cross_entropy(model(x, f), Yt[idx], weight=weight, label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(idx)
        model.eval()
        with torch.no_grad():
            pred = torch.cat([model(Xv[i:i + 1024], Fv[i:i + 1024]).argmax(1) for i in range(0, len(Yv), 1024)])
        acc = (pred == Yv).float().mean().item()
        print(f"epoch {ep + 1}/{epochs}  loss {total / len(Yt):.3f}  valid acc {acc:.4f}  ({time.time() - t0:.0f}s)", flush=True)
        if acc >= best[0]:
            best = (acc, {k: v.clone() for k, v in model.state_dict().items()})
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(),
                    "rng": torch.get_rng_state(), "best": best, "epoch": ep + 1}, ckpt + ".tmp")
        os.replace(ckpt + ".tmp", ckpt)
    model.load_state_dict(best[1])
    model.eval()
    with torch.no_grad():
        pred = torch.cat([model(Xv[i:i + 1024], Fv[i:i + 1024]).argmax(1) for i in range(0, len(Yv), 1024)])
    per = []
    for c, name in enumerate(CLASSES):
        m = Yv == c
        if m.sum():
            per.append(f"{name}:{(pred[m] == c).float().mean().item():.2f}({int(m.sum())})")
    print("per class:", " ".join(per))
    export(model, out_path, {"validAccuracy": round(best[0], 4), "trainSamples": int(len(Yt)), "validSamples": int(len(Yv)), "width": width})
    print(f"saved {out_path}  best valid acc {best[0]:.4f}")
    os.remove(ckpt)


if __name__ == "__main__":
    if sys.platform == "win32":  # keep the PC awake while training (released when the process exits)
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 14,
         int(sys.argv[4]) if len(sys.argv) > 4 else 1)
