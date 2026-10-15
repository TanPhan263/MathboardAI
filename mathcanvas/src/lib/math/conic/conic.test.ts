import katex from "katex";
import { afterEach, describe, expect, it } from "vitest";
import { checkAnswer, checkWork } from "../check";
import { geometryLatex } from "../geometry/display";
import { setMathLang } from "../lang";
import { SAMPLE_PROBLEMS } from "../practice";
import { solveProblem } from "../solve";
import { type ConicAnswer, analyzeConic, conicFigure, isConic } from "./index";
import { conicPractice } from "./practice";

afterEach(() => setMathLang("en"));

const answers = (s: string): ConicAnswer[] => {
  const r = analyzeConic(s);
  if ("ok" in r) throw new Error(r.message);
  expect(r.steps.drafts.every((d) => d.validation === "passed"), s).toBe(true);
  return r.answers;
};
const latex = (s: string) => answers(s).map((a) => a.latex);

describe("routing", () => {
  it("claims conics, not quadratic functions or circles", () => {
    expect(isConic("Cho elip (E): x^2/25 + y^2/9 = 1. Tìm tiêu điểm.")).toBe(true);
    expect(isConic("(H): x^2/16 - y^2/9 = 1")).toBe(true);
    expect(isConic("Viết phương trình chính tắc của parabol có tiêu điểm F(2; 0).")).toBe(true);
    expect(isConic("y^2 = 8x")).toBe(true);
    expect(isConic("Vẽ đồ thị parabol y = x^2 - 4x + 3")).toBe(false);
    expect(isConic("Cho đường tròn (C): x^2 + y^2 = 4 và A(1; 2).")).toBe(false);
    expect(isConic("x^2 - 5x + 6 = 0")).toBe(false);
  });
});

describe("elements from the equation", () => {
  it("ellipse, from any form, with focal radii of a point", () => {
    setMathLang("vi");
    expect(latex("Cho elip (E): 9x^2 + 25y^2 = 225. Tìm tọa độ tiêu điểm, đỉnh, độ dài các trục, tiêu cự và tâm sai. Điểm M thuộc (E) có hoành độ bằng 3, tính MF1, MF2.")).toEqual([
      "F_1\\left(-4;\\ 0\\right),\\ F_2\\left(4;\\ 0\\right)",
      "A_1\\left(-5;\\ 0\\right),\\ A_2\\left(5;\\ 0\\right),\\ B_1\\left(0;\\ -3\\right),\\ B_2\\left(0;\\ 3\\right)",
      "2a = 10",
      "2b = 6",
      "2c = 8",
      "e = \\frac{4}{5}",
      "MF_1 = \\frac{37}{5}",
      "MF_2 = \\frac{13}{5}",
    ]);
  });

  it("hyperbola with asymptotes; parabola with focus and directrix", () => {
    expect(latex("(H): x^2/16 - y^2/9 = 1. Find the eccentricity and the asymptotes.")).toEqual(["e = \\frac{5}{4}", "y = \\pm \\frac{3}{4}x"]);
    expect(latex("Cho parabol (P): y^2 = 8x. Tìm tiêu điểm và đường chuẩn.")).toEqual(["F\\left(2,\\ 0\\right)", "\\Delta:\\ x = -2"]);
    expect(latex("Ellipse x^2/8 + y^2/4 = 1: find its foci.")).toEqual(["F_1\\left(-2,\\ 0\\right),\\ F_2\\left(2,\\ 0\\right)"]);
  });
});

describe("the standard equation from data", () => {
  it("ellipse from axes, focus and point, or two points", () => {
    setMathLang("vi");
    expect(latex("Viết phương trình chính tắc của elip có độ dài trục lớn bằng 10 và tiêu cự bằng 6.")).toEqual(["(E): \\frac{x^2}{25} + \\frac{y^2}{16} = 1"]);
    expect(latex("Lập phương trình chính tắc của elip có một tiêu điểm F1(-3; 0) và đi qua điểm M(0; 4).")).toEqual(["(E): \\frac{x^2}{25} + \\frac{y^2}{16} = 1"]);
    expect(latex("Viết phương trình chính tắc của elip đi qua hai điểm M(√5; 4/3) và N(0; 2).")).toEqual(["(E): \\frac{x^2}{9} + \\frac{y^2}{4} = 1"]);
    expect(latex("Viết phương trình chính tắc của elip có tâm sai e = 3/5 và trục lớn bằng 10.")).toEqual(["(E): \\frac{x^2}{25} + \\frac{y^2}{16} = 1"]);
  });

  it("hyperbola from a focus and a point (a quadratic in b²); parabola from a point", () => {
    expect(latex("Write the standard equation of the hyperbola with a focus F(5; 0) that passes through M(4√2; 3).")).toEqual(["(H): \\frac{x^2}{16} - \\frac{y^2}{9} = 1"]);
    expect(latex("Write the standard equation of the hyperbola with transverse axis 8 and asymptotes y = ±(3/4)x.")).toEqual(["(H): \\frac{x^2}{16} - \\frac{y^2}{9} = 1"]);
    setMathLang("vi");
    expect(latex("Viết phương trình chính tắc của parabol đi qua điểm M(2; 4), tìm tiêu điểm và đường chuẩn.")).toEqual(["(P): y^2 = 8x", "F\\left(2;\\ 0\\right)", "\\Delta:\\ x = -2"]);
    expect(latex("Viết phương trình chính tắc của parabol có đường chuẩn x = -3.")).toEqual(["(P): y^2 = 12x"]);
  });
});

describe("checking, figures, practice and examples", () => {
  it("checks equations, points and numbers, and names common slips", () => {
    const p = "Viết phương trình chính tắc của elip có độ dài trục lớn bằng 10 và tiêu cự bằng 6.";
    expect(checkAnswer(p, "x^2/25 + y^2/16 = 1").status).toBe("correct");
    expect(checkAnswer(p, "16x^2 + 25y^2 = 400").status).toBe("correct");
    expect(checkAnswer(p, "x^2/16 + y^2/25 = 1").message).toMatch(/swapped|đổi chỗ/);
    const q = "Cho elip (E): x^2/25 + y^2/9 = 1. Tìm tiêu điểm và tiêu cự.";
    expect(checkAnswer(q, "(4; 0)").status).toBe("correct");
    expect(checkAnswer(q, "8").status).toBe("correct");
    expect(checkAnswer(q, "4").message).toMatch(/half|nửa/);
    expect(checkWork([q, "2c = 8"]).map((l) => l.status)).toEqual(["start", "passed"]);
  });

  it("draws the curve with its foci", () => {
    const f = conicFigure("(H): x^2/16 - y^2/9 = 1");
    expect(f.ok && f.equal).toBe(true);
    expect(f.ok && f.marks.map((m) => m.label)).toEqual(expect.arrayContaining(["F₁", "F₂", "A₁", "A₂"]));
    expect(f.ok && f.curves[0].segments).toHaveLength(2);
  });

  it("practice problems are solvable and accept their own answers", () => {
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 30; i++) {
      const pr = conicPractice(rng);
      const a = answers(pr.input)[0];
      const c = a.conic;
      const typed = c
        ? c.kind === "parabola"
          ? `y^2 = ${c.k.n / c.k.d}x`
          : `x^2/${c.a2.n / c.a2.d} ${c.kind === "ellipse" ? "+" : "-"} y^2/${c.b2.n / c.b2.d} = 1`
        : String(a.value);
      expect(checkAnswer(pr.input, typed).status, pr.input).toBe("correct");
    }
  });

  it("solves and typesets the Conics examples in both languages", () => {
    for (const s of SAMPLE_PROBLEMS.filter((x) => x.group === "Conics")) {
      for (const lang of ["en", "vi"] as const) {
        setMathLang(lang);
        const input = typeof s.input === "string" ? s.input : s.input[lang];
        const r = solveProblem(input);
        expect(r.ok, `${lang}: ${input} → ${!r.ok ? r.message : ""}`).toBe(true);
        const tex = geometryLatex(input);
        expect(() => katex.renderToString(tex, { throwOnError: true, strict: "ignore" }), tex).not.toThrow();
        if (r.ok) {
          expect(r.solution.topic).toBe("conic");
          for (const st of r.solution.steps) expect(() => katex.renderToString(st.latex, { throwOnError: true, strict: "ignore" }), st.latex).not.toThrow();
        }
      }
    }
  });
});
