import katex from "katex";
import { afterEach, describe, expect, it } from "vitest";
import { checkAnswer, checkWork } from "../check";
import { setMathLang } from "../lang";
import { toNumber } from "../rational";
import { solveProblem } from "../solve";
import { surdAscii } from "../surd";
import { geometryLatex } from "./display";
import { geometryFigure } from "./figure";
import { isGeometry, parseGeometry } from "./parse";
import { geometryPractice } from "./practice";
import { type GeoAnswer, analyzeGeometry } from "./solve";

afterEach(() => setMathLang("en"));

const answersOf = (input: string) => {
  const g = analyzeGeometry(input);
  if ("ok" in g) throw new Error(g.message);
  return g;
};
const latexOf = (input: string) => answersOf(input).answers.map((a) => a.latex);

/** What a learner would type for an expected answer. */
function typed(a: GeoAnswer, dim: 2 | 3): string {
  const n = (r: { n: number; d: number }) => `(${r.n}/${r.d})`;
  const v = ["x", "y", "z"];
  switch (a.kind) {
    case "number":
      return a.exact ? surdAscii(a.exact) : String(a.approx);
    case "point":
    case "vector":
      return `(${a.coords.map(surdAscii).join("; ")})`;
    case "points":
      return a.list.map((p) => `(${p.map(surdAscii).join("; ")})`).join(" và ");
    case "plane":
      return `${a.n.map((c, i) => `${n(c)}*${v[i]}`).join(" + ")} + ${n(a.d)} = 0`;
    case "line":
      return a.p.map((p, i) => `${v[i]} = ${n(p)} + ${n(a.u[i])}*t`).join(", ");
    case "round":
      return `${a.c.map((c, i) => `(${v[i]} - ${n(c)})^2`).join(" + ")} = ${n(a.r2)}`;
    case "relation":
      return a.relation;
    case "none":
      return "không có điểm chung";
  }
  return String(dim);
}

describe("detecting geometry", () => {
  it("tells coordinate geometry from algebra", () => {
    expect(isGeometry("A(1; 2; 3), (P): x + y + z - 3 = 0")).toBe(true);
    expect(isGeometry("d: x - y + 1 = 0, (C): x^2 + y^2 = 25")).toBe(true);
    expect(isGeometry("Trong không gian Oxyz, cho mặt cầu …")).toBe(true);
    expect(isGeometry("x + y = 5; x - y = 1")).toBe(false);
    expect(isGeometry("x^2 - 5x + 6 = 0")).toBe(false);
    expect(isGeometry("1/x + 1/(x+1) = 1/2")).toBe(false);
  });
});

describe("reading a problem", () => {
  it("reads Vietnamese textbook notation", () => {
    const p = parseGeometry("Trong không gian Oxyz, cho A(1; 2; 3), B(3; 0; 1) và mặt phẳng (P): 2x - y + 2z - 3 = 0. Tính khoảng cách từ A đến (P)");
    if ("ok" in p) throw new Error(p.message);
    expect(p.dim).toBe(3);
    expect([...p.objects.keys()]).toEqual(["A", "B", "(P)"]);
    expect(p.goals).toEqual([{ k: "distance", x: "A", y: "(P)" }]);
  });

  it("reads parametric and canonical lines, spheres, and a question split by a second definition", () => {
    const p = parseGeometry("Tính góc giữa d: x = 1 + t, y = 2, z = -t và (P): x + y - 1 = 0");
    if ("ok" in p) throw new Error(p.message);
    expect(p.objects.get("d")).toMatchObject({ kind: "line" });
    expect(p.goals).toEqual([{ k: "angle", x: "d", y: "(P)", vectors: false }]);
    const c = parseGeometry("d: (x-1)/2 = (y+1)/(-1) = z/3");
    if ("ok" in c) throw new Error(c.message);
    const d = c.objects.get("d");
    expect(d?.kind === "line" && d.u.map(toNumber)).toEqual([2, -1, 3]);
    const s = parseGeometry("(S): x^2 + y^2 + z^2 - 2x + 4y - 6z - 2 = 0");
    if ("ok" in s) throw new Error(s.message);
    const sp = s.objects.get("(S)");
    expect(sp?.kind === "sphere" && [sp.c.map(toNumber), toNumber(sp.r2)]).toEqual([[1, -2, 3], 16]);
  });

  it("rejects equations that aren't a sphere", () => {
    const p = parseGeometry("(S): x^2 + y^2 + z^2 + 2x + 10 = 0");
    expect("ok" in p && p.message).toMatch(/not a sphere/);
  });
});

describe("solving: space (Oxyz)", () => {
  it("point to plane, plane through three points, area and volume", () => {
    expect(latexOf("A(1; 2; 3), (P): 2x - y + 2z - 3 = 0. Tính khoảng cách từ A đến (P)")).toEqual(["d\\left(A, (P)\\right) = 1"]);
    expect(latexOf("A(1;2;3), B(3;0;1), C(0;1;2), D(1;1;1). Viết phương trình mặt phẳng (ABC), tính diện tích tam giác ABC và thể tích tứ diện ABCD")).toEqual([
      "(ABC): y - z + 1 = 0",
      "S_{ABC} = 2\\sqrt{2}",
      "V_{ABCD} = \\frac{2}{3}",
    ]);
  });

  it("intersections, projection and reflection", () => {
    expect(latexOf("d: x = 1 + 2t, y = 2 - t, z = 3t; (P): x + y + z - 6 = 0; tìm giao điểm của d và (P)")[0]).toContain("\\frac{5}{2}");
    const pr = latexOf("Cho A(1;2;3), (P): x - 2y + 2z + 1 = 0. Tìm hình chiếu của A lên (P), điểm đối xứng của A qua (P)");
    expect(pr[0]).toBe("H\\left(\\frac{5}{9},\\ \\frac{26}{9},\\ \\frac{19}{9}\\right)");
    expect(pr[1]).toBe("A'\\left(\\frac{1}{9},\\ \\frac{34}{9},\\ \\frac{11}{9}\\right)");
    expect(latexOf("(P): x + y + z - 3 = 0, (Q): x - y + 2z - 1 = 0. Tìm giao tuyến của (P) và (Q)")[0]).toContain("x = 2 + 3t");
  });

  it("angles, skew lines and spheres", () => {
    expect(latexOf("Tính góc giữa d: x = 1 + t, y = 2, z = -t và (P): x + y - 1 = 0")).toEqual(["\\varphi = 30^\\circ"]);
    expect(latexOf("d1: x = 1 + t, y = 2t, z = 3 - t; d2: x = 2s, y = 1 + s, z = 2 + s. Tính khoảng cách giữa d1 và d2")).toEqual(["d\\left(d_{1}, d_{2}\\right) = \\frac{\\sqrt{3}}{3}"]);
    expect(latexOf("Viết phương trình mặt cầu tâm I(1;2;3) tiếp xúc với mặt phẳng (P): 2x + 2y - z + 3 = 0")).toEqual(["(S): (x - 1)^2 + (y - 2)^2 + (z - 3)^2 = 4"]);
    expect(latexOf("(P): 2x - 2y - z + 9 = 0, (S): (x-1)^2 + (y+2)^2 + (z-3)^2 = 100. Tìm giao của (P) và (S)")[0]).toContain("r = 2\\sqrt{21}");
  });

  it("checks every step it can, and every check passes", () => {
    const g = answersOf("A(1;2;3), B(3;0;1), C(0;1;2). Viết phương trình mặt phẳng (ABC)");
    expect(g.drafts.map((d) => d.kind)).toEqual(["coordinates", "construct", "verify"]);
    expect(g.drafts.every((d) => d.validation === "passed")).toBe(true);
  });

  it("explains a degenerate triangle instead of answering", () => {
    const r = solveProblem("A(0;0;0), B(1;1;1), C(2;2;2). Viết phương trình mặt phẳng (ABC)");
    expect(!r.ok && r.message).toMatch(/one line/);
  });
});

describe("solving: the plane (Oxy)", () => {
  it("lengths, distances, circles", () => {
    expect(latexOf("Trong mặt phẳng Oxy cho A(1;2), B(4;6), d: 3x - 4y + 15 = 0. Tính AB, khoảng cách từ A đến d")).toEqual(["AB = 5", "d\\left(A, d\\right) = 2"]);
    expect(latexOf("Cho tam giác ABC với A(0;0), B(4;0), C(0;3). Viết phương trình đường tròn ngoại tiếp tam giác ABC")).toEqual(["(C): (x - 2)^2 + \\left(y - \\frac{3}{2}\\right)^2 = \\frac{25}{4}"]);
    expect(latexOf("d: x - y + 1 = 0, (C): x^2 + y^2 = 25. Tìm giao điểm của d và (C)")[0]).toBe("M\\left(-4,\\ -3\\right),\\ N\\left(3,\\ 4\\right)");
  });

  it("answers the common questions when none is asked", () => {
    const g = answersOf("A(1; 1), B(4; 5)");
    expect(g.answers.map((a) => a.goal.k)).toEqual(["vector", "length", "midpoint"]);
    expect(g.notes[0]).toMatch(/No question/);
  });
});

describe("Vietnamese", () => {
  it("writes steps and coordinates the way textbooks do", () => {
    setMathLang("vi");
    const r = solveProblem("A(1;2;3), (P): x - 2y + 2z + 1 = 0. Tìm hình chiếu của A lên (P)");
    expect(r.ok && r.solution.steps[0].operation).toBe("Hình chiếu vuông góc");
    expect(r.ok && r.solution.finalAnswer).toContain(";\\ ");
    expect(r.ok && r.solution.topic).toBe("geometry-3d");
  });
});

describe("checking answers", () => {
  const plane = "A(1;2;3), B(3;0;1), C(0;1;2). Viết phương trình mặt phẳng (ABC)";
  it("accepts any multiple of the right plane, and explains a wrong constant", () => {
    expect(checkAnswer(plane, "(ABC): -2y + 2z - 2 = 0").status).toBe("correct");
    const r = checkAnswer(plane, "y - z + 3 = 0");
    expect(r.status).toBe("incorrect");
    expect(r.message).toMatch(/constant/);
  });

  it("reads roots, points, spheres and relative positions", () => {
    expect(checkAnswer("A(1;2;3), B(3;0;1), C(0;1;2). Tính diện tích tam giác ABC", "2√2").status).toBe("correct");
    expect(checkAnswer("A(1;2;3), B(3;0;1), C(0;1;2). Tính diện tích tam giác ABC", "S = 2sqrt(2)").status).toBe("correct");
    expect(checkAnswer("A(1;2;3), (P): x - 2y + 2z + 1 = 0. Tìm hình chiếu của A lên (P)", "H(5/9; 26/9; 19/9)").status).toBe("correct");
    const sphere = "Viết phương trình mặt cầu tâm I(1;2;3) tiếp xúc với mặt phẳng (P): 2x + 2y - z + 3 = 0";
    expect(checkAnswer(sphere, "x^2 + y^2 + z^2 - 2x - 4y - 6z + 10 = 0").status).toBe("correct");
    expect(checkAnswer(sphere, "(x-1)^2 + (y-2)^2 + (z-3)^2 = 2").message).toMatch(/R²/);
    expect(checkAnswer("d1: x = 1 + t, y = 2t, z = 3 - t; d2: x = 2s, y = 1 + s, z = 2 + s. Xét vị trí tương đối của d1 và d2", "chéo nhau").status).toBe("correct");
    expect(checkAnswer("d1: x = 1 + t, y = 2t, z = 3 - t; d2: x = 2s, y = 1 + s, z = 2 + s. Xét vị trí tương đối của d1 và d2", "song song").status).toBe("incorrect");
  });

  it("marks a line of working that matches the answer", () => {
    const lines = checkWork(["A(1; 2; 3), (P): 2x - y + 2z - 3 = 0. Tính khoảng cách từ A đến (P)", "d = |2 - 2 + 6 - 3|/3", "d = 1"]);
    expect(lines.map((l) => l.status)).toEqual(["start", "passed", "passed"]);
  });
});

describe("practice", () => {
  it("always makes a problem it can solve, whose answer it accepts", () => {
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const topic of ["geometry-2d", "geometry-3d"] as const) {
      for (let i = 0; i < 60; i++) {
        const p = geometryPractice(topic, rng);
        const g = analyzeGeometry(p.input);
        if ("ok" in g) throw new Error(`${p.input}: ${g.message}`);
        expect(g.answers.length, p.input).toBe(1);
        expect(g.drafts.every((d) => d.validation === "passed"), p.input).toBe(true);
        expect(checkAnswer(p.input, typed(g.answers[0].answer, g.dim)).status, p.input).toBe("correct");
      }
    }
  });
});

describe("display and figures", () => {
  it("typesets typed problems that KaTeX can render", () => {
    for (const s of [
      "Trong không gian Oxyz, cho A(1; 2; 3) và (P): 2x - y + 2z - 3 = 0. Tính khoảng cách từ A đến (P).",
      "Cho d: x = 1 + 2t, y = 2 - t, z = 3t và (P): x + y + z - 6 = 0. Tìm giao điểm của d và (P).",
      "In Oxyz, A(1, 2, 3). Find 50% of_it {weird} $text$",
    ]) {
      const tex = geometryLatex(s);
      expect(() => katex.renderToString(tex, { throwOnError: true, strict: "ignore" })).not.toThrow();
    }
    expect(geometryLatex("A(1; 2; 3), (P): 2x - y = 0")).toContain("A\\left(1;\\ 2;\\ 3\\right)");
    // A long run of words puts the equation on its own row.
    const long = geometryLatex("Write the equation of the sphere with centre I(1, 2, 3) tangent to (P): 2x + 2y - z + 3 = 0.");
    expect(long.split("\\\\")).toHaveLength(2);
    expect(long.split("\\\\")[1]).toMatch(/^\(P\)\\colon/);
  });

  it("draws plane problems with equal axes and space problems as a scene", () => {
    const flat = geometryFigure("A(1;2), d: 3x - 4y + 15 = 0. Tính khoảng cách từ A đến d");
    expect(flat.ok && flat.equal).toBe(true);
    expect(flat.ok && flat.marks.map((m) => m.label)).toEqual(["A(1, 2)"]);
    const deep = geometryFigure("A(1;2;3), (P): 2x - y + 2z - 3 = 0. Tìm hình chiếu của A lên (P)");
    expect(deep.ok && deep.space?.planes.length).toBe(1);
    expect(deep.ok && deep.space?.points.map((p) => p.label)).toEqual(["A", "H"]);
  });
});
