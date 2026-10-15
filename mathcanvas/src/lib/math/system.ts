import { L } from "./lang";
import type { MathNode } from "mathjs";
import {
  collectVariables,
  evalExact,
  fail,
  normalizeInput,
  parseExpr,
  splitRelation,
  toTex,
} from "./polynomial";
import { ratLatex } from "./latex";
import { type Rat, ZERO, add, div, eq, gcd, isZero, lcm, mul, rat, sub } from "./rational";
import { type StepDraft, finalize, step } from "./steps";
import type { MathSolution, SolveFailure, ValidationStatus } from "./types";

/** Split "x+y=5; x-y=1" (also newlines, top-level commas, "and"). */
export function splitSystem(raw: string): string[] | null {
  const s = normalizeInput(raw).replace(/\\\\/g, ";");
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && (ch === ";" || ch === "," || ch === "\n")) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const eqs = parts.flatMap((p) => p.split(/\band\b/)).map((p) => p.trim()).filter(Boolean);
  if (eqs.length < 2 || !eqs.every((e) => /=/.test(e) && !/[<>]/.test(e))) return null;
  return eqs;
}

type Row = { coeffs: Rat[]; rhs: Rat };

export type SystemAnalysis = {
  ok: true;
  variables: string[];
  equations: Array<{ lhs: string; rhs: string; lNode: MathNode; rNode: MathNode }>;
  rows: Row[];
};

const PROBES = [
  [1, 1, 1],
  [2, -1, 3],
  [-3, 2, -1],
  [1, 2, 3],
  [-2, -3, 5],
];

export function analyzeSystem(raw: string): SystemAnalysis | SolveFailure {
  const parts = splitSystem(raw);
  if (!parts) return fail("parse", L({ en: "That isn't a system of equations.", vi: "Đây không phải hệ phương trình." }), L({ en: "Separate equations with “;”, e.g. x + y = 5; x − y = 1.", vi: "Ngăn cách các phương trình bằng “;”, ví dụ x + y = 5; x − y = 1." }));
  const equations: SystemAnalysis["equations"] = [];
  const vars = new Set<string>();
  for (const p of parts) {
    const rel = splitRelation(p);
    if (!rel.ok) return rel;
    const lNode = parseExpr(rel.lhs);
    const rNode = parseExpr(rel.rhs);
    if (!lNode || !rNode) {
      return fail("parse", L({ en: `I couldn't read “${p}”.`, vi: `Không đọc được “${p}”.` }), L({ en: "Check brackets and operators in each equation.", vi: "Kiểm tra dấu ngoặc và các phép toán trong từng phương trình." }));
    }
    collectVariables(lNode).forEach((x) => vars.add(x));
    collectVariables(rNode).forEach((x) => vars.add(x));
    equations.push({ lhs: rel.lhs, rhs: rel.rhs, lNode, rNode });
  }
  const variables = [...vars].sort();
  if (variables.length > 3) {
    return fail("unsupported", L({ en: "That's more than three unknowns.", vi: "Hệ có nhiều hơn ba ẩn." }), L({ en: "I solve systems with 2 or 3 unknowns for now.", vi: "Hiện mình giải được hệ có 2 hoặc 3 ẩn." }));
  }
  if (variables.length !== equations.length) {
    return fail(
      "unsupported",
      L({ en: `There are ${equations.length} equations but ${variables.length} unknown${variables.length === 1 ? "" : "s"} (${variables.join(", ")}).`, vi: `Có ${equations.length} phương trình nhưng có ${variables.length} ẩn (${variables.join(", ")}).` }),
      L({ en: "Use as many equations as unknowns — e.g. two equations for x and y.", vi: "Số phương trình cần bằng số ẩn — ví dụ hai phương trình cho x và y." }),
    );
  }

  const rows: Row[] = [];
  for (const e of equations) {
    const f = (vals: number[]): Rat | null => {
      const scope: Record<string, Rat> = {};
      variables.forEach((v, i) => (scope[v] = rat(vals[i])));
      const l = evalExact(e.lNode, scope);
      const r = evalExact(e.rNode, scope);
      return l && r ? sub(l, r) : null;
    };
    const n = variables.length;
    const zero = Array(n).fill(0);
    const c = f(zero);
    if (!c) return fail("unsupported", L({ en: "One equation can't be evaluated exactly.", vi: "Có một phương trình không tính chính xác được." }), L({ en: "Keep each equation linear, e.g. 2x − 3y = 7.", vi: "Mỗi phương trình cần là bậc nhất, ví dụ 2x − 3y = 7." }));
    const coeffs: Rat[] = [];
    for (let j = 0; j < n; j++) {
      const unit = zero.map((_, k) => (k === j ? 1 : 0));
      const y = f(unit);
      if (!y) return fail("unsupported", L({ en: "One equation can't be evaluated exactly.", vi: "Có một phương trình không tính chính xác được." }), L({ en: "Keep each equation linear.", vi: "Mỗi phương trình cần là bậc nhất." }));
      coeffs.push(sub(y, c));
    }
    const linearAt = (pt: number[]) =>
      coeffs.reduce((acc, a, j) => add(acc, mul(a, rat(pt[j]))), c);
    const checks = [...PROBES.map((p) => p.slice(0, n)), ...coeffs.map((_, j) => zero.map((_, k) => (k === j ? 2 : 0)))];
    for (const pt of checks) {
      const y = f(pt);
      if (!y || !eq(y, linearAt(pt))) {
        return fail(
          "unsupported",
          L({ en: "This system isn't linear (an unknown is squared, multiplied by another, or in a denominator).", vi: "Hệ này không phải hệ bậc nhất (có ẩn bình phương, nhân với ẩn khác, hoặc nằm ở mẫu)." }),
          L({ en: "I solve linear systems for now, like 2x + y = 7; x − y = 2.", vi: "Hiện mình giải được hệ bậc nhất, như 2x + y = 7; x − y = 2." }),
        );
      }
    }
    rows.push({ coeffs, rhs: sub(ZERO, c) });
  }
  return { ok: true, variables, equations, rows };
}

/* ───────────────────────────── LaTeX helpers ───────────────────────────── */

function termsLatex(coeffs: Rat[], vars: string[]): string {
  const parts: string[] = [];
  coeffs.forEach((c, j) => {
    if (isZero(c)) return;
    const abs = c.n < 0 ? rat(-c.n, c.d) : c;
    const body = abs.n === 1 && abs.d === 1 ? vars[j] : `${ratLatex(abs)}${vars[j]}`;
    if (parts.length === 0) parts.push(c.n < 0 ? `-${body}` : body);
    else parts.push(c.n < 0 ? `- ${body}` : `+ ${body}`);
  });
  return parts.length ? parts.join(" ") : "0";
}

const rowLatex = (r: Row, vars: string[]) => `${termsLatex(r.coeffs, vars)} = ${ratLatex(r.rhs)}`;

function systemLatex(rows: Row[], vars: string[], labels: string[]): string {
  return `\\begin{cases}${rows.map((r, i) => `${rowLatex(r, vars)} & ${labels[i]}`).join("\\\\")}\\end{cases}`;
}

/** Scale a row to whole numbers with no common factor and a positive lead. */
function tidy(r: Row): Row {
  const all = [...r.coeffs, r.rhs];
  const den = all.reduce((acc, x) => lcm(acc, x.d), 1);
  const ints = all.map((x) => (x.n * den) / x.d);
  const g = ints.reduce((acc, x) => gcd(acc, x), 0) || 1;
  const lead = ints.find((x) => x !== 0) ?? 1;
  const s = lead < 0 ? -1 : 1;
  const k = rat(s * den, g);
  return { coeffs: r.coeffs.map((x) => mul(x, k)), rhs: mul(r.rhs, k) };
}

const scaleRow = (r: Row, k: Rat): Row => ({ coeffs: r.coeffs.map((x) => mul(x, k)), rhs: mul(r.rhs, k) });
const subRows = (a: Row, b: Row): Row => ({ coeffs: a.coeffs.map((x, j) => sub(x, b.coeffs[j])), rhs: sub(a.rhs, b.rhs) });

/* ───────────────────────────── Solver ───────────────────────────── */

export function solveSystem(problemId: string, sa: SystemAnalysis): MathSolution {
  const vars = sa.variables;
  const n = vars.length;
  const labels = sa.rows.map((_, i) => `(${i + 1})`);
  const drafts: StepDraft[] = [];
  const original = `\\begin{cases}${sa.equations.map((e) => `${toTex(e.lhs)} = ${toTex(e.rhs)}`).join("\\\\")}\\end{cases}`;

  let rows = sa.rows.map(tidy);
  drafts.push(
    step("standard-form", {
      operation: L({ en: "Line up the unknowns", vi: "Sắp xếp các ẩn" }),
      latex: systemLatex(rows, vars, labels),
      explanation: L({ en: `Rewrite each equation with the unknowns in the same order (${vars.join(", ")}) on the left and a number on the right. Number the equations so we can refer to them.`, vi: `Viết lại mỗi phương trình với các ẩn theo cùng thứ tự (${vars.join(", ")}) ở vế trái và hằng số ở vế phải. Đánh số các phương trình để tiện gọi tên.` }),
      why: L({ en: "Moving terms across and scaling an equation by a non-zero number doesn't change its solutions.", vi: "Chuyển vế và nhân một phương trình với số khác 0 không làm thay đổi nghiệm." }),
      hint: L({ en: "Put the unknowns on the left in the same order in every equation.", vi: "Đặt các ẩn ở vế trái theo cùng thứ tự trong mọi phương trình." }),
    }),
  );

  // Forward elimination with friendly whole-number multipliers.
  for (let col = 0; col < n; col++) {
    const p = rows.findIndex((r, i) => i >= col && !isZero(r.coeffs[col]));
    if (p === -1) continue;
    if (p !== col) {
      [rows[p], rows[col]] = [rows[col], rows[p]];
      [labels[p], labels[col]] = [labels[col], labels[p]];
      drafts.push(
        step("swap", {
          operation: L({ en: `Swap ${labels[p]} and ${labels[col]}`, vi: `Đổi chỗ ${labels[p]} và ${labels[col]}` }),
          latex: systemLatex(rows, vars, labels),
          explanation: L({ en: `Equation ${labels[col]} has a ${vars[col]}-term, so move it up to eliminate ${vars[col]} from the rest.`, vi: `Phương trình ${labels[col]} có chứa ${vars[col]}, nên đưa nó lên trên để khử ${vars[col]} ở các phương trình còn lại.` }),
          why: L({ en: "The order of the equations doesn't matter.", vi: "Thứ tự các phương trình không ảnh hưởng đến nghiệm." }),
          hint: L({ en: `Which equation still contains ${vars[col]}?`, vi: `Phương trình nào còn chứa ${vars[col]}?` }),
        }),
      );
    }
    const pivot = rows[col];
    for (let i = col + 1; i < n; i++) {
      const target = rows[i];
      if (isZero(target.coeffs[col])) continue;
      const a = pivot.coeffs[col];
      const b = target.coeffs[col];
      // Integers after tidy(): make the column match with the least common multiple.
      const mult = lcm(Math.abs(a.n), Math.abs(b.n));
      const kT = rat(mult / Math.abs(b.n));
      const kP = rat((mult / Math.abs(a.n)) * Math.sign(a.n) * Math.sign(b.n));
      const next = tidy(subRows(scaleRow(target, kT), scaleRow(pivot, kP)));
      const kTx = kT.n === 1 ? "" : `${kT.n}\\cdot`;
      const kPabs = Math.abs(kP.n);
      const kPx = kPabs === 1 ? "" : `${kPabs}\\cdot`;
      const opTex = `${labels[i]} \\to ${kTx}${labels[i]} ${kP.n < 0 ? "+" : "-"} ${kPx}${labels[col]}`;
      rows = rows.map((r, k) => (k === i ? next : r));
      labels[i] = labels[i].replace(")", "')");
      drafts.push(
        step("eliminate", {
          operation: L({ en: `Eliminate ${vars[col]} from equation ${i + 1}`, vi: `Khử ${vars[col]} ở phương trình ${i + 1}` }),
          latex: `\\begin{aligned}&${opTex}\\\\&${systemLatex(rows, vars, labels)}\\end{aligned}`,
          explanation: L({ en: `Scale the equations so the ${vars[col]}-terms match, then ${kP.n < 0 ? "add" : "subtract"} them. The ${vars[col]}-terms cancel, leaving an equation with fewer unknowns.`, vi: `Nhân các phương trình để hệ số của ${vars[col]} bằng nhau, rồi ${kP.n < 0 ? "cộng" : "trừ"} vế theo vế. Các hạng tử chứa ${vars[col]} triệt tiêu, còn lại phương trình ít ẩn hơn.` }),
          why: L({ en: "If two equations are both true, their sum or difference (after scaling) is true as well — so no solutions are lost or gained.", vi: "Nếu hai phương trình cùng đúng thì tổng hoặc hiệu của chúng (sau khi nhân) cũng đúng — nên không mất hay thêm nghiệm." }),
          hint: L({ en: `Can you make the ${vars[col]}-coefficients equal (or opposite) and then combine the equations?`, vi: `Bạn có thể làm hệ số của ${vars[col]} bằng nhau (hoặc đối nhau) rồi cộng/trừ các phương trình không?` }),
        }),
      );
    }
  }

  // Inconsistent or dependent?
  const zeroRow = rows.find((r) => r.coeffs.every(isZero));
  if (zeroRow) {
    const inconsistent = !isZero(zeroRow.rhs);
    drafts.push(
      step(inconsistent ? "no-solution" : "identity", {
        operation: inconsistent
          ? L({ en: "Contradiction", vi: "Mâu thuẫn" })
          : L({ en: "Equations depend on each other", vi: "Các phương trình phụ thuộc nhau" }),
        latex: `0 = ${ratLatex(zeroRow.rhs)}${inconsistent ? `\\;\\text{— ${L({ en: "impossible", vi: "vô lý" })}}` : `\\;\\text{— ${L({ en: "always true", vi: "luôn đúng" })}}`}`,
        explanation: inconsistent
          ? L({ en: "Every unknown cancelled and we're left with a false statement, so no values satisfy all the equations at once. (For two unknowns: the lines are parallel.)", vi: "Mọi ẩn đều triệt tiêu và còn lại một mệnh đề sai, nên không có giá trị nào thỏa mãn đồng thời các phương trình. (Với hai ẩn: hai đường thẳng song song.)" })
          : L({ en: "Every unknown cancelled and we're left with 0 = 0. One equation is a multiple of another, so there are infinitely many solutions. (For two unknowns: it's the same line twice.)", vi: "Mọi ẩn đều triệt tiêu và còn lại 0 = 0. Một phương trình là bội của phương trình kia, nên hệ có vô số nghiệm. (Với hai ẩn: hai đường thẳng trùng nhau.)" }),
        why: inconsistent
          ? L({ en: "A false statement means the original equations can't all be true together.", vi: "Mệnh đề sai nghĩa là các phương trình ban đầu không thể cùng đúng." })
          : L({ en: "An equation that is always true gives no new information.", vi: "Một phương trình luôn đúng không cho thêm thông tin gì." }),
        hint: L({ en: "What's left when everything cancels? Is it true or false?", vi: "Khi mọi thứ triệt tiêu thì còn lại gì? Đúng hay sai?" }),
      }),
    );
    return {
      problemId,
      originalInput: original,
      topic: "linear-system",
      steps: finalize(problemId, drafts),
      finalAnswer: inconsistent
        ? `\\text{${L({ en: "No solution", vi: "Hệ vô nghiệm" })}}`
        : `\\text{${L({ en: "Infinitely many solutions", vi: "Hệ có vô số nghiệm" })}}`,
      roots: [],
      variables: vars,
      confidenceNotes: [],
    };
  }

  // Back substitution.
  const values: Rat[] = Array(n).fill(ZERO);
  for (let i = n - 1; i >= 0; i--) {
    const r = rows[i];
    const v = vars[i];
    let known = ZERO;
    const shown: string[] = [];
    r.coeffs.forEach((c, j) => {
      if (j <= i || isZero(c)) return;
      known = add(known, mul(c, values[j]));
      const val = values[j];
      shown.push(`${c.n < 0 ? "-" : "+"} ${Math.abs(c.n) === 1 && c.d === 1 ? "" : ratLatex(rat(Math.abs(c.n), c.d))}\\left(${ratLatex(val)}\\right)`);
    });
    values[i] = div(sub(r.rhs, known), r.coeffs[i]);
    const lead = termsLatex(r.coeffs.map((c, j) => (j === i ? c : ZERO)), vars);
    const substituted = shown.length ? `${lead} ${shown.join(" ")} = ${ratLatex(r.rhs)}` : rowLatex(r, vars);
    const trivial = !shown.length && r.coeffs[i].n === r.coeffs[i].d;
    drafts.push(
      step(shown.length ? "back-substitute" : "divide", {
        operation: shown.length
          ? L({ en: `Substitute to find ${v}`, vi: `Thế vào để tìm ${v}` })
          : L({ en: `Solve for ${v}`, vi: `Tìm ${v}` }),
        latex: trivial ? `${v} = ${ratLatex(values[i])}` : `${substituted} \\;\\Rightarrow\\; ${v} = ${ratLatex(values[i])}`,
        explanation: shown.length
          ? L({ en: `Put the value${shown.length > 1 ? "s" : ""} we already know into equation ${labels[i]} and solve for ${v}.`, vi: `Thế các giá trị đã biết vào phương trình ${labels[i]} rồi tìm ${v}.` })
          : L({ en: `Equation ${labels[i]} now has only ${v}, so solve it directly.`, vi: `Phương trình ${labels[i]} giờ chỉ còn ${v}, giải trực tiếp.` }),
        why: L({ en: "A known value can replace its letter in any equation of the system.", vi: "Một giá trị đã biết có thể thế vào chỗ ẩn đó trong bất kỳ phương trình nào của hệ." }),
        hint: shown.length
          ? L({ en: "You already know some unknowns. Plug them in!", vi: "Bạn đã biết một số ẩn. Thế chúng vào!" })
          : L({ en: `Only ${v} is left in this equation. Divide to finish.`, vi: `Phương trình này chỉ còn ${v}. Chia để tìm nốt.` }),
      }),
    );
  }

  const tuple = `(${vars.join(", ")}) = (${values.map(ratLatex).join(", ")})`;
  drafts.push(
    step("solution-point", {
      operation: L({ en: "Solution", vi: "Nghiệm của hệ" }),
      latex: tuple,
      explanation:
        n === 2
          ? L({ en: "This is the one point where the two lines cross.", vi: "Đây là giao điểm duy nhất của hai đường thẳng." })
          : L({ en: "These values satisfy all three equations at once.", vi: "Các giá trị này thỏa mãn đồng thời cả ba phương trình." }),
      why: L({ en: "Each value came from equations equivalent to the original system.", vi: "Mỗi giá trị đều suy ra từ các phương trình tương đương với hệ ban đầu." }),
      hint: L({ en: "Collect the values you found.", vi: "Tổng hợp các giá trị đã tìm được." }),
    }),
  );

  // Verify in the ORIGINAL equations, exactly.
  let status: ValidationStatus = "passed";
  const scope: Record<string, Rat> = {};
  vars.forEach((v, i) => (scope[v] = values[i]));
  const lines = sa.equations.map((e, i) => {
    const l = evalExact(e.lNode, scope);
    const r = evalExact(e.rNode, scope);
    const ok = !!l && !!r && eq(l, r);
    if (!ok) status = "failed";
    return `(${i + 1}):\\; ${l ? ratLatex(l) : "?"} = ${r ? ratLatex(r) : "?"}${ok ? "\\ \\checkmark" : "\\ \\times"}`;
  });
  drafts.push(
    step("verify", {
      operation: L({ en: "Check in every equation", vi: "Thử lại vào từng phương trình" }),
      latex: `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`,
      explanation: L({ en: "Substitute the values into each original equation. Both sides must match in every one.", vi: "Thế các giá trị vào từng phương trình ban đầu. Hai vế phải bằng nhau ở mọi phương trình." }),
      why: L({ en: "A solution of a system has to satisfy all of its equations — checking each one proves it.", vi: "Nghiệm của hệ phải thỏa mãn mọi phương trình — thử từng phương trình là cách chứng minh." }),
      hint: L({ en: "Plug your values into each original equation.", vi: "Thế các giá trị vào từng phương trình ban đầu." }),
      validation: status,
    }),
  );

  return {
    problemId,
    originalInput: original,
    topic: "linear-system",
    steps: finalize(problemId, drafts),
    finalAnswer: values.map((x, i) => `${vars[i]} = ${ratLatex(x)}`).join(",\\; "),
    roots: [],
    variables: vars,
    point: values.map((x) => x.n / x.d),
    confidenceNotes: [],
  };
}

