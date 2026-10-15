"""
Build the symbol training set from MathWriting (https://github.com/google-research/google-research/tree/master/mathwriting).

Two sources of labelled, real handwriting:
  1. symbols.jsonl  — strokes of single glyphs, cut from human inks by the dataset authors.
  2. Bootstrapped   — human inks of a single line made only of symbols we support
                      (e.g. "3x+5=11"). We split them with the same grouping rules the
                      app uses (src/lib/ink/recognize.ts) and keep an ink only when the
                      number of groups equals the number of symbols in its label; then
                      the groups are labelled left to right.

Each symbol is rendered exactly like the app does (raster.py ⇔ src/lib/ink/raster.ts).

Usage:  python prepare.py <mathwriting dir> <out.npz>
Licence note: MathWriting is CC BY-NC-SA 4.0 — fine for a prototype, not for a
commercial model. Retrain on licensed data before launch.
"""

import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

from raster import features, render
from symbols import CLASSES, JUNK, OTHER

NS = "{http://www.w3.org/2003/InkML}"

LATEX_MAP = {
    r"\leq": "≤", r"\le": "≤", r"\geq": "≥", r"\ge": "≥", r"\cdot": "·",
    r"\lt": "<", r"\gt": ">",
}
KEEP = set(CLASSES) - {OTHER, JUNK}
PARTS_ARE_SYMBOLS = {"=", "≤", "≥", "?"}  # half of "=" is a real "-"
rng = np.random.default_rng(0)
LABEL_RE = re.compile(r'type="normalizedLabel">([^<]*)<')
TOKEN_RE = re.compile(r"\\[a-zA-Z]+|\\.|.")


def read_ink(path: Path):
    root = ET.parse(path).getroot()
    ann = {a.get("type"): (a.text or "") for a in root.iter(f"{NS}annotation")}
    strokes = []
    for tr in root.iter(f"{NS}trace"):
        pts = []
        for p in (tr.text or "").strip().split(","):
            v = p.split()
            if len(v) >= 2:
                pts.append((float(v[0]), float(v[1])))
        if pts:
            strokes.append(np.array(pts, dtype=np.float64))
    return ann, strokes


def to_class(label: str) -> str:
    label = LATEX_MAP.get(label, label)
    return label if label in KEEP else OTHER


# ───────────── Grouping: a port of groupSymbols()/unitHeight() in recognize.ts ─────────────

def box(s):
    x0, y0 = s.min(0)
    x1, y1 = s.max(0)
    return x0, y0, x1 - x0, y1 - y0


def unit_height(boxes):
    upright = [b[3] for b in boxes if b[3] >= 0.4 * b[2]]
    vals = upright or [max(b[2], b[3]) for b in boxes]
    h = sorted(vals)[len(vals) // 2]
    return h if h > 1 else 40.0




def strokes_cross(s, t, bs, bt):
    if bs[0] > bt[0] + bt[2] or bt[0] > bs[0] + bs[2] or bs[1] > bt[1] + bt[3] or bt[1] > bs[1] + bs[3]:
        return False
    if len(s) < 2 or len(t) < 2:
        return False
    a, b = s[:-1, None, :], s[1:, None, :]
    c, d = t[None, :-1, :], t[None, 1:, :]

    def o(p, q, r):
        return (q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0])

    abc, abd = o(a, b, c), o(a, b, d)
    hit = (abc * abd <= 0) & (o(c, d, a) * o(c, d, b) <= 0) & ((abc != 0) | (abd != 0))
    return bool(hit.any())


def strokes_kiss(s, t, bs, bt, H, flat_s, flat_t):
    if bs[3] > 0.85 * H or bt[3] > 0.85 * H or flat_s or flat_t:
        return False
    near = 0.1 * H
    if bs[0] - near > bt[0] + bt[2] or bt[0] - near > bs[0] + bs[2] or bs[1] - near > bt[1] + bt[3] or bt[1] - near > bs[1] + bs[3]:
        return False
    if max(bs[0] + bs[2], bt[0] + bt[2]) - min(bs[0], bt[0]) > H:
        return False
    d = np.sqrt(((s[:, None, :] - t[None, :, :]) ** 2).sum(-1))
    return bool((d < near).any())


def group_symbols(strokes):
    boxes = [box(s) for s in strokes]
    H = unit_height(boxes)
    flat = [b[2] >= 0.15 * H and b[3] < 0.3 * b[2] for b in boxes]

    def span(b):
        w = max(b[2], 0.15 * H)
        c = b[0] + b[2] / 2
        return c - w / 2, c + w / 2, w

    groups = []  # list of lists of stroke indices
    for i in sorted(range(len(strokes)), key=lambda k: boxes[k][0]):
        hits = []
        for g in groups:
            gx0 = min(boxes[k][0] for k in g)
            gx1 = max(boxes[k][0] + boxes[k][2] for k in g)
            a = span(boxes[i])
            b = span((gx0, 0, gx1 - gx0, 0))
            overlap = min(a[1], b[1]) - max(a[0], b[0])
            if overlap >= 0.45 * min(a[2], b[2]) or any(
                strokes_cross(strokes[i], strokes[k], boxes[i], boxes[k])
                or (len(g) == 1 and strokes_kiss(strokes[i], strokes[k], boxes[i], boxes[k], H, flat[i], flat[k]))
                for k in g
            ):
                hits.append(g)
        if not hits:
            groups.append([i])
            continue
        merged = [k for g in hits for k in g] + [i]
        groups = [g for g in groups if g not in hits] + [merged]
    groups.sort(key=lambda g: min(boxes[k][0] for k in g))
    return groups, H


FUNCS = {r"\sin", r"\cos", r"\tan", r"\log", r"\ln", r"\exp", r"\lim", r"\max", r"\min", r"\det", r"\mod"}
# Constructs that stack things vertically or draw several glyphs: order can't be trusted.
BIG = {r"\frac", r"\sqrt", r"\sum", r"\int", r"\prod", r"\begin", r"\end", r"\overline", r"\underline",
       r"\hat", r"\vec", r"\tilde", r"\dot", r"\bar", r"\mathrm", r"\text", r"\binom", r"\overrightarrow",
       r"\iint", r"\oint", r"\bigcup", r"\bigcap", r"\operatorname", r"\mathbb", r"\mathcal", r"\ddot",
       r"\widehat", r"\widetilde", r"\stackrel", r"\overset", r"\underset", r"\not"}
SKIP = {"{", "}", "^", "_", r"\left", r"\right", r"\!", r"\,", r"\;", r"\:", "\\ "}
DOTS = {r"\ldots", r"\cdots", r"\dots", r"\vdots", r"\ddots"}


def simple_tokens(label: str):
    """Symbols of a one-line label in writing order, or None if layout could reorder them.

    Exponents and subscripts keep left-to-right order, so they're allowed; fractions,
    roots and big operators stack things vertically, so those inks are skipped.
    """
    toks = [t for t in TOKEN_RE.findall(label) if not t.isspace()]
    out = []
    for t in toks:
        if t in BIG or t in FUNCS or t in DOTS:
            return None
        if t in SKIP:
            continue
        t = LATEX_MAP.get(t, t)
        if t in KEEP:
            out.append(t)
        elif re.fullmatch(r"[A-Za-z,|!'\[\]:;*~&@#%$?\"]", t) or (t.startswith("\\") and len(t) > 2):
            out.append(OTHER)  # a symbol we don't model: still a real "other" sample
        else:
            return None
    return out if 2 <= len(out) <= 24 else None


HASY_MAP = {
    **{d: d for d in "0123456789"}, **{c: c for c in "xyzabcnt"},
    "+": "+", "<": "<", ">": ">", "/": "/", r"\leq": "≤", r"\geq": "≥", r"\leqslant": "≤", r"\geqslant": "≥",
}
# Tiny or flat symbols are decided by geometry in the app; HASY's size-normalised
# pictures of them would only confuse the network.
HASY_SKIP = {"-", ".", r"\cdot", r"\cdotp", ",", r"\_", "|"}


def hasy_image(path: Path) -> tuple[np.ndarray, np.ndarray] | None:
    """A HASYv2 picture re-framed like render(): ink 255, longer side 28 px, centred."""
    from PIL import Image

    img = 255 - np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    ys, xs = np.nonzero(img > 64)
    if len(xs) == 0:
        return None
    crop = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape
    k = 28 / max(h, w)
    nh, nw = max(1, round(h * k)), max(1, round(w * k))
    small = np.asarray(Image.fromarray(crop.astype(np.uint8)).resize((nw, nh), Image.BILINEAR), dtype=np.float32)
    out = np.zeros((32, 32), dtype=np.float32)
    oy, ox = (32 - nh) // 2, (32 - nw) // 2
    out[oy:oy + nh, ox:ox + nw] = small
    # No line height is known for an isolated picture: height = 1 unit, true aspect, unknown strokes.
    feat = np.array([0.0, float(np.clip(np.log(max(w, 1) / max(h, 1)), -3, 3)), 0.5], dtype=np.float32)
    return np.clip(out, 0, 255).astype(np.uint8), feat


def main(root: str, out: str, model: str | None = None, hasy: str | None = None):
    root = Path(root)
    net = None
    if model:
        from align import ExportedNet, forced_align
        net = ExportedNet(model)
    X, F, Y, SRC = [], [], [], []

    def add(strokes, H, label, src):
        X.append(render(strokes))
        F.append(features(strokes, H))
        Y.append(CLASSES.index(label))
        SRC.append(src)

    def add_image(img, feat, label, src):
        X.append(img)
        F.append(feat)
        Y.append(CLASSES.index(label))
        SRC.append(src)

    def add_junk(strokes, groups, toks, H, src):
        """Wrong splits of a correctly split ink, so the network learns what isn't a symbol."""
        if len(groups) >= 2:
            for i in rng.choice(len(groups) - 1, size=min(2, len(groups) - 1), replace=False):
                add([strokes[k] for k in groups[i] + groups[i + 1]], H, JUNK, src)
        for g, t in zip(groups, toks):
            if 2 <= len(g) <= 3 and t not in PARTS_ARE_SYMBOLS and rng.random() < 0.5:
                add([strokes[g[rng.integers(len(g))]]], H, JUNK, src)

    # 1. Single glyphs, cut by the dataset authors from human train inks.
    sources = {}
    for line in open(root / "symbols.jsonl", encoding="utf-8"):
        e = json.loads(line)
        sources.setdefault(e["sourceSampleId"], []).append(e)
    found = 0
    for sid, entries in sources.items():
        path = root / "train" / f"{sid}.inkml"
        if not path.exists():
            continue
        _, strokes = read_ink(path)
        H = unit_height([box(s) for s in strokes])
        for e in entries:
            idx = [k for k in e["strokeIndices"] if k < len(strokes)]
            if idx:
                add([strokes[k] for k in idx], H, to_class(e["label"]), 0)
                found += 1
    print(f"glyphs from symbols.jsonl: {found}")

    # 2. Bootstrapped from simple one-line human inks (train split only).
    tried = kept = aligned = 0
    for split, src in (("train", 1), ("valid", 2)):
        for path in sorted((root / split).glob("*.inkml")):
            m = LABEL_RE.search(path.read_text(encoding="utf-8"))
            if not m or simple_tokens(html.unescape(m.group(1))) is None:
                continue
            ann, strokes = read_ink(path)
            toks = simple_tokens(ann.get("normalizedLabel") or ann.get("label", ""))
            if toks is None or not strokes:
                continue
            tried += 1
            # One line only: the ink must be wider than tall by a margin.
            allpts = np.concatenate(strokes)
            if np.ptp(allpts[:, 1]) > 0.9 * np.ptp(allpts[:, 0]) and len(toks) > 2:
                continue
            groups, H = group_symbols(strokes)
            if len(groups) != len(toks):
                # The plain rules split it wrongly: let the network split it, guided by the label.
                if net is None:
                    continue
                groups = forced_align(net, strokes, [box(s) for s in strokes], H, toks, strokes_cross)
                if groups is None:
                    continue
                aligned += 1
            kept += 1
            for g, t in zip(groups, toks):
                add([strokes[k] for k in g], H, t, src)
            add_junk(strokes, groups, toks, H, src)
    print(f"one-line inks tried: {tried}, used: {kept} (of which recovered by alignment: {aligned})")

    # 3. HASYv2 (ODbL): real handwritten symbols as pictures — mostly for ≤ ≥ < > and digits.
    if hasy:
        import csv

        hasy = Path(hasy)
        n_hasy = 0
        for row in csv.DictReader(open(hasy / "hasy-data-labels.csv", encoding="utf-8")):
            label = HASY_MAP.get(row["latex"])
            if label is None:
                if row["latex"] in HASY_SKIP or rng.random() > 0.015:
                    continue
                label = OTHER  # a small sample of everything else, as "not something we handle"
            got = hasy_image(hasy / row["path"])
            if got is not None:
                add_image(*got, label, 3)
                n_hasy += 1
        print(f"HASYv2 pictures: {n_hasy}")

    X = np.stack(X).astype(np.uint8)
    F = np.stack(F).astype(np.float32)
    Y = np.array(Y, dtype=np.int64)
    SRC = np.array(SRC, dtype=np.int8)
    np.savez_compressed(out, X=X, F=F, Y=Y, SRC=SRC)
    counts = np.bincount(Y, minlength=len(CLASSES))
    print("samples:", len(Y))
    print(" ".join(f"{c}:{n}" for c, n in zip(CLASSES, counts)))


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("mathwriting")
    ap.add_argument("out")
    ap.add_argument("--model", help="exported model for forced alignment of hard inks")
    ap.add_argument("--hasy", help="HASYv2 folder (with hasy-data-labels.csv)")
    a = ap.parse_args()
    main(a.mathwriting, a.out, a.model, a.hasy)
