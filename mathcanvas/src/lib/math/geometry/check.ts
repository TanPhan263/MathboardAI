import type { AnswerCheck } from "../check";
import { L } from "../lang";
import { float, normalizeInput } from "../polynomial";
import { toNumber } from "../rational";
import { toNum } from "../surd";
import { type GeoObject, parseGeometry } from "./parse";
import { type GeoAnswer, type GeoSolution, type Relation, analyzeGeometry } from "./solve";
import { toNums } from "./vec";

const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** A number as a learner writes it: 2√3, 2sqrt(3), |−3|/3, 3,46, 1/3, “d = 1”, “30°”. */
function readNumber(raw: string): number | null {
  const s = normalizeInput(raw)
    .replace(/^.*=/, "")
    .replace(/°|độ|degrees?|deg/giu, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    // √3 arrives as “sqrt3”: give it brackets. |x| is abs(x).
    .replace(/sqrt\s*(\d+(?:\.\d+)?)/g, "sqrt($1)")
    .replace(/\|([^|]+)\|/g, "abs($1)")
    .trim();
  if (!s) return null;
  try {
    const n = Number(float.evaluate(s));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Split at a separator outside brackets: “1 + sqrt(2); 3” → ["1 + sqrt(2)", "3"]. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Every outermost bracketed tuple in the answer: “H(1; 2; 3)” → [[1, 2, 3]]. */
function readTuples(raw: string): number[][] | null {
  const s = normalizeInput(raw);
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" && depth++ === 0) start = i + 1;
    if (s[i] === ")" && --depth === 0) groups.push(s.slice(start, i));
  }
  if (!groups.length) return null;
  const out: number[][] = [];
  for (const g of groups) {
    const parts = g.includes(";") ? splitTop(g, ";").map((p) => p.replace(/(\d),(\d)/g, "$1.$2")) : splitTop(g, ",");
    const nums = parts.map((p) => readNumber(p));
    if (nums.some((n) => n === null)) return null;
    out.push(nums as number[]);
  }
  return out;
}

/** The equation part of “(P): 2x − y + 2z − 3 = 0”, read as the object it describes. */
function readObject(raw: string, dim: 2 | 3, kind: "plane" | "line" | "round"): GeoObject | null {
  const eq = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  const name = kind === "plane" ? "(X)" : kind === "line" ? "d" : dim === 3 ? "(S)" : "(C)";
  const cue = kind === "plane" ? "mặt phẳng" : kind === "line" ? "đường thẳng" : dim === 3 ? "mặt cầu" : "đường tròn";
  const parsed = parseGeometry(`${dim === 3 ? "Oxyz" : "Oxy"}. ${cue} ${name}: ${eq}`);
  if ("ok" in parsed) return null;
  return [...parsed.objects.values()][0] ?? null;
}

const RELATION_WORDS: Record<Relation, RegExp> = {
  "planes-parallel": /song song|parallel/u,
  "planes-same": /trùng|coincid|same/u,
  "planes-cross": /cắt|intersect|cross|meet/u,
  "planes-perpendicular": /vuông góc|perpendicular/u,
  "line-in-plane": /nằm trong|thuộc|lies in|contained|in the plane/u,
  "line-parallel-plane": /song song|parallel/u,
  "line-cross-plane": /cắt|intersect|cross|meet/u,
  "line-perpendicular-plane": /vuông góc|perpendicular/u,
  "lines-same": /trùng|coincid|same/u,
  "lines-parallel": /song song|parallel/u,
  "lines-cross": /cắt|intersect|cross|meet/u,
  "lines-perpendicular": /vuông góc|perpendicular/u,
  "lines-skew": /chéo|skew/u,
  apart: /không (có điểm chung|cắt|giao)|rời|no common|apart|do not (meet|intersect)|don't (meet|intersect)/u,
  tangent: /tiếp xúc|tangent|touch/u,
  secant: /cắt|intersect|cross|secant/u,
  inside: /bên trong|nằm trong|inside/u,
  on: /thuộc|nằm trên|lies on|on the/u,
  outside: /bên ngoài|nằm ngoài|outside/u,
};

const NONE = /không có|không cắt|vô nghiệm|∅|\bnone\b|no (common|intersection|point)|do not (meet|intersect)|don't (meet|intersect)/u;

const right = (en: string, vi: string): AnswerCheck => ({ status: "correct", message: L({ en, vi }) });
const wrong = (en: string, vi: string): AnswerCheck => ({ status: "incorrect", message: L({ en, vi }) });
const unread = (en: string, vi: string): AnswerCheck => ({ status: "unreadable", message: L({ en, vi }) });

/** Compare one learner answer with one expected result. */
export function compareGeo(expected: GeoAnswer, dim: 2 | 3, raw: string): AnswerCheck {
  const text = raw.normalize("NFC").toLowerCase();
  switch (expected.kind) {
    case "number": {
      const n = readNumber(raw);
      if (n === null) return unread("Write a number, e.g. 3, 2√3 or 5/3.", "Hãy viết một số, ví dụ 3, 2√3 hoặc 5/3.");
      const tol = expected.degrees ? 1e-3 : 1e-6;
      if (close(n, expected.approx, tol)) return right("Correct.", "Đúng.");
      if (expected.degrees && close(n, 180 - expected.approx, tol)) {
        return wrong("That's the supplement. Angles between lines and planes are between 0° and 90° — take the absolute value of the dot product.", "Đó là góc bù. Góc giữa đường thẳng/mặt phẳng nằm trong khoảng 0° đến 90° — lấy trị tuyệt đối của tích vô hướng.");
      }
      if (close(n * n, expected.approx, 1e-6)) return wrong("Close — that looks like the square root of the answer. Did you take a root you didn't need?", "Gần đúng — đó là căn của đáp số. Bạn có lấy căn thừa không?");
      if (close(n, expected.approx * expected.approx, 1e-6)) return wrong("Close — that's the square of the answer. Did you forget the square root?", "Gần đúng — đó là bình phương đáp số. Bạn quên lấy căn à?");
      return wrong(`Not quite: ${Number(n.toFixed(4))} isn't right. Check the formula and the substitution.`, `Chưa đúng: ${Number(n.toFixed(4))} không phải đáp số. Kiểm tra lại công thức và phép thay số.`);
    }
    case "point":
    case "vector": {
      const tuples = readTuples(raw);
      if (!tuples) return unread(`Write the coordinates, e.g. (1; 2${dim === 3 ? "; 3" : ""}).`, `Hãy viết tọa độ, ví dụ (1; 2${dim === 3 ? "; 3" : ""}).`);
      const want = expected.coords.map(toNum);
      const got = tuples[tuples.length - 1];
      if (got.length !== want.length) return unread(`It needs ${want.length} coordinates.`, `Cần ${want.length} tọa độ.`);
      const bad = want.map((w, i) => (close(w, got[i]) ? null : i)).filter((i): i is number => i !== null);
      if (!bad.length) return right("Correct.", "Đúng.");
      if (want.every((w, i) => close(-w, got[i]))) return wrong("The signs are flipped — check the order of subtraction (end minus start).", "Ngược dấu — kiểm tra thứ tự phép trừ (điểm cuối trừ điểm đầu).");
      const axes = bad.map((i) => "xyz"[i]).join(", ");
      return wrong(`Not quite: the ${axes}-coordinate${bad.length > 1 ? "s are" : " is"} off.`, `Chưa đúng: tọa độ ${axes} chưa đúng.`);
    }
    case "points": {
      const tuples = readTuples(raw);
      if (!tuples) return unread("Write each point's coordinates, e.g. (1; 2) and (3; 4).", "Viết tọa độ từng điểm, ví dụ (1; 2) và (3; 4).");
      const want = expected.list.map((p) => p.map(toNum));
      const found = want.filter((w) => tuples.some((t) => t.length === w.length && w.every((x, i) => close(x, t[i]))));
      const extra = tuples.filter((t) => !want.some((w) => t.length === w.length && w.every((x, i) => close(x, t[i]))));
      if (found.length === want.length && !extra.length) return right("Correct — both points.", "Đúng — đủ cả hai điểm.");
      if (found.length && !extra.length) return { status: "incomplete", message: L({ en: "Right so far — there's another common point.", vi: "Đúng rồi — nhưng còn một điểm chung nữa." }) };
      return wrong("Not quite. Substitute the line into the equation and solve the quadratic in t.", "Chưa đúng. Thay phương trình đường thẳng vào rồi giải phương trình bậc hai ẩn t.");
    }
    case "plane": {
      const o = readObject(raw, dim, "plane");
      if (!o || o.kind !== "plane") return unread("Write the plane as ax + by + cz + d = 0.", "Viết mặt phẳng dạng ax + by + cz + d = 0.");
      const a = [...toNums(expected.n), toNumber(expected.d)];
      const b = [...toNums(o.n), toNumber(o.d)];
      const k = b[a.findIndex((x) => Math.abs(x) > 1e-12)] / a[a.findIndex((x) => Math.abs(x) > 1e-12)];
      if (a.every((x, i) => close(x * k, b[i]))) return right("Correct — that's the same plane.", "Đúng — đó chính là mặt phẳng cần tìm.");
      if (a.slice(0, 3).every((x, i) => close(x * k, b[i]))) return wrong("The normal vector is right, but the constant term isn't: put the given point in to find d.", "Vectơ pháp tuyến đúng, nhưng hệ số tự do sai: thay điểm đã cho vào để tìm d.");
      return wrong("Not quite. Check the normal vector first.", "Chưa đúng. Kiểm tra lại vectơ pháp tuyến trước.");
    }
    case "line": {
      const o = readObject(raw, dim, "line");
      if (!o || o.kind !== "line") {
        return unread(
          dim === 3 ? "Write the line like x = 1 + 2t, y = 2 − t, z = 3t, or (x − 1)/2 = (y − 2)/(−1) = z/3." : "Write the line like 2x − y + 3 = 0, or x = 1 + 2t, y = 2 − t.",
          dim === 3 ? "Viết đường thẳng dạng x = 1 + 2t, y = 2 − t, z = 3t, hoặc (x − 1)/2 = (y − 2)/(−1) = z/3." : "Viết đường thẳng dạng 2x − y + 3 = 0, hoặc x = 1 + 2t, y = 2 − t.",
        );
      }
      const u = toNums(expected.u);
      const v = toNums(o.u);
      const k = v[u.findIndex((x) => Math.abs(x) > 1e-12)] / u[u.findIndex((x) => Math.abs(x) > 1e-12)];
      const parallel = u.every((x, i) => close(x * k, v[i]));
      if (!parallel) return wrong("The direction isn't right. Which vector should the line follow?", "Phương chưa đúng. Đường thẳng phải nhận vectơ nào làm vectơ chỉ phương?");
      // Same line when the difference of the two base points is along u.
      const w = toNums(o.p).map((x, i) => x - toNumber(expected.p[i]));
      const t = w[u.findIndex((x) => Math.abs(x) > 1e-12)] / u[u.findIndex((x) => Math.abs(x) > 1e-12)];
      if (w.every((x, i) => close(x, t * u[i], 1e-9))) return right("Correct — that's the same line.", "Đúng — đó chính là đường thẳng cần tìm.");
      return wrong("The direction is right, but the line doesn't pass through the right point.", "Phương đúng, nhưng đường thẳng không đi qua đúng điểm.");
    }
    case "round": {
      const o = readObject(raw, dim, "round");
      if (!o || (o.kind !== "circle" && o.kind !== "sphere")) return unread("Write it as (x − a)² + (y − b)²… = R².", "Viết dạng (x − a)² + (y − b)²… = R².");
      const sameC = toNums(o.c).every((x, i) => close(x, toNumber(expected.c[i])));
      const sameR = close(toNumber(o.r2), toNumber(expected.r2));
      if (sameC && sameR) return right("Correct.", "Đúng.");
      // Writing R where R² belongs: the right-hand side equals √(expected R²).
      if (sameC) return close(toNumber(o.r2), Math.sqrt(toNumber(expected.r2))) ? wrong("The centre is right; on the right-hand side write R², not R.", "Tâm đúng; vế phải phải là R², không phải R.") : wrong("The centre is right, but the radius isn't.", "Tâm đúng, nhưng bán kính chưa đúng.");
      if (sameR) return wrong("The radius is right, but the centre isn't. Remember (x − a)² has centre a, not −a.", "Bán kính đúng, nhưng tâm chưa đúng. Nhớ rằng (x − a)² ứng với tâm a, không phải −a.");
      return wrong("Not quite. Find the centre and the radius first.", "Chưa đúng. Tìm tâm và bán kính trước.");
    }
    case "relation": {
      if (RELATION_WORDS[expected.relation].test(text)) return right("Correct.", "Đúng.");
      const said = (Object.keys(RELATION_WORDS) as Relation[]).find((r) => RELATION_WORDS[r].test(text));
      if (!said) return unread("Say how they sit: parallel, intersecting, skew, tangent…", "Hãy nêu vị trí: song song, cắt nhau, chéo nhau, tiếp xúc…");
      return wrong("Not quite. Compare the direction/normal vectors first, then test a point.", "Chưa đúng. So sánh vectơ chỉ phương/pháp tuyến trước, rồi thử một điểm.");
    }
    case "none":
      return NONE.test(text) ? right("Correct — there's no common point.", "Đúng — không có điểm chung.") : wrong("There's actually no common point here.", "Thực ra ở đây không có điểm chung.");
  }
}

/** Check a final answer to a geometry problem (any of its questions). */
export function checkGeometryAnswer(problem: string, answer: string): AnswerCheck {
  const g = analyzeGeometry(problem);
  if ("ok" in g) return { status: "unsupported", message: g.message };
  return checkAgainst(g, answer);
}

export function checkAgainst(g: GeoSolution, answer: string): AnswerCheck {
  const results = g.answers.map((a) => compareGeo(a.answer, g.dim, answer));
  return results.find((r) => r.status === "correct") ?? results.find((r) => r.status === "incomplete") ?? results.find((r) => r.status === "incorrect") ?? results[0];
}
