import { isRationalEquation } from "./fractions";
import { ratAscii, ratLatex, polyLatex } from "./latex";
import {
  OP_TEX,
  type Poly,
  type RelOp,
  analyzeRelation,
  collectVariables,
  evalExact,
  exact,
  fitPoly,
  parseExpr,
  rationalRoots,
  toTex,
} from "./polynomial";
import { type Rat, add, isZero, mul, neg, rat, sub, toNumber } from "./rational";
import { analyzeSystem, splitSystem } from "./system";

/**
 * Points on a graph the learner can drag to change the problem it shows. Every
 * move rewrites the problem so it stays solvable and its solutions follow the
 * hand: a dragged solution lands where it is dropped, the other one stays.
 *
 *   root    a solution (or an inequality's boundary) on the x-axis
 *   vertex  a parabola's turning point
 *   point   where a system's two lines cross
 *
 * Positions snap to `step` (half units by default), so the rewritten problem
 * keeps small exact numbers and the solver still checks every step.
 */
export type GraphHandle =
  | { kind: "root"; index: number; x: number; y: number }
  | { kind: "vertex"; x: number; y: number }
  | { kind: "point"; x: number; y: number };

export type Edited = { source: string; latex: string };

const OP_ASCII: Record<RelOp, string> = { "=": "=", "<": "<", ">": ">", "<=": "<=", ">=": ">=" };

/** Nearest multiple of `step` as an exact rational (`step` has at most one decimal: 0.1, 0.5, 2.5, …). */
export function snap(v: number, step = 0.5): Rat {
  return rat(Math.round(v / step) * Math.round(step * 10), 10);
}

/* ───────────── One unknown: polynomial equations and inequalities ───────────── */

type Single = {
  variable: string;
  op: RelOp;
  lhs: string;
  rhs: string;
  f: Poly;
  L: Poly;
  R: Poly;
};

function sidePoly(text: string, v: string): Poly | null {
  const node = parseExpr(text);
  if (!node) return null;
  const fit = fitPoly((x) => evalExact(node, { [v]: x }), true);
  return fit.ok ? fit.poly : null;
}

function single(source: string): Single | null {
  if (splitSystem(source) || isRationalEquation(source)) return null;
  const an = analyzeRelation(source);
  if (!an.ok || an.poly.degree === 0) return null;
  const L = sidePoly(an.lhs, an.variable);
  const R = sidePoly(an.rhs, an.variable);
  if (!L || !R) return null;
  return { variable: an.variable, op: an.op, lhs: an.lhs, rhs: an.rhs, f: an.poly, L, R };
}

const coeffsOf = (p: Poly) => p.coeffs.map(toNumber) as [number, number, number];

function singleHandles(m: Single): GraphHandle[] {
  const [c, b, a] = coeffsOf(m.f);
  if (m.f.degree === 1) return [{ kind: "root", index: 0, x: -c / b + 0, y: 0 }];
  const h = -b / (2 * a);
  const k = a * h * h + b * h + c;
  const handles: GraphHandle[] = [];
  const D = b * b - 4 * a * c;
  if (D > 1e-12) {
    const r = Math.sqrt(D) / (2 * Math.abs(a));
    [h - r, h + r].forEach((x, index) => handles.push({ kind: "root", index, x, y: 0 }));
  }
  // A double root sits on the vertex: the vertex handle covers both.
  handles.push({ kind: "vertex", x: h, y: k });
  return handles.map((p) => ({ ...p, x: p.x + 0, y: p.y + 0 })); // no −0
}

const poly = (c: Rat, b: Rat, a: Rat): Poly => ({ coeffs: [c, b, a], degree: !isZero(a) ? 2 : !isZero(b) ? 1 : 0 });
const minus = (p: Poly, q: Poly) => poly(sub(p.coeffs[0], q.coeffs[0]), sub(p.coeffs[1], q.coeffs[1]), sub(p.coeffs[2], q.coeffs[2]));
const plus = (p: Poly, q: Poly) => poly(add(p.coeffs[0], q.coeffs[0]), add(p.coeffs[1], q.coeffs[1]), add(p.coeffs[2], q.coeffs[2]));

/** The problem whose left − right is `next`, changing as little of what the learner wrote as possible. */
function rewriteSingle(m: Single, next: Poly): Edited | null {
  const delta = minus(next, m.f);
  if (delta.coeffs.every(isZero)) return null;
  const v = m.variable;
  const zero = rat(0);
  const xPart = poly(zero, delta.coeffs[1], delta.coeffs[2]);
  const numPart = poly(delta.coeffs[0], zero, zero);
  // Change as little of what was written as possible: a new number goes on the
  // side that is just a number ("2x + 3 = 7" → "2x + 3 = 11"), new x-terms on the
  // side that already has x in it. Left − right must grow by `delta`.
  const xOnLeft = m.L.degree > 0 || m.R.degree === 0;
  // "… = 0" stays in that form: the number then changes on the left.
  const rightIsZero = m.R.coeffs.every(isZero);
  const numOnRight = !rightIsZero && (m.R.degree === 0 || m.L.degree > 0);
  let L = m.L;
  let R = m.R;
  if (!isZero(xPart.coeffs[1]) || !isZero(xPart.coeffs[2])) {
    if (xOnLeft) L = plus(L, xPart);
    else R = minus(R, xPart);
  }
  if (!isZero(numPart.coeffs[0])) {
    if (numOnRight) R = minus(R, numPart);
    else L = plus(L, numPart);
  }
  const side = (p: Poly, orig: Poly, text: string) =>
    p === orig ? { ascii: text, tex: toTex(text) } : { ascii: polyAscii(p, v), tex: polyLatex(p.coeffs, v) };
  const lhs = side(L, m.L, m.lhs);
  const rhs = side(R, m.R, m.rhs);
  return { source: `${lhs.ascii} ${OP_ASCII[m.op]} ${rhs.ascii}`, latex: `${lhs.tex} ${OP_TEX[m.op]} ${rhs.tex}` };
}

function moveSingle(m: Single, handle: GraphHandle, to: { x: number; y: number }, step: number): Edited | null {
  const [c, b, a] = m.f.coeffs;
  const X = snap(to.x, step);
  if (handle.kind === "root" && m.f.degree === 1) {
    // Same slope, through the new solution: f = b(x − X).
    return rewriteSingle(m, poly(neg(mul(b, X)), b, rat(0)));
  }
  if (handle.kind === "root") {
    const roots = rationalRoots(m.f);
    if (roots && roots.length === 2) {
      // The other solution stays put: f = a(x − X)(x − other).
      const other = roots[1 - handle.index];
      return rewriteSingle(m, poly(mul(a, mul(X, other)), neg(mul(a, add(X, other))), a));
    }
    // Irrational solutions: slide the curve up or down until it crosses at X.
    const fx = add(add(mul(a, mul(X, X)), mul(b, X)), c);
    return rewriteSingle(m, poly(sub(c, fx), b, a));
  }
  if (handle.kind === "vertex" && m.f.degree === 2) {
    // Same opening, new turning point: f = a(x − H)² + K.
    const K = snap(to.y, step);
    return rewriteSingle(m, poly(add(mul(a, mul(X, X)), K), neg(mul(rat(2), mul(a, X))), a));
  }
  return null;
}

/** `x^2-4*x+3`: what the solver parses, readable when shown. */
function polyAscii(p: Poly, v: string): string {
  const terms = p.coeffs
    .map((coeff, power) => ({ coeff, power }))
    .filter((t) => !isZero(t.coeff))
    .reverse();
  if (!terms.length) return "0";
  return terms
    .map(({ coeff, power }, i) => {
      const abs = coeff.n < 0 ? neg(coeff) : coeff;
      const one = abs.n === 1 && abs.d === 1;
      const body = power === 0 ? ratAscii(abs) : `${one ? "" : `${ratAscii(abs)}*`}${v}${power === 2 ? "^2" : ""}`;
      const sign = coeff.n < 0 ? "-" : i ? "+" : "";
      return `${sign}${body}`;
    })
    .join("");
}

/* ───────────── Two unknowns: two lines ───────────── */

type Line = { lhs: string; rhs: string; a: Rat; b: Rat; c: Rat; lConst: Rat | null; rConst: Rat | null };
type Pair = { vars: [string, string]; lines: [Line, Line] };

function constantOf(text: string): Rat | null {
  const node = parseExpr(text);
  return node && collectVariables(node).size === 0 ? evalExact(node, {}) : null;
}

function pair(source: string): Pair | null {
  if (!splitSystem(source)) return null;
  const sa = analyzeSystem(source);
  if (!sa.ok || sa.variables.length !== 2 || sa.rows.length !== 2) return null;
  const lines = sa.rows.map((r, i) => ({
    lhs: sa.equations[i].lhs,
    rhs: sa.equations[i].rhs,
    a: r.coeffs[0],
    b: r.coeffs[1],
    c: r.rhs,
    lConst: constantOf(sa.equations[i].lhs),
    rConst: constantOf(sa.equations[i].rhs),
  })) as [Line, Line];
  return { vars: sa.variables as [string, string], lines };
}

function crossing({ lines: [p, q] }: Pair): { x: number; y: number } | null {
  const [a1, b1, c1, a2, b2, c2] = [p.a, p.b, p.c, q.a, q.b, q.c].map(toNumber);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return null;
  return { x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det };
}

/** Line a·x + b·y = c moved (same slope) by `shift` on its constant. */
function rewriteLine(l: Line, shift: Rat): { ascii: string; tex: string } {
  // L − R = a·x + b·y − c, so c grows by `shift` when R grows by it (or L shrinks).
  if (l.rConst) {
    const r = add(l.rConst, shift);
    return { ascii: `${l.lhs} = ${ratAscii(r)}`, tex: `${toTex(l.lhs)} = ${ratLatex(r)}` };
  }
  if (l.lConst) {
    const r = sub(l.lConst, shift);
    return { ascii: `${ratAscii(r)} = ${l.rhs}`, tex: `${ratLatex(r)} = ${toTex(l.rhs)}` };
  }
  const rhs = exact.simplify(`(${l.rhs}) + (${ratAscii(shift)})`).toString();
  return { ascii: `${l.lhs} = ${rhs}`, tex: `${toTex(l.lhs)} = ${toTex(rhs)}` };
}

function movePoint(m: Pair, to: { x: number; y: number }, step: number): Edited | null {
  const X = snap(to.x, step);
  const Y = snap(to.y, step);
  const shifts = m.lines.map((l) => sub(add(mul(l.a, X), mul(l.b, Y)), l.c));
  if (shifts.every(isZero)) return null;
  const rows = m.lines.map((l, i) => (isZero(shifts[i]) ? { ascii: `${l.lhs} = ${l.rhs}`, tex: `${toTex(l.lhs)} = ${toTex(l.rhs)}` } : rewriteLine(l, shifts[i])));
  return {
    source: rows.map((r) => r.ascii).join("; "),
    latex: `\\begin{cases}${rows.map((r) => r.tex).join("\\\\")}\\end{cases}`,
  };
}

/* ───────────── Entry points ───────────── */

/** What can be dragged on this problem's graph ([] when nothing can). */
export function graphHandles(source: string): GraphHandle[] {
  const two = pair(source);
  if (two) {
    const p = crossing(two);
    return p ? [{ kind: "point", ...p }] : [];
  }
  const one = single(source);
  return one ? singleHandles(one) : [];
}

/**
 * The problem after dragging `handle` to graph point `to`. Always computed from
 * the problem as it was when the drag began, so a long drag never drifts.
 * Null when the snapped position changes nothing.
 */
export function moveHandle(source: string, handle: GraphHandle, to: { x: number; y: number }, step = 0.5): Edited | null {
  if (handle.kind === "point") {
    const two = pair(source);
    return two ? movePoint(two, to, step) : null;
  }
  const one = single(source);
  return one ? moveSingle(one, handle, to, step) : null;
}
