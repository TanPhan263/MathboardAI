import { L } from "./lang";
import { analyzeRational, isRationalEquation } from "./fractions";
import { type RelOp, analyzeRelation, float, splitRelation } from "./polynomial";
import { solutionSetOf } from "./solutionset";
import { analyzeSystem, splitSystem } from "./system";
import { fail } from "./polynomial";
import { type GraphHandle, graphHandles } from "./graphEdit";
import type { SolveFailure } from "./types";
import type { SpaceScene } from "./geometry/figure";

export type GraphTone = "brand" | "accent" | "violet";

export type GraphCurve = {
  label: string;
  tone: GraphTone;
  /** Polyline pieces; a break means the curve is undefined there. */
  segments: Array<Array<[number, number]>>;
  /** A figure edge rather than a graph: thinner, and left out of the legend. */
  thin?: boolean;
  dashed?: boolean;
};

/** `given`: data from the problem (drawn blue) rather than a result (orange). */
export type GraphMark = { x: number; y: number; label: string; open?: boolean; given?: boolean };

export type GraphSpec = {
  title: string;
  caption: string;
  curves: GraphCurve[];
  marks: GraphMark[];
  /** x-ranges to highlight (inequality solutions). */
  shade: Array<{ lo: number; hi: number }>;
  /** Vertical dashed lines (forbidden values). */
  asymptotes: number[];
  domain: [number, number];
  range: [number, number];
  /** Points the learner can drag to change the problem (see graphEdit.ts). */
  handles?: GraphHandle[];
  /** Same unit on both axes, so circles look round (geometry figures). */
  equal?: boolean;
  /** A 3-D figure drawn instead of the axes and curves. */
  space?: SpaceScene;
};

/** Keep this framing instead of fitting one (while the learner drags the graph). */
export type GraphView = { domain: [number, number]; range: [number, number] };

const N = 320;
const fmt = (n: number) => String(Number(n.toFixed(2)));

function domainAround(focus: number[]): [number, number] {
  const finite = focus.filter(Number.isFinite);
  const lo = finite.length ? Math.min(...finite) : -5;
  const hi = finite.length ? Math.max(...finite) : 5;
  const pad = Math.max(3, (hi - lo) * 0.5);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}

/** y-range that keeps the interesting part readable even near asymptotes. */
function rangeFor(curves: GraphCurve[], extra: number[]): [number, number] {
  const ys = curves.flatMap((c) => c.segments.flat().map(([, y]) => y)).concat(extra, [0]);
  const mags = ys.map(Math.abs).sort((a, b) => a - b);
  const p80 = mags[Math.floor(mags.length * 0.8)] ?? 5;
  const cap = Math.max(6, Math.min(p80 * 1.6, 60), ...extra.map((e) => Math.abs(e) * 1.4));
  const lo = Math.max(-cap, Math.min(...ys));
  const hi = Math.min(cap, Math.max(...ys));
  const pad = (hi - lo) * 0.12 || 1;
  return [lo - pad, hi + pad];
}

function sampleFn(
  f: (x: number) => number,
  domain: [number, number],
  breaks: number[] = [],
): GraphCurve["segments"] {
  const segs: GraphCurve["segments"] = [];
  let cur: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const x = domain[0] + ((domain[1] - domain[0]) * i) / N;
    const prev = domain[0] + ((domain[1] - domain[0]) * (i - 1)) / N;
    const crosses = i > 0 && breaks.some((b) => (prev - b) * (x - b) <= 0);
    const y = f(x);
    if (!Number.isFinite(y) || crosses) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      if (!Number.isFinite(y)) continue;
    }
    cur.push([x, y]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

const OP_WORD: Record<RelOp, string> = { "=": "=", "<": "<", ">": ">", "<=": "≤", ">=": "≥" };

function graphSystem(input: string, view?: GraphView): GraphSpec | SolveFailure {
  const sa = analyzeSystem(input);
  if (!sa.ok) return sa;
  if (sa.variables.length !== 2) {
    return fail("unsupported", L({ en: "Three unknowns need a 3-D picture.", vi: "Ba ẩn cần hình vẽ không gian 3 chiều." }), L({ en: "Graph works for systems with two unknowns — each equation is a line.", vi: "Đồ thị dùng được cho hệ hai ẩn — mỗi phương trình là một đường thẳng." }));
  }
  const [vx, vy] = sa.variables;
  const lines = sa.rows.map((r) => ({ a: r.coeffs[0].n / r.coeffs[0].d, b: r.coeffs[1].n / r.coeffs[1].d, c: r.rhs.n / r.rhs.d }));
  // Intersection (if any) by Cramer's rule, for framing and the label.
  const [p, q] = lines;
  const det = p.a * q.b - q.a * p.b;
  const point = Math.abs(det) > 1e-12 ? [(p.c * q.b - q.c * p.b) / det, (p.a * q.c - q.a * p.c) / det] : null;
  const domain = view?.domain ?? domainAround(point ? [point[0]] : [0]);
  const tones: GraphTone[] = ["brand", "accent"];
  const curves: GraphCurve[] = lines.map((l, i) => ({
    label: `(${i + 1})`,
    tone: tones[i],
    segments:
      Math.abs(l.b) > 1e-12
        ? sampleFn((x) => (l.c - l.a * x) / l.b, domain)
        : [[[l.c / l.a, -1e3], [l.c / l.a, 1e3]]],
  }));
  const range = view?.range ?? (point ? rangeFor([], [point[1] - 6, point[1] + 6]) : rangeFor(curves, []));
  return {
    title: L({ en: `Each equation is a line in the ${vx}${vy}-plane`, vi: `Mỗi phương trình là một đường thẳng trong mặt phẳng ${vx}O${vy}` }),
    caption: point ? L({ en: "The solution is where the two lines cross.", vi: "Nghiệm là giao điểm của hai đường thẳng." }) : L({ en: "Parallel or identical lines: no single crossing point.", vi: "Hai đường thẳng song song hoặc trùng nhau: không có giao điểm duy nhất." }),
    curves,
    marks: point ? [{ x: point[0], y: point[1], label: `(${fmt(point[0])}, ${fmt(point[1])})` }] : [],
    shade: [],
    asymptotes: [],
    domain,
    range,
  };
}

/**
 * A picture for any supported problem. One-variable problems plot
 * f(x) = left − right: its zeros are the solutions, its sign shows where an
 * inequality holds. Two-variable systems plot one line per equation.
 */
export function graphFor(input: string, view?: GraphView): ({ ok: true } & GraphSpec) | SolveFailure {
  if (splitSystem(input)) {
    const g = graphSystem(input, view);
    return "curves" in g ? { ok: true, ...g, handles: graphHandles(input) } : g;
  }
  const rel = splitRelation(input);
  if (!rel.ok) return rel;
  const sol = solutionSetOf(input);
  if (!sol.ok) return sol;
  const v = sol.variable;

  let restrictions: number[] = [];
  let focus: number[] = [];
  if (isRationalEquation(input)) {
    const ra = analyzeRational(input);
    if (!ra.ok) return ra;
    restrictions = ra.restrictions.map((r) => r.value);
  } else {
    const an = analyzeRelation(input);
    if (!an.ok) return an;
    const [, b, a] = an.poly.coeffs.map((r) => r.n / r.d);
    if (an.poly.degree === 2) focus.push(-b / (2 * a));
  }

  const ends = sol.set.flatMap((i) => [i.lo, i.hi]).filter(Number.isFinite);
  focus = [...focus, ...ends, ...restrictions];
  const domain = view?.domain ?? domainAround(focus);

  let compiled: { evaluate: (s: object) => unknown };
  try {
    compiled = float.compile(`(${rel.lhs}) - (${rel.rhs})`);
  } catch {
    return fail("parse", L({ en: "I couldn't draw that expression.", vi: "Không vẽ được biểu thức này." }), L({ en: "Check the brackets and try again.", vi: "Kiểm tra dấu ngoặc rồi thử lại." }));
  }
  const f = (x: number) => {
    if (restrictions.some((r) => Math.abs(r - x) < 1e-9)) return NaN;
    try {
      return Number(compiled.evaluate({ [v]: x }));
    } catch {
      return NaN;
    }
  };

  const curves: GraphCurve[] = [
    { label: L({ en: "y = left − right", vi: "y = vế trái − vế phải" }), tone: "brand", segments: sampleFn(f, domain, restrictions) },
  ];
  const isIneq = rel.op !== "=";
  const marks: GraphMark[] = isIneq
    ? sol.set
        .flatMap((i) => [
          { x: i.lo, closed: i.loClosed },
          { x: i.hi, closed: i.hiClosed },
        ])
        .filter((m) => Number.isFinite(m.x))
        .map((m) => ({ x: m.x, y: 0, label: `${v}=${fmt(m.x)}`, open: !m.closed }))
    : sol.set.filter((i) => i.lo === i.hi).map((i) => ({ x: i.lo, y: 0, label: `${v}=${fmt(i.lo)}` }));

  const shade = isIneq
    ? sol.set.map((i) => ({ lo: Math.max(i.lo, domain[0]), hi: Math.min(i.hi, domain[1]) }))
    : [];

  const caption = isIneq
    ? L({ en: `Shaded: where ${v} makes the left side ${OP_WORD[rel.op]} the right side.`, vi: `Vùng tô: các giá trị ${v} làm vế trái ${OP_WORD[rel.op]} vế phải.` })
    : restrictions.length
      ? L({ en: "Dashed lines: forbidden values. Dots: the solutions (where the curve crosses 0).", vi: "Nét đứt: giá trị bị loại. Chấm: các nghiệm (nơi đồ thị cắt trục hoành)." })
      : marks.length
        ? L({ en: "Dots: where the curve crosses 0 — the solutions.", vi: "Chấm: nơi đồ thị cắt trục hoành — các nghiệm." })
        : L({ en: "The curve never crosses 0 — no real solutions.", vi: "Đồ thị không cắt trục hoành — vô nghiệm." });

  return {
    ok: true,
    title: `y = (${rel.lhs.replace(/\s+/g, "")}) − (${rel.rhs.replace(/\s+/g, "")})`,
    caption,
    curves,
    marks,
    shade,
    asymptotes: restrictions,
    domain,
    range: view?.range ?? rangeFor(curves, []),
    handles: graphHandles(input),
  };
}
