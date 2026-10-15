import katex from "katex";
import { afterEach, describe, expect, it } from "vitest";
import { checkAnswer, checkWork } from "../check";
import { geometryLatex } from "../geometry/display";
import { setMathLang } from "../lang";
import { SAMPLE_PROBLEMS } from "../practice";
import { solveProblem } from "../solve";
import { analyzeMeasure, isMeasure, measureFigure } from "./index";
import { measureTex, recognize } from "./num";
import { measurePractice } from "./practice";

afterEach(() => setMathLang("en"));

const answers = (s: string) => {
  const r = analyzeMeasure(s);
  if ("ok" in r) throw new Error(r.message);
  return r;
};
const latex = (s: string) => answers(s).answers.map((a) => a.latex);

describe("exact display of measures", () => {
  it("recognises √ multiples and writes them the textbook way", () => {
    expect(recognize(Math.sqrt(12))).toEqual([{ c: { n: 2, d: 1 }, m: 3 }]);
    expect(recognize(Math.PI)).toBeNull();
    expect(measureTex(Math.sqrt(2) / 3, "a", 3)).toBe("\\frac{a^3\\sqrt{2}}{3}");
    expect(measureTex(Math.sqrt(6) / 3, "a", 1)).toBe("\\frac{a\\sqrt{6}}{3}");
    expect(measureTex((16 * Math.PI) / 3, null, 3, true)).toBe("\\frac{16\\pi}{3}");
    expect(measureTex(2 * Math.sqrt(3), "a")).toBe("2a\\sqrt{3}");
    expect(measureTex(11.153550716504107)).toBe("\\approx 11.1536");
  });
});

describe("routing", () => {
  it("tells measure problems from coordinates and algebra", () => {
    expect(isMeasure("Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°.")).toBe(true);
    expect(isMeasure("Tính thể tích khối cầu bán kính 3.")).toBe(true);
    expect(isMeasure("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a")).toBe(true);
    expect(isMeasure("Trong không gian Oxyz cho (S): x^2 + y^2 + z^2 = 9")).toBe(false);
    expect(isMeasure("Cho tam giác ABC với A(0; 0), B(4; 0), C(0; 3).")).toBe(false);
    expect(isMeasure("x^2 - 5x + 6 = 0")).toBe(false);
  });
});

describe("triangles", () => {
  it("SAS, SSS and ASA, answers in the order asked", () => {
    expect(latex("Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC, diện tích tam giác ABC và bán kính đường tròn ngoại tiếp.")).toEqual(["BC = 7", "S = 10\\sqrt{3}", "R = \\frac{7\\sqrt{3}}{3}"]);
    expect(latex("Tam giác ABC có a = 7, b = 8, c = 5. Tính góc A, diện tích, r, đường cao AH và trung tuyến AM.")).toEqual(["\\hat{A} = 60^\\circ", "S = 10\\sqrt{3}", "r = \\sqrt{3}", "AH = \\frac{20\\sqrt{3}}{7}", "AM = \\frac{\\sqrt{129}}{2}"]);
    expect(latex("Cho tam giác ABC có BC = 10, góc B = 45°, góc C = 75°. Tính AB, AC.")).toEqual(["AB \\approx 11.1536", "AC = \\frac{10\\sqrt{6}}{3}"]);
  });

  it("works in terms of a, and rejects impossible triangles", () => {
    expect(latex("Cho tam giác đều ABC cạnh a. Tính diện tích và bán kính đường tròn ngoại tiếp.")).toEqual(["S = \\frac{a^2\\sqrt{3}}{4}", "R = \\frac{a\\sqrt{3}}{3}"]);
    const r = solveProblem("Tam giác ABC có AB = 1, BC = 2, CA = 5. Tính diện tích.");
    expect(!r.ok && r.message).toMatch(/triangle inequality/);
  });

  it("verifies every triangle it solves", () => {
    const r = answers("Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC.");
    expect(r.steps.drafts.at(-1)?.kind).toBe("verify");
    expect(r.steps.drafts.every((d) => d.validation === "passed")).toBe(true);
  });
});

describe("solids by formula", () => {
  it("keeps π and the unit letter", () => {
    expect(latex("Khối nón có bán kính đáy r = 3, chiều cao h = 4. Tính thể tích, diện tích xung quanh và diện tích toàn phần.")).toEqual(["V = 12\\pi", "S_{xq} = 15\\pi", "S_{tp} = 24\\pi"]);
    expect(latex("Cho hình nón có thiết diện qua trục là tam giác đều cạnh 2a. Tính thể tích khối nón.")).toEqual(["V = \\frac{\\pi a^3\\sqrt{3}}{3}"]);
    expect(latex("Tính thể tích khối cầu bán kính 3.")).toEqual(["V = 36\\pi"]);
    expect(latex("Khối chóp có diện tích đáy B = 6 và chiều cao h = 5. Tính thể tích.")).toEqual(["V = 10"]);
  });
});

describe("pyramids and prisms", () => {
  const sq = "Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2.";
  it("volume, angles and distances, each with a construction checked by coordinates", () => {
    const r = answers(`${sq} Tính thể tích khối chóp S.ABCD, góc giữa SC và (ABCD), góc giữa (SBC) và (ABCD), khoảng cách từ A đến (SBC).`);
    expect(r.answers.map((a) => a.latex)).toEqual([
      "V_{S.ABCD} = \\frac{a^3\\sqrt{2}}{3}",
      "\\left(SC, (ABCD)\\right) = 45^\\circ",
      "\\left((SBC), (ABCD)\\right) \\approx 54.74^\\circ",
      "d\\left(A, (SBC)\\right) = \\frac{a\\sqrt{6}}{3}",
    ]);
    expect(r.steps.drafts.filter((d) => d.kind === "verify")).toHaveLength(3);
    expect(r.steps.drafts.every((d) => d.validation === "passed")).toBe(true);
  });

  it("reads heights from angles, faces and lateral edges", () => {
    expect(latex("Cho hình chóp S.ABC có đáy là tam giác đều cạnh a, SA ⊥ (ABC), góc giữa SB và đáy bằng 60°. Tính thể tích khối chóp và khoảng cách từ A đến (SBC).")).toEqual(["V_{S.ABC} = \\frac{a^3}{4}", "d\\left(A, (SBC)\\right) = \\frac{a\\sqrt{15}}{5}"]);
    expect(latex("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, tam giác SAB đều và nằm trong mặt phẳng vuông góc với đáy. Tính thể tích khối chóp S.ABCD.")).toEqual(["V_{S.ABCD} = \\frac{a^3\\sqrt{3}}{6}"]);
    expect(latex("Cho hình chóp tứ giác đều S.ABCD có cạnh đáy a, cạnh bên 2a. Tính thể tích và góc giữa cạnh bên và mặt đáy.")).toEqual(["V_{S.ABCD} = \\frac{a^3\\sqrt{14}}{6}", "\\left(SA, (ABCD)\\right) \\approx 69.3^\\circ"]);
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình chữ nhật, AB = a, AD = 2a, SA ⊥ (ABCD), góc giữa (SCD) và (ABCD) bằng 45°. Tính thể tích và khoảng cách từ B đến (SCD).")).toEqual(["V_{S.ABCD} = \\frac{4a^3}{3}", "d\\left(B, (SCD)\\right) = a\\sqrt{2}"]);
    expect(latex("Cho tứ diện OABC có OA, OB, OC đôi một vuông góc, OA = a, OB = 2a, OC = 3a. Tính thể tích và khoảng cách từ O đến (ABC).")).toEqual(["V_{OABC} = a^3", "d\\left(O, (ABC)\\right) = \\frac{6a}{7}"]);
  });

  it("prisms and cubes", () => {
    expect(latex("Cho lăng trụ đứng ABC.A'B'C' có đáy là tam giác đều cạnh a, AA' = a√3. Tính thể tích.")).toEqual(["V_{ABC.A'B'C'} = \\frac{3a^3}{4}"]);
    expect(latex("Cho hình lập phương ABCD.A'B'C'D' cạnh a. Tính góc giữa A'C và (ABCD), khoảng cách giữa AB và CD'.")).toEqual(["\\left(A'C, (ABCD)\\right) \\approx 35.26^\\circ", "d\\left(AB, CD'\\right) = a"]);
  });

  it("asks for a height only when a measure needs it", () => {
    const r = solveProblem("Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD). Tính thể tích.");
    expect(!r.ok && r.message).toMatch(/chiều cao|height/);
  });
});

describe("more bases, slanted prisms, dihedral angles and skew lines", () => {
  const steps = (s: string) => answers(s).steps.drafts;
  it("rhombus, parallelogram, trapezoid, half hexagon and general triangle bases", () => {
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình thoi cạnh a, góc BAD = 60°, SA ⊥ (ABCD), SA = a. Tính thể tích khối chóp.")).toEqual(["V_{S.ABCD} = \\frac{a^3\\sqrt{3}}{6}"]);
    expect(latex("Cho hình chóp S.ABCD có đáy là hình thoi tâm O cạnh a, góc ABC = 60°, SO ⊥ (ABCD), SO = a. Tính khoảng cách từ O đến (SBC).")).toEqual(["d\\left(O, (SBC)\\right) = \\frac{a\\sqrt{57}}{19}"]);
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình bình hành, AB = a, AD = 2a, góc BAD = 60°, SA ⊥ (ABCD), SA = a. Tính thể tích.")).toEqual(["V_{S.ABCD} = \\frac{a^3\\sqrt{3}}{3}"]);
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình thang vuông tại A và B, AB = BC = a, AD = 2a, SA ⊥ (ABCD), SA = a√2. Tính thể tích, góc giữa SC và (ABCD).")).toEqual(["V_{S.ABCD} = \\frac{a^3\\sqrt{2}}{2}", "\\left(SC, (ABCD)\\right) = 45^\\circ"]);
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là nửa lục giác đều nội tiếp đường tròn đường kính AD = 2a, SA ⊥ (ABCD), SA = a√6. Tính khoảng cách từ A đến (SCD).")).toEqual(["d\\left(A, (SCD)\\right) = a\\sqrt{2}"]);
    expect(latex("Cho hình chóp S.ABC có đáy ABC là tam giác cân tại A, AB = AC = a, góc BAC = 120°, SA ⊥ (ABC), SA = a. Tính thể tích và góc giữa (SBC) và (ABC).")).toEqual(["V_{S.ABC} = \\frac{a^3\\sqrt{3}}{12}", "\\left((SBC), (ABC)\\right) \\approx 63.43^\\circ"]);
    expect(latex("Cho hình chóp S.ABC có SA ⊥ (ABC), tam giác ABC vuông tại B, AB = a, góc ACB = 30°, SA = a. Tính thể tích.")).toEqual(["V_{S.ABC} = \\frac{a^3\\sqrt{3}}{6}"]);
  });

  it("apex over the circumcentre or a point dividing an edge; slanted and right prisms", () => {
    expect(latex("Cho hình chóp S.ABC có đáy ABC là tam giác vuông tại B, AB = a, BC = a√3, SA = SB = SC = 2a. Tính thể tích.")).toEqual(["V_{S.ABC} = \\frac{a^3}{2}"]);
    expect(latex("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, H thuộc cạnh AB sao cho AH = 2HB, SH ⊥ (ABCD), SH = a. Tính thể tích và khoảng cách từ H đến (SCD).")).toEqual(["V_{S.ABCD} = \\frac{a^3}{3}", "d\\left(H, (SCD)\\right) = \\frac{a\\sqrt{2}}{2}"]);
    expect(latex("Cho lăng trụ ABC.A'B'C' có đáy là tam giác đều cạnh a, hình chiếu vuông góc của A' lên (ABC) là trung điểm của BC, góc giữa AA' và (ABC) bằng 60°. Tính thể tích khối lăng trụ.")).toEqual(["V_{ABC.A'B'C'} = \\frac{3a^3\\sqrt{3}}{8}"]);
    expect(latex("Cho hình hộp đứng ABCD.A'B'C'D' có đáy là hình thoi cạnh a, góc BAD = 60°, AA' = a. Tính thể tích.")).toEqual(["V_{ABCD.A'B'C'D'} = \\frac{a^3\\sqrt{3}}{2}"]);
  });

  it("dihedral angles, with the plane angle constructed", () => {
    const p = "Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Tính số đo góc nhị diện [S, BC, A] và góc nhị diện [B, SC, D].";
    expect(latex(p)).toEqual(["\\left[S, BC, A\\right] = 45^\\circ", "\\left[B, SC, D\\right] = 120^\\circ"]);
    const d = steps(p);
    expect(d.every((x) => x.validation === "passed")).toBe(true);
    expect(d.filter((x) => x.kind === "verify")).toHaveLength(2);
  });

  it("skew lines: common perpendicular, a perpendicular plane, a parallel plane", () => {
    const p = "Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2. Tính khoảng cách giữa AB và SC, khoảng cách giữa BD và SC, khoảng cách giữa SA và BC.";
    expect(latex(p)).toEqual(["d\\left(AB, SC\\right) = \\frac{a\\sqrt{6}}{3}", "d\\left(BD, SC\\right) = \\frac{a}{2}", "d\\left(SA, BC\\right) = a"]);
    const d = steps(p);
    expect(d.filter((x) => x.kind === "verify")).toHaveLength(3);
    expect(d.every((x) => x.validation === "passed")).toBe(true);
    expect(d.map((x) => x.latex).join(" ")).toContain("\\backsim");
  });

  it("angles between lines by a parallel, and the converse of Pythagoras in the base", () => {
    setMathLang("vi");
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Tính góc giữa SB và CD, góc giữa SC và BD.")).toEqual(["\\left(SB, CD\\right) = 45^\\circ", "\\left(SC, BD\\right) = 90^\\circ"]);
    const t = answers("Cho hình chóp S.ABCD có đáy ABCD là hình thang vuông tại A và B, AB = BC = a, AD = 2a, SA ⊥ (ABCD). Chứng minh CD ⊥ (SAC).");
    expect(t.answers[0].latex).toBe("CD \\perp (SAC)\\ \\checkmark");
    expect(t.steps.drafts[0].latex).toContain("= AD^2");
    expect(t.notes).toEqual([]);
  });
});

describe("parallel relations (grade 11): intersections and sections", () => {
  const all = (s: string) => {
    const r = answers(s);
    return r.steps.drafts.map((d) => d.latex).join(" ");
  };
  it("intersection lines from common points, lines meeting in the base, or parallels", () => {
    setMathLang("vi");
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Tìm giao tuyến của (SAC) và (SBD), giao tuyến của (SAB) và (SCD).")).toEqual(["(SAC) \\cap (SBD) = SO", "(SAB) \\cap (SCD) = Sx \\parallel AB"]);
    const t = "Cho hình chóp S.ABCD có đáy ABCD là hình thang, AD // BC, AD > BC. Tìm giao tuyến của (SAB) và (SCD), giao tuyến của (SAD) và (SBC).";
    expect(latex(t)).toEqual(["(SAB) \\cap (SCD) = SE", "(SAD) \\cap (SBC) = Sx \\parallel AD"]);
    expect(all(t)).toContain("hình thang có AD $\\parallel$ BC");
    // Several pairs after one “giao tuyến của”, on a base with no shape given.
    expect(latex("Cho hình chóp S.ABCD có AB và CD cắt nhau tại E, AD và BC cắt nhau tại F. Tìm giao tuyến của (SAB) và (SCD), (SAD) và (SBC).")).toEqual(["(SAB) \\cap (SCD) = SE", "(SAD) \\cap (SBC) = SF"]);
  });

  it("any tetrahedron ABCD, with or without data", () => {
    setMathLang("vi");
    expect(latex("Cho tứ diện ABCD. Gọi M, N lần lượt là trung điểm AB, CD và P thuộc AD sao cho AP = 2PD. Tìm thiết diện của tứ diện với mặt phẳng (MNP).")).toEqual(["\\text{Thiết diện: }MQNP\\ (\\text{tứ giác})"]);
    // The apex is the vertex off the face it stands perpendicular to; the base triangle comes from its sides.
    expect(latex("Cho tứ diện ABCD có AB ⊥ (BCD), BC = a, BD = a, CD = a√2, AB = a. Tính thể tích tứ diện ABCD.")).toEqual(["V_{ABCD} = \\frac{a^3}{6}"]);
    expect(latex("Cho tứ diện ABCD có DA ⊥ (ABC), tam giác ABC đều cạnh a, DA = a. Tính thể tích tứ diện.")).toEqual(["V_{ABCD} = \\frac{a^3\\sqrt{3}}{12}"]);
  });

  it("where a line meets a plane, directly or through an auxiliary plane", () => {
    setMathLang("vi");
    expect(latex("Cho hình chóp S.ABCD có đáy là hình bình hành tâm O. M là trung điểm SC. Tìm giao điểm của AM và (SBD).")).toEqual(["AM \\cap (SBD) = I"]);
    const r = answers("Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Gọi M là trung điểm SD. Tìm giao điểm của BM và (SAC). Tính thể tích.");
    expect(r.answers.map((a) => a.latex)).toEqual(["BM \\cap (SAC) = I"]);
    expect(r.steps.drafts[0].latex).toContain("AC \\cap BD = O");
    // The volume can't be found without where S stands: a note, not a failure.
    expect(r.notes.join(" ")).toMatch(/vị trí của S/);
  });

  it("cross-sections by three points or by a plane parallel to given lines", () => {
    setMathLang("vi");
    expect(latex("Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Gọi M, N, P lần lượt là trung điểm của SA, SB, SC. Tìm thiết diện của hình chóp với mặt phẳng (MNP).")).toEqual(["\\text{Thiết diện: }MNPQ\\ (\\text{hình bình hành})"]);
    const alpha = "Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. M là trung điểm của AB. Mặt phẳng (α) qua M và song song với SA, BC. Tìm thiết diện của hình chóp với (α).";
    expect(latex(alpha)).toEqual(["\\text{Thiết diện: }MNPQ\\ (\\text{hình thang})"]);
    expect(all(alpha)).toContain("(\\alpha) \\cap (SBC) = QP,\\ QP \\parallel BC");
    const five = answers("Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Gọi M, N lần lượt là trung điểm của AB, AD và P là trung điểm SC. Tìm thiết diện của hình chóp với (MNP).");
    expect(five.answers[0].latex).toMatch(/^\\text\{Thiết diện: \}MN\w{3}\\ \(\\text\{ngũ giác\}\)$/);
    expect(five.steps.drafts.every((d) => d.validation === "passed")).toBe(true);
  });

  it("parallel planes, and prisms with no shape given", () => {
    setMathLang("vi");
    const r = answers("Cho hình chóp S.ABCD có đáy là hình bình hành tâm O. Gọi M, N lần lượt là trung điểm SA, SD. Chứng minh (OMN) // (SBC).");
    expect(r.answers[0].latex).toBe("(OMN) \\parallel (SBC)\\ \\checkmark");
    expect(r.steps.drafts[0].latex).toContain("đường trung bình của tam giác SAC");
    expect(latex("Cho lăng trụ ABC.A'B'C'. Gọi M, N lần lượt là trung điểm của BC và B'C'. Chứng minh MN // (ABB'A').")).toEqual(["MN \\parallel (ABB'A')\\ \\checkmark"]);
  });
});

describe("proofs", () => {
  it("writes textbook arguments, citing what was shown before", () => {
    setMathLang("vi");
    const r = answers("Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD). Chứng minh BC ⊥ (SAB), BD ⊥ (SAC) và (SBC) ⊥ (SAB).");
    expect(r.answers.map((a) => a.latex)).toEqual(["BC \\perp (SAB)\\ \\checkmark", "BD \\perp (SAC)\\ \\checkmark", "(SBC) \\perp (SAB)\\ \\checkmark"]);
    const [first, , third] = r.steps.drafts.map((d) => d.latex);
    expect(first).toContain("BC \\perp AB\\ (\\text{ABCD là hình vuông})");
    expect(first).toContain("BC \\perp SA");
    expect(third).toContain("chứng minh trên");
  });

  it("chains a sub-proof (AH ⊥ (SBC) needs BC ⊥ (SAB)) and uses midlines for ∥", () => {
    setMathLang("vi");
    const ah = answers("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Gọi H là hình chiếu của A lên SB. Chứng minh AH ⊥ (SBC).");
    expect(ah.steps.drafts.map((d) => d.latex.split("\\Rightarrow\\ ").at(-1)?.trim())).toEqual(["BC \\perp (SAB)", "AH \\perp (SBC)"]);
    const mn = answers("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. M, N lần lượt là trung điểm của SB, SC. Chứng minh MN // (ABCD).");
    expect(mn.steps.drafts[0].latex).toContain("đường trung bình của tam giác SBC");
  });

  it("says when a claim is false", () => {
    const r = answers("Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Chứng minh SC ⊥ (SAB).");
    expect(r.answers[0].latex).toMatch(/false/);
  });
});

describe("checking answers", () => {
  const p = "Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2. Tính thể tích khối chóp S.ABCD.";
  it("reads answers in terms of a and with π, and explains common slips", () => {
    expect(checkAnswer(p, "a^3√2/3").status).toBe("correct");
    expect(checkAnswer(p, "V = (a^3 sqrt(2))/3").status).toBe("correct");
    expect(checkAnswer(p, "a^3√2").message).toMatch(/1\/3/);
    expect(checkAnswer("Tính thể tích khối cầu bán kính 3.", "36π").status).toBe("correct");
    expect(checkAnswer("Tính thể tích khối cầu bán kính 3.", "36").message).toMatch(/π/);
    expect(checkAnswer("Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC.", "BC = 7").status).toBe("correct");
  });

  it("ticks a line of working that matches an answer", () => {
    expect(checkWork([p, "V = a^3√2/3"]).map((l) => l.status)).toEqual(["start", "passed"]);
  });
});

describe("practice", () => {
  it("always makes a problem it can solve, whose answer it accepts", () => {
    let seed = 11;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const topic of ["triangle", "solid", "space-figure"] as const) {
      for (let i = 0; i < 40; i++) {
        const pr = measurePractice(topic, rng);
        const r = answers(pr.input);
        expect(r.answers.length, pr.input).toBeGreaterThan(0);
        const a = r.answers[0];
        expect(checkAnswer(pr.input, String(a.value)).status, pr.input).toBe("correct");
      }
    }
  });
});

describe("English, figures and typesetting", () => {
  it("solves the English examples", () => {
    for (const s of SAMPLE_PROBLEMS.filter((x) => ["Triangles", "Solids", "Space", "Parallel"].includes(x.group))) {
      for (const lang of ["en", "vi"] as const) {
        setMathLang(lang);
        const input = typeof s.input === "string" ? s.input : s.input[lang];
        const r = solveProblem(input);
        expect(r.ok, `${lang}: ${input} → ${!r.ok ? r.message : ""}`).toBe(true);
        const tex = geometryLatex(input);
        expect(() => katex.renderToString(tex, { throwOnError: true, strict: "ignore" }), tex).not.toThrow();
        if (r.ok) for (const st of r.solution.steps) expect(() => katex.renderToString(st.latex, { throwOnError: true, strict: "ignore" }), st.latex).not.toThrow();
      }
    }
  });

  it("draws solids without axes, with faces for hidden edges", () => {
    const f = measureFigure("Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2. Tính khoảng cách từ A đến (SBC).");
    expect(f.ok && f.space?.axes).toBe(false);
    expect(f.ok && f.space?.poly?.length).toBe(5);
    expect(f.ok && f.space?.points.map((p) => p.label)).toEqual(expect.arrayContaining(["S", "A", "B", "C", "D", "H"]));
    const t = measureFigure("Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC.");
    expect(t.ok && t.marks.map((m) => m.label)).toEqual(["A", "B", "C"]);
  });
});
