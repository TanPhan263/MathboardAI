import { solvePolynomialEquation, solveRationalEquation } from "./equation";
import { analyzeRational, isRationalEquation } from "./fractions";
import { solveInequality } from "./inequality";
import { analyzeRelation } from "./polynomial";
import { analyzeSystem, solveSystem, splitSystem } from "./system";
import type { SolveResult } from "./types";
import { isGeometry } from "./geometry/parse";
import { solveGeometry } from "./geometry/solve";
import { isMeasure, solveMeasure } from "./measure";
import { isConic, solveConic } from "./conic";
import { isVectorProblem, solveVector } from "./vector";

/**
 * Entry point. Routes the problem to the right exact solver:
 * coordinate geometry → system → inequality → equation with x in a denominator
 * → polynomial equation.
 */
export function solveProblem(input: string, problemId = "problem"): SolveResult {
  // Triangles and solids given by measures come first: “mặt cầu bán kính 3” is not Oxyz.
  if (isConic(input)) return solveConic(problemId, input);
  if (isVectorProblem(input)) return solveVector(problemId, input);
  if (isMeasure(input)) return solveMeasure(problemId, input);
  if (isGeometry(input)) return solveGeometry(problemId, input);
  if (splitSystem(input)) {
    const sa = analyzeSystem(input);
    return sa.ok ? { ok: true, solution: solveSystem(problemId, sa) } : sa;
  }
  if (isRationalEquation(input)) {
    const ra = analyzeRational(input);
    return ra.ok ? { ok: true, solution: solveRationalEquation(problemId, ra) } : ra;
  }
  const an = analyzeRelation(input);
  if (!an.ok) return an;
  return {
    ok: true,
    solution: an.op === "=" ? solvePolynomialEquation(problemId, an) : solveInequality(problemId, an),
  };
}
