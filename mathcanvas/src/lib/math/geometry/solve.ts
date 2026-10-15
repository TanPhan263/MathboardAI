import { L } from "../lang";
import { ratLatex, ratParen } from "../latex";
import { type Rat, add, div, isZero, mul, neg, rat, sign, sub, toNumber } from "../rational";
import { type StepDraft, finalize, step } from "../steps";
import {
  type Surd,
  addS,
  divS,
  fromRat,
  scaleS,
  sqrtOf,
  surdLatex,
  toNum,
} from "../surd";
import type { MathSolution, SolveFailure, SolveResult, StepKind, ValidationStatus } from "../types";
import { type GeoObject, type GeoProblem, type Goal, type Line, type Plane, type Point, type Round, parseGeometry } from "./parse";
import {
  AXES,
  type Vec,
  arrow,
  cross,
  det2,
  diffTex,
  dot,
  isZeroVec,
  lenSq,
  linTex,
  mid,
  nameTex,
  paramTex,
  primitive,
  prodTex,
  ratio,
  shiftSqTex,
  sqTex,
  surdTupleTex,
  toNums,
  vadd,
  vecTex,
  vscale,
  vsub,
} from "./vec";

/* ───────────────────────────── Results ───────────────────────────── */

export type Relation =
  | "planes-parallel"
  | "planes-same"
  | "planes-cross"
  | "planes-perpendicular"
  | "line-in-plane"
  | "line-parallel-plane"
  | "line-cross-plane"
  | "line-perpendicular-plane"
  | "lines-same"
  | "lines-parallel"
  | "lines-cross"
  | "lines-perpendicular"
  | "lines-skew"
  | "apart"
  | "tangent"
  | "secant"
  | "inside"
  | "on"
  | "outside";

export type GeoAnswer =
  | { kind: "number"; exact: Surd | null; approx: number; degrees?: boolean }
  | { kind: "point" | "vector"; coords: Surd[] }
  | { kind: "points"; list: Surd[][] }
  | { kind: "plane"; n: Vec; d: Rat }
  | { kind: "line"; p: Vec; u: Vec }
  | { kind: "round"; c: Vec; r2: Rat }
  | { kind: "relation"; relation: Relation }
  | { kind: "none" };

/** Something to draw: what the problem gives, plus what the solution builds. */
export type FigItem =
  | { t: "point"; name: string; at: number[]; derived?: boolean }
  | { t: "segment"; a: number[]; b: number[]; derived?: boolean }
  | { t: "vector"; name: string; from: number[]; to: number[] }
  | { t: "line"; name: string; p: number[]; u: number[]; derived?: boolean }
  | { t: "plane"; name: string; n: number[]; d: number; derived?: boolean }
  | { t: "round"; name: string; c: number[]; r: number; derived?: boolean };

export type GeoAnswerLine = { goal: Goal; latex: string; answer: GeoAnswer };

export type GeoSolution = {
  dim: 2 | 3;
  drafts: StepDraft[];
  answers: GeoAnswerLine[];
  figure: FigItem[];
  notes: string[];
};

class GeoError extends Error {
  constructor(
    message: string,
    readonly suggestion: string,
  ) {
    super(message);
  }
}

type Text = { en: string; vi: string };
const oops = (msg: Text, hint: Text): never => {
  throw new GeoError(L(msg), L(hint));
};

/* ───────────────────────────── Small helpers ───────────────────────────── */

const T = (s: string) => `\\text{${s}}`;
const sqrtTex = (r: Rat) => `\\sqrt{${ratLatex(r)}}`;
/** √r, and its simplified form when that differs: \sqrt{12} = 2\sqrt{3}. */
function rootTex(r: Rat): string {
  const simple = surdLatex(sqrtOf(r));
  const raw = sqrtTex(r);
  return simple === raw ? raw : `${raw} = ${simple}`;
}
const pointTex = (name: string, at: Vec) => `${nameTex(name)}${vecTex(at)}`;
/** Subscript-friendly label: (P) → P, d1 → d_1. */
const sub_ = (name: string) => nameTex(name.replace(/^\((.*)\)$/, "$1"));
/** 2·1 − 1·2 + 2·3 − 3 with the numbers of a point put in. */
/** “2·”, “” for 1 and “-” for −1, in front of a bracket or a product. */
const coef = (c: Rat, times = "\\cdot ") => (c.n === 1 && c.d === 1 ? "" : c.n === -1 && c.d === 1 ? "-" : `${ratLatex(c)}${times}`);

function plugTex(n: Vec, d: Rat, at: Vec): string {
  const parts = n.map((c, i) => (isZero(c) ? null : `${coef(c)}${ratParen(at[i])}`)).filter(Boolean) as string[];
  if (!isZero(d)) parts.push(ratLatex(d));
  return (parts.join(" + ") || "0").replace(/\+ -/g, "- ");
}
const sumSqTex = (v: Vec) => v.map(sqTex).join(" + ");
const dotTex = (a: Vec, b: Vec) => a.map((x, i) => prodTex(x, b[i])).join(" + ");
const surdsOf = (v: Vec): Surd[] => v.map(fromRat);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const confirm = (exact: number, independent: number): ValidationStatus => (close(exact, independent) ? "passed" : "failed");
/** “=” with a plane equation: 2x − y + 2z − 3 = 0. */
const planeTex = (n: Vec, d: Rat) => `${linTex(n, d)} = 0`;
/** a(x − x₀) + b(y − y₀) + c(z − z₀) = 0. */
function pointNormalTex(n: Vec, at: Vec): string {
  return (
    n
      .map((c, i) => {
        if (isZero(c)) return null;
        const v = AXES[i];
        const inner = isZero(at[i]) ? v : `${v} ${at[i].n < 0 ? "+" : "-"} ${ratLatex(at[i].n < 0 ? neg(at[i]) : at[i])}`;
        const k = c.n === 1 && c.d === 1 ? "" : c.n === -1 && c.d === 1 ? "-" : ratLatex(c);
        return isZero(at[i]) ? `${k}${v}` : `${k}(${inner})`;
      })
      .filter(Boolean)
      .join(" + ")
      .replace(/\+ -/g, "- ") + " = 0"
  );
}
const circleTex = (c: Vec, r2: Rat) => `${c.map((x, i) => shiftSqTex(AXES[i], x)).join(" + ")} = ${ratLatex(r2)}`;
function lineTex(l: { p: Vec; u: Vec }, dim: 2 | 3): string {
  const rows = l.p.map((p, i) => `${AXES[i]} = ${paramTex(p, l.u[i])}`);
  const param = `\\begin{cases}${rows.join("\\\\")}\\end{cases}`;
  if (dim === 3 && l.u.every((x) => !isZero(x))) {
    const canon = l.p
      .map((p, i) => {
        const top = isZero(p) ? AXES[i] : `${AXES[i]} ${p.n < 0 ? "+" : "-"} ${ratLatex(p.n < 0 ? neg(p) : p)}`;
        return `\\frac{${top}}{${ratLatex(l.u[i])}}`;
      })
      .join(" = ");
    return `${param}\\quad\\text{${L({ en: "or", vi: "hay" })}}\\quad ${canon}`;
  }
  return param;
}
/** a·x + b·y + c = 0 for a line in the plane. */
function general2(l: { p: Vec; u: Vec }): { n: Vec; c: Rat } {
  const n = primitive([neg(l.u[1]), l.u[0]]);
  return { n, c: neg(dot(n, l.p)) };
}
const line2Tex = (l: { p: Vec; u: Vec }) => {
  const g = general2(l);
  return `${linTex(g.n, g.c)} = 0`;
};
const degrees = (x: number) => Number(x.toFixed(2));

/* ───────────────────────────── Solver ───────────────────────────── */

class Solver {
  drafts: StepDraft[] = [];
  answers: GeoAnswerLine[] = [];
  figure: FigItem[] = [];
  notes: string[] = [];
  private taken: Set<string>;
  /** Feet of perpendiculars already worked out, by “point|target”. */
  private feet = new Map<string, { name: string; foot: Vec }>();
  /** Distance steps already written, so a second question doesn't repeat them. */
  private written = new Set<string>();

  constructor(readonly prob: GeoProblem) {
    this.taken = new Set(prob.objects.keys());
  }

  get dim() {
    return this.prob.dim;
  }

  push(kind: StepKind, op: Text, latex: string, explain: Text, why: Text, hint: Text, validation?: ValidationStatus) {
    this.drafts.push(step(kind, { operation: L(op), latex, explanation: L(explain), why: L(why), hint: L(hint), validation }));
  }

  answer(goal: Goal, latex: string, answer: GeoAnswer) {
    this.answers.push({ goal, latex, answer });
  }

  draw(item: FigItem) {
    this.figure.push(item);
  }

  fresh(preferred: string[]): string {
    for (const n of preferred) if (!this.taken.has(n)) return this.take(n);
    let k = 1;
    while (this.taken.has(`${preferred[0]}${k}`)) k++;
    return this.take(`${preferred[0]}${k}`);
  }

  take(name: string): string {
    this.taken.add(name);
    return name;
  }

  /* ── Names → objects ── */

  find(name: string): GeoObject | undefined {
    return this.prob.objects.get(name) ?? this.prob.objects.get(`(${name})`);
  }

  point(name: string): Point {
    const o = this.find(name);
    if (o?.kind === "point") return o;
    return oops(
      { en: `I don't know the point ${name}.`, vi: `Chưa biết tọa độ điểm ${name}.` },
      { en: `Give its coordinates, e.g. ${name}(1; 2${this.dim === 3 ? "; 3" : ""}).`, vi: `Cho tọa độ của nó, ví dụ ${name}(1; 2${this.dim === 3 ? "; 3" : ""}).` },
    );
  }

  /** Two point names written together: “AB” → [A, B]. */
  pair(ref: string): [Point, Point] | null {
    const m = ref.match(/^([A-Z][0-9']*)([A-Z][0-9']*)$/);
    if (!m) return null;
    const a = this.find(m[1]);
    const b = this.find(m[2]);
    return a?.kind === "point" && b?.kind === "point" ? [a, b] : null;
  }

  /** A vector by name, or “AB” from two points. */
  vector(ref: string): { v: Vec; tex: string } {
    const o = this.find(ref);
    if (o?.kind === "vector") return { v: o.v, tex: arrow(o.name) };
    const pq = this.pair(ref);
    if (pq) return { v: vsub(pq[1].at, pq[0].at), tex: arrow(ref) };
    return oops(
      { en: `I don't know the vector ${ref}.`, vi: `Chưa biết vectơ ${ref}.` },
      { en: "Name two points (AB) or give the vector, e.g. u(1; 2; 3).", vi: "Gọi tên hai điểm (AB) hoặc cho vectơ, ví dụ u(1; 2; 3)." },
    );
  }

  /** Whatever the name stands for: a declared object, a line AB, or a plane (ABC). */
  resolve(ref: string): GeoObject {
    const o = this.find(ref);
    if (o) return o;
    const pq = this.pair(ref);
    if (pq) {
      const line: Line = { kind: "line", name: ref, p: pq[0].at, u: primitive(vsub(pq[1].at, pq[0].at)) };
      if (isZeroVec(line.u)) oops({ en: `${pq[0].name} and ${pq[1].name} are the same point.`, vi: `${pq[0].name} và ${pq[1].name} trùng nhau.` }, { en: "Check the coordinates.", vi: "Kiểm tra lại tọa độ." });
      return line;
    }
    const tri = ref.match(/^\(?([A-Z][0-9']*)([A-Z][0-9']*)([A-Z][0-9']*)\)?$/);
    if (tri && this.dim === 3) {
      const [a, b, c] = [tri[1], tri[2], tri[3]].map((n) => this.point(n));
      const n = cross(vsub(b.at, a.at), vsub(c.at, a.at));
      if (isZeroVec(n)) this.collinear([a, b, c]);
      const np = primitive(n);
      return { kind: "plane", name: `(${a.name}${b.name}${c.name})`, n: np, d: neg(dot(np, a.at)) };
    }
    return oops(
      { en: `I don't know what ${ref} is.`, vi: `Chưa biết ${ref} là gì.` },
      { en: "Define it first, e.g. (P): x + y + z − 3 = 0 or d: x = 1 + t, y = 2, z = 3 − t.", vi: "Hãy cho nó trước, ví dụ (P): x + y + z − 3 = 0 hoặc d: x = 1 + t, y = 2, z = 3 − t." },
    );
  }

  collinear(pts: Point[]): never {
    return oops(
      { en: `${pts.map((p) => p.name).join(", ")} lie on one line, so they don't make a triangle or a plane.`, vi: `${pts.map((p) => p.name).join(", ")} thẳng hàng, nên không tạo thành tam giác hay mặt phẳng.` },
      { en: "Check the coordinates.", vi: "Kiểm tra lại tọa độ." },
    );
  }

  need3(what: Text): void {
    if (this.dim !== 3) oops({ en: `${what.en} needs coordinates in space (Oxyz).`, vi: `${what.vi} cần tọa độ trong không gian (Oxyz).` }, { en: "Give points three coordinates, e.g. A(1; 2; 3).", vi: "Cho các điểm ba tọa độ, ví dụ A(1; 2; 3)." });
  }

  /* ── Steps shared by several questions ── */

  /** Write AB = (…) for each pair; returns the vectors. */
  vectorsStep(pairs: Array<[Point, Point]>): Vec[] {
    const vs = pairs.map(([a, b]) => vsub(b.at, a.at));
    const lines = pairs.map(([a, b], i) => `${arrow(a.name + b.name)} = ${vecTex(vs[i])}`);
    this.push(
      "coordinates",
      { en: "Find the vectors", vi: "Tính tọa độ vectơ" },
      lines.join(",\\quad "),
      { en: "Each vector's coordinates are end point minus start point.", vi: "Tọa độ vectơ bằng tọa độ điểm cuối trừ tọa độ điểm đầu." },
      { en: "→AB = (x_B − x_A; y_B − y_A; z_B − z_A) by definition of vector coordinates.", vi: "→AB = (x_B − x_A; y_B − y_A; z_B − z_A) theo định nghĩa tọa độ vectơ." },
      { en: "Subtract the coordinates of the first point from the second.", vi: "Lấy tọa độ điểm sau trừ tọa độ điểm trước." },
      pairs.every(([a, b], i) => toNums(vs[i]).every((x, j) => close(x, toNumber(b.at[j]) - toNumber(a.at[j])))) ? "passed" : "failed",
    );
    return vs;
  }

  /** The foot of the perpendicular from `at` to a plane. */
  footOnPlane(at: Vec, pl: Plane): { t: Rat; h: Vec } {
    const t = div(add(dot(pl.n, at), pl.d), lenSq(pl.n));
    return { t, h: vsub(at, vscale(pl.n, t)) };
  }

  /** The foot of the perpendicular from `at` to a line. */
  footOnLine(at: Vec, l: Line): { t: Rat; h: Vec } {
    const t = div(dot(vsub(at, l.p), l.u), lenSq(l.u));
    return { t, h: vadd(l.p, vscale(l.u, t)) };
  }

  drawObject(o: GeoObject, derived = false) {
    if (o.kind === "point") this.draw({ t: "point", name: o.name, at: toNums(o.at), derived });
    else if (o.kind === "line") this.draw({ t: "line", name: o.name, p: toNums(o.p), u: toNums(o.u), derived });
    else if (o.kind === "plane") this.draw({ t: "plane", name: o.name, n: toNums(o.n), d: toNumber(o.d), derived });
    else if (o.kind === "vector") this.draw({ t: "vector", name: o.name, from: o.v.map(() => 0), to: toNums(o.v) });
    else this.draw({ t: "round", name: o.name, c: toNums(o.c), r: Math.sqrt(toNumber(o.r2)), derived });
  }

  /* ───────────────────────── Questions ───────────────────────── */

  run(goal: Goal) {
    switch (goal.k) {
      case "vector":
        return this.vectorGoal(goal);
      case "length":
        return this.lengthGoal(goal);
      case "midpoint":
        return this.midpointGoal(goal);
      case "centroid":
        return this.centroidGoal(goal);
      case "dot":
        return this.dotGoal(goal);
      case "cross":
        return this.crossGoal(goal);
      case "angle":
        return this.angleGoal(goal);
      case "distance":
        return this.distanceGoal(goal);
      case "area":
        return this.areaGoal(goal);
      case "perimeter":
        return this.perimeterGoal(goal);
      case "volume":
        return this.volumeGoal(goal);
      case "plane3":
        return this.plane3Goal(goal);
      case "line2pts":
        return this.line2Goal(goal);
      case "intersect":
        return this.intersectGoal(goal);
      case "project":
      case "reflect":
        return this.projectGoal(goal);
      case "center":
        return this.centerGoal(goal);
      case "planeThrough":
        return this.planeThroughGoal(goal);
      case "lineThrough":
        return this.lineThroughGoal(goal);
      case "round":
        return this.roundGoal(goal);
      case "position":
        return this.positionGoal(goal);
    }
  }

  vectorGoal(goal: Extract<Goal, { k: "vector" }>) {
    const a = this.point(goal.a);
    const b = this.point(goal.b);
    const v = vsub(b.at, a.at);
    const name = arrow(a.name + b.name);
    const formula = tupleOf(AXES.slice(0, this.dim).map((x) => `${x}_{${b.name}} - ${x}_{${a.name}}`));
    const plugged = tupleOf(b.at.map((x, i) => diffTex(x, a.at[i])));
    this.push(
      "coordinates",
      { en: `Vector ${a.name}${b.name}`, vi: `Tọa độ vectơ ${a.name}${b.name}` },
      `${name} = ${formula} = ${plugged} = ${vecTex(v)}`,
      { en: "Subtract the start point's coordinates from the end point's.", vi: "Lấy tọa độ điểm cuối trừ tọa độ điểm đầu." },
      { en: "A vector's coordinates are the change in each coordinate from its start to its end.", vi: "Tọa độ của vectơ là độ thay đổi của từng tọa độ từ điểm đầu đến điểm cuối." },
      { en: `Which point does ${name} start at?`, vi: `Vectơ ${name} có điểm đầu là điểm nào?` },
      confirm(toNumber(v[0]), toNumber(b.at[0]) - toNumber(a.at[0])),
    );
    this.draw({ t: "vector", name: a.name + b.name, from: toNums(a.at), to: toNums(b.at) });
    this.answer(goal, `${name} = ${vecTex(v)}`, { kind: "vector", coords: surdsOf(v) });
  }

  lengthGoal(goal: Extract<Goal, { k: "length" }>) {
    const pq = this.pair(goal.ref);
    const { v, tex } = this.vector(goal.ref);
    const sq = lenSq(v);
    const len = sqrtOf(sq);
    const label = pq ? `${pq[0].name}${pq[1].name}` : `|${tex}|`;
    const formula = pq
      ? `\\sqrt{${AXES.slice(0, this.dim).map((x) => `(${x}_{${pq[1].name}} - ${x}_{${pq[0].name}})^2`).join(" + ")}}`
      : `\\sqrt{${AXES.slice(0, this.dim).map((x) => `${x}^2`).join(" + ")}}`;
    this.push(
      "formula",
      { en: pq ? `Length ${label}` : "Length of the vector", vi: pq ? `Độ dài ${label}` : "Độ dài vectơ" },
      `${label} = ${formula} = \\sqrt{${sumSqTex(v)}} = ${rootTex(sq)}`,
      { en: "Square each coordinate difference, add them, take the square root.", vi: "Bình phương hiệu từng tọa độ, cộng lại rồi lấy căn bậc hai." },
      { en: "This is Pythagoras' theorem applied along the axes.", vi: "Đây là định lý Pi-ta-go áp dụng theo các trục tọa độ." },
      { en: "Which vector's length is this? Find its coordinates first.", vi: "Đây là độ dài của vectơ nào? Tìm tọa độ của nó trước." },
      confirm(toNum(len), Math.hypot(...toNums(v))),
    );
    if (pq) this.draw({ t: "segment", a: toNums(pq[0].at), b: toNums(pq[1].at) });
    this.answer(goal, `${label} = ${surdLatex(len)}`, { kind: "number", exact: len, approx: toNum(len) });
  }

  midpointGoal(goal: Extract<Goal, { k: "midpoint" }>) {
    const a = this.point(goal.a);
    const b = this.point(goal.b);
    const m = mid(a.at, b.at);
    const name = goal.as ? this.take(goal.as) : this.fresh(["I", "M", "N"]);
    const formula = tupleOf(AXES.slice(0, this.dim).map((x) => `\\frac{${x}_{${a.name}} + ${x}_{${b.name}}}{2}`));
    const plugged = tupleOf(a.at.map((x, i) => `\\frac{${ratLatex(x)} + ${ratParen(b.at[i])}}{2}`));
    this.push(
      "coordinates",
      { en: "Midpoint", vi: "Trung điểm" },
      `${nameTex(name)} = ${formula} = ${plugged} = ${vecTex(m)}`,
      { en: `Average the coordinates of ${a.name} and ${b.name}.`, vi: `Lấy trung bình cộng tọa độ của ${a.name} và ${b.name}.` },
      { en: "The midpoint is halfway along each axis.", vi: "Trung điểm nằm chính giữa theo từng trục." },
      { en: "Add the two x-coordinates and halve; do the same for the others.", vi: "Cộng hai hoành độ rồi chia đôi; làm tương tự với các tọa độ khác." },
      confirm(toNumber(m[0]), (toNumber(a.at[0]) + toNumber(b.at[0])) / 2),
    );
    this.draw({ t: "segment", a: toNums(a.at), b: toNums(b.at) });
    this.draw({ t: "point", name, at: toNums(m), derived: true });
    this.answer(goal, pointTex(name, m), { kind: "point", coords: surdsOf(m) });
  }

  centroidGoal(goal: Extract<Goal, { k: "centroid" }>) {
    const pts = goal.pts.map((n) => this.point(n));
    const k = pts.length;
    const g = vscale(pts.reduce<Vec>((s, p) => vadd(s, p.at), pts[0].at.map(() => rat(0))), rat(1, k));
    const name = goal.as ? this.take(goal.as) : this.fresh(["G"]);
    const formula = tupleOf(AXES.slice(0, this.dim).map((x) => `\\frac{${pts.map((p) => `${x}_{${p.name}}`).join(" + ")}}{${k}}`));
    this.push(
      "coordinates",
      { en: "Centroid", vi: "Trọng tâm" },
      `${nameTex(name)} = ${formula} = ${vecTex(g)}`,
      { en: `Average the coordinates of the ${k} vertices.`, vi: `Lấy trung bình cộng tọa độ của ${k} đỉnh.` },
      { en: "The centroid is the average of the vertices.", vi: "Trọng tâm có tọa độ là trung bình cộng tọa độ các đỉnh." },
      { en: `Add the x-coordinates of all vertices and divide by ${k}.`, vi: `Cộng hoành độ các đỉnh rồi chia cho ${k}.` },
      confirm(toNumber(g[0]), pts.reduce((s, p) => s + toNumber(p.at[0]), 0) / k),
    );
    pts.forEach((p, i) => this.draw({ t: "segment", a: toNums(p.at), b: toNums(pts[(i + 1) % k].at) }));
    this.draw({ t: "point", name, at: toNums(g), derived: true });
    this.answer(goal, pointTex(name, g), { kind: "point", coords: surdsOf(g) });
  }

  dotGoal(goal: Extract<Goal, { k: "dot" }>) {
    const u = this.vector(goal.u);
    const v = this.vector(goal.v);
    const r = dot(u.v, v.v);
    this.push(
      "formula",
      { en: "Dot product", vi: "Tích vô hướng" },
      `${u.tex}\\cdot ${v.tex} = ${dotTex(u.v, v.v)} = ${ratLatex(r)}`,
      { en: "Multiply matching coordinates and add.", vi: "Nhân các tọa độ tương ứng rồi cộng lại." },
      { en: "u·v = x₁x₂ + y₁y₂ + z₁z₂ in an orthonormal coordinate system.", vi: "u·v = x₁x₂ + y₁y₂ + z₁z₂ trong hệ tọa độ vuông góc." },
      { en: "Pair up the x-coordinates, the y-coordinates…", vi: "Ghép hoành độ với hoành độ, tung độ với tung độ…" },
      confirm(toNumber(r), toNums(u.v).reduce((s, x, i) => s + x * toNumber(v.v[i]), 0)),
    );
    if (isZero(r)) this.notes.push(L({ en: "The dot product is 0, so the two vectors are perpendicular.", vi: "Tích vô hướng bằng 0 nên hai vectơ vuông góc." }));
    this.answer(goal, `${u.tex}\\cdot ${v.tex} = ${ratLatex(r)}`, { kind: "number", exact: fromRat(r), approx: toNumber(r) });
  }

  crossGoal(goal: Extract<Goal, { k: "cross" }>) {
    this.need3({ en: "The cross product", vi: "Tích có hướng" });
    const u = this.vector(goal.u);
    const v = this.vector(goal.v);
    const c = cross(u.v, v.v);
    const m = (i: number, j: number) => `\\begin{vmatrix}${ratLatex(u.v[i])} & ${ratLatex(u.v[j])}\\\\ ${ratLatex(v.v[i])} & ${ratLatex(v.v[j])}\\end{vmatrix}`;
    this.push(
      "formula",
      { en: "Cross product", vi: "Tích có hướng" },
      `\\left[${u.tex}, ${v.tex}\\right] = ${tupleOf([m(1, 2), m(2, 0), m(0, 1)])} = ${vecTex(c)}`,
      { en: "Each coordinate is a 2×2 determinant: cover one column, cross-multiply the other two.", vi: "Mỗi tọa độ là một định thức cấp 2: che một cột, nhân chéo hai cột còn lại." },
      { en: "[u, v] = (y₁z₂ − z₁y₂; z₁x₂ − x₁z₂; x₁y₂ − y₁x₂); it is perpendicular to both u and v.", vi: "[u, v] = (y₁z₂ − z₁y₂; z₁x₂ − x₁z₂; x₁y₂ − y₁x₂); vectơ này vuông góc với cả u và v." },
      { en: "For the first coordinate, cover the x-column.", vi: "Với tọa độ thứ nhất, che cột hoành độ." },
      isZero(dot(c, u.v)) && isZero(dot(c, v.v)) ? "passed" : "failed",
    );
    this.answer(goal, `\\left[${u.tex}, ${v.tex}\\right] = ${vecTex(c)}`, { kind: "vector", coords: surdsOf(c) });
  }

  /** Direction of a line or normal of a plane, with its LaTeX name. */
  directionOf(o: GeoObject): { v: Vec; tex: string; kind: "dir" | "normal" | "vec" } {
    if (o.kind === "line") return { v: o.u, tex: `\\vec{u}_{${sub_(o.name)}}`, kind: "dir" };
    if (o.kind === "plane") return { v: o.n, tex: `\\vec{n}_{${sub_(o.name)}}`, kind: "normal" };
    if (o.kind === "vector") return { v: o.v, tex: arrow(o.name), kind: "vec" };
    return oops({ en: `An angle needs lines, planes or vectors, not ${o.name}.`, vi: `Góc cần đường thẳng, mặt phẳng hoặc vectơ, không phải ${o.name}.` }, { en: "Name two lines, planes or vectors.", vi: "Hãy nêu hai đường thẳng, mặt phẳng hoặc vectơ." });
  }

  angleGoal(goal: Extract<Goal, { k: "angle" }>) {
    const asVec = goal.vectors;
    const x = asVec ? { ...this.vector(goal.x), kind: "vec" as const } : this.directionOf(this.resolve(goal.x));
    const y = asVec ? { ...this.vector(goal.y), kind: "vec" as const } : this.directionOf(this.resolve(goal.y));
    const signed = x.kind === "vec" && y.kind === "vec";
    const sine = (x.kind === "dir" && y.kind === "normal") || (x.kind === "normal" && y.kind === "dir");
    const d = dot(x.v, y.v);
    const num = signed ? d : d.n < 0 ? neg(d) : d;
    const prod = mul(lenSq(x.v), lenSq(y.v));
    const value = divS(fromRat(num), sqrtOf(prod))!;
    const fn = sine ? "\\sin" : "\\cos";
    const top = signed ? `${x.tex}\\cdot ${y.tex}` : `\\left|${x.tex}\\cdot ${y.tex}\\right|`;
    const topNum = signed ? dotTex(x.v, y.v) : `\\left|${dotTex(x.v, y.v)}\\right|`;
    const v = toNum(value);
    const ang = (sine ? Math.asin(Math.min(1, v)) : Math.acos(Math.max(-1, Math.min(1, v)))) * (180 / Math.PI);
    const nice = [0, 30, 45, 60, 90, 120, 135, 150, 180].find((a) => Math.abs(a - ang) < 1e-7);
    const phi = nice !== undefined ? `\\varphi = ${nice}^\\circ` : `\\varphi \\approx ${degrees(ang)}^\\circ`;
    const what = signed
      ? { en: "between the vectors", vi: "giữa hai vectơ" }
      : sine
        ? { en: "between the line and the plane", vi: "giữa đường thẳng và mặt phẳng" }
        : x.kind === "normal"
          ? { en: "between the planes", vi: "giữa hai mặt phẳng" }
          : { en: "between the lines", vi: "giữa hai đường thẳng" };
    this.push(
      "formula",
      { en: `Angle ${what.en}`, vi: `Góc ${what.vi}` },
      `${fn}\\varphi = \\frac{${top}}{|${x.tex}|\\cdot|${y.tex}|} = \\frac{${topNum}}{\\sqrt{${sumSqTex(x.v)}}\\cdot\\sqrt{${sumSqTex(y.v)}}} = ${surdLatex(value)}\\ \\Rightarrow\\ ${phi}`,
      sine
        ? { en: "Use the line's direction vector and the plane's normal vector: the sine of the angle is |u·n| / (|u|·|n|).", vi: "Dùng vectơ chỉ phương của đường thẳng và vectơ pháp tuyến của mặt phẳng: sin góc bằng |u·n| / (|u|·|n|)." }
        : signed
          ? { en: "The cosine of the angle is the dot product divided by the product of the lengths.", vi: "Cosin của góc bằng tích vô hướng chia cho tích độ dài." }
          : { en: "Use the direction (or normal) vectors; the absolute value keeps the angle between 0° and 90°.", vi: "Dùng vectơ chỉ phương (hoặc pháp tuyến); trị tuyệt đối giữ góc trong khoảng 0° đến 90°." },
      sine
        ? { en: "The normal is perpendicular to the plane, so the line–normal angle and the line–plane angle add up to 90°: cos of one is sin of the other.", vi: "Pháp tuyến vuông góc với mặt phẳng, nên góc (đường thẳng, pháp tuyến) và góc (đường thẳng, mặt phẳng) phụ nhau: cos góc này bằng sin góc kia." }
        : { en: "From u·v = |u|·|v|·cos φ.", vi: "Từ u·v = |u|·|v|·cos φ." },
      { en: "Which vectors describe the directions of these two objects?", vi: "Vectơ nào cho biết phương của hai đối tượng này?" },
      confirm(v, toNumber(num) / Math.sqrt(toNumber(prod))),
    );
    const latex = nice !== undefined ? phi : `${fn}\\varphi = ${surdLatex(value)},\\ ${phi}`;
    this.answer(goal, latex, { kind: "number", exact: nice !== undefined ? fromRat(rat(nice)) : null, approx: nice ?? ang, degrees: true });
  }

  /** d(A, (P)) with the full formula; returns |n·A + d| / |n| exactly. */
  pointPlane(a: Point, pl: Plane): Surd {
    const num = add(dot(pl.n, a.at), pl.d);
    const dist = divS(fromRat(num.n < 0 ? neg(num) : num), sqrtOf(lenSq(pl.n)))!;
    const key = `pp ${vecTex(a.at)} ${pl.name}`;
    if (this.written.has(key)) return dist;
    this.written.add(key);
    this.push(
      "formula",
      { en: "Distance from a point to a plane", vi: "Khoảng cách từ điểm đến mặt phẳng" },
      `d\\left(${nameTex(a.name)}, ${nameTex(pl.name)}\\right) = \\frac{|ax_0 + by_0 + cz_0 + d|}{\\sqrt{a^2 + b^2 + c^2}} = \\frac{\\left|${plugTex(pl.n, pl.d, a.at)}\\right|}{\\sqrt{${sumSqTex(pl.n)}}} = ${surdLatex(dist)}`,
      { en: `Put ${a.name}'s coordinates into the plane's left side, take the absolute value, and divide by the length of the normal vector.`, vi: `Thay tọa độ ${a.name} vào vế trái phương trình mặt phẳng, lấy trị tuyệt đối rồi chia cho độ dài vectơ pháp tuyến.` },
      { en: "This is the length of the perpendicular from the point to the plane.", vi: "Đây là độ dài đoạn vuông góc hạ từ điểm xuống mặt phẳng." },
      { en: `What do you get when you put ${a.name} into ${pl.name}'s equation?`, vi: `Thay ${a.name} vào phương trình ${pl.name} được bao nhiêu?` },
      confirm(toNum(dist), Math.abs(toNums(pl.n).reduce((s, c, i) => s + c * toNumber(a.at[i]), toNumber(pl.d))) / Math.hypot(...toNums(pl.n))),
    );
    return dist;
  }

  pointLine(a: Point, l: Line): Surd {
    if (this.dim === 2) {
      const g = general2(l);
      const num = add(dot(g.n, a.at), g.c);
      const dist = divS(fromRat(num.n < 0 ? neg(num) : num), sqrtOf(lenSq(g.n)))!;
      this.push(
        "formula",
        { en: "Distance from a point to a line", vi: "Khoảng cách từ điểm đến đường thẳng" },
        `${nameTex(l.name)}: ${linTex(g.n, g.c)} = 0,\\quad d\\left(${nameTex(a.name)}, ${nameTex(l.name)}\\right) = \\frac{|ax_0 + by_0 + c|}{\\sqrt{a^2 + b^2}} = \\frac{\\left|${plugTex(g.n, g.c, a.at)}\\right|}{\\sqrt{${sumSqTex(g.n)}}} = ${surdLatex(dist)}`,
        { en: `Write the line as ax + by + c = 0, put ${a.name} in, take the absolute value and divide by √(a² + b²).`, vi: `Viết đường thẳng dạng ax + by + c = 0, thay ${a.name} vào, lấy trị tuyệt đối rồi chia cho √(a² + b²).` },
        { en: "It's the length of the perpendicular from the point to the line.", vi: "Đó là độ dài đoạn vuông góc hạ từ điểm xuống đường thẳng." },
        { en: "What are a, b and c for this line?", vi: "Với đường thẳng này, a, b, c bằng bao nhiêu?" },
        confirm(toNum(dist), Math.abs(toNums(g.n).reduce((s, c, i) => s + c * toNumber(a.at[i]), toNumber(g.c))) / Math.hypot(...toNums(g.n))),
      );
      return dist;
    }
    const ma = vsub(a.at, l.p);
    const c = cross(ma, l.u);
    const dist = sqrtOf(div(lenSq(c), lenSq(l.u)));
    this.push(
      "formula",
      { en: "Distance from a point to a line", vi: "Khoảng cách từ điểm đến đường thẳng" },
      `M${vecTex(l.p)} \\in ${nameTex(l.name)},\\ \\overrightarrow{M${a.name}} = ${vecTex(ma)},\\ \\left[\\overrightarrow{M${a.name}}, \\vec{u}\\right] = ${vecTex(c)}\\\\ d\\left(${nameTex(a.name)}, ${nameTex(l.name)}\\right) = \\frac{\\left|\\left[\\overrightarrow{M${a.name}}, \\vec{u}\\right]\\right|}{|\\vec{u}|} = \\frac{\\sqrt{${sumSqTex(c)}}}{\\sqrt{${sumSqTex(l.u)}}} = ${surdLatex(dist)}`,
      { en: `Take a point M on the line, form the vector M${a.name}, and divide the length of [M${a.name}, u] by |u|.`, vi: `Lấy điểm M trên đường thẳng, lập vectơ M${a.name}, rồi chia độ dài [M${a.name}, u] cho |u|.` },
      { en: "|[MA, u]| is the area of the parallelogram on MA and u; dividing by the base |u| leaves its height — the distance.", vi: "|[MA, u]| là diện tích hình bình hành dựng trên MA và u; chia cho đáy |u| được chiều cao — chính là khoảng cách." },
      { en: "Which point of the line can you read straight from its equation?", vi: "Điểm nào thuộc đường thẳng đọc được ngay từ phương trình?" },
      confirm(toNum(dist), Math.hypot(...toNums(c)) / Math.hypot(...toNums(l.u))),
    );
    return dist;
  }

  distanceGoal(goal: Extract<Goal, { k: "distance" }>) {
    let x = this.resolve(goal.x);
    let y = this.resolve(goal.y);
    // Points first, then lines, then planes.
    const rank = { point: 0, vector: 9, line: 1, plane: 2, circle: 3, sphere: 3 } as const;
    if (rank[x.kind] > rank[y.kind]) [x, y] = [y, x];
    const label = `d\\left(${nameTex(x.name)}, ${nameTex(y.name)}\\right)`;
    let dist: Surd;
    if (x.kind === "point" && y.kind === "point") {
      return this.lengthGoal({ k: "length", ref: x.name + y.name });
    } else if (x.kind === "point" && y.kind === "plane") {
      dist = this.pointPlane(x, y);
      const { h } = this.footOnPlane(x.at, y);
      this.draw({ t: "segment", a: toNums(x.at), b: toNums(h), derived: true });
    } else if (x.kind === "point" && y.kind === "line") {
      dist = this.pointLine(x, y);
      const { h } = this.footOnLine(x.at, y);
      this.draw({ t: "segment", a: toNums(x.at), b: toNums(h), derived: true });
    } else if (x.kind === "plane" && y.kind === "plane") {
      const k = ratio(x.n, y.n);
      if (!k) {
        this.relationStep(x, y, "planes-cross");
        dist = [];
      } else {
        // Rewrite (Q) with the same normal as (P): n·X + d₂/k = 0.
        const d2 = div(y.d, k);
        const diff = sub(d2, x.d);
        dist = divS(fromRat(diff.n < 0 ? neg(diff) : diff), sqrtOf(lenSq(x.n)))!;
        this.push(
          "formula",
          { en: "Distance between parallel planes", vi: "Khoảng cách giữa hai mặt phẳng song song" },
          `${nameTex(y.name)}: ${planeTex(x.n, d2)}\\\\ ${label} = \\frac{|d_2 - d_1|}{\\sqrt{a^2 + b^2 + c^2}} = \\frac{\\left|${ratLatex(d2)} - ${ratParen(x.d)}\\right|}{\\sqrt{${sumSqTex(x.n)}}} = ${surdLatex(dist)}`,
          { en: "The normals are parallel, so the planes are parallel. Rewrite one equation with the same a, b, c, then compare the constants.", vi: "Hai pháp tuyến cùng phương nên hai mặt phẳng song song. Viết lại một phương trình với cùng a, b, c rồi so sánh hệ số tự do." },
          { en: "The distance between parallel planes is the distance from any point of one to the other.", vi: "Khoảng cách giữa hai mặt phẳng song song bằng khoảng cách từ một điểm bất kỳ của mặt này đến mặt kia." },
          { en: "Are the normal vectors multiples of each other?", vi: "Hai vectơ pháp tuyến có cùng phương không?" },
          confirm(toNum(dist), Math.abs(toNumber(d2) - toNumber(x.d)) / Math.hypot(...toNums(x.n))),
        );
      }
    } else if (x.kind === "line" && y.kind === "plane") {
      if (!isZero(dot(x.u, y.n))) {
        this.relationStep(x, y, "line-cross-plane");
        dist = [];
      } else {
        dist = this.pointPlane({ kind: "point", name: "M", at: x.p }, y);
        this.notes.push(L({ en: `${x.name} is parallel to ${y.name}, so every point of it is at the same distance; M is one of them.`, vi: `${x.name} song song với ${y.name} nên mọi điểm của nó cách đều mặt phẳng; M là một điểm như vậy.` }));
      }
    } else if (x.kind === "line" && y.kind === "line") {
      dist = this.lineLine(x, y);
    } else {
      return oops(
        { en: `I can't find the distance between ${x.name} and ${y.name} yet.`, vi: `Chưa tính được khoảng cách giữa ${x.name} và ${y.name}.` },
        { en: "Try a point and a line, a point and a plane, two lines or two planes.", vi: "Hãy thử điểm và đường thẳng, điểm và mặt phẳng, hai đường thẳng hoặc hai mặt phẳng." },
      );
    }
    this.drawObject(x);
    this.drawObject(y);
    this.answer(goal, `${label} = ${surdLatex(dist)}`, { kind: "number", exact: dist, approx: toNum(dist) });
  }

  lineLine(a: Line, b: Line): Surd {
    if (this.dim === 2) {
      if (!isZero(det2(a.u, b.u))) {
        this.relationStep(a, b, "lines-cross");
        return [];
      }
      return this.pointLine({ kind: "point", name: "M", at: a.p }, b);
    }
    const n = cross(a.u, b.u);
    const m = vsub(b.p, a.p);
    if (isZeroVec(n)) return this.pointLine({ kind: "point", name: "M", at: a.p }, b);
    const mixed = dot(n, m);
    if (isZero(mixed)) {
      this.relationStep(a, b, "lines-cross");
      return [];
    }
    const dist = divS(fromRat(mixed.n < 0 ? neg(mixed) : mixed), sqrtOf(lenSq(n)))!;
    this.push(
      "formula",
      { en: "Distance between skew lines", vi: "Khoảng cách giữa hai đường thẳng chéo nhau" },
      `\\left[\\vec{u}_1, \\vec{u}_2\\right] = ${vecTex(n)},\\ \\overrightarrow{M_1M_2} = ${vecTex(m)}\\\\ d = \\frac{\\left|\\left[\\vec{u}_1, \\vec{u}_2\\right]\\cdot\\overrightarrow{M_1M_2}\\right|}{\\left|\\left[\\vec{u}_1, \\vec{u}_2\\right]\\right|} = \\frac{\\left|${dotTex(n, m)}\\right|}{\\sqrt{${sumSqTex(n)}}} = ${surdLatex(dist)}`,
      { en: "Take a point on each line, the cross product of the directions, and divide the mixed product by the cross product's length.", vi: "Lấy mỗi đường thẳng một điểm, tính tích có hướng hai vectơ chỉ phương, rồi chia tích hỗn tạp cho độ dài tích có hướng." },
      { en: "The mixed product is the volume of a box on the three vectors; divided by its base area it gives the height — the shortest distance.", vi: "Tích hỗn tạp là thể tích hình hộp dựng trên ba vectơ; chia cho diện tích đáy được chiều cao — khoảng cách ngắn nhất." },
      { en: "Is the mixed product zero? Then the lines meet.", vi: "Tích hỗn tạp có bằng 0 không? Nếu có thì hai đường thẳng cắt nhau." },
      confirm(toNum(dist), Math.abs(toNumber(mixed)) / Math.hypot(...toNums(n))),
    );
    return dist;
  }

  /** Triangle ABC's area, with the vectors and products written out. */
  areaGoal(goal: Extract<Goal, { k: "area" }>) {
    const [a, b, c] = goal.pts.map((n) => this.point(n));
    const [ab, ac] = this.vectorsStep([[a, b], [a, c]]);
    let area: Surd;
    if (this.dim === 3) {
      const n = cross(ab, ac);
      if (isZeroVec(n)) this.collinear([a, b, c]);
      area = scaleS(sqrtOf(lenSq(n)), rat(1, 2));
      this.push(
        "formula",
        { en: "Area of the triangle", vi: "Diện tích tam giác" },
        `\\left[${arrow(a.name + b.name)}, ${arrow(a.name + c.name)}\\right] = ${vecTex(n)}\\\\ S_{${a.name}${b.name}${c.name}} = \\frac{1}{2}\\left|\\left[${arrow(a.name + b.name)}, ${arrow(a.name + c.name)}\\right]\\right| = \\frac{1}{2}\\sqrt{${sumSqTex(n)}} = ${surdLatex(area)}`,
        { en: "Half the length of the cross product of two sides.", vi: "Bằng nửa độ dài tích có hướng của hai cạnh." },
        { en: "|[AB, AC]| is the area of the parallelogram on AB and AC; the triangle is half of it.", vi: "|[AB, AC]| là diện tích hình bình hành dựng trên AB, AC; tam giác bằng một nửa." },
        { en: "Compute [AB, AC] first.", vi: "Tính [AB, AC] trước." },
        confirm(toNum(area), Math.hypot(...toNums(n)) / 2),
      );
    } else {
      const d = det2(ab, ac);
      if (isZero(d)) this.collinear([a, b, c]);
      area = fromRat(mul(rat(1, 2), d.n < 0 ? neg(d) : d));
      this.push(
        "formula",
        { en: "Area of the triangle", vi: "Diện tích tam giác" },
        `S_{${a.name}${b.name}${c.name}} = \\frac{1}{2}\\left|x_1y_2 - x_2y_1\\right| = \\frac{1}{2}\\left|${prodTex(ab[0], ac[1])} - ${prodTex(ac[0], ab[1])}\\right| = ${surdLatex(area)}`,
        { en: "With AB = (x₁; y₁) and AC = (x₂; y₂), the area is half of |x₁y₂ − x₂y₁|.", vi: "Với AB = (x₁; y₁), AC = (x₂; y₂), diện tích bằng nửa |x₁y₂ − x₂y₁|." },
        { en: "x₁y₂ − x₂y₁ is the signed area of the parallelogram on AB and AC.", vi: "x₁y₂ − x₂y₁ là diện tích có hướng của hình bình hành dựng trên AB, AC." },
        { en: "Cross-multiply the coordinates of AB and AC.", vi: "Nhân chéo tọa độ của AB và AC." },
        confirm(toNum(area), Math.abs(toNumber(d)) / 2),
      );
    }
    [a, b, c].forEach((p, i, all) => this.draw({ t: "segment", a: toNums(p.at), b: toNums(all[(i + 1) % 3].at) }));
    this.answer(goal, `S_{${a.name}${b.name}${c.name}} = ${surdLatex(area)}`, { kind: "number", exact: area, approx: toNum(area) });
  }

  perimeterGoal(goal: Extract<Goal, { k: "perimeter" }>) {
    const pts = goal.pts.map((n) => this.point(n));
    const sides = pts.map((p, i) => {
      const q = pts[(i + 1) % 3];
      const sq = lenSq(vsub(q.at, p.at));
      return { name: p.name + q.name, sq, len: sqrtOf(sq) };
    });
    const total = sides.reduce((s, x) => addS(s, x.len), [] as Surd);
    this.push(
      "formula",
      { en: "Perimeter", vi: "Chu vi" },
      `${sides.map((s) => `${s.name} = ${rootTex(s.sq)}`).join(",\\ ")}\\\\ P = ${sides.map((s) => s.name).join(" + ")} = ${surdLatex(total)}`,
      { en: "Find each side with the distance formula, then add.", vi: "Tính độ dài từng cạnh bằng công thức khoảng cách rồi cộng lại." },
      { en: "The perimeter is the sum of the three sides.", vi: "Chu vi là tổng ba cạnh." },
      { en: "Start with the length of one side.", vi: "Bắt đầu bằng độ dài một cạnh." },
      confirm(toNum(total), sides.reduce((s, x) => s + Math.sqrt(toNumber(x.sq)), 0)),
    );
    pts.forEach((p, i) => this.draw({ t: "segment", a: toNums(p.at), b: toNums(pts[(i + 1) % 3].at) }));
    this.answer(goal, `P = ${surdLatex(total)}`, { kind: "number", exact: total, approx: toNum(total) });
  }

  volumeGoal(goal: Extract<Goal, { k: "volume" }>) {
    this.need3({ en: "A volume", vi: "Thể tích" });
    const [a, b, c, d] = goal.pts.map((n) => this.point(n));
    const [ab, ac, ad] = this.vectorsStep([[a, b], [a, c], [a, d]]);
    const n = cross(ab, ac);
    const mixed = dot(n, ad);
    if (isZero(mixed)) {
      oops({ en: `${a.name}, ${b.name}, ${c.name}, ${d.name} lie in one plane, so the tetrahedron is flat (volume 0).`, vi: `${a.name}, ${b.name}, ${c.name}, ${d.name} đồng phẳng nên không tạo thành tứ diện (thể tích bằng 0).` }, { en: "Check the coordinates.", vi: "Kiểm tra lại tọa độ." });
    }
    const vol = mul(rat(1, 6), mixed.n < 0 ? neg(mixed) : mixed);
    const name = `${a.name}${b.name}${c.name}${d.name}`;
    this.push(
      "formula",
      { en: "Volume of the tetrahedron", vi: "Thể tích tứ diện" },
      `\\left[${arrow(a.name + b.name)}, ${arrow(a.name + c.name)}\\right] = ${vecTex(n)}\\\\ V_{${name}} = \\frac{1}{6}\\left|\\left[${arrow(a.name + b.name)}, ${arrow(a.name + c.name)}\\right]\\cdot ${arrow(a.name + d.name)}\\right| = \\frac{1}{6}\\left|${dotTex(n, ad)}\\right| = ${ratLatex(vol)}`,
      { en: "One sixth of the absolute value of the mixed product of three edges from one vertex.", vi: "Bằng một phần sáu trị tuyệt đối tích hỗn tạp của ba cạnh xuất phát từ một đỉnh." },
      { en: "The mixed product is the volume of the box on the three edges; a tetrahedron is one sixth of that box.", vi: "Tích hỗn tạp là thể tích hình hộp dựng trên ba cạnh; tứ diện bằng một phần sáu hình hộp đó." },
      { en: "Compute [AB, AC] and then its dot product with AD.", vi: "Tính [AB, AC] rồi nhân vô hướng với AD." },
      confirm(toNumber(vol), Math.abs(toNumber(mixed)) / 6),
    );
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) this.draw({ t: "segment", a: toNums(pts[i].at), b: toNums(pts[j].at) });
    this.answer(goal, `V_{${name}} = ${ratLatex(vol)}`, { kind: "number", exact: fromRat(vol), approx: toNumber(vol) });
  }

  /** Write a plane through `at` with normal `n` and check the points it must contain. */
  planeFrom(name: string, n: Vec, at: Point, mustContain: Point[], why: { normal: string; explain: Text; whyText: Text; hint: Text }): Plane {
    const np = primitive(n);
    const d = neg(dot(np, at.at));
    const scaled = ratio(n, np);
    const chosen = scaled && !(scaled.n === 1 && scaled.d === 1) ? `${why.normal} = ${vecTex(n)}\\ \\Rightarrow\\ \\vec{n} = ${vecTex(np)}` : `\\vec{n} = ${why.normal} = ${vecTex(np)}`;
    this.push(
      "construct",
      { en: "Equation of the plane", vi: "Phương trình mặt phẳng" },
      `${chosen}\\\\ ${nameTex(name)}: ${pointNormalTex(np, at.at)}\\ \\Leftrightarrow\\ ${planeTex(np, d)}`,
      why.explain,
      why.whyText,
      why.hint,
      "passed",
    );
    const pl: Plane = { kind: "plane", name, n: np, d };
    if (mustContain.length) this.verifyOnPlane(pl, mustContain);
    return pl;
  }

  verifyOnPlane(pl: Plane, pts: Point[]) {
    const lines = pts.map((p) => {
      const v = add(dot(pl.n, p.at), pl.d);
      return `${nameTex(p.name)}:\\ ${plugTex(pl.n, pl.d, p.at)} = ${ratLatex(v)}${isZero(v) ? "\\ \\checkmark" : ""}`;
    });
    const ok = pts.every((p) => isZero(add(dot(pl.n, p.at), pl.d)));
    this.push(
      "verify",
      { en: "Check", vi: "Thử lại" },
      `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`,
      { en: "Put each given point into the equation: every one must give 0.", vi: "Thay từng điểm đã cho vào phương trình: điểm nào cũng phải cho kết quả 0." },
      { en: "A point lies on a plane exactly when its coordinates satisfy the plane's equation.", vi: "Một điểm thuộc mặt phẳng khi và chỉ khi tọa độ của nó thỏa mãn phương trình mặt phẳng." },
      { en: "Does each point make the left side 0?", vi: "Mỗi điểm có làm vế trái bằng 0 không?" },
      ok ? "passed" : "failed",
    );
  }

  plane3Goal(goal: Extract<Goal, { k: "plane3" }>) {
    this.need3({ en: "A plane through three points", vi: "Mặt phẳng qua ba điểm" });
    const [a, b, c] = goal.pts.map((n) => this.point(n));
    const [ab, ac] = this.vectorsStep([[a, b], [a, c]]);
    const n = cross(ab, ac);
    if (isZeroVec(n)) this.collinear([a, b, c]);
    const name = goal.as ?? `(${a.name}${b.name}${c.name})`;
    const pl = this.planeFrom(name, n, a, [b, c], {
      normal: `\\left[${arrow(a.name + b.name)}, ${arrow(a.name + c.name)}\\right]`,
      explain: { en: `The normal vector is [AB, AC]; the plane passes through ${a.name}.`, vi: `Vectơ pháp tuyến là [AB, AC]; mặt phẳng đi qua ${a.name}.` },
      whyText: { en: "[AB, AC] is perpendicular to both AB and AC, so it's perpendicular to the whole plane. Any non-zero multiple works, so we take the simplest.", vi: "[AB, AC] vuông góc với cả AB và AC nên vuông góc với mặt phẳng. Mọi bội khác 0 đều được, ta chọn vectơ đơn giản nhất." },
      hint: { en: "Which vector is perpendicular to both AB and AC?", vi: "Vectơ nào vuông góc với cả AB và AC?" },
    });
    [a, b, c].forEach((p) => this.drawObject(p));
    [a, b, c].forEach((p, i, all) => this.draw({ t: "segment", a: toNums(p.at), b: toNums(all[(i + 1) % 3].at) }));
    this.drawObject(pl, true);
    this.answer(goal, `${nameTex(name)}: ${planeTex(pl.n, pl.d)}`, { kind: "plane", n: pl.n, d: pl.d });
  }

  planeThroughGoal(goal: Extract<Goal, { k: "planeThrough" }>) {
    this.need3({ en: "A plane", vi: "Mặt phẳng" });
    const a = this.point(goal.p);
    const name = goal.as ?? this.fresh(["(Q)", "(R)", "(α)"]);
    if (goal.perp) {
      const pq = this.pair(goal.perp);
      const target = pq ? null : this.resolve(goal.perp);
      if (target && target.kind !== "line" && target.kind !== "vector") {
        oops({ en: `A plane can be perpendicular to a line, not to ${goal.perp} here.`, vi: `Ở đây mặt phẳng cần vuông góc với một đường thẳng, không phải ${goal.perp}.` }, { en: "Name a line or two points, e.g. “perpendicular to d” or “perpendicular to AB”.", vi: "Nêu một đường thẳng hoặc hai điểm, ví dụ “vuông góc với d” hoặc “vuông góc với AB”." });
      }
      const n = pq ? vsub(pq[1].at, pq[0].at) : target?.kind === "line" ? target.u : target?.kind === "vector" ? target.v : [];
      const tex = pq ? arrow(goal.perp) : target?.kind === "line" ? `\\vec{u}_{${sub_(target.name)}}` : arrow(target?.name ?? "");
      if (pq) this.vectorsStep([pq]);
      const pl = this.planeFrom(name, n, a, [], {
        normal: tex,
        explain: { en: `The plane is perpendicular to ${goal.perp}, so ${goal.perp}'s direction is its normal vector.`, vi: `Mặt phẳng vuông góc với ${goal.perp} nên vectơ chỉ phương của ${goal.perp} là vectơ pháp tuyến.` },
        whyText: { en: "A line perpendicular to a plane runs along the plane's normal.", vi: "Đường thẳng vuông góc với mặt phẳng thì cùng phương với pháp tuyến của mặt phẳng." },
        hint: { en: `What vector points along ${goal.perp}?`, vi: `Vectơ nào chỉ phương của ${goal.perp}?` },
      });
      this.verifyOnPlane(pl, [a]);
      if (target) this.drawObject(target);
      this.drawObject(a);
      this.drawObject(pl, true);
      return this.answer(goal, `${nameTex(name)}: ${planeTex(pl.n, pl.d)}`, { kind: "plane", n: pl.n, d: pl.d });
    }
    const target = this.resolve(goal.par!);
    if (target.kind !== "plane") {
      return oops({ en: `“Parallel to ${goal.par}” needs ${goal.par} to be a plane.`, vi: `“Song song với ${goal.par}” cần ${goal.par} là một mặt phẳng.` }, { en: "Give the plane's equation, e.g. (P): x + 2y − z + 1 = 0.", vi: "Cho phương trình mặt phẳng, ví dụ (P): x + 2y − z + 1 = 0." });
    }
    const pl = this.planeFrom(name, target.n, a, [], {
      normal: `\\vec{n}_{${sub_(target.name)}}`,
      explain: { en: `A parallel plane has the same normal vector as ${target.name}; it passes through ${a.name}.`, vi: `Mặt phẳng song song có cùng vectơ pháp tuyến với ${target.name}; nó đi qua ${a.name}.` },
      whyText: { en: "Parallel planes are perpendicular to the same direction.", vi: "Hai mặt phẳng song song cùng vuông góc với một phương." },
      hint: { en: `Reuse ${target.name}'s normal vector.`, vi: `Dùng lại vectơ pháp tuyến của ${target.name}.` },
    });
    this.verifyOnPlane(pl, [a]);
    if (isZero(sub(pl.d, div(target.d, ratio(pl.n, target.n) ?? rat(1))))) {
      this.notes.push(L({ en: `${a.name} already lies on ${target.name}, so the answer is ${target.name} itself — not a different parallel plane.`, vi: `${a.name} đã thuộc ${target.name}, nên mặt phẳng cần tìm trùng với ${target.name} chứ không song song.` }));
    }
    this.drawObject(target);
    this.drawObject(a);
    this.drawObject(pl, true);
    this.answer(goal, `${nameTex(name)}: ${planeTex(pl.n, pl.d)}`, { kind: "plane", n: pl.n, d: pl.d });
  }

  /** Write a line through `at` with direction `u` (parametric, plus general form in the plane). */
  lineFrom(name: string, at: Point, u: Vec, how: { explain: Text; whyText: Text; hint: Text; dirTex: string }): Line {
    const up = primitive(u);
    const l: Line = { kind: "line", name, p: at.at, u: up };
    const eq = this.dim === 3 ? lineTex(l, 3) : `${lineTex(l, 2)}\\quad\\text{${L({ en: "or", vi: "hay" })}}\\quad ${line2Tex(l)}`;
    this.push(
      "construct",
      { en: "Equation of the line", vi: "Phương trình đường thẳng" },
      `\\vec{u} = ${how.dirTex}${ratio(u, up) && !(ratio(u, up)!.n === 1 && ratio(u, up)!.d === 1) ? ` = ${vecTex(u)}\\ \\Rightarrow\\ \\vec{u} = ${vecTex(up)}` : ` = ${vecTex(up)}`}\\\\ ${nameTex(name)}: ${eq}`,
      how.explain,
      how.whyText,
      how.hint,
      "passed",
    );
    return l;
  }

  line2Goal(goal: Extract<Goal, { k: "line2pts" }>) {
    const a = this.point(goal.a);
    const b = this.point(goal.b);
    const [ab] = this.vectorsStep([[a, b]]);
    if (isZeroVec(ab)) oops({ en: `${a.name} and ${b.name} are the same point.`, vi: `${a.name} và ${b.name} trùng nhau.` }, { en: "Check the coordinates.", vi: "Kiểm tra lại tọa độ." });
    const l = this.lineFrom(a.name + b.name, a, ab, {
      dirTex: arrow(a.name + b.name),
      explain: { en: `The line passes through ${a.name} with direction vector AB.`, vi: `Đường thẳng đi qua ${a.name} và nhận AB làm vectơ chỉ phương.` },
      whyText: { en: "Every point of the line is A plus a multiple of AB.", vi: "Mọi điểm của đường thẳng có dạng A cộng một bội của AB." },
      hint: { en: "Which vector points from A to B?", vi: "Vectơ nào đi từ A đến B?" },
    });
    // B is on it at some t.
    const t = ratio(l.u, ab);
    this.push(
      "verify",
      { en: "Check", vi: "Thử lại" },
      `t = ${t ? ratLatex(t) : "?"}:\\ ${vecTex(vadd(l.p, vscale(l.u, t ?? rat(0))))} = ${nameTex(b.name)}\\ \\checkmark`,
      { en: `With t = ${t ? toNumber(t) : "?"} the equations give ${b.name}, so the line passes through both points.`, vi: `Với t = ${t ? toNumber(t) : "?"} phương trình cho ra điểm ${b.name}, nên đường thẳng đi qua cả hai điểm.` },
      { en: "Both given points must satisfy the equations.", vi: "Cả hai điểm đã cho phải thỏa mãn phương trình." },
      { en: `Which t gives ${b.name}?`, vi: `Giá trị t nào cho ra ${b.name}?` },
      t ? "passed" : "failed",
    );
    this.drawObject(a);
    this.drawObject(b);
    this.drawObject(l, true);
    this.answer(goal, `${nameTex(l.name)}: ${this.dim === 3 ? lineTex(l, 3) : line2Tex(l)}`, { kind: "line", p: l.p, u: l.u });
  }

  lineThroughGoal(goal: Extract<Goal, { k: "lineThrough" }>) {
    const a = this.point(goal.p);
    const name = goal.as ?? this.fresh(["Δ", "d'", "d_1"]);
    const ref = goal.perp ?? goal.par!;
    const target = this.resolve(ref);
    let u: Vec;
    let dirTex: string;
    let explain: Text;
    let whyText: Text;
    if (goal.perp && target.kind === "plane") {
      this.need3({ en: "A line perpendicular to a plane", vi: "Đường thẳng vuông góc với mặt phẳng" });
      u = target.n;
      dirTex = `\\vec{n}_{${sub_(target.name)}}`;
      explain = { en: `The line is perpendicular to ${target.name}, so ${target.name}'s normal vector is its direction.`, vi: `Đường thẳng vuông góc với ${target.name} nên vectơ pháp tuyến của ${target.name} là vectơ chỉ phương.` };
      whyText = { en: "A line perpendicular to a plane runs along the plane's normal.", vi: "Đường thẳng vuông góc với mặt phẳng thì cùng phương với pháp tuyến." };
    } else if (target.kind === "line" && goal.par) {
      u = target.u;
      dirTex = `\\vec{u}_{${sub_(target.name)}}`;
      explain = { en: `A parallel line has the same direction as ${target.name}.`, vi: `Đường thẳng song song có cùng vectơ chỉ phương với ${target.name}.` };
      whyText = { en: "Parallel lines have parallel direction vectors.", vi: "Hai đường thẳng song song có vectơ chỉ phương cùng phương." };
    } else if (target.kind === "line" && goal.perp && this.dim === 2) {
      u = general2(target).n;
      dirTex = `\\vec{n}_{${sub_(target.name)}}`;
      explain = { en: `A line perpendicular to ${target.name} runs along ${target.name}'s normal vector.`, vi: `Đường thẳng vuông góc với ${target.name} nhận vectơ pháp tuyến của ${target.name} làm vectơ chỉ phương.` };
      whyText = { en: "The normal of a line is perpendicular to it.", vi: "Vectơ pháp tuyến của một đường thẳng vuông góc với nó." };
    } else {
      return oops(
        { en: `In space, infinitely many lines through ${a.name} are perpendicular to ${ref}.`, vi: `Trong không gian có vô số đường thẳng qua ${a.name} vuông góc với ${ref}.` },
        { en: "Add a second condition, or ask for a line perpendicular to a plane.", vi: "Thêm một điều kiện nữa, hoặc hỏi đường thẳng vuông góc với một mặt phẳng." },
      );
    }
    const l = this.lineFrom(name, a, u, { dirTex, explain, whyText, hint: { en: "Which vector gives the new line's direction?", vi: "Vectơ nào cho phương của đường thẳng mới?" } });
    this.drawObject(target);
    this.drawObject(a);
    this.drawObject(l, true);
    this.answer(goal, `${nameTex(name)}: ${this.dim === 3 ? lineTex(l, 3) : line2Tex(l)}`, { kind: "line", p: l.p, u: l.u });
  }

  intersectGoal(goal: Extract<Goal, { k: "intersect" }>) {
    let x = this.resolve(goal.x);
    let y = this.resolve(goal.y);
    const rank = { line: 0, plane: 1, circle: 2, sphere: 2, point: 9, vector: 9 } as const;
    if (rank[x.kind] > rank[y.kind]) [x, y] = [y, x];
    this.drawObject(x);
    this.drawObject(y);
    if (x.kind === "line" && y.kind === "plane") return this.linePlane(goal, x, y);
    if (x.kind === "line" && y.kind === "line") return this.lineLineMeet(goal, x, y);
    if (x.kind === "plane" && y.kind === "plane") return this.planePlane(goal, x, y);
    if (x.kind === "line" && (y.kind === "circle" || y.kind === "sphere")) return this.lineRound(goal, x, y);
    if (x.kind === "plane" && y.kind === "sphere") return this.planeSphere(goal, x, y);
    if (x.kind === "circle" && y.kind === "circle") return this.circleCircle(goal, x, y);
    return oops(
      { en: `I can't intersect ${x.name} and ${y.name} yet.`, vi: `Chưa tìm được giao của ${x.name} và ${y.name}.` },
      { en: "Try a line and a plane, two lines, two planes, or a line and a circle/sphere.", vi: "Hãy thử đường thẳng và mặt phẳng, hai đường thẳng, hai mặt phẳng, hoặc đường thẳng và đường tròn/mặt cầu." },
    );
  }

  linePlane(goal: Goal, l: Line, pl: Plane) {
    const k = dot(pl.n, l.u);
    const c = add(dot(pl.n, l.p), pl.d);
    const subst = pl.n
      .map((nc, i) => (isZero(nc) ? null : `${coef(nc, "")}\\left(${paramTex(l.p[i], l.u[i])}\\right)`))
      .filter(Boolean)
      .join(" + ")
      .replace(/\+ -/g, "- ");
    const plugged = `${subst}${isZero(pl.d) ? "" : ` ${pl.d.n < 0 ? "-" : "+"} ${ratLatex(pl.d.n < 0 ? neg(pl.d) : pl.d)}`} = 0\\ \\Leftrightarrow\\ ${linTex([k], c, ["t"])} = 0`;
    if (isZero(k)) {
      const inside = isZero(c);
      this.push(
        "relation",
        { en: "Substitute the line into the plane", vi: "Thay phương trình đường thẳng vào mặt phẳng" },
        plugged,
        inside
          ? { en: "Every t works, so the whole line lies in the plane.", vi: "Mọi t đều thỏa mãn, nên đường thẳng nằm trong mặt phẳng." }
          : { en: "No t works, so the line is parallel to the plane: no intersection point.", vi: "Không có t nào thỏa mãn, nên đường thẳng song song với mặt phẳng: không có giao điểm." },
        { en: "A common point must satisfy both equations at once.", vi: "Điểm chung phải thỏa mãn cả hai phương trình." },
        { en: "Put x, y, z of the line into the plane's equation.", vi: "Thay x, y, z của đường thẳng vào phương trình mặt phẳng." },
        "passed",
      );
      this.answer(goal, inside ? `${nameTex(l.name)} \\subset ${nameTex(pl.name)}` : T(L({ en: "no intersection point", vi: "không có giao điểm" })), inside ? { kind: "relation", relation: "line-in-plane" } : { kind: "none" });
      return;
    }
    const t = neg(div(c, k));
    const m = vadd(l.p, vscale(l.u, t));
    const name = this.fresh(["M", "I", "K"]);
    this.push(
      "construct",
      { en: "Substitute the line into the plane", vi: "Thay phương trình đường thẳng vào mặt phẳng" },
      `${plugged}\\ \\Leftrightarrow\\ t = ${ratLatex(t)}\\\\ \\Rightarrow\\ ${pointTex(name, m)}`,
      { en: "Write the line's x, y, z in terms of t, put them into the plane's equation, solve for t, then put t back.", vi: "Viết x, y, z của đường thẳng theo t, thay vào phương trình mặt phẳng, giải t rồi thay ngược lại." },
      { en: "The intersection point is on the line (so it has some t) and on the plane (so it satisfies the plane's equation).", vi: "Giao điểm thuộc đường thẳng (ứng với một giá trị t) và thuộc mặt phẳng (thỏa mãn phương trình mặt phẳng)." },
      { en: "Substitute x = …, y = …, z = … into the plane's equation. What is t?", vi: "Thay x = …, y = …, z = … vào phương trình mặt phẳng. t bằng bao nhiêu?" },
      "passed",
    );
    this.verifyOnPlane(pl, [{ kind: "point", name, at: m }]);
    this.draw({ t: "point", name, at: toNums(m), derived: true });
    this.answer(goal, pointTex(name, m), { kind: "point", coords: surdsOf(m) });
  }

  lineLineMeet(goal: Goal, a: Line, b: Line) {
    if (this.dim === 3) {
      const n = cross(a.u, b.u);
      const w = vsub(b.p, a.p);
      if (isZeroVec(n) || !isZero(dot(n, w))) {
        const rel = isZeroVec(n) ? (isZeroVec(cross(w, a.u)) ? "lines-same" : "lines-parallel") : "lines-skew";
        this.relationStep(a, b, rel);
        return this.answer(goal, rel === "lines-same" ? `${nameTex(a.name)} \\equiv ${nameTex(b.name)}` : T(L({ en: "no intersection point", vi: "không có giao điểm" })), rel === "lines-same" ? { kind: "relation", relation: rel } : { kind: "none" });
      }
    } else if (isZero(det2(a.u, b.u))) {
      const rel = isZero(det2(vsub(b.p, a.p), a.u)) ? "lines-same" : "lines-parallel";
      this.relationStep(a, b, rel);
      return this.answer(goal, rel === "lines-same" ? `${nameTex(a.name)} \\equiv ${nameTex(b.name)}` : T(L({ en: "no intersection point", vi: "không có giao điểm" })), rel === "lines-same" ? { kind: "relation", relation: rel } : { kind: "none" });
    }
    // t·u₁ − s·u₂ = p₂ − p₁ on two coordinates with a non-zero determinant.
    const w = vsub(b.p, a.p);
    const dims = a.u.length;
    let sol: { t: Rat; s: Rat } | null = null;
    for (let i = 0; i < dims && !sol; i++) {
      for (let j = i + 1; j < dims && !sol; j++) {
        const det = sub(mul(a.u[i], neg(b.u[j])), mul(neg(b.u[i]), a.u[j]));
        if (isZero(det)) continue;
        const t = div(sub(mul(w[i], neg(b.u[j])), mul(neg(b.u[i]), w[j])), det);
        const s = div(sub(mul(a.u[i], w[j]), mul(w[i], a.u[j])), det);
        sol = { t, s };
      }
    }
    const m = vadd(a.p, vscale(a.u, sol!.t));
    const name = this.fresh(["M", "I", "K"]);
    const sys = a.p.map((p, i) => `${paramTex(p, a.u[i], "t")} = ${paramTex(b.p[i], b.u[i], "s")}`);
    this.push(
      "construct",
      { en: "Solve for the common point", vi: "Giải hệ tìm điểm chung" },
      `\\begin{cases}${sys.join("\\\\")}\\end{cases}\\ \\Leftrightarrow\\ t = ${ratLatex(sol!.t)},\\ s = ${ratLatex(sol!.s)}\\\\ \\Rightarrow\\ ${pointTex(name, m)}`,
      { en: "Give each line its own parameter (t and s), set the coordinates equal, and solve.", vi: "Mỗi đường thẳng một tham số (t và s), cho các tọa độ bằng nhau rồi giải hệ." },
      { en: "A common point is on both lines, so it matches some t on one and some s on the other.", vi: "Điểm chung thuộc cả hai đường thẳng, nên ứng với một t trên đường này và một s trên đường kia." },
      { en: "Write x, y (and z) of both lines and set them equal.", vi: "Viết x, y (và z) của hai đường thẳng rồi cho bằng nhau." },
      toNums(vadd(b.p, vscale(b.u, sol!.s))).every((v, i) => close(v, toNumber(m[i]))) ? "passed" : "failed",
    );
    this.draw({ t: "point", name, at: toNums(m), derived: true });
    this.answer(goal, pointTex(name, m), { kind: "point", coords: surdsOf(m) });
  }

  planePlane(goal: Goal, p: Plane, q: Plane) {
    const u = cross(p.n, q.n);
    if (isZeroVec(u)) {
      const k = ratio(p.n, q.n)!;
      const rel = isZero(sub(q.d, mul(p.d, k))) ? "planes-same" : "planes-parallel";
      this.relationStep(p, q, rel);
      return this.answer(goal, T(L({ en: rel === "planes-same" ? "the planes coincide" : "the planes are parallel: no common line", vi: rel === "planes-same" ? "hai mặt phẳng trùng nhau" : "hai mặt phẳng song song: không có giao tuyến" })), rel === "planes-same" ? { kind: "relation", relation: rel } : { kind: "none" });
    }
    // A point: set the coordinate with a non-zero minor to 0, solve the other two.
    const k = [2, 1, 0].find((i) => !isZero(u[i]))!;
    const [i, j] = [0, 1, 2].filter((x) => x !== k);
    const det = sub(mul(p.n[i], q.n[j]), mul(p.n[j], q.n[i]));
    const xi = div(sub(mul(neg(p.d), q.n[j]), mul(p.n[j], neg(q.d))), det);
    const xj = div(sub(mul(p.n[i], neg(q.d)), mul(neg(p.d), q.n[i])), det);
    const at: Rat[] = [rat(0), rat(0), rat(0)];
    at[i] = xi;
    at[j] = xj;
    const up = primitive(u);
    const l: Line = { kind: "line", name: "Δ", p: at, u: up };
    this.push(
      "construct",
      { en: "Line of intersection", vi: "Giao tuyến" },
      `\\vec{u} = \\left[\\vec{n}_{${sub_(p.name)}}, \\vec{n}_{${sub_(q.name)}}\\right] = ${vecTex(u)}${isZeroVec(vsub(u, up)) ? "" : `\\ \\Rightarrow\\ \\vec{u} = ${vecTex(up)}`},\\quad ${AXES[k]} = 0 \\Rightarrow M${vecTex(at)}\\\\ \\Delta: ${lineTex(l, 3)}`,
      { en: `The common line is perpendicular to both normals, so its direction is their cross product. For a point on it, set ${AXES[k]} = 0 and solve the two equations.`, vi: `Giao tuyến vuông góc với cả hai pháp tuyến, nên vectơ chỉ phương là tích có hướng của chúng. Để có một điểm, cho ${AXES[k]} = 0 rồi giải hệ hai phương trình.` },
      { en: "The line lies in both planes, so it is perpendicular to both normal vectors.", vi: "Giao tuyến nằm trong cả hai mặt phẳng nên vuông góc với cả hai vectơ pháp tuyến." },
      { en: "Which vector is perpendicular to both normals?", vi: "Vectơ nào vuông góc với cả hai pháp tuyến?" },
      isZero(add(dot(p.n, at), p.d)) && isZero(add(dot(q.n, at), q.d)) ? "passed" : "failed",
    );
    this.drawObject(l, true);
    this.answer(goal, `\\Delta: ${lineTex(l, 3)}`, { kind: "line", p: l.p, u: l.u });
  }

  lineRound(goal: Goal, l: Line, r: Round) {
    // |p + t·u − c|² = r²  ⇒  A t² + B t + C = 0
    const w = vsub(l.p, r.c);
    const A = lenSq(l.u);
    const B = mul(rat(2), dot(l.u, w));
    const C = sub(lenSq(w), r.r2);
    const D = sub(mul(B, B), mul(rat(4), mul(A, C)));
    const quad = `${linTex([A, B], C, ["t^2", "t"])} = 0`;
    if (D.n < 0) {
      this.push(
        "relation",
        { en: "Substitute the line", vi: "Thay phương trình đường thẳng" },
        `${quad},\\quad \\Delta = ${ratLatex(D)} < 0`,
        { en: "The equation in t has no solution, so the line misses it.", vi: "Phương trình ẩn t vô nghiệm, nên đường thẳng không cắt." },
        { en: "Common points correspond to solutions t.", vi: "Mỗi điểm chung ứng với một nghiệm t." },
        { en: "Substitute and look at the discriminant.", vi: "Thay vào rồi xét biệt thức." },
        "passed",
      );
      return this.answer(goal, T(L({ en: "no common point", vi: "không có điểm chung" })), { kind: "none" });
    }
    const half = div(neg(B), mul(rat(2), A));
    const rootPart = sqrtOf(div(D, mul(rat(4), mul(A, A))));
    const ts: Surd[] = D.n === 0 ? [fromRat(half)] : [addS(fromRat(half), scaleS(rootPart, rat(-1))), addS(fromRat(half), rootPart)];
    const pts = ts.map((t) => l.p.map((p, i) => addS(fromRat(p), scaleS(t, l.u[i]))));
    const names = pts.map(() => this.fresh(["M", "N", "K"]));
    this.push(
      "construct",
      { en: "Substitute the line", vi: "Thay phương trình đường thẳng" },
      `${quad}\\ \\Leftrightarrow\\ t = ${ts.map(surdLatex).join(`\\ \\text{${L({ en: "or", vi: "hoặc" })}}\\ t = `)}\\\\ ${pts.map((p, i) => `${nameTex(names[i])}${surdTupleTex(p)}`).join(",\\ ")}`,
      { en: "Put the line's x, y(, z) into the equation, solve the quadratic in t, and put each t back.", vi: "Thay x, y(, z) của đường thẳng vào phương trình, giải phương trình bậc hai ẩn t, rồi thay từng t trở lại." },
      { en: "A common point is on the line (some t) and satisfies the circle's or sphere's equation.", vi: "Điểm chung thuộc đường thẳng (ứng với một t) và thỏa mãn phương trình đường tròn/mặt cầu." },
      { en: "Substitute and expand (x − a)² + …", vi: "Thay vào rồi khai triển (x − a)² + …" },
      pts.every((p) => close(p.reduce((s, x, i) => s + (toNum(x) - toNumber(r.c[i])) ** 2, 0), toNumber(r.r2))) ? "passed" : "failed",
    );
    pts.forEach((p, i) => this.draw({ t: "point", name: names[i], at: p.map(toNum), derived: true }));
    this.answer(goal, pts.map((p, i) => `${nameTex(names[i])}${surdTupleTex(p)}`).join(",\\ "), { kind: "points", list: pts });
  }

  planeSphere(goal: Goal, pl: Plane, s: Round) {
    const dist = this.pointPlane({ kind: "point", name: "I", at: s.c }, pl);
    const d2 = div(mul(add(dot(pl.n, s.c), pl.d), add(dot(pl.n, s.c), pl.d)), lenSq(pl.n));
    const cmp = sign(sub(s.r2, d2));
    if (cmp < 0) {
      this.relationStep(pl, s, "apart");
      return this.answer(goal, T(L({ en: "no common point", vi: "không có điểm chung" })), { kind: "none" });
    }
    const { h } = this.footOnPlane(s.c, pl);
    const rr = sub(s.r2, d2);
    const name = this.fresh(["H", "K"]);
    this.push(
      "construct",
      { en: cmp === 0 ? "Point of tangency" : "Circle of intersection", vi: cmp === 0 ? "Tiếp điểm" : "Đường tròn giao tuyến" },
      `${nameTex(name)}${vecTex(h)}${cmp === 0 ? "" : `,\\quad r = \\sqrt{R^2 - d^2} = \\sqrt{${ratLatex(s.r2)} - ${ratParen(d2)}} = ${surdLatex(sqrtOf(rr))}`}`,
      cmp === 0
        ? { en: `d(I, ${pl.name}) = R, so the plane touches the sphere at the foot of the perpendicular from I.`, vi: `d(I, ${pl.name}) = R nên mặt phẳng tiếp xúc mặt cầu tại hình chiếu của I.` }
        : { en: `d(I, ${pl.name}) < R, so the plane cuts a circle. Its centre is the foot of the perpendicular from I; its radius comes from Pythagoras.`, vi: `d(I, ${pl.name}) < R nên mặt phẳng cắt mặt cầu theo một đường tròn. Tâm là hình chiếu của I, bán kính tính bằng định lý Pi-ta-go.` },
      { en: "The radius, the distance and the circle's radius form a right triangle.", vi: "Bán kính mặt cầu, khoảng cách và bán kính đường tròn tạo thành tam giác vuông." },
      { en: "Compare d(I, (P)) with R first.", vi: "So sánh d(I, (P)) với R trước." },
      confirm(toNum(dist) ** 2, toNumber(d2)),
    );
    this.draw({ t: "point", name, at: toNums(h), derived: true });
    if (cmp === 0) this.answer(goal, pointTex(name, h), { kind: "point", coords: surdsOf(h) });
    else this.answer(goal, `${nameTex(name)}${vecTex(h)},\\ r = ${surdLatex(sqrtOf(rr))}`, { kind: "round", c: h, r2: rr });
  }

  circleCircle(goal: Goal, a: Round, b: Round) {
    // Subtract the equations: 2(c₂ − c₁)·X = r₁² − r₂² + |c₂|² − |c₁|² (the radical line).
    const n = vscale(vsub(b.c, a.c), rat(2));
    if (isZeroVec(n)) return oops({ en: "The circles have the same centre.", vi: "Hai đường tròn đồng tâm." }, { en: "Concentric circles meet only if they are the same circle.", vi: "Hai đường tròn đồng tâm chỉ có điểm chung khi trùng nhau." });
    const rhs = add(sub(a.r2, b.r2), sub(lenSq(b.c), lenSq(a.c)));
    const line: Line = isZero(n[1])
      ? { kind: "line", name: "Δ", p: [div(rhs, n[0]), rat(0)], u: [rat(0), rat(1)] }
      : { kind: "line", name: "Δ", p: [rat(0), div(rhs, n[1])], u: primitive([neg(n[1]), n[0]]) };
    this.push(
      "construct",
      { en: "Subtract the equations", vi: "Trừ vế theo vế" },
      `${linTex(n, neg(rhs))} = 0`,
      { en: "Subtracting the two circle equations cancels x² and y², leaving the line through the common points.", vi: "Trừ hai phương trình đường tròn làm mất x² và y², còn lại đường thẳng đi qua các điểm chung." },
      { en: "Any common point satisfies both equations, so it satisfies their difference.", vi: "Điểm chung thỏa mãn cả hai phương trình nên thỏa mãn hiệu của chúng." },
      { en: "Expand both equations and subtract.", vi: "Khai triển hai phương trình rồi trừ." },
      "passed",
    );
    this.lineRound(goal, line, a);
  }

  projectGoal(goal: Extract<Goal, { k: "project" | "reflect" }>) {
    const a = this.point(goal.p);
    const onto = this.resolve(goal.onto);
    // “Projection of A, then its mirror image” reuses the foot found first.
    const key = `${a.name}|${onto.name}`;
    const cached = this.feet.get(key);
    const h = cached?.name ?? this.fresh(["H", "K"]);
    let foot: Vec;
    if (cached) {
      foot = cached.foot;
    } else if (onto.kind === "plane") {
      const { t, h: hh } = this.footOnPlane(a.at, onto);
      foot = hh;
      const back = neg(t);
      this.push(
        "construct",
        { en: "Foot of the perpendicular", vi: "Hình chiếu vuông góc" },
        `\\vec{u} = \\vec{n}_{${sub_(onto.name)}} = ${vecTex(onto.n)},\\ ${nameTex(h)}${tupleOf(a.at.map((p, i) => paramTex(p, onto.n[i])))}\\in ${nameTex(onto.name)}\\\\ \\Rightarrow\\ t = ${ratLatex(back)}\\ \\Rightarrow\\ ${pointTex(h, foot)}`,
        { en: `Draw the line through ${a.name} along the normal of ${onto.name}, then find where it meets the plane.`, vi: `Dựng đường thẳng qua ${a.name} theo phương pháp tuyến của ${onto.name}, rồi tìm giao điểm với mặt phẳng.` },
        { en: "The projection is where the perpendicular from the point meets the plane.", vi: "Hình chiếu là giao điểm của đường vuông góc hạ từ điểm đó với mặt phẳng." },
        { en: `Write the line through ${a.name} perpendicular to ${onto.name}.`, vi: `Viết đường thẳng qua ${a.name} vuông góc với ${onto.name}.` },
        "passed",
      );
      this.verifyOnPlane(onto, [{ kind: "point", name: h, at: foot }]);
    } else if (onto.kind === "line") {
      const { t, h: hh } = this.footOnLine(a.at, onto);
      foot = hh;
      this.push(
        "construct",
        { en: "Foot of the perpendicular", vi: "Hình chiếu vuông góc" },
        `${nameTex(h)}${tupleOf(onto.p.map((p, i) => paramTex(p, onto.u[i])))}\\in ${nameTex(onto.name)},\\ \\overrightarrow{${a.name}${h}}\\cdot\\vec{u} = 0\\ \\Rightarrow\\ t = ${ratLatex(t)}\\\\ \\Rightarrow\\ ${pointTex(h, foot)}`,
        { en: `${h} is on the line (so it has some t) and ${a.name}${h} is perpendicular to the line's direction.`, vi: `${h} thuộc đường thẳng (ứng với một t) và ${a.name}${h} vuông góc với vectơ chỉ phương.` },
        { en: "Perpendicular vectors have dot product 0.", vi: "Hai vectơ vuông góc có tích vô hướng bằng 0." },
        { en: `Write ${h} in terms of t, then use ${a.name}${h} · u = 0.`, vi: `Viết ${h} theo t, rồi dùng ${a.name}${h} · u = 0.` },
        isZero(dot(vsub(foot, a.at), onto.u)) ? "passed" : "failed",
      );
    } else {
      return oops({ en: `I can project onto a line or a plane, not onto ${onto.name}.`, vi: `Chỉ chiếu được lên đường thẳng hoặc mặt phẳng, không phải ${onto.name}.` }, { en: "Name a line or a plane.", vi: "Hãy nêu một đường thẳng hoặc mặt phẳng." });
    }
    this.feet.set(key, { name: h, foot });
    this.drawObject(a);
    this.drawObject(onto);
    this.draw({ t: "point", name: h, at: toNums(foot), derived: true });
    this.draw({ t: "segment", a: toNums(a.at), b: toNums(foot), derived: true });
    if (goal.k === "project") return this.answer(goal, pointTex(h, foot), { kind: "point", coords: surdsOf(foot) });
    const img = vsub(vscale(foot, rat(2)), a.at);
    const name = this.fresh([`${a.name}'`, `${a.name}_1`]);
    this.push(
      "coordinates",
      { en: "Reflected point", vi: "Điểm đối xứng" },
      `${nameTex(h)}\\ \\text{${L({ en: "is the midpoint of", vi: "là trung điểm" })}}\\ ${a.name}${name}\\ \\Rightarrow\\ ${nameTex(name)} = 2${nameTex(h)} - ${nameTex(a.name)} = ${vecTex(img)}`,
      { en: `The mirror image is as far beyond ${h} as ${a.name} is before it.`, vi: `Điểm đối xứng cách ${h} một khoảng bằng ${a.name}, ở phía bên kia.` },
      { en: `${h} is the midpoint of ${a.name} and its image.`, vi: `${h} là trung điểm của ${a.name} và điểm đối xứng.` },
      { en: `Use the midpoint formula backwards: image = 2·${h} − ${a.name}.`, vi: `Dùng ngược công thức trung điểm: điểm đối xứng = 2·${h} − ${a.name}.` },
      veqNum(mid(a.at, img), foot) ? "passed" : "failed",
    );
    this.draw({ t: "point", name, at: toNums(img), derived: true });
    this.answer(goal, pointTex(name, img), { kind: "point", coords: surdsOf(img) });
  }

  centerGoal(goal: Extract<Goal, { k: "center" }>) {
    const o = this.resolve(goal.ref);
    if (o.kind !== "circle" && o.kind !== "sphere") {
      return oops({ en: `${o.name} isn't a circle or a sphere.`, vi: `${o.name} không phải đường tròn hay mặt cầu.` }, { en: "Give its equation, e.g. (S): x^2 + y^2 + z^2 − 2x + 4y − 6z − 2 = 0.", vi: "Cho phương trình, ví dụ (S): x^2 + y^2 + z^2 − 2x + 4y − 6z − 2 = 0." });
    }
    const r = sqrtOf(o.r2);
    const name = this.fresh(["I", "J"]);
    this.push(
      "formula",
      { en: "Centre and radius", vi: "Tâm và bán kính" },
      `${nameTex(o.name)}: ${circleTex(o.c, o.r2)}\\\\ \\Rightarrow\\ ${pointTex(name, o.c)},\\ R = ${rootTex(o.r2)}`,
      { en: "Complete the square in each variable to get (x − a)² + … = R².", vi: "Thêm bớt để đưa về dạng (x − a)² + … = R²." },
      { en: "(x − a)² + (y − b)² (+ (z − c)²) = R² is the set of points at distance R from (a; b; c).", vi: "(x − a)² + (y − b)² (+ (z − c)²) = R² là tập các điểm cách (a; b; c) một khoảng R." },
      { en: "Group x² − 2ax and add a² to both sides.", vi: "Nhóm x² − 2ax rồi cộng a² vào hai vế." },
      "passed",
    );
    this.drawObject(o);
    this.draw({ t: "point", name, at: toNums(o.c), derived: true });
    this.answer(goal, `${pointTex(name, o.c)},\\ R = ${surdLatex(r)}`, { kind: "round", c: o.c, r2: o.r2 });
  }

  roundGoal(goal: Extract<Goal, { k: "round" }>) {
    const kind = this.dim === 3 ? "sphere" : "circle";
    const word = kind === "sphere" ? { en: "sphere", vi: "mặt cầu" } : { en: "circle", vi: "đường tròn" };
    const name = goal.as ?? this.fresh(kind === "sphere" ? ["(S)", "(S')"] : ["(C)", "(C')"]);
    let c: Vec;
    let r2: Rat;
    let how: string;
    let explain: Text;
    if (goal.diameter) {
      const [a, b] = goal.diameter.map((n) => this.point(n));
      c = mid(a.at, b.at);
      r2 = div(lenSq(vsub(b.at, a.at)), rat(4));
      how = `I = ${vecTex(c)},\\ R = \\frac{${a.name}${b.name}}{2} = ${rootTex(r2)}`;
      explain = { en: `The centre is the midpoint of ${a.name}${b.name}; the radius is half of ${a.name}${b.name}.`, vi: `Tâm là trung điểm ${a.name}${b.name}; bán kính bằng nửa ${a.name}${b.name}.` };
      this.draw({ t: "segment", a: toNums(a.at), b: toNums(b.at) });
    } else if (goal.circum) {
      const pts = goal.circum.map((n) => this.point(n));
      c = this.circumcentre(pts);
      r2 = lenSq(vsub(pts[0].at, c));
      how = `I${vecTex(c)},\\ R = I${pts[0].name} = ${rootTex(r2)}`;
      explain = { en: `The centre is equally far from ${pts.map((p) => p.name).join(", ")}: solve IA² = IB² = … (a linear system).`, vi: `Tâm cách đều ${pts.map((p) => p.name).join(", ")}: giải IA² = IB² = … (một hệ bậc nhất).` };
      pts.forEach((p, i) => this.draw({ t: "segment", a: toNums(p.at), b: toNums(pts[(i + 1) % pts.length].at) }));
    } else {
      const i = this.point(goal.center!);
      c = i.at;
      if (goal.through) {
        const a = this.point(goal.through);
        r2 = lenSq(vsub(a.at, c));
        how = `R = ${i.name}${a.name} = \\sqrt{${sumSqTex(vsub(a.at, c))}} = ${rootTex(r2)}`;
        explain = { en: `The radius is the distance from the centre ${i.name} to ${a.name}.`, vi: `Bán kính bằng khoảng cách từ tâm ${i.name} đến ${a.name}.` };
        this.drawObject(a);
      } else if (goal.tangent) {
        const t = this.resolve(goal.tangent);
        const d = t.kind === "plane" ? this.pointPlane(i, t) : t.kind === "line" ? this.pointLine(i, t) : null;
        if (!d) return oops({ en: `“Tangent to ${goal.tangent}” needs a line or a plane.`, vi: `“Tiếp xúc với ${goal.tangent}” cần một đường thẳng hoặc mặt phẳng.` }, { en: "Name a line or plane.", vi: "Hãy nêu một đường thẳng hoặc mặt phẳng." });
        r2 = fromSq(d);
        how = `R = d\\left(${nameTex(i.name)}, ${nameTex(t.name)}\\right) = ${surdLatex(d)}`;
        explain = { en: `Tangent means the distance from ${i.name} to ${t.name} equals the radius.`, vi: `Tiếp xúc nghĩa là khoảng cách từ ${i.name} đến ${t.name} bằng bán kính.` };
        this.drawObject(t);
      } else if (goal.radius) {
        r2 = mul(goal.radius, goal.radius);
        how = `R = ${ratLatex(goal.radius)}`;
        explain = { en: "Centre and radius are given.", vi: "Đã biết tâm và bán kính." };
      } else {
        return oops({ en: `I need a point on the ${word.en}, a tangent, or the radius.`, vi: `Cần thêm một điểm thuộc ${word.vi}, một tiếp tuyến/tiếp diện, hoặc bán kính.` }, { en: "E.g. “centre I(1; 2; 3) through A(2; 0; 1)”.", vi: "Ví dụ “tâm I(1; 2; 3) đi qua A(2; 0; 1)”." });
      }
      this.drawObject(i);
    }
    if (isZero(r2)) oops({ en: `The radius would be 0, so there's no ${word.en}.`, vi: `Bán kính bằng 0 nên không có ${word.vi}.` }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
    this.push(
      "construct",
      { en: `Equation of the ${word.en}`, vi: `Phương trình ${word.vi}` },
      `${how}\\\\ ${nameTex(name)}: ${circleTex(c, r2)}`,
      explain,
      { en: `A ${word.en} with centre (a; b${kind === "sphere" ? "; c" : ""}) and radius R is (x − a)² + (y − b)²${kind === "sphere" ? " + (z − c)²" : ""} = R².`, vi: `${kind === "sphere" ? "Mặt cầu" : "Đường tròn"} tâm (a; b${kind === "sphere" ? "; c" : ""}) bán kính R có phương trình (x − a)² + (y − b)²${kind === "sphere" ? " + (z − c)²" : ""} = R².` },
      { en: "Find the centre and the radius first.", vi: "Tìm tâm và bán kính trước." },
      "passed",
    );
    this.draw({ t: "round", name, c: toNums(c), r: Math.sqrt(toNumber(r2)), derived: true });
    this.answer(goal, `${nameTex(name)}: ${circleTex(c, r2)}`, { kind: "round", c, r2 });
  }

  /** Centre of the circle through 3 points (plane) or sphere through 4 points (space). */
  circumcentre(pts: Point[]): Vec {
    const dim = this.dim;
    if (pts.length !== dim + 1) {
      return oops(
        { en: `A ${dim === 3 ? "sphere" : "circle"} through given points needs ${dim + 1} points.`, vi: `${dim === 3 ? "Mặt cầu" : "Đường tròn"} đi qua các điểm cho trước cần ${dim + 1} điểm.` },
        { en: dim === 3 ? "Name four points, e.g. the tetrahedron ABCD." : "Name three points, e.g. triangle ABC.", vi: dim === 3 ? "Nêu bốn điểm, ví dụ tứ diện ABCD." : "Nêu ba điểm, ví dụ tam giác ABC." },
      );
    }
    // 2(Pk − P0)·X = |Pk|² − |P0|²
    const rows = pts.slice(1).map((p) => ({ a: vscale(vsub(p.at, pts[0].at), rat(2)), b: sub(lenSq(p.at), lenSq(pts[0].at)) }));
    const x = solveLinear(rows.map((r) => [...r.a]), rows.map((r) => r.b));
    if (!x) this.collinear(pts);
    return x!;
  }

  relationText(rel: Relation, a: GeoObject, b: GeoObject): Text {
    const A = a.name;
    const B = b.name;
    const map: Record<Relation, Text> = {
      "planes-parallel": { en: `${A} and ${B} are parallel`, vi: `${A} và ${B} song song` },
      "planes-same": { en: `${A} and ${B} coincide`, vi: `${A} và ${B} trùng nhau` },
      "planes-cross": { en: `${A} and ${B} intersect`, vi: `${A} và ${B} cắt nhau` },
      "planes-perpendicular": { en: `${A} and ${B} are perpendicular`, vi: `${A} và ${B} vuông góc` },
      "line-in-plane": { en: `${A} lies in ${B}`, vi: `${A} nằm trong ${B}` },
      "line-parallel-plane": { en: `${A} is parallel to ${B}`, vi: `${A} song song với ${B}` },
      "line-cross-plane": { en: `${A} cuts ${B} at one point`, vi: `${A} cắt ${B} tại một điểm` },
      "line-perpendicular-plane": { en: `${A} is perpendicular to ${B}`, vi: `${A} vuông góc với ${B}` },
      "lines-same": { en: `${A} and ${B} coincide`, vi: `${A} và ${B} trùng nhau` },
      "lines-parallel": { en: `${A} and ${B} are parallel`, vi: `${A} và ${B} song song` },
      "lines-cross": { en: `${A} and ${B} intersect`, vi: `${A} và ${B} cắt nhau` },
      "lines-perpendicular": { en: `${A} and ${B} intersect at a right angle`, vi: `${A} và ${B} cắt nhau và vuông góc` },
      "lines-skew": { en: `${A} and ${B} are skew (not parallel, never meet)`, vi: `${A} và ${B} chéo nhau` },
      apart: { en: `${A} and ${B} have no common point`, vi: `${A} và ${B} không có điểm chung` },
      tangent: { en: `${A} and ${B} are tangent`, vi: `${A} và ${B} tiếp xúc` },
      secant: { en: `${A} and ${B} cut each other`, vi: `${A} và ${B} cắt nhau` },
      inside: { en: `${A} is inside ${B}`, vi: `${A} nằm trong ${B}` },
      on: { en: `${A} lies on ${B}`, vi: `${A} thuộc ${B}` },
      outside: { en: `${A} is outside ${B}`, vi: `${A} nằm ngoài ${B}` },
    };
    return map[rel];
  }

  relationStep(a: GeoObject, b: GeoObject, rel: Relation, latex?: string) {
    const text = this.relationText(rel, a, b);
    this.push(
      "relation",
      { en: "Relative position", vi: "Vị trí tương đối" },
      latex ?? T(L(text)),
      { en: `${text.en}.`, vi: `${text.vi}.` },
      { en: "Compare the direction / normal vectors, then test a point.", vi: "So sánh các vectơ chỉ phương / pháp tuyến, rồi thử một điểm." },
      { en: "Are the direction vectors multiples of each other?", vi: "Các vectơ chỉ phương có cùng phương không?" },
      "passed",
    );
  }

  positionGoal(goal: Extract<Goal, { k: "position" }>) {
    let x = this.resolve(goal.x);
    let y = this.resolve(goal.y);
    const rank = { point: 0, line: 1, plane: 2, circle: 3, sphere: 3, vector: 9 } as const;
    if (rank[x.kind] > rank[y.kind]) [x, y] = [y, x];
    this.drawObject(x);
    this.drawObject(y);
    let rel: Relation;
    let latex: string;
    if (x.kind === "plane" && y.kind === "plane") {
      const k = ratio(x.n, y.n);
      if (k) {
        rel = isZero(sub(y.d, mul(x.d, k))) ? "planes-same" : "planes-parallel";
        latex = `\\vec{n}_{${sub_(y.name)}} = ${ratLatex(k)}\\,\\vec{n}_{${sub_(x.name)}}`;
      } else {
        rel = isZero(dot(x.n, y.n)) ? "planes-perpendicular" : "planes-cross";
        latex = `${vecTex(x.n)} \\nparallel ${vecTex(y.n)}${rel === "planes-perpendicular" ? `,\\ \\vec{n}_{${sub_(x.name)}}\\cdot\\vec{n}_{${sub_(y.name)}} = 0` : ""}`;
      }
    } else if (x.kind === "line" && y.kind === "plane") {
      const k = dot(x.u, y.n);
      const onIt = isZero(add(dot(y.n, x.p), y.d));
      rel = !isZero(k) ? (parallelVec(x.u, y.n) ? "line-perpendicular-plane" : "line-cross-plane") : onIt ? "line-in-plane" : "line-parallel-plane";
      latex = `\\vec{u}\\cdot\\vec{n} = ${dotTex(x.u, y.n)} = ${ratLatex(k)}${isZero(k) ? `,\\ M${vecTex(x.p)} ${onIt ? "\\in" : "\\notin"} ${nameTex(y.name)}` : ""}`;
    } else if (x.kind === "line" && y.kind === "line") {
      const w = vsub(y.p, x.p);
      if (this.dim === 3) {
        const n = cross(x.u, y.u);
        if (isZeroVec(n)) rel = isZeroVec(cross(w, x.u)) ? "lines-same" : "lines-parallel";
        else if (!isZero(dot(n, w))) rel = "lines-skew";
        else rel = isZero(dot(x.u, y.u)) ? "lines-perpendicular" : "lines-cross";
        latex = `\\left[\\vec{u}_1, \\vec{u}_2\\right] = ${vecTex(n)}${isZeroVec(n) ? "" : `,\\ \\left[\\vec{u}_1, \\vec{u}_2\\right]\\cdot\\overrightarrow{M_1M_2} = ${ratLatex(dot(n, w))}`}`;
      } else {
        const d = det2(x.u, y.u);
        rel = isZero(d) ? (isZero(det2(w, x.u)) ? "lines-same" : "lines-parallel") : isZero(dot(x.u, y.u)) ? "lines-perpendicular" : "lines-cross";
        latex = `\\vec{u}_1 = ${vecTex(x.u)},\\ \\vec{u}_2 = ${vecTex(y.u)}`;
      }
    } else if ((x.kind === "plane" || x.kind === "line") && (y.kind === "sphere" || y.kind === "circle")) {
      const dist = x.kind === "plane" ? this.pointPlane({ kind: "point", name: "I", at: y.c }, x) : this.pointLine({ kind: "point", name: "I", at: y.c }, x);
      const cmp = sign(sub(rat(0), sub(fromSq(dist), y.r2)));
      rel = cmp < 0 ? "apart" : cmp === 0 ? "tangent" : "secant";
      latex = `d = ${surdLatex(dist)}\\ ${cmp < 0 ? ">" : cmp === 0 ? "=" : "<"}\\ R = ${surdLatex(sqrtOf(y.r2))}`;
    } else if (x.kind === "point" && (y.kind === "sphere" || y.kind === "circle")) {
      const d2 = lenSq(vsub(x.at, y.c));
      const cmp = sign(sub(d2, y.r2));
      rel = cmp < 0 ? "inside" : cmp === 0 ? "on" : "outside";
      latex = `I${x.name}^2 = ${ratLatex(d2)}\\ ${cmp < 0 ? "<" : cmp === 0 ? "=" : ">"}\\ R^2 = ${ratLatex(y.r2)}`;
    } else if (x.kind === "point" && (y.kind === "plane" || y.kind === "line")) {
      const on = y.kind === "plane" ? isZero(add(dot(y.n, x.at), y.d)) : isZeroVec(this.dim === 3 ? cross(vsub(x.at, y.p), y.u) : [det2(vsub(x.at, y.p), y.u)]);
      rel = on ? "on" : "outside";
      latex = T(L(on ? { en: `${x.name} lies on ${y.name}`, vi: `${x.name} thuộc ${y.name}` } : { en: `${x.name} is not on ${y.name}`, vi: `${x.name} không thuộc ${y.name}` }));
    } else if ((x.kind === "circle" || x.kind === "sphere") && (y.kind === "circle" || y.kind === "sphere")) {
      const d = Math.sqrt(toNumber(lenSq(vsub(y.c, x.c))));
      const r1 = Math.sqrt(toNumber(x.r2));
      const r2 = Math.sqrt(toNumber(y.r2));
      rel = d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12 ? "apart" : close(d, r1 + r2) || close(d, Math.abs(r1 - r2)) ? "tangent" : "secant";
      latex = `I_1I_2 \\approx ${degrees(d)},\\ R_1 + R_2 \\approx ${degrees(r1 + r2)},\\ |R_1 - R_2| \\approx ${degrees(Math.abs(r1 - r2))}`;
    } else {
      return oops({ en: `I can't compare ${x.name} and ${y.name} yet.`, vi: `Chưa xét được vị trí của ${x.name} và ${y.name}.` }, { en: "Try two lines, two planes, a line and a plane, or a plane and a sphere.", vi: "Hãy thử hai đường thẳng, hai mặt phẳng, đường thẳng và mặt phẳng, hoặc mặt phẳng và mặt cầu." });
    }
    this.relationStep(x, y, rel, latex);
    this.answer(goal, T(L(this.relationText(rel, x, y))), { kind: "relation", relation: rel });
  }

  /** Questions to answer when none were asked. */
  defaults(): Goal[] {
    const all = [...this.prob.objects.values()];
    const pts = all.filter((o) => o.kind === "point").map((o) => o.name);
    const planes = all.filter((o) => o.kind === "plane").map((o) => o.name);
    const lines = all.filter((o) => o.kind === "line").map((o) => o.name);
    const rounds = all.filter((o) => o.kind === "circle" || o.kind === "sphere").map((o) => o.name);
    const vecs = all.filter((o) => o.kind === "vector").map((o) => o.name);
    const goals: Goal[] = [];
    rounds.forEach((r) => goals.push({ k: "center", ref: r }));
    if (pts.length && planes.length) goals.push({ k: "distance", x: pts[0], y: planes[0] }, { k: "project", p: pts[0], onto: planes[0] });
    else if (pts.length && lines.length) goals.push({ k: "distance", x: pts[0], y: lines[0] });
    if (lines.length && planes.length) goals.push({ k: "position", x: lines[0], y: planes[0] });
    if (lines.length >= 2) goals.push({ k: "position", x: lines[0], y: lines[1] });
    if (planes.length >= 2) goals.push({ k: "position", x: planes[0], y: planes[1] });
    if (planes.length && rounds.length) goals.push({ k: "position", x: planes[0], y: rounds[0] });
    if (vecs.length >= 2) goals.push({ k: "dot", u: vecs[0], v: vecs[1] }, { k: "angle", x: vecs[0], y: vecs[1], vectors: true });
    if (goals.length === 0) {
      if (pts.length === 2) goals.push({ k: "vector", a: pts[0], b: pts[1] }, { k: "length", ref: pts[0] + pts[1] }, { k: "midpoint", a: pts[0], b: pts[1] });
      if (pts.length === 3) goals.push(...(this.dim === 3 ? [{ k: "plane3", pts } as Goal] : []), { k: "area", pts });
      if (pts.length >= 4 && this.dim === 3) goals.push({ k: "volume", pts: pts.slice(0, 4) });
    }
    return goals.slice(0, 4);
  }
}

/* ───────────────────────────── Pieces used above ───────────────────────────── */

function tupleOf(parts: string[]) {
  return `\\left(${parts.join(L({ en: ",\\ ", vi: ";\\ " }))}\\right)`;
}

const parallelVec = (a: Vec, b: Vec) => (a.length === 3 ? isZeroVec(cross(a, b)) : isZero(det2(a, b)));
const veqNum = (a: Vec, b: Vec) => a.every((x, i) => isZero(sub(x, b[i])));
/** d² for a single-term distance (it is always √rational). */
const fromSq = (d: Surd): Rat => (d.length === 0 ? rat(0) : mul(mul(d[0].c, d[0].c), rat(d[0].m)));

/** Gauss–Jordan elimination over the rationals; null when singular. */
export function solveLinear(a: Rat[][], b: Rat[]): Rat[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    const pivot = m.findIndex((row, r) => r >= col && !isZero(row[col]));
    if (pivot < 0) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    m[col] = m[col].map((x) => div(x, p));
    for (let r = 0; r < n; r++) {
      if (r === col || isZero(m[r][col])) continue;
      const f = m[r][col];
      m[r] = m[r].map((x, j) => sub(x, mul(f, m[col][j])));
    }
  }
  return m.map((row) => row[n]);
}

/* ───────────────────────────── Entry points ───────────────────────────── */

export function analyzeGeometry(raw: string): GeoSolution | SolveFailure {
  const prob = parseGeometry(raw);
  if ("ok" in prob) return prob;
  const s = new Solver(prob);
  const asked = prob.goals.length > 0;
  const goals = asked ? prob.goals : s.defaults();
  try {
    for (const g of goals) s.run(g);
  } catch (e) {
    if (e instanceof GeoError) return { ok: false, code: "unsupported", message: e.message, suggestion: e.suggestion };
    throw e;
  }
  // Everything given goes on the figure too.
  for (const o of prob.objects.values()) s.drawObject(o);
  if (!asked) s.notes.unshift(L({ en: "No question was found, so here is what can be worked out from the data.", vi: "Không thấy câu hỏi, nên đây là những gì tính được từ dữ kiện." }));
  if (prob.skipped.length) s.notes.push(L({ en: `I didn't understand: “${prob.skipped.join("”, “")}”.`, vi: `Chưa hiểu phần: “${prob.skipped.join("”, “")}”.` }));
  if (s.answers.length === 0) {
    return {
      ok: false,
      code: "unsupported",
      message: L({ en: "I found the data but no question I can answer.", vi: "Đã đọc được dữ kiện nhưng không thấy câu hỏi giải được." }),
      suggestion: L({ en: "Ask e.g. “distance from A to (P)”, “plane (ABC)”, “intersection of d and (P)”.", vi: "Hỏi ví dụ “khoảng cách từ A đến (P)”, “mặt phẳng (ABC)”, “giao điểm của d và (P)”." }),
    };
  }
  return { dim: prob.dim, drafts: s.drafts, answers: s.answers, figure: dedupe(s.figure), notes: s.notes };
}

/** Later duplicates (by kind and name) are dropped; a derived copy wins over a plain one. */
function dedupe(items: FigItem[]): FigItem[] {
  const seen = new Map<string, number>();
  const out: FigItem[] = [];
  for (const it of items) {
    const key = it.t === "segment" ? `s:${[it.a, it.b].map((p) => p.join(",")).sort().join("|")}` : `${it.t}:${it.name}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(it);
    } else if ("derived" in it && it.derived) out[at] = it;
  }
  return out;
}

export function solveGeometry(problemId: string, raw: string): SolveResult {
  const g = analyzeGeometry(raw);
  if ("ok" in g) return g;
  const finalAnswer = g.answers.length === 1 ? g.answers[0].latex : `\\begin{gathered}${g.answers.map((a) => a.latex).join("\\\\")}\\end{gathered}`;
  const solution: MathSolution = {
    problemId,
    originalInput: raw,
    topic: g.dim === 3 ? "geometry-3d" : "geometry-2d",
    steps: finalize(problemId, g.drafts),
    finalAnswer,
    roots: [],
    confidenceNotes: g.notes,
  };
  return { ok: true, solution };
}
