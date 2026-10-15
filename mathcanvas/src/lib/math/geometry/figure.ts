import { L } from "../lang";
import type { GraphCurve, GraphMark, GraphSpec, GraphTone } from "../graph";
import type { SolveFailure } from "../types";
import { type FigItem, analyzeGeometry } from "./solve";

/** A 3-D picture: what to draw, in world coordinates. The board projects and rotates it. */
export type SpaceScene = {
  points: Array<{ label: string; at: number[]; derived?: boolean }>;
  segments: Array<{ a: number[]; b: number[]; derived?: boolean }>;
  lines: Array<{ label: string; p: number[]; u: number[]; derived?: boolean }>;
  planes: Array<{ label: string; n: number[]; d: number; derived?: boolean }>;
  spheres: Array<{ label: string; c: number[]; r: number; derived?: boolean }>;
  vectors: Array<{ label: string; from: number[]; to: number[] }>;
  /** The cube center ± half frames everything (and the origin). */
  center: number[];
  half: number;
  /** Starting view (radians) when the figure hasn't been turned yet. */
  view?: { yaw: number; pitch: number };
  /** Textbook solid figures: no axes, and points labelled by name only. */
  axes?: boolean;
  plain?: boolean;
  /** Faces of a convex solid (corner points); edges behind it are drawn dashed. */
  poly?: number[][][];
  /** Circles and other outlines (cone and cylinder bases), as point lists. */
  curves?: Array<{ pts: number[][]; dashed?: boolean }>;
  /** Shaded polygons found by the solver (a cross-section). */
  fills?: number[][][];
};

const fmt = (n: number) => String(Number(n.toFixed(2)));
const coords = (at: number[]) => `(${at.map(fmt).join(L({ en: ", ", vi: "; " }))})`;

/** Corners of everything that has a size, plus the origin. */
function extent(items: FigItem[], dim: number): { lo: number[]; hi: number[] } {
  const pts: number[][] = [new Array(dim).fill(0)];
  for (const it of items) {
    if (it.t === "point") pts.push(it.at);
    else if (it.t === "segment") pts.push(it.a, it.b);
    else if (it.t === "vector") pts.push(it.from, it.to);
    else if (it.t === "line") pts.push(it.p);
    else if (it.t === "round") {
      pts.push(it.c.map((x) => x - it.r), it.c.map((x) => x + it.r));
    } else if (it.t === "plane") {
      // The point of the plane closest to the origin.
      const nn = it.n.reduce((s, x) => s + x * x, 0);
      pts.push(it.n.map((x) => (-it.d * x) / nn));
    }
  }
  const lo = new Array(dim).fill(Infinity);
  const hi = new Array(dim).fill(-Infinity);
  for (const p of pts) {
    p.forEach((x, i) => {
      lo[i] = Math.min(lo[i], x);
      hi[i] = Math.max(hi[i], x);
    });
  }
  return { lo, hi };
}

/** The part of p + t·u inside the box (slab clipping), or null. */
export function clipLine(p: number[], u: number[], lo: number[], hi: number[]): [number[], number[]] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let i = 0; i < p.length; i++) {
    if (Math.abs(u[i]) < 1e-12) {
      if (p[i] < lo[i] || p[i] > hi[i]) return null;
      continue;
    }
    const a = (lo[i] - p[i]) / u[i];
    const b = (hi[i] - p[i]) / u[i];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t0 < t1)) return null;
  return [p.map((x, i) => x + t0 * u[i]), p.map((x, i) => x + t1 * u[i])];
}

const toneOf = (derived?: boolean): GraphTone => (derived ? "accent" : "brand");

/** Plane coordinate geometry on the 2-D graph, with equal units on both axes. */
function figure2d(items: FigItem[], title: string, caption: string): GraphSpec {
  const { lo, hi } = extent(items, 2);
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], 4);
  const pad = span * 0.25;
  const domain: [number, number] = [Math.floor(lo[0] - pad), Math.ceil(hi[0] + pad)];
  const range: [number, number] = [Math.floor(lo[1] - pad), Math.ceil(hi[1] + pad)];
  // Lines run a long way past the frame so the clip path, not the data, ends them.
  const far = span * 20;
  const box = { lo: [domain[0] - far, range[0] - far], hi: [domain[1] + far, range[1] + far] };
  const curves: GraphCurve[] = [];
  const marks: GraphMark[] = [];
  for (const it of items) {
    if (it.t === "line") {
      const seg = clipLine(it.p, it.u, box.lo, box.hi);
      if (seg) curves.push({ label: it.name, tone: toneOf(it.derived), segments: [seg.map(([x, y]) => [x, y] as [number, number])] });
    } else if (it.t === "round") {
      const ring: Array<[number, number]> = [];
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * 2 * Math.PI;
        ring.push([it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)]);
      }
      curves.push({ label: it.name, tone: toneOf(it.derived), segments: [ring] });
    } else if (it.t === "segment") {
      curves.push({ label: "", tone: it.derived ? "accent" : "brand", segments: [[it.a, it.b] as Array<[number, number]>], thin: true, dashed: it.derived });
    } else if (it.t === "vector") {
      // Shaft plus a head drawn in data units (the axes are equal, so it keeps its shape).
      const [dx, dy] = [it.to[0] - it.from[0], it.to[1] - it.from[1]];
      const len = Math.hypot(dx, dy) || 1;
      const h = Math.min(len * 0.3, span * 0.05);
      const [ux, uy] = [dx / len, dy / len];
      const back = (s: number): [number, number] => [it.to[0] - h * ux + s * h * 0.5 * -uy, it.to[1] - h * uy + s * h * 0.5 * ux];
      curves.push({ label: "", tone: "violet", thin: true, segments: [[it.from as [number, number], it.to as [number, number]], [back(1), it.to as [number, number], back(-1)]] });
    } else if (it.t === "point") {
      marks.push({ x: it.at[0], y: it.at[1], label: `${it.name}${coords(it.at)}`, given: !it.derived });
    }
  }
  return { title, caption, curves, marks, shade: [], asymptotes: [], domain, range, equal: true };
}

function scene3d(items: FigItem[]): SpaceScene {
  const { lo, hi } = extent(items, 3);
  const center = lo.map((x, i) => (x + hi[i]) / 2);
  const half = Math.max(3, ...hi.map((x, i) => (x - lo[i]) / 2)) * 1.25;
  const scene: SpaceScene = { points: [], segments: [], lines: [], planes: [], spheres: [], vectors: [], center, half };
  for (const it of items) {
    if (it.t === "point") scene.points.push({ label: it.name, at: it.at, derived: it.derived });
    else if (it.t === "segment") scene.segments.push({ a: it.a, b: it.b, derived: it.derived });
    else if (it.t === "line") scene.lines.push({ label: it.name, p: it.p, u: it.u, derived: it.derived });
    else if (it.t === "plane") scene.planes.push({ label: it.name, n: it.n, d: it.d, derived: it.derived });
    else if (it.t === "round") scene.spheres.push({ label: it.name, c: it.c, r: it.r, derived: it.derived });
    else scene.vectors.push({ label: it.name, from: it.from, to: it.to });
  }
  return scene;
}

/** A figure for a coordinate-geometry problem: 2-D graph or 3-D scene. */
export function geometryFigure(input: string): ({ ok: true } & GraphSpec) | SolveFailure {
  const g = analyzeGeometry(input);
  if ("ok" in g) return g;
  const caption = L({
    en: g.dim === 3 ? "Blue: given · orange: found. Drag the picture to turn it." : "Blue: given · orange: found.",
    vi: g.dim === 3 ? "Xanh: đề cho · cam: tìm được. Kéo hình để xoay." : "Xanh: đề cho · cam: tìm được.",
  });
  const title = L({ en: g.dim === 3 ? "Oxyz" : "Oxy", vi: g.dim === 3 ? "Oxyz" : "Oxy" });
  if (g.dim === 2) return { ok: true, ...figure2d(g.figure, title, caption) };
  return {
    ok: true,
    title,
    caption,
    curves: [],
    marks: [],
    shade: [],
    asymptotes: [],
    domain: [-1, 1],
    range: [-1, 1],
    space: scene3d(g.figure),
  };
}
