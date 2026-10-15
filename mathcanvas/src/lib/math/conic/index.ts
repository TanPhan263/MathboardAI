import type { AnswerCheck } from "../check";
import { clean, fitQuad } from "../geometry/parse";
import type { GraphCurve, GraphMark, GraphSpec } from "../graph";
import { L } from "../lang";
import { MeasureError, Steps, type Text, close, measureTex, oops, toFraction } from "../measure/num";
import { float, normalizeInput } from "../polynomial";
import { type Rat, add, div, isZero, mul, neg, rat, sign, sub, toNumber } from "../rational";
import { finalize } from "../steps";
import { asRat, sqrtOf, surdLatex } from "../surd";
import type { MathSolution, SolveFailure, SolveResult } from "../types";

/**
 * Grade 10 conics in standard (chính tắc) position: the ellipse
 * x²/a² + y²/b² = 1, the hyperbola x²/a² − y²/b² = 1 and the parabola
 * y² = 2px — their elements from an equation, the equation from given
 * elements or points, and focal radii of a point on the curve. a², b², c²
 * and p are exact rationals; a, b, c may be square roots.
 */

export type Conic =
  | { kind: "ellipse" | "hyperbola"; axis: "x" | "y"; a2: Rat; b2: Rat }
  /** y² = k·x (axis x) or x² = k·y (axis y); k = 2p. */
  | { kind: "parabola"; axis: "x" | "y"; k: Rat };

export type ConicAnswer = { key: string; latex: string; value: number | null; pts?: number[][]; conic?: Conic };

const ELLIPSE = /(?<!\p{L})(?:elip|e-líp|ellipse)(?!\p{L})/iu;
const HYPERBOLA = /(?<!\p{L})(?:hypebol|hyperbol|hyperbola|hi-pe-bôn)(?!\p{L})/iu;
const PARABOLA = /(?<!\p{L})(?:parabol|parabola)(?!\p{L})/iu;
const PARABOLA_CUES = /chính tắc|tiêu điểm|đường chuẩn|tham số tiêu|focus|directrix|standard|canonical/iu;

/* ───────────────────────────── Reading ───────────────────────────── */

/** The “… = …” equations in a text, in x and y. */
function equations(s: string): Array<{ text: string; name: string | null }> {
  const out: Array<{ text: string; name: string | null }> = [];
  const ok = /[\sxy\d^+\-*/().²]|sqrt/;
  for (let i = s.indexOf("="); i >= 0; i = s.indexOf("=", i + 1)) {
    let a = i;
    while (a > 0 && ok.test(s[a - 1]) && s[a - 1] !== ":") a--;
    let b = i + 1;
    while (b < s.length && (ok.test(s[b]) || s.startsWith("sqrt", b))) b += s.startsWith("sqrt", b) ? 4 : 1;
    const text = s.slice(a, b).replace(/[\s.]+$/, "").trim();
    if (!/[xy]/.test(text) || !/=\s*\S/.test(text)) continue;
    const name = s.slice(Math.max(0, a - 8), a).match(/\(([A-Za-z])\)\s*:\s*$/)?.[1] ?? null;
    out.push({ text, name });
  }
  return out;
}

/** The conic an equation describes, or why it isn't one we handle. */
export function conicOf(text: string): Conic | Text | null {
  const parts = normalizeInput(text).replace(/²/g, "^2").split("=");
  if (parts.length !== 2) return null;
  const q = fitQuad(parts[0], parts[1]);
  if (!q || q.mixed || !isZero(q.sq[2]) || !isZero(q.lin[2])) return null;
  const [A, B] = q.sq;
  const [D, E] = q.lin;
  if (!isZero(A) && !isZero(B)) {
    if (!isZero(D) || !isZero(E)) return { en: "This conic is shifted from the origin; only standard (chính tắc) equations are covered.", vi: "Đường conic này không ở vị trí chính tắc (tâm không ở gốc tọa độ)." };
    if (isZero(q.c0)) return null;
    // A·x² + B·y² = −c0  ⇒  x²/P + y²/Q = 1.
    const P = div(neg(q.c0), A);
    const Q = div(neg(q.c0), B);
    if (sign(P) > 0 && sign(Q) > 0) {
      if (P.n * Q.d === Q.n * P.d) return null; // a circle
      return toNumber(P) > toNumber(Q) ? { kind: "ellipse", axis: "x", a2: P, b2: Q } : { kind: "ellipse", axis: "y", a2: Q, b2: P };
    }
    if (sign(P) > 0 && sign(Q) < 0) return { kind: "hyperbola", axis: "x", a2: P, b2: neg(Q) };
    if (sign(P) < 0 && sign(Q) > 0) return { kind: "hyperbola", axis: "y", a2: Q, b2: neg(P) };
    return null;
  }
  if (!isZero(B) && isZero(A)) {
    if (!isZero(E) || !isZero(q.c0) || isZero(D)) return null;
    return { kind: "parabola", axis: "x", k: div(neg(D), B) };
  }
  if (!isZero(A) && isZero(B)) {
    if (!isZero(D) || !isZero(q.c0) || isZero(E)) return null;
    return { kind: "parabola", axis: "y", k: div(neg(E), A) };
  }
  return null;
}

export function isConic(raw: string): boolean {
  const s = raw.normalize("NFC");
  if (ELLIPSE.test(s) || HYPERBOLA.test(s)) return true;
  if (PARABOLA.test(s) && PARABOLA_CUES.test(s)) return true;
  if (/(?<![\p{L}\d])z(?![\p{L}])|oxyz/iu.test(s)) return false;
  return equations(clean(s)).some((e) => {
    const c = conicOf(e.text);
    return c !== null && "kind" in c && (c.kind !== "parabola" || /^\s*[xy]\s*\^\s*2\s*=/.test(normalizeInput(e.text).replace(/²/g, "^2")));
  });
}

/** A number as written: 5, 2,5, 3/2, 2√5, √3/2. */
function num(t: string): number | null {
  const s = normalizeInput(t).replace(/(\d),(\d)/g, "$1.$2").replace(/sqrt\s*(\d+(?:\.\d+)?)/g, "sqrt($1)").replace(/(\d)\s*(?=sqrt)/g, "$1*");
  try {
    const v = Number(float.evaluate(s));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
/** x² as an exact fraction (a² = 5 from a = √5). */
const sq = (x: number): Rat | null => {
  const f = toFraction(x * x);
  return f ? rat(f.n, f.d) : null;
};
/** x as an exact fraction. */
const fr = (x: number): Rat | undefined => {
  const f = toFraction(x);
  return f ? rat(f.n, f.d) : undefined;
};
const NUM = String.raw`(-?\s*\d*\s*\*?\s*(?:sqrt\s*\(?\d+\)?|\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+)?)`;
const IS = String.raw`\s*(?:bằng|là|=|of|is|:)?\s*`;

/* ───────────────────────────── Writing numbers ───────────────────────────── */

const ratTex = (r: Rat) => (r.d === 1 ? `${r.n}` : `${r.n < 0 ? "-" : ""}\\frac{${Math.abs(r.n)}}{${r.d}}`);
const rootTex = (r: Rat) => surdLatex(sqrtOf(r));
/** A coordinate written exactly. */
const coordTex = (x: number) => (Math.abs(x) < 1e-12 ? "0" : measureTex(x));
const ptTex = (name: string, x: number, y: number) => `${name}\\left(${coordTex(x)}${L({ en: ",\\ ", vi: ";\\ " })}${coordTex(y)}\\right)`;

/** x²/A written the textbook way: \frac{x^2}{25}, \frac{4x^2}{9}. */
function overTex(v: string, A: Rat): string {
  if (A.d === 1) return `\\frac{${v}^2}{${A.n}}`;
  return A.n === 1 ? `${A.d}${v}^2` : `\\frac{${A.d}${v}^2}{${A.n}}`;
}

export function equationTex(c: Conic): string {
  if (c.kind === "parabola") {
    const [l, r] = c.axis === "x" ? ["y", "x"] : ["x", "y"];
    const k = c.k;
    const coef = k.d === 1 ? (k.n === 1 ? "" : k.n === -1 ? "-" : `${k.n}`) : `${k.n < 0 ? "-" : ""}\\frac{${Math.abs(k.n)}}{${k.d}}`;
    return `${l}^2 = ${coef}${r}`;
  }
  const [u, v] = c.axis === "x" ? ["x", "y"] : ["y", "x"];
  if (c.kind === "ellipse") return c.axis === "x" ? `${overTex("x", c.a2)} + ${overTex("y", c.b2)} = 1` : `${overTex("x", c.b2)} + ${overTex("y", c.a2)} = 1`;
  return `${overTex(u, c.a2)} - ${overTex(v, c.b2)} = 1`;
}

const NAME = { ellipse: { en: "ellipse", vi: "elip" }, hyperbola: { en: "hyperbola", vi: "hypebol" }, parabola: { en: "parabola", vi: "parabol" } } as const;
const LETTER = { ellipse: "E", hyperbola: "H", parabola: "P" } as const;

/* ───────────────────────────── Solving ───────────────────────────── */

type Goals = Set<"foci" | "vertices" | "axes" | "focal" | "e" | "asymptotes" | "directrix">;

export type ConicSolution = { steps: Steps; answers: ConicAnswer[]; notes: string[]; conic: Conic; given: Array<{ name: string; x: number; y: number }> };

export function analyzeConic(raw: string): ConicSolution | SolveFailure {
  try {
    return solveText(raw);
  } catch (e) {
    if (e instanceof MeasureError) return { ok: false, code: "unsupported", message: e.message, suggestion: e.suggestion };
    throw e;
  }
}

function solveText(raw: string): ConicSolution {
  const s = clean(raw.normalize("NFC")).replace(/\s+/g, " ");
  const write = /viết phương trình|lập phương trình|tìm phương trình|xác định phương trình|phương trình chính tắc của|write the (?:standard |canonical )?equation|find the (?:standard |canonical )?equation|standard equation of/iu.test(s);
  const eqs = equations(s)
    .map((e) => ({ ...e, c: conicOf(e.text) }))
    .filter((e): e is typeof e & { c: Conic } => e.c !== null && "kind" in e.c);
  const st = new Steps();
  const answers: ConicAnswer[] = [];
  const notes: string[] = [];
  const given: Array<{ name: string; x: number; y: number }> = [];
  let conic: Conic;
  if (!write && eqs.length) {
    conic = eqs[0].c;
    const named = eqs[0].name ? `(${eqs[0].name}): ` : "";
    const std = equationTex(conic);
    const typed = normalizeInput(eqs[0].text).replace(/\s+/g, "");
    const plainStd = std.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2").replace(/[{}\\\s]/g, "");
    if (typed.replace(/\(|\)|\*/g, "") !== plainStd.replace(/\(|\)|\*/g, "")) {
      st.push("standard-form", { en: "Standard form", vi: "Đưa về dạng chính tắc" }, `${named}${texOfTyped(eqs[0].text)} \\Leftrightarrow ${std}`,
        { en: conic.kind === "parabola" ? "Solve for the squared variable." : "Divide both sides by the constant so the right side is 1.", vi: conic.kind === "parabola" ? "Biểu diễn theo biến bình phương." : "Chia hai vế cho hằng số để vế phải bằng 1." },
        { en: "Elements are read from the standard (chính tắc) form.", vi: "Các yếu tố được đọc từ phương trình chính tắc." },
        { en: "Make the right-hand side 1.", vi: "Làm cho vế phải bằng 1." });
    }
    elements(conic, goalsIn(s), st, answers);
    pointGoals(s, conic, st, answers, given);
  } else {
    const k = ELLIPSE.test(s) ? "ellipse" : HYPERBOLA.test(s) ? "hyperbola" : PARABOLA.test(s) ? "parabola" : eqs[0]?.c.kind;
    if (!k) oops({ en: "I couldn't tell which conic this is.", vi: "Chưa nhận ra đây là đường conic nào." }, { en: "Say “elip”, “hypebol” or “parabol”, or give its equation.", vi: "Ghi rõ “elip”, “hypebol” hoặc “parabol”, hoặc cho phương trình." });
    conic = k === "parabola" ? writeParabola(s, st, given) : writeCentral(k!, s, st, given);
    answers.push({ key: "eq", latex: `(${LETTER[conic.kind]}): ${equationTex(conic)}`, value: null, conic });
    // “…, tìm tiêu điểm và đường chuẩn”: elements asked after the equation (not the ones given as data).
    const asked = [...s.matchAll(/(?:tìm|tính|xác định|find|determine|compute)\s+([^.;]*)/giu)].map((m) => m[1]).filter((t) => !/phương trình|equation/iu.test(t));
    const extra = goalsIn(asked.join(" "));
    if (asked.length && extra.size) elements(conic, extra, st, answers);
  }
  return { steps: st, answers, notes, conic, given };
}

function texOfTyped(text: string): string {
  return normalizeInput(text)
    .replace(/²/g, "^2")
    .replace(/\(?([xy])\^2\)?\s*\/\s*(\d+)/g, "\\frac{$1^2}{$2}")
    .replace(/\*/g, "")
    .replace(/sqrt\(?(\d+)\)?/g, "\\sqrt{$1}");
}

function goalsIn(s: string): Goals {
  const g: Goals = new Set();
  if (/yếu tố|elements/iu.test(s)) return g;
  if (/tiêu điểm|foci|focus/iu.test(s)) g.add("foci");
  if (/đỉnh|vertices|vertex/iu.test(s)) g.add("vertices");
  if (/trục lớn|trục nhỏ|trục thực|trục ảo|độ dài các trục|major axis|minor axis|transverse|conjugate|axes/iu.test(s)) g.add("axes");
  if (/tiêu cự|focal length|focal distance/iu.test(s)) g.add("focal");
  if (/tâm sai|eccentricity/iu.test(s)) g.add("e");
  if (/tiệm cận|asymptote/iu.test(s)) g.add("asymptotes");
  if (/đường chuẩn|directrix/iu.test(s)) g.add("directrix");
  return g;
}

/** a, b, c (or p) and every element of the conic; answers for those asked (all, if none is named). */
function elements(c: Conic, asked: Goals, st: Steps, answers: ConicAnswer[]) {
  const all = asked.size === 0;
  const want =(g: "foci" | "vertices" | "axes" | "focal" | "e" | "asymptotes" | "directrix") => all || asked.has(g);
  const sw = (x: number, y: number): [number, number] => (c.axis === "x" ? [x, y] : [y, x]);
  if (c.kind === "parabola") {
    const p = div(c.k, rat(2));
    const f = div(p, rat(2));
    const fv = toNumber(f);
    const [fx, fy] = sw(fv, 0);
    const dir = `${c.axis === "x" ? "x" : "y"} = ${ratTex(neg(f))}`;
    st.push("formula", { en: "Parameter p", vi: "Tham số tiêu p" },
      `${equationTex(c)} = 2p${c.axis === "x" ? "x" : "y"}\\ \\Rightarrow\\ 2p = ${ratTex(c.k)},\\ p = ${ratTex(p)}\\\\ F${coordPair(fx, fy)},\\quad \\Delta:\\ ${dir}`,
      { en: `Compare with y² = 2px: the focus is F(p/2; 0) and the directrix is x = −p/2.`, vi: `So sánh với y² = 2px: tiêu điểm F(p/2; 0), đường chuẩn x = −p/2.` },
      { en: "Every point of a parabola is as far from the focus as from the directrix.", vi: "Mọi điểm của parabol cách đều tiêu điểm và đường chuẩn." },
      { en: "Write the equation as y² = 2px.", vi: "Viết phương trình dạng y² = 2px." });
    if (sign(p) < 0) st.push("relation", { en: "Not standard", vi: "Chưa chính tắc" }, `p = ${ratTex(p)} < 0`, { en: "p is negative, so this parabola opens the other way; the standard form needs p > 0.", vi: "p âm nên parabol quay bề lõm sang phía ngược lại; dạng chính tắc cần p > 0." }, { en: "Standard form: y² = 2px with p > 0.", vi: "Dạng chính tắc: y² = 2px với p > 0." }, { en: "Check the sign.", vi: "Kiểm tra dấu." });
    if (all || asked.has("foci")) answers.push({ key: "focus", latex: `F${coordPair(fx, fy)}`, value: null, pts: [[fx, fy]] });
    if (all || asked.has("directrix")) answers.push({ key: "directrix", latex: `\\Delta:\\ ${dir}`, value: -fv });
    if (all) answers.push({ key: "p", latex: `p = ${ratTex(p)}`, value: toNumber(p) });
    verifyParabola(c, st);
    return;
  }
  const ell = c.kind === "ellipse";
  const c2 = ell ? sub(c.a2, c.b2) : add(c.a2, c.b2);
  const [a, b, cc] = [c.a2, c.b2, c2].map((r) => Math.sqrt(toNumber(r)));
  const e = cc / a;
  const [A, B, C] = [rootTex(c.a2), rootTex(c.b2), rootTex(c2)];
  st.push("formula", { en: "a, b, c", vi: "Tính a, b, c" },
    `a^2 = ${ratTex(c.a2)},\\ b^2 = ${ratTex(c.b2)}\\ \\Rightarrow\\ a = ${A},\\ b = ${B}\\\\ c^2 = a^2 ${ell ? "-" : "+"} b^2 = ${ratTex(c2)}\\ \\Rightarrow\\ c = ${C}`,
    { en: ell ? "For an ellipse c² = a² − b²." : "For a hyperbola c² = a² + b².", vi: ell ? "Với elip: c² = a² − b²." : "Với hypebol: c² = a² + b²." },
    { en: "c is half the distance between the foci.", vi: "c là nửa khoảng cách giữa hai tiêu điểm." },
    { en: "Read a² and b² from the denominators.", vi: "Đọc a², b² ở mẫu số." });
  const F = [sw(-cc, 0), sw(cc, 0)];
  const V = [sw(-a, 0), sw(a, 0)];
  const W = [sw(0, -b), sw(0, b)];
  const rows: string[] = [];
  rows.push(`F_1${coordPair(...F[0])},\\ F_2${coordPair(...F[1])}`);
  rows.push(`A_1${coordPair(...V[0])},\\ A_2${coordPair(...V[1])}${ell ? `,\\ B_1${coordPair(...W[0])},\\ B_2${coordPair(...W[1])}` : ""}`);
  rows.push(ell ? `2a = ${len(2 * a)}\\ (${L({ en: "\\text{major axis}", vi: "\\text{trục lớn}" })}),\\ 2b = ${len(2 * b)}\\ (${L({ en: "\\text{minor axis}", vi: "\\text{trục nhỏ}" })})` : `2a = ${len(2 * a)}\\ (${L({ en: "\\text{transverse axis}", vi: "\\text{trục thực}" })}),\\ 2b = ${len(2 * b)}\\ (${L({ en: "\\text{conjugate axis}", vi: "\\text{trục ảo}" })})`);
  rows.push(`2c = ${len(2 * cc)}\\ (${L({ en: "\\text{focal length}", vi: "\\text{tiêu cự}" })}),\\quad e = \\frac{c}{a} = ${len(e)}`);
  const slope = b / a;
  const asym = c.axis === "x" ? `y = \\pm ${frac(slope)}x` : `y = \\pm ${frac(1 / slope)}x`;
  if (!ell) rows.push(`${L({ en: "\\text{asymptotes: }", vi: "\\text{tiệm cận: }" })}${asym}`);
  st.push("formula", { en: "Elements", vi: "Các yếu tố" }, rows.join("\\\\ "),
    { en: ell ? "Foci (±c; 0), vertices (±a; 0) and (0; ±b), axes 2a and 2b, focal length 2c, eccentricity e = c/a < 1." : "Foci (±c; 0), vertices (±a; 0), axes 2a and 2b, focal length 2c, eccentricity e = c/a > 1, asymptotes y = ±(b/a)x.", vi: ell ? "Tiêu điểm (±c; 0), đỉnh (±a; 0) và (0; ±b), trục lớn 2a, trục nhỏ 2b, tiêu cự 2c, tâm sai e = c/a < 1." : "Tiêu điểm (±c; 0), đỉnh (±a; 0), trục thực 2a, trục ảo 2b, tiêu cự 2c, tâm sai e = c/a > 1, tiệm cận y = ±(b/a)x." },
    { en: c.axis === "x" ? "The standard form puts the foci on Ox." : "Here the larger denominator is under y², so the foci are on Oy.", vi: c.axis === "x" ? "Dạng chính tắc có hai tiêu điểm nằm trên Ox." : "Mẫu lớn hơn nằm dưới y² nên hai tiêu điểm nằm trên Oy." },
    { en: "Which denominator is a²?", vi: "Mẫu nào là a²?" });
  if (want("foci")) answers.push({ key: "foci", latex: `F_1${coordPair(...F[0])},\\ F_2${coordPair(...F[1])}`, value: null, pts: F });
  if (want("vertices")) answers.push({ key: "vertices", latex: `A_1${coordPair(...V[0])},\\ A_2${coordPair(...V[1])}${ell ? `,\\ B_1${coordPair(...W[0])},\\ B_2${coordPair(...W[1])}` : ""}`, value: null, pts: ell ? [...V, ...W] : V });
  if (want("axes")) {
    answers.push({ key: "2a", latex: `2a = ${len(2 * a)}`, value: 2 * a });
    answers.push({ key: "2b", latex: `2b = ${len(2 * b)}`, value: 2 * b });
  }
  if (want("focal")) answers.push({ key: "2c", latex: `2c = ${len(2 * cc)}`, value: 2 * cc });
  if (want("e")) answers.push({ key: "e", latex: `e = ${len(e)}`, value: e });
  if (!ell && want("asymptotes")) answers.push({ key: "asym", latex: asym, value: c.axis === "x" ? slope : 1 / slope });
  if (asked.has("directrix")) {
    const d = (a * a) / cc;
    answers.push({ key: "directrix", latex: `\\Delta_{1,2}:\\ ${c.axis} = \\pm ${len(d)}`, value: d });
  }
  // Check: a vertex on the curve, and the defining property at B2 (or A2).
  const at = ell ? W[1] : V[1];
  const d1 = Math.hypot(at[0] - F[0][0], at[1] - F[0][1]);
  const d2 = Math.hypot(at[0] - F[1][0], at[1] - F[1][1]);
  const ok = close(ell ? d1 + d2 : Math.abs(d1 - d2), 2 * a, 1e-9);
  st.push("verify", { en: "Check", vi: "Kiểm tra" },
    `${ell ? "B_2" : "A_2"}${coordPair(...at)}:\\ ${ell ? "MF_1 + MF_2" : "|MF_1 - MF_2|"} = ${len(ell ? d1 + d2 : Math.abs(d1 - d2))} = 2a`,
    { en: ell ? "Every point of an ellipse has MF₁ + MF₂ = 2a." : "Every point of a hyperbola has |MF₁ − MF₂| = 2a.", vi: ell ? "Mọi điểm của elip có MF₁ + MF₂ = 2a." : "Mọi điểm của hypebol có |MF₁ − MF₂| = 2a." },
    { en: "The definition of the conic, checked at a vertex.", vi: "Kiểm tra định nghĩa của đường conic tại một đỉnh." },
    { en: "Measure the distances from a vertex to both foci.", vi: "Tính khoảng cách từ một đỉnh đến hai tiêu điểm." },
    ok ? "passed" : "failed");
}

function verifyParabola(c: Extract<Conic, { kind: "parabola" }>, st: Steps) {
  const k = toNumber(c.k);
  const x = Math.abs(k);
  const y = Math.sqrt(k * x);
  const [px, py] = c.axis === "x" ? [x, y] : [y, x];
  const f = k / 4;
  const dFocus = c.axis === "x" ? Math.hypot(px - f, py) : Math.hypot(px, py - f);
  const dLine = c.axis === "x" ? Math.abs(px + f) : Math.abs(py + f);
  st.push("verify", { en: "Check", vi: "Kiểm tra" }, `M${coordPair(px, py)}:\\ MF = ${len(dFocus)} = d(M, \\Delta)`,
    { en: "A point of the parabola is as far from the focus as from the directrix.", vi: "Một điểm của parabol cách đều tiêu điểm và đường chuẩn." },
    { en: "The definition of the parabola.", vi: "Định nghĩa parabol." },
    { en: "Take any point of the curve.", vi: "Lấy một điểm bất kỳ của parabol." },
    close(dFocus, dLine, 1e-9) ? "passed" : "failed");
}

const len = (x: number) => measureTex(x);
const frac = (x: number) => {
  const t = measureTex(x);
  return t === "1" ? "" : t;
};
const coordPair = (x: number, y: number) => `\\left(${coordTex(x)}${L({ en: ",\\ ", vi: ";\\ " })}${coordTex(y)}\\right)`;

/** “M thuộc (E) có hoành độ 3” (focal radii) and “MF₁ = 2MF₂” (find M). */
function pointGoals(s: string, c: Conic, st: Steps, answers: ConicAnswer[], given: Array<{ name: string; x: number; y: number }>) {
  const abs = s.match(new RegExp(String.raw`(?:điểm\s+|point\s+)?([A-Z])\s*(?:∈|thuộc|nằm trên|on|lies on)\s*(?:\(\w\)|elip|hypebol|parabol|the\s+\w+)[^.;]*?(?:có\s+)?(?:hoành độ|x-coordinate|abscissa)\s*(?:bằng|là|=|of|is)?\s*${NUM}`, "u"));
  if (abs) {
    const M = abs[1];
    const x0 = num(abs[2]);
    if (x0 === null) return;
    const y2 = c.kind === "parabola" ? (c.axis === "x" ? toNumber(c.k) * x0 : (x0 * x0) / toNumber(c.k)) : c.kind === "ellipse" ? (c.axis === "x" ? toNumber(c.b2) * (1 - (x0 * x0) / toNumber(c.a2)) : toNumber(c.a2) * (1 - (x0 * x0) / toNumber(c.b2))) : c.axis === "x" ? toNumber(c.b2) * ((x0 * x0) / toNumber(c.a2) - 1) : toNumber(c.a2) * (1 + (x0 * x0) / toNumber(c.b2));
    if (y2 < -1e-12 && !(c.kind === "parabola" && c.axis === "y")) oops({ en: `No point of the curve has x = ${x0}.`, vi: `Không có điểm nào của đường cong có hoành độ ${x0}.` }, { en: "Check the x-coordinate.", vi: "Kiểm tra lại hoành độ." });
    // For x² = ky the value is y itself; otherwise it is y².
    const direct = c.kind === "parabola" && c.axis === "y";
    const y = direct ? y2 : Math.sqrt(Math.max(0, y2));
    const yRow = direct ? `y_${M} = ${len(y2)}` : `y_${M}^2 = ${len(y2)}\\ \\Rightarrow\\ y_${M} = ${y < 1e-12 ? "0" : `\\pm ${len(y)}`}`;
    given.push({ name: M, x: x0, y });
    if (c.kind === "parabola") {
      const f = toNumber(c.k) / 4;
      const r = c.axis === "x" ? x0 + f : (y2 + f);
      st.push("formula", { en: "Focal radius", vi: "Bán kính qua tiêu điểm" }, `x_${M} = ${len(x0)}\\ \\Rightarrow\\ ${yRow}\\\\ ${M}F = ${c.axis === "x" ? `x_${M} + \\frac{p}{2}` : `y_${M} + \\frac{p}{2}`} = ${len(r)}`,
        { en: "A point of the parabola is as far from the focus as from the directrix.", vi: "Điểm của parabol cách đều tiêu điểm và đường chuẩn." },
        { en: "MF = x + p/2 for y² = 2px.", vi: "MF = x + p/2 với parabol y² = 2px." },
        { en: "Distance to the directrix.", vi: "Tính khoảng cách đến đường chuẩn." });
      answers.push({ key: `MF-${M}`, latex: `${M}F = ${len(r)}`, value: r });
      return;
    }
    const a = Math.sqrt(toNumber(c.a2));
    const cc = Math.sqrt(c.kind === "ellipse" ? toNumber(c.a2) - toNumber(c.b2) : toNumber(c.a2) + toNumber(c.b2));
    const along = c.axis === "x" ? x0 : y;
    const ex = (cc / a) * along;
    const [r1, r2] = c.kind === "ellipse" ? [a + ex, a - ex] : [Math.abs(a + ex), Math.abs(a - ex)];
    st.push("formula", { en: "Focal radii", vi: "Bán kính qua tiêu điểm" },
      `x_${M} = ${len(x0)}\\ \\Rightarrow\\ ${yRow}\\\\ ${M}F_1 = ${c.kind === "ellipse" ? "a + \\frac{c}{a}x" : "\\left|a + \\frac{c}{a}x\\right|"} = ${len(r1)},\\quad ${M}F_2 = ${c.kind === "ellipse" ? "a - \\frac{c}{a}x" : "\\left|a - \\frac{c}{a}x\\right|"} = ${len(r2)}`,
      { en: "Put x into the equation for y, then use the focal-radius formulas.", vi: "Thay hoành độ vào phương trình để tìm tung độ, rồi dùng công thức bán kính qua tiêu điểm." },
      { en: c.kind === "ellipse" ? "MF₁ = a + ex, MF₂ = a − ex; their sum is 2a." : "MF₁ = |a + ex|, MF₂ = |a − ex|; their difference is ±2a.", vi: c.kind === "ellipse" ? "MF₁ = a + ex, MF₂ = a − ex; tổng bằng 2a." : "MF₁ = |a + ex|, MF₂ = |a − ex|; hiệu bằng ±2a." },
      { en: "What is e = c/a?", vi: "Tâm sai e = c/a bằng bao nhiêu?" },
      close(c.kind === "ellipse" ? r1 + r2 : Math.abs(r1 - r2), 2 * a, 1e-9) ? "passed" : "failed");
    answers.push({ key: `MF1-${M}`, latex: `${M}F_1 = ${len(r1)}`, value: r1 });
    answers.push({ key: `MF2-${M}`, latex: `${M}F_2 = ${len(r2)}`, value: r2 });
    return;
  }
  const ratio = s.match(new RegExp(String.raw`([A-Z])F_?1\s*=\s*${NUM}?\s*\*?\s*([A-Z])F_?2`, "u"));
  if (ratio && c.kind === "ellipse" && c.axis === "x") {
    const M = ratio[1];
    const k = ratio[2] ? num(ratio[2]) ?? 1 : 1;
    const a = Math.sqrt(toNumber(c.a2));
    const cc = Math.sqrt(toNumber(c.a2) - toNumber(c.b2));
    const r2 = (2 * a) / (k + 1);
    const x = (a * (a - r2)) / cc;
    const y2 = toNumber(c.b2) * (1 - (x * x) / toNumber(c.a2));
    if (y2 < -1e-12) oops({ en: "No point of the ellipse satisfies that.", vi: "Không có điểm nào của elip thỏa mãn." }, { en: "Check the ratio.", vi: "Kiểm tra lại tỉ số." });
    const y = Math.sqrt(Math.max(0, y2));
    st.push("formula", { en: "Find the point", vi: "Tìm điểm" },
      `${M}F_1 + ${M}F_2 = 2a,\\ ${M}F_1 = ${len(k)}${M}F_2\\ \\Rightarrow\\ ${M}F_2 = \\frac{2a}{${len(k + 1)}} = ${len(r2)}\\\\ ${M}F_2 = a - \\frac{c}{a}x\\ \\Rightarrow\\ x = ${len(x)},\\ y = ${y < 1e-12 ? "0" : `\\pm ${len(y)}`}`,
      { en: "The two focal radii add up to 2a; with their ratio that fixes MF₂, then x from MF₂ = a − ex, and y from the equation.", vi: "Tổng hai bán kính qua tiêu điểm bằng 2a; kết hợp tỉ số tìm được MF₂, rồi tìm x từ MF₂ = a − ex và y từ phương trình." },
      { en: "MF₁ + MF₂ = 2a.", vi: "MF₁ + MF₂ = 2a." },
      { en: "Use MF₁ + MF₂ = 2a.", vi: "Dùng MF₁ + MF₂ = 2a." });
    const pts = y < 1e-12 ? [[x, 0]] : [[x, y], [x, -y]];
    answers.push({ key: `M-${M}`, latex: pts.map((p) => ptTex(M, p[0], p[1])).join(",\\ "), value: null, pts });
  }
}

/* ───────────────────────────── Writing the equation ───────────────────────────── */

type Pt = { name: string; x: number; y: number };

function pointsIn(s: string): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const m of s.matchAll(/(?<![\p{L}\d])([A-Z][0-9']*)\s*\(\s*([^();]+?)\s*[;,]\s*([^();]+?)\s*\)/gu)) {
    const x = num(m[2]);
    const y = num(m[3]);
    if (x !== null && y !== null) out.set(m[1], { name: m[1], x, y });
  }
  return out;
}

function writeCentral(kind: "ellipse" | "hyperbola", s: string, st: Steps, given: Pt[]): Conic {
  const ell = kind === "ellipse";
  const pts = pointsIn(s);
  const rows: string[] = [];
  let A: Rat | undefined;
  let B: Rat | undefined;
  let C: Rat | undefined;
  let E2: Rat | undefined;
  let K2: Rat | undefined;
  let axis: "x" | "y" = "x";
  const setSq = (which: "A" | "B" | "C", v: number | null, row: string) => {
    if (v === null) return;
    const r = sq(v);
    if (!r) return;
    if (which === "A") A ??= r;
    if (which === "B") B ??= r;
    if (which === "C") C ??= r;
    rows.push(row);
  };
  // Foci: F(±c; 0), or on Oy.
  const focus = s.match(/(?:tiêu điểm|focus|foci)\s*(?:là\s*)?(?:[A-Z][0-9']*\s*)?\(\s*([^();]+?)\s*[;,]\s*([^();]+?)\s*\)/u);
  if (focus) {
    const [fx, fy] = [num(focus[1].replace("±", "")), num(focus[2].replace("±", ""))];
    if (fx !== null && fy !== null) {
      if (Math.abs(fx) < 1e-12 && Math.abs(fy) > 1e-12) axis = "y";
      const c = Math.abs(axis === "x" ? fx : fy);
      setSq("C", c, `${L({ en: "\\text{focus }", vi: "\\text{tiêu điểm }" })}(${coordTex(fx)}; ${coordTex(fy)})\\ \\Rightarrow\\ c = ${len(c)}`);
    }
  }
  const fl = s.match(new RegExp(String.raw`(?:tiêu cự|focal length|focal distance)${IS}(?:2c\s*=\s*)?${NUM}`, "u")) ?? s.match(new RegExp(String.raw`(?<![\p{L}\d])2c\s*=\s*${NUM}`, "u"));
  if (fl) setSq("C", (num(fl[1]) ?? NaN) / 2, `2c = ${len(num(fl[1]) ?? 0)}\\ \\Rightarrow\\ c = ${len((num(fl[1]) ?? 0) / 2)}`);
  const big = s.match(new RegExp(String.raw`(?:trục lớn|trục thực|major axis|transverse axis)(?:\s+có độ dài|\s+length)?${IS}(?:2a\s*=\s*)?${NUM}`, "u")) ?? s.match(new RegExp(String.raw`(?<![\p{L}\d])2a\s*=\s*${NUM}`, "u"));
  if (big) setSq("A", (num(big[1]) ?? NaN) / 2, `2a = ${len(num(big[1]) ?? 0)}\\ \\Rightarrow\\ a = ${len((num(big[1]) ?? 0) / 2)}`);
  const small = s.match(new RegExp(String.raw`(?:trục nhỏ|trục ảo|minor axis|conjugate axis)(?:\s+có độ dài|\s+length)?${IS}(?:2b\s*=\s*)?${NUM}`, "u")) ?? s.match(new RegExp(String.raw`(?<![\p{L}\d])2b\s*=\s*${NUM}`, "u"));
  if (small) setSq("B", (num(small[1]) ?? NaN) / 2, `2b = ${len(num(small[1]) ?? 0)}\\ \\Rightarrow\\ b = ${len((num(small[1]) ?? 0) / 2)}`);
  const ecc = s.match(new RegExp(String.raw`(?:tâm sai|eccentricity)(?:\s+e)?${IS}${NUM}`, "u"));
  if (ecc) {
    const e = num(ecc[1]);
    if (e !== null) {
      E2 = sq(e) ?? undefined;
      rows.push(`e = ${len(e)}\\ \\Rightarrow\\ e^2 = \\frac{c^2}{a^2} = ${E2 ? ratTex(E2) : len(e * e)}`);
    }
  }
  // Vertices: on the focal axis they give a, off it b.
  for (const m of s.matchAll(/(?:đỉnh|vertex|vertices)\s*(?:là\s*)?(?:[A-Z][0-9']*\s*)?\(\s*([^();]+?)\s*[;,]\s*([^();]+?)\s*\)/gu)) {
    const [vx, vy] = [num(m[1].replace("±", "")), num(m[2].replace("±", ""))];
    if (vx === null || vy === null) continue;
    const onX = Math.abs(vy) < 1e-12;
    const onFocal = (axis === "x") === onX;
    const v = Math.abs(onX ? vx : vy);
    setSq(onFocal ? "A" : "B", v, `${L({ en: "\\text{vertex }", vi: "\\text{đỉnh }" })}(${coordTex(vx)}; ${coordTex(vy)})\\ \\Rightarrow\\ ${onFocal ? "a" : "b"} = ${len(v)}`);
  }
  if (!ell) {
    const asym = s.match(/(?:tiệm cận|asymptotes?)[^.;]*?y\s*=\s*(?:±|\+-|\\pm)?\s*\(?\s*([\d./\s]*(?:sqrt\s*\(?\d+\)?)?[\d./\s]*)\s*\)?\s*\*?\s*x/u);
    if (asym) {
      const k = asym[1].trim() ? num(asym[1]) : 1;
      if (k !== null) {
        K2 = sq(axis === "x" ? k : 1 / k) ?? undefined;
        rows.push(`${L({ en: "\\text{asymptote }", vi: "\\text{tiệm cận }" })}y = \\pm ${frac(k)}x\\ \\Rightarrow\\ \\frac{b}{a} = ${len(axis === "x" ? k : 1 / k)}`);
      }
    }
  }
  // Points it passes through.
  const through: Pt[] = [];
  for (const m of s.matchAll(/(?:đi qua|qua|passes through|passing through|through|chứa|contains)\s+((?:(?:hai\s+|two\s+)?(?:các\s+)?(?:điểm\s+|points?\s+)?[A-Z][0-9']*(?:\s*\([^()]*\))?\s*(?:,|và|and)?\s*)+)/gu)) {
    for (const nm of m[1].match(/[A-Z][0-9']*/g) ?? []) {
      const p = pts.get(nm);
      if (p && !through.some((q) => q.name === nm)) through.push(p);
    }
  }
  through.forEach((p) => given.push(p));
  // Work in coordinates along the focal axis.
  const P = through.map((p) => {
    const [u, v] = axis === "x" ? [p.x, p.y] : [p.y, p.x];
    return { name: p.name, x: p.x, y: p.y, u2: sq(u)!, v2: sq(v)! };
  });
  for (let guard = 0; guard < 12 && (A === undefined || B === undefined); guard++) {
    const before = [A, B, C].map(String).join();
    if (A && C && !B) {
      B = ell ? sub(A, C) : sub(C, A);
      rows.push(`b^2 = ${ell ? "a^2 - c^2" : "c^2 - a^2"} = ${ratTex(B)}`);
    } else if (B && C && !A) {
      A = ell ? add(B, C) : sub(C, B);
      rows.push(`a^2 = ${ell ? "b^2 + c^2" : "c^2 - b^2"} = ${ratTex(A)}`);
    } else if (E2 && A && !C) {
      C = mul(E2, A);
      rows.push(`c^2 = e^2a^2 = ${ratTex(C)}`);
    } else if (E2 && C && !A) {
      A = div(C, E2);
      rows.push(`a^2 = \\frac{c^2}{e^2} = ${ratTex(A)}`);
    } else if (E2 && B && !A) {
      A = div(B, ell ? sub(rat(1), E2) : sub(E2, rat(1)));
      rows.push(`b^2 = a^2${ell ? "(1 - e^2)" : "(e^2 - 1)"}\\ \\Rightarrow\\ a^2 = ${ratTex(A)}`);
    } else if (K2 && A && !B) {
      B = mul(K2, A);
      rows.push(`b^2 = \\left(\\frac{b}{a}\\right)^2 a^2 = ${ratTex(B)}`);
    } else if (K2 && B && !A) {
      A = div(B, K2);
      rows.push(`a^2 = ${ratTex(A)}`);
    } else if (K2 && C && !A) {
      A = div(C, add(rat(1), K2));
      rows.push(`a^2 + \\left(\\frac{b}{a}\\right)^2a^2 = c^2\\ \\Rightarrow\\ a^2 = ${ratTex(A)}`);
    } else if (P.length && A && !B) {
      const p = P[0];
      // u²/A ± v²/B = 1 ⇒ B = v² / ±(1 − u²/A).
      const rest = sub(rat(1), div(p.u2, A));
      if (isZero(rest)) break;
      B = div(p.v2, ell ? rest : neg(rest));
      rows.push(`${p.name} \\in (${LETTER[kind]}):\\ ${pointEq(p, A, undefined, ell, axis)}\\ \\Rightarrow\\ b^2 = ${ratTex(B)}`);
    } else if (P.length && B && !A) {
      const p = P[0];
      const rest = ell ? sub(rat(1), div(p.v2, B)) : add(rat(1), div(p.v2, B));
      if (isZero(rest)) break;
      A = div(p.u2, rest);
      rows.push(`${p.name} \\in (${LETTER[kind]}):\\ ${pointEq(p, undefined, B, ell, axis)}\\ \\Rightarrow\\ a^2 = ${ratTex(A)}`);
    } else if (P.length >= 2 && !A && !B) {
      // u₁²·s ± v₁²·t = 1, u₂²·s ± v₂²·t = 1 with s = 1/a², t = 1/b².
      const [p, q] = P;
      const sv = (r: Rat) => (ell ? r : neg(r));
      const det = sub(mul(p.u2, sv(q.v2)), mul(q.u2, sv(p.v2)));
      if (isZero(det)) break;
      const s1 = div(sub(sv(q.v2), sv(p.v2)), det);
      const t1 = div(sub(p.u2, q.u2), det);
      if (isZero(s1) || isZero(t1)) break;
      A = div(rat(1), s1);
      B = div(rat(1), t1);
      rows.push(`\\begin{cases} ${pointEq(p, undefined, undefined, ell, axis)} \\\\ ${pointEq(q, undefined, undefined, ell, axis)} \\end{cases}\\ \\Rightarrow\\ a^2 = ${ratTex(A)},\\ b^2 = ${ratTex(B)}`);
    } else if (P.length && C && !A && !B) {
      // Ellipse: B² + (C − u² − v²)B − v²C = 0; hyperbola: B² + (u² + v² − C)B − v²C = 0.
      const p = P[0];
      const lin = ell ? sub(sub(C, p.u2), p.v2) : sub(add(p.u2, p.v2), C);
      const disc = add(mul(lin, lin), mul(rat(4), mul(p.v2, C)));
      const root = asRat(sqrtOf(disc));
      if (!root) break;
      B = div(add(neg(lin), root), rat(2));
      A = ell ? add(B, C) : sub(C, B);
      rows.push(`${p.name} \\in (${LETTER[kind]}),\\ a^2 = b^2 ${ell ? "+" : "-"} c^2\\ \\Rightarrow\\ b^2 = ${ratTex(B)},\\ a^2 = ${ratTex(A)}`);
    } else if (P.length && E2 && !A && !B) {
      const p = P[0];
      const f = ell ? sub(rat(1), E2) : sub(E2, rat(1));
      A = ell ? add(p.u2, div(p.v2, f)) : sub(p.u2, div(p.v2, f));
      B = mul(A, f);
      rows.push(`b^2 = a^2${ell ? "(1 - e^2)" : "(e^2 - 1)"},\\ ${p.name} \\in (${LETTER[kind]})\\ \\Rightarrow\\ a^2 = ${ratTex(A)},\\ b^2 = ${ratTex(B)}`);
    } else if (P.length && K2 && !A && !B && !ell) {
      const p = P[0];
      A = sub(p.u2, div(p.v2, K2));
      B = mul(K2, A);
      rows.push(`b^2 = \\left(\\frac{b}{a}\\right)^2a^2,\\ ${p.name} \\in (H)\\ \\Rightarrow\\ a^2 = ${ratTex(A)},\\ b^2 = ${ratTex(B)}`);
    }
    if ([A, B, C].map(String).join() === before) break;
  }
  if (A === undefined || B === undefined) oops({ en: `I need two facts about the ${NAME[kind].en} (like a focus and a point, or both axes).`, vi: `Cần hai dữ kiện về ${NAME[kind].vi} (ví dụ một tiêu điểm và một điểm, hoặc độ dài hai trục).` }, { en: "E.g. “tiêu cự bằng 6 và đi qua M(0; 4)”.", vi: "Ví dụ “tiêu cự bằng 6 và đi qua M(0; 4)”." });
  if (!(sign(A!) > 0 && sign(B!) > 0) || (ell && toNumber(A!) <= toNumber(B!))) oops({ en: "These facts don't fit together.", vi: "Các dữ kiện không phù hợp với nhau." }, { en: ell ? "For an ellipse a > b > 0 and a² = b² + c²." : "For a hyperbola a² + b² = c².", vi: ell ? "Với elip: a > b > 0 và a² = b² + c²." : "Với hypebol: a² + b² = c²." });
  const conic: Conic = { kind, axis, a2: A!, b2: B! };
  const [u, v] = axis === "x" ? ["x", "y"] : ["y", "x"];
  const general = ell ? (axis === "x" ? "\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1" : "\\frac{x^2}{b^2} + \\frac{y^2}{a^2} = 1") : `\\frac{${u}^2}{a^2} - \\frac{${v}^2}{b^2} = 1`;
  st.push("formula", { en: "Find a² and b²", vi: "Tìm a², b²" }, `(${LETTER[kind]}):\\ ${general}${rows.length ? `\\\\ ${rows.join("\\\\ ")}` : ""}`,
    { en: `Start from the standard form and turn each fact into an equation in a², b², c² (${ell ? "c² = a² − b²" : "c² = a² + b²"}).`, vi: `Xuất phát từ phương trình chính tắc, chuyển mỗi dữ kiện thành phương trình theo a², b², c² (${ell ? "c² = a² − b²" : "c² = a² + b²"}).` },
    { en: ell ? "Ellipse: c² = a² − b², e = c/a." : "Hyperbola: c² = a² + b², e = c/a, asymptotes y = ±(b/a)x.", vi: ell ? "Elip: c² = a² − b², e = c/a." : "Hypebol: c² = a² + b², e = c/a, tiệm cận y = ±(b/a)x." },
    { en: "Which of a, b, c does each fact give?", vi: "Mỗi dữ kiện cho biết a, b hay c?" });
  verifyGiven(conic, through, C, E2, st);
  return conic;
}

function pointEq(p: { name: string; u2: Rat; v2: Rat }, A: Rat | undefined, B: Rat | undefined, ell: boolean, axis: "x" | "y"): string {
  void axis;
  const t = (v: Rat, d: Rat | undefined, sym: string) => `\\frac{${ratTex(v)}}{${d ? ratTex(d) : sym}}`;
  return `${t(p.u2, A, "a^2")} ${ell ? "+" : "-"} ${t(p.v2, B, "b^2")} = 1`;
}

function verifyGiven(c: Extract<Conic, { kind: "ellipse" | "hyperbola" }>, through: Pt[], C: Rat | undefined, E2: Rat | undefined, st: Steps) {
  const ell = c.kind === "ellipse";
  const [A, B] = [toNumber(c.a2), toNumber(c.b2)];
  const checks: string[] = [];
  let ok = true;
  for (const p of through) {
    const [u, v] = c.axis === "x" ? [p.x, p.y] : [p.y, p.x];
    const lhs = (u * u) / A + (ell ? 1 : -1) * ((v * v) / B);
    ok &&= close(lhs, 1, 1e-9);
    checks.push(`${p.name}:\\ ${len(lhs)} = 1`);
  }
  const c2 = ell ? A - B : A + B;
  if (C) {
    ok &&= close(c2, toNumber(C), 1e-9);
    checks.push(`c^2 = ${len(c2)}`);
  }
  if (E2) {
    ok &&= close(c2 / A, toNumber(E2), 1e-9);
    checks.push(`e^2 = ${len(c2 / A)}`);
  }
  st.push("verify", { en: "Check the data", vi: "Kiểm tra dữ kiện" }, `${equationTex(c)}\\\\ ${checks.join(",\\ ") || "a^2, b^2 > 0"}`,
    { en: "Every given fact holds for the equation found.", vi: "Phương trình tìm được thỏa mãn mọi dữ kiện của đề." },
    { en: "Substitute the points and recompute c and e.", vi: "Thay tọa độ các điểm và tính lại c, e." },
    { en: "Plug each given point into the equation.", vi: "Thay từng điểm đã cho vào phương trình." },
    ok ? "passed" : "failed");
}

function writeParabola(s: string, st: Steps, given: Pt[]): Conic {
  const pts = pointsIn(s);
  let k: Rat | undefined;
  let axis: "x" | "y" = "x";
  let row = "";
  const focus = s.match(/(?:tiêu điểm|focus)\s*(?:là\s*)?(?:[A-Z][0-9']*\s*)?\(\s*([^();]+?)\s*[;,]\s*([^();]+?)\s*\)/u);
  const directrix = s.match(new RegExp(String.raw`(?:đường chuẩn|directrix)[^.;=]*?([xy])\s*=\s*${NUM}`, "u")) ?? s.match(new RegExp(String.raw`(?:đường chuẩn|directrix)[^.;=]*?([xy])\s*\+\s*${NUM}\s*=\s*0`, "u"));
  const param = s.match(new RegExp(String.raw`(?:tham số tiêu|parameter)\s*(?:p\s*)?${IS}${NUM}`, "u")) ?? s.match(new RegExp(String.raw`(?<![\p{L}\d])p\s*=\s*${NUM}`, "u"));
  if (focus) {
    const [fx, fy] = [num(focus[1]), num(focus[2])];
    if (fx !== null && fy !== null) {
      if (Math.abs(fx) < 1e-12 && Math.abs(fy) > 1e-12) axis = "y";
      const f = axis === "x" ? fx : fy;
      k = fr(4 * f);
      row = `F(${coordTex(fx)}; ${coordTex(fy)})\\ \\Rightarrow\\ \\frac{p}{2} = ${len(f)},\\ p = ${len(2 * f)}`;
    }
  } else if (directrix) {
    const v = num(directrix[2]);
    if (v !== null) {
      axis = directrix[1] as "x" | "y";
      const d = directrix[0].includes("+") ? -v : v;
      const f = -d;
      k = fr(4 * f);
      row = `\\Delta:\\ ${axis} = ${len(d)}\\ \\Rightarrow\\ -\\frac{p}{2} = ${len(d)},\\ p = ${len(2 * f)}`;
    }
  } else if (param) {
    const p = num(param[1]);
    if (p !== null) {
      k = fr(2 * p);
      row = `p = ${len(p)}`;
    }
  }
  if (!k) {
    // A point it passes through: y² = 2px ⇒ 2p = y²/x.
    const via = s.match(/(?:đi qua|qua|passes through|through)\s+(?:điểm\s+|point\s+)?([A-Z][0-9']*)/u);
    const p = via ? pts.get(via[1]) : undefined;
    if (p && Math.abs(p.x) > 1e-12) {
      k = fr((p.y * p.y) / p.x);
      given.push(p);
      row = `${p.name} \\in (P):\\ ${len(p.y * p.y)} = 2p\\cdot ${len(p.x)}\\ \\Rightarrow\\ 2p = ${k ? ratTex(k) : ""}`;
    }
  }
  if (!k) oops({ en: "I need the focus, the directrix, p or a point of the parabola.", vi: "Cần tiêu điểm, đường chuẩn, tham số p hoặc một điểm của parabol." }, { en: "E.g. “parabol có tiêu điểm F(2; 0)”.", vi: "Ví dụ “parabol có tiêu điểm F(2; 0)”." });
  const conic: Conic = { kind: "parabola", axis, k: k! };
  st.push("formula", { en: "Find p", vi: "Tìm p" }, `(P):\\ ${axis === "x" ? "y^2 = 2px" : "x^2 = 2py"}\\\\ ${row}\\\\ \\Rightarrow\\ ${equationTex(conic)}`,
    { en: "The standard parabola y² = 2px has focus F(p/2; 0) and directrix x = −p/2.", vi: "Parabol chính tắc y² = 2px có tiêu điểm F(p/2; 0) và đường chuẩn x = −p/2." },
    { en: "Focus and directrix are p/2 on either side of the vertex O.", vi: "Tiêu điểm và đường chuẩn cách đỉnh O một khoảng p/2 về hai phía." },
    { en: "Which fact gives p?", vi: "Dữ kiện nào cho biết p?" });
  verifyParabola(conic, st);
  return conic;
}

/* ───────────────────────────── Results, figure, checking ───────────────────────────── */

export function solveConic(problemId: string, raw: string): SolveResult {
  const r = analyzeConic(raw);
  if ("ok" in r) return r;
  if (!r.answers.length) return { ok: false, code: "unsupported", message: L({ en: "I read the conic but found no question I can answer.", vi: "Đã đọc được đường conic nhưng không thấy câu hỏi giải được." }), suggestion: L({ en: "Ask e.g. “tìm tiêu điểm, tâm sai” or “viết phương trình chính tắc”.", vi: "Hỏi ví dụ “tìm tiêu điểm, tâm sai” hoặc “viết phương trình chính tắc”." }) };
  const finalAnswer = r.answers.length === 1 ? r.answers[0].latex : `\\begin{gathered}${r.answers.map((a) => a.latex).join("\\\\")}\\end{gathered}`;
  const solution: MathSolution = { problemId, originalInput: raw, topic: "conic", steps: finalize(problemId, r.steps.drafts), finalAnswer, roots: [], confidenceNotes: r.notes };
  return { ok: true, solution };
}

export function conicFigure(raw: string): ({ ok: true } & GraphSpec) | SolveFailure {
  const r = analyzeConic(raw);
  if ("ok" in r) return r;
  const c = r.conic;
  const curves: GraphCurve[] = [];
  const marks: GraphMark[] = [];
  const sw = (x: number, y: number): [number, number] => (c.axis === "x" ? [x, y] : [y, x]);
  let ext = 1;
  if (c.kind === "parabola") {
    const k = toNumber(c.k);
    const f = k / 4;
    const Y = Math.max(2.5 * Math.abs(k) ** 0.5 * 2, 4);
    const seg: Array<[number, number]> = [];
    for (let i = 0; i <= 120; i++) {
      const y = -Y + (2 * Y * i) / 120;
      seg.push(sw((y * y) / k, y));
    }
    curves.push({ label: `(P)`, tone: "brand", segments: [seg] });
    const dirSeg: Array<[number, number]> = [sw(-f, -Y), sw(-f, Y)];
    curves.push({ label: "", tone: "accent", thin: true, dashed: true, segments: [dirSeg] });
    marks.push({ ...xy(sw(f, 0)), label: "F" }, { ...xy(sw(0, 0)), label: "O", given: true });
    ext = Math.max(Y, Math.abs((Y * Y) / k) * 0.6, 2 * Math.abs(f));
  } else {
    const a = Math.sqrt(toNumber(c.a2));
    const b = Math.sqrt(toNumber(c.b2));
    const ell = c.kind === "ellipse";
    const cc = Math.sqrt(ell ? a * a - b * b : a * a + b * b);
    if (ell) {
      const seg: Array<[number, number]> = [];
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * 2 * Math.PI;
        seg.push(sw(a * Math.cos(t), b * Math.sin(t)));
      }
      curves.push({ label: "(E)", tone: "brand", segments: [seg] });
      ext = a * 1.25;
    } else {
      const T = Math.acosh(Math.max(2.2, (cc + a) / a));
      const branch = (side: number) => {
        const seg: Array<[number, number]> = [];
        for (let i = 0; i <= 80; i++) {
          const t = -T + (2 * T * i) / 80;
          seg.push(sw(side * a * Math.cosh(t), b * Math.sinh(t)));
        }
        return seg;
      };
      curves.push({ label: "(H)", tone: "brand", segments: [branch(1), branch(-1)] });
      const X = a * Math.cosh(T);
      curves.push({ label: "", tone: "accent", thin: true, dashed: true, segments: [[sw(-X, (-b / a) * X), sw(X, (b / a) * X)], [sw(-X, (b / a) * X), sw(X, (-b / a) * X)]] });
      ext = Math.max(X, b * Math.sinh(T)) * 1.05;
    }
    marks.push({ ...xy(sw(-cc, 0)), label: "F₁" }, { ...xy(sw(cc, 0)), label: "F₂" }, { ...xy(sw(-a, 0)), label: "A₁", given: true }, { ...xy(sw(a, 0)), label: "A₂", given: true });
    if (ell) marks.push({ ...xy(sw(0, -b)), label: "B₁", given: true }, { ...xy(sw(0, b)), label: "B₂", given: true });
  }
  for (const p of r.given) {
    marks.push({ x: p.x, y: p.y, label: p.name, given: true });
    ext = Math.max(ext, Math.abs(p.x) * 1.15, Math.abs(p.y) * 1.15);
  }
  ext = Math.max(ext, 2);
  return {
    ok: true,
    title: L({ en: NAME[c.kind].en[0].toUpperCase() + NAME[c.kind].en.slice(1), vi: NAME[c.kind].vi[0].toUpperCase() + NAME[c.kind].vi.slice(1) }),
    caption: L({ en: c.kind === "parabola" ? "Orange: focus and directrix." : c.kind === "hyperbola" ? "Orange: foci and asymptotes." : "Orange: the foci.", vi: c.kind === "parabola" ? "Màu cam: tiêu điểm và đường chuẩn." : c.kind === "hyperbola" ? "Màu cam: tiêu điểm và tiệm cận." : "Màu cam: hai tiêu điểm." }),
    curves,
    marks,
    shade: [],
    asymptotes: [],
    domain: [-ext, ext],
    range: [-ext, ext],
    equal: true,
  };
}

const xy = ([x, y]: [number, number]) => ({ x, y });

/** A learner's answer: a conic equation, a point (4; 0), or a number (4/5, 2√3). */
export function checkConicAnswer(problem: string, answer: string): AnswerCheck {
  const r = analyzeConic(problem);
  if ("ok" in r) return { status: "unsupported", message: r.message };
  return checkAgainstConic(r.answers, answer);
}

export function checkAgainstConic(answers: ConicAnswer[], answer: string): AnswerCheck {
  const a = normalizeInput(answer.normalize("NFC")).replace(/²/g, "^2");
  const eqAns = answers.find((x) => x.conic);
  if (eqAns && /[xy]/.test(a) && a.includes("=")) {
    const body = a.replace(/^\s*\(\w\)\s*:\s*/, "");
    const got = conicOf(body);
    if (!got || !("kind" in got)) return { status: "unreadable", message: L({ en: "Write the equation like x^2/25 + y^2/9 = 1.", vi: "Viết phương trình dạng x^2/25 + y^2/9 = 1." }) };
    const want = eqAns.conic!;
    const same = got.kind === want.kind && got.axis === want.axis && (got.kind === "parabola" ? want.kind === "parabola" && toNumber(got.k) === toNumber(want.k) : want.kind !== "parabola" && toNumber(got.a2) === toNumber(want.a2) && toNumber(got.b2) === toNumber(want.b2));
    if (same) return { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) };
    if (got.kind !== want.kind) return { status: "incorrect", message: L({ en: `That's a ${NAME[got.kind].en}, but the answer is a ${NAME[want.kind].en}.`, vi: `Đó là ${NAME[got.kind].vi}, nhưng đáp án là ${NAME[want.kind].vi}.` }) };
    const swapped = got.kind !== "parabola" && want.kind !== "parabola" && got.axis !== want.axis && toNumber(got.a2) === toNumber(want.a2) && toNumber(got.b2) === toNumber(want.b2);
    if (swapped) return { status: "incorrect", message: L({ en: "a² and b² are swapped — a² goes under x² in the standard form.", vi: "Bạn đã đổi chỗ a² và b² — trong dạng chính tắc, a² nằm dưới x²." }) };
    return { status: "incorrect", message: L({ en: "Not quite. Recheck how each fact gives a, b or c.", vi: "Chưa đúng. Kiểm tra lại mỗi dữ kiện cho a, b hay c." }) };
  }
  const pt = a.match(/\(\s*([^();]+?)\s*[;,]\s*([^();]+?)\s*\)/);
  if (pt) {
    const [x, y] = [num(pt[1]), num(pt[2])];
    if (x === null || y === null) return { status: "unreadable", message: L({ en: "Write a point like (4; 0).", vi: "Viết điểm dạng (4; 0)." }) };
    const hit = answers.some((ans) => ans.pts?.some((p) => close(p[0], x, 1e-6) && close(p[1], y, 1e-6)));
    return hit ? { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) } : { status: "incorrect", message: L({ en: "That point isn't one of the answers. Check c (or p/2).", vi: "Điểm đó không phải đáp án. Kiểm tra lại c (hoặc p/2)." }) };
  }
  const v = num(a.replace(/^.*=/, ""));
  if (v === null) return { status: "unreadable", message: L({ en: "Write a number such as 4/5 or 2√3, a point like (4; 0), or an equation.", vi: "Hãy viết một số như 4/5 hoặc 2√3, một điểm như (4; 0), hoặc một phương trình." }) };
  if (answers.some((ans) => ans.value !== null && close(ans.value, v, 1e-6))) return { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) };
  if (answers.some((ans) => ans.value !== null && close(ans.value, 2 * v, 1e-6))) return { status: "incorrect", message: L({ en: "That's half the answer — an axis or the focal length is 2a, 2b or 2c.", vi: "Đó là một nửa đáp số — độ dài trục và tiêu cự là 2a, 2b, 2c." }) };
  return { status: "incorrect", message: L({ en: "Not quite. Check c² (a² − b² for an ellipse, a² + b² for a hyperbola).", vi: "Chưa đúng. Kiểm tra lại c² (elip: a² − b², hypebol: a² + b²)." }) };
}
