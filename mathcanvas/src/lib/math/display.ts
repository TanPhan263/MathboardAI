import { isGeometry } from "./geometry/parse";
import { isMeasure } from "./measure";
import { isConic } from "./conic";
import { isVectorProblem } from "./vector";
import { geometryLatex } from "./geometry/display";
import { relationTex, splitRelation } from "./polynomial";
import { splitSystem } from "./system";

function relation(s: string): string {
  const r = splitRelation(s);
  return r.ok ? relationTex(r.lhs, r.op, r.rhs) : `\\text{${s.replace(/[\\{}$&#%_^~]/g, " ")}}`;
}

/** LaTeX for a problem typed as plain text, so it can go on the board. */
export function sourceLatex(source: string): string {
  if (isGeometry(source) || isMeasure(source) || isConic(source) || isVectorProblem(source)) return geometryLatex(source);
  const parts = splitSystem(source);
  if (parts && parts.length > 1) return `\\begin{cases}${parts.map(relation).join("\\\\")}\\end{cases}`;
  return relation(source);
}
