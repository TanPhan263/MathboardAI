import { L } from "./lang";
import { all, create, type MathNode } from "mathjs";
import type { SolveFailure } from "./types";
import { type Rat, add, div, eq, isZero, mul, rat, ratSqrt, sub } from "./rational";

/** Exact arithmetic: every constant is a fraction, so no float drift. */
export const exact = create(all, { number: "Fraction" });
/** Ordinary floats, for irrational values and graphing. */
export const float = create(all);

const UNICODE: Array<[RegExp, string]> = [
  [/[−–—]/g, "-"],
  [/[×·⋅∙]/g, "*"],
  [/÷/g, "/"],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/√/g, "sqrt"],
  [/≤|⩽|\\le(q)?\b/g, "<="],
  [/≥|⩾|\\ge(q)?\b/g, ">="],
  [/[（]/g, "("],
  [/[）]/g, ")"],
  [/\s+/g, " "],
];

/** Clean up typed or recognised maths into mathjs syntax. */
export function normalizeInput(raw: string): string {
  let s = raw.trim();
  for (const [re, to] of UNICODE) s = s.replace(re, to);
  return s;
}

export type RelOp = "=" | "<" | ">" | "<=" | ">=";

export const fail = (
  code: SolveFailure["code"],
  message: string,
  suggestion: string,
): SolveFailure => ({ ok: false, code, message, suggestion });

/** Split `lhs op rhs` on exactly one relation sign. */
export function splitRelation(
  raw: string,
): { ok: true; lhs: string; op: RelOp; rhs: string } | SolveFailure {
  const input = normalizeInput(raw);
  if (!input) {
    return fail("empty", L({ en: "There is nothing to solve yet.", vi: "Chưa có gì để giải." }), L({ en: "Type an equation such as x^2 - 5x + 6 = 0.", vi: "Hãy viết một phương trình, ví dụ x^2 - 5x + 6 = 0." }));
  }
  const parts = input.split(/(<=|>=|<|>|=)/);
  if (parts.length !== 3 || !parts[0].trim() || !parts[2].trim()) {
    return fail(
      "parse",
      L({ en: "I expected exactly one “=”, “<”, “>”, “≤” or “≥” sign.", vi: "Cần đúng một dấu “=”, “<”, “>”, “≤” hoặc “≥”." }),
      L({ en: "Write it like 2x + 3 = 11 or 2x + 3 < 11. For a system, separate equations with “;”.", vi: "Viết dạng 2x + 3 = 11 hoặc 2x + 3 < 11. Với hệ phương trình, ngăn cách các phương trình bằng “;”." }),
    );
  }
  return { ok: true, lhs: parts[0].trim(), op: parts[1] as RelOp, rhs: parts[2].trim() };
}

/** Names that are constants/functions rather than unknowns. */
const isReserved = (name: string) => name in exact;

export function collectVariables(node: MathNode): Set<string> {
  const names = new Set<string>();
  node.traverse((n, path, parent) => {
    if (n.type !== "SymbolNode") return;
    if (parent?.type === "FunctionNode" && path === "fn") return;
    const name = (n as unknown as { name: string }).name;
    if (!isReserved(name)) names.add(name);
  });
  return names;
}

export function parseExpr(expr: string): MathNode | null {
  try {
    return exact.parse(expr);
  } catch {
    return null;
  }
}

function toRat(value: unknown): Rat | null {
  if (!exact.isFraction(value)) return null;
  const f = value as unknown as { s: unknown; n: unknown; d: unknown };
  return rat(Number(f.s) * Number(f.n), Number(f.d));
}

/** Evaluate exactly; null on non-rational results or domain errors. */
export function evalExact(node: MathNode, scope: Record<string, Rat>): Rat | null {
  try {
    const s: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(scope)) s[k] = exact.fraction(v.n, v.d);
    return toRat(node.compile().evaluate(s));
  } catch {
    return null;
  }
}

export type Poly = {
  /** Coefficients, index = power: [c, b, a]. Always length 3. */
  coeffs: [Rat, Rat, Rat];
  degree: 0 | 1 | 2;
};

/** Integers 0, 1, −1, 2, −2, … */
function* samplePoints(): Generator<number> {
  yield 0;
  for (let k = 1; k < 60; k++) {
    yield k;
    yield -k;
  }
}

/**
 * Recover a polynomial of degree ≤ 2 from exact evaluations. Three points fix
 * the candidate; three more must agree, so anything that is not genuinely a
 * low-degree polynomial is rejected instead of mis-solved.
 *
 * `strict`: every sample must evaluate (polynomials are defined everywhere).
 * Otherwise points where `f` is undefined are skipped (rational expressions).
 */
export function fitPoly(
  f: (x: Rat) => Rat | null,
  strict: boolean,
): { ok: true; poly: Poly } | { ok: false; reason: "undefined" | "degree" } {
  const pts: Array<[number, Rat]> = [];
  for (const k of samplePoints()) {
    const y = f(rat(k));
    if (!y) {
      if (strict) return { ok: false, reason: "undefined" };
      continue;
    }
    pts.push([k, y]);
    if (pts.length === 6) break;
  }
  if (pts.length < 6) return { ok: false, reason: "undefined" };

  // Newton divided differences on the first three points.
  const [[x0, y0], [x1, y1], [x2, y2]] = pts;
  const f01 = div(sub(y1, y0), rat(x1 - x0));
  const f12 = div(sub(y2, y1), rat(x2 - x1));
  const f012 = div(sub(f12, f01), rat(x2 - x0));
  const a = f012;
  const b = sub(f01, mul(f012, rat(x0 + x1)));
  const c = add(sub(y0, mul(f01, rat(x0))), mul(f012, rat(x0 * x1)));

  for (const [k, y] of pts.slice(3)) {
    const predicted = add(add(mul(a, rat(k * k)), mul(b, rat(k))), c);
    if (!eq(y, predicted)) return { ok: false, reason: "degree" };
  }
  const degree = !isZero(a) ? 2 : !isZero(b) ? 1 : 0;
  return { ok: true, poly: { coeffs: [c, b, a], degree } };
}

export const evalPoly = (p: Poly, x: Rat) =>
  add(add(mul(p.coeffs[2], mul(x, x)), mul(p.coeffs[1], x)), p.coeffs[0]);

export const evalPolyFloat = (p: Poly, x: number) => {
  const [c, b, a] = p.coeffs.map((r) => r.n / r.d);
  return a * x * x + b * x + c;
};

export type Analysis = {
  ok: true;
  variable: string;
  lhs: string;
  rhs: string;
  op: RelOp;
  poly: Poly;
};

/** Parse both sides and find the single unknown. */
export function parseSides(
  lhs: string,
  rhs: string,
): { ok: true; lNode: MathNode; rNode: MathNode; variable: string } | SolveFailure {
  const lNode = parseExpr(lhs);
  const rNode = parseExpr(rhs);
  if (!lNode || !rNode) {
    return fail(
      "parse",
      L({ en: "I couldn't read that expression.", vi: "Không đọc được biểu thức này." }),
      L({ en: "Check brackets and operators. Use * for multiplication if unsure, e.g. 3*x.", vi: "Kiểm tra dấu ngoặc và phép toán. Nếu chưa chắc, dùng * cho phép nhân, ví dụ 3*x." }),
    );
  }
  const vars = new Set([...collectVariables(lNode), ...collectVariables(rNode)]);
  if (vars.size > 1) {
    return fail(
      "unsupported",
      L({ en: `This has several unknowns (${[...vars].join(", ")}).`, vi: `Bài này có nhiều ẩn (${[...vars].join(", ")}).` }),
      L({ en: "To solve for several unknowns, write a system: one equation per unknown, separated by “;”.", vi: "Để giải nhiều ẩn, hãy viết thành hệ: mỗi ẩn một phương trình, ngăn cách bằng “;”." }),
    );
  }
  if (vars.size === 0) {
    return fail("unsupported", L({ en: "There's no unknown to solve for.", vi: "Không có ẩn để giải." }), L({ en: "Add a variable such as x, or try an example.", vi: "Thêm một ẩn như x, hoặc thử một ví dụ." }));
  }
  return { ok: true, lNode, rNode, variable: [...vars][0] };
}

/**
 * Parse `lhs op rhs` and recover f(x) = lhs − rhs as a polynomial of degree ≤ 2.
 * Works for both equations and inequalities (the relation is kept in `op`).
 */
export function analyzeRelation(raw: string): Analysis | SolveFailure {
  const rel = splitRelation(raw);
  if (!rel.ok) return rel;
  const sides = parseSides(rel.lhs, rel.rhs);
  if (!sides.ok) return sides;
  const { lNode, rNode, variable } = sides;

  const fit = fitPoly((x) => {
    const l = evalExact(lNode, { [variable]: x });
    const r = evalExact(rNode, { [variable]: x });
    return l && r ? sub(l, r) : null;
  }, true);

  if (!fit.ok) {
    return fit.reason === "undefined"
      ? fail(
          "unsupported",
          L({ en: "This has the unknown under a root or another form I can't solve exactly yet.", vi: "Ẩn nằm dưới dấu căn, trong hàm số (sin, log…) hoặc ở dạng mình chưa giải chính xác được." }),
          L({ en: "I handle linear and quadratic equations, inequalities, systems, and equations with x in a denominator.", vi: "Mình giải được phương trình và bất phương trình bậc nhất, bậc hai, hệ phương trình bậc nhất, và phương trình chứa ẩn ở mẫu." }),
        )
      : fail(
          "unsupported",
          L({ en: "This looks higher than quadratic, or isn't a polynomial.", vi: "Biểu thức này có bậc cao hơn 2, hoặc không phải đa thức (ví dụ ẩn ở số mũ hay trong trị tuyệt đối)." }),
          L({ en: "I currently handle up to x². Try simplifying or factoring first.", vi: "Hiện mình chỉ giải đến bậc hai (x²). Hãy thử rút gọn hoặc phân tích thành nhân tử trước." }),
        );
  }
  return { ok: true, variable, lhs: rel.lhs, rhs: rel.rhs, op: rel.op, poly: fit.poly };
}

/** Equation-only wrapper used by the polynomial solver. */
export function analyzeEquation(raw: string): Analysis | SolveFailure {
  const an = analyzeRelation(raw);
  if (an.ok && an.op !== "=") {
    return fail("parse", L({ en: "That's an inequality, not an equation.", vi: "Đây là bất phương trình, không phải phương trình." }), L({ en: "Use “=” for an equation.", vi: "Dùng dấu “=” cho phương trình." }));
  }
  return an;
}

export type RootSet =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "finite"; values: number[] };

const TOL = 1e-9;

/** Real solution set of poly = 0. */
export function realRoots(poly: Poly): RootSet {
  const [c, b, a] = poly.coeffs;
  if (poly.degree === 0) return isZero(c) ? { kind: "all" } : { kind: "none" };
  if (poly.degree === 1) {
    return { kind: "finite", values: [-(c.n / c.d) / (b.n / b.d) || 0] };
  }
  const D = sub(mul(b, b), mul(rat(4), mul(a, c)));
  if (D.n < 0) return { kind: "none" };
  const A = a.n / a.d;
  const B = b.n / b.d;
  const exactSq = ratSqrt(D);
  const root = exactSq ? exactSq.n / exactSq.d : Math.sqrt(D.n / D.d);
  const values = [(-B - root) / (2 * A), (-B + root) / (2 * A)]
    .map((v) => v + 0)
    .sort((x, y) => x - y)
    .filter((v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]) > TOL);
  return { kind: "finite", values };
}

/** Exact real roots of a polynomial when they are rational. */
export function rationalRoots(poly: Poly): Rat[] | null {
  const [c, b, a] = poly.coeffs;
  if (poly.degree === 1) return [div(sub(rat(0), c), b)];
  if (poly.degree !== 2) return null;
  const D = sub(mul(b, b), mul(rat(4), mul(a, c)));
  if (D.n < 0) return [];
  const sq = ratSqrt(D);
  if (!sq) return null;
  const twoA = mul(rat(2), a);
  const r1 = div(sub(sub(rat(0), b), sq), twoA);
  const r2 = div(add(sub(rat(0), b), sq), twoA);
  return eq(r1, r2) ? [r1] : [r1, r2].sort((p, q) => p.n / p.d - q.n / q.d);
}

export function sameRootSet(x: RootSet, y: RootSet): boolean {
  if (x.kind !== y.kind) return false;
  if (x.kind !== "finite" || y.kind !== "finite") return true;
  return (
    x.values.length === y.values.length &&
    x.values.every((v, i) => Math.abs(v - y.values[i]) <= 1e-7 * Math.max(1, Math.abs(v)))
  );
}

/** Parse a learner's answer such as "x = 2 or x = 3", "1/2, sqrt(2)". */
/**
 * A learner's answer with Vietnamese words read as their English counterparts
 * ("x = 1 hoặc x = 2", "vô nghiệm", "vô số nghiệm"), and a decimal comma as a point.
 */
export function answerText(raw: string): string {
  return normalizeInput(raw)
    .toLowerCase()
    .replace(/(phương trình|pt|hệ|bất phương trình|bpt)\s+/g, "")
    .replace(/vô số nghiệm|có vô số nghiệm/g, "infinitely many")
    .replace(/vô nghiệm|không có nghiệm/g, "no solution")
    // \b doesn't count "ặ" or "à" as letters, so match the words by the spaces around them.
    .replace(/(^|\s)hoặc(?=\s|$)/g, " or ")
    .replace(/(^|\s)và(?=\s|$)/g, " and ")
    .replace(/(\d),(\d)/g, "$1.$2")
    .trim();
}

export function parseAnswerValues(raw: string): number[] | "none" | null {
  const text = answerText(raw);
  if (/^(no (real )?(solutions?|roots?)|none|∅)$/.test(text)) return "none";
  const parts = text
    .split(/,|;|\bor\b|\band\b/)
    .map((p) => p.replace(/^[a-z]\s*=\s*/, "").replace(/^±/, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const values: number[] = [];
  for (const p of parts) {
    try {
      const n = Number(float.evaluate(p));
      if (!Number.isFinite(n)) return null;
      values.push(n);
    } catch {
      return null;
    }
  }
  return values;
}

/** Exact LHS/RHS at a rational point, or null if not exactly representable. */
export function evaluateSides(
  analysis: Pick<Analysis, "variable" | "lhs" | "rhs">,
  at: Rat,
): { lhs: Rat; rhs: Rat } | null {
  const l = parseExpr(analysis.lhs);
  const r = parseExpr(analysis.rhs);
  if (!l || !r) return null;
  const lhs = evalExact(l, { [analysis.variable]: at });
  const rhs = evalExact(r, { [analysis.variable]: at });
  return lhs && rhs ? { lhs, rhs } : null;
}

/** Floating-point LHS/RHS (used for irrational roots and graphs). */
export function evaluateSidesFloat(
  analysis: Pick<Analysis, "variable" | "lhs" | "rhs">,
  at: number,
): { lhs: number; rhs: number } {
  const scope = { [analysis.variable]: at };
  try {
    return {
      lhs: Number(float.evaluate(analysis.lhs, scope)),
      rhs: Number(float.evaluate(analysis.rhs, scope)),
    };
  } catch {
    return { lhs: NaN, rhs: NaN };
  }
}

/** LaTeX for an expression using mathjs' printer, tidied. */
export function toTex(expr: string): string {
  try {
    return exact
      .parse(expr)
      .toTex({ parenthesis: "keep", implicit: "hide" })
      .replace(/~\s*/g, "")
      // mathjs prints some one-letter names (t, s…) upright: \mathrm{t} → t.
      .replace(/\\mathrm\{([a-zA-Z])\}/g, "$1")
      .replace(/\{\s*([a-zA-Z])\s*\}/g, "$1");
  } catch {
    return expr;
  }
}

export const OP_TEX: Record<RelOp, string> = { "=": "=", "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge" };

export function relationTex(lhs: string, op: RelOp, rhs: string): string {
  return `${toTex(lhs)} ${OP_TEX[op]} ${toTex(rhs)}`;
}
