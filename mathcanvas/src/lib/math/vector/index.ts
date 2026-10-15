import type { AnswerCheck } from "../check";
import { clean, hasCoordinates } from "../geometry/parse";
import type { GraphCurve, GraphMark, GraphSpec } from "../graph";
import { L } from "../lang";
import { readAnswer } from "../measure";
import { MeasureError, RAD, Steps, type Text, VAL, close, degTex, measureTex, oops, ratioTex, readValue, toFraction } from "../measure/num";
import { angleMap, lengths, solveTri } from "../measure/space";
import { normalizeInput } from "../polynomial";
import { finalize } from "../steps";
import type { MathSolution, SolveFailure, SolveResult } from "../types";

/**
 * Grade 10 vectors without coordinates: a figure (triangle, parallelogram…)
 * with its named points, and questions about vectors in it — prove an
 * identity, write a vector in terms of two others, find the point a vector
 * equation defines, and dot products, lengths and angles.
 *
 * Every point is kept exactly as a combination of the figure's free points
 * (M = ½B + ½C, G = ⅓A + ⅓B + ⅓C, C = B + D − A in a parallelogram), so an
 * identity is proved the textbook way: write every vector from one origin
 * and compare coefficients. Coordinates are used only for measures and the
 * figure.
 */

type P2 = [number, number];
/** Σ k·(b − a): vectors AB written as [k, a, b]. */
type Expr = Array<{ k: number; a: string; b: string }>;
/** A point (or vector) as weights on free points. */
type Lin = Map<string, number>;
type Shape = "triangle" | "equilateral" | "right" | "isosceles" | "square" | "rectangle" | "rhombus" | "parallelogram" | "trapezoid" | "quad" | "points";

type Fig = {
  pts: Map<string, P2>;
  base: string[];
  shape: Shape;
  /** Free points: everything else is a combination of them. */
  symbols: string[];
  comb: Map<string, Lin>;
  why: Map<string, Text>;
  sym: string | null;
  /** Lengths were given (dot products and lengths need them). */
  sized: boolean;
};

export type VectorAnswer = { key: string; latex: string; value: number | null; degrees?: boolean; vec?: P2 };

const VEC_WORDS = /vectơ|vecto|véctơ|véc tơ|vector|\\vec|\\overrightarrow|→|tích vô hướng|dot product/iu;

export function isVectorProblem(raw: string): boolean {
  const s = raw.normalize("NFC");
  if (!VEC_WORDS.test(s) || hasCoordinates(s) || /oxyz?|tọa độ|toạ độ|coordinates?/iu.test(s)) return false;
  return !/(?<![A-Z])[A-Z]\.[A-Z]{3,4}(?![A-Z'])|lăng trụ|prism|hình chóp|pyramid/u.test(s);
}

/* ───────────────────────────── Reading vectors ───────────────────────────── */

const NM = String.raw`[A-Z][0-9']*`;

/** Vector notations → @AB tokens (and @0 for the zero vector). */
function vecText(s: string): string {
  return s
    .replace(new RegExp(String.raw`\\(?:overrightarrow|vec)\s*\{\s*(${NM}${NM}|0)\s*\}`, "g"), "@$1")
    .replace(new RegExp(String.raw`(?:vectơ|vecto|véctơ|véc tơ|vector|vec)\s*(?:\(\s*(${NM}${NM}|0)\s*\)|(${NM}${NM}|0)(?![A-Za-z]))`, "gu"), "@$1$2")
    .replace(new RegExp(String.raw`(${NM}${NM})\s*→`, "g"), "@$1");
}

const pair = (t: string): [string, string] => t.match(new RegExp(NM, "g")) as [string, string];
const frac = (t: string) => {
  const [n, d] = t.replace(",", ".").split("/").map((x) => Number(x.trim()));
  return d ? n / d : n;
};

/** “@MA + 2@MB − 1/2@MC” (a bare AB counts as a vector inside a vector sentence). */
function parseExpr(t: string): Expr | null {
  // Only the expression itself: up to the first word (“… = 0 và điểm N …”) or a sentence stop.
  const head = t.trim().match(/^[\s@A-Z0-9'+\-*/.,]*/)?.[0] ?? "";
  const s = head.replace(/[\s.,]+$/, "").replace(new RegExp(String.raw`(?<![A-Z@'])(${NM}${NM})(?![A-Z'(])`, "g"), "@$1");
  if (!s) return null;
  const out: Expr = [];
  const re = new RegExp(String.raw`\s*([+-])?\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)?\s*\*?\s*(?:@(${NM}${NM}|0)|(0))\s*(?:\/\s*(\d+))?\s*`, "y");
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || re.lastIndex === pos) return null;
    pos = re.lastIndex;
    const k = (m[1] === "-" ? -1 : 1) * (m[2] ? frac(m[2]) : 1) / (m[5] ? Number(m[5]) : 1);
    const name = m[3] ?? m[4];
    if (name === "0") continue;
    const [a, b] = pair(name);
    out.push({ k, a, b });
  }
  return out;
}

/* ───────────────────────────── Exact combinations ───────────────────────────── */

const addTo = (m: Lin, k: string, v: number) => {
  const x = (m.get(k) ?? 0) + v;
  if (Math.abs(x) < 1e-12) m.delete(k);
  else m.set(k, x);
};
const scaleLin = (m: Lin, k: number): Lin => new Map([...m].map(([p, v]) => [p, v * k]));
const sumLin = (...ms: Lin[]): Lin => {
  const out: Lin = new Map();
  for (const m of ms) for (const [p, v] of m) addTo(out, p, v);
  return out;
};
const sameLin = (a: Lin, b: Lin) => {
  const d = sumLin(a, scaleLin(b, -1));
  return [...d.values()].every((v) => Math.abs(v) < 1e-9);
};
/** Snap to a simple fraction (the weights come from the text: ½, ⅔ …). */
const snap = (x: number) => {
  const f = toFraction(x, 1000);
  return f ? f.n / f.d : x;
};

/* ───────────────────────────── The figure ───────────────────────────── */

const is = String.raw`\s*(?:(?:bằng|là|=|of|is)\s*)?`;

function buildFigure(s: string): Fig {
  let sym: string | null = null;
  const setSym = (v: { sym: string | null }) => {
    sym = v.sym ?? sym;
  };
  const len = lengths(s, setSym);
  const ang = angleMap(s);
  const seg = (a: string, b: string) => len.get(a + b);
  const edgeM = s.match(new RegExp(String.raw`(?:cạnh|side|edge)${is}${VAL}`, "u"));
  const edgeV = edgeM ? readValue(edgeM[1]) : null;
  if (edgeV) setSym(edgeV);
  const edge = edgeV?.value;
  const pts = new Map<string, P2>();
  const why = new Map<string, Text>();
  const comb = new Map<string, Lin>();
  let sized = false;
  const tri = s.match(/(?:tam giác|triangle)\s+(?:đều\s+|vuông\s+|cân\s+|equilateral\s+|right\s+|isosceles\s+)*([A-Z])([A-Z])([A-Z])(?![A-Z])/u);
  const quad = s.match(/(?:hình vuông|hình chữ nhật|hình thoi|hình bình hành|hình thang|tứ giác|square|rectangle|rhombus|parallelogram|trapezoid|quadrilateral)\s+([A-Z])([A-Z])([A-Z])([A-Z])(?![A-Z])/u);
  let base: string[];
  let shape: Shape;
  let symbols: string[];
  if (quad && (!tri || (quad.index ?? 0) < (tri.index ?? 0))) {
    base = [quad[1], quad[2], quad[3], quad[4]];
    const w = quad[0];
    shape = /vuông|square/u.test(w) ? "square" : /chữ nhật|rectangle/u.test(w) ? "rectangle" : /thoi|rhombus/u.test(w) ? "rhombus" : /bình hành|parallelogram/u.test(w) ? "parallelogram" : /thang|trapezoid/u.test(w) ? "trapezoid" : "quad";
    const [A, B, C, D] = base;
    let p = seg(A, B) ?? seg(C, D) ?? edge;
    let q = seg(A, D) ?? seg(B, C) ?? (shape === "square" || shape === "rhombus" ? p : undefined);
    const abc = ang.get(A + B + C);
    let th = ang.get(B + A + D) ?? ang.get(A) ?? (abc !== undefined ? 180 - abc : undefined);
    if (shape === "square" || shape === "rectangle") th = 90;
    sized = p !== undefined && q !== undefined && th !== undefined;
    p ??= 1;
    q ??= shape === "square" || shape === "rhombus" ? p : 1.37;
    th ??= shape === "quad" || shape === "trapezoid" ? 74 : 63;
    const t = th * RAD;
    pts.set(A, [0, 0]);
    pts.set(B, [p, 0]);
    pts.set(D, [q * Math.cos(t), q * Math.sin(t)]);
    symbols = [A, B, D];
    if (shape === "trapezoid") {
      // AB ∥ DC with AB = k·DC (“AB = 2CD”), else k = 2: C = D + (B − A)/k.
      const r = s.match(new RegExp(String.raw`${A}${B}\s*=\s*(\d+(?:\/\d+)?)\s*(?:${D}${C}|${C}${D})`, "u"));
      const k = r ? frac(r[1]) : 2;
      comb.set(C, new Map([[D, 1], [B, 1 / k], [A, -1 / k]]));
      why.set(C, { en: `${A}${B} ∥ ${D}${C} and ${A}${B} = ${k}${D}${C}`, vi: `${A}${B} ∥ ${D}${C} và ${A}${B} = ${k}${D}${C}` });
      sized = false;
    } else if (shape === "quad") {
      pts.set(C, [p * 1.15 + 0.2, q * 0.9 + 0.35]);
      symbols = [A, B, C, D];
      sized = false;
    } else {
      comb.set(C, new Map([[B, 1], [D, 1], [A, -1]]));
      why.set(C, { en: "parallelogram rule", vi: "quy tắc hình bình hành" });
    }
  } else if (tri) {
    base = [tri[1], tri[2], tri[3]];
    symbols = [...base];
    // “Equilateral triangle ABC”, “tam giác ABC đều”: the words around the name.
    const w = s.slice(Math.max(0, (tri.index ?? 0) - 16), (tri.index ?? 0) + 80);
    const at = w.match(/(?:tại|at)\s+([A-Z])/u)?.[1];
    shape = /đều|equilateral/u.test(w) ? "equilateral" : /vuông|right/u.test(w) ? "right" : /cân|isosceles/u.test(w) ? "isosceles" : "triangle";
    const side = base.map((_, i) => seg(base[(i + 1) % 3], base[(i + 2) % 3]));
    const A = base.map((v, i) => ang.get(base[(i + 2) % 3] + v + base[(i + 1) % 3]) ?? ang.get(v));
    const i = at && base.includes(at) ? base.indexOf(at) : 0;
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    if (shape === "equilateral") {
      side.fill(side.find((x) => x !== undefined) ?? edge);
      A.fill(60);
    } else if (shape === "right") A[i] = 90;
    else if (shape === "isosceles") {
      side[j] ??= side[k];
      side[k] ??= side[j];
    }
    let sides = side.some((x) => x !== undefined) ? solveTri(side, A) : null;
    sized = sides !== null;
    if (!sides) {
      sides =
        shape === "equilateral" ? [1, 1, 1]
        : shape === "right" ? solveTri([0, 1, 2].map((x) => (x === i ? undefined : x === j ? 1.37 : 1.11)), [0, 1, 2].map((x) => (x === i ? 90 : undefined)))
        : shape === "isosceles" ? solveTri([0, 1, 2].map((x) => (x === i ? undefined : 1.2)), [0, 1, 2].map((x) => (x === i ? 52 : undefined)))
        : [1.29, 1.07, 1.41];
    }
    const [a, b, c] = sides!;
    pts.set(base[0], [0, 0]);
    pts.set(base[1], [c, 0]);
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    pts.set(base[2], [b * cosA, b * Math.sqrt(Math.max(0, 1 - cosA * cosA))]);
  } else {
    // Just points (“cho bốn điểm A, B, C, D”): every one is free.
    const names = [...new Set(s.match(new RegExp(String.raw`(?<![\p{L}@'\d])${NM}(?![\p{L}'])`, "gu")) ?? [])].slice(0, 6);
    if (names.length < 2) oops({ en: "I couldn't find the figure (like triangle ABC or parallelogram ABCD).", vi: "Chưa tìm thấy hình (như tam giác ABC hoặc hình bình hành ABCD)." }, { en: "Start with e.g. “Cho tam giác ABC…”.", vi: "Bắt đầu bằng ví dụ “Cho tam giác ABC…”." });
    const spots: P2[] = [[0, 0], [1.31, 0.07], [0.47, 1.19], [1.63, 1.27], [-0.41, 0.83], [2.1, 0.5]];
    names.forEach((n, i) => pts.set(n, spots[i]));
    base = names;
    shape = "points";
    symbols = names;
  }
  const fig: Fig = { pts, base, shape, symbols, comb, why, sym, sized };
  for (const [p] of comb) pts.set(p, place(fig, comb.get(p)!));
  derive(s, fig);
  return fig;
}

/** A point's position from its weights. */
function place(f: Fig, w: Lin): P2 {
  let x = 0;
  let y = 0;
  for (const [p, k] of w) {
    const at = f.pts.get(p)!;
    x += k * at[0];
    y += k * at[1];
  }
  return [x, y];
}

/** A point as weights on the free points. */
function expand(f: Fig, p: string): Lin | null {
  if (f.symbols.includes(p)) return new Map([[p, 1]]);
  const w = f.comb.get(p);
  if (!w) return null;
  const parts: Lin[] = [];
  for (const [q, k] of w) {
    const e = expand(f, q);
    if (!e) return null;
    parts.push(scaleLin(e, k));
  }
  return sumLin(...parts);
}

/** Σ k·(b − a) as weights on the free points. */
function linOf(f: Fig, e: Expr): Lin | null {
  const parts: Lin[] = [];
  for (const t of e) {
    const a = expand(f, t.a);
    const b = expand(f, t.b);
    if (!a || !b) return null;
    parts.push(scaleLin(sumLin(b, scaleLin(a, -1)), t.k));
  }
  return sumLin(...parts);
}

/** Points defined in the text: midpoints, centroids, centres, symmetric points, points on a side, vector equations. */
function derive(s: string, f: Fig) {
  const has = (x: string) => f.pts.has(x);
  const def = (p: string, w: Lin, text: Text) => {
    if (has(p) || [...w.keys()].some((q) => !has(q))) return false;
    f.comb.set(p, w);
    f.pts.set(p, place(f, w));
    f.why.set(p, text);
    return true;
  };
  const half = (x: string, y: string): Lin => new Map([[x, 0.5], [y, 0.5]]);
  for (let pass = 0; pass < 4; pass++) {
    let added = false;
    for (const m of s.matchAll(/(?<![A-Z0-9'@])([A-Z](?:[\s,]+(?:và\s+|and\s+)?[A-Z])*)\s+(?:lần lượt\s+)?(?:là|are|is)\s+(?:the\s+)?(?:các\s+)?(?:trung điểm|midpoints?)\s+(?:của\s+|of\s+)?(?:các\s+)?(?:cạnh\s+|đoạn\s+)?((?:[A-Z]{2})(?:[\s,]+(?:và\s+|and\s+)?(?:cạnh\s+)?[A-Z]{2})*)/gu)) {
      const segs = m[2].split(/[\s,]+|và|and/u).map((x) => x.replace(/^cạnh/, "")).filter((x) => /^[A-Z]{2}$/.test(x));
      // “trọng tâm G, M là trung điểm BC”: the names just before “là” go with the segments.
      const names = m[1].split(/[\s,]+|và|and/u).filter((x) => /^[A-Z]$/.test(x)).slice(-segs.length);
      names.forEach((p, i) => {
        const sg = segs[i];
        if (sg) added = def(p, half(sg[0], sg[1]), { en: `${p} is the midpoint of ${sg}`, vi: `${p} là trung điểm của ${sg}` }) || added;
      });
    }
    for (const m of s.matchAll(/(?:trung điểm|midpoint)\s+([A-Z])\s+(?:của\s+|of\s+)?(?:cạnh\s+|đoạn\s+)?([A-Z])([A-Z])/gu)) {
      added = def(m[1], half(m[2], m[3]), { en: `${m[1]} is the midpoint of ${m[2]}${m[3]}`, vi: `${m[1]} là trung điểm của ${m[2]}${m[3]}` }) || added;
    }
    for (const m of s.matchAll(/([A-Z])\s+(?:là|is)\s+(?:the\s+)?(trọng tâm|centroid|tâm|centre|center|giao điểm|intersection)(?:\s+(?:của\s+|of\s+)?(?:tam giác\s+|triangle\s+|hình bình hành\s+|the\s+)?([A-Z]{3,4}))?/gu)) {
      const of = m[3] && [...m[3]].every(has) ? m[3].split("") : f.base;
      if (/trọng tâm|centroid/u.test(m[2])) added = def(m[1], new Map(of.map((x) => [x, 1 / of.length])), { en: `${m[1]} is the centroid of ${of.join("")}`, vi: `${m[1]} là trọng tâm tam giác ${of.join("")}` }) || added;
      else if (of.length === 4) added = def(m[1], half(of[0], of[2]), { en: `${m[1]} is the centre of ${of.join("")} (the midpoint of ${of[0]}${of[2]})`, vi: `${m[1]} là tâm của ${of.join("")} (trung điểm ${of[0]}${of[2]})` }) || added;
    }
    // “tam giác ABC có trọng tâm G”, “G, the centroid of …”.
    for (const m of s.matchAll(/(?:trọng tâm|centroid)\s+([A-Z])(?![A-Z])(?:\s+(?:của\s+|of\s+)?(?:tam giác\s+|triangle\s+)?([A-Z]{3})(?![A-Z]))?/gu)) {
      const of = m[2] && [...m[2]].every(has) ? m[2].split("") : f.base.slice(0, 3);
      added = def(m[1], new Map(of.map((x) => [x, 1 / 3])), { en: `${m[1]} is the centroid of ${of.join("")}`, vi: `${m[1]} là trọng tâm tam giác ${of.join("")}` }) || added;
    }
    for (const m of s.matchAll(/(?:hình vuông|hình chữ nhật|hình thoi|hình bình hành|square|rectangle|rhombus|parallelogram)\s+(?:[A-Z]{4}\s+)?(?:có\s+|with\s+)?(?:tâm|cent(?:re|er))\s+([A-Z])(?![A-Z])/gu)) {
      if (f.base.length === 4) added = def(m[1], half(f.base[0], f.base[2]), { en: `${m[1]} is the centre of ${f.base.join("")} (the midpoint of ${f.base[0]}${f.base[2]})`, vi: `${m[1]} là tâm của ${f.base.join("")} (trung điểm ${f.base[0]}${f.base[2]})` }) || added;
    }
    // D đối xứng với A qua B: D = 2B − A.
    for (const m of s.matchAll(/([A-Z])\s+(?:là\s+(?:điểm\s+)?)?đối xứng (?:với|của)\s+([A-Z])\s+qua\s+([A-Z])|([A-Z])\s+is the reflection of\s+([A-Z])\s+(?:in|through|across)\s+([A-Z])/gu)) {
      const [p, a, o] = m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
      added = def(p, new Map([[o, 2], [a, -1]]), { en: `${o} is the midpoint of ${a}${p}`, vi: `${o} là trung điểm của ${a}${p}` }) || added;
    }
    // ABCE là hình bình hành: E = A + C − B.
    for (const m of s.matchAll(/([A-Z])([A-Z])([A-Z])([A-Z])\s+(?:là|is)\s+(?:một\s+|a\s+)?(?:hình bình hành|parallelogram)/gu)) {
      const nm = [m[1], m[2], m[3], m[4]];
      const miss = nm.filter((x) => !has(x));
      if (miss.length !== 1) continue;
      const i = nm.indexOf(miss[0]);
      added = def(miss[0], new Map([[nm[(i + 3) % 4], 1], [nm[(i + 1) % 4], 1], [nm[(i + 2) % 4], -1]]), { en: `${nm.join("")} is a parallelogram`, vi: `${nm.join("")} là hình bình hành` }) || added;
    }
    // N thuộc AC sao cho AN = 2NC.
    for (const m of s.matchAll(/([A-Z])\s+(?:là\s+(?:một\s+)?điểm\s+|is a point\s+|is\s+)?(?:thuộc|trên|nằm trên|on|lies on)\s+(?:cạnh\s+|đoạn\s+|đoạn thẳng\s+|segment\s+|side\s+)?([A-Z])([A-Z])\s*,?\s*(?:sao cho|thỏa mãn|such that|with|so that)\s+([A-Z])([A-Z])\s*=\s*(\d+(?:\/\d+)?)?\s*\*?\s*([A-Z])([A-Z])(?![A-Z])/gu)) {
      const [p, u, v] = [m[1], m[2], m[3]];
      const lin = (x: string, y: string): [number, number] | null => {
        const k = [x, y].sort().join("");
        if (k === [p, u].sort().join("")) return [0, 1];
        if (k === [p, v].sort().join("")) return [1, -1];
        if (k === [u, v].sort().join("")) return [1, 0];
        return null;
      };
      const l1 = lin(m[4], m[5]);
      const l2 = lin(m[7], m[8]);
      const kv = m[6] ? frac(m[6]) : 1;
      if (!l1 || !l2) continue;
      const t = snap((kv * l2[0] - l1[0]) / (l1[1] - kv * l2[1]));
      if (!(t > 0 && t < 1)) continue;
      added = def(p, new Map([[u, 1 - t], [v, t]]), { en: `${p} is on ${u}${v} with ${m[4]}${m[5]} = ${m[6] ?? ""}${m[7]}${m[8]}`, vi: `${p} thuộc ${u}${v} và ${m[4]}${m[5]} = ${m[6] ?? ""}${m[7]}${m[8]}` }) || added;
    }
    // Gọi M là điểm thỏa mãn @MB = 2@MC (not a question: “xác định điểm M …” is handled as a goal).
    for (const m of s.matchAll(/(?<!(?:xác định|tìm|dựng|find|determine|locate)\s+(?:vị trí\s+)?(?:của\s+)?(?:điểm\s+|point\s+)?)([A-Z])\s+(?:là\s+(?:điểm\s+)?|is the point\s+)?(?:thỏa mãn|sao cho|such that|satisfying)\s+([^.;]*?=[^.;]*?)(?=[.;]|$|\s+(?:chứng minh|tính|tìm|prove|find|show))/gu)) {
      if (has(m[1])) continue;
      const w = solvePoint(f, m[1], m[2]);
      if (w) added = def(m[1], w.at, { en: `${m[1]} satisfies ${m[2].trim().replace(/@/g, "")}`, vi: `${m[1]} thỏa mãn ${m[2].trim().replace(/@/g, "")}` }) || added;
    }
    if (!added) break;
  }
}

/** M from a vector equation, as weights: Σ(lhs) − Σ(rhs) = α·M + R ⇒ M = −R/α. */
function solvePoint(f: Fig, M: string, eq: string): { at: Lin; lhs: Expr; rhs: Expr } | null {
  const [l, r] = vecText(eq).split("=");
  const lhs = parseExpr(l ?? "");
  const rhs = parseExpr(r ?? "");
  if (!lhs || !rhs) return null;
  const g: Fig = { ...f, symbols: [...f.symbols, M] };
  const a = linOf(g, lhs);
  const b = linOf(g, rhs);
  if (!a || !b) return null;
  const d = sumLin(a, scaleLin(b, -1));
  const alpha = d.get(M) ?? 0;
  if (Math.abs(alpha) < 1e-12) return null;
  d.delete(M);
  return { at: new Map([...scaleLin(d, -1 / alpha)].map(([p, v]) => [p, snap(v)])), lhs, rhs };
}

/* ───────────────────────────── Writing ───────────────────────────── */

const vt = (a: string, b: string) => `\\overrightarrow{${a}${b}}`;
/** A coefficient in front of a vector: “”, “-”, \frac{1}{2}, 2. */
function coefTex(k: number, first: boolean): string {
  const f = toFraction(Math.abs(k), 1000);
  const body = !f ? measureTex(Math.abs(k)) : f.d === 1 ? (f.n === 1 ? "" : `${f.n}`) : `\\frac{${f.n}}{${f.d}}`;
  if (k < 0) return `${first ? "-" : " - "}${body}`;
  return first ? body : ` + ${body}`;
}
function comboTex(c: Array<{ k: number; v: string }>): string {
  const terms = c.filter((t) => Math.abs(t.k) > 1e-12);
  if (!terms.length) return "\\overrightarrow{0}";
  return terms.map((t, i) => `${coefTex(t.k, i === 0)}${t.v}`).join("");
}
const exprTex = (e: Expr) => comboTex(e.map((t) => ({ k: t.k, v: vt(t.a, t.b) })));
/** Weights written from origin O: Σ w·OP (a vector's weights add up to 0, so O drops out). */
const linTex = (w: Lin, o: string, order: string[]) => comboTex(order.filter((p) => p !== o && w.has(p)).map((p) => ({ k: w.get(p)!, v: vt(o, p) })));

/* ───────────────────────────── Solving ───────────────────────────── */

export type VectorSolution = { steps: Steps; answers: VectorAnswer[]; notes: string[]; fig: Fig; found: string[] };

export function analyzeVector(raw: string): VectorSolution | SolveFailure {
  try {
    return solve(raw);
  } catch (e) {
    if (e instanceof MeasureError) return { ok: false, code: "unsupported", message: e.message, suggestion: e.suggestion };
    throw e;
  }
}

function solve(raw: string): VectorSolution {
  const s = vecText(clean(raw.normalize("NFC")).replace(/\s+/g, " "));
  const fig = buildFigure(s);
  const st = new Steps();
  const answers: VectorAnswer[] = [];
  const notes: string[] = [];
  const found: string[] = [];
  const goals: Array<{ at: number; run: () => void }> = [];
  const pointsOf = (e: Expr) => [...new Set(e.flatMap((t) => [t.a, t.b]))];
  const value = (e: Expr): P2 => {
    let x = 0;
    let y = 0;
    for (const t of e) {
      const [a, b] = [fig.pts.get(t.a)!, fig.pts.get(t.b)!];
      x += t.k * (b[0] - a[0]);
      y += t.k * (b[1] - a[1]);
    }
    return [x, y];
  };
  const need = (e: Expr) => {
    const miss = pointsOf(e).filter((p) => !fig.pts.has(p));
    if (miss.length) oops({ en: `I don't know where ${miss.join(", ")} is.`, vi: `Chưa biết vị trí của điểm ${miss.join(", ")}.` }, { en: `Say how ${miss[0]} is defined, e.g. “${miss[0]} là trung điểm của …”.`, vi: `Cho biết điểm ${miss[0]} được xác định thế nào, ví dụ “${miss[0]} là trung điểm của …”.` });
  };
  const shown = new Set<string>();
  /** Rows writing the points an expression uses from origin O, each with its definition. */
  const introduce = (ps: string[], o: string) => {
    const rows: string[] = [];
    for (const p of ps) {
      if (fig.symbols.includes(p) || p === o || shown.has(`${o}${p}`)) continue;
      shown.add(`${o}${p}`);
      const w = expand(fig, p);
      if (!w) continue;
      const why = fig.why.get(p);
      rows.push(`${vt(o, p)} = ${linTex(w, o, fig.symbols)}${why ? `\\ \\ (\\text{${L(why).replace(/[{}\\$]/g, "")}})` : ""}`);
    }
    if (!rows.length) return;
    st.push("construct", { en: "Each point from the origin", vi: "Biểu diễn các điểm" }, rows.join("\\\\ "),
      { en: `Write the vector from ${o} to each point using how the point is defined (for any point O: midpoint OM = ½(OA + OB), centroid OG = ⅓(OA + OB + OC), parallelogram OC = OB + OD − OA).`, vi: `Viết vectơ từ ${o} đến mỗi điểm theo định nghĩa của điểm đó (với mọi điểm O: trung điểm OM = ½(OA + OB), trọng tâm OG = ⅓(OA + OB + OC), hình bình hành OC = OB + OD − OA).` },
      { en: "These hold for any origin, so one origin serves the whole problem.", vi: "Các hệ thức này đúng với mọi điểm gốc, nên chọn một gốc chung cho cả bài." },
      { en: "Use the definition of each point.", vi: "Dùng định nghĩa của từng điểm." });
  };
  /** One side: every vector XY written OY − OX, then collected. */
  const side = (e: Expr, w: Lin, o: string) => {
    const parts = e.map((t, i) => {
      const inner = t.a === o ? vt(o, t.b) : t.b === o ? `-${vt(o, t.a)}` : `${vt(o, t.b)} - ${vt(o, t.a)}`;
      const c = coefTex(t.k, i === 0);
      return (t.a === o && Math.abs(t.k) === 1) || (e.length === 1 && t.k === 1) ? `${c}${inner}` : `${c}\\left(${inner}\\right)`;
    });
    return `${parts.join("")} = ${linTex(w, o, fig.symbols)}`;
  };

  // Prove: “Chứng minh @MA + @MB + @MC = 3@MG”.
  for (const m of s.matchAll(/(?:chứng minh|cmr|prove|show)(?:\s+(?:rằng|that))?\s+((?:[^.;]|\.(?!\s))+)/giu)) {
    for (const claim of m[1].split(/;|,\s*(?=[^=]*=)|\s+và\s+(?=[^=]*=)|\s+and\s+(?=[^=]*=)/u)) {
      if (!claim.includes("=")) continue;
      const [l, r] = claim.split("=");
      const lhs = parseExpr(l.replace(/^.*?(?=[@\d+-]|[A-Z]{2})/u, ""));
      const rhs = parseExpr(r.replace(/\s+(?:với mọi|for (?:any|every|all)).*$/u, ""));
      if (lhs && rhs && (lhs.length || rhs.length)) goals.push({ at: m.index!, run: () => prove(lhs, rhs) });
    }
  }
  // Decompose: “Phân tích @AM theo @AB, @AC” (or theo a, b with a = @AB).
  const named = new Map<string, Expr>();
  for (const m of s.matchAll(/(?<![\p{L}@])([a-z])\s*=\s*@(\w+)/gu)) named.set(m[1], parseExpr(`@${m[2]}`)!);
  for (const m of s.matchAll(/(?:phân tích|biểu thị|biểu diễn|express|write)\s+(?:các\s+)?(?:vectơ\s+)?((?:@?[A-Z][0-9']*[A-Z][0-9']*\s*(?:,|và|and)?\s*)+)\s*(?:theo|qua|in terms of|using)\s+(?:hai\s+)?(?:vectơ\s+)?@?(\w+)\s*(?:,|và|and)\s*(?:vectơ\s+)?@?(\w+)/giu)) {
    const targets = m[1].match(new RegExp(`${NM}${NM}`, "g")) ?? [];
    const u = named.get(m[2]) ?? parseExpr(`@${m[2]}`);
    const v = named.get(m[3]) ?? parseExpr(`@${m[3]}`);
    if (!u || !v) continue;
    for (const t of targets) goals.push({ at: m.index!, run: () => decompose(parseExpr(`@${t}`)!, { e: u, name: named.has(m[2]) ? m[2] : null }, { e: v, name: named.has(m[3]) ? m[3] : null }) });
  }
  // Find a point: “Xác định điểm M thỏa mãn …”.
  // “… điểm M thỏa mãn … và điểm N thỏa mãn …” in one sentence: each point is a goal.
  for (const sent of s.matchAll(/(?:xác định|tìm|dựng|find|determine|locate)\s+[^.;]*/giu)) {
    for (const m of sent[0].matchAll(/(?:điểm\s+|point\s+|the point\s+)?(?<![A-Z@'])([A-Z])\s+(?:thỏa mãn|sao cho|such that|with|so that|satisfying)\s+([^=]*=\s*[@A-Z0-9'+\-*/\s]*)/gu)) {
      goals.push({ at: sent.index! + m.index!, run: () => locate(m[1], m[2]) });
    }
  }
  // Dot products, lengths, angles.
  for (const m of s.matchAll(new RegExp(String.raw`(?<![A-Z'])@?(${NM}${NM})\s*[.*·]\s*@?(${NM}${NM})(?![A-Z'])`, "gu"))) goals.push({ at: m.index!, run: () => dot(pair(m[1]), pair(m[2])) });
  // “the dot product of vector AB and vector AC”.
  for (const m of s.matchAll(new RegExp(String.raw`(?:tích vô hướng|dot product)\s+(?:của\s+|of\s+)?(?:hai\s+)?(?:vectơ\s+)?@(${NM}${NM})\s+(?:và|and)\s+@(${NM}${NM})`, "gu"))) goals.push({ at: m.index!, run: () => dot(pair(m[1]), pair(m[2])) });
  for (const m of s.matchAll(/\|([^|]+)\|/gu)) {
    const e = parseExpr(m[1]);
    if (e && e.length) goals.push({ at: m.index!, run: () => length(e) });
  }
  for (const m of s.matchAll(new RegExp(String.raw`(?:độ dài|length of)\s+(?:của\s+)?(?:the\s+)?(?:vectơ\s+)?((?:[+-]?\s*\d*\s*@${NM}${NM}\s*)+)`, "gu"))) {
    const e = parseExpr(m[1]);
    if (e && e.length) goals.push({ at: m.index!, run: () => length(e) });
  }
  for (const m of s.matchAll(new RegExp(String.raw`(?:góc giữa|angle between)\s+(?:hai\s+)?(?:vectơ\s+)?@?(${NM}${NM})\s+(?:và|and)\s+(?:vectơ\s+)?@?(${NM}${NM})`, "gu"))) goals.push({ at: m.index!, run: () => angle(pair(m[1]), pair(m[2])) });
  if (!goals.length) oops({ en: "I couldn't find the question (prove, express, find a point, dot product, length or angle).", vi: "Chưa thấy câu hỏi (chứng minh, phân tích vectơ, xác định điểm, tích vô hướng, độ dài hoặc góc)." }, { en: "E.g. “Chứng minh vectơ MA + vectơ MB + vectơ MC = 3 vectơ MG”.", vi: "Ví dụ “Chứng minh vectơ MA + vectơ MB + vectơ MC = 3 vectơ MG”." });
  for (const g of goals.sort((a, b) => a.at - b.at)) g.run();
  return { steps: st, answers, notes, fig, found };

  function prove(lhs: Expr, rhs: Expr) {
    // Points said to be arbitrary (“với mọi điểm M”) are free too; one of them is the natural origin.
    const free = [...pointsOf(lhs), ...pointsOf(rhs)].filter((p) => !fig.pts.has(p));
    const anyPoint = new RegExp(String.raw`(?:mọi|bất kỳ|tùy ý|any|every|all|arbitrary)\s+(?:điểm\s+|points?\s+)?(?:[A-Z]\s*,?\s*)*|(?:điểm\s+|point\s+)?(?:[A-Z]\s*,?\s*)+(?:bất kỳ|tùy ý|is arbitrary)`, "gu");
    const arbitrary = new Set([...s.matchAll(anyPoint)].flatMap((m) => m[0].match(/(?<![\p{L}])[A-Z](?![\p{L}])/gu) ?? []));
    if (free.some((p) => !arbitrary.has(p))) need([...lhs, ...rhs].filter((t) => !arbitrary.has(t.a) && !arbitrary.has(t.b)));
    free.forEach((p, i) => {
      fig.symbols.push(p);
      fig.pts.set(p, [0.73 + 0.31 * i, -0.58 + 0.17 * i]);
    });
    const o = free[0] ?? fig.symbols[0];
    const a = linOf(fig, lhs);
    const b = linOf(fig, rhs);
    if (!a || !b) return need([...lhs, ...rhs]);
    introduce([...pointsOf(lhs), ...pointsOf(rhs)], o);
    const ok = sameLin(a, b);
    const claim = `${exprTex(lhs)} = ${exprTex(rhs)}`;
    st.push("proof", { en: ok ? "Prove" : "The claim is false", vi: ok ? "Chứng minh" : "Mệnh đề sai" },
      `VT = ${side(lhs, a, o)}\\\\ VP = ${side(rhs, b, o)}\\\\ \\Rightarrow\\ VT ${ok ? "=" : "\\ne"} VP`,
      { en: `Insert ${o} into every vector (XY = ${o}Y − ${o}X, Chasles' rule) and collect.${free.length ? ` ${free.join(", ")} can be any point${free.length > 1 ? "s" : ""}, so the identity holds for all of them.` : ""}`, vi: `Chèn điểm ${o} vào mỗi vectơ (XY = ${o}Y − ${o}X, quy tắc ba điểm) rồi rút gọn.${free.length ? ` ${free.join(", ")} là điểm tùy ý nên đẳng thức đúng với mọi vị trí của ${free.length > 1 ? "chúng" : "nó"}.` : ""}` },
      { en: "Two sides written with the same independent vectors are equal exactly when their coefficients match.", vi: "Hai vế biểu diễn theo cùng các vectơ độc lập thì bằng nhau khi và chỉ khi các hệ số bằng nhau." },
      { en: `Insert ${o} into every vector.`, vi: `Chèn điểm ${o} vào mỗi vectơ.` },
      ok ? "passed" : "failed");
    answers.push({ key: `prove-${claim}`, latex: `${claim}\\ ${ok ? "\\checkmark" : `\\text{${L({ en: "(false)", vi: "(sai)" })}}`}`, value: null });
  }

  function decompose(target: Expr, u: { e: Expr; name: string | null }, v: { e: Expr; name: string | null }) {
    need(target);
    need(u.e);
    need(v.e);
    const o = fig.symbols[0];
    introduce([...pointsOf(target), ...pointsOf(u.e), ...pointsOf(v.e)], o);
    const W = value(target);
    const U = value(u.e);
    const V = value(v.e);
    const det = U[0] * V[1] - U[1] * V[0];
    if (Math.abs(det) < 1e-12) oops({ en: "Those two vectors are parallel, so they can't be a basis.", vi: "Hai vectơ đó cùng phương nên không làm cơ sở được." }, { en: "Pick two vectors that aren't parallel.", vi: "Chọn hai vectơ không cùng phương." });
    const x = snap((W[0] * V[1] - W[1] * V[0]) / det);
    const y = snap((U[0] * W[1] - U[1] * W[0]) / det);
    // Exact check: target = x·u + y·v as weights.
    const ok = sameLin(linOf(fig, target)!, sumLin(scaleLin(linOf(fig, u.e)!, x), scaleLin(linOf(fig, v.e)!, y)));
    const un = u.name ? `\\vec{${u.name}}` : exprTex(u.e);
    const vn = v.name ? `\\vec{${v.name}}` : exprTex(v.e);
    const res = comboTex([{ k: x, v: un }, { k: y, v: vn }]);
    const tw = linOf(fig, target)!;
    st.push("formula", { en: "Write it in terms of the two", vi: "Phân tích theo hai vectơ" },
      `${exprTex(target)} = ${side(target, tw, o)}\\\\ \\Rightarrow\\ ${exprTex(target)} = ${res}`,
      { en: "Chasles' rule and the definitions of the points give the coefficients.", vi: "Quy tắc ba điểm và định nghĩa các điểm cho ta các hệ số." },
      { en: "Every vector is x·u + y·v in exactly one way when u, v aren't parallel.", vi: "Mọi vectơ phân tích được duy nhất theo hai vectơ không cùng phương." },
      { en: `Go through ${o}.`, vi: `Chèn điểm ${o}.` },
      ok ? "passed" : "failed");
    answers.push({ key: `dec-${target.map((t) => t.a + t.b).join("")}`, latex: `${exprTex(target)} = ${res}`, value: null, vec: W });
  }

  function locate(M: string, eq: string) {
    const sol = solvePoint(fig, M, eq);
    if (!sol) return oops({ en: `No single point ${M} satisfies that (the coefficients of ${M} add up to 0).`, vi: `Không có điểm ${M} duy nhất (tổng các hệ số của ${M} bằng 0).` }, { en: "Check the equation.", vi: "Kiểm tra lại đẳng thức." });
    fig.comb.set(M, sol.at);
    fig.pts.set(M, place(fig, sol.at));
    found.push(M);
    const at = fig.pts.get(M)!;
    const o = fig.symbols[0];
    const same = [...fig.pts.entries()].find(([k, v]) => k !== M && close(v[0], at[0], 1e-9) && close(v[1], at[1], 1e-9))?.[0];
    // On a named segment XY: XM = t·XY.
    let where = "";
    if (!same) {
      for (const [x, px] of fig.pts) {
        for (const [y, py] of fig.pts) {
          if (where || x >= y || x === M || y === M) continue;
          const d: P2 = [py[0] - px[0], py[1] - px[1]];
          const e: P2 = [at[0] - px[0], at[1] - px[1]];
          const t = (d[0] * e[0] + d[1] * e[1]) / (d[0] * d[0] + d[1] * d[1]);
          if (Math.abs(d[0] * e[1] - d[1] * e[0]) < 1e-9 && t > 1e-9 && t < 1 - 1e-9) where = `${M} \\in ${x}${y},\\ ${vt(x, M)} = ${coefTex(snap(t), true)}${vt(x, y)}`;
        }
      }
    }
    const g: Fig = { ...fig, symbols: [...fig.symbols, M] };
    const lw = linOf(g, sol.lhs)!;
    const rw = linOf(g, sol.rhs)!;
    st.push("formula", { en: `Find ${M}`, vi: `Xác định điểm ${M}` },
      `${exprTex(sol.lhs)} = ${exprTex(sol.rhs)}\\\\ \\Leftrightarrow\\ ${linTex(lw, o, g.symbols)} = ${linTex(rw, o, g.symbols)}\\\\ \\Rightarrow\\ ${vt(o, M)} = ${linTex(sol.at, o, fig.symbols)}${same ? `\\\\ \\Rightarrow\\ ${M} \\equiv ${same}` : where ? `\\\\ \\Rightarrow\\ ${where}` : ""}`,
      { en: `Insert ${o} into every vector containing ${M} (XM = ${o}M − ${o}X) and solve for ${o}${M}.`, vi: `Chèn điểm ${o} vào các vectơ chứa ${M} (XM = ${o}M − ${o}X) rồi tìm vectơ ${o}${M}.` },
      { en: "A point is fixed once its vector from a known point is known.", vi: "Biết vectơ từ một điểm cố định đến M thì xác định được M." },
      { en: `Write every vector through ${o}.`, vi: `Viết mọi vectơ qua điểm ${o}.` });
    answers.push({ key: `pt-${M}`, latex: same ? `${M} \\equiv ${same}` : where || `${vt(o, M)} = ${linTex(sol.at, o, fig.symbols)}`, value: null, vec: [at[0] - fig.pts.get(o)![0], at[1] - fig.pts.get(o)![1]] });
  }

  function sizeNeeded() {
    if (!fig.sized) oops({ en: "This needs the figure's lengths (and angles).", vi: "Câu này cần độ dài cạnh (và góc) của hình." }, { en: "E.g. “tam giác đều ABC cạnh a” or “hình vuông ABCD cạnh a”.", vi: "Ví dụ “tam giác đều ABC cạnh a” hoặc “hình vuông ABCD cạnh a”." });
  }

  function dot(x: [string, string], y: [string, string]) {
    sizeNeeded();
    const e1: Expr = [{ k: 1, a: x[0], b: x[1] }];
    const e2: Expr = [{ k: 1, a: y[0], b: y[1] }];
    need(e1);
    need(e2);
    const u = value(e1);
    const v = value(e2);
    const d = u[0] * v[0] + u[1] * v[1];
    const [lu, lv] = [Math.hypot(...u), Math.hypot(...v)];
    const cos = d / (lu * lv);
    const label = `${vt(...x)}\\cdot ${vt(...y)}`;
    // Same start: the figure's angle. One ends where the other starts: turn the first round.
    const rows =
      x[0] === y[0] ? `${label} = ${x.join("")}\\cdot ${y.join("")}\\cdot\\cos\\widehat{${x[1]}${x[0]}${y[1]}} = ${len1(lu)}\\cdot ${len1(lv)}\\cdot ${ratioTex(cos)}`
      : x[1] === y[0] ? `${label} = -${vt(x[1], x[0])}\\cdot ${vt(...y)} = -${x.join("")}\\cdot ${y.join("")}\\cdot\\cos\\widehat{${x[0]}${x[1]}${y[1]}} = -${len1(lu)}\\cdot ${len1(lv)}\\cdot ${ratioTex(-cos)}`
      : `${label} = |${vt(...x)}|\\cdot|${vt(...y)}|\\cdot\\cos\\left(${vt(...x)}, ${vt(...y)}\\right) = ${len1(lu)}\\cdot ${len1(lv)}\\cdot ${ratioTex(cos)}`;
    st.push("formula", { en: "Dot product", vi: "Tích vô hướng" }, `${rows} = ${area(d)}`,
      { en: "u·v = |u|·|v|·cos(u, v); the angle between vectors is taken with both starting at one point.", vi: "u·v = |u|·|v|·cos(u, v); góc giữa hai vectơ xét khi chúng chung điểm đầu." },
      { en: "Definition of the dot product.", vi: "Định nghĩa tích vô hướng." },
      { en: "Do the two vectors start at the same point?", vi: "Hai vectơ có chung điểm đầu không?" });
    answers.push({ key: `dot-${x.join("")}${y.join("")}`, latex: `${label} = ${area(d)}`, value: d });
  }

  function length(e: Expr) {
    sizeNeeded();
    need(e);
    const o = fig.symbols[0];
    const [u, v] = fig.symbols.slice(1, 3);
    const W = value(e);
    const l = Math.hypot(...W);
    const O = fig.pts.get(o)!;
    const U: P2 = [fig.pts.get(u)![0] - O[0], fig.pts.get(u)![1] - O[1]];
    const V: P2 = [fig.pts.get(v)![0] - O[0], fig.pts.get(v)![1] - O[1]];
    const w = linOf(fig, e)!;
    const [p, q] = [w.get(u) ?? 0, w.get(v) ?? 0];
    const uu = U[0] ** 2 + U[1] ** 2;
    const vv = V[0] ** 2 + V[1] ** 2;
    const uv = U[0] * V[0] + U[1] * V[1];
    introduce(pointsOf(e), o);
    st.push("formula", { en: "Length of the vector", vi: "Độ dài vectơ" },
      `${exprTex(e)} = ${linTex(w, o, fig.symbols)}\\\\ \\left|${exprTex(e)}\\right|^2 = ${comboTex([{ k: p * p, v: `${vt(o, u)}^2` }, { k: 2 * p * q, v: `${vt(o, u)}\\cdot ${vt(o, v)}` }, { k: q * q, v: `${vt(o, v)}^2` }])}\\\\ = ${area(p * p * uu + 2 * p * q * uv + q * q * vv)}\\ \\Rightarrow\\ \\left|${exprTex(e)}\\right| = ${len1(l)}`,
      { en: `Write it with ${o}${u} and ${o}${v}, square it, and use ${o}${u}², ${o}${v}² and the dot product ${o}${u}·${o}${v} = ${o}${u}·${o}${v}·cos ${o}.`, vi: `Viết theo ${o}${u} và ${o}${v}, bình phương vô hướng, dùng ${o}${u}², ${o}${v}² và tích vô hướng ${o}${u}·${o}${v}.` },
      { en: "|w|² = w·w.", vi: "|w|² = w·w." },
      { en: "Square the vector.", vi: "Bình phương vô hướng." });
    answers.push({ key: `len-${exprTex(e)}`, latex: `\\left|${exprTex(e)}\\right| = ${len1(l)}`, value: l });
  }

  function angle(x: [string, string], y: [string, string]) {
    const e1: Expr = [{ k: 1, a: x[0], b: x[1] }];
    const e2: Expr = [{ k: 1, a: y[0], b: y[1] }];
    need(e1);
    need(e2);
    if (!fig.sized && !["square", "rectangle", "equilateral"].includes(fig.shape)) sizeNeeded();
    const u = value(e1);
    const v = value(e2);
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    const deg = Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
    const label = `\\left(${vt(...x)}, ${vt(...y)}\\right)`;
    const how = x[0] === y[0] ? `${label} = \\widehat{${x[1]}${x[0]}${y[1]}}` : x[1] === y[0] ? `${label} = 180^\\circ - \\widehat{${x[0]}${x[1]}${y[1]}}` : `\\cos${label} = ${ratioTex(cos)}`;
    const eq = degTex(deg).startsWith("\\approx") ? "" : "= ";
    st.push("formula", { en: "Angle between vectors", vi: "Góc giữa hai vectơ" }, `${how} ${eq}${degTex(deg)}`,
      { en: "Move the vectors so they start at the same point; the angle between them is from 0° to 180°.", vi: "Đưa hai vectơ về chung điểm đầu; góc giữa hai vectơ từ 0° đến 180°." },
      { en: "(AB, BC) = 180° − ∠ABC: BC starts where AB ends.", vi: "(AB, BC) = 180° − góc ABC vì BC xuất phát tại điểm cuối của AB." },
      { en: "Do they start at the same point?", vi: "Hai vectơ có chung điểm đầu không?" });
    answers.push({ key: `ang-${x.join("")}${y.join("")}`, latex: `${label} ${eq}${degTex(deg)}`, value: deg, degrees: true });
  }

  function len1(x: number) {
    return measureTex(x, fig.sym, 1);
  }
  function area(x: number) {
    return measureTex(x, fig.sym, 2);
  }
}

/* ───────────────────────────── Results, figure, checking ───────────────────────────── */

export function solveVector(problemId: string, raw: string): SolveResult {
  const r = analyzeVector(raw);
  if ("ok" in r) return r;
  const finalAnswer = r.answers.length === 1 ? r.answers[0].latex : `\\begin{gathered}${r.answers.map((a) => a.latex).join("\\\\")}\\end{gathered}`;
  const solution: MathSolution = { problemId, originalInput: raw, topic: "vector", steps: finalize(problemId, r.steps.drafts), finalAnswer, roots: [], confidenceNotes: r.notes };
  return { ok: true, solution };
}

export function vectorFigure(raw: string): ({ ok: true } & GraphSpec) | SolveFailure {
  const r = analyzeVector(raw);
  if ("ok" in r) return r;
  const f = r.fig;
  const P = (x: string) => f.pts.get(x)!;
  const curves: GraphCurve[] = [];
  if (f.shape !== "points") curves.push({ label: "", tone: "brand", thin: true, segments: [[...f.base.map(P), P(f.base[0])]] });
  // Free points of an identity (an arbitrary M) were only placed to check it: leave them out.
  const marks: GraphMark[] = [...f.pts.entries()].filter(([n]) => f.base.includes(n) || f.comb.has(n)).map(([label, [x, y]]) => ({ x, y, label, given: !r.found.includes(label) }));
  const xs = marks.map((m) => m.x);
  const ys = marks.map((m) => m.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const pad = span * 0.25;
  return {
    ok: true,
    title: L({ en: "Figure", vi: "Hình vẽ" }),
    caption: L({ en: f.sized ? "Drawn to scale (the unit length is 1). Orange: a point found." : "Drawn for illustration; vector identities don't depend on the size. Orange: a point found.", vi: f.sized ? "Vẽ đúng tỉ lệ (đơn vị độ dài là 1). Màu cam: điểm cần tìm." : "Hình vẽ minh họa; các hệ thức vectơ không phụ thuộc kích thước. Màu cam: điểm cần tìm." }),
    curves,
    marks,
    shade: [],
    asymptotes: [],
    domain: [Math.min(...xs) - pad, Math.max(...xs) + pad],
    range: [Math.min(...ys) - pad, Math.max(...ys) + pad],
    equal: true,
  };
}

export function checkVectorAnswer(problem: string, answer: string): AnswerCheck {
  const r = analyzeVector(problem);
  if ("ok" in r) return { status: "unsupported", message: r.message };
  return checkAgainstVector(r, answer);
}

export function checkAgainstVector(r: VectorSolution, answer: string): AnswerCheck {
  const a = vecText(normalizeInput(answer.normalize("NFC")));
  const withVec = r.answers.filter((x) => x.vec);
  if (withVec.length && a.includes("=") && /[A-Z]{2}/.test(a)) {
    const [l, rr] = a.split("=");
    const lhs = parseExpr(l);
    const rhs = parseExpr(rr);
    if (!lhs || !rhs || ![...lhs, ...rhs].every((t) => r.fig.pts.has(t.a) && r.fig.pts.has(t.b))) return { status: "unreadable", message: L({ en: "Write it like AM = 1/2 AB + 1/2 AC, with points of the figure.", vi: "Viết dạng AM = 1/2 AB + 1/2 AC, dùng các điểm có trên hình." }) };
    const val = (e: Expr): P2 => e.reduce<P2>((acc, t) => {
      const [p, q] = [r.fig.pts.get(t.a)!, r.fig.pts.get(t.b)!];
      return [acc[0] + t.k * (q[0] - p[0]), acc[1] + t.k * (q[1] - p[1])];
    }, [0, 0]);
    const [u, v] = [val(lhs), val(rhs)];
    const ok = close(u[0], v[0], 1e-9) && close(u[1], v[1], 1e-9) && withVec.some((x) => close(x.vec![0], u[0], 1e-9) && close(x.vec![1], u[1], 1e-9));
    return ok ? { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) } : { status: "incorrect", message: L({ en: "Not quite. Insert one point into each vector (Chasles) and use how each point is defined.", vi: "Chưa đúng. Chèn một điểm vào mỗi vectơ (quy tắc ba điểm) và dùng định nghĩa của từng điểm." }) };
  }
  const numeric = r.answers.filter((x) => x.value !== null);
  if (!numeric.length) return { status: "unsupported", message: L({ en: "Proofs are checked step by step, not by a final answer.", vi: "Bài chứng minh được kiểm tra theo từng bước, không theo đáp số." }) };
  const v = readAnswer(answer);
  if (v === null) return { status: "unreadable", message: L({ en: "Write a number such as a^2/2, -a^2/2 or a√3.", vi: "Hãy viết một số như a^2/2, -a^2/2 hoặc a√3." }) };
  if (numeric.some((x) => close(x.value!, v, x.degrees ? 1e-3 : 1e-6))) return { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) };
  if (numeric.some((x) => !x.degrees && close(-x.value!, v, 1e-6))) return { status: "incorrect", message: L({ en: "The sign is wrong — check the angle between the vectors (put them at a common start).", vi: "Sai dấu — kiểm tra lại góc giữa hai vectơ (đưa về chung điểm đầu)." }) };
  return { status: "incorrect", message: L({ en: "Not quite. Check the angle between the two vectors.", vi: "Chưa đúng. Kiểm tra lại góc giữa hai vectơ." }) };
}
