import { L } from "./lang";
import type { SolutionStep, StepKind, ValidationStatus } from "./types";

export type StepDraft = Omit<SolutionStep, "id" | "canvasObjectIds" | "validation"> & {
  validation?: ValidationStatus;
};

export function step(kind: StepKind, d: Omit<StepDraft, "kind">): StepDraft {
  return { kind, ...d };
}

export function finalize(problemId: string, drafts: StepDraft[]): SolutionStep[] {
  return drafts.map((d, i) => ({
    ...d,
    id: `${problemId}-s${i + 1}`,
    validation: d.validation ?? "passed",
    canvasObjectIds: [],
  }));
}

/** 4-decimal string without "-0.0000". */
export const dec = (n: number) => (Math.abs(n) < 5e-5 ? "0.0000" : n.toFixed(4));

/** " or " between answers, in the board's language. */
export const OR = () => `\\;\\text{${L({ en: "or", vi: "hoặc" })}}\\;`;

/** Exact LaTeX for the two irrational roots of ax² + bx + c (integer a, b, Δ). */
export function irrationalRootTex(bInt: number, twoA: number, D: number): { low: string; high: string; pm: string } {
  let k = 1;
  let m = D;
  for (let f = 2; f * f <= m; f++) {
    while (m % (f * f) === 0) {
      m /= f * f;
      k *= f;
    }
  }
  const g = gcd3(Math.abs(bInt), k, Math.abs(twoA));
  let bb = -bInt / g;
  let kk = k / g;
  let den = twoA / g;
  if (den < 0) {
    bb = -bb;
    kk = -kk;
    den = -den;
  }
  const rad = `${Math.abs(kk) === 1 ? "" : Math.abs(kk)}\\sqrt{${m}}`;
  const wrap = (top: string) => (den === 1 ? top : `\\frac{${top}}{${den}}`);
  const head = bb === 0 ? "" : String(bb);
  // With den > 0, "−" gives the smaller root when kk > 0.
  const minus = wrap(`${head}-${rad}`);
  const plus = wrap(`${head}${bb === 0 ? "" : "+"}${rad}`);
  return {
    low: kk > 0 ? minus : plus,
    high: kk > 0 ? plus : minus,
    pm: wrap(`${head}\\pm ${rad}`),
  };
}

function gcd3(a: number, b: number, c: number): number {
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  return g(g(a, b), c) || 1;
}
