import { type Rat, isInt, isZero, neg, sign } from "./rational";

/** LaTeX for a rational: `3`, `-\frac{1}{2}`. */
export function ratLatex(r: Rat): string {
  if (isInt(r)) return String(r.n);
  const s = r.n < 0 ? "-" : "";
  return `${s}\\frac{${Math.abs(r.n)}}{${r.d}}`;
}

/** Plain-text rational for the expression parser: `3`, `-1/2`. */
export function ratAscii(r: Rat): string {
  return isInt(r) ? String(r.n) : `(${r.n}/${r.d})`;
}

/** Wrap negatives in parentheses: `(-2)`, `\left(\frac{1}{2}\right)`. */
export function ratParen(r: Rat): string {
  if (sign(r) < 0 || !isInt(r)) return `\\left(${ratLatex(r)}\\right)`;
  return ratLatex(r);
}

type Term = { coeff: Rat; power: number };

function termBody(coeff: Rat, power: number, v: string): string {
  const abs = coeff.n < 0 ? neg(coeff) : coeff;
  const isOne = abs.n === 1 && abs.d === 1;
  const mono = power === 0 ? "" : power === 1 ? v : `${v}^{${power}}`;
  if (power === 0) return ratLatex(abs);
  return `${isOne ? "" : ratLatex(abs)}${mono}`;
}

/** Build `ax^2 + bx + c` style LaTeX, skipping zero terms and tidy signs. */
export function polyLatex(coeffs: Rat[], v: string): string {
  // coeffs[i] is the coefficient of v^i
  const terms: Term[] = coeffs
    .map((coeff, power) => ({ coeff, power }))
    .filter((t) => !isZero(t.coeff))
    .reverse();
  if (terms.length === 0) return "0";
  return terms
    .map((t, i) => {
      const body = termBody(t.coeff, t.power, v);
      if (i === 0) return t.coeff.n < 0 ? `-${body}` : body;
      return t.coeff.n < 0 ? `- ${body}` : `+ ${body}`;
    })
    .join(" ");
}

/** Machine-readable counterpart of {@link polyLatex} for the parser. */
export function polyAscii(coeffs: Rat[], v: string): string {
  const parts = coeffs
    .map((coeff, power) => ({ coeff, power }))
    .filter((t) => !isZero(t.coeff))
    .reverse()
    .map((t) => {
      const c = ratAscii(t.coeff);
      return t.power === 0 ? c : `${c}*${v}^${t.power}`;
    });
  return parts.length ? parts.join("+") : "0";
}

/** `(x - 2)` or `(x + 3)` for root `r`. */
export function linearFactorLatex(r: Rat, v: string): string {
  if (isZero(r)) return v;
  const abs = r.n < 0 ? neg(r) : r;
  return `\\left(${v} ${r.n < 0 ? "+" : "-"} ${ratLatex(abs)}\\right)`;
}

export function linearFactorAscii(r: Rat, v: string): string {
  return `(${v}-(${ratAscii(r)}))`;
}
