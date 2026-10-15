import { L } from "./lang";
import { type Analysis, type RelOp, OP_TEX, evaluateSidesFloat, relationTex } from "./polynomial";
import { polyAscii, polyLatex, ratAscii, ratLatex } from "./latex";
import { type Rat, div, isZero, lcm, mul, neg, rat } from "./rational";
import { type SolutionSet, setLatex, setsEqual } from "./sets";
import { boundariesOf, holds, signAnalysis } from "./signs";
import { solutionSetOf } from "./solutionset";
import { type StepDraft, finalize, step } from "./steps";
import type { MathSolution, ValidationStatus } from "./types";

const FLIP: Record<RelOp, RelOp> = { "=": "=", "<": ">", ">": "<", "<=": ">=", ">=": "<=" };
/** Plain-text signs for explanations. */
const OP_TEXT: Record<RelOp, string> = { "=": "=", "<": "<", ">": ">", "<=": "≤", ">=": "≥" };

function checked(ref: SolutionSet, relation: string): ValidationStatus {
  const s = solutionSetOf(relation);
  if (!s.ok) return "unverified";
  return setsEqual(ref, s.set) ? "passed" : "failed";
}

const fmt = (n: number) => String(Number(n.toFixed(3)));

/** Test one point per region in the ORIGINAL inequality. */
function verifyRegions(an: Analysis, regions: Array<{ test: number; included: boolean }>): StepDraft {
  let status: ValidationStatus = "passed";
  const lines = regions.map(({ test, included }) => {
    const s = evaluateSidesFloat(an, test);
    const truth = holds(s.lhs - s.rhs, an.op);
    if (truth !== included) status = "failed";
    return `${an.variable}=${fmt(test)}:\\; ${fmt(s.lhs)} ${OP_TEX[an.op]} ${fmt(s.rhs)}\\;\\text{${truth ? L({ en: "true", vi: "đúng" }) : L({ en: "false", vi: "sai" })}}\\ ${truth === included ? "\\checkmark" : "\\times"}`;
  });
  return step("verify", {
    operation: L({ en: "Test a point in each region", vi: "Thử một điểm trong mỗi khoảng" }),
    latex: `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`,
    explanation:
      L({ en: "Pick one number from each region and plug it into the original inequality. It should be true exactly in the regions we kept.", vi: "Chọn một số trong mỗi khoảng và thay vào bất phương trình ban đầu. Nó phải đúng đúng ở những khoảng ta đã giữ lại." }),
    why: L({ en: "An inequality's truth can only change where the two sides are equal, so one test point speaks for its whole region.", vi: "Bất phương trình chỉ có thể đổi từ đúng sang sai tại chỗ hai vế bằng nhau, nên một điểm thử đại diện cho cả khoảng." }),
    hint: L({ en: "Choose an easy number in each region and check whether the original inequality is true there.", vi: "Chọn một số dễ tính trong mỗi khoảng và kiểm tra bất phương trình ban đầu có đúng ở đó không." }),
    validation: status,
  });
}

/* ───────────────────────────── Linear ───────────────────────────── */

function linearInequality(problemId: string, an: Analysis, ref: SolutionSet): MathSolution {
  const v = an.variable;
  const [c, b] = an.poly.coeffs;
  const op = an.op;
  const drafts: StepDraft[] = [];

  drafts.push(
    step("standard-form", {
      operation: L({ en: "Collect terms", vi: "Chuyển vế, thu gọn" }),
      latex: `${polyLatex([c, b], v)} ${OP_TEX[op]} 0`,
      validation: checked(ref, `${polyAscii([c, b], v)}${op}0`),
      explanation: L({ en: `Move everything to the left and combine like terms, exactly as with an equation.`, vi: `Chuyển mọi hạng tử sang vế trái và thu gọn, giống như với phương trình.` }),
      why: L({ en: "Adding or subtracting the same amount on both sides never changes which values make an inequality true.", vi: "Cộng hoặc trừ cùng một số ở hai vế không làm thay đổi tập nghiệm của bất phương trình." }),
      hint: L({ en: `Gather the ${v}-terms on one side and the numbers on the other.`, vi: `Gom các hạng tử chứa ${v} về một vế, các hằng số về vế kia.` }),
    }),
  );

  if (!isZero(c)) {
    const amount = ratLatex(c.n > 0 ? c : neg(c));
    drafts.push(
      step("isolate", {
        operation: L({ en: `${c.n > 0 ? "Subtract" : "Add"} ${amount}`, vi: `${c.n > 0 ? "Trừ" : "Cộng"} ${amount}` }),
        latex: `${polyLatex([rat(0), b], v)} ${OP_TEX[op]} ${ratLatex(neg(c))}`,
        validation: checked(ref, `${polyAscii([rat(0), b], v)}${op}${ratAscii(neg(c))}`),
        explanation: L({ en: `${c.n > 0 ? "Subtract" : "Add"} ${amount} on both sides to get the ${v}-term alone.`, vi: `${c.n > 0 ? `Trừ cả hai vế cho ${amount}` : `Cộng ${amount} vào cả hai vế`} để còn lại riêng hạng tử chứa ${v}.` }),
        why: L({ en: "Adding or subtracting keeps the inequality sign the same.", vi: "Cộng hoặc trừ hai vế thì giữ nguyên chiều bất phương trình." }),
        hint: L({ en: `Undo the number next to the ${v}-term — on both sides.`, vi: `Khử số đứng cạnh hạng tử chứa ${v} — ở cả hai vế.` }),
      }),
    );
  }

  const bound: Rat = div(neg(c), b);
  const finalOp = b.n < 0 ? FLIP[op] : op;
  if (!(b.n === 1 && b.d === 1)) {
    const negative = b.n < 0;
    drafts.push(
      step(negative ? "flip" : "divide", {
        operation: negative
          ? L({ en: `Divide by ${ratLatex(b)} and flip the sign`, vi: `Chia cho ${ratLatex(b)} và đổi chiều` })
          : L({ en: `Divide by ${ratLatex(b)}`, vi: `Chia cho ${ratLatex(b)}` }),
        latex: `${v} ${OP_TEX[finalOp]} ${ratLatex(bound)}`,
        validation: checked(ref, `${v}${finalOp}${ratAscii(bound)}`),
        explanation: negative
          ? L({ en: `Divide both sides by ${ratLatex(b)}. Because it's negative, the inequality sign flips: ${OP_TEXT[op]} becomes ${OP_TEXT[finalOp]}.`, vi: `Chia cả hai vế cho ${ratLatex(b)}. Vì đây là số âm nên phải đổi chiều bất phương trình: ${OP_TEXT[op]} thành ${OP_TEXT[finalOp]}.` })
          : L({ en: `Divide both sides by ${ratLatex(b)}. It's positive, so the sign stays the same.`, vi: `Chia cả hai vế cho ${ratLatex(b)}. Đây là số dương nên giữ nguyên chiều.` }),
        why: negative
          ? L({ en: "Multiplying or dividing by a negative number reverses order: 2 < 3 but −2 > −3. So the sign must flip.", vi: "Nhân hoặc chia cho số âm làm đảo thứ tự: 2 < 3 nhưng −2 > −3. Vì vậy phải đổi chiều." })
          : L({ en: "Dividing both sides by a positive number keeps the order of the two sides.", vi: "Chia hai vế cho một số dương thì giữ nguyên thứ tự hai vế." }),
        hint: negative
          ? L({ en: `You need to divide by a negative number. What happens to the inequality sign when you do that?`, vi: `Bạn cần chia cho một số âm. Khi đó chiều của bất phương trình thay đổi thế nào?` })
          : L({ en: `${v} is multiplied by a number. Divide it away — is that number positive or negative?`, vi: `${v} đang được nhân với một số. Hãy chia cho số đó — nó dương hay âm?` }),
      }),
    );
  }

  const analysis = signAnalysis(an.poly, op);
  const set = analysis.set;
  drafts.push(
    step("interval", {
      operation: L({ en: "Write the answer as an interval", vi: "Viết tập nghiệm dạng khoảng" }),
      latex: `${v} \\in ${setLatex(set)}`,
      explanation: L({ en: `Every ${v} that satisfies ${v} ${OP_TEXT[finalOp]} ${ratLatex(bound)} works. ${finalOp.length === 2 ? "The endpoint is included, so it gets a square bracket." : "The endpoint itself isn't included, so it gets a round bracket."}`, vi: `Mọi ${v} thỏa mãn ${v} ${OP_TEXT[finalOp]} ${ratLatex(bound)} đều là nghiệm. ${finalOp.length === 2 ? "Đầu mút thuộc tập nghiệm nên dùng ngoặc vuông." : "Đầu mút không thuộc tập nghiệm nên dùng ngoặc tròn."}` }),
      why: L({ en: "Interval notation lists where the solutions start and end; brackets say whether the endpoint itself counts.", vi: "Cách viết khoảng cho biết tập nghiệm bắt đầu và kết thúc ở đâu; loại ngoặc cho biết đầu mút có thuộc tập nghiệm không." }),
      hint: L({ en: "Is the endpoint part of the answer? That decides between ( and [.", vi: "Đầu mút có thuộc tập nghiệm không? Điều đó quyết định dùng ( hay [." }),
      validation: setsEqual(set, ref) ? "passed" : "failed",
    }),
  );
  drafts.push(verifyRegions(an, analysis.regions));

  const t = bound.n / bound.d;
  return {
    problemId,
    originalInput: relationTex(an.lhs, op, an.rhs),
    topic: "linear-inequality",
    variable: v,
    steps: finalize(problemId, drafts),
    finalAnswer: `${v} ${OP_TEX[finalOp]} ${ratLatex(bound)}`,
    roots: [t],
    confidenceNotes: [],
  };
}

/* ──────────────────────────── Quadratic ──────────────────────────── */

function quadraticInequality(problemId: string, an: Analysis, ref: SolutionSet): MathSolution {
  const v = an.variable;
  let op = an.op;
  let [c, b, a] = an.poly.coeffs;
  const drafts: StepDraft[] = [];

  drafts.push(
    step("standard-form", {
      operation: L({ en: "Standard form", vi: "Đưa về dạng tổng quát" }),
      latex: `${polyLatex([c, b, a], v)} ${OP_TEX[op]} 0`,
      validation: checked(ref, `${polyAscii([c, b, a], v)}${op}0`),
      explanation: L({ en: "Move everything to one side so you're comparing a single quadratic with 0.", vi: "Chuyển mọi hạng tử về một vế để so sánh một tam thức bậc hai với 0." }),
      why: L({ en: "Adding or subtracting the same thing on both sides keeps the inequality's solutions the same.", vi: "Cộng hoặc trừ cùng một biểu thức ở hai vế không làm thay đổi tập nghiệm." }),
      hint: L({ en: "Get 0 on one side. Then the question becomes: where is this quadratic positive or negative?", vi: "Đưa một vế về 0. Khi đó câu hỏi trở thành: tam thức này dương hay âm ở đâu?" }),
    }),
  );

  const den = [a, b, c].reduce((acc, r) => lcm(acc, r.d), 1);
  const m = den * (a.n < 0 ? -1 : 1);
  if (m !== 1) {
    const M = rat(m);
    a = mul(a, M);
    b = mul(b, M);
    c = mul(c, M);
    const flipped = m < 0;
    if (flipped) op = FLIP[op];
    drafts.push(
      step(flipped ? "flip" : "scale", {
        operation: flipped
          ? L({ en: `Multiply by ${m} and flip the sign`, vi: `Nhân với ${m} và đổi chiều` })
          : L({ en: `Multiply by ${m}`, vi: `Nhân với ${m}` }),
        latex: `${polyLatex([c, b, a], v)} ${OP_TEX[op]} 0`,
        validation: checked(ref, `${polyAscii([c, b, a], v)}${op}0`),
        explanation: flipped
          ? L({ en: `Multiply both sides by ${m} so the ${v}² term is positive with whole-number coefficients. Multiplying by a negative number flips the inequality sign.`, vi: `Nhân hai vế với ${m} để hệ số của ${v}² dương và các hệ số là số nguyên. Nhân với số âm thì phải đổi chiều bất phương trình.` })
          : L({ en: `Multiply both sides by ${m} to clear the fractions.`, vi: `Nhân hai vế với ${m} để khử mẫu.` }),
        why: flipped
          ? L({ en: "Multiplying by a negative number reverses the order of the two sides, so the sign must flip.", vi: "Nhân với số âm làm đảo thứ tự hai vế, nên phải đổi chiều." })
          : L({ en: "Multiplying by a positive number keeps the order of the two sides.", vi: "Nhân với số dương thì giữ nguyên thứ tự hai vế." }),
        hint: L({ en: "Make the leading coefficient a positive whole number. Watch the sign if you multiply by a negative!", vi: "Làm cho hệ số cao nhất là số nguyên dương. Cẩn thận đổi chiều nếu nhân với số âm!" }),
      }),
    );
  }

  const poly = { coeffs: [c, b, a] as [Rat, Rat, Rat], degree: 2 as const };
  const bounds = boundariesOf(poly);
  drafts.push(
    step("roots", {
      operation: L({ en: "Find the boundary points", vi: "Tìm nghiệm của tam thức" }),
      latex: bounds.length
        ? `${polyLatex([c, b, a], v)} = 0 \\;\\Rightarrow\\; ${bounds.map((p) => `${v} = ${p.tex}`).join(",\\; ")}`
        : `${polyLatex([c, b, a], v)} = 0\\;\\text{${L({ en: "has no real roots", vi: "vô nghiệm" })}}`,
      explanation: bounds.length
        ? L({ en: "Solve the matching equation. Its roots are the only places where the quadratic can change sign.", vi: "Giải phương trình tương ứng. Các nghiệm của nó là những chỗ duy nhất tam thức có thể đổi dấu." })
        : L({ en: "The quadratic is never 0, so it never changes sign — it's either always positive or always negative.", vi: "Tam thức không bao giờ bằng 0 nên không đổi dấu — luôn dương hoặc luôn âm." }),
      why: L({ en: "A polynomial is continuous, so to switch from positive to negative it has to pass through 0.", vi: "Đa thức liên tục, nên muốn đổi từ dương sang âm thì phải đi qua 0." }),
      hint: L({ en: "Replace the inequality sign with = and solve. Where are the boundaries?", vi: "Thay dấu bất phương trình bằng dấu = rồi giải. Các điểm biên ở đâu?" }),
    }),
  );

  const analysis = signAnalysis(poly, op);
  const rows = analysis.regions.map(
    (r) =>
      `${r.lo === -Infinity ? "(-\\infty" : `(${r.loTex}`},\\ ${r.hi === Infinity ? "\\infty)" : `${r.hiTex})`} & ${fmt(r.test)} & ${r.positive ? "+" : "-"} & ${r.included ? "\\checkmark" : "\\times"}`,
  );
  drafts.push(
    step("sign-chart", {
      operation: L({ en: "Sign chart", vi: "Bảng xét dấu" }),
      latex: `\\begin{array}{c|c|c|c}\\text{${L({ en: "region", vi: "khoảng" })}} & \\text{${L({ en: "test", vi: "thử" })} } ${v} & \\text{${L({ en: "sign", vi: "dấu" })}} & ${OP_TEX[op]}0?\\\\\\hline ${rows.join("\\\\")}\\end{array}`,
      explanation: L({ en: `Test one value in each region. Keep the regions where the quadratic is ${op.startsWith("<") ? "negative" : "positive"}${op.length === 2 ? ", plus the boundary points themselves" : ""}.`, vi: `Thử một giá trị trong mỗi khoảng. Giữ lại các khoảng tam thức ${op.startsWith("<") ? "âm" : "dương"}${op.length === 2 ? ", cùng với chính các điểm biên" : ""}.` }),
      why: L({ en: "Between two roots the sign can't change, so one test value tells you the sign for the whole region.", vi: "Giữa hai nghiệm, tam thức không đổi dấu, nên một giá trị thử cho biết dấu của cả khoảng." }),
      hint: L({ en: "Pick a number in each region and find the sign of the quadratic there.", vi: "Chọn một số trong mỗi khoảng và xét dấu tam thức tại đó." }),
    }),
  );

  drafts.push(
    step("interval", {
      operation: L({ en: "Write the answer", vi: "Kết luận tập nghiệm" }),
      latex: `${v} \\in ${setLatex(analysis.set)}`,
      explanation:
        analysis.set.length === 0
          ? L({ en: "No region works, so there are no solutions.", vi: "Không khoảng nào thỏa mãn, nên bất phương trình vô nghiệm." })
          : L({ en: `Combine the regions that work. ${op.length === 2 ? "Square brackets show the boundary points are included." : "Round brackets show the boundary points aren't included."}`, vi: `Hợp các khoảng thỏa mãn. ${op.length === 2 ? "Ngoặc vuông cho biết các điểm biên thuộc tập nghiệm." : "Ngoặc tròn cho biết các điểm biên không thuộc tập nghiệm."}` }),
      why: L({ en: "The answer is every value in the regions that passed the test.", vi: "Tập nghiệm gồm mọi giá trị trong các khoảng thỏa mãn." }),
      hint: L({ en: "Which regions got a tick? Write them in interval notation.", vi: "Những khoảng nào được đánh dấu ✓? Viết chúng dưới dạng khoảng." }),
      validation: setsEqual(analysis.set, ref) ? "passed" : "failed",
    }),
  );

  drafts.push(verifyRegions(an, analysis.regions.map((r) => ({ test: r.test, included: r.included }))));

  return {
    problemId,
    originalInput: relationTex(an.lhs, an.op, an.rhs),
    topic: "quadratic-inequality",
    variable: v,
    steps: finalize(problemId, drafts),
    finalAnswer: `${v} \\in ${setLatex(analysis.set)}`,
    roots: bounds.map((p) => p.value),
    confidenceNotes: bounds.some((p) => p.tex.includes("sqrt"))
      ? [L({ en: "Boundary points are irrational; the region tests use decimal approximations.", vi: "Các điểm biên là số vô tỉ; việc thử trong từng khoảng dùng giá trị thập phân gần đúng." })]
      : [],
  };
}

export function solveInequality(problemId: string, an: Analysis): MathSolution {
  const ref = solutionSetOf(`${an.lhs}${an.op}${an.rhs}`);
  const refSet = ref.ok ? ref.set : [];
  if (an.poly.degree === 2) return quadraticInequality(problemId, an, refSet);
  if (an.poly.degree === 1) return linearInequality(problemId, an, refSet);

  // Degenerate: the unknown cancels.
  const c = an.poly.coeffs[0];
  const truth = holds(c.n / c.d, an.op);
  return {
    problemId,
    originalInput: relationTex(an.lhs, an.op, an.rhs),
    topic: "linear-inequality",
    variable: an.variable,
    steps: finalize(problemId, [
      step(truth ? "identity" : "no-solution", {
        operation: L({ en: "Simplify", vi: "Rút gọn" }),
        latex: `${ratLatex(c)} ${OP_TEX[an.op]} 0\\;\\text{${truth ? L({ en: "is always true", vi: "luôn đúng" }) : L({ en: "is never true", vi: "không bao giờ đúng" })}}`,
        explanation: L({ en: `The ${an.variable}-terms cancel, leaving a statement that is ${truth ? "always true — every number works" : "never true — no number works"}.`, vi: `Các hạng tử chứa ${an.variable} triệt tiêu, còn lại một mệnh đề ${truth ? "luôn đúng — mọi số đều là nghiệm" : "luôn sai — không số nào là nghiệm"}.` }),
        why: L({ en: "With no unknown left, the statement doesn't depend on the value you choose.", vi: "Khi không còn ẩn, mệnh đề không phụ thuộc vào giá trị được chọn." }),
        hint: L({ en: `What's left once the ${an.variable}-terms cancel?`, vi: `Sau khi các hạng tử chứa ${an.variable} triệt tiêu, còn lại gì?` }),
      }),
    ]),
    finalAnswer: truth ? `\\text{${L({ en: "All real numbers", vi: "Mọi số thực" })}}` : `\\text{${L({ en: "No solution", vi: "Vô nghiệm" })}}`,
    roots: [],
    confidenceNotes: [],
  };
}
