import type { MathSolution } from "../math/types";

export type TutorIntent = "why" | "alternative" | "skip" | "simpler" | "free";

export type TutorRequest = {
  solution: MathSolution;
  stepId: string;
  intent: TutorIntent;
  /** The learner's own words (for `free`). */
  question: string;
};

/**
 * Provider seam (blueprint §10). The UI only ever talks to this interface;
 * the math engine has already produced and validated the steps, so a provider
 * explains them and must never change the verified result.
 *
 * A server-backed implementation would POST `{ solution, stepId, question }`
 * to `/api/math/explain` and return the model's text.
 */
export interface TutorProvider {
  readonly id: string;
  readonly label: string;
  answer(req: TutorRequest): Promise<string>;
}

export const QUICK_QUESTIONS: Array<{ intent: Exclude<TutorIntent, "free">; label: string }> = [
  { intent: "why", label: "Why is this step allowed?" },
  { intent: "simpler", label: "Explain it more simply" },
  { intent: "alternative", label: "Is there another way?" },
  { intent: "skip", label: "What if I skip it?" },
];
