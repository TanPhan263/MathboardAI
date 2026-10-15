import { describe, expect, it } from "vitest";
import { rat } from "./rational";
import { addS, divS, fromInt, mulS, negS, sqrtOf, surdAscii, surdLatex, toNum } from "./surd";

describe("surd", () => {
  it("simplifies square roots", () => {
    expect(surdLatex(sqrtOf(rat(12)))).toBe("2\\sqrt{3}");
    expect(surdLatex(sqrtOf(rat(9, 2)))).toBe("\\frac{3\\sqrt{2}}{2}");
    expect(surdLatex(sqrtOf(rat(16)))).toBe("4");
    expect(surdLatex(sqrtOf(rat(0)))).toBe("0");
  });

  it("adds, multiplies and rationalises", () => {
    const r2 = sqrtOf(rat(2));
    expect(surdLatex(mulS(r2, sqrtOf(rat(6))))).toBe("2\\sqrt{3}");
    expect(surdLatex(addS(fromInt(1), sqrtOf(rat(5))))).toBe("1 + \\sqrt{5}");
    expect(surdLatex(divS(fromInt(3), sqrtOf(rat(84)))!)).toBe("\\frac{\\sqrt{21}}{14}");
    expect(surdLatex(divS(fromInt(1), addS(fromInt(1), r2))!)).toBe("-1 + \\sqrt{2}");
    expect(surdLatex(negS(sqrtOf(rat(1, 3))))).toBe("-\\frac{\\sqrt{3}}{3}");
  });

  it("evaluates and prints for the parser", () => {
    const s = addS(fromInt(2), sqrtOf(rat(8)));
    expect(toNum(s)).toBeCloseTo(2 + Math.sqrt(8));
    expect(surdAscii(s)).toBe("(2)+(2)*sqrt(2)");
  });
});
