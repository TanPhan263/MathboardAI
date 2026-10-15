import { L } from "./lang";
import type { ProblemTopic } from "./types";
import { polyAscii, polyLatex } from "./latex";
import { rat } from "./rational";

export type PracticeProblem = {
  topic: ProblemTopic;
  /** Parser-friendly text, also what we put on the board. */
  input: string;
  latex: string;
  /** Short note on what this problem is practicing. */
  focus: string;
};

type Rng = () => number;

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const nonZero = (rng: Rng, lo: number, hi: number) => {
  let n = 0;
  while (n === 0) n = int(rng, lo, hi);
  return n;
};

const lin = (k: number, n: number, v = "x") => ({
  tex: polyLatex([rat(n), rat(k)], v),
  ascii: polyAscii([rat(n), rat(k)], v),
});

/** "x - 3" style factor for a root r. */
const shift = (r: number, v = "x") => (r === 0 ? v : r > 0 ? `${v} - ${r}` : `${v} + ${-r}`);

const OPS = ["<", ">", "<=", ">="] as const;
const OP_TEX = { "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge" } as const;

/**
 * A fresh problem of the same type, built backwards from a known answer so
 * it is always solvable with whole-number work.
 */
export function generatePractice(topic: ProblemTopic, rng: Rng = Math.random): PracticeProblem {
  switch (topic) {
    case "quadratic-equation": {
      let r1 = nonZero(rng, -6, 6);
      let r2 = nonZero(rng, -6, 6);
      if (rng() < 0.2) r2 = r1;
      if (r1 > r2) [r1, r2] = [r2, r1];
      const coeffs = [rat(r1 * r2), rat(-(r1 + r2)), rat(1)];
      return {
        topic,
        input: `${polyAscii(coeffs, "x")}=0`,
        latex: `${polyLatex(coeffs, "x")} = 0`,
        focus: L({ en: "Factoring a quadratic and using the zero-product property.", vi: "Phân tích tam thức thành nhân tử và dùng tính chất tích bằng 0." }),
      };
    }
    case "rational-equation": {
      // a / (x − p) = b with an integer answer x0 ≠ p
      const x0 = nonZero(rng, -6, 6);
      let p = int(rng, -5, 5);
      if (p === x0) p += 1;
      const b = nonZero(rng, -3, 3);
      const a = b * (x0 - p);
      return {
        topic,
        input: `${a}/(${shift(p)})=${b}`,
        latex: `\\frac{${a}}{${shift(p)}} = ${b}`,
        focus: L({ en: "Noting the restriction, clearing the denominator, and checking the answer is allowed.", vi: "Đặt điều kiện xác định, khử mẫu, rồi đối chiếu nghiệm với điều kiện." }),
      };
    }
    case "linear-inequality": {
      // a·x + b op c with a negative a half the time (practise flipping)
      const bound = int(rng, -6, 6);
      const a = nonZero(rng, -5, 5);
      const b = int(rng, -9, 9);
      const c = a * bound + b;
      const op = OPS[int(rng, 0, 3)];
      const l = lin(a, b);
      return {
        topic,
        input: `${l.ascii}${op}${c}`,
        latex: `${l.tex} ${OP_TEX[op]} ${c}`,
        focus: a < 0 ? L({ en: "Watch out: dividing by a negative number flips the sign.", vi: "Chú ý: chia cho số âm thì phải đổi chiều." }) : L({ en: "Isolating x while keeping the inequality balanced.", vi: "Cô lập x mà vẫn giữ đúng bất phương trình." }),
      };
    }
    case "quadratic-inequality": {
      let r1 = nonZero(rng, -5, 5);
      let r2 = nonZero(rng, -5, 5);
      if (r1 === r2) r2 = r1 + 2;
      if (r1 > r2) [r1, r2] = [r2, r1];
      const coeffs = [rat(r1 * r2), rat(-(r1 + r2)), rat(1)];
      const op = OPS[int(rng, 0, 3)];
      return {
        topic,
        input: `${polyAscii(coeffs, "x")}${op}0`,
        latex: `${polyLatex(coeffs, "x")} ${OP_TEX[op]} 0`,
        focus: L({ en: "Finding the boundary points and testing each region with a sign chart.", vi: "Tìm nghiệm của tam thức rồi lập bảng xét dấu cho từng khoảng." }),
      };
    }
    case "linear-system": {
      const x = int(rng, -5, 5);
      const y = int(rng, -5, 5);
      let a1 = nonZero(rng, -4, 4);
      let b1 = nonZero(rng, -4, 4);
      let a2 = nonZero(rng, -4, 4);
      let b2 = nonZero(rng, -4, 4);
      while (a1 * b2 - a2 * b1 === 0) {
        a1 = nonZero(rng, -4, 4);
        b1 = nonZero(rng, -4, 4);
        a2 = nonZero(rng, -4, 4);
        b2 = nonZero(rng, -4, 4);
      }
      const side = (a: number, b: number) => {
        const t = `${a === 1 ? "" : a === -1 ? "-" : a}x`;
        const u = `${Math.abs(b) === 1 ? "" : Math.abs(b)}y`;
        return `${t} ${b < 0 ? "-" : "+"} ${u}`;
      };
      const e1 = `${side(a1, b1)} = ${a1 * x + b1 * y}`;
      const e2 = `${side(a2, b2)} = ${a2 * x + b2 * y}`;
      return {
        topic,
        input: `${e1}; ${e2}`,
        latex: `\\begin{cases}${e1}\\\\${e2}\\end{cases}`,
        focus: L({ en: "Eliminating one unknown, then substituting back.", vi: "Khử một ẩn, rồi thế ngược lại." }),
      };
    }
    case "linear-equation":
    default: {
      const x = nonZero(rng, -9, 9);
      const a = nonZero(rng, 2, 7);
      let c = int(rng, -4, 5);
      if (c === a) c += 1;
      const b = int(rng, -12, 12);
      const d = (a - c) * x + b;
      const left = lin(a, b);
      const right = lin(c, d);
      return {
        topic: "linear-equation",
        input: `${left.ascii}=${right.ascii}`,
        latex: `${left.tex} = ${right.tex}`,
        focus: L({ en: "Collecting x-terms on one side and undoing operations in order.", vi: "Chuyển các hạng tử chứa x về một vế và lần lượt khử các phép toán." }),
      };
    }
  }
}

export type SampleProblem = {
  /** Shown in the Examples menu, in the page's language. */
  label: { en: string; vi: string };
  group: "Equations" | "Fractions" | "Inequalities" | "Systems" | "Geometry2D" | "Geometry3D" | "Triangles" | "Solids" | "Space" | "Parallel" | "Conics" | "Vectors";
  /** Geometry problems are worded, so they come in the page's language. */
  input: string | { en: string; vi: string };
  /** Preview in the menu; geometry problems are typeset when added (that needs the parser). */
  latex?: string;
};

export const SAMPLE_PROBLEMS: SampleProblem[] = [
  { group: "Equations", label: { en: "Linear", vi: "Bậc nhất" }, input: "2x + 3 = 11", latex: "2x + 3 = 11" },
  { group: "Equations", label: { en: "Quadratic That Factors", vi: "Bậc hai phân tích được" }, input: "x^2 - 5x + 6 = 0", latex: "x^{2} - 5x + 6 = 0" },
  { group: "Equations", label: { en: "Needs the Formula", vi: "Cần công thức nghiệm" }, input: "x^2 + 4x + 1 = 0", latex: "x^{2} + 4x + 1 = 0" },
  { group: "Fractions", label: { en: "x in the Denominator", vi: "Ẩn ở mẫu" }, input: "1/x + 1/(x+1) = 1/2", latex: "\\frac{1}{x} + \\frac{1}{x+1} = \\frac{1}{2}" },
  { group: "Fractions", label: { en: "Extraneous Solution", vi: "Có nghiệm ngoại lai" }, input: "x^2/(x-2) = 4/(x-2)", latex: "\\frac{x^{2}}{x-2} = \\frac{4}{x-2}" },
  { group: "Inequalities", label: { en: "Sign Flip", vi: "Đổi chiều" }, input: "-2x + 3 > 11", latex: "-2x + 3 > 11" },
  { group: "Inequalities", label: { en: "Quadratic", vi: "Bậc hai" }, input: "x^2 - 5x + 6 <= 0", latex: "x^{2} - 5x + 6 \\le 0" },
  { group: "Systems", label: { en: "Two Unknowns", vi: "Hai ẩn" }, input: "x + y = 5; x - y = 1", latex: "\\begin{cases}x + y = 5\\\\x - y = 1\\end{cases}" },
  { group: "Systems", label: { en: "Three Unknowns", vi: "Ba ẩn" }, input: "x + y + z = 6; 2x - y + z = 3; x + 2y - z = 2", latex: "\\begin{cases}x + y + z = 6\\\\2x - y + z = 3\\\\x + 2y - z = 2\\end{cases}" },
  {
    group: "Geometry2D",
    label: { en: "Point to a Line", vi: "Khoảng cách điểm – đường thẳng" },
    input: {
      en: "In the Oxy plane, A(1, 2) and d: 3x - 4y + 15 = 0. Find the distance from A to d and the projection of A onto d.",
      vi: "Trong mặt phẳng Oxy, cho A(1; 2) và d: 3x - 4y + 15 = 0. Tính khoảng cách từ A đến d và tìm hình chiếu của A lên d.",
    },
  },
  {
    group: "Geometry2D",
    label: { en: "Circumcircle", vi: "Đường tròn ngoại tiếp" },
    input: {
      en: "Triangle ABC with A(0, 0), B(4, 0), C(0, 3). Write the equation of the circumcircle of triangle ABC and find the area of triangle ABC.",
      vi: "Cho tam giác ABC với A(0; 0), B(4; 0), C(0; 3). Viết phương trình đường tròn ngoại tiếp tam giác ABC và tính diện tích tam giác ABC.",
    },
  },
  {
    group: "Geometry3D",
    label: { en: "Point to a Plane", vi: "Khoảng cách đến mặt phẳng" },
    input: {
      en: "In Oxyz, A(1, 2, 3) and (P): 2x - y + 2z - 3 = 0. Find the distance from A to (P) and the projection of A onto (P).",
      vi: "Trong không gian Oxyz, cho A(1; 2; 3) và (P): 2x - y + 2z - 3 = 0. Tính khoảng cách từ A đến (P) và tìm hình chiếu của A lên (P).",
    },
  },
  {
    group: "Geometry3D",
    label: { en: "Plane Through 3 Points", vi: "Mặt phẳng qua 3 điểm" },
    input: {
      en: "A(1, 0, 2), B(2, 1, 0), C(0, 3, 1). Write the equation of the plane (ABC) and find the area of triangle ABC.",
      vi: "Cho A(1; 0; 2), B(2; 1; 0), C(0; 3; 1). Viết phương trình mặt phẳng (ABC) và tính diện tích tam giác ABC.",
    },
  },
  {
    group: "Geometry3D",
    label: { en: "Line Meets Plane", vi: "Giao điểm đường thẳng – mặt phẳng" },
    input: {
      en: "d: x = 1 + 2t, y = 2 - t, z = 3t and (P): x + y + z - 6 = 0. Find the intersection of d and (P) and the angle between d and (P).",
      vi: "Cho d: x = 1 + 2t, y = 2 - t, z = 3t và (P): x + y + z - 6 = 0. Tìm giao điểm của d và (P), tính góc giữa d và (P).",
    },
  },
  {
    group: "Geometry3D",
    label: { en: "Tangent Sphere", vi: "Mặt cầu tiếp xúc" },
    input: {
      en: "Write the equation of the sphere with centre I(1, 2, 3) tangent to (P): 2x + 2y - z + 3 = 0.",
      vi: "Viết phương trình mặt cầu tâm I(1; 2; 3) tiếp xúc với (P): 2x + 2y - z + 3 = 0.",
    },
  },
  {
    group: "Triangles",
    label: { en: "Two Sides and an Angle", vi: "Hai cạnh và góc xen giữa" },
    input: {
      en: "Triangle ABC has AB = 5, AC = 8, angle A = 60°. Find BC, the area of triangle ABC and the circumradius R.",
      vi: "Cho tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC, diện tích tam giác ABC và bán kính đường tròn ngoại tiếp R.",
    },
  },
  {
    group: "Triangles",
    label: { en: "Three Sides", vi: "Biết ba cạnh" },
    input: {
      en: "Triangle ABC has a = 7, b = 8, c = 5. Find angle A, the area, the inradius r and the median from A.",
      vi: "Cho tam giác ABC có a = 7, b = 8, c = 5. Tính góc A, diện tích, bán kính đường tròn nội tiếp r và trung tuyến AM.",
    },
  },
  {
    group: "Solids",
    label: { en: "Cone", vi: "Khối nón" },
    input: {
      en: "A cone has base radius r = 3 and height h = 4. Find the volume, the lateral area and the total area.",
      vi: "Khối nón có bán kính đáy r = 3, chiều cao h = 4. Tính thể tích, diện tích xung quanh và diện tích toàn phần.",
    },
  },
  {
    group: "Solids",
    label: { en: "Cylinder", vi: "Khối trụ" },
    input: {
      en: "A cylinder has an axial cross-section that is a square of side 2a. Find the volume of the cylinder.",
      vi: "Cho hình trụ có thiết diện qua trục là hình vuông cạnh 2a. Tính thể tích khối trụ.",
    },
  },
  {
    group: "Space",
    label: { en: "Volume, Angle, Distance", vi: "Thể tích, góc, khoảng cách" },
    input: {
      en: "Pyramid S.ABCD has a square base ABCD of side a, SA ⊥ (ABCD), SA = a√2. Find the volume of S.ABCD, the angle between SC and (ABCD), the angle between (SBC) and (ABCD), and the distance from A to (SBC).",
      vi: "Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2. Tính thể tích khối chóp S.ABCD, góc giữa SC và (ABCD), góc giữa (SBC) và (ABCD), khoảng cách từ A đến (SBC).",
    },
  },
  {
    group: "Space",
    label: { en: "Prove Perpendicular", vi: "Chứng minh vuông góc" },
    input: {
      en: "Pyramid S.ABCD has a square base of side a, SA ⊥ (ABCD), SA = a. H is the projection of A onto SB. Prove BC ⊥ (SAB), BD ⊥ (SAC) and AH ⊥ (SBC).",
      vi: "Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Gọi H là hình chiếu của A lên SB. Chứng minh BC ⊥ (SAB), BD ⊥ (SAC) và AH ⊥ (SBC).",
    },
  },
  {
    group: "Space",
    label: { en: "Regular Pyramid", vi: "Hình chóp đều" },
    input: {
      en: "Regular pyramid S.ABCD has base edge a and lateral edge 2a. Find the volume and the angle between a lateral edge and the base.",
      vi: "Cho hình chóp tứ giác đều S.ABCD có cạnh đáy a, cạnh bên 2a. Tính thể tích và góc giữa cạnh bên và mặt đáy.",
    },
  },
  {
    group: "Space",
    label: { en: "Cube", vi: "Hình lập phương" },
    input: {
      en: "Cube ABCD.A'B'C'D' has edge a. Find the angle between A'C and (ABCD) and the distance between AB and CD'.",
      vi: "Cho hình lập phương ABCD.A'B'C'D' cạnh a. Tính góc giữa A'C và (ABCD), khoảng cách giữa AB và CD'.",
    },
  },
  {
    group: "Space",
    label: { en: "Rhombus Base, Skew Lines", vi: "Đáy hình thoi, hai đường chéo nhau" },
    input: {
      en: "Pyramid S.ABCD has a rhombus base ABCD of side a with angle BAD = 60°, SA ⊥ (ABCD), SA = a. Find the volume and the distance between SC and BD.",
      vi: "Cho hình chóp S.ABCD có đáy ABCD là hình thoi cạnh a, góc BAD = 60°, SA ⊥ (ABCD), SA = a. Tính thể tích khối chóp và khoảng cách giữa SC và BD.",
    },
  },
  {
    group: "Space",
    label: { en: "Dihedral Angles", vi: "Góc nhị diện" },
    input: {
      en: "Pyramid S.ABCD has a square base of side a, SA ⊥ (ABCD), SA = a. Find the dihedral angles [S, BC, A] and [B, SC, D].",
      vi: "Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ (ABCD), SA = a. Tính số đo các góc nhị diện [S, BC, A] và [B, SC, D].",
    },
  },
  {
    group: "Space",
    label: { en: "Slanted Prism", vi: "Lăng trụ xiên" },
    input: {
      en: "Prism ABC.A'B'C' has an equilateral base of side a. The projection of A' onto (ABC) is the midpoint of BC, and the angle between AA' and (ABC) is 60°. Find the volume of the prism.",
      vi: "Cho lăng trụ ABC.A'B'C' có đáy là tam giác đều cạnh a, hình chiếu vuông góc của A' lên (ABC) là trung điểm của BC, góc giữa AA' và (ABC) bằng 60°. Tính thể tích khối lăng trụ.",
    },
  },
  {
    group: "Vectors",
    label: { en: "Prove an Identity", vi: "Chứng minh đẳng thức vectơ" },
    input: {
      en: "Triangle ABC has centroid G, and M is the midpoint of BC. Prove vector GA + vector GB + vector GC = vector 0. Express vector AM in terms of vector AB and vector AC.",
      vi: "Cho tam giác ABC có trọng tâm G, M là trung điểm của BC. Chứng minh vectơ GA + vectơ GB + vectơ GC = vectơ 0. Phân tích vectơ AM theo vectơ AB và vectơ AC.",
    },
  },
  {
    group: "Vectors",
    label: { en: "Find a Point", vi: "Xác định điểm" },
    input: {
      en: "Parallelogram ABCD has centre O. Find the point M such that vector MA + vector MB + vector MC + vector MD = vector 0, and the point N such that vector NA + 2 vector NB = vector 0.",
      vi: "Cho hình bình hành ABCD tâm O. Xác định điểm M thỏa mãn vectơ MA + vectơ MB + vectơ MC + vectơ MD = vectơ 0 và điểm N thỏa mãn vectơ NA + 2 vectơ NB = vectơ 0.",
    },
  },
  {
    group: "Vectors",
    label: { en: "Dot Product, Length, Angle", vi: "Tích vô hướng, độ dài, góc" },
    input: {
      en: "Equilateral triangle ABC has side a. Find the dot products AB.AC and AB.BC, the length |vector AB + vector AC| and the angle between vector AB and vector BC.",
      vi: "Cho tam giác đều ABC cạnh a. Tính tích vô hướng AB.AC, AB.BC, độ dài |vectơ AB + vectơ AC| và góc giữa vectơ AB và vectơ BC.",
    },
  },
  {
    group: "Conics",
    label: { en: "Ellipse: Elements", vi: "Elip: các yếu tố" },
    input: {
      en: "Find the foci, vertices, axis lengths, focal length and eccentricity of the ellipse (E): 9x^2 + 25y^2 = 225. Point M on (E) has x-coordinate 3; find MF1 and MF2.",
      vi: "Cho elip (E): 9x^2 + 25y^2 = 225. Tìm tọa độ tiêu điểm, đỉnh, độ dài các trục, tiêu cự và tâm sai. Điểm M thuộc (E) có hoành độ bằng 3, tính MF1, MF2.",
    },
  },
  {
    group: "Conics",
    label: { en: "Hyperbola: Equation", vi: "Hypebol: lập phương trình" },
    input: {
      en: "Write the standard equation of the hyperbola with a focus F(5; 0) that passes through M(4√2; 3).",
      vi: "Viết phương trình chính tắc của hypebol có một tiêu điểm F(5; 0) và đi qua điểm M(4√2; 3).",
    },
  },
  {
    group: "Conics",
    label: { en: "Parabola", vi: "Parabol" },
    input: {
      en: "Write the standard equation of the parabola through M(2; 4), and find its focus and directrix.",
      vi: "Viết phương trình chính tắc của parabol đi qua điểm M(2; 4), tìm tiêu điểm và đường chuẩn.",
    },
  },
  {
    group: "Parallel",
    label: { en: "Intersection Lines and Points", vi: "Giao tuyến, giao điểm" },
    input: {
      en: "Pyramid S.ABCD has a parallelogram base ABCD. M is the midpoint of SD. Find the intersection line of (SAC) and (SBD), the intersection line of (SAB) and (SCD), and the intersection point of BM and (SAC).",
      vi: "Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Gọi M là trung điểm SD. Tìm giao tuyến của (SAC) và (SBD), giao tuyến của (SAB) và (SCD), giao điểm của BM và (SAC).",
    },
  },
  {
    group: "Parallel",
    label: { en: "Cross-Section", vi: "Thiết diện" },
    input: {
      en: "Pyramid S.ABCD has a parallelogram base ABCD. M, N are the midpoints of AB and AD, and P is the midpoint of SC. Find the cross-section of the pyramid by (MNP).",
      vi: "Cho hình chóp S.ABCD có đáy ABCD là hình bình hành. Gọi M, N lần lượt là trung điểm của AB, AD và P là trung điểm SC. Tìm thiết diện của hình chóp với (MNP).",
    },
  },
  {
    group: "Parallel",
    label: { en: "Parallel Plane, Section", vi: "Mặt phẳng song song, thiết diện" },
    input: {
      en: "Pyramid S.ABCD has a parallelogram base ABCD with centre O. M, N are the midpoints of SA and SD. Prove (OMN) ∥ (SBC). The plane (α) through O is parallel to SA and BC; find the cross-section of the pyramid by (α).",
      vi: "Cho hình chóp S.ABCD có đáy là hình bình hành tâm O. Gọi M, N lần lượt là trung điểm SA, SD. Chứng minh (OMN) // (SBC). Mặt phẳng (α) qua O song song với SA và BC; tìm thiết diện của hình chóp với (α).",
    },
  },
];
