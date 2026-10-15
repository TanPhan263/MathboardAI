"""
Symbol → 32×32 picture + 3 size features. Mirrors src/lib/ink/raster.ts exactly:
change one, change both (tests compare them on the same strokes).
"""
import numpy as np

SIZE = 32
FIT = 28          # the symbol's longer side, in pixels
RADIUS = 1.2      # pen radius in output pixels, whatever the original size


def _segments(strokes):
    x0 = min(s[:, 0].min() for s in strokes)
    y0 = min(s[:, 1].min() for s in strokes)
    x1 = max(s[:, 0].max() for s in strokes)
    y1 = max(s[:, 1].max() for s in strokes)
    w, h = x1 - x0, y1 - y0
    scale = FIT / max(w, h, 1e-6)
    ox = (SIZE - w * scale) / 2 - x0 * scale
    oy = (SIZE - h * scale) / 2 - y0 * scale
    segs = []
    for s in strokes:
        p = s * scale + np.array([ox, oy])
        if len(p) == 1:
            segs.append((p[0], p[0]))
        for i in range(1, len(p)):
            segs.append((p[i - 1], p[i]))
    return segs


def render(strokes) -> np.ndarray:
    """uint8 image, ink = 255."""
    segs = _segments([np.asarray(s, dtype=np.float64) for s in strokes])
    a = np.array([s[0] for s in segs])  # (S, 2)
    b = np.array([s[1] for s in segs])
    c = (np.arange(SIZE) + 0.5)
    px = np.stack(np.meshgrid(c, c, indexing="xy"), -1).reshape(-1, 1, 2)  # (P,1,2): x = column, y = row
    ab = b - a
    len2 = (ab ** 2).sum(-1)
    t = ((px - a) * ab).sum(-1) / np.where(len2 == 0, 1, len2)
    t = np.clip(np.where(len2 == 0, 0, t), 0, 1)
    proj = a + t[..., None] * ab
    d = np.sqrt(((px - proj) ** 2).sum(-1)).min(1)
    v = np.clip(RADIUS + 0.5 - d, 0, 1)
    return np.round(v * 255).astype(np.uint8).reshape(SIZE, SIZE)


def features(strokes, unit: float) -> np.ndarray:
    pts = np.concatenate([np.asarray(s, dtype=np.float64) for s in strokes])
    w = np.ptp(pts[:, 0])
    h = np.ptp(pts[:, 1])
    lh = np.clip(np.log(max(h, 1e-3) / unit), -3, 3)
    lw = np.clip(np.log(max(w, 1e-3) / unit), -3, 3)
    return np.array([lh, lw, min(len(strokes), 4) / 4], dtype=np.float32)
