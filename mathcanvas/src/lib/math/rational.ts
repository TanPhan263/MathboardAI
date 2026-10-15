/**
 * Tiny exact rational type. Coefficients in the supported problem class stay
 * small, so plain numbers are safe and keep the solver dependency-free.
 */
export type Rat = { readonly n: number; readonly d: number };

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

export const lcm = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b);

export function rat(n: number, d = 1): Rat {
  if (d === 0) throw new RangeError("Zero denominator");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g || 0, d: d / g };
}

export const ZERO = rat(0);
export const ONE = rat(1);

export const add = (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rat, b: Rat) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rat, b: Rat) => rat(a.n * b.d, a.d * b.n);
export const neg = (a: Rat) => rat(-a.n, a.d);
export const isZero = (a: Rat) => a.n === 0;
export const isInt = (a: Rat) => a.d === 1;
export const eq = (a: Rat, b: Rat) => a.n === b.n && a.d === b.d;
export const sign = (a: Rat) => Math.sign(a.n);
export const toNumber = (a: Rat) => a.n / a.d;

/** Exact integer square root, or null when `n` is not a perfect square. */
export function intSqrt(n: number): number | null {
  if (n < 0 || !Number.isInteger(n)) return null;
  const r = Math.round(Math.sqrt(n));
  return r * r === n ? r : null;
}

/** Exact square root of a rational, or null when it is irrational. */
export function ratSqrt(a: Rat): Rat | null {
  const n = intSqrt(a.n);
  const d = intSqrt(a.d);
  return n === null || d === null ? null : rat(n, d);
}

/** Split a positive integer as k²·m with m square-free. */
export function extractSquare(n: number): { k: number; m: number } {
  let k = 1;
  let m = n;
  for (let f = 2; f * f <= m; f++) {
    while (m % (f * f) === 0) {
      m /= f * f;
      k *= f;
    }
  }
  return { k, m };
}
