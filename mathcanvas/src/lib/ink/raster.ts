import type { Pt } from "./symbols";

/**
 * Symbol → 32×32 picture + 3 size features, exactly as the network was trained
 * (mathcanvas-api/ml/raster.py). Change one, change both: raster.test.ts compares them.
 */
export const SIZE = 32;
const FIT = 28;
const RADIUS = 1.2;

export function render(strokes: Pt[][]): Float32Array {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const scale = FIT / Math.max(w, h, 1e-6);
  const ox = (SIZE - w * scale) / 2 - x0 * scale;
  const oy = (SIZE - h * scale) / 2 - y0 * scale;

  // Squared distance from every pixel centre to the nearest pen segment.
  const best = new Float64Array(SIZE * SIZE).fill(Infinity);
  const reach = RADIUS + 0.5;
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const c0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach - 0.5));
    const c1 = Math.min(SIZE - 1, Math.ceil(Math.max(ax, bx) + reach));
    const r0 = Math.max(0, Math.floor(Math.min(ay, by) - reach - 0.5));
    const r1 = Math.min(SIZE - 1, Math.ceil(Math.max(ay, by) + reach));
    for (let r = r0; r <= r1; r++) {
      const py = r + 0.5;
      for (let c = c0; c <= c1; c++) {
        const px = c + 0.5;
        let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.min(1, Math.max(0, t));
        const ex = px - (ax + t * dx);
        const ey = py - (ay + t * dy);
        const d2 = ex * ex + ey * ey;
        if (d2 < best[r * SIZE + c]) best[r * SIZE + c] = d2;
      }
    }
  };
  for (const s of strokes) {
    const p = s.map((q) => [q.x * scale + ox, q.y * scale + oy] as const);
    if (p.length === 1) seg(p[0][0], p[0][1], p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) seg(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
  }
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) {
    const v = Math.min(1, Math.max(0, reach - Math.sqrt(best[i])));
    // Training images were stored as bytes: round the same way.
    out[i] = Math.round(v * 255) / 255;
  }
  return out;
}

export function features(strokes: Pt[][], unit: number): Float32Array {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const clip = (v: number) => Math.min(3, Math.max(-3, v));
  return Float32Array.from([
    clip(Math.log(Math.max(y1 - y0, 1e-3) / unit)),
    clip(Math.log(Math.max(x1 - x0, 1e-3) / unit)),
    Math.min(strokes.length, 4) / 4,
  ]);
}
