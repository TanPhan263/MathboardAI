import { type Rat, add, div, extractSquare, isZero, lcm, mul, neg, rat, sign, sub, toNumber } from "./rational";

/**
 * Exact numbers with square roots: a sum of rational multiples of √m, m
 * square-free (m = 1 is the rational part). Lengths, distances and angles in
 * coordinate geometry come out as √14, 3√2/2 or 1 + √5, and stay exact here.
 */
export type SurdTerm = { readonly c: Rat; readonly m: number };
export type Surd = ReadonlyArray<SurdTerm>;

/** Combine equal radicals, drop zeros, order by radicand (rational part first). */
function tidy(terms: SurdTerm[]): Surd {
  const by = new Map<number, Rat>();
  for (const t of terms) by.set(t.m, add(by.get(t.m) ?? rat(0), t.c));
  return [...by.entries()]
    .filter(([, c]) => !isZero(c))
    .sort(([a], [b]) => a - b)
    .map(([m, c]) => ({ c, m }));
}

export const fromRat = (r: Rat): Surd => (isZero(r) ? [] : [{ c: r, m: 1 }]);
export const fromInt = (n: number): Surd => fromRat(rat(n));

/** √r for a rational r ≥ 0, simplified: √(9/2) = 3√2/2. */
export function sqrtOf(r: Rat): Surd {
  if (r.n < 0) throw new RangeError("Square root of a negative number");
  if (r.n === 0) return [];
  // √(n/d) = √(n·d)/d
  const { k, m } = extractSquare(r.n * r.d);
  return [{ c: rat(k, r.d), m }];
}

export const addS = (a: Surd, b: Surd): Surd => tidy([...a, ...b]);
export const negS = (a: Surd): Surd => a.map((t) => ({ c: neg(t.c), m: t.m }));
export const subS = (a: Surd, b: Surd): Surd => addS(a, negS(b));
export const scaleS = (a: Surd, r: Rat): Surd => tidy(a.map((t) => ({ c: mul(t.c, r), m: t.m })));

export function mulS(a: Surd, b: Surd): Surd {
  const out: SurdTerm[] = [];
  for (const x of a) {
    for (const y of b) {
      // √m₁·√m₂ = k√m with m₁m₂ = k²m
      const { k, m } = extractSquare(x.m * y.m);
      out.push({ c: mul(mul(x.c, y.c), rat(k)), m });
    }
  }
  return tidy(out);
}

export const toNum = (a: Surd): number => a.reduce((s, t) => s + toNumber(t.c) * Math.sqrt(t.m), 0);
export const isZeroS = (a: Surd) => a.length === 0;
export const signS = (a: Surd) => (a.length === 1 ? sign(a[0].c) : Math.sign(toNum(a)));
export const absS = (a: Surd): Surd => (signS(a) < 0 ? negS(a) : a);
export const eqS = (a: Surd, b: Surd) => isZeroS(subS(a, b));

/** The rational value, or null when a root is left. */
export const asRat = (a: Surd): Rat | null => (a.length === 0 ? rat(0) : a.length === 1 && a[0].m === 1 ? a[0].c : null);

/** 1/a for one term (c√m) or p + q√m; null for anything longer. */
export function invS(a: Surd): Surd | null {
  if (a.length === 0) return null;
  if (a.length === 1) {
    const { c, m } = a[0];
    // 1/(c√m) = √m/(c·m)
    return [{ c: div(rat(1), mul(c, rat(m))), m }];
  }
  if (a.length === 2 && a[0].m === 1) {
    // 1/(p + q√m) = (p − q√m)/(p² − q²m)
    const p = a[0].c;
    const { c: q, m } = a[1];
    const den = sub(mul(p, p), mul(mul(q, q), rat(m)));
    return scaleS([{ c: p, m: 1 }, { c: neg(q), m }], div(rat(1), den));
  }
  return null;
}

export function divS(a: Surd, b: Surd): Surd | null {
  const inv = invS(b);
  return inv ? mulS(a, inv) : null;
}

/** a² for a single-term surd, exactly. */
export const sqS = (a: Surd): Surd => mulS(a, a);

const radTex = (k: number, m: number) => `${k === 1 ? "" : k}${m === 1 ? (k === 1 ? "1" : "") : `\\sqrt{${m}}`}`;

/**
 * LaTeX over one common denominator: 2\sqrt{3}, \frac{3\sqrt{2}}{2},
 * \frac{1 + \sqrt{5}}{2}, -\frac{\sqrt{6}}{6}.
 */
export function surdLatex(a: Surd): string {
  if (a.length === 0) return "0";
  const den = a.reduce((l, t) => lcm(l, t.c.d), 1);
  const ints = a.map((t) => ({ k: (t.c.n * den) / t.c.d, m: t.m }));
  // A single negative term reads better as −\frac{…}{…}.
  const allNeg = ints.every((t) => t.k < 0);
  const body = ints
    .map((t, i) => {
      const k = allNeg ? -t.k : t.k;
      const abs = radTex(Math.abs(k), t.m);
      if (i === 0) return k < 0 ? `-${abs}` : abs;
      return k < 0 ? ` - ${abs}` : ` + ${abs}`;
    })
    .join("");
  const frac = den === 1 ? body : `\\frac{${body}}{${den}}`;
  return allNeg ? `-${frac}` : frac;
}

/** Plain text the expression parser (and a learner) reads: 3*sqrt(2)/2. */
export function surdAscii(a: Surd): string {
  if (a.length === 0) return "0";
  return a
    .map((t) => {
      const c = `${t.c.n}${t.c.d === 1 ? "" : `/${t.c.d}`}`;
      return t.m === 1 ? `(${c})` : `(${c})*sqrt(${t.m})`;
    })
    .join("+");
}
