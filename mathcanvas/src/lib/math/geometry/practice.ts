import { L } from "../lang";
import type { ProblemTopic } from "../types";
import { geometryLatex } from "./display";

type Rng = () => number;

export type GeometryPractice = { topic: ProblemTopic; input: string; latex: string; focus: string };

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const signs = (rng: Rng, v: number[]) => v.map((x) => (rng() < 0.5 ? -x : x));

/** Normal vectors with whole-number length, so distances come out exact: |n| = last entry. */
const NICE3: Array<[number, number, number, number]> = [
  [1, 2, 2, 3],
  [2, 1, 2, 3],
  [2, 2, 1, 3],
  [2, 3, 6, 7],
  [1, 4, 8, 9],
  [4, 4, 7, 9],
  [2, 6, 9, 11],
];
const NICE2: Array<[number, number, number]> = [
  [3, 4, 5],
  [4, 3, 5],
  [5, 12, 13],
  [12, 5, 13],
  [6, 8, 10],
];

/** “2x − y + 2z − 3” with tidy signs. */
function lin(coeffs: number[], c: number, vars = ["x", "y", "z"]): string {
  const terms = coeffs.map((k, i) => ({ k, v: vars[i] })).filter((t) => t.k !== 0);
  if (c !== 0) terms.push({ k: c, v: "" });
  return terms
    .map((t, i) => {
      const abs = Math.abs(t.k);
      const body = t.v ? `${abs === 1 ? "" : abs}${t.v}` : String(abs);
      return i === 0 ? (t.k < 0 ? `-${body}` : body) : t.k < 0 ? ` - ${body}` : ` + ${body}`;
    })
    .join("");
}
const param = (p: number, u: number, t = "t") => (u === 0 ? `${p}` : `${p === 0 ? "" : `${p} `}${u < 0 ? (p === 0 ? "-" : "- ") : p === 0 ? "" : "+ "}${Math.abs(u) === 1 ? "" : Math.abs(u)}${t}`);

const pt = (name: string, at: number[]) => `${name}(${at.join(L({ en: ", ", vi: "; " }))})`;
const ask = (en: string, vi: string) => L({ en, vi });

function make(topic: ProblemTopic, input: string, focus: string): GeometryPractice {
  return { topic, input, latex: geometryLatex(input), focus };
}

function space(rng: Rng): GeometryPractice {
  const kind = int(rng, 0, 4);
  const topic = "geometry-3d";
  const A = [int(rng, -3, 3), int(rng, -3, 3), int(rng, -3, 3)];
  if (kind === 0) {
    // d(A, (P)) is a whole number.
    const [a, b, c, len] = pick(rng, NICE3);
    const n = signs(rng, [a, b, c]);
    const k = int(rng, 1, 3) * (rng() < 0.5 ? -1 : 1);
    const d = k * len - (n[0] * A[0] + n[1] * A[1] + n[2] * A[2]);
    return make(topic, `${pt("A", A)}, (P): ${lin(n, d)} = 0. ${ask("Find the distance from A to (P).", "Tính khoảng cách từ A đến (P).")}`, ask("Distance from a point to a plane.", "Khoảng cách từ điểm đến mặt phẳng."));
  }
  if (kind === 1) {
    // Plane through three points.
    let B = A;
    let C = A;
    for (let guard = 0; guard < 20; guard++) {
      B = A.map((x) => x + int(rng, -2, 2));
      C = A.map((x) => x + int(rng, -2, 2));
      const u = B.map((x, i) => x - A[i]);
      const v = C.map((x, i) => x - A[i]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n.some((x) => x !== 0)) break;
    }
    return make(topic, `${pt("A", A)}, ${pt("B", B)}, ${pt("C", C)}. ${ask("Write the equation of the plane (ABC).", "Viết phương trình mặt phẳng (ABC).")}`, ask("A plane through three points: normal = [AB, AC].", "Mặt phẳng qua ba điểm: pháp tuyến = [AB, AC]."));
  }
  if (kind === 2) {
    // Line meets plane at a whole-number point M.
    const M = A;
    const u = [int(rng, -2, 2), int(rng, -2, 2), int(rng, 1, 3)];
    const t0 = int(rng, -2, 2) || 1;
    const p = M.map((x, i) => x - t0 * u[i]);
    let n = signs(rng, [int(rng, 1, 3), int(rng, 0, 2), int(rng, 1, 2)]);
    if (n[0] * u[0] + n[1] * u[1] + n[2] * u[2] === 0) n = [n[0] + 1, n[1], n[2]];
    const d = -(n[0] * M[0] + n[1] * M[1] + n[2] * M[2]);
    return make(topic, `d: x = ${param(p[0], u[0])}, y = ${param(p[1], u[1])}, z = ${param(p[2], u[2])}; (P): ${lin(n, d)} = 0. ${ask("Find the intersection of d and (P).", "Tìm giao điểm của d và (P).")}`, ask("Intersection of a line and a plane.", "Giao điểm của đường thẳng và mặt phẳng."));
  }
  if (kind === 3) {
    // Projection H = A − k·n is a whole-number point.
    const [a, b, c] = pick(rng, NICE3);
    const n = signs(rng, [a, b, c]);
    const H = A;
    const k = int(rng, 1, 2) * (rng() < 0.5 ? -1 : 1);
    const P = H.map((x, i) => x + k * n[i]);
    const d = -(n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
    return make(topic, `${pt("M", P)}, (P): ${lin(n, d)} = 0. ${ask("Find the projection of M onto (P).", "Tìm hình chiếu của M lên (P).")}`, ask("Projecting a point onto a plane.", "Hình chiếu của điểm lên mặt phẳng."));
  }
  // Sphere centred at I tangent to (P).
  const [a, b, c, len] = pick(rng, NICE3);
  const n = signs(rng, [a, b, c]);
  const k = int(rng, 1, 2);
  const d = k * len - (n[0] * A[0] + n[1] * A[1] + n[2] * A[2]);
  return make(topic, `${pt("I", A)}, (P): ${lin(n, d)} = 0. ${ask("Write the equation of the sphere with centre I tangent to (P).", "Viết phương trình mặt cầu tâm I tiếp xúc với (P).")}`, ask("Tangent sphere: R = d(I, (P)).", "Mặt cầu tiếp xúc: R = d(I, (P))."));
}

function plane(rng: Rng): GeometryPractice {
  const kind = int(rng, 0, 4);
  const topic = "geometry-2d";
  const A = [int(rng, -4, 4), int(rng, -4, 4)];
  if (kind === 0) {
    const [a, b, len] = pick(rng, NICE2);
    const n = signs(rng, [a, b]);
    const k = int(rng, 1, 3) * (rng() < 0.5 ? -1 : 1);
    const c = k * len - (n[0] * A[0] + n[1] * A[1]);
    return make(topic, `${ask("In the Oxy plane", "Trong mặt phẳng Oxy")}, ${pt("A", A)}, d: ${lin(n, c, ["x", "y"])} = 0. ${ask("Find the distance from A to d.", "Tính khoảng cách từ A đến d.")}`, ask("Distance from a point to a line.", "Khoảng cách từ điểm đến đường thẳng."));
  }
  if (kind === 1) {
    let B = A;
    while (B[0] === A[0] && B[1] === A[1]) B = [int(rng, -4, 4), int(rng, -4, 4)];
    return make(topic, `${ask("In the Oxy plane", "Trong mặt phẳng Oxy")}, ${pt("A", A)}, ${pt("B", B)}. ${ask("Write the equation of the line AB.", "Viết phương trình đường thẳng AB.")}`, ask("A line through two points.", "Đường thẳng qua hai điểm."));
  }
  if (kind === 2) {
    // Two lines through a whole-number point.
    const M = A;
    const n1 = [int(rng, 1, 3), int(rng, -3, 3) || 1];
    let n2 = [int(rng, -3, 3) || 2, int(rng, 1, 3)];
    if (n1[0] * n2[1] - n1[1] * n2[0] === 0) n2 = [n2[0] + 1, n2[1]];
    const c1 = -(n1[0] * M[0] + n1[1] * M[1]);
    const c2 = -(n2[0] * M[0] + n2[1] * M[1]);
    return make(topic, `${ask("In the Oxy plane", "Trong mặt phẳng Oxy")}, d1: ${lin(n1, c1, ["x", "y"])} = 0, d2: ${lin(n2, c2, ["x", "y"])} = 0. ${ask("Find the intersection of d1 and d2.", "Tìm giao điểm của d1 và d2.")}`, ask("Intersecting two lines.", "Giao điểm của hai đường thẳng."));
  }
  if (kind === 3) {
    const [a, b] = pick(rng, NICE2);
    const B = [A[0] + (rng() < 0.5 ? a : -a), A[1] + (rng() < 0.5 ? b : -b)];
    return make(topic, `${pt("I", A)}, ${pt("M", B)}. ${ask("Write the equation of the circle with centre I through M.", "Viết phương trình đường tròn tâm I đi qua M.")}`, ask("A circle from its centre and a point.", "Đường tròn biết tâm và một điểm."));
  }
  let B = A;
  let C = A;
  while ((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]) === 0) {
    B = [int(rng, -4, 4), int(rng, -4, 4)];
    C = [int(rng, -4, 4), int(rng, -4, 4)];
  }
  return make(topic, `${ask("In the Oxy plane", "Trong mặt phẳng Oxy")}, ${pt("A", A)}, ${pt("B", B)}, ${pt("C", C)}. ${ask("Find the area of triangle ABC.", "Tính diện tích tam giác ABC.")}`, ask("Area of a triangle from coordinates.", "Diện tích tam giác theo tọa độ."));
}

export function geometryPractice(topic: "geometry-2d" | "geometry-3d", rng: Rng = Math.random): GeometryPractice {
  return topic === "geometry-3d" ? space(rng) : plane(rng);
}
