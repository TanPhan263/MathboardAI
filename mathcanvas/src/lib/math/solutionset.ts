import { analyzeRational, isRationalEquation } from "./fractions";
import { analyzeRelation } from "./polynomial";
import type { SolutionSet } from "./sets";
import { signAnalysis } from "./signs";
import type { SolveFailure } from "./types";

/**
 * The real solution set of any supported one-variable relation: polynomial
 * equations and inequalities, and equations with the unknown in a
 * denominator (with forbidden values removed). Used to validate steps and
 * to check a learner's own lines.
 */
export function solutionSetOf(
  raw: string,
): { ok: true; variable: string; set: SolutionSet; inequality: boolean } | SolveFailure {
  if (isRationalEquation(raw)) {
    const ra = analyzeRational(raw);
    if (!ra.ok) return ra;
    const { set } = signAnalysis(ra.cleared, "=");
    const kept = set.filter(
      (iv) => !ra.restrictions.some((r) => Math.abs(r.value - iv.lo) < 1e-9),
    );
    // Degenerate "all reals" after clearing still excludes the restrictions.
    if (ra.cleared.degree === 0 && kept.length && kept[0].lo === -Infinity) {
      const cuts = ra.restrictions.map((r) => r.value);
      const pieces: SolutionSet = [];
      let lo = -Infinity;
      for (const c of cuts) {
        pieces.push({ lo, hi: c, loClosed: false, hiClosed: false });
        lo = c;
      }
      pieces.push({ lo, hi: Infinity, loClosed: false, hiClosed: false });
      return { ok: true, variable: ra.variable, set: pieces, inequality: false };
    }
    return { ok: true, variable: ra.variable, set: kept, inequality: false };
  }
  const an = analyzeRelation(raw);
  if (!an.ok) return an;
  const { set } = signAnalysis(an.poly, an.op);
  return { ok: true, variable: an.variable, set, inequality: an.op !== "=" };
}

