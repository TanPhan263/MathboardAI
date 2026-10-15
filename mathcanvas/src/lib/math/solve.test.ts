import { describe, expect, it } from "vitest";
import { solveProblem } from "./solve";
import { checkAnswer, checkWork } from "./check";
import { generatePractice } from "./practice";
import { analyzeEquation, realRoots } from "./polynomial";

const solve = (s: string) => {
  const r = solveProblem(s);
  if (!r.ok) throw new Error(`${s}: ${r.message}`);
  return r.solution;
};

describe("solveProblem — linear", () => {
  it("solves 2x + 3 = 11", () => {
    const s = solve("2x + 3 = 11");
    expect(s.topic).toBe("linear-equation");
    expect(s.roots).toEqual([4]);
    expect(s.finalAnswer).toBe("x = 4");
    expect(s.steps.every((st) => st.validation === "passed")).toBe(true);
  });

  it("handles variables on both sides and fractions", () => {
    expect(solve("5x - 4 = 2x + 8").roots).toEqual([4]);
    expect(solve("x/2 + 1/3 = 5/6").roots[0]).toBeCloseTo(1);
    expect(solve("3x = 1").finalAnswer).toBe("x = \\frac{1}{3}");
  });

  it("detects identities and contradictions", () => {
    expect(solve("2(x+1) = 2x + 2").finalAnswer).toContain("All real numbers");
    expect(solve("x + 1 = x + 2").finalAnswer).toContain("No solution");
  });
});

describe("solveProblem — quadratic", () => {
  it("factors x² − 5x + 6 = 0", () => {
    const s = solve("x^2 - 5x + 6 = 0");
    expect(s.roots).toEqual([2, 3]);
    expect(s.steps.map((st) => st.kind)).toEqual([
      "standard-form",
      "discriminant",
      "factor",
      "zero-product",
      "roots",
      "verify",
    ]);
    expect(s.steps.every((st) => st.validation === "passed")).toBe(true);
  });

  it("accepts unicode and implicit multiplication", () => {
    expect(solve("x² − 5x + 6 = 0").roots).toEqual([2, 3]);
    expect(solve("x^2=4").roots).toEqual([-2, 2]);
  });

  it("handles a repeated root", () => {
    const s = solve("x^2 - 6x + 9 = 0");
    expect(s.roots).toEqual([3]);
  });

  it("handles a leading coefficient and moves terms across", () => {
    const s = solve("2x^2 + 3x = 2");
    expect(s.roots).toEqual([-2, 0.5]);
    expect(s.steps.at(-1)?.validation).toBe("passed");
  });

  it("clears fractions", () => {
    const s = solve("x^2/2 - x/2 - 3 = 0");
    expect(s.roots).toEqual([-2, 3]);
    expect(s.steps.some((st) => st.kind === "scale")).toBe(true);
  });

  it("uses the quadratic formula for irrational roots and verifies numerically", () => {
    const s = solve("x^2 + 4x + 1 = 0");
    expect(s.roots[0]).toBeCloseTo(-2 - Math.sqrt(3), 9);
    expect(s.roots[1]).toBeCloseTo(-2 + Math.sqrt(3), 9);
    expect(s.finalAnswer).toBe("x = -2\\pm \\sqrt{3}");
    expect(s.confidenceNotes.join(" ")).toMatch(/numerically/);
    expect(s.steps.at(-1)?.validation).toBe("passed");
  });

  it("reports no real solutions when Δ < 0", () => {
    const s = solve("x^2 + 2x + 5 = 0");
    expect(s.roots).toEqual([]);
    expect(s.finalAnswer).toContain("No real solutions");
  });

  it("every step of a factorable quadratic preserves the solution set", () => {
    const s = solve("3x^2 - 7x + 2 = 0");
    expect(s.roots[0]).toBeCloseTo(1 / 3, 9);
    expect(s.roots[1]).toBe(2);
    expect(s.steps.some((st) => st.validation === "failed")).toBe(false);
  });
});

describe("solveProblem — unsupported & invalid input", () => {
  it.each([
    ["", "empty"],
    ["x^2 + 1", "parse"],
    ["2x +* 3 = 1", "parse"],
    ["x + y = 3", "unsupported"],
    ["sqrt(x)/x = 2", "unsupported"],
    ["x^2 + y^2 = 1; x + y = 1", "unsupported"],
    ["x^3 - 1 = 0", "unsupported"],
    ["sqrt(x) = 3", "unsupported"],
    ["3 = 3", "unsupported"],
  ])("rejects %j with code %s and a next step", (input, code) => {
    const r = solveProblem(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe("checkWork", () => {
  it("passes equivalent lines", () => {
    const r = checkWork(["2x + 3 = 11", "2x = 8", "x = 4"]);
    expect(r.map((l) => l.status)).toEqual(["start", "passed", "passed"]);
  });

  it("flags the first wrong step", () => {
    const r = checkWork(["2x + 3 = 11", "2x = 14", "x = 7"]);
    expect(r[1].status).toBe("failed");
  });

  it("explains a lost solution (sqrt without ±)", () => {
    const r = checkWork(["x^2 = 9", "x = 3"]);
    expect(r[1].status).toBe("failed");
    expect(r[1].message).toMatch(/lost/);
  });

  it("explains an extra solution", () => {
    const r = checkWork(["x = 3", "x^2 = 9"]);
    expect(r[1].status).toBe("failed");
    expect(r[1].message).toMatch(/extra/);
  });

  it("marks lines it cannot read as unverified, not wrong", () => {
    const r = checkWork(["x^2 - 5x + 6 = 0", "see my note", "x = 2"]);
    expect(r[1].status).toBe("unverified");
    // the chain restarts after an unreadable line instead of guessing
    expect(r[2].status).toBe("start");
    expect(r[2].message).toMatch(/Fresh start/);
  });
});

describe("checkAnswer", () => {
  const p = "x^2 - 5x + 6 = 0";
  it("accepts the full set in several notations", () => {
    for (const a of ["2, 3", "x=2 or x=3", "x = 3 and x = 2"]) {
      expect(checkAnswer(p, a).status).toBe("correct");
    }
  });
  it("detects incomplete and wrong answers with a reason", () => {
    expect(checkAnswer(p, "x=2").status).toBe("incomplete");
    const wrong = checkAnswer(p, "x=4");
    expect(wrong.status).toBe("incorrect");
    expect(wrong.message).toMatch(/left side/);
  });
  it("accepts fractions and radicals", () => {
    expect(checkAnswer("2x^2 + 3x = 2", "1/2, -2").status).toBe("correct");
    expect(checkAnswer("x^2 = 2", "sqrt(2), -sqrt(2)").status).toBe("correct");
  });
  it("handles unreadable input and no-solution problems", () => {
    expect(checkAnswer(p, "banana").status).toBe("unreadable");
    expect(checkAnswer("x^2 + 1 = 0", "no solution").status).toBe("correct");
  });
});

describe("generatePractice", () => {
  it("always produces a solvable problem with whole-number answers", () => {
    for (let i = 0; i < 200; i++) {
      for (const topic of ["linear-equation", "quadratic-equation"] as const) {
        const p = generatePractice(topic);
        const an = analyzeEquation(p.input);
        expect(an.ok, p.input).toBe(true);
        if (an.ok) {
          const r = realRoots(an.poly);
          expect(r.kind, p.input).toBe("finite");
          if (r.kind === "finite") {
            r.values.forEach((v) => expect(Number.isInteger(v), p.input).toBe(true));
          }
        }
      }
    }
  });
});
