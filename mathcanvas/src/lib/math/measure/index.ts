import type { AnswerCheck } from "../check";
import type { GraphSpec } from "../graph";
import type { SpaceScene } from "../geometry/figure";
import { clean, hasCoordinates } from "../geometry/parse";
import { L } from "../lang";
import { float, normalizeInput } from "../polynomial";
import { finalize } from "../steps";
import type { MathSolution, ProblemTopic, SolveFailure, SolveResult } from "../types";
import { type MeasureAnswer, MeasureError, type Steps, close, fixEq } from "./num";
import { type RoundKind, parseSolid, solidKind, solveSolid } from "./solid";
import { type Model, buildModel, isSpaceSolid } from "./space";
import { solveSpace } from "./spaceSolve";
import { isTriangleProblem, parseTriangle, solveTriangle, trianglePoints } from "./triangle";

/**
 * Problems given by measures rather than coordinates: triangles (grade 10),
 * solids by formula, and pyramids/prisms described in words (grades 11–12).
 */

type Kind = "triangle" | "solid" | "space";

function kindOf(raw: string): Kind | null {
  if (hasCoordinates(raw)) return null;
  const s = clean(raw.replace(/[’′`]/g, "'"));
  if (isSpaceSolid(s)) return "space";
  const sk = solidKind(s);
  if (sk) return sk === "pyramid" || sk === "prism" ? (/diện tích đáy|base area/u.test(s) ? "solid" : "space") : "solid";
  if (isTriangleProblem(s)) return "triangle";
  return null;
}

/** A triangle, a solid or a pyramid described in words (no coordinates). */
export const isMeasure = (raw: string) => kindOf(raw) !== null;

export type MeasureSolution = {
  kind: Kind;
  topic: ProblemTopic;
  steps: Steps;
  answers: MeasureAnswer[];
  notes: string[];
  figure: ({ ok: true } & GraphSpec) | null;
};

const fail = (e: MeasureError): SolveFailure => ({ ok: false, code: "unsupported", message: e.message, suggestion: e.suggestion });

export function analyzeMeasure(raw: string): MeasureSolution | SolveFailure {
  const kind = kindOf(raw);
  if (!kind) return { ok: false, code: "parse", message: L({ en: "This isn't a triangle or solid problem.", vi: "Đây không phải bài toán tam giác hay khối đa diện." }), suggestion: "" };
  try {
    const r = analyzeKind(kind, raw);
    r.answers.forEach((a) => (a.latex = fixEq(a.latex)));
    return r;
  } catch (e) {
    if (e instanceof MeasureError) return fail(e);
    throw e;
  }
}

function analyzeKind(kind: Kind, raw: string): MeasureSolution {
  {
    if (kind === "triangle") {
      const p = parseTriangle(raw);
      const r = solveTriangle(p);
      return { kind, topic: "triangle", steps: r.steps, answers: r.answers, notes: r.notes, figure: triangleFigure(p.names, r.solved) };
    }
    if (kind === "solid") {
      const p = parseSolid(raw);
      const r = solveSolid(p);
      return { kind, topic: "solid", steps: r.steps, answers: r.answers, notes: [], figure: roundFigure(p.kind, p.r, p.h) };
    }
    const m = buildModel(raw);
    const s = solveSpace(raw, m);
    return { kind, topic: "space-figure", steps: s.st, answers: s.answers, notes: s.notes, figure: solidFigure(m, s.extra, s.section) };
  }
}

export function solveMeasure(problemId: string, raw: string): SolveResult {
  const r = analyzeMeasure(raw);
  if ("ok" in r) return r;
  if (!r.answers.length) {
    return { ok: false, code: "unsupported", message: L({ en: "I read the data but found no question I can answer.", vi: "Đã đọc được dữ kiện nhưng không thấy câu hỏi giải được." }), suggestion: L({ en: "Ask e.g. “Tính thể tích”, “góc giữa SC và (ABCD)”, “khoảng cách từ A đến (SBC)”.", vi: "Hỏi ví dụ “Tính thể tích”, “góc giữa SC và (ABCD)”, “khoảng cách từ A đến (SBC)”." }) };
  }
  const finalAnswer = r.answers.length === 1 ? r.answers[0].latex : `\\begin{gathered}${r.answers.map((a) => a.latex).join("\\\\")}\\end{gathered}`;
  const solution: MathSolution = { problemId, originalInput: raw, topic: r.topic, steps: finalize(problemId, r.steps.drafts), finalAnswer, roots: [], confidenceNotes: r.notes };
  return { ok: true, solution };
}

/* ───────────────────────────── Figures ───────────────────────────── */

const CAPTION = () => L({ en: "Drag the picture to turn it.", vi: "Kéo hình để xoay." });

function triangleFigure(names: string[], solved: { side: number[]; angle: number[] }): { ok: true } & GraphSpec {
  const P = trianglePoints(solved);
  const xs = P.map((p) => p[0]);
  const ys = P.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const pad = span * 0.2;
  return {
    ok: true,
    title: L({ en: `Triangle ${names.join("")}`, vi: `Tam giác ${names.join("")}` }),
    caption: L({ en: "Drawn to scale (the unit length is 1).", vi: "Vẽ đúng tỉ lệ (đơn vị độ dài là 1)." }),
    curves: P.map((p, i) => ({ label: "", tone: "brand" as const, thin: true, segments: [[p as [number, number], P[(i + 1) % 3] as [number, number]]] })),
    marks: P.map((p, i) => ({ x: p[0], y: p[1], label: names[i], given: true })),
    shade: [],
    asymptotes: [],
    domain: [Math.min(...xs) - pad, Math.max(...xs) + pad],
    range: [Math.min(...ys) - pad, Math.max(...ys) + pad],
    equal: true,
  };
}

function circle(c: number[], r: number, z: number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k <= 72; k++) {
    const a = (k / 72) * 2 * Math.PI;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z]);
  }
  return out;
}

function spaceSpec(scene: SpaceScene, title: string): { ok: true } & GraphSpec {
  return { ok: true, title, caption: CAPTION(), curves: [], marks: [], shade: [], asymptotes: [], domain: [-1, 1], range: [-1, 1], space: scene };
}

function roundFigure(kind: RoundKind, r?: number, h?: number): ({ ok: true } & GraphSpec) | null {
  if (r === undefined || (kind !== "sphere" && h === undefined)) return null;
  const empty = { points: [], segments: [], lines: [], planes: [], spheres: [], vectors: [], axes: false, plain: true };
  if (kind === "sphere") {
    return spaceSpec({ ...empty, points: [{ label: "O", at: [0, 0, 0] }], segments: [{ a: [0, 0, 0], b: [r, 0, 0], derived: true }], spheres: [{ label: "", c: [0, 0, 0], r }], center: [0, 0, 0], half: r * 1.1 }, L({ en: "Sphere", vi: "Khối cầu" }));
  }
  if (kind === "cone" || kind === "cylinder") {
    const gens = [0, 90, 180, 270].map((d) => [r * Math.cos((d * Math.PI) / 180), r * Math.sin((d * Math.PI) / 180)]);
    const segments = kind === "cone" ? gens.map((g) => ({ a: [g[0], g[1], 0], b: [0, 0, h!] })) : gens.map((g) => ({ a: [g[0], g[1], 0], b: [g[0], g[1], h!] }));
    return spaceSpec(
      {
        ...empty,
        points: [{ label: "O", at: [0, 0, 0] }, ...(kind === "cone" ? [{ label: "S", at: [0, 0, h!] }] : [{ label: "O'", at: [0, 0, h!] }])],
        segments: [...segments, { a: [0, 0, 0], b: [0, 0, h!], derived: true }, { a: [0, 0, 0], b: [r, 0, 0], derived: true }],
        curves: kind === "cone" ? [{ pts: circle([0, 0], r, 0) }] : [{ pts: circle([0, 0], r, 0) }, { pts: circle([0, 0], r, h!) }],
        center: [0, 0, h! / 2],
        half: Math.hypot(r, h! / 2) * 0.75,
      },
      L({ en: kind === "cone" ? "Cone" : "Cylinder", vi: kind === "cone" ? "Khối nón" : "Khối trụ" }),
    );
  }
  return null;
}

/**
 * Textbook view: AB along the front, AD running back to the right, seen a little from above.
 * A cross-section seen almost edge-on is a thin sliver, so the view then turns a little
 * (the nearest of a few angles) until the section faces the reader.
 */
function viewFor(section: number[][] | null): { yaw: number; pitch: number } {
  const home = { yaw: -1.25, pitch: 0.38 };
  if (!section || section.length < 3) return home;
  const [o] = section;
  let n = [0, 0, 0];
  for (let i = 1; i + 1 < section.length && Math.hypot(...n) < 1e-9; i++) {
    const u = section[i].map((x, k) => x - o[k]);
    const v = section[i + 1].map((x, k) => x - o[k]);
    n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  }
  const len = Math.hypot(...n);
  if (len < 1e-9) return home;
  /** How much of the section shows: |cos| of the angle between its normal and the line of sight. */
  const facing = ({ yaw, pitch }: typeof home) => Math.abs((n[0] * Math.cos(pitch) * Math.cos(yaw) + n[1] * Math.cos(pitch) * Math.sin(yaw) + n[2] * Math.sin(pitch)) / len);
  const views = [0, -0.25, 0.25, -0.45, 0.45].flatMap((dy) => [0, 0.17].map((dp) => ({ yaw: home.yaw + dy, pitch: home.pitch + dp })));
  return views.find((v) => facing(v) >= 0.35) ?? views.reduce((a, b) => (facing(b) > facing(a) ? b : a));
}

function solidFigure(m: Model,extra: Array<[string, string]>, section: string[] | null): { ok: true } & GraphSpec {
  const P = (x: string) => m.pts.get(x)!;
  const all = [...m.pts.values()];
  const lo = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i])));
  const center = lo.map((x, i) => (x + hi[i]) / 2);
  // The view frames a cube of side 2·half; a solid only needs the ball around its points.
  const half = Math.max(...all.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])), 0.5) * 0.72;
  const faceNames = m.faces.map((f) => f.pts);
  // Segments to points not on the solid's edges (midpoints, feet) are drawn dashed.
  const extraSegs = extra.filter(([a, b]) => m.pts.has(a) && m.pts.has(b)).map(([a, b]) => ({ a: P(a), b: P(b), derived: true }));
  return spaceSpec(
    {
      points: [...m.pts.entries()].map(([label, at]) => ({ label, at, derived: m.why.has(label) && !m.base.includes(label) })),
      segments: extraSegs,
      lines: [],
      planes: [],
      spheres: [],
      vectors: [],
      center,
      half,
      axes: false,
      plain: true,
      view: viewFor(section ? section.map(P) : null),
      poly: faceNames.map((f) => f.map(P)),
      fills: section ? [section.map(P)] : undefined,
    },
    m.name,
  );
}

export function measureFigure(raw: string): ({ ok: true } & GraphSpec) | SolveFailure {
  const r = analyzeMeasure(raw);
  if ("ok" in r) return r;
  return r.figure ?? { ok: false, code: "unsupported", message: L({ en: "There's no figure for this problem.", vi: "Bài này không có hình vẽ." }), suggestion: "" };
}

/* ───────────────────────────── Checking answers ───────────────────────────── */

/** A learner's number: 2a√3, a^3√2/6, 12π, 60°, 3,5 — the unit letter counts as 1. */
export function readAnswer(raw: string): number | null {
  let s = normalizeInput(raw.normalize("NFC"))
    .replace(/^.*=/, "")
    .replace(/°|độ|degrees?|deg/giu, "")
    .replace(/π/g, "pi")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/sqrt\s*(\d+(?:\.\d+)?)/g, "sqrt($1)")
    .trim();
  const letters = [...new Set(s.replace(/sqrt|pi/g, "").match(/[a-z]/g) ?? [])];
  if (letters.length > 1) return null;
  if (letters[0]) s = s.replace(new RegExp(`${letters[0]}(?=\\s*(sqrt|pi|\\d|\\())`, "g"), `${letters[0]}*`);
  try {
    const v = Number(float.evaluate(s, letters[0] ? { [letters[0]]: 1 } : {}));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function checkMeasureAnswer(problem: string, answer: string): AnswerCheck {
  const r = analyzeMeasure(problem);
  if ("ok" in r) return { status: "unsupported", message: r.message };
  return checkAgainstMeasure(r.answers, answer);
}

export function checkAgainstMeasure(answers: MeasureAnswer[], answer: string): AnswerCheck {
  const numeric = answers.filter((a) => a.value !== null);
  if (!numeric.length) return { status: "unsupported", message: L({ en: "Proofs and constructions are checked step by step, not by a final answer.", vi: "Bài chứng minh, dựng hình được kiểm tra theo từng bước, không theo đáp số." }) };
  const n = readAnswer(answer);
  if (n === null) return { status: "unreadable", message: L({ en: "Write a number such as 2a√3, a³√2/6, 12π or 60°.", vi: "Hãy viết một số như 2a√3, a³√2/6, 12π hoặc 60°." }) };
  const hit = numeric.find((a) => close(n, a.value!, a.degrees ? 1e-3 : 1e-6));
  if (hit) return { status: "correct", message: L({ en: "Correct.", vi: "Đúng." }) };
  const pi = numeric.find((a) => close(n * Math.PI, a.value!, 1e-6));
  if (pi) return { status: "incorrect", message: L({ en: "Close — you're missing a factor of π.", vi: "Gần đúng — bạn thiếu thừa số π." }) };
  const third = numeric.find((a) => close(n / 3, a.value!, 1e-6));
  if (third) return { status: "incorrect", message: L({ en: "That's three times the answer — a pyramid or cone needs the factor 1/3.", vi: "Gấp ba lần đáp số — khối chóp, khối nón cần nhân thêm 1/3." }) };
  const deg = numeric.find((a) => a.degrees && close(90 - n, a.value!, 1e-3));
  if (deg) return { status: "incorrect", message: L({ en: "That's the complementary angle — check which angle you measured (with the projection, not the normal).", vi: "Đó là góc phụ — kiểm tra lại góc đã chọn (góc với hình chiếu, không phải với pháp tuyến)." }) };
  return { status: "incorrect", message: L({ en: "Not quite. Check the formula and the lengths you used.", vi: "Chưa đúng. Kiểm tra lại công thức và các độ dài đã dùng." }) };
}
