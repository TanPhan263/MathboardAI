import type { BoardObject, Camera, MathObject, StrokeObject } from "./types";

export type Rect = { x: number; y: number; w: number; h: number };

/** Approximate size of DOM-rendered objects (they size themselves). */
export const MATH_SIZE = { w: 360, h: 84 };
export const TEXT_SIZE = { w: 220, h: 44 };

export function boundsOf(o: BoardObject): Rect {
  switch (o.type) {
    case "stroke": {
      const xs = o.points.map((p) => p[0]);
      const ys = o.points.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      return { x: o.x + x0, y: o.y + y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
    }
    case "shape": {
      return {
        x: o.x + Math.min(0, o.w),
        y: o.y + Math.min(0, o.h),
        w: Math.abs(o.w),
        h: Math.abs(o.h),
      };
    }
    case "graph":
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    case "math": {
      const k = o.scale ?? 1;
      const ink = drawnInk(o);
      if (ink) {
        const b = inkBounds(ink);
        return { x: o.x + b.x * k, y: o.y + b.y * k, w: b.w * k, h: b.h * k };
      }
      // Each extra row (\\ in arrays and cases) adds about one line of height.
      const rows = (o.latex.match(/\\\\/g) ?? []).length;
      return { x: o.x, y: o.y, w: MATH_SIZE.w * k, h: (MATH_SIZE.h + rows * 34) * k };
    }
    case "text":
      return { x: o.x, y: o.y, ...TEXT_SIZE };
  }
}

/** The handwriting a math object shows (tidied or as written), or null when typeset. */
export function drawnInk(o: MathObject): StrokeObject[] | null {
  if (!o.showInk || !o.ink?.length) return null;
  return o.neat && o.neatInk?.length ? o.neatInk : o.ink;
}

/** Bounds of strokes, each positioned by its own (x, y). */
export function inkBounds(strokes: Array<{ x: number; y: number; points: Array<[number, number]> }>): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const [px, py] of s.points) {
      x0 = Math.min(x0, s.x + px);
      y0 = Math.min(y0, s.y + py);
      x1 = Math.max(x1, s.x + px);
      y1 = Math.max(y1, s.y + py);
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

export function screenToWorld(camera: Camera, sx: number, sy: number) {
  return { x: (sx - camera.x) / camera.z, y: (sy - camera.y) / camera.z };
}

export const clampZoom = (z: number) => Math.min(4, Math.max(0.2, z));

/** Distance from point p to segment ab. */
export function distToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Smooth freehand path through points using midpoint quadratic curves. */
export function strokePath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  const [first] = points;
  if (points.length === 1) return `M${first[0]},${first[1]} l0.01,0`;
  let d = `M${first[0].toFixed(1)},${first[1].toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q${points[i][0].toFixed(1)},${points[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}
