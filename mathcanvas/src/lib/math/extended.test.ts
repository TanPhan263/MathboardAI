import { describe, expect, it } from "vitest";
import { checkAnswer, checkWork } from "./check";
import { generatePractice } from "./practice";
import { solveProblem } from "./solve";
import { solutionSetOf } from "./solutionset";
import type { ProblemTopic } from "./types";

const solve = (s: string) => {
  const r = solveProblem(s);
  if (!r.ok) throw new Error(`${s}: ${r.message}`);
  return r.solution;
};
const allPassed = (s: ReturnType<typeof solve>) => s.steps.every((st) => st.validation === "passed");

describe("equations with x in a denominator", () => {
  it("solves 1/x = 2", () => {
    const s = solve("1/x = 2");
    expect(s.topic).toBe("rational-equation");
    expect(s.roots).toEqual([0.5]);
    expect(s.steps[0].kind).toBe("restriction");
    expect(allPassed(s)).toBe(true);
  });

  it("solves a two-fraction equation via the LCD", () => {
    const s = solve("1/x + 1/(x+1) = 1/2");
    // x² − 3x − 2 = 0 → (3 ± √17)/2
    expect(s.roots).toHaveLength(2);
    expect(s.steps.some((st) => st.kind === "clear-denominators")).toBe(true);
    expect(allPassed(s)).toBe(true);
  });

  it("rejects an extraneous solution", () => {
    // Clearing the denominator gives x = 1, which the restriction forbids.
    const s = solve("x/(x-1) = 1/(x-1)");
    expect(s.roots).toEqual([]);
    expect(s.finalAnswer).toContain("No solution");
    const ext = s.steps.find((st) => st.kind === "extraneous");
    expect(ext?.latex).toContain("rejected");
  });

  it("keeps good roots and drops the bad one", () => {
    const s = solve("x^2/(x-2) = 4/(x-2)");
    expect(s.roots).toEqual([-2]);
  });

  it("answer check explains an extraneous answer", () => {
    expect(checkAnswer("x/(x-1) = 1/(x-1)", "x = 1").message).toMatch(/extraneous/);
    expect(checkAnswer("1/x = 2", "1/2").status).toBe("correct");
  });
});

describe("inequalities", () => {
  it("solves a linear inequality and flips for a negative divisor", () => {
    const s = solve("-2x + 3 > 11");
    expect(s.topic).toBe("linear-inequality");
    expect(s.finalAnswer).toBe("x < -4");
    expect(s.steps.some((st) => st.kind === "flip")).toBe(true);
    expect(allPassed(s)).toBe(true);
  });

  it("keeps the sign for a positive divisor and handles ≤", () => {
    const s = solve("3x - 1 <= 8");
    expect(s.finalAnswer).toBe("x \\le 3");
    expect(s.steps.find((st) => st.kind === "interval")?.latex).toContain("(-\\infty,\\ 3]");
  });

  it("solves quadratic inequalities with a sign chart", () => {
    const outside = solve("x^2 - 5x + 6 > 0");
    expect(outside.topic).toBe("quadratic-inequality");
    expect(outside.finalAnswer).toContain("\\cup");
    expect(allPassed(outside)).toBe(true);
    const inside = solve("x^2 <= 4");
    expect(inside.finalAnswer).toContain("[-2,\\ 2]");
  });

  it("handles quadratics that never cross zero", () => {
    expect(solve("x^2 + 1 > 0").finalAnswer).toContain("\\mathbb{R}");
    expect(solve("x^2 + 1 < 0").finalAnswer).toContain("\\varnothing");
  });

  it("flips when the leading coefficient is negative", () => {
    const s = solve("-x^2 + 4 > 0");
    expect(s.steps.some((st) => st.kind === "flip")).toBe(true);
    expect(s.finalAnswer).toContain("(-2,\\ 2)");
  });

  it("accepts unicode ≤ ≥", () => {
    expect(solutionSetOf("2x ≥ 6").ok).toBe(true);
  });

  it("checks inequality answers in several notations", () => {
    const p = "-2x + 3 > 11";
    expect(checkAnswer(p, "x < -4").status).toBe("correct");
    expect(checkAnswer(p, "(-inf, -4)").status).toBe("correct");
    expect(checkAnswer(p, "x > -4").message).toMatch(/wrong way/);
    expect(checkAnswer(p, "x <= -4").message).toMatch(/endpoint/);
    expect(checkAnswer("x^2 - 5x + 6 > 0", "x < 2 or x > 3").status).toBe("correct");
  });
});

describe("systems of linear equations", () => {
  it("solves a 2×2 system by elimination", () => {
    const s = solve("x + y = 5; x - y = 1");
    expect(s.topic).toBe("linear-system");
    expect(s.point).toEqual([3, 2]);
    expect(s.steps.some((st) => st.kind === "eliminate")).toBe(true);
    expect(allPassed(s)).toBe(true);
  });

  it("accepts commas and 'and' as separators", () => {
    expect(solve("2x + 3y = 12, x - y = 1").point).toEqual([3, 2]);
    expect(solve("2a + b = 5 and a - b = 1").point).toEqual([2, 1]);
  });

  it("solves a 3×3 system", () => {
    const s = solve("x + y + z = 6; 2x - y + z = 3; x + 2y - z = 2");
    expect(s.point).toEqual([1, 2, 3]);
    expect(allPassed(s)).toBe(true);
  });

  it("needs a swap when the first pivot is zero", () => {
    const s = solve("y = 2; x + y = 5");
    expect(s.point).toEqual([3, 2]);
  });

  it("detects no solution and infinitely many", () => {
    expect(solve("x + y = 2; x + y = 3").finalAnswer).toContain("No solution");
    expect(solve("x + y = 2; 2x + 2y = 4").finalAnswer).toContain("Infinitely many");
  });

  it("rejects non-linear and mismatched systems", () => {
    expect(solveProblem("x*y = 2; x + y = 3").ok).toBe(false);
    expect(solveProblem("x + y + z = 1; x - y = 2").ok).toBe(false);
  });

  it("checks system answers", () => {
    const p = "x + y = 5; x - y = 1";
    expect(checkAnswer(p, "x = 3, y = 2").status).toBe("correct");
    expect(checkAnswer(p, "(3, 2)").status).toBe("correct");
    expect(checkAnswer(p, "x = 3").status).toBe("incomplete");
    expect(checkAnswer(p, "x = 2, y = 3").status).toBe("incorrect");
  });
});

describe("checkWork across topics", () => {
  it("catches a missed sign flip", () => {
    const r = checkWork(["-2x > 6", "x > -3"]);
    expect(r[1].status).toBe("failed");
    expect(r[1].message).toMatch(/flip/);
  });

  it("accepts a correct inequality chain", () => {
    const r = checkWork(["-2x + 3 > 11", "-2x > 8", "x < -4"]);
    expect(r.map((l) => l.status)).toEqual(["start", "passed", "passed"]);
  });

  it("flags an extraneous root introduced by clearing denominators", () => {
    const r = checkWork(["x/(x-1) = 1/(x-1)", "x = 1"]);
    expect(r[1].status).toBe("failed");
  });
});

describe("generatePractice for every topic", () => {
  const topics: ProblemTopic[] = [
    "linear-equation",
    "quadratic-equation",
    "rational-equation",
    "linear-inequality",
    "quadratic-inequality",
    "linear-system",
  ];
  it.each(topics)("%s problems are always solvable and fully verified", (topic) => {
    for (let i = 0; i < 60; i++) {
      const p = generatePractice(topic);
      const r = solveProblem(p.input);
      expect(r.ok, p.input).toBe(true);
      if (r.ok) {
        expect(r.solution.topic, p.input).toBe(topic);
        expect(r.solution.steps.every((s) => s.validation === "passed"), p.input).toBe(true);
      }
    }
  });
});
