import { clean } from "../geometry/parse";
import { RAD, type Text, VAL, oops, readValue } from "./num";

/**
 * Grade 11–12 solids described in words (“Cho hình chóp S.ABCD có đáy ABCD là
 * hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2…”), built as exact-enough
 * coordinates (the unit length a is 1) plus what the text says about them,
 * so questions can be answered with the usual constructions and proofs.
 */

export type V3 = [number, number, number];
export const sub3 = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: number[], b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul3 = (a: number[], k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3 = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
export const near = (a: number[], b: number[]) => len3(sub3(a, b)) < 1e-9;

export type Shape = "square" | "rectangle" | "rhombus" | "parallelogram" | "trapezoid" | "quadrilateral" | "right" | "equilateral" | "isosceles" | "triangle";
/**
 * A face. `rightAt` is the right angle of a right triangle (or the apex of an
 * isosceles one); a trapezoid has its right angles in `right` and its
 * parallel sides in `par` (par[0]par[1] ∥ par[2]par[3]).
 */
export type Face = { pts: string[]; shape?: Shape; rightAt?: string; right?: string[]; par?: [string, string, string, string] };
/** “line ⊥ plane” known from the text (or the kind of solid), with why. */
export type PerpFact = { line: [string, string]; plane: string[]; why: Text };
/** Given line–line relations (a projection gives AH ⊥ SB; a midline is parallel to a side). */
export type LineFact = { a: [string, string]; b: [string, string]; kind: "perp" | "parallel"; why: Text };

export type Model = {
  /** S.ABCD, ABC.A'B'C' … */
  name: string;
  kind: "pyramid" | "prism";
  pts: Map<string, V3>;
  apex?: string;
  base: string[];
  top?: string[];
  shape: Shape;
  /** Foot of the apex (pyramid) on the base plane, by name. */
  foot?: string;
  /** A slanted prism: the top vertex whose projection on the base is given, and that foot. */
  lift?: { top: string; foot: string };
  /** Height of the solid. */
  h: number;
  sym: string | null;
  faces: Face[];
  perp: PerpFact[];
  lines: LineFact[];
  /** How the base was put on the axes. */
  axes: { origin: string; x: string; y: string | null };
  /** How derived points were defined, and how the height was found. */
  why: Map<string, Text>;
  heightWhy: Text | null;
  /** Points the solver may name later (K, H, I…) must avoid these. */
  taken: Set<string>;
  /** The text gave no height (only proofs can be answered). */
  freeHeight?: boolean;
  /** Data the text leaves out (the apex's foot, the base's sizes): the figure is generic, so measures can't be answered. */
  missing?: { msg: Text; hint: Text };
  /** Where the apex (or a slanted prism's top) stands isn't known: only parallel-line facts hold. */
  generic?: boolean;
  /** Midpoints, by name: M → [S, A]. Used for midline (đường trung bình) arguments. */
  mids: Map<string, [string, string]>;
};

const PT = String.raw`[A-Z]'?`;
const is = String.raw`\s*(?:(?:bằng|là|=|of|is)\s*)?`;
const QUADS = new Set<Shape>(["square", "rectangle", "rhombus", "parallelogram", "trapezoid", "quadrilateral"]);
/** Base shapes, longest first so “tam giác vuông cân” wins over “tam giác vuông”. */
const SHAPES = String.raw`hình vuông|square|hình chữ nhật|rectangle|hình thoi|rhombus|hình bình hành|parallelogram|hình thang vuông|right trapezoid|hình thang cân|isosceles trapezoid|hình thang|trapezoid|nửa lục giác đều|half (?:of )?a regular hexagon|tam giác vuông cân|isosceles right|tam giác vuông|right triangle|right-angled|tam giác đều|equilateral|tam giác cân|isosceles`;
const RIGHT_PRISM = /lăng trụ (?:tam giác |tứ giác |lục giác )?(?:đứng|đều)|hình hộp đứng|right (?:\w+ )?prism|regular (?:\w+ )?prism/u;

export function isSpaceSolid(s: string): boolean {
  const t = s.normalize("NFC").replace(/[’′`]/g, "'");
  return /(?<![A-Z])[A-Z]\.[A-Z]{3,4}(?![A-Z'])|[A-Z]{3,4}\.[A-Z]'[A-Z]'[A-Z]'|lập phương|cube|hình hộp|cuboid|tứ diện|tetrahedron|lăng trụ|prism/u.test(t);
}

/** Every “XY = value” in the text, by segment (both orders); chains “SA = SB = SC = a” give each. */
export function lengths(s: string, setSym: (v: { sym: string | null }) => void): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of s.matchAll(new RegExp(String.raw`(?<![\p{L}'])((?:${PT}${PT}\s*=\s*)+)${VAL}`, "gu"))) {
    const v = readValue(m[2]);
    if (!v) continue;
    setSym(v);
    for (const pair of m[1].match(new RegExp(`${PT}${PT}`, "g")) ?? []) {
      const [x, y] = pair.match(/[A-Z]'?/g)!;
      out.set(x + y, v.value);
      out.set(y + x, v.value);
    }
  }
  return out;
}

/** Given angles: “góc BAD = 60°” (both orders of the name) and “góc A = 60°”. */
export function angleMap(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of s.matchAll(/(?:góc|angle|∠)\s*([A-Z])(?:([A-Z])([A-Z]))?(?![\p{L}'])\s*(?:=|bằng|là|is|of|measures)\s*(\d+(?:[.,]\d+)?)/gu)) {
    const deg = angleOf(m[4]);
    if (m[2]) {
      out.set(m[1] + m[2] + m[3], deg);
      out.set(m[3] + m[2] + m[1], deg);
    } else out.set(m[1], deg);
  }
  return out;
}

const angleOf = (t: string) => Number(t.replace(",", "."));
const nameList = (t: string) => t.split(/[\s,]+|\s+và\s+|\s+and\s+/u).map((x) => x.trim()).filter((x) => /^[A-Z]'?$/.test(x));
const segList = (t: string) => t.split(/[\s,]+|\s+và\s+|\s+and\s+/u).map((x) => x.replace(/^cạnh/, "").trim()).filter((x) => /^[A-Z]'?[A-Z]'?$/.test(x));
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The sides of a triangle (side i opposite vertex i) from the sides and angles known, by the laws of cosines and sines. */
export function solveTri(side: Array<number | undefined>, ang: Array<number | undefined>): [number, number, number] | null {
  const S = [...side];
  const A = [...ang];
  for (let pass = 0; pass < 6 && S.some((x) => x === undefined); pass++) {
    if (A.filter((x) => x !== undefined).length === 2) A[A.findIndex((x) => x === undefined)] = 180 - A.reduce<number>((t, x) => t + (x ?? 0), 0);
    for (let i = 0; i < 3; i++) {
      const [j, k] = [(i + 1) % 3, (i + 2) % 3];
      if (S[i] === undefined && A[i] !== undefined && S[j] !== undefined && S[k] !== undefined) S[i] = Math.sqrt(S[j]! ** 2 + S[k]! ** 2 - 2 * S[j]! * S[k]! * Math.cos(A[i]! * RAD));
    }
    const p = [0, 1, 2].find((i) => S[i] !== undefined && A[i] !== undefined);
    if (p === undefined) continue;
    const ratio = S[p]! / Math.sin(A[p]! * RAD);
    for (let i = 0; i < 3; i++) {
      if (S[i] === undefined && A[i] !== undefined) S[i] = ratio * Math.sin(A[i]! * RAD);
      // An angle opposite a side no longer than the known pair's is acute: one answer.
      else if (A[i] === undefined && S[i] !== undefined && (S[i]! <= S[p]! + 1e-12 || A[p]! >= 90)) A[i] = Math.asin(Math.min(1, S[i]! / ratio)) / RAD;
    }
  }
  if (S.some((x) => x === undefined || !(x > 0))) return null;
  const [a, b, c] = S as number[];
  if (a + b <= c + 1e-12 || b + c <= a + 1e-12 || a + c <= b + 1e-12) return null;
  return [a, b, c];
}

export function buildModel(raw: string): Model {
  const s = clean(raw.replace(/[’′`]/g, "'")).replace(/\s+/g, " ");
  let sym: string | null = null;
  const setSym = (v: { sym: string | null }) => {
    if (v.sym && sym && v.sym !== sym) oops({ en: "Use one letter for lengths (like a).", vi: "Chỉ dùng một chữ cho độ dài (như a)." }, { en: "Write the other lengths as multiples of it.", vi: "Viết các độ dài khác theo chữ đó." });
    sym = v.sym ?? sym;
  };
  const val = (re: RegExp): number | undefined => {
    const m = s.match(re);
    if (!m) return undefined;
    const v = readValue(m[m.length - 1]);
    if (!v) return undefined;
    setSym(v);
    return v.value;
  };
  const len = lengths(s, setSym);
  const ang = angleMap(s);
  const why = new Map<string, Text>();
  const perp: PerpFact[] = [];
  const lines: LineFact[] = [];
  const pts = new Map<string, V3>();
  let shape: Shape = "triangle";
  let name = "";
  let kind: Model["kind"] = "pyramid";
  let apex: string | undefined;
  let base: string[] = [];
  let top: string[] | undefined;
  let foot: string | undefined;
  let h: number | undefined;
  let heightWhy: Text | null = null;
  let regular = false;
  let axes: Model["axes"] = { origin: "", x: "", y: null };

  const edgeVal = val(new RegExp(String.raw`(?:cạnh đáy|cạnh|side|edge|edge length)${is}${VAL}`, "u"));

  // ── Which solid ──
  const pyr = s.match(/(?<![A-Z'])([A-Z])\.([A-Z]{3,4})(?![A-Z'])/u);
  const prism = s.match(/(?<![A-Z'])([A-Z]{3,4})\.((?:[A-Z]'){3,4})/u);
  const cube = /lập phương|cube/u.test(s);
  const box = /hình hộp chữ nhật|cuboid|rectangular box/u.test(s);
  const tetraReg = /tứ diện đều|regular tetrahedron/u.test(s);
  const tri = s.match(/(?:tứ diện|tetrahedron)\s+([A-Z])([A-Z])([A-Z])([A-Z])/u);
  const trirect = /đôi một vuông góc|pairwise perpendicular|mutually perpendicular/u.test(s);

  if (cube || box || prism) {
    kind = "prism";
    base = prism ? prism[1].split("") : ["A", "B", "C", "D"];
    top = base.map((b) => `${b}'`);
    name = `${base.join("")}.${top.join("")}`;
    if (cube || box) {
      if (base.length !== 4) oops({ en: "A cube or box has a four-sided base.", vi: "Hình lập phương, hình hộp có đáy là tứ giác." }, { en: "Name it ABCD.A'B'C'D'.", vi: "Đặt tên ABCD.A'B'C'D'." });
      shape = cube ? "square" : "rectangle";
    }
  } else if (tri && (tetraReg || trirect)) {
    base = [tri[1], tri[2], tri[3]];
    apex = tri[4];
    name = `${apex}.${base.join("")}`;
    if (tetraReg) {
      regular = true;
      shape = "equilateral";
    }
  } else if (pyr) {
    apex = pyr[1];
    base = pyr[2].split("");
    name = `${apex}.${base.join("")}`;
    regular = /(?:chóp|pyramid)\s+(?:tứ giác\s+|tam giác\s+)?đều|regular(?: \w+)? pyramid/u.test(s);
  } else if (tri) {
    // Any tetrahedron ABCD: the apex is the vertex off a face it stands perpendicular to (“DA ⊥ (ABC)”), else A over (BCD).
    const four = tri.slice(1, 5);
    const face = [...s.matchAll(/(?:⊥|vuông góc|perpendicular|đáy|base)[^.;()]{0,24}\(([A-Z])([A-Z])([A-Z])\)/gu)].map((m) => m.slice(1, 4)).find((f) => new Set(f).size === 3 && f.every((x) => four.includes(x)));
    apex = face ? four.find((x) => !face.includes(x))! : four[0];
    base = four.filter((x) => x !== apex);
    name = four.join("");
  } else {
    oops({ en: "I couldn't find the solid's name (like S.ABCD or ABC.A'B'C').", vi: "Không tìm thấy tên hình (như S.ABCD hoặc ABC.A'B'C')." }, { en: "Write e.g. “Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a…”.", vi: "Ví dụ “Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a…”." });
  }
  const n = base.length;
  const nb = (v: string): [string, string] => {
    const i = base.indexOf(v);
    return [base[(i + n - 1) % n], base[(i + 1) % n]];
  };
  const angAt = (v: string): number | undefined => {
    const [p, q] = nb(v);
    return ang.get(p + v + q) ?? ang.get(v);
  };

  // ── Base shape and size ──
  // Missing base data: parallel lines, intersections and sections don't depend on it, so a generic base is drawn and measures ask for it later.
  let freeBase: Text | undefined;
  const needSides = (eg: Text) => {
    freeBase ??= eg;
  };
  const AT = String.raw`(?:\s+[A-Z]{3,4})?(?:\s+(?:triangle\s+)?(?:tại|at)\s+([A-Z])(?:\s+(?:và|and)\s+([A-Z]))?)?`;
  // “tam giác ABC vuông tại B” reads as “tam giác vuông ABC tại B”.
  const sb = s.replace(/(tam giác|triangle)\s+([A-Z]{3})\s+(vuông cân|vuông|đều|cân)(?![\p{L}])/gu, (all, w: string, nm: string, k: string) => ([...nm].every((x) => base.includes(x)) ? `${w} ${k} ${nm}` : all));
  const shapeText =
    sb.match(new RegExp(String.raw`(?:đáy|base|(?<![A-Z])[A-Z]{3,4}\s+(?:là|is))[^.;]*?(${SHAPES}|tam giác|triangle)${AT}`, "u")) ??
    // “a square base”, “a right triangle at B as its base”.
    sb.match(new RegExp(String.raw`(${SHAPES})${AT}[^.;]{0,24}?(?:đáy|base)`, "u")) ??
    // “tam giác ABC vuông tại B” with no word for the base.
    sb.match(new RegExp(String.raw`(${SHAPES})(?=\s+${base.join("")}(?![A-Z]))${AT}`, "u"));
  const sw = shapeText?.[1] ?? "";
  const at = shapeText?.[2];
  const at2 = shapeText?.[3];
  if (cube) shape = "square";
  else if (box) shape = "rectangle";
  else if (/vuông cân|isosceles right/u.test(sw)) shape = "right";
  else if (/hình vuông|square/u.test(sw)) shape = "square";
  else if (/chữ nhật|rectangle/u.test(sw)) shape = "rectangle";
  else if (/thoi|rhombus/u.test(sw)) shape = "rhombus";
  else if (/bình hành|parallelogram/u.test(sw)) shape = "parallelogram";
  else if (/thang|trapezoid|lục giác|hexagon/u.test(sw)) shape = "trapezoid";
  else if (/vuông|right/u.test(sw)) shape = "right";
  else if (/đều|equilateral/u.test(sw) || /lăng trụ tam giác đều|tam giác đều/u.test(s.slice(0, 60))) shape = "equilateral";
  else if (/cân|isosceles/u.test(sw)) shape = "isosceles";
  else if (regular || tetraReg) shape = n === 4 ? "square" : "equilateral";
  else if (/lăng trụ tứ giác đều/u.test(s)) shape = "square";
  else if (/tam giác|triangle/u.test(sw)) shape = "triangle";
  else if (/hình hộp|parallelepiped/u.test(s)) shape = "parallelogram";
  else if (!trirect) {
    // No shape given: a generic base (parallel-line questions still work; measures will ask).
    shape = n === 4 ? "quadrilateral" : "triangle";
    // A triangle may still be fixed by its sides and angles (placeTriangle asks if not).
    if (n === 4) needSides({ en: "Say e.g. “đáy ABCD là hình vuông cạnh a”, “đáy là hình thoi cạnh a, góc BAD = 60°” or “đáy là tam giác đều cạnh a”.", vi: "Ví dụ “đáy ABCD là hình vuông cạnh a”, “đáy là hình thoi cạnh a, góc BAD = 60°” hoặc “đáy là tam giác đều cạnh a”." });
  }
  if (QUADS.has(shape) && n !== 4) oops({ en: "A four-sided base needs four vertices (S.ABCD).", vi: "Đáy là tứ giác cần bốn đỉnh (S.ABCD)." }, { en: "Check the name.", vi: "Kiểm tra lại tên hình." });
  if (!QUADS.has(shape) && n !== 3 && !trirect) oops({ en: "A triangular base needs three vertices (S.ABC).", vi: "Đáy tam giác cần ba đỉnh (S.ABC)." }, { en: "Check the name.", vi: "Kiểm tra lại tên hình." });
  const seg = (a: string, b: string) => len.get(a + b);
  const isosRight = /vuông cân|isosceles right/u.test(sw);
  let trapRight: string[] | undefined;
  let trapPar: Face["par"];

  if (trirect && tri) {
    // OA, OB, OC pairwise perpendicular: O at the origin, one edge per axis.
    const o = tri.slice(1, 5).find((p) => new RegExp(`${p}[A-Z]\\s*,\\s*${p}[A-Z]\\s*,?\\s*(?:và\\s+)?${p}[A-Z]`, "u").test(s)) ?? tri[1];
    const others = tri.slice(1, 5).filter((p) => p !== o);
    const [l1, l2, l3] = others.map((p) => seg(o, p));
    if ([l1, l2, l3].some((x) => x === undefined)) oops({ en: `Give the three edges from ${o}.`, vi: `Cần độ dài ba cạnh xuất phát từ ${o}.` }, { en: `E.g. ${o}${others[0]} = a, ${o}${others[1]} = 2a, ${o}${others[2]} = 3a.`, vi: `Ví dụ ${o}${others[0]} = a, ${o}${others[1]} = 2a, ${o}${others[2]} = 3a.` });
    pts.set(o, [0, 0, 0]);
    pts.set(others[0], [l1!, 0, 0]);
    pts.set(others[1], [0, l2!, 0]);
    pts.set(others[2], [0, 0, l3!]);
    apex = others[2];
    base = [o, others[0], others[1]];
    name = tri.slice(1, 5).join("");
    shape = "right";
    foot = o;
    h = l3!;
    axes = { origin: o, x: others[0], y: others[1] };
    perp.push({ line: [apex, o], plane: base, why: { en: `${o}${apex} ⊥ ${o}${others[0]}, ${o}${others[1]} (given)`, vi: `${o}${apex} ⊥ ${o}${others[0]}, ${o}${others[1]} (giả thiết)` } });
    heightWhy = { en: `${o}${apex} is perpendicular to the plane (${base.join("")}).`, vi: `${o}${apex} vuông góc với mặt phẳng (${base.join("")}).` };
  } else if (shape === "square" || shape === "rectangle") {
    const [A, B, C, D] = base;
    let w = seg(A, B) ?? seg(C, D);
    let l = seg(A, D) ?? seg(B, C);
    if (shape === "square") {
      w ??= l ?? edgeVal;
      const diag = seg(A, C) ?? seg(B, D);
      if (w === undefined && diag !== undefined) w = diag / Math.SQRT2;
      l = w;
    }
    if (shape === "rectangle" && w !== undefined && l === undefined) {
      const diag = seg(A, C) ?? seg(B, D);
      if (diag !== undefined && diag > w) l = Math.sqrt(diag ** 2 - w ** 2);
    }
    if (cube) w = l = w ?? edgeVal;
    if (w === undefined || l === undefined) {
      needSides({ en: `E.g. “${A}${B} = a, ${A}${D} = 2a” or “cạnh a”.`, vi: `Ví dụ “${A}${B} = a, ${A}${D} = 2a” hoặc “cạnh a”.` });
      w ??= 1;
      l ??= shape === "rectangle" ? 1.5 * w : w;
    }
    pts.set(A, [0, 0, 0]);
    pts.set(B, [w!, 0, 0]);
    pts.set(C, [w!, l!, 0]);
    pts.set(D, [0, l!, 0]);
    axes = { origin: A, x: B, y: D };
  } else if (shape === "rhombus" || shape === "parallelogram") {
    const [A, B, C, D] = base;
    let p = seg(A, B) ?? seg(C, D);
    let q = seg(A, D) ?? seg(B, C);
    const ac = seg(A, C);
    const bd = seg(B, D);
    if (shape === "rhombus") {
      p ??= q ?? edgeVal;
      if (p === undefined && ac !== undefined && bd !== undefined) p = Math.hypot(ac, bd) / 2;
      q = p;
    }
    let th = angAt(A) ?? angAt(C);
    const tb = angAt(B) ?? angAt(D);
    if (th === undefined && tb !== undefined) th = 180 - tb;
    // “tam giác ABD đều”: the angle at the vertex between the other two is 60°.
    for (const m of s.matchAll(/(?:tam giác|triangle)\s+([A-Z])([A-Z])([A-Z])\s+(?:là tam giác\s+|is\s+)?(?:đều|equilateral)|([A-Z])([A-Z])([A-Z])\s+(?:là|is)\s+(?:một\s+|an\s+)?(?:tam giác đều|equilateral)/gu)) {
      if (th !== undefined) break;
      const t = (m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]]).filter(Boolean);
      const v = t.find((x) => base.includes(x) && nb(x).every((y) => t.includes(y)));
      if (v) th = v === A || v === C ? 60 : 120;
    }
    if (th === undefined && p !== undefined && q !== undefined) {
      if (bd !== undefined) th = Math.acos((p ** 2 + q ** 2 - bd ** 2) / (2 * p * q)) / RAD;
      else if (ac !== undefined) th = Math.acos((ac ** 2 - p ** 2 - q ** 2) / (2 * p * q)) / RAD;
    }
    if (p === undefined || q === undefined || th === undefined || !(th > 0 && th < 180)) {
      needSides(shape === "rhombus"
        ? { en: `E.g. “hình thoi cạnh a, góc ${B}${A}${D} = 60°” or the diagonals “${A}${C} = 2a, ${B}${D} = 2a√3”.`, vi: `Ví dụ “hình thoi cạnh a, góc ${B}${A}${D} = 60°” hoặc hai đường chéo “${A}${C} = 2a, ${B}${D} = 2a√3”.` }
        : { en: `E.g. “${A}${B} = a, ${A}${D} = 2a, góc ${B}${A}${D} = 60°”.`, vi: `Ví dụ “${A}${B} = a, ${A}${D} = 2a, góc ${B}${A}${D} = 60°”.` });
      p ??= q ?? 1;
      q ??= shape === "rhombus" ? p : 1.5 * p;
      if (th === undefined || !(th > 0 && th < 180)) th = 65;
    }
    const t = th! * RAD;
    pts.set(A, [0, 0, 0]);
    pts.set(B, [p!, 0, 0]);
    pts.set(D, [q! * Math.cos(t), q! * Math.sin(t), 0]);
    pts.set(C, [p! + q! * Math.cos(t), q! * Math.sin(t), 0]);
    axes = { origin: A, x: B, y: null };
  } else if (shape === "trapezoid") {
    placeTrapezoid();
  } else if (shape === "quadrilateral") {
    // An irregular quadrilateral: no two sides parallel, nothing at right angles. Chosen so that in the
    // textbook view (index.ts) AB runs along the front and D, C sit well behind — the way it is drawn in class.
    const at4: V3[] = [[0, 0, 0], [1.64, -0.17, 0], [1.07, 2.49, 0], [0.06, 1.72, 0]];
    base.forEach((b, i) => pts.set(b, at4[i]));
    axes = { origin: base[0], x: base[1], y: null };
  } else if (n === 3) {
    placeTriangle();
  }
  const baseFace: Face = { pts: base, shape, rightAt: shape === "right" ? axes.origin : shape === "isosceles" ? at : undefined, right: trapRight, par: trapPar };
  const faces: Face[] = [baseFace];
  const taken = new Set<string>([...base, ...(apex ? [apex] : []), ...(top ?? [])]);
  const mids = new Map<string, [string, string]>();
  const P = (x: string) => pts.get(x)!;
  const centre = (names: string[]): V3 => mul3(names.reduce<V3>((acc, x) => add3(acc, P(x)), [0, 0, 0]), 1 / names.length);
  const baseText = `(${base.join("")})`;
  const baseRe = String.raw`(?:mặt phẳng\s*|mp\s*)?(?:\(${base.join("")}\)|(?:mặt\s+)?(?:phẳng\s+)?đáy|the base|base)`;

  /** Distance from a base point to the line XY (in the base plane). */
  const toLine = (p: V3, x: string, y: string) => len3(cross3(sub3(p, P(x)), sub3(P(y), P(x)))) / len3(sub3(P(y), P(x)));

  // Points on the base named in the text (centre O, midpoint H of AB, H on AB with AH = 2HB) — the apex may stand on them.
  derived();

  // ── Prism top ──
  if (kind === "prism") {
    const right = cube || box || RIGHT_PRISM.test(s);
    let lifted: { top: string; foot: string } | undefined;
    if (!right) {
      for (const t of top!) {
        const f = footOf(t, false);
        if (f) {
          lifted = { top: t, foot: f };
          break;
        }
      }
    }
    const span = Math.max(...base.map((b) => len3(sub3(P(b), centre(base)))));
    let prismMissing = baseMissing();
    if (!right && !lifted) {
      // A slanted prism with no projection given: parallel lines and sections still work on a generic one.
      prismMissing = { msg: { en: "For a slanted prism I need where a top vertex projects onto the base.", vi: "Với lăng trụ xiên cần biết hình chiếu của một đỉnh trên lên đáy." }, hint: { en: `Say “lăng trụ đứng”, or e.g. “hình chiếu vuông góc của ${top![0]} lên (${base.join("")}) là trung điểm của ${base[1]}${base[2]}”.`, vi: `Ghi “lăng trụ đứng”, hoặc ví dụ “hình chiếu vuông góc của ${top![0]} lên (${base.join("")}) là trung điểm của ${base[1]}${base[2]}”.` } };
      h = 1.3 * span;
      base.forEach((b, i) => pts.set(top![i], add3(P(b), [0.35 * span, 0.2 * span, h!])));
    } else if (lifted) {
      const t = lifted.top;
      const mate = t.slice(0, -1);
      h = heightOf(t, lifted.foot, mate);
      if (h === undefined) {
        prismMissing = { msg: { en: "I need the prism's height, a lateral edge, or an angle with the base.", vi: "Cần chiều cao, một cạnh bên, hoặc góc giữa cạnh bên và đáy." }, hint: { en: `E.g. “${mate}${t} = 2a” or “góc giữa ${mate}${t} và (${base.join("")}) bằng 60°”.`, vi: `Ví dụ “${mate}${t} = 2a” hoặc “góc giữa ${mate}${t} và (${base.join("")}) bằng 60°”.` } };
        h = 1.3 * span;
      }
      const shift = sub3(add3(P(lifted.foot), [0, 0, h!]), P(mate));
      base.forEach((b, i) => pts.set(top![i], add3(P(b), shift)));
      perp.push({ line: [t, lifted.foot], plane: top!, why: { en: `${t}${lifted.foot} ⊥ (${top!.join("")}) (the two bases are parallel)`, vi: `${t}${lifted.foot} ⊥ (${top!.join("")}) (hai đáy song song)` } });
    } else {
      h = base.map((b) => seg(b, `${b}'`)).find((x) => x !== undefined) ?? val(new RegExp(String.raw`(?:cạnh bên|chiều cao|lateral edge|height)${is}${VAL}`, "u"));
      if (cube) h ??= len3(sub3(P(base[1]), P(base[0])));
      // A diagonal of a side face (A'B = 2a): Pythagoras in the rectangle ABB'A'.
      for (let i = 0; i < n && h === undefined; i++) {
        for (const j of [(i + 1) % n, (i + n - 1) % n]) {
          const d = seg(top![i], base[j]);
          const e = len3(sub3(P(base[j]), P(base[i])));
          if (d === undefined || d <= e) continue;
          h = Math.sqrt(d ** 2 - e ** 2);
          heightWhy = { en: `Pythagoras in the right triangle ${top![i]}${base[i]}${base[j]}: ${base[i]}${top![i]}² = ${top![i]}${base[j]}² − ${base[i]}${base[j]}².`, vi: `Định lý Pi-ta-go trong tam giác vuông ${top![i]}${base[i]}${base[j]}: ${base[i]}${top![i]}² = ${top![i]}${base[j]}² − ${base[i]}${base[j]}².` };
          break;
        }
      }
      const ang2 = s.match(new RegExp(String.raw`(?:góc giữa\s+(?:đường thẳng\s+)?(${PT})(${PT})\s+và\s+${baseRe}\s+(?:bằng\s+)?|(${PT})(${PT})\s+(?:tạo với|hợp với)\s+${baseRe}\s+(?:một\s+)?góc\s+)(\d+(?:[.,]\d+)?)`, "u"));
      if (h === undefined && ang2) {
        const [x, y] = ang2[1] ? [ang2[1], ang2[2]] : [ang2[3], ang2[4]];
        const t = x.endsWith("'") ? x : y;
        const b = t === x ? y : x;
        const f = t.slice(0, 1);
        h = len3(sub3(P(b), P(f))) * Math.tan(angleOf(ang2[5]) * RAD);
        heightWhy = { en: `${f}${t} ⊥ (base), so the angle between ${x}${y} and the base is ∠${t}${b}${f}: ${f}${t} = ${f}${b}·tan ${ang2[5]}°.`, vi: `${f}${t} ⊥ đáy nên góc giữa ${x}${y} và đáy là góc ${t}${b}${f}: ${f}${t} = ${f}${b}·tan ${ang2[5]}°.` };
      }
      if (h === undefined) {
        prismMissing ??= { msg: { en: "I need the prism's height (its lateral edge).", vi: "Cần chiều cao (cạnh bên) của lăng trụ." }, hint: { en: `E.g. “${base[0]}${top![0]} = 2a”.`, vi: `Ví dụ “${base[0]}${top![0]} = 2a”.` } };
        h = 1.3 * span;
      }
      base.forEach((b, i) => pts.set(top![i], add3(P(b), [0, 0, h!])));
      for (const b of base) {
        perp.push({ line: [b, `${b}'`], plane: base, why: { en: `${b}${b}' ⊥ ${baseText} (right prism)`, vi: `${b}${b}' ⊥ ${baseText} (lăng trụ đứng)` } });
        perp.push({ line: [b, `${b}'`], plane: top!, why: { en: `${b}${b}' ⊥ (${top!.join("")}) (right prism)`, vi: `${b}${b}' ⊥ (${top!.join("")}) (lăng trụ đứng)` } });
      }
    }
    faces.push({ pts: top!, shape, rightAt: baseFace.rightAt ? `${baseFace.rightAt}'` : undefined, right: trapRight?.map((x) => `${x}'`), par: trapPar?.map((x) => `${x}'`) as Face["par"] });
    for (let i = 0; i < n; i++) {
      const [b1, b2] = [base[i], base[(i + 1) % n]];
      faces.push({ pts: [b1, b2, `${b2}'`, `${b1}'`], shape: !right ? "parallelogram" : cube && Math.abs(len3(sub3(P(b2), P(b1))) - h!) < 1e-9 ? "square" : "rectangle" });
    }
    derived();
    return { name, kind, pts, base, top, shape, h: h!, sym, faces, perp, lines, axes, why, heightWhy, taken, mids, lift: lifted, missing: prismMissing, generic: !right && !lifted };
  }

  // ── Pyramid apex: where it stands over the base ──
  const ap = apex!;
  foot ??= footOf(ap, true) ?? undefined;
  // Where the apex stands isn't given: parallel lines, intersections and sections hold for any apex, so it goes over a point off every symmetry.
  const span = Math.max(...base.map((b) => len3(sub3(P(b), centre(base)))));
  const F = foot ? P(foot) : add3(centre(base), [0.17 * span, 0.09 * span, 0]);

  // ── Pyramid height ──
  if (h === undefined && foot) h = heightOf(ap, foot, base.find((x) => x !== foot && !near(P(x), F)) ?? base[0]);
  // No height given: fine for ⊥ / ∥ proofs (they hold for any height); measures will ask for it.
  let freeHeight = false;
  if (h === undefined) {
    h = Math.max(...base.map((b) => len3(sub3(P(b), F))), 1) * (foot ? 1 : 1.3);
    freeHeight = true;
  }
  if (!(h > 0)) oops({ en: "I need the height, a lateral edge, or an angle with the base.", vi: "Cần chiều cao, một cạnh bên, hoặc góc với mặt đáy." }, { en: `E.g. “${ap}${foot} = a√2” or “góc giữa ${ap}${base[2]} và đáy bằng 60°”.`, vi: `Ví dụ “${ap}${foot} = a√2” hoặc “góc giữa ${ap}${base[2]} và đáy bằng 60°”.` });
  pts.set(ap, add3(F, [0, 0, h!]));
  for (let i = 0; i < n; i++) faces.push({ pts: [ap, base[i], base[(i + 1) % n]] });
  derived();
  const missing: Model["missing"] = !foot
    ? {
        msg: { en: `I can't tell where ${ap} stands over the base.`, vi: `Chưa xác định được vị trí của ${ap} so với đáy.` },
        hint: { en: `Say e.g. “${ap}${base[0]} ⊥ (${base.join("")})”, “hình chóp đều”, “${ap}${base.join(` = ${ap}`)}”, or “tam giác ${ap}${base[0]}${base[1]} đều nằm trong mặt phẳng vuông góc với đáy”.`, vi: `Ví dụ “${ap}${base[0]} ⊥ (${base.join("")})”, “hình chóp đều”, “${ap}${base.join(` = ${ap}`)}”, hoặc “tam giác ${ap}${base[0]}${base[1]} đều nằm trong mặt phẳng vuông góc với đáy”.` },
      }
    : baseMissing();
  return { name, kind, pts, apex: ap, base, shape, foot, h: h!, sym, faces, perp, lines, axes, why, heightWhy, taken, mids, freeHeight, missing, generic: !foot };

  function baseMissing(): Model["missing"] {
    return freeBase && { msg: { en: "I need more about the base's sides or angles.", vi: "Cần thêm dữ kiện về cạnh hoặc góc của đáy." }, hint: freeBase };
  }

  /* ───────── Base polygons ───────── */

  function placeTriangle() {
    const side = base.map((_, i) => seg(base[(i + 1) % 3], base[(i + 2) % 3]));
    const A = base.map((v) => angAt(v));
    const vtx = at ?? base[0];
    if (!base.includes(vtx)) oops({ en: `${vtx} isn't a vertex of the base.`, vi: `${vtx} không phải đỉnh của đáy.` }, { en: "Check the vertex named after “tại”.", vi: "Kiểm tra lại đỉnh ghi sau “tại”." });
    const i = base.indexOf(vtx);
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    if (shape === "equilateral") {
      const e = side.find((x) => x !== undefined) ?? edgeVal;
      if (e !== undefined) side.fill(e);
      A.fill(60);
    } else if (shape === "right") {
      A[i] = 90;
      if (isosRight) {
        A[j] = A[k] = 45;
        if (!side.some((x) => x !== undefined) && edgeVal !== undefined) side[j] = side[k] = edgeVal;
      }
    } else if (shape === "isosceles") {
      if (!at) oops({ en: "Which vertex is the isosceles triangle's apex?", vi: "Tam giác cân tại đỉnh nào?" }, { en: "Say e.g. “tam giác cân tại A”.", vi: "Ví dụ “tam giác cân tại A”." });
      side[j] ??= side[k];
      side[k] ??= side[j];
      A[j] ??= A[k];
      A[k] ??= A[j];
    }
    let sides = solveTri(side, A);
    if (!sides) {
      needSides({ en: `E.g. “${base[0]}${base[1]} = a, ${base[0]}${base[2]} = 2a, góc ${base[1]}${base[0]}${base[2]} = 120°”.`, vi: `Ví dụ “${base[0]}${base[1]} = a, ${base[0]}${base[2]} = 2a, góc ${base[1]}${base[0]}${base[2]} = 120°”.` });
      if (side.every((x) => x !== undefined)) return oops({ en: "These sides don't make a triangle.", vi: "Các cạnh này không tạo thành tam giác." }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
      // A generic triangle of the right kind.
      const legs = (x: number) => (x === i ? undefined : 1.2 + 0.2 * (x === j ? 1 : 0));
      if (shape === "equilateral") sides = [1, 1, 1];
      else if (shape === "right") sides = solveTri([0, 1, 2].map(legs), [0, 1, 2].map((x) => (x === i ? 90 : undefined)));
      else if (shape === "isosceles") sides = solveTri([0, 1, 2].map((x) => (x === i ? undefined : 1.2)), [0, 1, 2].map((x) => (x === i ? 50 : undefined)));
      sides ??= [1.3, 1.1, 1.2];
    }
    const [Y, Z] = [base[j], base[k]];
    const oy = sides![k];
    const oz = sides![j];
    pts.set(vtx, [0, 0, 0]);
    if (shape === "right") {
      // The legs along the axes.
      pts.set(Y, [oy, 0, 0]);
      pts.set(Z, [0, oz, 0]);
      axes = { origin: vtx, x: Y, y: Z };
      return;
    }
    const cosO = (oy ** 2 + oz ** 2 - sides![i] ** 2) / (2 * oy * oz);
    const sinO = Math.sqrt(Math.max(0, 1 - cosO ** 2));
    pts.set(Y, [oy, 0, 0]);
    pts.set(Z, [oz * cosO, oz * sinO, 0]);
    axes = { origin: vtx, x: Y, y: null };
  }

  function placeTrapezoid() {
    const half = /lục giác|hexagon/u.test(sw);
    const iso = /cân|isosceles/u.test(sw);
    if (/vuông|right/u.test(sw)) {
      // Right trapezoid at X and Y (a leg): X origin, XY along Ox, the parallel sides along Oy.
      let [X, Y] = [at ?? base[0], at2 ?? base[1]];
      if (!base.includes(X) || !base.includes(Y) || !nb(X).includes(Y)) oops({ en: "A right trapezoid has its right angles at the two ends of one leg (like A and B).", vi: "Hình thang vuông có hai góc vuông ở hai đầu một cạnh bên (như A và B)." }, { en: "Say e.g. “hình thang vuông tại A và B”.", vi: "Ví dụ “hình thang vuông tại A và B”." });
      if (base.indexOf(Y) !== (base.indexOf(X) + 1) % 4) [X, Y] = [Y, X];
      const X2 = nb(X)[0];
      const Y2 = nb(Y)[1];
      const leg = seg(X, Y);
      let x2 = seg(X, X2);
      let y2 = seg(Y, Y2);
      const slant = seg(X2, Y2);
      let lg = leg;
      if (lg === undefined && slant !== undefined && x2 !== undefined && y2 !== undefined) lg = Math.sqrt(slant ** 2 - (x2 - y2) ** 2);
      if (lg !== undefined && slant !== undefined) {
        const d = Math.sqrt(Math.max(0, slant ** 2 - lg ** 2));
        if (x2 === undefined && y2 !== undefined) x2 = y2 + d;
        if (y2 === undefined && x2 !== undefined) y2 = x2 - d;
      }
      if (lg === undefined || x2 === undefined || y2 === undefined) {
        needSides({ en: `E.g. “${X}${Y} = ${Y}${Y2} = a, ${X}${X2} = 2a”.`, vi: `Ví dụ “${X}${Y} = ${Y}${Y2} = a, ${X}${X2} = 2a”.` });
        lg ??= 1;
        x2 ??= 2;
        y2 ??= 1;
      }
      pts.set(X, [0, 0, 0]);
      pts.set(Y, [lg!, 0, 0]);
      pts.set(X2, [0, x2!, 0]);
      pts.set(Y2, [lg!, y2!, 0]);
      axes = { origin: X, x: Y, y: X2 };
      trapRight = [X, Y];
      trapPar = [X, X2, Y, Y2];
      return;
    }
    // The longer base PQ (“đáy lớn AD”, “đường kính AD”, or AD // BC with AD longer).
    const named = s.match(/(?:đáy lớn|đường kính|longer base|diameter)\s+(?:là\s+|is\s+)?([A-Z])([A-Z])/u);
    const parl = [...s.matchAll(/([A-Z])([A-Z])\s*(?:\/\/|song song(?:\s+với)?|is parallel to|parallel to)\s*([A-Z])([A-Z])/gu)].find((m) => [m[1], m[2], m[3], m[4]].every((x) => base.includes(x)));
    let PQ: [string, string] = [base[0], base[3]];
    if (named) PQ = [named[1], named[2]];
    else if (parl) {
      const l1 = seg(parl[1], parl[2]);
      const l2 = seg(parl[3], parl[4]);
      PQ = l2 !== undefined && (l1 === undefined || l2 > l1) ? [parl[3], parl[4]] : [parl[1], parl[2]];
    }
    const [Pn, Qn] = PQ;
    if (!base.includes(Pn) || !base.includes(Qn) || !nb(Pn).includes(Qn)) oops({ en: `${Pn}${Qn} isn't a side of the base.`, vi: `${Pn}${Qn} không phải cạnh của đáy.` }, { en: "Name the longer base, e.g. “đáy lớn AD”.", vi: "Ghi rõ đáy lớn, ví dụ “đáy lớn AD”." });
    const nP = nb(Pn).find((x) => x !== Qn)!;
    const nQ = nb(Qn).find((x) => x !== Pn)!;
    let big = seg(Pn, Qn);
    let small = seg(nP, nQ);
    let legL = seg(Pn, nP) ?? seg(Qn, nQ);
    let ht: number | undefined;
    if (half) {
      let e = big !== undefined ? big / 2 : small ?? legL ?? edgeVal;
      if (e === undefined) {
        needSides({ en: `E.g. “nửa lục giác đều, ${Pn}${Qn} = 2a”.`, vi: `Ví dụ “nửa lục giác đều nội tiếp đường tròn đường kính ${Pn}${Qn} = 2a”.` });
        e = 1;
      }
      big = 2 * e;
      small = legL = e;
    }
    const baseAng = angAt(Pn) ?? angAt(Qn);
    if (big !== undefined && small !== undefined && (iso || half)) {
      const d = (big - small) / 2;
      if (legL !== undefined) ht = Math.sqrt(legL ** 2 - d ** 2);
      else if (baseAng !== undefined) ht = d * Math.tan(baseAng * RAD);
    }
    if (big === undefined || small === undefined || ht === undefined || !(ht > 0)) {
      needSides({ en: `E.g. “${Pn}${Qn} = 2a, ${nP}${nQ} = ${Pn}${nP} = a”.`, vi: `Ví dụ “${Pn}${Qn} = 2a, ${nP}${nQ} = ${Pn}${nP} = a”.` });
      big ??= 2;
      small ??= 0.6 * big;
      if (!(ht! > 0)) ht = 0.9 * small;
    }
    // A general trapezoid leans to one side, so nothing looks symmetric by accident.
    const d = iso || half ? (big - small) / 2 : 0.3 * (big - small);
    pts.set(Pn, [0, 0, 0]);
    pts.set(Qn, [big, 0, 0]);
    pts.set(nP, [d, ht!, 0]);
    pts.set(nQ, [d + small, ht!, 0]);
    axes = { origin: Pn, x: Qn, y: null };
    trapPar = [Pn, Qn, nP, nQ];
  }

  /* ───────── Where a vertex stands over the base ───────── */

  /** A named point at x, reusing one already there. */
  function pointAt(x: V3, prefer: string[], def: Text): string {
    for (const [k, v] of pts) if (near(v, x)) return k;
    const p = fresh(prefer);
    pts.set(p, x);
    why.set(p, { en: `${p} is ${def.en}`, vi: `${p} là ${def.vi}` });
    return p;
  }

  function circumcentre(names: string[]): V3 {
    const [A, B, C] = names.slice(0, 3).map(P);
    const a = sub3(B, A);
    const b = sub3(C, A);
    const axb = cross3(a, b);
    const c = add3(A, mul3(cross3(sub3(mul3(b, dot3(a, a)), mul3(a, dot3(b, b))), axb), 1 / (2 * dot3(axb, axb))));
    const r = len3(sub3(A, c));
    if (names.slice(3).some((x) => Math.abs(len3(sub3(P(x), c)) - r) > 1e-9)) oops({ en: `${names.join("")} has no circumscribed circle, so the edges can't all be equal.`, vi: `${names.join("")} không nội tiếp được đường tròn, nên các cạnh bên không thể bằng nhau.` }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
    return c;
  }

  /**
   * The foot of `ap` (the apex, or a top vertex of a slanted prism) on the
   * base, with the fact “ap–foot ⊥ base”; null when the text doesn't say.
   */
  function footOf(ap: string, pyramid: boolean): string | null {
    const a = esc(ap);
    const fact = (f: string, w: Text) => {
      perp.push({ line: [ap, f], plane: base, why: w });
      return f;
    };
    const direct = s.match(new RegExp(String.raw`(?<![A-Z'])${a}(${PT})\s*(?:⊥|vuông góc(?:\s+với)?|is perpendicular to|perpendicular to)\s*${baseRe}`, "u"));
    if (direct && pts.has(direct[1]) && Math.abs(P(direct[1])[2]) < 1e-9) return fact(direct[1], { en: `${ap}${direct[1]} ⊥ ${baseText} (given)`, vi: `${ap}${direct[1]} ⊥ ${baseText} (giả thiết)` });
    const twoFaces = pyramid && s.match(new RegExp(String.raw`\(${a}([A-Z])([A-Z])\)\s*(?:và|and)\s*\(${a}([A-Z])([A-Z])\)\s*(?:cùng\s+)?(?:vuông góc|⊥|are perpendicular|both perpendicular)`, "u"));
    if (twoFaces) {
      const common = [twoFaces[1], twoFaces[2]].find((x) => x === twoFaces[3] || x === twoFaces[4]);
      if (!common) oops({ en: "Those two faces don't share an edge from the apex.", vi: "Hai mặt phẳng đó không có giao tuyến xuất phát từ đỉnh." }, { en: "Check the faces.", vi: "Kiểm tra lại." });
      return fact(common!, { en: `(${ap}${twoFaces[1]}${twoFaces[2]}) and (${ap}${twoFaces[3]}${twoFaces[4]}) are both ⊥ ${baseText}, so their common line ${ap}${common} is too`, vi: `(${ap}${twoFaces[1]}${twoFaces[2]}) và (${ap}${twoFaces[3]}${twoFaces[4]}) cùng vuông góc với ${baseText} nên giao tuyến ${ap}${common} ⊥ ${baseText}` });
    }
    const faceTri = pyramid && s.match(new RegExp(String.raw`(?:tam giác|triangle)\s+${a}([A-Z])([A-Z])\s+(đều|vuông cân tại ${a}|cân tại ${a}|vuông tại ${a}|equilateral|isosceles)?[^.;]*?(?:nằm trong mặt phẳng vuông góc|lies in a plane perpendicular|in a plane perpendicular)`, "u"));
    if (faceTri) {
      const [x, y] = [faceTri[1], faceTri[2]];
      const mName = pointAt(mul3(add3(P(x), P(y)), 0.5), ["H", "I", "M"], { en: `the midpoint of ${x}${y}`, vi: `trung điểm của ${x}${y}` });
      mids.set(mName, [x, y]);
      const xy = len3(sub3(P(y), P(x)));
      if (/đều|equilateral/u.test(faceTri[3] ?? "")) {
        h = (xy * Math.sqrt(3)) / 2;
        heightWhy = { en: `${ap}${mName} is the height of the equilateral triangle ${ap}${x}${y}: ${x}${y}·√3/2.`, vi: `${ap}${mName} là đường cao của tam giác đều ${ap}${x}${y}: bằng ${x}${y}·√3/2.` };
      } else if (/vuông cân|vuông tại/u.test(faceTri[3] ?? "")) {
        h = xy / 2;
        heightWhy = { en: `In the right isosceles triangle ${ap}${x}${y}, the median ${ap}${mName} is half the hypotenuse.`, vi: `Trong tam giác vuông cân ${ap}${x}${y}, trung tuyến ${ap}${mName} bằng nửa cạnh huyền.` };
      }
      return fact(mName, { en: `${ap}${mName} ⊥ ${x}${y} in (${ap}${x}${y}) ⊥ ${baseText}`, vi: `${ap}${mName} ⊥ ${x}${y} trong mặt phẳng (${ap}${x}${y}) vuông góc với ${baseText}` });
    }
    const proj = s.match(new RegExp(String.raw`(?:hình chiếu (?:vuông góc )?(?:của\s+)?(?:đỉnh\s+|điểm\s+)?${a}\s+(?:lên|trên|xuống)\s+${baseRe}\s+(?:là|trùng với)|(?:orthogonal\s+)?projection of ${a} (?:onto|on) ${baseRe} is)\s+(?:the\s+)?(?:điểm\s+|point\s+)?(?:(tâm đường tròn ngoại tiếp|trung điểm|trọng tâm|tâm|giao điểm|circumcent(?:re|er)|midpoint|centroid|cent(?:re|er)|intersection)\s+)?(?:([A-Z])(?![A-Z']))?\s*(?:(?:của|thuộc|of|on)\s+(?:the\s+)?(?:cạnh\s+|tam giác\s+|đoạn\s+|edge\s+|side\s+|triangle\s+|segment\s+)?([A-Z]{2,4}))?`, "u"));
    if (proj && (proj[1] || proj[2])) {
      const tag = proj[1] ?? "";
      const pname = proj[2];
      const of = proj[3]?.split("").every((x) => pts.has(x)) ? proj[3].split("") : undefined;
      const said = { en: `${ap}F ⊥ ${baseText} (F is the projection of ${ap})`, vi: `${ap}F ⊥ ${baseText} (F là hình chiếu của ${ap})` };
      const named = (f: string) => fact(f, { en: said.en.replace(/F/g, f), vi: said.vi.replace(/F/g, f) });
      if (pname && pts.has(pname)) return named(pname);
      let x: V3;
      let def: Text;
      if (/trung điểm|midpoint/u.test(tag) && of?.length === 2) {
        x = mul3(add3(P(of[0]), P(of[1])), 0.5);
        def = { en: `the midpoint of ${of.join("")}`, vi: `trung điểm của ${of.join("")}` };
      } else if (/trọng tâm|centroid/u.test(tag)) {
        x = centre(of ?? base);
        def = { en: `the centroid of ${(of ?? base).join("")}`, vi: `trọng tâm tam giác ${(of ?? base).join("")}` };
      } else if (/ngoại tiếp|circum/u.test(tag)) {
        x = circumcentre(of ?? base);
        def = { en: `the circumcentre of ${(of ?? base).join("")}`, vi: `tâm đường tròn ngoại tiếp ${(of ?? base).join("")}` };
      } else if (/giao điểm|intersection/u.test(tag) && n === 4) {
        x = meet([base[0], base[2]], [base[1], base[3]]);
        def = { en: `the intersection of ${base[0]}${base[2]} and ${base[1]}${base[3]}`, vi: `giao điểm của ${base[0]}${base[2]} và ${base[1]}${base[3]}` };
      } else if (tag) {
        x = n === 4 ? meet([base[0], base[2]], [base[1], base[3]]) : centre(base);
        def = { en: `the centre of the base`, vi: `tâm của đáy` };
      } else {
        return oops({ en: `Where is ${pname} on the base?`, vi: `Điểm ${pname} nằm ở đâu trên đáy?` }, { en: `Say e.g. “${pname} là trung điểm của ${base[0]}${base[1]}”.`, vi: `Ví dụ “${pname} là trung điểm của ${base[0]}${base[1]}”.` });
      }
      const f = pname ?? fresh(["H", "O", "G"]);
      pts.set(f, x);
      taken.add(f);
      why.set(f, { en: `${f} is ${def.en}`, vi: `${f} là ${def.vi}` });
      if (/trung điểm|midpoint/u.test(tag) && of?.length === 2) mids.set(f, [of[0], of[1]]);
      return named(f);
    }
    // SA = SB = SC (or “the lateral edges are equal”): the foot is the circumcentre.
    const chain = s.match(new RegExp(String.raw`(?<![A-Z'])${a}[A-Z](?:\s*=\s*${a}[A-Z])+`, "u"));
    const eqNames = chain ? [...new Set([...chain[0].matchAll(new RegExp(`${a}([A-Z])`, "g"))].map((m) => m[1]))].filter((x) => base.includes(x)) : [];
    const allEqual = pyramid && /các cạnh bên bằng nhau|cạnh bên bằng nhau|lateral edges are (?:all )?equal|equal lateral edges/u.test(s);
    if (eqNames.length >= 3 || allEqual) {
      const names = eqNames.length >= 3 ? eqNames : base;
      const c = circumcentre(names);
      const hypMid = shape === "right" && names.length === 3;
      const f = pointAt(c, ["O", "H", "I"], hypMid ? { en: "the midpoint of the hypotenuse", vi: "trung điểm cạnh huyền" } : { en: "the circumcentre of the base", vi: "tâm đường tròn ngoại tiếp đáy" });
      const eqs = names.map((x) => `${ap}${x}`).join(" = ");
      return fact(f, {
        en: `${eqs}, so the projection ${f} of ${ap} is equally far from ${names.join(", ")}: the circumcentre of ${names.join("")}${hypMid ? " (the midpoint of the hypotenuse)" : ""}`,
        vi: `${eqs} nên hình chiếu ${f} của ${ap} lên đáy cách đều ${names.join(", ")}: ${f} là tâm đường tròn ngoại tiếp ${names.join("")}${hypMid ? " (trung điểm cạnh huyền)" : ""}`,
      });
    }
    if (pyramid && regular) {
      const o = pointAt(centre(base), base.includes("O") ? ["H", "G"] : ["O", "H"], n === 4 ? { en: `the centre of the square ${base.join("")}`, vi: `tâm hình vuông ${base.join("")}` } : { en: `the centre of the equilateral triangle ${base.join("")}`, vi: `tâm tam giác đều ${base.join("")}` });
      return fact(o, { en: `${ap}${o} ⊥ ${baseText} (regular pyramid)`, vi: `${ap}${o} ⊥ ${baseText} (hình chóp đều)` });
    }
    return null;
  }

  /** The height of `ap` over its foot: given, from a lateral edge (default `mate`), or from an angle with the base. */
  function heightOf(ap: string, ft: string, mate: string): number | undefined {
    if (h !== undefined) return h;
    const a = esc(ap);
    const Fp = P(ft);
    const direct = seg(ap, ft) ?? val(new RegExp(String.raw`(?:chiều cao|đường cao|height)(?:\s+${a}${ft})?${is}${VAL}`, "u"));
    if (direct !== undefined) return direct;
    const lateral = base.map((b) => [b, seg(ap, b)] as const).find(([b, v]) => v !== undefined && b !== ft && !near(P(b), Fp));
    const edge = tetraReg ? len3(sub3(P(base[1]), P(base[0]))) : val(new RegExp(String.raw`(?:cạnh bên|lateral edge)${is}${VAL}`, "u"));
    const line = String.raw`(?:(${a})(${PT})|(${PT})(${a})|cạnh bên|lateral edges?)`;
    const between = String.raw`(?:góc giữa|(?:the\s+)?angle between)\s+(?:đường thẳng\s+|mặt phẳng\s+|mp\s+|the\s+)?`;
    const equals = String.raw`\s+(?:bằng\s+|is\s+|equals\s+|=\s*)?`;
    const lineAng = s.match(new RegExp(String.raw`(?:${between}${line}\s+(?:và|and)\s+${baseRe}${equals}|${line}\s+(?:tạo với|hợp với|makes)\s+${baseRe}\s+(?:một\s+)?(?:góc\s+|an angle of\s+)?)(\d+(?:[.,]\d+)?)`, "u"));
    const planeAng = s.match(new RegExp(String.raw`(?:${between}\((${a})(${PT})(${PT})(?:${PT})?\)\s+(?:và|and)\s+${baseRe}${equals}|(?:mặt bên|lateral face)(?:\s+\((${a})(${PT})(${PT})\))?\s+(?:tạo với|hợp với|makes)\s+${baseRe}\s+(?:một\s+)?(?:góc\s+|an angle of\s+)?)(\d+(?:[.,]\d+)?)`, "u"));
    const dihedral = s.match(new RegExp(String.raw`(?:góc nhị diện|dihedral angle)\s*\[\s*${a}\s*,?\s*(${PT})(${PT})\s*,?\s*${PT}\s*\]\s*(?:bằng|=|là|is|of)\s*(\d+(?:[.,]\d+)?)`, "u"));
    if (lateral || edge !== undefined) {
      const [b, v] = lateral ?? [mate, edge!];
      const fb = len3(sub3(P(b), Fp));
      if (v! <= fb) oops({ en: `${ap}${b} is too short to reach from the base.`, vi: `${ap}${b} quá ngắn, không dựng được hình.` }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
      heightWhy = { en: `Pythagoras in the right triangle ${ap}${ft}${b}: ${ap}${ft}² = ${ap}${b}² − ${ft}${b}².`, vi: `Định lý Pi-ta-go trong tam giác vuông ${ap}${ft}${b}: ${ap}${ft}² = ${ap}${b}² − ${ft}${b}².` };
      return Math.sqrt(v! ** 2 - fb ** 2);
    }
    if (lineAng) {
      const named = [lineAng[2], lineAng[3], lineAng[6], lineAng[7]].find((x) => x !== undefined && x !== ap);
      let b = named && pts.has(named) ? named : mate;
      if (near(P(b), Fp)) b = base.find((x) => !near(P(x), Fp))!;
      const deg = angleOf(lineAng[9]);
      heightWhy = { en: `${ft}${b} is the projection of ${ap}${b} on the base, so the given angle is ∠${ap}${b}${ft}: ${ap}${ft} = ${ft}${b}·tan ${deg}°.`, vi: `${ft}${b} là hình chiếu của ${ap}${b} lên đáy nên góc đã cho là góc ${ap}${b}${ft}: ${ap}${ft} = ${ft}${b}·tan ${deg}°.` };
      return len3(sub3(P(b), Fp)) * Math.tan(deg * RAD);
    }
    const face = planeAng ? (planeAng[2] ? [planeAng[2], planeAng[3]] : planeAng[5] ? [planeAng[5], planeAng[6]] : [base[0], base[1]]) : dihedral ? [dihedral[1], dihedral[2]] : null;
    if (face && pts.has(face[0]) && pts.has(face[1])) {
      const [x, y] = face;
      const deg = angleOf(planeAng ? planeAng[7] : dihedral![3]);
      const d = toLine(Fp, x, y);
      if (d < 1e-9) return undefined;
      heightWhy = { en: `With ${ft}K ⊥ ${x}${y}, the angle between the face and the base is ∠${ap}K${ft}: ${ap}${ft} = ${ft}K·tan ${deg}°.`, vi: `Kẻ ${ft}K ⊥ ${x}${y}, góc giữa mặt bên và đáy là góc ${ap}K${ft}: ${ap}${ft} = ${ft}K·tan ${deg}°.` };
      return d * Math.tan(deg * RAD);
    }
    return undefined;
  }

  /** Where lines XY and ZW meet. */
  function meet(l1: [string, string], l2: [string, string]): V3 {
    const u = sub3(P(l1[1]), P(l1[0]));
    const v = sub3(P(l2[1]), P(l2[0]));
    const uxv = cross3(u, v);
    const t = dot3(cross3(sub3(P(l2[0]), P(l1[0])), v), uxv) / dot3(uxv, uxv);
    return add3(P(l1[0]), mul3(u, t));
  }

  /** A name not used yet. */
  function fresh(prefer: string[]): string {
    const all = [...prefer, "K", "E", "F", "I", "J", "P", "Q", "R", "T"];
    const pick = all.find((x) => !taken.has(x) && !new RegExp(`(?<![A-Z])${x}(?![A-Z'])`).test(s.replace(/\(.*?\)/g, ""))) ?? all.find((x) => !taken.has(x))!;
    taken.add(pick);
    return pick;
  }

  /** Points defined in the text: midpoints, centres, centroids, intersections, points dividing an edge, projections. Runs again once more points exist. */
  function derived() {
    const define = (p: string, x: V3, text: Text) => {
      pts.set(p, x);
      taken.add(p);
      why.set(p, text);
    };
    const has = (x: string) => pts.has(x);
    // M, N lần lượt là trung điểm (của) SA, SB.
    for (const m of s.matchAll(/(?<![A-Z0-9'])([A-Z](?:'?)(?:[\s,]+(?:và\s+|and\s+)?[A-Z]'?)*)\s+(?:lần lượt\s+)?(?:là|are|is)\s+(?:the\s+)?(?:các\s+)?(?:trung điểm|midpoints?)\s+(?:của\s+|of\s+)?(?:các\s+)?(?:cạnh\s+|đoạn\s+|edges?\s+)?((?:[A-Z]'?[A-Z]'?)(?:[\s,]+(?:và\s+|and\s+)?(?:cạnh\s+)?[A-Z]'?[A-Z]'?)*)/gu)) {
      const segs = segList(m[2]);
      // “trọng tâm G, M là trung điểm BC”: the names just before “là” go with the segments.
      const names = nameList(m[1]).slice(-segs.length);
      names.forEach((p, i) => {
        const sg = segs[i];
        if (!sg || has(p)) return;
        const [x, y] = sg.match(/[A-Z]'?/g)!;
        if (has(x) && has(y)) {
          define(p, mul3(add3(P(x), P(y)), 0.5), { en: `${p} is the midpoint of ${sg}`, vi: `${p} là trung điểm của ${sg}` });
          mids.set(p, [x, y]);
        }
      });
    }
    for (const m of s.matchAll(/(?:trung điểm|midpoint)\s+([A-Z]'?)\s+(?:của\s+|of\s+)?(?:cạnh\s+|đoạn\s+)?([A-Z]'?)([A-Z]'?)/gu)) {
      if (!has(m[1]) && has(m[2]) && has(m[3])) {
        define(m[1], mul3(add3(P(m[2]), P(m[3])), 0.5), { en: `${m[1]} is the midpoint of ${m[2]}${m[3]}`, vi: `${m[1]} là trung điểm của ${m[2]}${m[3]}` });
        mids.set(m[1], [m[2], m[3]]);
      }
    }
    // O là giao điểm của AC và BD; AC cắt BD tại O.
    const meets = [
      ...[...s.matchAll(/([A-Z])\s+(?:là|is)\s+(?:the\s+)?(?:giao điểm|intersection)\s+(?:của\s+|of\s+)?(?:hai đường chéo\s+|(?:the\s+)?diagonals\s+)?([A-Z]'?)([A-Z]'?)\s+(?:và|and)\s+([A-Z]'?)([A-Z]'?)/gu)].map((m) => [m[1], m[2], m[3], m[4], m[5]]),
      ...[...s.matchAll(/([A-Z]'?)([A-Z]'?)\s+(?:cắt|meets|intersects)\s+([A-Z]'?)([A-Z]'?)\s+(?:tại|at)\s+([A-Z])/gu)].map((m) => [m[5], m[1], m[2], m[3], m[4]]),
    ];
    for (const [p, a1, a2, b1, b2] of meets) {
      if (has(p) || ![a1, a2, b1, b2].every(has)) continue;
      const u = sub3(P(a2), P(a1));
      const v = sub3(P(b2), P(b1));
      if (len3(cross3(u, v)) < 1e-9) continue;
      define(p, meet([a1, a2], [b1, b2]), { en: `${p} is the intersection of ${a1}${a2} and ${b1}${b2}`, vi: `${p} là giao điểm của ${a1}${a2} và ${b1}${b2}` });
    }
    // “hình thoi tâm O”, “square ABCD with centre O”.
    for (const m of s.matchAll(/(?:hình vuông|hình chữ nhật|hình thoi|hình bình hành|square|rectangle|rhombus|parallelogram)\s+(?:base\s+)?(?:[A-Z]{4}\s+)?(?:có\s+|with\s+)?(?:tâm|cent(?:re|er))\s+([A-Z])(?![A-Z'])/gu)) {
      if (!has(m[1]) && n === 4) define(m[1], meet([base[0], base[2]], [base[1], base[3]]), { en: `${m[1]} is the centre of ${base.join("")}`, vi: `${m[1]} là tâm của ${base.join("")}` });
    }
    // O là tâm / giao điểm (hai đường chéo) của đáy; G là trọng tâm tam giác ABC.
    for (const m of s.matchAll(/([A-Z])\s+(?:là|is)\s+(?:the\s+)?(trọng tâm|tâm|giao điểm|centroid|centre|center|intersection)(?:\s+(?:của\s+|of\s+)?(?:hai đường chéo\s+|hình vuông\s+|hình chữ nhật\s+|hình thoi\s+|hình bình hành\s+|đáy\s+|tam giác\s+|triangle\s+|the\s+)?([A-Z]{3,4})?)?/gu)) {
      if (has(m[1])) continue;
      if (m[3] && ![...m[3]].every(has)) continue;
      const of = m[3] ? m[3].split("") : base;
      if (/trọng tâm|centroid/u.test(m[2])) define(m[1], centre(of), { en: `${m[1]} is the centroid of ${of.join("")}`, vi: `${m[1]} là trọng tâm tam giác ${of.join("")}` });
      else if (of.length === 4) define(m[1], meet([of[0], of[2]], [of[1], of[3]]), { en: `${m[1]} is the intersection of the diagonals of ${of.join("")}`, vi: `${m[1]} là giao điểm hai đường chéo của ${of.join("")}` });
      else define(m[1], centre(of), { en: `${m[1]} is the centre of ${of.join("")}`, vi: `${m[1]} là tâm của ${of.join("")}` });
    }
    // H thuộc cạnh AB sao cho AH = 2HB.
    for (const m of s.matchAll(/(?:điểm\s+|point\s+)?([A-Z]'?)\s+(?:là\s+(?:một\s+)?điểm\s+|is a point\s+|is\s+)?(?:thuộc|trên|nằm trên|lies on|on)\s+(?:cạnh\s+|đoạn\s+|đoạn thẳng\s+|đường thẳng\s+|the\s+)?(?:segment\s+|edge\s+|side\s+)?([A-Z]'?)([A-Z]'?)\s*,?\s*(?:sao cho|thỏa mãn|such that|with|so that)\s+([A-Z]'?)([A-Z]'?)\s*=\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)?\s*\*?\s*([A-Z]'?)([A-Z]'?)/gu)) {
      const [p, u, v] = [m[1], m[2], m[3]];
      if (has(p) || !has(u) || !has(v)) continue;
      // Lengths along UV as a + b·t (P = U + t·UV).
      const lin = (x: string, y: string): [number, number] | null => {
        const k = [x, y].sort().join("");
        if (k === [p, u].sort().join("")) return [0, 1];
        if (k === [p, v].sort().join("")) return [1, -1];
        if (k === [u, v].sort().join("")) return [1, 0];
        return null;
      };
      const l1 = lin(m[4], m[5]);
      const l2 = lin(m[7], m[8]);
      const kv = m[6] ? readValue(m[6])?.value : 1;
      if (!l1 || !l2 || kv === undefined) continue;
      const t = (kv * l2[0] - l1[0]) / (l1[1] - kv * l2[1]);
      if (!(t > 0 && t < 1)) continue;
      define(p, add3(P(u), mul3(sub3(P(v), P(u)), t)), { en: `${p} is on ${u}${v} with ${m[4]}${m[5]} = ${m[6] ?? ""}${m[7]}${m[8]}`, vi: `${p} thuộc ${u}${v} và ${m[4]}${m[5]} = ${m[6] ?? ""}${m[7]}${m[8]}` });
    }
    // H, K lần lượt là hình chiếu (vuông góc) của A lên SB, SD — or onto a plane (SBC).
    for (const m of s.matchAll(/([A-Z](?:[\s,]+(?:và\s+|and\s+)?[A-Z])*)\s+(?:lần lượt\s+)?(?:là|are|is)\s+(?:the\s+)?(?:hình chiếu|(?:orthogonal\s+)?projections?)\s+(?:vuông góc\s+)?(?:của\s+|of\s+)?([A-Z]'?)\s+(?:lên|trên|xuống|onto|on)\s+(?:các\s+)?(?:đường thẳng\s+|cạnh\s+|mặt phẳng\s+|mp\s+)?((?:\([A-Z']{3,8}\)|[A-Z]'?[A-Z]'?)(?:[\s,]+(?:và\s+)?(?:\([A-Z']{3,8}\)|[A-Z]'?[A-Z]'?))*)/gu)) {
      const names = nameList(m[1]);
      const from = m[2];
      const targets = m[3].match(/\([A-Z']{3,8}\)|[A-Z]'?[A-Z]'?/g) ?? [];
      names.forEach((p, i) => {
        const t = targets[i];
        if (!t || !has(from) || has(p)) return;
        if (t.startsWith("(")) {
          const pl = t.slice(1, -1).match(/[A-Z]'?/g)!;
          if (!pl.every(has)) return;
          const nrm = cross3(sub3(P(pl[1]), P(pl[0])), sub3(P(pl[2]), P(pl[0])));
          const k = dot3(sub3(P(from), P(pl[0])), nrm) / dot3(nrm, nrm);
          define(p, sub3(P(from), mul3(nrm, k)), { en: `${p} is the projection of ${from} onto ${t}`, vi: `${p} là hình chiếu của ${from} lên ${t}` });
          perp.push({ line: [from, p], plane: pl, why: { en: `${from}${p} ⊥ ${t} (given)`, vi: `${from}${p} ⊥ ${t} (giả thiết)` } });
        } else {
          const [x, y] = t.match(/[A-Z]'?/g)!;
          if (!has(x) || !has(y)) return;
          const u = sub3(P(y), P(x));
          const k = dot3(sub3(P(from), P(x)), u) / dot3(u, u);
          define(p, add3(P(x), mul3(u, k)), { en: `${p} is the projection of ${from} onto ${t}`, vi: `${p} là hình chiếu của ${from} lên ${t}` });
          lines.push({ a: [from, p], b: [x, y], kind: "perp", why: { en: `${p} is the projection of ${from} onto ${t}`, vi: `${p} là hình chiếu của ${from} lên ${t}` } });
        }
      });
    }
  }
}

/** Area of the base polygon. */
export function polygonArea(m: Model, names: string[]): number {
  const P = names.map((x) => m.pts.get(x)!);
  let acc: V3 = [0, 0, 0];
  for (let i = 1; i + 1 < P.length; i++) acc = add3(acc, cross3(sub3(P[i], P[0]), sub3(P[i + 1], P[0])));
  return len3(acc) / 2;
}
