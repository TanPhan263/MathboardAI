import { L } from "../lang";
import { collectVariables, evalExact, fail, normalizeInput, parseExpr } from "../polynomial";
import { type Rat, add, div, isZero, mul, neg, rat, sub } from "../rational";
import type { SolveFailure } from "../types";
import { type Vec, primitive } from "./vec";

/* ───────────────────────────── Objects ───────────────────────────── */

export type Point = { kind: "point"; name: string; at: Vec };
export type Vector = { kind: "vector"; name: string; v: Vec };
/** A line through p with direction u (in the plane or in space). */
export type Line = { kind: "line"; name: string; p: Vec; u: Vec };
/** n·X + d = 0. */
export type Plane = { kind: "plane"; name: string; n: Vec; d: Rat };
/** (X − c)² = r2: a circle in the plane, a sphere in space. */
export type Round = { kind: "circle" | "sphere"; name: string; c: Vec; r2: Rat };
export type GeoObject = Point | Vector | Line | Plane | Round;

/** What the learner asked for. Names are resolved by the solver. */
export type Goal =
  | { k: "vector"; a: string; b: string }
  | { k: "length"; ref: string }
  | { k: "midpoint"; a: string; b: string; as?: string }
  | { k: "centroid"; pts: string[]; as?: string }
  | { k: "dot"; u: string; v: string }
  | { k: "cross"; u: string; v: string }
  | { k: "angle"; x: string; y: string; vectors: boolean }
  | { k: "distance"; x: string; y: string }
  | { k: "area"; pts: string[] }
  | { k: "perimeter"; pts: string[] }
  | { k: "volume"; pts: string[] }
  | { k: "plane3"; pts: string[]; as?: string }
  | { k: "line2pts"; a: string; b: string }
  | { k: "intersect"; x: string; y: string }
  | { k: "project" | "reflect"; p: string; onto: string }
  | { k: "center"; ref: string }
  | { k: "planeThrough"; p: string; perp?: string; par?: string; as?: string }
  | { k: "lineThrough"; p: string; perp?: string; par?: string; as?: string }
  | { k: "round"; center?: string; through?: string; tangent?: string; radius?: Rat; diameter?: [string, string]; circum?: string[]; as?: string }
  | { k: "position"; x: string; y: string };

export type GeoProblem = {
  dim: 2 | 3;
  objects: Map<string, GeoObject>;
  goals: Goal[];
  /** Parts of the text that were neither data nor a question. */
  skipped: string[];
};

/* ───────────────────────────── Detection ───────────────────────────── */

const POINT_DECL = /(?:^|[^\p{L}\d_])([A-Z][0-9']*)\s*=?\s*\(\s*-?[\d./]+\s*[;,]\s*-?[\d./]+/u;
const NAMED_EQ = /(?:\([A-Za-zΔαβγ][0-9']*\)|(?:^|[^\p{L}])[dΔ][0-9']*)\s*:\s*[^:]*=/u;
const WORDS = /(?<!\p{L})(oxyz?|vectơ|vecto|vector|mặt phẳng|mặt cầu|đường tròn|tọa độ|toạ độ|plane|sphere|circle)(?!\p{L})/iu;

/** Is this coordinate geometry rather than algebra? */
export function isGeometry(raw: string): boolean {
  const s = raw.normalize("NFC");
  return POINT_DECL.test(s) || NAMED_EQ.test(s) || WORDS.test(s);
}

/** Coordinates or equations: the problem lives in Oxy/Oxyz (not a triangle or solid by measures). */
export function hasCoordinates(raw: string): boolean {
  const s = raw.normalize("NFC");
  return POINT_DECL.test(s) || NAMED_EQ.test(s);
}

/* ───────────────────────────── Text clean-up ───────────────────────────── */

export function clean(raw: string): string {
  let s = raw.normalize("NFC").replace(/×/g, " ✕ ").replace(/[∥‖]/g, " // ").replace(/⊥/g, " ⊥ ");
  s = normalizeInput(s);
  // “Tính khoảng cách…” → “tính khoảng cách…”, leaving names like A, AB, (P) alone.
  s = s.replace(/(^|[^\p{L}])(\p{Lu})(?=\p{Ll})/gu, (_, pre: string, c: string) => pre + c.toLowerCase());
  // Point lists “A, B, C” → “A B C” so they survive splitting on commas.
  s = s.replace(/\b([A-Z][0-9']*)\s*,\s*(?=[A-Z][0-9']*(?![\p{L}\d'(]|\s*\())/gu, "$1 ");
  // Point lists “A, B và C” / “A, B and C”.
  s = s.replace(/\b([A-Z][0-9']*)\s+(và|and)\s+(?=[A-Z][0-9']*(?![\p{L}\d'(]|\s*\())/gu, "$1 $2 ");
  return s;
}

/**
 * Split at top-level “;” “,” newlines and sentence full stops, and before a
 * second definition joined by “và”/“and” (“góc giữa d: … và (P): …”). Such a
 * piece keeps its connector so the question around both still reads whole.
 */
function fragments(s: string): Array<{ text: string; join?: string }> {
  const out: Array<{ text: string; join?: string }> = [];
  for (const f of pieces(s)) {
    const parts = f.split(/\s+(và|and)\s+(?=(?:\([^()]+\)|[a-zΔ][0-9']*)\s*:)/u);
    out.push({ text: parts[0] });
    for (let i = 1; i < parts.length; i += 2) out.push({ text: parts[i + 1], join: parts[i] });
  }
  return out;
}

function pieces(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    const stop = ch === "." && /\s/.test(s[i + 1] ?? " ");
    if (depth === 0 && (ch === ";" || ch === "," || ch === "\n" || stop)) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  // “x = 1 + 2t, y = 2 − t, z = 3t” was split above: join the coordinates back.
  const merged: string[] = [];
  for (const f of out.map((x) => x.trim()).filter(Boolean)) {
    const prev = merged[merged.length - 1];
    if (prev && /^[yz]\s*=/.test(f) && /(?:^|:|\s)x\s*=/.test(prev)) merged[merged.length - 1] = `${prev}, ${f}`;
    else merged.push(f);
  }
  return merged;
}

/* ───────────────────────────── Numbers and equations ───────────────────────────── */

export function number(text: string): Rat | null {
  const node = parseExpr(text.trim());
  return node && collectVariables(node).size === 0 ? evalExact(node, {}) : null;
}

/** “1; -2; 3” or “1, -2, 3” (a decimal comma is allowed with “;”). */
export function coordinates(inner: string): Vec | null {
  const parts = inner.includes(";") ? inner.split(";").map((p) => p.replace(/(\d),(\d)/g, "$1.$2")) : inner.split(",");
  if (parts.length < 2 || parts.length > 3) return null;
  const v = parts.map(number);
  return v.every((x): x is Rat => x !== null) ? v : null;
}

/** f = c0 + Σ lin·v + Σ sq·v² + cross terms, read exactly from evaluations. */
type Quad = { c0: Rat; lin: Rat[]; sq: Rat[]; mixed: boolean };

export function fitQuad(lhs: string, rhs: string): Quad | null {
  const l = parseExpr(lhs);
  const r = parseExpr(rhs);
  if (!l || !r) return null;
  const vars = new Set([...collectVariables(l), ...collectVariables(r)]);
  if ([...vars].some((v) => !"xyz".includes(v) || v.length !== 1)) return null;
  const f = (x: number, y: number, z: number) => {
    const scope = { x: rat(x), y: rat(y), z: rat(z) };
    const a = evalExact(l, scope);
    const b = evalExact(r, scope);
    return a && b ? sub(a, b) : null;
  };
  const c0 = f(0, 0, 0);
  if (!c0) return null;
  const unit = (i: number, t: number) => [0, 1, 2].map((j) => (j === i ? t : 0)) as [number, number, number];
  const lin: Rat[] = [];
  const sq: Rat[] = [];
  for (let i = 0; i < 3; i++) {
    const p = f(...unit(i, 1));
    const m = f(...unit(i, -1));
    if (!p || !m) return null;
    lin.push(div(sub(p, m), rat(2)));
    sq.push(sub(div(add(p, m), rat(2)), c0));
  }
  const at = (x: number, y: number, z: number) =>
    [x, y, z].reduce((s, t, i) => add(s, add(mul(lin[i], rat(t)), mul(sq[i], rat(t * t)))), c0);
  // Off-axis samples catch xy-terms and anything that isn't a quadratic.
  let mixed = false;
  for (const [x, y, z] of [[1, 1, 0], [0, 1, 1], [1, 0, 1], [2, -3, 5], [-1, 4, 2], [3, 2, -2]] as const) {
    const got = f(x, y, z);
    if (!got) return null;
    if (!isZero(sub(got, at(x, y, z)))) mixed = true;
  }
  return { c0, lin, sq, mixed };
}

/** A line written as x = 1 + 2t, y = …(, z = …). */
function parametric(text: string): { p: Vec; u: Vec } | null {
  const parts = text.split(",").map((s) => s.trim());
  const by = new Map<string, string>();
  for (const part of parts) {
    const m = part.match(/^([xyz])\s*=\s*(.+)$/);
    if (!m) return null;
    by.set(m[1], m[2]);
  }
  const axes = ["x", "y", "z"].filter((a) => by.has(a));
  if (axes.length < 2 || axes.join("") !== ["x", "y", "z"].slice(0, axes.length).join("")) return null;
  const p: Rat[] = [];
  const u: Rat[] = [];
  let param: string | null = null;
  for (const a of axes) {
    const node = parseExpr(by.get(a)!);
    if (!node) return null;
    const vars = [...collectVariables(node)];
    if (vars.length > 1 || (vars[0] && "xyz".includes(vars[0]))) return null;
    if (vars[0]) {
      if (param && param !== vars[0]) return null;
      param = vars[0];
    }
    const name = param ?? "t";
    const at = (t: number) => evalExact(node, { [name]: rat(t) });
    const [v0, v1, v2] = [at(0), at(1), at(2)];
    if (!v0 || !v1 || !v2) return null;
    // Linear in t: equal steps.
    if (!isZero(sub(sub(v2, v1), sub(v1, v0)))) return null;
    p.push(v0);
    u.push(sub(v1, v0));
  }
  if (!param || u.every(isZero)) return null;
  return { p, u };
}

/** (x − 1)/2 = (y − 2)/(−1) = z/3. */
function canonical(text: string): { p: Vec; u: Vec } | null {
  const parts = text.split("=").map((s) => s.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const p: Rat[] = [rat(0), rat(0), rat(0)];
  const u: Rat[] = [rat(0), rat(0), rat(0)];
  const seen = new Set<number>();
  for (const part of parts) {
    const node = parseExpr(part);
    if (!node) return null;
    const vars = [...collectVariables(node)];
    if (vars.length !== 1 || !"xyz".includes(vars[0])) return null;
    const i = "xyz".indexOf(vars[0]);
    if (seen.has(i)) return null;
    seen.add(i);
    const at = (t: number) => evalExact(node, { [vars[0]]: rat(t) });
    const [f0, f1, f2] = [at(0), at(1), at(2)];
    if (!f0 || !f1 || !f2) return null;
    const k = sub(f1, f0);
    if (isZero(k) || !isZero(sub(sub(f2, f1), k))) return null;
    // (v − p)/u = k·v + f0  ⇒  u = 1/k, p = −f0/k
    u[i] = div(rat(1), k);
    p[i] = neg(div(f0, k));
  }
  const dims = parts.length;
  if ([...seen].some((i) => i >= dims)) return null;
  return { p: p.slice(0, dims), u: primitive(u.slice(0, dims)) };
}

type RawEq = { name: string | null; text: string; cue: "plane" | "line" | "circle" | "sphere" | null };

function cueOf(before: string): RawEq["cue"] {
  if (/mặt phẳng|\bmp\b|plane/u.test(before)) return "plane";
  if (/mặt cầu|sphere/u.test(before)) return "sphere";
  if (/đường tròn|circle/u.test(before)) return "circle";
  if (/đường thẳng|\bđt\b|line/u.test(before)) return "line";
  return null;
}

const FAIL_EQ = (text: string): SolveFailure =>
  fail(
    "parse",
    L({ en: `I couldn't read the equation “${text}”.`, vi: `Không đọc được phương trình “${text}”.` }),
    L({
      en: "Write planes like (P): 2x − y + 2z − 3 = 0, lines like d: x = 1 + 2t, y = 2 − t, z = 3t, spheres like (S): (x − 1)^2 + y^2 + z^2 = 9.",
      vi: "Viết mặt phẳng dạng (P): 2x − y + 2z − 3 = 0, đường thẳng dạng d: x = 1 + 2t, y = 2 − t, z = 3t, mặt cầu dạng (S): (x − 1)^2 + y^2 + z^2 = 9.",
    }),
  );

function equationObject(eq: RawEq, dim: 2 | 3, auto: () => string): GeoObject | SolveFailure {
  const text = eq.text.trim();
  const parts = text.split("=");
  const line = parametric(text) ?? (dim === 3 && parts.length === 3 ? canonical(text) : null);
  if (line) {
    if (line.p.length !== dim) return FAIL_EQ(text);
    return { kind: "line", name: eq.name ?? auto(), p: line.p, u: line.u };
  }
  if (parts.length !== 2) return FAIL_EQ(text);
  const q = fitQuad(parts[0], parts[1]);
  if (!q) return FAIL_EQ(text);
  if (q.mixed) {
    return fail(
      "unsupported",
      L({ en: `“${text}” has a product like xy, so it isn't a line, plane, circle or sphere.`, vi: `“${text}” có tích kiểu xy, nên không phải đường thẳng, mặt phẳng, đường tròn hay mặt cầu.` }),
      L({ en: "Check the equation for typos.", vi: "Kiểm tra lại phương trình." }),
    );
  }
  const used = q.sq.slice(0, dim);
  if (dim === 2 && (!isZero(q.lin[2]) || !isZero(q.sq[2]))) return FAIL_EQ(text);
  if (used.every(isZero)) {
    const n = q.lin.slice(0, dim);
    if (n.every(isZero)) return FAIL_EQ(text);
    if (dim === 3 || eq.cue === "plane") {
      return { kind: "plane", name: eq.name ?? auto(), n, d: q.c0 };
    }
    // a·x + b·y + c = 0 → a point and the direction (−b; a).
    const [a, b] = n;
    const p = isZero(b) ? [neg(div(q.c0, a)), rat(0)] : [rat(0), neg(div(q.c0, b))];
    return { kind: "line", name: eq.name ?? auto(), p, u: primitive([neg(b), a]) };
  }
  // x², y² (, z²) with the same coefficient: a circle or a sphere.
  const a = used[0];
  if (isZero(a) || used.some((s) => !isZero(sub(s, a)))) {
    return fail(
      "unsupported",
      L({ en: `“${text}” isn't a circle or sphere: the squared terms need equal coefficients.`, vi: `“${text}” không phải đường tròn hay mặt cầu: các bình phương phải có hệ số bằng nhau.` }),
      L({ en: "Ellipses and other curves aren't supported yet.", vi: "Chưa hỗ trợ elip và các đường cong khác." }),
    );
  }
  const c = q.lin.slice(0, dim).map((l) => neg(div(l, mul(rat(2), a))));
  // a·Σ(v − c)² = a·Σc² − c0  ⇒  r² = Σc² − c0/a
  const r2 = sub(c.reduce((s, x) => add(s, mul(x, x)), rat(0)), div(q.c0, a));
  const kind = dim === 3 ? "sphere" : "circle";
  if (r2.n <= 0) {
    return fail(
      "unsupported",
      L({
        en: `“${text}” is not a ${kind}: it would need a radius² of ${r2.n}${r2.d === 1 ? "" : `/${r2.d}`}, which isn't positive.`,
        vi: `“${text}” không phải ${kind === "sphere" ? "mặt cầu" : "đường tròn"}: bán kính bình phương bằng ${r2.n}${r2.d === 1 ? "" : `/${r2.d}`}, không dương.`,
      }),
      L({ en: "For a² + b² + c² − d > 0 the equation is a sphere; check the constant term.", vi: "Phương trình là mặt cầu khi a² + b² + c² − d > 0; kiểm tra lại hằng số." }),
    );
  }
  return { kind, name: eq.name ?? auto(), c, r2 };
}

/* ───────────────────────────── Questions ───────────────────────────── */

const PT = String.raw`([A-Z][0-9']*)`;
const OBJ = String.raw`(\([^()]+\)|[A-Z][0-9']*(?:[A-Z][0-9']*)?|[a-zΔαβγ][0-9']*)`;
const TW = String.raw`(?:(?:hai|two|các|the|điểm|đường thẳng|đt|mặt phẳng|mp|mặt cầu|đường tròn|vectơ|vecto|véctơ|véc tơ|vector|đoạn thẳng|đoạn|point|line|plane|sphere|circle|segment|lines|planes|vectors)\s+)*`;
const VREF = String.raw`(?:\\vec\{|\\overrightarrow\{|vec\s*\(?)?([A-Z][0-9']*[A-Z][0-9']*|[a-z])\}?\)?`;
const AND = String.raw`\s+(?:và|and|với|with)\s+`;
const OF = String.raw`(?:(?:của|of|giữa|between)\s+)?`;
const NUM = String.raw`([\d./]+(?:\s*\*?\s*sqrt\(\d+\))?|sqrt\(\d+\))`;
const NEW_NAME = String.raw`(?:(\([^()]+\)|[a-zΔ][0-9']*)\s+)?`;

type Matcher = { re: RegExp; make: (m: RegExpMatchArray) => Goal | null };

const rx = (s: string) => new RegExp(s, "u");
const isVecText = (s: string) => /vectơ|vecto|véc|vector|vec|overrightarrow/u.test(s);
const nm = (s: string | undefined) => (s ? s.trim() : undefined);

const MATCHERS: Matcher[] = [
  // Plane through A perpendicular to d / parallel to (Q).
  {
    re: rx(String.raw`(?:mặt phẳng|mp|plane)\s+${NEW_NAME}(?:đi\s+)?(?:qua|through|passing through|containing)\s+(?:điểm\s+|point\s+)?${PT}\s+(?:và\s+|and\s+)?(?:(vuông góc|perpendicular|⊥)|(song song|parallel|//))\s+(?:với\s+|to\s+|with\s+)?${TW}${OBJ}`),
    make: (m) => ({ k: "planeThrough", as: nm(m[1]), p: m[2], perp: m[3] ? m[5] : undefined, par: m[4] ? m[5] : undefined }),
  },
  {
    re: rx(String.raw`(?:đường thẳng|đt|line)\s+${NEW_NAME}(?:đi\s+)?(?:qua|through|passing through)\s+(?:điểm\s+|point\s+)?${PT}\s+(?:và\s+|and\s+)?(?:(vuông góc|perpendicular|⊥)|(song song|parallel|//))\s+(?:với\s+|to\s+|with\s+)?${TW}${OBJ}`),
    make: (m) => ({ k: "lineThrough", as: nm(m[1]), p: m[2], perp: m[3] ? m[5] : undefined, par: m[4] ? m[5] : undefined }),
  },
  // Circle / sphere from a centre and a point, a tangent, or a radius.
  {
    re: rx(String.raw`(?:mặt cầu|sphere|đường tròn|circle)\s+${NEW_NAME}(?:có\s+)?(?:tâm|center|centre|centered at|centred at|with cent(?:er|re))\s+${PT}\s*(?:và\s+|and\s+)?(?:(?:đi\s+)?(?:qua|through|passing through)\s+(?:điểm\s+)?${PT}|(?:tiếp xúc|tangent)\s+(?:với\s+|to\s+)?${TW}${OBJ}|(?:có\s+)?(?:bán kính|radius)\s+(?:R\s*=\s*|bằng\s+|=\s*|of\s+)?${NUM})`),
    make: (m) => {
      const radius = m[5] ? number(m[5]) : null;
      return { k: "round", as: nm(m[1]), center: m[2], through: m[3], tangent: m[4], radius: radius ?? undefined };
    },
  },
  {
    re: rx(String.raw`(?:mặt cầu|sphere|đường tròn|circle)\s+${NEW_NAME}(?:có\s+|with\s+)?(?:đường kính|diameter)\s+${PT}${PT}`),
    make: (m) => ({ k: "round", as: nm(m[1]), diameter: [m[2], m[3]] }),
  },
  {
    re: rx(String.raw`(?:(?:mặt cầu|đường tròn)\s+${NEW_NAME}ngoại tiếp\s+(?:tam giác\s+|tứ diện\s+)?|(?:circumcircle|circumsphere|circumscribed (?:circle|sphere))\s+(?:of\s+)?(?:the\s+)?(?:triangle\s+|tetrahedron\s+)?)${PT}\s*${PT}\s*${PT}\s*${PT}?`),
    make: (m) => ({ k: "round", as: nm(m[1]), circum: [m[2], m[3], m[4], m[5]].filter(Boolean) }),
  },
  // Distances.
  {
    re: rx(String.raw`(?:khoảng cách|distance)\s+(?:từ\s+|from\s+)${TW}${OBJ}\s+(?:đến|tới|to)\s+${TW}${OBJ}`),
    make: (m) => ({ k: "distance", x: m[1], y: m[2] }),
  },
  {
    re: rx(String.raw`(?:khoảng cách|distance)\s+(?:giữa|between)\s+${TW}${OBJ}${AND}${TW}${OBJ}`),
    make: (m) => ({ k: "distance", x: m[1], y: m[2] }),
  },
  { re: rx(String.raw`(?:^|[^\p{L}])d\s*\(\s*${OBJ}\s*[,;]\s*${OBJ}\s*\)`), make: (m) => ({ k: "distance", x: m[1], y: m[2] }) },
  // Angles.
  {
    re: rx(String.raw`(?:góc|angle)\s+(?:giữa|between|of)\s+(${TW})${OBJ}${AND}${TW}${OBJ}`),
    make: (m) => ({ k: "angle", x: m[2], y: m[3], vectors: isVecText(m[1]) }),
  },
  {
    re: rx(String.raw`(?:góc|angle|cos)\s*\(\s*(\\vec\{|\\overrightarrow\{|vec\s*)?${OBJ}\}?\s*[,;]\s*(?:\\vec\{|\\overrightarrow\{|vec\s*)?${OBJ}\}?\s*\)`),
    make: (m) => ({ k: "angle", x: m[2], y: m[3], vectors: !!m[1] || (/^[a-z]$/.test(m[2]) && /^[a-z]$/.test(m[3])) }),
  },
  // Intersections, projections, reflections, relative position.
  {
    re: rx(String.raw`(?:giao điểm|giao tuyến|intersection|giao)\s+${OF}${TW}${OBJ}${AND}${TW}${OBJ}`),
    make: (m) => ({ k: "intersect", x: m[1], y: m[2] }),
  },
  { re: rx(String.raw`${OBJ}\s*(?:∩|\\cap|\bcap\b)\s*${OBJ}`), make: (m) => ({ k: "intersect", x: m[1], y: m[2] }) },
  {
    re: rx(String.raw`(?:hình chiếu|projection)\s+(?:vuông góc\s+)?(?:của\s+|of\s+)?(?:điểm\s+|point\s+)?${PT}\s+(?:lên|trên|xuống|onto|on|to)\s+${TW}${OBJ}`),
    make: (m) => ({ k: "project", p: m[1], onto: m[2] }),
  },
  {
    re: rx(String.raw`(?:đối xứng|reflection|mirror image|symmetric point|image)\s+(?:của\s+|of\s+)?(?:điểm\s+|point\s+)?${PT}\s+(?:qua|across|over|in|through|about|with respect to)\s+${TW}${OBJ}`),
    make: (m) => ({ k: "reflect", p: m[1], onto: m[2] }),
  },
  {
    re: rx(String.raw`(?:vị trí tương đối|relative position|position)\s+${OF}${TW}${OBJ}${AND}${TW}${OBJ}`),
    make: (m) => ({ k: "position", x: m[1], y: m[2] }),
  },
  // Triangle and tetrahedron measures.
  {
    re: rx(String.raw`(?:diện tích|area)\s+(?:của\s+|of\s+)?(?:the\s+)?(?:tam giác\s+|triangle\s+)?${PT}${PT}${PT}`),
    make: (m) => ({ k: "area", pts: [m[1], m[2], m[3]] }),
  },
  { re: rx(String.raw`(?:^|[^\p{L}(])S\s*_?\s*[({]?\s*${PT}${PT}${PT}\s*[)}]?`), make: (m) => ({ k: "area", pts: [m[1], m[2], m[3]] }) },
  {
    re: rx(String.raw`(?:chu vi|perimeter)\s+(?:của\s+|of\s+)?(?:the\s+)?(?:tam giác\s+|triangle\s+)?${PT}${PT}${PT}`),
    make: (m) => ({ k: "perimeter", pts: [m[1], m[2], m[3]] }),
  },
  {
    re: rx(String.raw`(?:thể tích|volume)\s+(?:của\s+|of\s+)?(?:the\s+)?(?:khối\s+)?(?:tứ diện\s+|tetrahedron\s+)?${PT}${PT}${PT}${PT}`),
    make: (m) => ({ k: "volume", pts: [m[1], m[2], m[3], m[4]] }),
  },
  { re: rx(String.raw`(?:^|[^\p{L}(])V\s*_?\s*[({]?\s*${PT}${PT}${PT}${PT}\s*[)}]?`), make: (m) => ({ k: "volume", pts: [m[1], m[2], m[3], m[4]] }) },
  // Special points.
  {
    re: rx(String.raw`(?:${PT}\s+(?:là|is(?: the)?)\s+)?(?:trọng tâm|centroid)\s+(?:${PT}\s+)?(?:của\s+|of\s+)?(?:the\s+)?(?:tam giác\s+|triangle\s+|tứ diện\s+|tetrahedron\s+)?${PT}${PT}${PT}${PT}?`),
    make: (m) => ({ k: "centroid", as: m[1] ?? m[2], pts: [m[3], m[4], m[5], m[6]].filter(Boolean) }),
  },
  {
    re: rx(String.raw`(?:${PT}\s+(?:là|is(?: the)?)\s+)?(?:trung điểm|midpoint)\s+(?:${PT}\s+)?(?:của\s+|of\s+)?(?:the\s+)?(?:đoạn\s+(?:thẳng\s+)?|segment\s+)?${PT}${PT}`),
    make: (m) => ({ k: "midpoint", as: m[1] ?? m[2], a: m[3], b: m[4] }),
  },
  // Products.
  {
    re: rx(String.raw`(?:tích vô hướng|dot product|scalar product)\s+(?:của\s+|of\s+)?${TW}${VREF}${AND}${TW}${VREF}`),
    make: (m) => ({ k: "dot", u: m[1], v: m[2] }),
  },
  {
    re: rx(String.raw`(?:tích có hướng|cross product|vector product)\s+(?:của\s+|of\s+)?${TW}${VREF}${AND}${TW}${VREF}`),
    make: (m) => ({ k: "cross", u: m[1], v: m[2] }),
  },
  { re: rx(String.raw`\[\s*${VREF}\s*[,;]\s*${VREF}\s*\]`), make: (m) => ({ k: "cross", u: m[1], v: m[2] }) },
  { re: rx(String.raw`${VREF}\s*✕\s*${VREF}`), make: (m) => ({ k: "cross", u: m[1], v: m[2] }) },
  { re: rx(String.raw`(?:^|\s)${VREF}\s*(?:\.|\*)\s*${VREF}(?:\s|$|\?|=)`), make: (m) => ({ k: "dot", u: m[1], v: m[2] }) },
  // Centre and radius.
  {
    re: rx(String.raw`(?:tâm|center|centre)\s+(?:và|and)\s+(?:bán kính|radius)\s+(?:của\s+|of\s+)?(?:the\s+)?${TW}${OBJ}`),
    make: (m) => ({ k: "center", ref: m[1] }),
  },
  {
    re: rx(String.raw`(?:bán kính|radius|tâm|center|centre)\s+(?:của\s+|of\s+)(?:the\s+)?${TW}${OBJ}`),
    make: (m) => ({ k: "center", ref: m[1] }),
  },
  // Plane through three points, line through two.
  {
    re: rx(String.raw`(?:mặt phẳng|mp|plane)\s*(?:đi\s+)?(?:qua\s+|through\s+|passing through\s+|containing\s+)?(?:ba\s+điểm\s+|3\s+điểm\s+|the\s+)?(?:three\s+|3\s+)?(?:points\s+)?\(?${PT}\s*(?:và\s+|and\s+)?${PT}\s*(?:và\s+|and\s+)?${PT}\)?`),
    make: (m) => ({ k: "plane3", pts: [m[1], m[2], m[3]] }),
  },
  { re: rx(String.raw`^\s*(?:viết|write|tìm|find|lập)?[^()]*\(${PT}${PT}${PT}\)\s*\??\s*$`), make: (m) => ({ k: "plane3", pts: [m[1], m[2], m[3]] }) },
  {
    re: rx(String.raw`(?:đường thẳng|đt|line)\s+(?:đi\s+)?(?:qua\s+(?:hai\s+điểm\s+)?|through\s+(?:the\s+)?(?:points\s+)?)?${PT}\s*(?:và\s+|and\s+)?${PT}(?![\p{L}\d'])`),
    make: (m) => ({ k: "line2pts", a: m[1], b: m[2] }),
  },
  // Vectors and lengths.
  {
    re: rx(String.raw`(?:vectơ|vecto|véctơ|véc tơ|vector|vec)\s*\(?\{?${PT}${PT}`),
    make: (m) => ({ k: "vector", a: m[1], b: m[2] }),
  },
  { re: rx(String.raw`\\overrightarrow\{${PT}${PT}\}`), make: (m) => ({ k: "vector", a: m[1], b: m[2] }) },
  {
    re: rx(String.raw`(?:độ dài|length)\s+(?:của\s+|of\s+)?(?:the\s+)?(?:đoạn\s+(?:thẳng\s+)?|segment\s+|vectơ\s+|vector\s+)?([A-Z][0-9']*[A-Z][0-9']*|[a-z])(?![\p{L}\d'])`),
    make: (m) => ({ k: "length", ref: m[1] }),
  },
  { re: rx(String.raw`\|\s*(?:\\vec\{|\\overrightarrow\{|vec\s*)?([A-Z][0-9']*[A-Z][0-9']*|[a-z])\}?\s*\|`), make: (m) => ({ k: "length", ref: m[1] }) },
  {
    re: rx(String.raw`^\s*(?:tính\s+|find\s+|compute\s+)?([A-Z][0-9']*[A-Z][0-9']*)\s*(?:=\s*\?)?\s*\??\s*$`),
    make: (m) => ({ k: "length", ref: m[1] }),
  },
];

/** Every question in a piece of text, in reading order. */
function goalsIn(text: string): { goals: Goal[]; rest: string } {
  const found: Array<{ at: number; goal: Goal }> = [];
  let rest = text;
  for (const { re, make } of MATCHERS) {
    for (let guard = 0; guard < 6; guard++) {
      const m = rest.match(re);
      if (!m || m.index === undefined) break;
      const goal = make(m);
      if (goal) found.push({ at: m.index, goal });
      rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
    }
  }
  return { goals: found.sort((a, b) => a.at - b.at).map((f) => f.goal), rest };
}

/** Words that carry no data or question (“Trong không gian Oxyz, cho…”). */
const FILLER =
  /(?<!\p{L})(trong|không gian|mặt phẳng|tọa độ|toạ độ|hệ|trục|oxyz|oxy|cho|các|điểm|và|biết|với|có|hãy|tính|tìm|viết|lập|phương trình|của|là|in|the|space|plane|coordinate|coordinates|system|given|let|points?|and|with|consider|find|compute|calculate|write|equation|of|a|an|đường thẳng|đường tròn|mặt cầu|line|circle|sphere|vectơ|vector|tam giác|triangle|tứ diện|tetrahedron)(?!\p{L})/giu;

/* ───────────────────────────── Parse ───────────────────────────── */

export function parseGeometry(raw: string): GeoProblem | SolveFailure {
  const s = clean(raw);
  if (!s.trim()) return fail("empty", L({ en: "There is nothing to solve yet.", vi: "Chưa có gì để giải." }), "");
  const lower = s.toLowerCase();
  const hint3 = /oxyz|không gian|\bspace\b|mặt cầu|sphere|tứ diện|tetrahedron|thể tích|volume/u.test(lower);
  const hint2 = /\boxy\b(?!z)|đường tròn|circle/u.test(lower);

  const points: Point[] = [];
  const vectors: Vector[] = [];
  const equations: RawEq[] = [];
  const texts: string[] = [];

  for (const { text: frag, join } of fragments(s)) {
    // A named equation “(P): …”, “d: …”, “(S) có phương trình …”.
    const named = frag.match(/^(.*?)(\([^()]+\)|(?<![\p{L}\d])[a-zA-ZΔαβγ][0-9']*)\s*(?::|có phương trình|có pt|with equation|has equation)\s*(.*=.*)$/u);
    let rest = frag;
    const isNamed = !!named && /[xyz]/.test(named[3]) && !/^[A-Z][0-9']*$/.test(named[2]);
    if (named && isNamed) {
      equations.push({ name: named[2], text: named[3], cue: cueOf(named[1]) });
      // The words before it may hold a question about it: “…tiếp xúc với (P): …”.
      rest = `${named[1]} ${named[2]}`;
    }
    // Points A(1; 2; 3) and vectors u(1; 2; 3) / u = (1; 2; 3) / \vec{u}(…).
    const decl = /(?:\\vec\{|\\overrightarrow\{|vec\s*)?(?<![\p{L}\d'])([A-Z][0-9']*|[a-wΔ][0-9']*)\}?\s*=?\s*\(([^()]*)\)/gu;
    rest = rest.replace(decl, (whole, name: string, inner: string) => {
      const at = coordinates(inner);
      if (!at) return whole;
      if (/^[A-Z]/.test(name)) points.push({ kind: "point", name, at });
      else vectors.push({ kind: "vector", name, v: at });
      // Keep the name: the same sentence may ask about it (“mặt cầu tâm I(1; 2; 3) đi qua A”).
      return ` ${name} `;
    });
    // A bare equation after a cue word: “mặt phẳng 2x − y + 2z − 3 = 0”.
    const bare = rest.match(/^(.*?)([-+(\d.]*[xyz][^=]*=[^=]+(?:=[^=]+)?)$/u);
    if (!isNamed && bare && !/[A-Z]/.test(bare[2]) && !/[a-wΔ]\s*\(/.test(bare[2])) {
      const vars = bare[2].replace(/sqrt/g, "").match(/[a-z]/g) ?? [];
      if (vars.every((v) => "xyzt".includes(v))) {
        equations.push({ name: null, text: bare[2], cue: cueOf(bare[1]) });
        rest = bare[1];
      }
    }
    if (join && texts.length) texts[texts.length - 1] += ` ${join} ${rest}`;
    else texts.push(rest);
  }

  const dim: 2 | 3 =
    points.some((p) => p.at.length === 3) ||
    vectors.some((v) => v.v.length === 3) ||
    equations.some((e) => /z/.test(e.text) || e.cue === "sphere") ||
    (hint3 && !hint2)
      ? 3
      : 2;

  const objects = new Map<string, GeoObject>();
  for (const o of [...points, ...vectors]) {
    if (o.kind === "point" ? o.at.length !== dim : o.v.length !== dim) {
      return fail(
        "parse",
        L({ en: `${o.name} has ${o.kind === "point" ? o.at.length : o.v.length} coordinates, but this problem is in ${dim === 3 ? "space (3 coordinates)" : "the plane (2 coordinates)"}.`, vi: `${o.name} có ${o.kind === "point" ? o.at.length : o.v.length} tọa độ, nhưng bài toán này ở trong ${dim === 3 ? "không gian (3 tọa độ)" : "mặt phẳng (2 tọa độ)"}.` }),
        L({ en: "Give every point the same number of coordinates.", vi: "Cho mọi điểm cùng số tọa độ." }),
      );
    }
    objects.set(o.name, o);
  }
  const counters: Record<string, number> = {};
  const autoName = (base: string) => () => {
    counters[base] = (counters[base] ?? 0) + 1;
    const n = counters[base];
    const name = base.startsWith("(") ? `(${base.slice(1, -1)}${n > 1 ? n : ""})` : `${base}${n > 1 ? n : ""}`;
    return objects.has(name) ? `${name}'` : name;
  };
  for (const eq of equations) {
    const kindGuess = eq.cue ?? (/[xyz]\s*=.*[a-wΔ]/.test(eq.text) ? "line" : null);
    const base = kindGuess === "sphere" ? "(S)" : kindGuess === "circle" ? "(C)" : kindGuess === "line" ? "d" : dim === 3 ? "(P)" : "d";
    const o = equationObject(eq, dim, autoName(base));
    if ("ok" in o) return o;
    // A bare quadratic named after a cue-less guess: rename (P) → (S) / d → (C).
    if (!eq.name && (o.kind === "sphere" || o.kind === "circle") && base !== "(S)" && base !== "(C)") {
      o.name = autoName(o.kind === "sphere" ? "(S)" : "(C)")();
    }
    objects.set(o.name, o);
  }

  const goals: Goal[] = [];
  const skipped: string[] = [];
  for (const text of texts) {
    const found = goalsIn(text);
    goals.push(...found.goals);
    const leftover = found.rest.replace(FILLER, " ").replace(/[^\p{L}\d]+/gu, " ").trim();
    // Only a piece with no question is reported (names like ABC don't count as words).
    if (!found.goals.length && /\p{Ll}{2,}/u.test(leftover)) skipped.push(text.trim());
  }

  if (objects.size === 0) {
    return fail(
      "parse",
      L({ en: "I couldn't find any points, lines, planes or spheres here.", vi: "Không tìm thấy điểm, đường thẳng, mặt phẳng hay mặt cầu nào." }),
      L({ en: "Give coordinates like A(1; 2; 3) and equations like (P): x + y + z − 3 = 0.", vi: "Cho tọa độ dạng A(1; 2; 3) và phương trình dạng (P): x + y + z − 3 = 0." }),
    );
  }
  return { dim, objects, goals, skipped };
}
