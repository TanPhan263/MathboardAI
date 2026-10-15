import { L } from "./lang";
import type { MathNode } from "mathjs";
import {
  type Poly,
  evalExact,
  fail,
  fitPoly,
  parseSides,
  evalPoly,
  rationalRoots,
  realRoots,
  splitRelation,
} from "./polynomial";
import { linearFactorLatex, polyLatex, ratLatex } from "./latex";
import { type Rat, ONE, div, eq, isZero, mul, rat, sub } from "./rational";
import type { SolveFailure } from "./types";

/** One factor of the least common denominator, e.g. (x − 2) or (x² + 1). */
export type DenFactor = {
  /** Monic polynomial. */
  poly: Poly;
  power: number;
  /** Exact root when linear. */
  root: Rat | null;
};

export type RationalAnalysis = {
  ok: true;
  variable: string;
  lhs: string;
  rhs: string;
  /** Values the unknown may not take (a denominator would be 0). */
  restrictions: Array<{ exact: Rat | null; value: number }>;
  lcd: DenFactor[];
  /** (lhs − rhs) · LCD — a polynomial once the fractions are cleared. */
  cleared: Poly;
};

function hasVariable(node: MathNode, v: string): boolean {
  let found = false;
  node.traverse((n) => {
    if (n.type === "SymbolNode" && (n as unknown as { name: string }).name === v) found = true;
  });
  return found;
}

function denominatorsOf(node: MathNode, v: string): MathNode[] {
  const out: MathNode[] = [];
  node.traverse((n) => {
    const op = n as unknown as { type: string; fn?: string; args?: MathNode[] };
    if (op.type === "OperatorNode" && op.fn === "divide" && op.args && hasVariable(op.args[1], v)) {
      out.push(op.args[1]);
    }
  });
  return out;
}

const monic = (p: Poly): Poly => {
  const lead = p.coeffs[p.degree];
  return { ...p, coeffs: p.coeffs.map((c) => div(c, lead)) as Poly["coeffs"] };
};

const linear = (root: Rat): Poly => ({ coeffs: [sub(rat(0), root), ONE, rat(0)], degree: 1 });

const polyKey = (p: Poly) => p.coeffs.map((c) => `${c.n}/${c.d}`).join(",");

/** Split a polynomial into monic irreducible factors over the rationals. */
function factorize(p: Poly): DenFactor[] {
  if (p.degree === 0) return [];
  const roots = rationalRoots(p);
  if (p.degree === 1 && roots) return [{ poly: linear(roots[0]), power: 1, root: roots[0] }];
  if (roots && roots.length === 2) {
    return roots.map((r) => ({ poly: linear(r), power: 1, root: r }));
  }
  if (roots && roots.length === 1) return [{ poly: linear(roots[0]), power: 2, root: roots[0] }];
  return [{ poly: monic(p), power: 1, root: null }];
}

/** LaTeX for the LCD as a product of factors. */
export function lcdLatex(lcd: DenFactor[], v: string): string {
  return lcd
    .map((f) => {
      const base = f.root ? linearFactorLatex(f.root, v) : `\\left(${polyLatex(f.poly.coeffs, v)}\\right)`;
      return f.power > 1 ? `${base}^{${f.power}}` : base;
    })
    .join("");
}

/** Is this an equation with the unknown in a denominator? */
export function isRationalEquation(raw: string): boolean {
  const rel = splitRelation(raw);
  if (!rel.ok || rel.op !== "=") return false;
  const sides = parseSides(rel.lhs, rel.rhs);
  if (!sides.ok) return false;
  return [...denominatorsOf(sides.lNode, sides.variable), ...denominatorsOf(sides.rNode, sides.variable)].length > 0;
}

/**
 * Analyse an equation like 1/x + 1/(x+1) = 1/2: find the restrictions, the
 * least common denominator, and the polynomial left after multiplying by it.
 */
export function analyzeRational(raw: string): RationalAnalysis | SolveFailure {
  const rel = splitRelation(raw);
  if (!rel.ok) return rel;
  if (rel.op !== "=") {
    return fail(
      "unsupported",
      L({ en: "Inequalities with the unknown in a denominator aren't supported yet.", vi: "Chưa hỗ trợ bất phương trình chứa ẩn ở mẫu." }),
      L({ en: "Try an equation, or an inequality without fractions in x.", vi: "Hãy thử một phương trình, hoặc bất phương trình không có ẩn ở mẫu." }),
    );
  }
  const sides = parseSides(rel.lhs, rel.rhs);
  if (!sides.ok) return sides;
  const { lNode, rNode, variable: v } = sides;

  const dens = [...denominatorsOf(lNode, v), ...denominatorsOf(rNode, v)];
  const factors = new Map<string, DenFactor>();
  for (const d of dens) {
    const fit = fitPoly((x) => evalExact(d, { [v]: x }), true);
    if (!fit.ok) {
      return fail(
        "unsupported",
        L({ en: "One of the denominators is more complicated than I can handle yet.", vi: "Có một mẫu số phức tạp hơn mức mình xử lý được." }),
        L({ en: "Keep each denominator to a linear or quadratic expression in x.", vi: "Mỗi mẫu số nên là biểu thức bậc nhất hoặc bậc hai của x." }),
      );
    }
    for (const f of factorize(fit.poly)) {
      const key = polyKey(f.poly);
      const prev = factors.get(key);
      if (!prev || prev.power < f.power) factors.set(key, f);
    }
  }
  const lcd = [...factors.values()];

  const restrictions: RationalAnalysis["restrictions"] = [];
  for (const f of lcd) {
    if (f.root) restrictions.push({ exact: f.root, value: f.root.n / f.root.d });
    else {
      const set = realRoots(f.poly);
      if (set.kind === "finite") for (const value of set.values) restrictions.push({ exact: null, value });
    }
  }
  restrictions.sort((a, b) => a.value - b.value);

  const lcdAt = (x: Rat): Rat => {
    let acc = ONE;
    for (const f of lcd) {
      const y = evalPoly(f.poly, x);
      for (let i = 0; i < f.power; i++) acc = mul(acc, y);
    }
    return acc;
  };

  const cleared = fitPoly((x) => {
    const l = evalExact(lNode, { [v]: x });
    const r = evalExact(rNode, { [v]: x });
    if (!l || !r) return null;
    const d = lcdAt(x);
    return isZero(d) ? null : mul(sub(l, r), d);
  }, false);

  if (!cleared.ok) {
    return fail(
      "unsupported",
      L({ en: "After clearing the fractions this becomes higher than quadratic.", vi: "Sau khi khử mẫu, phương trình có bậc cao hơn 2." }),
      L({ en: "I can solve it when multiplying by the common denominator leaves at most an x² equation.", vi: "Mình giải được khi nhân với mẫu thức chung cho ra phương trình có bậc không quá 2." }),
    );
  }
  return { ok: true, variable: v, lhs: rel.lhs, rhs: rel.rhs, restrictions, lcd, cleared: cleared.poly };
}

/** Is `value` one of the forbidden values? */
export function isRestricted(an: RationalAnalysis, value: number, exactValue: Rat | null): boolean {
  return an.restrictions.some((r) =>
    r.exact && exactValue ? eq(r.exact, exactValue) : Math.abs(r.value - value) < 1e-9,
  );
}

export function restrictionLatex(an: RationalAnalysis): string {
  if (an.restrictions.length === 0) return `\\text{${L({ en: "no restrictions", vi: "không có điều kiện" })}}`;
  return an.restrictions
    .map((r) => `${an.variable} \\neq ${r.exact ? ratLatex(r.exact) : r.value.toFixed(4)}`)
    .join(",\\; ");
}
