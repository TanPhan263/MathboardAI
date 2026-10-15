/**
 * Application contract from the blueprint (§9). A step only reads `passed`
 * when a defined validation procedure ran — see solve.ts for which.
 */
export type ValidationStatus = "passed" | "failed" | "unverified";

export type StepKind =
  | "standard-form"
  | "scale"
  | "isolate"
  | "divide"
  | "discriminant"
  | "factor"
  | "zero-product"
  | "quadratic-formula"
  | "roots"
  | "verify"
  | "no-solution"
  | "identity"
  | "evaluate"
  // fractions
  | "restriction"
  | "clear-denominators"
  | "extraneous"
  // inequalities
  | "flip"
  | "sign-chart"
  | "interval"
  // systems
  | "eliminate"
  | "swap"
  | "back-substitute"
  | "solution-point"
  // coordinate geometry
  | "coordinates"
  | "formula"
  | "construct"
  | "relation"
  | "proof";

export type SolutionStep = {
  id: string;
  kind: StepKind;
  /** LaTeX shown to the learner. */
  latex: string;
  /** Short name of the operation, e.g. "Factor". */
  operation: string;
  /** What we did and why, in plain language. */
  explanation: string;
  /** Why this move is mathematically allowed. */
  why: string;
  /** A nudge that does not reveal the step. */
  hint: string;
  validation: ValidationStatus;
  /** Board objects this step was written to (filled in client-side). */
  canvasObjectIds: string[];
};

export type ProblemTopic =
  | "linear-equation"
  | "quadratic-equation"
  | "rational-equation"
  | "linear-inequality"
  | "quadratic-inequality"
  | "linear-system"
  | "geometry-2d"
  | "geometry-3d"
  // measures (no coordinates)
  | "triangle"
  | "solid"
  | "space-figure"
  // conics (grade 10)
  | "conic"
  // vectors without coordinates (grade 10)
  | "vector";

export type MathSolution = {
  problemId: string;
  originalInput: string;
  topic: ProblemTopic;
  variable?: string;
  steps: SolutionStep[];
  finalAnswer: string;
  /** Real roots (floating point, for graphing only). */
  roots: number[];
  /** Unknowns of a system, in order, and the solution point when unique. */
  variables?: string[];
  point?: number[];
  confidenceNotes: string[];
};

export type SolveFailureCode =
  | "empty"
  | "parse"
  | "unsupported"
  | "ambiguous";

export type SolveFailure = {
  ok: false;
  code: SolveFailureCode;
  message: string;
  /** What the learner can do next. */
  suggestion: string;
};

export type SolveResult = { ok: true; solution: MathSolution } | SolveFailure;
