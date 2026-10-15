import katex from "katex";
import { afterEach, describe, expect, it } from "vitest";
import { checkAnswer } from "../check";
import { geometryLatex } from "../geometry/display";
import { setMathLang } from "../lang";
import { SAMPLE_PROBLEMS } from "../practice";
import { solveProblem } from "../solve";
import { analyzeVector, isVectorProblem, vectorFigure } from "./index";
import { vectorPractice } from "./practice";

afterEach(() => setMathLang("en"));

const run = (s: string) => {
  const r = analyzeVector(s);
  if ("ok" in r) throw new Error(r.message);
  return r;
};
const latex = (s: string) => run(s).answers.map((a) => a.latex);

describe("routing", () => {
  it("takes vectors in a figure, not coordinates or solids", () => {
    expect(isVectorProblem("Cho tam giác ABC có trọng tâm G. Chứng minh vectơ GA + vectơ GB + vectơ GC = vectơ 0.")).toBe(true);
    expect(isVectorProblem("Cho A(1; 2), B(3; 4). Tìm tọa độ vectơ AB.")).toBe(false);
    expect(isVectorProblem("Cho hình chóp S.ABCD có đáy là hình vuông. Chứng minh vectơ SA + vectơ SC = vectơ SB + vectơ SD.")).toBe(false);
  });
});

describe("identities", () => {
  it("proves by writing every vector from one origin; an arbitrary point is the origin", () => {
    setMathLang("vi");
    expect(latex("Cho tam giác ABC có trọng tâm G. Chứng minh vectơ GA + vectơ GB + vectơ GC = vectơ 0.")).toEqual(["\\overrightarrow{GA} + \\overrightarrow{GB} + \\overrightarrow{GC} = \\overrightarrow{0}\\ \\checkmark"]);
    const r = run("Cho tam giác ABC có trọng tâm G. Chứng minh rằng với mọi điểm M: vectơ MA + vectơ MB + vectơ MC = 3 vectơ MG.");
    expect(r.answers[0].latex).toMatch(/checkmark/);
    expect(r.steps.drafts[0].latex).toContain("\\overrightarrow{MG} = \\frac{1}{3}\\overrightarrow{MA}");
    expect(latex("Cho bốn điểm A, B, C, D. Chứng minh vectơ AB + vectơ CD = vectơ AD + vectơ CB.")[0]).toMatch(/checkmark/);
    expect(latex("Cho hình bình hành ABCD. Chứng minh vectơ AB + vectơ AD = vectơ AC.")[0]).toMatch(/checkmark/);
  });

  it("says when a claim is false, and asks about a point it doesn't know", () => {
    expect(latex("Cho tam giác ABC. Chứng minh vectơ AB + vectơ BC = vectơ AB.")[0]).toMatch(/false/);
    const r = analyzeVector("Cho tam giác ABC có trọng tâm G. Chứng minh vectơ MA + vectơ MB + vectơ MC = 3 vectơ MG.");
    expect("ok" in r && r.message).toMatch(/M/);
  });
});

describe("decompose, locate and measure", () => {
  it("writes a vector in terms of two others", () => {
    expect(latex("Cho tam giác ABC, N thuộc cạnh AC sao cho AN = 2NC, M là trung điểm BC. Phân tích vectơ MN theo vectơ AB và vectơ AC.")).toEqual(["\\overrightarrow{MN} = -\\frac{1}{2}\\overrightarrow{AB} + \\frac{1}{6}\\overrightarrow{AC}"]);
  });

  it("finds the point a vector equation defines", () => {
    expect(latex("Cho hình bình hành ABCD tâm O. Xác định điểm M thỏa mãn vectơ MA + vectơ MB + vectơ MC + vectơ MD = vectơ 0 và điểm N thỏa mãn vectơ NA + 2 vectơ NB = vectơ 0.")).toEqual(["M \\equiv O", "N \\in AB,\\ \\overrightarrow{AN} = \\frac{2}{3}\\overrightarrow{AB}"]);
  });

  it("dot products, lengths and angles", () => {
    expect(latex("Cho tam giác đều ABC cạnh a. Tính tích vô hướng AB.AC, AB.BC, độ dài |vectơ AB + vectơ AC| và góc giữa vectơ AB và vectơ BC.")).toEqual([
      "\\overrightarrow{AB}\\cdot \\overrightarrow{AC} = \\frac{a^2}{2}",
      "\\overrightarrow{AB}\\cdot \\overrightarrow{BC} = -\\frac{a^2}{2}",
      "\\left|\\overrightarrow{AB} + \\overrightarrow{AC}\\right| = a\\sqrt{3}",
      "\\left(\\overrightarrow{AB}, \\overrightarrow{BC}\\right) = 120^\\circ",
    ]);
    expect(latex("Cho hình vuông ABCD cạnh a. Tính AB.AC và AC.BD.")).toEqual(["\\overrightarrow{AB}\\cdot \\overrightarrow{AC} = a^2", "\\overrightarrow{AC}\\cdot \\overrightarrow{BD} = 0"]);
  });
});

describe("checking, figure, practice and examples", () => {
  it("accepts equal vector expressions and numbers, and flags a wrong sign", () => {
    const p = "Cho tam giác ABC, M là trung điểm BC. Phân tích vectơ AM theo vectơ AB và vectơ AC.";
    expect(checkAnswer(p, "AM = 1/2 AB + 1/2 AC").status).toBe("correct");
    expect(checkAnswer(p, "AM = AB + AC").status).toBe("incorrect");
    const q = "Cho tam giác đều ABC cạnh a. Tính tích vô hướng AB.BC.";
    expect(checkAnswer(q, "-a^2/2").status).toBe("correct");
    expect(checkAnswer(q, "a^2/2").message).toMatch(/sign|dấu/);
  });

  it("draws the figure with the point it found", () => {
    const f = vectorFigure("Cho hình bình hành ABCD. Xác định điểm N thỏa mãn vectơ NA + 2 vectơ NB = vectơ 0.");
    expect(f.ok && f.marks.find((m) => m.label === "N")?.given).toBe(false);
  });

  it("practice problems accept their own answers", () => {
    let seed = 3;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 30; i++) {
      const pr = vectorPractice(rng);
      const a = run(pr.input).answers[0];
      const typed = a.value !== null ? String(a.value) : a.latex.replace(/\\overrightarrow\{(\w+)\}/g, "$1").replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "$1/$2");
      expect(checkAnswer(pr.input, typed).status, `${pr.input} → ${typed}`).toBe("correct");
    }
  });

  it("solves and typesets the Vectors examples in both languages", () => {
    for (const s of SAMPLE_PROBLEMS.filter((x) => x.group === "Vectors")) {
      for (const lang of ["en", "vi"] as const) {
        setMathLang(lang);
        const input = typeof s.input === "string" ? s.input : s.input[lang];
        const r = solveProblem(input);
        expect(r.ok, `${lang}: ${input} → ${!r.ok ? r.message : ""}`).toBe(true);
        expect(() => katex.renderToString(geometryLatex(input), { throwOnError: true, strict: "ignore" })).not.toThrow();
        if (r.ok) {
          expect(r.solution.topic).toBe("vector");
          expect(r.solution.steps.every((st) => st.validation !== "failed")).toBe(true);
          for (const st of r.solution.steps) expect(() => katex.renderToString(st.latex, { throwOnError: true, strict: "ignore" }), st.latex).not.toThrow();
        }
      }
    }
  });
});
