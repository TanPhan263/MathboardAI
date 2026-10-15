import { L } from "../lang";
import { float, normalizeInput } from "../polynomial";
import { rat } from "../rational";
import { type StepDraft, step } from "../steps";
import { type Surd, negS, sqrtOf, surdLatex, toNum } from "../surd";
import type { StepKind, ValidationStatus } from "../types";

/**
 * Measures (lengths, areas, volumes, angles) are computed in floating point
 * and shown exactly when they are a rational multiple of one square root —
 * which every textbook triangle, cone or pyramid answer is (5, 2√3, a³√2/6,
 * 16π/3). Anything else is shown honestly as ≈ 4 decimals.
 */

/** Best fraction n/d with d ≤ maxDen that matches x to 1e-10, by continued fractions. */
export function toFraction(x: number, maxDen = 5000): { n: number; d: number } | null {
  if (!Number.isFinite(x)) return null;
  const sign = Math.sign(x) || 1;
  let v = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > maxDen) break;
    if (Math.abs(Math.abs(x) - h1 / k1) <= 1e-10 * Math.max(1, Math.abs(x))) {
      return h1 > 1e9 ? null : { n: sign * h1, d: k1 };
    }
    const frac = v - a;
    if (frac < 1e-12) break;
    v = 1 / frac;
  }
  return null;
}

/** x as an exact c√m, or null. */
export function recognize(x: number): Surd | null {
  if (!Number.isFinite(x)) return null;
  if (Math.abs(x) < 1e-11) return [];
  const f = toFraction(x * x);
  if (!f || f.n <= 0) return null;
  const s = sqrtOf(rat(f.n, f.d));
  if (Math.abs(toNum(s) - Math.abs(x)) > 1e-9 * Math.max(1, Math.abs(x))) return null;
  return x < 0 ? negS(s) : s;
}

const round4 = (x: number) => String(Number(x.toFixed(4)));

/**
 * A measure in LaTeX. With a length symbol (problems “theo a”), `power` is
 * its dimension: a length is ·a, an area ·a², a volume ·a³. `pi` adds π.
 * Textbook order: \frac{a^3\sqrt{2}}{6}, \frac{16\pi}{3}, 2a\sqrt{3}.
 */
export function measureTex(x: number, sym: string | null = null, power = 1, pi = false): string {
  const base = pi ? x / Math.PI : x;
  const s = recognize(base);
  const symTex = sym && power ? `${sym}${power > 1 ? `^${power}` : ""}` : "";
  const piTex = pi ? "\\pi " : "";
  if (!s || s.length > 1) {
    return `\\approx ${round4(x)}${sym && power ? `\\,${symTex}` : ""}`;
  }
  if (s.length === 0) return "0";
  const { c, m } = s[0];
  const n = Math.abs(c.n);
  const root = m === 1 ? "" : `\\sqrt{${m}}`;
  const rest = `${piTex}${symTex}${root}`.trim();
  const top = `${n === 1 && rest ? "" : n}${rest}`;
  const body = c.d === 1 ? top : `\\frac{${top}}{${c.d}}`;
  return `${c.n < 0 ? "-" : ""}${body}`;
}

/** 60^\circ, or ≈ 38.21^\circ. */
export function degTex(deg: number): string {
  const r = Math.round(deg);
  return Math.abs(deg - r) < 1e-7 ? `${r}^\\circ` : `\\approx ${Number(deg.toFixed(2))}^\\circ`;
}

/** Exact value of a trig ratio when it has one: \frac{\sqrt{3}}{2}. */
export const ratioTex = (x: number) => {
  const s = recognize(x);
  return s && s.length <= 1 ? surdLatex(s) : `\\approx ${round4(x)}`;
};

export const RAD = Math.PI / 180;
export const close = (a: number, b: number, tol = 1e-7) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/* ───────────────────────────── Reading values ───────────────────────────── */

export type Value = { value: number; sym: string | null };

/**
 * A length or measure as written: 3, 2,5, 3/2, 2√3, a, 2a, a√3/2, a/2.
 * One letter may stand for the unit length (“cạnh a”); it is set to 1, and
 * answers are written back in terms of it.
 */
export function readValue(raw: string): Value | null {
  let s = normalizeInput(raw.normalize("NFC"))
    .replace(/π/g, "pi")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/sqrt\s*(\d+(?:\.\d+)?)/g, "sqrt($1)")
    .trim();
  const letters = [...new Set((s.replace(/sqrt|pi/g, "").match(/[a-z]/g) ?? []))];
  if (letters.length > 1) return null;
  const sym = letters[0] ?? null;
  if (sym) s = s.replace(new RegExp(`${sym}(?=\\s*(sqrt|\\d|\\())`, "g"), `${sym}*`);
  try {
    const value = Number(float.evaluate(s, sym ? { [sym]: 1 } : {}));
    return Number.isFinite(value) ? { value, sym } : null;
  } catch {
    return null;
  }
}

/**
 * A number pattern for regexes: 5, 2.5, 3/2, 2a, a√3 (read as “asqrt3”), a/2,
 * 2sqrt(3). A unit letter must not run into a word (“và” is not “v”).
 */
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const SYM = String.raw`[a-z](?:(?=\s*\*?\s*sqrt)|(?![\p{L}]))`;
const ROOT = String.raw`(?:√|sqrt)\s*\(?\d+(?:[.,]\d+)?\)?`;
export const VAL = String.raw`((?:${NUM}\s*(?:${SYM})?|${SYM})(?:\s*\*?\s*${ROOT})?(?:\s*\/\s*\d+)?|${ROOT}(?:\s*${SYM})?(?:\s*\/\s*\d+)?)`;

/** “BC = ≈ 11.15” reads badly: an approximate value takes ≈ instead of =. */
export const fixEq = (tex: string) => tex.replace(/=\s*\\approx/g, "\\approx");

/* ───────────────────────────── Steps ───────────────────────────── */

export type Text = { en: string; vi: string };

/** Collects explained steps. */
export class Steps {
  drafts: StepDraft[] = [];
  push(kind: StepKind, op: Text, latex: string, explain: Text, why: Text, hint: Text, validation: ValidationStatus = "passed") {
    this.drafts.push(step(kind, { operation: L(op), latex: fixEq(latex), explanation: L(explain), why: L(why), hint: L(hint), validation }));
  }
}

/** One answer: what was asked, its LaTeX, and its value with the unit length set to 1. */
export type MeasureAnswer = { key: string; latex: string; value: number | null; degrees?: boolean };

export class MeasureError extends Error {
  constructor(
    message: string,
    readonly suggestion: string,
  ) {
    super(message);
  }
}

export const oops = (msg: Text, hint: Text): never => {
  throw new MeasureError(L(msg), L(hint));
};
