"""
Symbol bigram model from MathWriting train labels: how likely each symbol is to
follow another. Written to src/lib/ink/bigram.json as costs (−log p).

  python lm.py <mathwriting dir>
"""
import html
import json
import os
import math
import re
import sys
from pathlib import Path

from prepare import DOTS, FUNCS, LATEX_MAP, SKIP, TOKEN_RE, KEEP, OTHER
from symbols import CLASSES, JUNK

LABEL_RE = re.compile(r'type="normalizedLabel">([^<]*)<')
SYMS = [c for c in CLASSES if c != JUNK]
START = "^"


def seq(label):
    out = []
    for t in TOKEN_RE.findall(label):
        if t.isspace() or t in SKIP or t == r"\frac":
            continue
        t = LATEX_MAP.get(t, t)
        if t in KEEP:
            out.append(t)
        elif t in FUNCS or t in DOTS:
            out.append(OTHER)
        else:
            out.append(OTHER)
    return out


def main(root):
    counts = {a: {b: 0 for b in SYMS} for a in SYMS + [START]}
    n = 0
    for path in (Path(root) / "train").glob("*.inkml"):
        m = LABEL_RE.search(path.read_text(encoding="utf-8"))
        if not m:
            continue
        s = seq(html.unescape(m.group(1)))
        prev = START
        for t in s:
            counts[prev][t] += 1
            prev = t
        n += 1
    table = {}
    for a, row in counts.items():
        total = sum(row.values()) + len(SYMS)  # add-one smoothing
        table[a] = {b: round(-math.log((c + 1) / total), 3) for b, c in row.items()}
    web = Path(os.environ.get("WEB_DIR", Path(__file__).resolve().parents[2] / "mathcanvas"))
    out = web / "src/lib/ink/bigram.json"
    json.dump({"start": START, "cost": table}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"labels: {n}, wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1])
