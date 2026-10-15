import { L } from "../lang";
import { ratLatex, ratParen } from "../latex";
import { type Rat, add, div, gcd, isZero, lcm, mul, neg, rat, sub, toNumber } from "../rational";
import { type Surd, surdLatex } from "../surd";

/** An exact vector or point in the plane (2 coordinates) or in space (3). */
export type Vec = readonly Rat[];

export const AXES = ["x", "y", "z"] as const;

export const vsub = (a: Vec, b: Vec): Vec => a.map((x, i) => sub(x, b[i]));
export const vadd = (a: Vec, b: Vec): Vec => a.map((x, i) => add(x, b[i]));
export const vscale = (a: Vec, k: Rat): Vec => a.map((x) => mul(x, k));
export const vneg = (a: Vec): Vec => a.map(neg);
export const dot = (a: Vec, b: Vec): Rat => a.reduce((s, x, i) => add(s, mul(x, b[i])), rat(0));
export const lenSq = (a: Vec): Rat => dot(a, a);
export const isZeroVec = (a: Vec) => a.every(isZero);
export const veq = (a: Vec, b: Vec) => a.every((x, i) => x.n === b[i].n && x.d === b[i].d);
export const mid = (a: Vec, b: Vec): Vec => vscale(vadd(a, b), rat(1, 2));
export const toNums = (a: Vec): number[] => a.map(toNumber);

/** [a, b] = (a₂b₃ − a₃b₂; a₃b₁ − a₁b₃; a₁b₂ − a₂b₁). */
export const cross = (a: Vec, b: Vec): Vec => [
  sub(mul(a[1], b[2]), mul(a[2], b[1])),
  sub(mul(a[2], b[0]), mul(a[0], b[2])),
  sub(mul(a[0], b[1]), mul(a[1], b[0])),
];

/** a₁b₂ − a₂b₁: twice the signed area of the triangle on a, b (plane vectors). */
export const det2 = (a: Vec, b: Vec): Rat => sub(mul(a[0], b[1]), mul(a[1], b[0]));

/** Same or opposite direction (the zero vector counts as parallel to everything). */
export const parallel = (a: Vec, b: Vec) => (a.length === 3 ? isZeroVec(cross(a, b)) : isZero(det2(a, b)));

/**
 * The shortest whole-number vector along `a`, first non-zero coordinate
 * positive: (2/3; −4/3; 2/3) → (1; −2; 1). For normals and directions only.
 */
export function primitive(a: Vec): Vec {
  const den = a.reduce((l, x) => lcm(l, x.d), 1);
  const ints = a.map((x) => (x.n * den) / x.d);
  const g = ints.reduce((s, x) => gcd(s, x), 0) || 1;
  const lead = ints.find((x) => x !== 0) ?? 1;
  const s = lead < 0 ? -1 : 1;
  return ints.map((x) => rat((s * x) / g));
}

/** k with b = k·a, or null when b is not a multiple of a. */
export function ratio(a: Vec, b: Vec): Rat | null {
  const i = a.findIndex((x) => !isZero(x));
  if (i < 0) return null;
  const k = div(b[i], a[i]);
  return a.every((x, j) => {
    const p = mul(x, k);
    return p.n === b[j].n && p.d === b[j].d;
  })
    ? k
    : null;
}

/* ───────────────────────────── LaTeX ───────────────────────────── */

/** Coordinate separator: “;” in Vietnamese textbooks, “,” in English. */
export const sep = () => L({ en: ",\\ ", vi: ";\\ " });

export const tupleTex = (parts: string[]) => `\\left(${parts.join(sep())}\\right)`;
export const vecTex = (a: Vec) => tupleTex(a.map(ratLatex));
export const surdTupleTex = (a: Surd[]) => tupleTex(a.map(surdLatex));

/** \overrightarrow{AB} for two points, \vec{u} for a named vector. */
export const arrow = (name: string) =>
  /^[A-Z][0-9']*[A-Z][0-9']*$/.test(name) ? `\\overrightarrow{${name}}` : `\\vec{${name}}`;

/** Names like d1 or A' typeset as d_1, A'. */
export const nameTex = (name: string) =>
  name
    .replace(/Δ/g, "\\Delta ")
    .replace(/α/g, "\\alpha ")
    .replace(/β/g, "\\beta ")
    .replace(/γ/g, "\\gamma ")
    .replace(/([A-Za-z])(\d+)/g, "$1_{$2}");

/** 2x - y + 2z - 3 (no “= 0”), skipping zero terms. */
export function linTex(coeffs: readonly Rat[], constant: Rat, vars: readonly string[] = AXES): string {
  const terms: Array<{ c: Rat; v: string }> = coeffs.map((c, i) => ({ c, v: vars[i] }));
  terms.push({ c: constant, v: "" });
  const live = terms.filter((t) => !isZero(t.c));
  if (live.length === 0) return "0";
  return live
    .map((t, i) => {
      const abs = t.c.n < 0 ? neg(t.c) : t.c;
      const one = abs.n === 1 && abs.d === 1;
      const body = t.v ? `${one ? "" : ratLatex(abs)}${t.v}` : ratLatex(abs);
      if (i === 0) return t.c.n < 0 ? `-${body}` : body;
      return t.c.n < 0 ? ` - ${body}` : ` + ${body}`;
    })
    .join("");
}

/** 1 + 2t for one coordinate of a parametric line (number first, as in textbooks). */
export function paramTex(p: Rat, u: Rat, t = "t"): string {
  if (isZero(u)) return ratLatex(p);
  const abs = u.n < 0 ? neg(u) : u;
  const term = `${abs.n === 1 && abs.d === 1 ? "" : ratLatex(abs)}${t}`;
  if (isZero(p)) return u.n < 0 ? `-${term}` : term;
  return `${ratLatex(p)} ${u.n < 0 ? "-" : "+"} ${term}`;
}

/** (x − a)² with tidy signs: x², (x − 1)², \left(y + \frac{1}{2}\right)². */
export function shiftSqTex(v: string, c: Rat): string {
  if (isZero(c)) return `${v}^2`;
  const abs = c.n < 0 ? neg(c) : c;
  const inner = `${v} ${c.n < 0 ? "+" : "-"} ${ratLatex(abs)}`;
  return c.d === 1 ? `(${inner})^2` : `\\left(${inner}\\right)^2`;
}

/** “x_B − x_A” style differences with numbers: 3 − 1, 0 − (−2). */
export const diffTex = (b: Rat, a: Rat) => `${ratLatex(b)} - ${ratParen(a)}`;
export const sumTex = (a: Rat, b: Rat) => `${ratLatex(a)} + ${ratParen(b)}`;
export const prodTex = (a: Rat, b: Rat) => `${ratParen(a)}\\cdot ${ratParen(b)}`;
export const sqTex = (a: Rat) => `${ratParen(a)}^2`;
