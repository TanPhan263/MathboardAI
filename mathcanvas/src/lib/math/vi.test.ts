import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAnswer, checkWork } from "./check";
import { setMathLang } from "./lang";
import { solveProblem } from "./solve";

/* The solver in Vietnamese: same maths, Vietnamese words, Vietnamese answers accepted. */

describe("Vietnamese (vi)", () => {
  beforeEach(() => setMathLang("vi"));
  afterEach(() => setMathLang("en"));

  it("writes the steps in Vietnamese", () => {
    const r = solveProblem("x^2 - 5*x + 6 = 0", "p");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = r.solution.steps.map((s) => s.operation);
    expect(ops).toContain("Tính biệt thức Δ");
    expect(ops).toContain("Phân tích thành nhân tử");
    expect(r.solution.steps[0].explanation).toMatch(/dạng/);
    expect(r.solution.finalAnswer).toContain("hoặc");
  });

  it("says “vô nghiệm” when there is no real solution", () => {
    const r = solveProblem("x^2 + 1 = 0", "p");
    expect(r.ok && r.solution.finalAnswer).toContain("vô nghiệm");
  });

  it("explains failures in Vietnamese", () => {
    const r = solveProblem("x^3 - 1 = 0", "p");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/bậc/);
  });

  it("accepts answers written the Vietnamese way", () => {
    expect(checkAnswer("x^2 - 5*x + 6 = 0", "x = 2 hoặc x = 3").status).toBe("correct");
    expect(checkAnswer("x^2 + 1 = 0", "Phương trình vô nghiệm").status).toBe("correct");
    expect(checkAnswer("2*x = 5", "x = 2,5").status).toBe("correct");
    expect(checkAnswer("x + y = 5; x - y = 1", "x = 3 và y = 2").status).toBe("correct");
  });

  it("checks work and reports in Vietnamese", () => {
    const res = checkWork(["2*x + 1 = 7", "2*x = 6", "x = 4"]);
    expect(res.at(-1)?.status).toBe("failed");
    expect(res.at(-1)?.message).toMatch(/tập nghiệm/);
  });
});
