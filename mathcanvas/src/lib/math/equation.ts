import { type RationalAnalysis, isRestricted, lcdLatex, restrictionLatex } from "./fractions";
import {
  type Analysis,
  type Poly,
  evaluateSides,
  evaluateSidesFloat,
  toTex,
} from "./polynomial";
import {
  linearFactorAscii,
  linearFactorLatex,
  polyAscii,
  polyLatex,
  ratAscii,
  ratLatex,
  ratParen,
} from "./latex";
import { type Rat, add, div, eq, isInt, isZero, lcm, mul, neg, rat, ratSqrt, sub, toNumber } from "./rational";
import { type SolutionSet, setsEqual } from "./sets";
import { integerPoly } from "./signs";
import { solutionSetOf } from "./solutionset";
import { type StepDraft, OR, dec, finalize, irrationalRootTex, step } from "./steps";
import type { MathSolution, ValidationStatus } from "./types";
import { L } from "./lang";

type Root = { exact: Rat | null; value: number };

/** Does `equation` have exactly the reference solution set? */
function checked(ref: SolutionSet, equation: string): ValidationStatus {
  const s = solutionSetOf(equation);
  if (!s.ok) return "unverified";
  return setsEqual(ref, s.set) ? "passed" : "failed";
}

type Source = Pick<Analysis, "variable" | "lhs" | "rhs">;

/** Substitute each root into the ORIGINAL equation. */
export function verifyRoots(original: Source, roots: Root[]): { draft: StepDraft; notes: string[] } {
  const v = original.variable;
  const notes: string[] = [];
  let status: ValidationStatus = "passed";
  const lines = roots.map((r) => {
    if (r.exact) {
      const sides = evaluateSides(original, r.exact);
      if (sides && eq(sides.lhs, sides.rhs)) {
        return `${v}=${ratLatex(r.exact)}:\\; ${ratLatex(sides.lhs)} = ${ratLatex(sides.rhs)}\\ \\checkmark`;
      }
      status = "failed";
      return `${v}=${ratLatex(r.exact)}:\\; \\text{${L({ en: "does not satisfy the equation", vi: "không thỏa mãn phương trình" })}}`;
    }
    const s = evaluateSidesFloat(original, r.value);
    const ok = Math.abs(s.lhs - s.rhs) < 1e-9 * Math.max(1, Math.abs(s.lhs));
    if (!ok) status = "failed";
    return `${v}\\approx ${dec(r.value)}:\\; ${dec(s.lhs)} \\approx ${dec(s.rhs)}${ok ? "\\ \\checkmark" : ""}`;
  });
  if (roots.some((r) => !r.exact)) {
    notes.push(
      L({
        en: "Irrational roots were verified numerically (|LHS − RHS| < 10⁻⁹), not symbolically.",
        vi: "Các nghiệm vô tỉ được kiểm tra bằng số (|VT − VP| < 10⁻⁹), không phải bằng biến đổi đại số.",
      }),
    );
  }
  return {
    notes,
    draft: step("verify", {
      operation: L({ en: "Check by substitution", vi: "Thử lại nghiệm" }),
      latex: roots.length
        ? `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`
        : `\\text{${L({ en: "nothing to check", vi: "không có nghiệm để thử" })}}`,
      explanation: L({
        en: "Put each answer back into the original equation. If both sides come out equal, the answer is right.",
        vi: "Thay từng nghiệm vào phương trình ban đầu. Nếu hai vế bằng nhau thì nghiệm đó đúng.",
      }),
      why: L({
        en: "A true solution must make the original equation true — checking is the one test that doesn't depend on any of the steps above being right.",
        vi: "Nghiệm đúng phải làm phương trình ban đầu đúng — thử lại là cách kiểm tra không phụ thuộc vào việc các bước trên có đúng hay không.",
      }),
      hint: L({ en: "Try the answer in the original equation. Do both sides match?", vi: "Thay đáp số vào phương trình ban đầu. Hai vế có bằng nhau không?" }),
      validation: status,
    }),
  };
}

export type CoreResult = {
  drafts: StepDraft[];
  roots: Root[];
  /** LaTeX of the answer before any restriction check. */
  answer: string;
  notes: string[];
  degenerate?: "all" | "none";
};

/* ───────────────────────────── Linear ───────────────────────────── */

function linearCore(poly: Poly, v: string, ref: SolutionSet, collectLabel = L({ en: "Collect terms", vi: "Chuyển vế, thu gọn" })): CoreResult {
  const [c, b] = poly.coeffs;
  const root = div(neg(c), b);
  const drafts: StepDraft[] = [];

  drafts.push(
    step("standard-form", {
      operation: collectLabel,
      latex: `${polyLatex([c, b], v)} = 0`,
      validation: checked(ref, `${polyAscii([c, b], v)}=0`),
      explanation: L({
        en: `Move every term to the left and combine like terms, so the equation looks like (number)·${v} + (number) = 0.`,
        vi: `Chuyển mọi hạng tử sang vế trái và thu gọn các hạng tử đồng dạng, để phương trình có dạng (số)·${v} + (số) = 0.`,
      }),
      why: L({
        en: "Adding or subtracting the same amount on both sides keeps the equation balanced, so the solution doesn't change.",
        vi: "Cộng hoặc trừ cùng một số ở hai vế giữ cho phương trình cân bằng, nên nghiệm không thay đổi.",
      }),
      hint: L({
        en: `Gather all the ${v}-terms and all the plain numbers. Which side should they end on?`,
        vi: `Gom các hạng tử chứa ${v} và các hằng số lại. Chúng nên nằm ở vế nào?`,
      }),
    }),
  );

  if (!isZero(c)) {
    const amount = ratLatex(c.n > 0 ? c : neg(c));
    drafts.push(
      step("isolate", {
        operation: L({ en: `${c.n > 0 ? "Subtract" : "Add"} ${amount}`, vi: `${c.n > 0 ? "Trừ" : "Cộng"} ${amount}` }),
        latex: `${polyLatex([rat(0), b], v)} = ${ratLatex(neg(c))}`,
        validation: checked(ref, `${polyAscii([rat(0), b], v)}=${ratAscii(neg(c))}`),
        explanation: L({
          en: `To get the ${v}-term alone, ${c.n > 0 ? "subtract" : "add"} ${amount} on both sides.`,
          vi: `Để còn lại riêng hạng tử chứa ${v}, ${c.n > 0 ? `trừ cả hai vế cho ${amount}` : `cộng ${amount} vào cả hai vế`}.`,
        }),
        why: L({
          en: "Doing the same operation to both sides is always allowed — it's the 'balance scale' rule.",
          vi: "Thực hiện cùng một phép toán ở hai vế luôn được phép — đó là quy tắc “cân thăng bằng”.",
        }),
        hint: L({
          en: `What number is sitting next to the ${v}-term? Undo it with the opposite operation on both sides.`,
          vi: `Số nào đang đứng cạnh hạng tử chứa ${v}? Khử nó bằng phép toán ngược ở cả hai vế.`,
        }),
      }),
    );
  }

  if (!(b.n === 1 && b.d === 1)) {
    drafts.push(
      step("divide", {
        operation: L({ en: `Divide by ${ratLatex(b)}`, vi: `Chia cho ${ratLatex(b)}` }),
        latex: `${v} = ${ratLatex(root)}`,
        validation: checked(ref, `${v}=${ratAscii(root)}`),
        explanation: L({
          en: `${ratLatex(b)} multiplies ${v}, so divide both sides by ${ratLatex(b)} to leave ${v} alone.`,
          vi: `${ratLatex(b)} đang nhân với ${v}, nên chia cả hai vế cho ${ratLatex(b)} để còn lại ${v}.`,
        }),
        why: L({
          en: `Dividing both sides by a non-zero number (${ratLatex(b)} ≠ 0) keeps them equal.`,
          vi: `Chia hai vế cho cùng một số khác 0 (${ratLatex(b)} ≠ 0) thì hai vế vẫn bằng nhau.`,
        }),
        hint: L({
          en: `${v} is being multiplied by a number. What operation undoes multiplication?`,
          vi: `${v} đang được nhân với một số. Phép toán nào ngược với phép nhân?`,
        }),
      }),
    );
  } else if (isZero(c)) {
    drafts.push(
      step("divide", {
        operation: L({ en: "Read off the answer", vi: "Đọc kết quả" }),
        latex: `${v} = 0`,
        explanation: L({ en: `${v} already stands alone.`, vi: `${v} đã đứng riêng một vế.` }),
        why: L({ en: "Nothing left to undo.", vi: "Không còn gì phải khử." }),
        hint: L({ en: `Look at what's left — is ${v} alone?`, vi: `Nhìn phần còn lại — ${v} đã đứng riêng chưa?` }),
      }),
    );
  }
  return { drafts, roots: [{ exact: root, value: toNumber(root) }], answer: `${v} = ${ratLatex(root)}`, notes: [] };
}

/* ──────────────────────────── Quadratic ──────────────────────────── */

function quadraticCore(poly: Poly, v: string, ref: SolutionSet, showStandard = true): CoreResult {
  let [c, b, a] = poly.coeffs;
  const drafts: StepDraft[] = [];

  if (showStandard) {
    drafts.push(
      step("standard-form", {
        operation: L({ en: "Standard form", vi: "Đưa về dạng tổng quát" }),
        latex: `${polyLatex([c, b, a], v)} = 0`,
        validation: checked(ref, `${polyAscii([c, b, a], v)}=0`),
        explanation: L({
          en: `Move everything to one side so the equation reads a${v}² + b${v} + c = 0 with 0 on the other side.`,
          vi: `Chuyển mọi hạng tử về một vế để phương trình có dạng a${v}² + b${v} + c = 0.`,
        }),
        why: L({
          en: "Adding or subtracting the same quantity on both sides keeps the equation balanced.",
          vi: "Cộng hoặc trừ cùng một biểu thức ở hai vế giữ cho phương trình cân bằng.",
        }),
        hint: L({
          en: "A quadratic is easiest to attack when one side is exactly 0. What do you move across?",
          vi: "Phương trình bậc hai dễ giải nhất khi một vế bằng 0. Bạn cần chuyển gì sang vế kia?",
        }),
      }),
    );
  }

  const den = [a, b, c].reduce((acc, r) => lcm(acc, r.d), 1);
  const m = den * (a.n < 0 ? -1 : 1);
  if (m !== 1) {
    const M = rat(m);
    a = mul(a, M);
    b = mul(b, M);
    c = mul(c, M);
    const why =
      m === -1
        ? L({ en: `Multiply both sides by −1 so the ${v}² coefficient is positive.`, vi: `Nhân hai vế với −1 để hệ số của ${v}² dương.` })
        : m > 0
          ? L({ en: `Multiply both sides by ${m} to clear the fractions.`, vi: `Nhân hai vế với ${m} để khử mẫu.` })
          : L({
              en: `Multiply both sides by ${m} to clear the fractions and make the ${v}² coefficient positive.`,
              vi: `Nhân hai vế với ${m} để khử mẫu và làm hệ số của ${v}² dương.`,
            });
    drafts.push(
      step("scale", {
        operation: L({ en: `Multiply by ${m}`, vi: `Nhân với ${m}` }),
        latex: `${polyLatex([c, b, a], v)} = 0`,
        validation: checked(ref, `${polyAscii([c, b, a], v)}=0`),
        explanation: `${why} ${L({ en: "Whole numbers are easier to work with.", vi: "Hệ số nguyên dễ tính hơn." })}`,
        why: L({
          en: "Multiplying both sides by a non-zero number keeps the equation equivalent.",
          vi: "Nhân hai vế với cùng một số khác 0 ta được phương trình tương đương.",
        }),
        hint: L({
          en: `Is there a trick to make the coefficients whole numbers and the ${v}² term positive?`,
          vi: `Có cách nào làm các hệ số thành số nguyên và hệ số của ${v}² dương không?`,
        }),
      }),
    );
  }

  const D = sub(mul(b, b), mul(rat(4), mul(a, c)));
  const Dn = D.n;
  drafts.push(
    step("discriminant", {
      operation: L({ en: "Discriminant", vi: "Tính biệt thức Δ" }),
      latex: `\\Delta = b^{2}-4ac = ${ratParen(b)}^{2}-4\\cdot ${ratParen(a)}\\cdot ${ratParen(c)} = ${ratLatex(D)}`,
      explanation: L({
        en: `The discriminant Δ = b² − 4ac decides how many real solutions exist: Δ > 0 → two, Δ = 0 → one, Δ < 0 → none. Here Δ = ${Dn}, so ${Dn > 0 ? "there are two real solutions" : Dn === 0 ? "there is exactly one solution" : "there are no real solutions"}.`,
        vi: `Biệt thức Δ = b² − 4ac cho biết số nghiệm thực: Δ > 0 → hai nghiệm phân biệt, Δ = 0 → nghiệm kép, Δ < 0 → vô nghiệm. Ở đây Δ = ${Dn}, nên ${Dn > 0 ? "phương trình có hai nghiệm phân biệt" : Dn === 0 ? "phương trình có nghiệm kép" : "phương trình vô nghiệm"}.`,
      }),
      why: L({
        en: "Δ is the quantity under the square root in the quadratic formula; its sign tells you whether that root is real.",
        vi: "Δ là biểu thức dưới dấu căn trong công thức nghiệm; dấu của nó cho biết căn đó có là số thực hay không.",
      }),
      hint: L({ en: "Compute b² − 4ac. What does its sign tell you?", vi: "Tính b² − 4ac. Dấu của nó cho biết điều gì?" }),
    }),
  );

  if (Dn < 0) {
    drafts.push(
      step("no-solution", {
        operation: L({ en: "No real solutions", vi: "Vô nghiệm" }),
        latex: `\\Delta < 0 \\Rightarrow \\text{${L({ en: "no real solutions", vi: "phương trình vô nghiệm" })}}`,
        explanation: L({
          en: `A negative number has no real square root, so the equation is never true for any real ${v}.`,
          vi: `Số âm không có căn bậc hai thực, nên không có số thực ${v} nào thỏa mãn phương trình.`,
        }),
        why: L({ en: "Squares of real numbers are never negative.", vi: "Bình phương của một số thực không bao giờ âm." }),
        hint: L({
          en: "What happens when you take the square root of a negative number?",
          vi: "Điều gì xảy ra khi lấy căn bậc hai của một số âm?",
        }),
      }),
    );
    return { drafts, roots: [], answer: `\\text{${L({ en: "No real solutions", vi: "Phương trình vô nghiệm" })}}`, notes: [], degenerate: "none" };
  }

  const sq = ratSqrt(D);
  const twoA = mul(rat(2), a);

  if (sq) {
    const r1 = div(sub(neg(b), sq), twoA);
    const r2 = div(add(neg(b), sq), twoA);
    const rs = Dn === 0 ? [r2] : [r1, r2].sort((p, q) => toNumber(p) - toNumber(q));
    const coef = a.n === 1 ? "" : ratLatex(a);
    const factored =
      rs.length === 1
        ? `${coef}${linearFactorLatex(rs[0], v)}^{2}`
        : `${coef}${rs.map((r) => linearFactorLatex(r, v)).join("")}`;
    const factoredAscii =
      rs.length === 1
        ? `${ratAscii(a)}*${linearFactorAscii(rs[0], v)}^2`
        : `${ratAscii(a)}*${rs.map((r) => linearFactorAscii(r, v)).join("*")}`;

    drafts.push(
      step("factor", {
        operation: L({ en: "Factor", vi: "Phân tích thành nhân tử" }),
        latex: `${factored} = 0`,
        validation: checked(ref, `${factoredAscii}=0`),
        explanation:
          a.n === 1 && rs.every(isInt) && rs.length === 2
            ? L({
                en: `Look for two numbers whose product is ${ratLatex(c)} and whose sum is ${ratLatex(b)}: they are ${ratLatex(neg(rs[0]))} and ${ratLatex(neg(rs[1]))}. That gives the factors below.`,
                vi: `Tìm hai số có tích bằng ${ratLatex(c)} và tổng bằng ${ratLatex(b)}: đó là ${ratLatex(neg(rs[0]))} và ${ratLatex(neg(rs[1]))}. Từ đó có các nhân tử dưới đây.`,
              })
            : L({
                en: `Because Δ is a perfect square, the quadratic factors exactly into ${rs.length === 1 ? "a repeated" : "two"} linear factor${rs.length === 1 ? "" : "s"}.`,
                vi: `Vì Δ là số chính phương nên tam thức phân tích được thành ${rs.length === 1 ? "bình phương của một nhân tử bậc nhất" : "tích của hai nhân tử bậc nhất"}.`,
              }),
        why: L({
          en: "Multiplying out the factors gives back the original quadratic, so this is just a rewrite, not a new equation.",
          vi: "Nhân các nhân tử ra lại được đúng tam thức ban đầu, nên đây chỉ là cách viết khác, không phải phương trình mới.",
        }),
        hint:
          a.n === 1
            ? L({
                en: `Find two numbers that multiply to ${ratLatex(c)} and add to ${ratLatex(b)}.`,
                vi: `Tìm hai số có tích bằng ${ratLatex(c)} và tổng bằng ${ratLatex(b)}.`,
              })
            : L({
                en: "Can you split the middle term, or use the roots to build the factors?",
                vi: "Bạn có thể tách hạng tử giữa, hoặc dùng các nghiệm để lập nhân tử không?",
              }),
      }),
    );
    drafts.push(
      step("zero-product", {
        operation: L({ en: "Zero-product property", vi: "Tích bằng 0" }),
        latex: rs.map((r) => `${linearFactorLatex(r, v).replace(/\\left|\\right/g, "")} = 0`).join(OR()),
        explanation: L({
          en: "If a product is 0, at least one factor must be 0 — so set each factor equal to 0 separately.",
          vi: "Một tích bằng 0 khi ít nhất một thừa số bằng 0 — nên cho từng thừa số bằng 0.",
        }),
        why: L({
          en: "Zero is the only number that, multiplied by something, can give 0 — so one factor has to be zero.",
          vi: "Chỉ có số 0 nhân với một số mới ra 0 — nên phải có một thừa số bằng 0.",
        }),
        hint: L({ en: "A product equals 0. What must be true about the factors?", vi: "Một tích bằng 0. Các thừa số phải thỏa mãn điều gì?" }),
      }),
    );
    drafts.push(
      step("roots", {
        operation: L({ en: "Solve each factor", vi: "Giải từng phương trình" }),
        latex: rs.map((r) => `${v} = ${ratLatex(r)}`).join(OR()),
        explanation:
          rs.length === 1
            ? L({ en: "Solving the factor gives one (repeated) solution.", vi: "Giải nhân tử đó được một nghiệm (nghiệm kép)." })
            : L({ en: `Solve each small equation for ${v}.`, vi: `Giải từng phương trình nhỏ để tìm ${v}.` }),
        why: L({
          en: "Each factor is a simple linear equation, solved by moving the constant across.",
          vi: "Mỗi thừa số là một phương trình bậc nhất đơn giản, giải bằng cách chuyển vế.",
        }),
        hint: L({ en: `Each factor is a tiny equation. Solve each one for ${v}.`, vi: `Mỗi thừa số là một phương trình nhỏ. Giải từng phương trình để tìm ${v}.` }),
      }),
    );
    return {
      drafts,
      roots: rs.map((r) => ({ exact: r, value: toNumber(r) })),
      answer: rs.map((r) => `${v} = ${ratLatex(r)}`).join(OR()),
      notes: [],
    };
  }

  const tex = irrationalRootTex(b.n, twoA.n, Dn);
  drafts.push(
    step("quadratic-formula", {
      operation: L({ en: "Quadratic formula", vi: "Công thức nghiệm" }),
      latex: `${v} = \\frac{${-b.n} \\pm \\sqrt{${Dn}}}{${twoA.n}} = ${tex.pm}`,
      explanation: L({
        en: `Δ = ${Dn} isn't a perfect square, so the roots are irrational. Use ${v} = (−b ± √Δ) / 2a and simplify the square root.`,
        vi: `Δ = ${Dn} không phải số chính phương nên các nghiệm là số vô tỉ. Dùng ${v} = (−b ± √Δ) / 2a rồi rút gọn căn.`,
      }),
      why: L({
        en: "The quadratic formula comes from completing the square on ax² + bx + c = 0, so it works for every quadratic.",
        vi: "Công thức nghiệm có được bằng cách biến đổi ax² + bx + c = 0 về dạng bình phương, nên đúng với mọi phương trình bậc hai.",
      }),
      hint: L({
        en: "When it won't factor neatly, the quadratic formula always works. What goes where?",
        vi: "Khi không phân tích gọn được, công thức nghiệm luôn dùng được. Thay a, b, c vào đâu?",
      }),
    }),
  );
  const s = Math.sqrt(Dn);
  const vals = [(-b.n - s) / twoA.n, (-b.n + s) / twoA.n].sort((p, q) => p - q);
  drafts.push(
    step("roots", {
      operation: L({ en: "Approximate", vi: "Giá trị gần đúng" }),
      latex: `${v} \\approx ${dec(vals[0])}${OR()}${v} \\approx ${dec(vals[1])}`,
      explanation: L({
        en: "Decimal approximations help you see where the solutions sit on a number line or graph.",
        vi: "Giá trị thập phân giúp bạn thấy nghiệm nằm ở đâu trên trục số hoặc đồ thị.",
      }),
      why: L({ en: "A decimal is just the value of the exact expression, rounded.", vi: "Số thập phân chỉ là giá trị của biểu thức chính xác, đã làm tròn." }),
      hint: L({ en: "Use a calculator for √ to estimate each value.", vi: "Dùng máy tính bỏ túi để ước lượng căn rồi tính từng nghiệm." }),
    }),
  );
  return { drafts, roots: vals.map((value) => ({ exact: null, value })), answer: `${v} = ${tex.pm}`, notes: [] };
}

function degenerateCore(poly: Poly, v: string): CoreResult {
  const c = poly.coeffs[0];
  const identity = isZero(c);
  return {
    drafts: [
      step(identity ? "identity" : "no-solution", {
        operation: L({ en: "Simplify", vi: "Rút gọn" }),
        latex: identity ? "0 = 0" : `${ratLatex(c)} = 0`,
        explanation: identity
          ? L({
              en: `Every ${v}-term cancels and both sides are equal, so the equation is true for every ${v}.`,
              vi: `Mọi hạng tử chứa ${v} triệt tiêu và hai vế bằng nhau, nên phương trình đúng với mọi ${v}.`,
            })
          : L({
              en: `Every ${v}-term cancels and we're left with ${ratLatex(c)} = 0, which is never true.`,
              vi: `Mọi hạng tử chứa ${v} triệt tiêu, còn lại ${ratLatex(c)} = 0 — điều này không bao giờ đúng.`,
            }),
        why: identity
          ? L({ en: "An equation that simplifies to a true statement holds for all values.", vi: "Phương trình rút gọn thành một mệnh đề đúng thì nghiệm đúng với mọi giá trị." })
          : L({ en: "An equation that simplifies to a false statement has no solution.", vi: "Phương trình rút gọn thành một mệnh đề sai thì vô nghiệm." }),
        hint: L({
          en: `What's left after the ${v}-terms cancel? Is that statement true or false?`,
          vi: `Sau khi các hạng tử chứa ${v} triệt tiêu, còn lại gì? Mệnh đề đó đúng hay sai?`,
        }),
      }),
    ],
    roots: [],
    answer: identity ? `\\text{${L({ en: "All real numbers", vi: "Mọi số thực" })}}` : `\\text{${L({ en: "No solution", vi: "Vô nghiệm" })}}`,
    notes: [],
    degenerate: identity ? "all" : "none",
  };
}

function core(poly: Poly, v: string, ref: SolutionSet, fromFractions = false): CoreResult {
  if (poly.degree === 2) return quadraticCore(poly, v, ref, !fromFractions);
  if (poly.degree === 1) return linearCore(poly, v, ref, fromFractions ? L({ en: "Simplify", vi: "Rút gọn" }) : undefined);
  return degenerateCore(poly, v);
}

/* ─────────────────────────── Polynomial equations ─────────────────────────── */

export function solvePolynomialEquation(problemId: string, an: Analysis): MathSolution {
  const v = an.variable;
  const ref = solutionSetOf(`${an.lhs}=${an.rhs}`);
  const refSet = ref.ok ? ref.set : [];
  const res = core(an.poly, v, refSet);
  const drafts = [...res.drafts];
  const notes = [...res.notes];
  if (!res.degenerate) {
    const verified = verifyRoots(an, res.roots);
    drafts.push(verified.draft);
    notes.push(...verified.notes);
  }
  return {
    problemId,
    originalInput: `${toTex(an.lhs)} = ${toTex(an.rhs)}`,
    topic: an.poly.degree === 2 ? "quadratic-equation" : "linear-equation",
    variable: v,
    steps: finalize(problemId, drafts),
    finalAnswer: res.answer,
    roots: res.roots.map((r) => r.value),
    confidenceNotes: notes,
  };
}

/* ─────────────────────── Equations with x in a denominator ─────────────────────── */

export function solveRationalEquation(problemId: string, input: RationalAnalysis): MathSolution {
  // Present the cleared equation with whole-number coefficients and a positive
  // leading term (multiplying by a non-zero constant keeps it equivalent).
  const ip = integerPoly(input.cleared);
  const lead = ip.coeffs[ip.degree];
  const ra: RationalAnalysis = {
    ...input,
    cleared: lead.n < 0 ? { ...ip, coeffs: ip.coeffs.map((c) => neg(c)) as Poly["coeffs"] } : ip,
  };
  const v = ra.variable;
  const drafts: StepDraft[] = [];
  const lcd = lcdLatex(ra.lcd, v);

  drafts.push(
    step("restriction", {
      operation: L({ en: "Note the restrictions", vi: "Điều kiện xác định" }),
      latex: restrictionLatex(ra),
      explanation: L({
        en: `A denominator can never be 0, so first write down which values ${v} is not allowed to take. Any “answer” equal to one of these must be thrown away at the end.`,
        vi: `Mẫu số luôn phải khác 0, nên trước hết ghi ra các giá trị ${v} không được nhận. “Nghiệm” nào trùng các giá trị này phải bị loại ở cuối bài.`,
      }),
      why: L({
        en: "Division by zero is undefined — the original equation simply doesn't exist at those values.",
        vi: "Không thể chia cho 0 — tại những giá trị đó phương trình ban đầu không xác định.",
      }),
      hint: L({ en: `Set each denominator equal to 0. Those values of ${v} are off-limits.`, vi: `Cho từng mẫu bằng 0. Những giá trị đó của ${v} bị loại.` }),
    }),
  );

  // Reference for the cleared equation: its own solutions (may include extraneous ones).
  const clearedAscii = `${polyAscii(ra.cleared.coeffs, v)}=0`;
  const clearedRef = solutionSetOf(clearedAscii);
  const refSet = clearedRef.ok ? clearedRef.set : [];

  drafts.push(
    step("clear-denominators", {
      operation: L({ en: "Multiply by the LCD", vi: "Quy đồng và khử mẫu" }),
      latex: `\\begin{aligned}&\\text{${L({ en: "LCD", vi: "MTC" })}} = ${lcd}\\\\&${polyLatex(ra.cleared.coeffs, v)} = 0\\end{aligned}`,
      explanation: L({
        en: `Multiply every term on both sides by the lowest common denominator so each fraction cancels. What's left is an ordinary ${ra.cleared.degree === 2 ? "quadratic" : "linear"} equation.`,
        vi: `Nhân mọi hạng tử ở hai vế với mẫu thức chung (MTC) để khử các phân thức. Còn lại một phương trình ${ra.cleared.degree === 2 ? "bậc hai" : "bậc nhất"} quen thuộc.`,
      }),
      why: L({
        en: `Multiplying both sides by the same expression keeps them equal — as long as that expression isn't 0, which is exactly why we listed the restrictions.`,
        vi: "Nhân hai vế với cùng một biểu thức thì hai vế vẫn bằng nhau — miễn là biểu thức đó khác 0, đó chính là lý do phải đặt điều kiện.",
      }),
      hint: L({
        en: "What's the smallest expression every denominator divides into? Multiply everything by it.",
        vi: "Biểu thức nhỏ nhất chia hết cho mọi mẫu là gì? Nhân tất cả với nó.",
      }),
    }),
  );

  const res = core(ra.cleared, v, refSet, true);
  drafts.push(...res.drafts);

  const kept = res.roots.filter((r) => !isRestricted(ra, r.value, r.exact));
  const rejected = res.roots.filter((r) => isRestricted(ra, r.value, r.exact));
  const show = (r: Root) => (r.exact ? ratLatex(r.exact) : dec(r.value));

  if (res.roots.length) {
    drafts.push(
      step("extraneous", {
        operation: L({ en: "Check the restrictions", vi: "Đối chiếu điều kiện" }),
        latex: [
          ...kept.map((r) => `${v} = ${show(r)}\\;\\text{${L({ en: "allowed", vi: "thỏa mãn ĐKXĐ" })}}\\ \\checkmark`),
          ...rejected.map((r) => `${v} = ${show(r)}\\;\\text{${L({ en: "rejected (denominator would be 0)", vi: "loại (làm mẫu bằng 0)" })}}`),
        ].join("\\\\"),
        explanation: rejected.length
          ? L({
              en: `${rejected.map(show).join(" and ")} came out of the algebra but makes a denominator 0, so it's an extraneous solution — not a real answer.`,
              vi: `${rejected.map(show).join(" và ")} tìm được khi biến đổi nhưng làm mẫu bằng 0, nên là nghiệm ngoại lai — phải loại.`,
            })
          : L({
              en: "None of the candidates hit a forbidden value, so all of them stand.",
              vi: "Không giá trị nào vi phạm điều kiện, nên tất cả đều là nghiệm.",
            }),
        why: L({
          en: "Multiplying by an expression containing the unknown can create “solutions” that don't work in the original equation.",
          vi: "Nhân với biểu thức chứa ẩn có thể sinh ra “nghiệm” không thỏa mãn phương trình ban đầu.",
        }),
        hint: L({
          en: "Compare each candidate with the restrictions you wrote down at the start.",
          vi: "So sánh từng giá trị tìm được với điều kiện đã đặt ở đầu bài.",
        }),
      }),
    );
  }

  const notes = [...res.notes];
  if (kept.length) {
    const verified = verifyRoots(ra, kept);
    drafts.push(verified.draft);
    notes.push(...verified.notes);
  }

  let finalAnswer: string;
  if (res.degenerate === "all") {
    finalAnswer = ra.restrictions.length
      ? `\\text{${L({ en: "All real numbers except", vi: "Mọi số thực trừ" })} } ${ra.restrictions.map(show).join(",\\ ")}`
      : `\\text{${L({ en: "All real numbers", vi: "Mọi số thực" })}}`;
  } else if (kept.length === 0) {
    finalAnswer = `\\text{${L({ en: "No solution", vi: "Vô nghiệm" })}}`;
  } else {
    finalAnswer = kept.map((r) => `${v} = ${show(r)}`).join(OR());
  }

  return {
    problemId,
    originalInput: `${toTex(ra.lhs)} = ${toTex(ra.rhs)}`,
    topic: "rational-equation",
    variable: v,
    steps: finalize(problemId, drafts),
    finalAnswer,
    roots: kept.map((r) => r.value),
    confidenceNotes: notes,
  };
}
