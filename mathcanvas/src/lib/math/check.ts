import { L } from "./lang";
import { analyzeRational, isRationalEquation } from "./fractions";
import { answerText, evaluateSidesFloat, normalizeInput, parseAnswerValues, splitRelation, float } from "./polynomial";
import {
  type Interval,
  type SolutionSet,
  ALL,
  NONE,
  contains,
  describeSet,
  isSubset,
  normalizeSet,
  setsEqual,
} from "./sets";
import { solutionSetOf } from "./solutionset";
import { analyzeSystem, solveSystem, splitSystem } from "./system";
import { checkAgainst, checkGeometryAnswer } from "./geometry/check";
import { isGeometry } from "./geometry/parse";
import { type GeoSolution, analyzeGeometry } from "./geometry/solve";
import { analyzeMeasure, checkAgainstMeasure, checkMeasureAnswer, isMeasure } from "./measure";
import { type ConicAnswer, analyzeConic, checkAgainstConic, checkConicAnswer, isConic } from "./conic";
import { type VectorSolution, analyzeVector, checkAgainstVector, checkVectorAnswer, isVectorProblem } from "./vector";
import type { MeasureAnswer } from "./measure/num";

export type LineStatus = "start" | "passed" | "failed" | "unverified";

export type LineCheck = {
  index: number;
  input: string;
  status: LineStatus;
  message: string;
};

/** Two half-lines with the same boundary pointing opposite ways? */
function looksFlipped(a: SolutionSet, b: SolutionSet): boolean {
  if (a.length !== 1 || b.length !== 1) return false;
  const [x, y] = [a[0], b[0]];
  const bx = x.lo === -Infinity ? x.hi : x.hi === Infinity ? x.lo : null;
  const by = y.lo === -Infinity ? y.hi : y.hi === Infinity ? y.lo : null;
  if (bx === null || by === null || Math.abs(bx - by) > 1e-9) return false;
  return (x.lo === -Infinity) !== (y.lo === -Infinity);
}

/**
 * Walk the learner's lines top to bottom and flag the first move that
 * changes the solution set. Equivalence = same real solutions, which is
 * exactly what a valid algebra step must preserve.
 */
export function checkWork(lines: string[]): LineCheck[] {
  const out: LineCheck[] = [];
  let prev: { set: SolutionSet; variable: string } | null = null;
  let restarted = false;
  // A geometry problem: the lines under it are compared with its answers.
  let geo: GeoSolution | null = null;
  // A triangle or solid: the lines under it are compared with its answers too.
  let measure: MeasureAnswer[] | null = null;
  // A conic: the same.
  let conic: ConicAnswer[] | null = null;
  let vec: VectorSolution | null = null;

  lines.forEach((input, index) => {
    if (isVectorProblem(input) && !vec && !conic && !measure && !geo) {
      const r = analyzeVector(input);
      prev = null;
      if ("ok" in r) {
        out.push({ index, input, status: "unverified", message: L({ en: `I can't check this problem yet. ${r.message}`, vi: `Chưa kiểm tra được bài này. ${r.message}` }) });
        return;
      }
      vec = r;
      out.push({ index, input, status: "start", message: L({ en: "I'll compare your lines below with this problem's answers.", vi: "Mình sẽ so các dòng bên dưới với đáp số của bài." }) });
      return;
    }
    if (vec) {
      const r = checkAgainstVector(vec, input);
      out.push(
        r.status === "correct"
          ? { index, input, status: "passed", message: L({ en: "Matches an answer to the problem.", vi: "Khớp với một đáp số của bài." }) }
          : { index, input, status: "unverified", message: L({ en: "This isn't one of the final answers; in-between lines can't be checked yet.", vi: "Dòng này không phải đáp số cuối; chưa kiểm tra được các dòng trung gian." }) },
      );
      return;
    }
    if (isConic(input) && !conic && !measure && !geo) {
      const r = analyzeConic(input);
      prev = null;
      if ("ok" in r) {
        out.push({ index, input, status: "unverified", message: L({ en: `I can't check this problem yet. ${r.message}`, vi: `Chưa kiểm tra được bài này. ${r.message}` }) });
        return;
      }
      conic = r.answers;
      out.push({ index, input, status: "start", message: L({ en: "I'll compare your lines below with this problem's answers.", vi: "Mình sẽ so các dòng bên dưới với đáp số của bài." }) });
      return;
    }
    if (conic) {
      const r = checkAgainstConic(conic, input);
      out.push(
        r.status === "correct"
          ? { index, input, status: "passed", message: L({ en: "Matches an answer to the problem.", vi: "Khớp với một đáp số của bài." }) }
          : { index, input, status: "unverified", message: L({ en: "This isn't one of the final answers; in-between lines can't be checked yet.", vi: "Dòng này không phải đáp số cuối; chưa kiểm tra được các dòng trung gian." }) },
      );
      return;
    }
    if (isMeasure(input) && !measure && !geo) {
      const r = analyzeMeasure(input);
      prev = null;
      if ("ok" in r) {
        out.push({ index, input, status: "unverified", message: L({ en: `I can't check this problem yet. ${r.message}`, vi: `Chưa kiểm tra được bài này. ${r.message}` }) });
        return;
      }
      measure = r.answers;
      out.push({ index, input, status: "start", message: L({ en: "I'll compare your lines below with this problem's answers.", vi: "Mình sẽ so các dòng bên dưới với đáp số của bài." }) });
      return;
    }
    if (measure) {
      const r = checkAgainstMeasure(measure, input);
      out.push(
        r.status === "correct"
          ? { index, input, status: "passed", message: L({ en: "Matches an answer to the problem.", vi: "Khớp với một đáp số của bài." }) }
          : { index, input, status: "unverified", message: L({ en: "This isn't one of the final answers; in-between lines can't be checked yet.", vi: "Dòng này không phải đáp số cuối; chưa kiểm tra được các dòng trung gian." }) },
      );
      return;
    }
    if (isGeometry(input) && !geo) {
      const g = analyzeGeometry(input);
      prev = null;
      if ("ok" in g) {
        out.push({ index, input, status: "unverified", message: L({ en: `I can't check this geometry problem yet. ${g.message}`, vi: `Chưa kiểm tra được bài hình học này. ${g.message}` }) });
        return;
      }
      geo = g;
      out.push({ index, input, status: "start", message: L({ en: "Geometry problem — I'll compare your lines below with its answers.", vi: "Bài hình học — mình sẽ so các dòng bên dưới với đáp số." }) });
      return;
    }
    if (geo) {
      const r = checkAgainst(geo, input);
      if (r.status === "correct") {
        out.push({ index, input, status: "passed", message: L({ en: `Matches an answer to the problem. ${r.message}`, vi: `Khớp với một đáp số của bài. ${r.message}` }) });
      } else {
        out.push({ index, input, status: "unverified", message: L({ en: "This isn't one of the final answers. I can't check in-between lines of a geometry problem yet.", vi: "Dòng này không phải đáp số cuối. Mình chưa kiểm tra được các dòng trung gian của bài hình học." }) });
      }
      return;
    }
    const res = solutionSetOf(input);
    if (!res.ok) {
      out.push({ index, input, status: "unverified", message: `I can't check this line yet. ${res.message}` });
      prev = null;
      restarted = true;
      return;
    }
    const { set, variable: v } = res;
    if (!prev) {
      out.push({
        index,
        input,
        status: "start",
        message: L({
          en: `${restarted ? "Fresh start (the line before couldn't be checked)" : "Starting point"} — solutions: ${describeSet(set, v)}.`,
          vi: `${restarted ? "Bắt đầu lại (dòng trước không kiểm tra được)" : "Đề bài"} — tập nghiệm: ${describeSet(set, v)}.`,
        }),
      });
      restarted = false;
    } else if (prev.variable !== v) {
      out.push({ index, input, status: "unverified", message: L({ en: `The unknown changed from ${prev.variable} to ${v}, so I can't compare.`, vi: `Ẩn đã đổi từ ${prev.variable} sang ${v}, nên không so sánh được.` }) });
    } else if (setsEqual(prev.set, set)) {
      out.push({ index, input, status: "passed", message: L({ en: "Valid step — same solutions as the line above.", vi: "Bước đúng — cùng tập nghiệm với dòng trên." }) });
    } else if (looksFlipped(prev.set, set)) {
      out.push({
        index,
        input,
        status: "failed",
        message: L({ en: `The inequality points the wrong way: the line above means ${describeSet(prev.set, v)}, this one means ${describeSet(set, v)}. When you multiply or divide both sides by a negative number, flip the sign.`, vi: `Bất phương trình bị ngược chiều: dòng trên là ${describeSet(prev.set, v)}, dòng này là ${describeSet(set, v)}. Khi nhân hoặc chia hai vế cho số âm, phải đổi chiều.` }),
      });
    } else if (isSubset(set, prev.set)) {
      out.push({
        index,
        input,
        status: "failed",
        message: L({ en: `A solution was lost. The line above has ${describeSet(prev.set, v)}, but this line only has ${describeSet(set, v)}. Common causes: a square root without ±, or dividing by something that can be 0.`, vi: `Bị mất nghiệm. Dòng trên có ${describeSet(prev.set, v)}, nhưng dòng này chỉ còn ${describeSet(set, v)}. Nguyên nhân thường gặp: khai căn mà quên ±, hoặc chia cho biểu thức có thể bằng 0.` }),
      });
    } else if (isSubset(prev.set, set)) {
      out.push({
        index,
        input,
        status: "failed",
        message: L({ en: `An extra solution appeared: ${describeSet(set, v)} vs ${describeSet(prev.set, v)} above. Squaring both sides, or multiplying by an expression containing ${v}, can do this — check against the original.`, vi: `Xuất hiện nghiệm thừa: ${describeSet(set, v)} so với ${describeSet(prev.set, v)} ở dòng trên. Bình phương hai vế hoặc nhân với biểu thức chứa ${v} có thể gây ra điều này — hãy thử lại với đề bài.` }),
      });
    } else {
      out.push({
        index,
        input,
        status: "failed",
        message: L({ en: `This line has different solutions (${describeSet(set, v)}) from the line above (${describeSet(prev.set, v)}). Re-check the operation you applied to both sides.`, vi: `Dòng này có tập nghiệm (${describeSet(set, v)}) khác dòng trên (${describeSet(prev.set, v)}). Hãy kiểm tra lại phép biến đổi ở hai vế.` }),
      });
    }
    prev = { set, variable: v };
  });
  return out;
}

export type AnswerCheck = {
  status: "correct" | "incomplete" | "incorrect" | "unreadable" | "unsupported";
  message: string;
};

const fmt = (n: number) => String(Number(n.toFixed(4)));

/* ───────────────────────── Parsing learner answers ───────────────────────── */

const NO_SOLUTION = /^(no (real )?(solutions?|roots?)|none|∅|\{\s*\})$/;
const ALL_REALS = /^(all (real )?(numbers|x|values)|every (real )?number|r|ℝ|\(-inf(inity)?,\s*inf(inity)?\))$/;

function parseEnd(s: string): number | null {
  const t = s.trim().replace(/∞/g, "inf");
  if (/^-\s*inf(inity)?$/.test(t)) return -Infinity;
  if (/^\+?inf(inity)?$/.test(t)) return Infinity;
  try {
    const n = Number(float.evaluate(t));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** "x < 3", "x <= -2 or x > 5", "(-inf, 3]", "[1, 4) U (5, inf)". */
function parseSetAnswer(raw: string): SolutionSet | null {
  const text = answerText(raw).replace(/\s*(∪|\bu\b)\s*/g, " or ");
  if (NO_SOLUTION.test(text)) return NONE;
  if (ALL_REALS.test(text)) return ALL;
  const parts = text.split(/\bor\b/).map((p) => p.trim()).filter(Boolean);
  const pieces: Interval[] = [];
  for (const p of parts) {
    const iv = p.match(/^([[(])\s*([^,]+),\s*([^\])]+)\s*([\])])$/);
    if (iv) {
      const lo = parseEnd(iv[2]);
      const hi = parseEnd(iv[3]);
      if (lo === null || hi === null) return null;
      pieces.push({ lo, hi, loClosed: iv[1] === "[", hiClosed: iv[4] === "]" });
      continue;
    }
    // compound a < x < b
    const comp = p.match(/^(.+?)(<=|<)\s*([a-z])\s*(<=|<)(.+)$/);
    if (comp) {
      const lo = parseEnd(comp[1]);
      const hi = parseEnd(comp[5]);
      if (lo === null || hi === null) return null;
      pieces.push({ lo, hi, loClosed: comp[2] === "<=", hiClosed: comp[4] === "<=" });
      continue;
    }
    const res = solutionSetOf(p);
    if (!res.ok) return null;
    pieces.push(...res.set);
  }
  return normalizeSet(pieces);
}

/** A point where the two sets disagree, for a concrete counterexample. */
function witness(a: SolutionSet, b: SolutionSet): number | null {
  const ends = [...a, ...b].flatMap((i) => [i.lo, i.hi]).filter(Number.isFinite).sort((x, y) => x - y);
  const cands = ends.length ? [ends[0] - 1, ends[ends.length - 1] + 1, ...ends] : [0];
  ends.forEach((e, k) => k && cands.push((ends[k - 1] + e) / 2));
  const nice = cands.map((c) => (Number.isInteger(c) ? c : Math.round(c * 2) / 2));
  for (const c of [...nice, ...cands]) if (contains(a, c) !== contains(b, c)) return c;
  return null;
}

/* ───────────────────────────── checkAnswer ───────────────────────────── */

function checkSystemAnswer(problem: string, answer: string): AnswerCheck {
  const sa = analyzeSystem(problem);
  if (!sa.ok) return { status: "unsupported", message: sa.message };
  const sol = solveSystem("check", sa);
  const text = answerText(answer);
  if (!sol.point) {
    const none = sol.steps.some((s) => s.kind === "no-solution");
    if (NO_SOLUTION.test(text)) return none ? { status: "correct", message: L({ en: "Correct — the equations contradict each other.", vi: "Đúng — các phương trình mâu thuẫn nhau." }) } : { status: "incorrect", message: L({ en: "Not quite: there are infinitely many solutions (the equations describe the same thing).", vi: "Chưa đúng: hệ có vô số nghiệm (các phương trình cùng mô tả một điều)." }) };
    if (/infinite|many/.test(text)) return none ? { status: "incorrect", message: L({ en: "Not quite: the equations contradict each other, so there's no solution.", vi: "Chưa đúng: các phương trình mâu thuẫn nhau nên hệ vô nghiệm." }) } : { status: "correct", message: L({ en: "Correct — infinitely many solutions.", vi: "Đúng — hệ có vô số nghiệm." }) };
    return {
      status: "incorrect",
      message: none
        ? L({ en: "This system has no solution.", vi: "Hệ này vô nghiệm." })
        : L({ en: "This system has infinitely many solutions.", vi: "Hệ này có vô số nghiệm." }),
    };
  }
  const vars = sa.variables;
  const given = new Map<string, number>();
  const tuple = text.match(/^\(([^)]*)\)$/);
  if (tuple) {
    const vals = tuple[1].split(",").map((s) => parseEnd(s));
    if (vals.length !== vars.length || vals.some((x) => x === null)) return { status: "unreadable", message: L({ en: `Write it like (${vars.map(() => "…").join(", ")}) or ${vars.map((v) => `${v} = …`).join(", ")}.`, vi: `Viết dạng (${vars.map(() => "…").join(", ")}) hoặc ${vars.map((v) => `${v} = …`).join(", ")}.` }) };
    vars.forEach((v, i) => given.set(v, vals[i]!));
  } else {
    for (const part of text.split(/,|;|\band\b/)) {
      const m = part.trim().match(/^([a-z])\s*=\s*(.+)$/);
      if (!m) continue;
      const val = parseEnd(m[2]);
      if (val === null) return { status: "unreadable", message: L({ en: `I couldn't read the value for ${m[1]}.`, vi: `Không đọc được giá trị của ${m[1]}.` }) };
      given.set(m[1], val);
    }
  }
  if (given.size === 0) return { status: "unreadable", message: L({ en: `Write it like ${vars.map((v) => `${v} = …`).join(", ")}.`, vi: `Viết dạng ${vars.map((v) => `${v} = …`).join(", ")}.` }) };
  const wrong = vars.filter((v, i) => given.has(v) && Math.abs(given.get(v)! - sol.point![i]) > 1e-6);
  if (wrong.length) {
    return { status: "incorrect", message: L({ en: `${wrong.map((v) => `${v} = ${fmt(given.get(v)!)}`).join(", ")} doesn't work. Substitute your values into each equation to see which one fails.`, vi: `${wrong.map((v) => `${v} = ${fmt(given.get(v)!)}`).join(", ")} chưa đúng. Thế các giá trị vào từng phương trình để xem phương trình nào không thỏa mãn.` }) };
  }
  const missing = vars.filter((v) => !given.has(v));
  if (missing.length) return { status: "incomplete", message: L({ en: `Right so far — now find ${missing.join(" and ")}.`, vi: `Đúng rồi — giờ tìm tiếp ${missing.join(" và ")}.` }) };
  return { status: "correct", message: L({ en: "Correct — those values satisfy every equation.", vi: "Đúng — các giá trị này thỏa mãn mọi phương trình." }) };
}

function checkInequalityAnswer(problem: string, answer: string, truth: SolutionSet, v: string): AnswerCheck {
  const given = parseSetAnswer(answer);
  if (!given) {
    return { status: "unreadable", message: `I couldn't read that. Try “${v} < 3”, “${v} ≤ −2 or ${v} > 5”, or interval notation like (−∞, 3).` };
  }
  if (setsEqual(given, truth)) return { status: "correct", message: `Correct — ${describeSet(truth, v)}.` };
  if (looksFlipped(given, truth)) {
    return { status: "incorrect", message: L({ en: "Your boundary is right, but the inequality points the wrong way. Did you divide by a negative number without flipping the sign?", vi: "Điểm biên đúng, nhưng bất phương trình bị ngược chiều. Bạn có chia cho số âm mà quên đổi chiều không?" }) };
  }
  const same = (a: number, b: number) => a === b || Math.abs(a - b) < 1e-9;
  const sameEnds = given.length === truth.length && given.every((g, i) => same(g.lo, truth[i].lo) && same(g.hi, truth[i].hi));
  if (sameEnds) {
    return { status: "incorrect", message: L({ en: "Very close — the boundary values are right, but check whether each endpoint is included (< versus ≤, round versus square bracket).", vi: "Rất gần rồi — điểm biên đúng, nhưng hãy xem mỗi đầu mút có thuộc tập nghiệm không (< hay ≤, ngoặc tròn hay ngoặc vuông)." }) };
  }
  const w = witness(given, truth);
  if (w !== null) {
    const rel = splitRelation(problem);
    const s = rel.ok ? evaluateSidesFloat({ variable: v, lhs: rel.lhs, rhs: rel.rhs }, w) : null;
    const where = s ? L({ en: ` (left side ${fmt(s.lhs)}, right side ${fmt(s.rhs)})`, vi: ` (vế trái ${fmt(s.lhs)}, vế phải ${fmt(s.rhs)})` }) : "";
    return contains(given, w)
      ? { status: "incorrect", message: L({ en: `${v} = ${fmt(w)} is in your answer, but it doesn't satisfy the inequality${where}.`, vi: `${v} = ${fmt(w)} có trong đáp số của bạn nhưng không thỏa mãn bất phương trình${where}.` }) }
      : { status: "incorrect", message: L({ en: `${v} = ${fmt(w)} satisfies the inequality${where}, but your answer leaves it out.`, vi: `${v} = ${fmt(w)} thỏa mãn bất phương trình${where}, nhưng đáp số của bạn bỏ sót nó.` }) };
  }
  return { status: "incorrect", message: L({ en: "That isn't the same set of solutions. Try testing a point in each region.", vi: "Tập nghiệm chưa đúng. Hãy thử một điểm trong mỗi khoảng." }) };
}

/** Check a final answer against the problem by exact/numeric substitution. */
export function checkAnswer(problem: string, answer: string): AnswerCheck {
  if (isConic(problem)) return checkConicAnswer(problem, answer);
  if (isVectorProblem(problem)) return checkVectorAnswer(problem, answer);
  if (isMeasure(problem)) return checkMeasureAnswer(problem, answer);
  if (isGeometry(problem)) return checkGeometryAnswer(problem, answer);
  if (splitSystem(problem)) return checkSystemAnswer(problem, answer);

  const res = solutionSetOf(problem);
  if (!res.ok) return { status: "unsupported", message: res.message };
  const { set: truth, variable: v } = res;
  if (res.inequality) return checkInequalityAnswer(problem, answer, truth, v);

  const given = parseAnswerValues(answer);
  const allReals = ALL_REALS.test(normalizeInput(answer).toLowerCase());
  const truthIsAll = truth.length >= 1 && truth[0].lo === -Infinity;
  if (allReals) {
    return truthIsAll
      ? { status: "correct", message: L({ en: "Correct — every allowed value works.", vi: "Đúng — mọi giá trị thỏa mãn điều kiện đều là nghiệm." }) }
      : { status: "incorrect", message: L({ en: "Not every number works here. Try substituting one.", vi: "Không phải số nào cũng là nghiệm. Hãy thử thế một số." }) };
  }
  if (given === null) {
    return { status: "unreadable", message: L({ en: "I couldn't read that. Try “x = 2” or “2, 3” — fractions like 1/2 are fine.", vi: "Không đọc được đáp số. Hãy viết “x = 2” hoặc “2, 3” — có thể dùng phân số như 1/2." }) };
  }
  if (given === "none") {
    return truth.length === 0
      ? { status: "correct", message: L({ en: "Correct — there are no solutions.", vi: "Đúng — phương trình vô nghiệm." }) }
      : { status: "incorrect", message: L({ en: "There actually is at least one solution. Try substituting a value.", vi: "Thực ra có ít nhất một nghiệm. Hãy thử thế một giá trị." }) };
  }
  const restricted = isRationalEquation(problem) ? analyzeRational(problem) : null;
  const extraneous =
    restricted?.ok && given.find((g) => restricted.restrictions.some((r) => Math.abs(r.value - g) < 1e-9));
  if (extraneous !== undefined && extraneous !== false && extraneous !== null) {
    return {
      status: "incorrect",
      message: L({
        en: `${v} = ${fmt(extraneous)} makes a denominator 0, so it's an extraneous solution — it has to be rejected.`,
        vi: `${v} = ${fmt(extraneous)} làm mẫu bằng 0, nên là nghiệm ngoại lai — phải loại.`,
      }),
    };
  }
  if (truth.length === 0) {
    return { status: "incorrect", message: L({ en: "This equation has no solutions.", vi: "Phương trình này vô nghiệm." }) };
  }
  if (truthIsAll) {
    return { status: "incorrect", message: L({ en: "Every allowed value works here — the sides are identical after simplifying.", vi: "Mọi giá trị thỏa mãn điều kiện đều là nghiệm — hai vế giống hệt nhau sau khi rút gọn." }) };
  }

  const roots = truth.map((i) => i.lo);
  const wrong = given.filter((g) => !roots.some((t) => Math.abs(t - g) < 1e-6));
  if (wrong.length) {
    const g = wrong[0];
    const rel = splitRelation(problem);
    const s = rel.ok ? evaluateSidesFloat({ variable: v, lhs: rel.lhs, rhs: rel.rhs }, g) : null;
    return {
      status: "incorrect",
      message: s && Number.isFinite(s.lhs) && Number.isFinite(s.rhs)
        ? L({
            en: `${v} = ${fmt(g)} doesn't work: the left side is ${fmt(s.lhs)} but the right side is ${fmt(s.rhs)}.`,
            vi: `${v} = ${fmt(g)} không phải nghiệm: vế trái bằng ${fmt(s.lhs)} nhưng vế phải bằng ${fmt(s.rhs)}.`,
          })
        : L({ en: `${v} = ${fmt(g)} doesn't work.`, vi: `${v} = ${fmt(g)} không phải nghiệm.` }),
    };
  }
  const found = roots.filter((t) => given.some((g) => Math.abs(t - g) < 1e-6));
  if (found.length < roots.length) {
    return {
      status: "incomplete",
      message: L({ en: `Good — that one is right. But there ${roots.length - found.length === 1 ? "is another solution" : "are more solutions"}. Did you consider both factors?`, vi: `Tốt — nghiệm đó đúng. Nhưng phương trình còn ${roots.length - found.length === 1 ? "một nghiệm nữa" : "nghiệm khác"}. Bạn đã xét cả hai nhân tử chưa?` }),
    };
  }
  return { status: "correct", message: L({ en: "Correct — and you found every solution.", vi: "Đúng — và bạn đã tìm đủ các nghiệm." }) };
}
