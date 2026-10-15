import { type Poly, type RelOp, evalPolyFloat, rationalRoots, realRoots } from "./polynomial";
import { ratLatex } from "./latex";
import { lcm, mul, rat } from "./rational";
import { type SolutionSet, ALL, NONE, normalizeSet } from "./sets";
import { irrationalRootTex } from "./steps";

export type Boundary = { value: number; tex: string };

export type Region = {
  lo: number;
  hi: number;
  loTex: string;
  hiTex: string;
  /** A friendly value inside the region used to test the sign. */
  test: number;
  positive: boolean;
  included: boolean;
};

/** Same polynomial with whole-number coefficients (positive multiple). */
export function integerPoly(p: Poly): Poly {
  const L = p.coeffs.reduce((acc, r) => lcm(acc, r.d), 1);
  return { ...p, coeffs: p.coeffs.map((c) => mul(c, rat(L))) as Poly["coeffs"] };
}

/** Real zeros of a polynomial with exact LaTeX. */
export function boundariesOf(poly: Poly): Boundary[] {
  if (poly.degree === 0) return [];
  const exactRoots = rationalRoots(poly);
  if (exactRoots) return exactRoots.map((r) => ({ value: r.n / r.d, tex: ratLatex(r) }));
  const set = realRoots(poly);
  if (set.kind !== "finite") return [];
  const ip = integerPoly(poly);
  const [c, b, a] = ip.coeffs.map((r) => r.n);
  const tex = irrationalRootTex(b, 2 * a, b * b - 4 * a * c);
  return [
    { value: set.values[0], tex: tex.low },
    { value: set.values[1], tex: tex.high },
  ];
}

function testPoint(lo: number, hi: number): number {
  if (lo === -Infinity && hi === Infinity) return 0;
  if (lo === -Infinity) return Math.floor(hi) - 1;
  if (hi === Infinity) return Math.ceil(lo) + 1;
  const k = Math.floor(lo) + 1;
  if (k < hi && Math.abs(k - hi) > 1e-9) return k;
  return (lo + hi) / 2;
}

export const holds = (value: number, op: RelOp, eps = 1e-9): boolean => {
  switch (op) {
    case "=":
      return Math.abs(value) <= eps;
    case "<":
      return value < -eps;
    case ">":
      return value > eps;
    case "<=":
      return value <= eps;
    case ">=":
      return value >= -eps;
  }
};

/**
 * Sign analysis of f(x) op 0: split the line at the zeros of f, test one
 * point per region, and assemble the solution set.
 */
export function signAnalysis(
  poly: Poly,
  op: RelOp,
): { boundaries: Boundary[]; regions: Region[]; set: SolutionSet } {
  if (poly.degree === 0) {
    const c = poly.coeffs[0];
    return { boundaries: [], regions: [], set: holds(c.n / c.d, op) ? ALL : NONE };
  }
  const boundaries = boundariesOf(poly);
  const cuts = [
    { value: -Infinity, tex: "-\\infty" },
    ...boundaries,
    { value: Infinity, tex: "\\infty" },
  ];
  const regions: Region[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i];
    const hi = cuts[i + 1];
    const test = testPoint(lo.value, hi.value);
    const y = evalPolyFloat(poly, test);
    regions.push({
      lo: lo.value,
      hi: hi.value,
      loTex: lo.tex,
      hiTex: hi.tex,
      test,
      positive: y > 0,
      included: op !== "=" && holds(y, op),
    });
  }
  const closed = op === "=" || op === "<=" || op === ">=";
  const set: SolutionSet = [
    ...regions
      .filter((r) => r.included)
      .map((r) => ({ lo: r.lo, hi: r.hi, loClosed: false, hiClosed: false, loTex: r.loTex, hiTex: r.hiTex })),
    ...(closed
      ? boundaries.map((b) => ({ lo: b.value, hi: b.value, loClosed: true, hiClosed: true, loTex: b.tex, hiTex: b.tex }))
      : []),
  ];
  return { boundaries, regions, set: normalizeSet(set) };
}
