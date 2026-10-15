import { geometryLatex } from "../geometry/display";
import { L } from "../lang";
import type { PracticeProblem } from "../practice";

type Rng = () => number;
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const make = (input: string, focus: string): PracticeProblem => ({ topic: "vector", input, latex: geometryLatex(input), focus });

/** Vectors in a figure: dot products, lengths and writing a vector in terms of two others. */
export function vectorPractice(rng: Rng = Math.random): PracticeProblem {
  const kind = Math.floor(rng() * 4);
  if (kind === 0) {
    const [x, y] = pick(rng, [["AB", "AC"], ["AB", "BC"], ["BA", "BC"], ["CA", "CB"]] as const);
    return make(L({ en: `Equilateral triangle ABC has side a. Find the dot product of vector ${x} and vector ${y}.`, vi: `Cho tam giác đều ABC cạnh a. Tính tích vô hướng vectơ ${x}.vectơ ${y}.` }), L({ en: "u·v = |u||v|cos(u, v), with both vectors from one point.", vi: "u·v = |u||v|cos(u, v), đưa hai vectơ về chung điểm đầu." }));
  }
  if (kind === 1) {
    const [x, y] = pick(rng, [["AB", "AC"], ["AB", "BD"], ["AC", "BD"], ["AB", "CD"]] as const);
    return make(L({ en: `Square ABCD has side a. Find the dot product of vector ${x} and vector ${y}.`, vi: `Cho hình vuông ABCD cạnh a. Tính tích vô hướng vectơ ${x}.vectơ ${y}.` }), L({ en: "Use the angle between the two vectors.", vi: "Dùng góc giữa hai vectơ." }));
  }
  if (kind === 2) {
    const [p, def] = pick(rng, [["M", "M là trung điểm của BC"], ["G", "G là trọng tâm tam giác ABC"], ["N", "N thuộc cạnh BC sao cho BN = 2NC"]] as const);
    const en = p === "M" ? "M is the midpoint of BC" : p === "G" ? "G is the centroid of triangle ABC" : "N is on side BC with BN = 2NC";
    return make(L({ en: `In triangle ABC, ${en}. Express vector A${p} in terms of vector AB and vector AC.`, vi: `Cho tam giác ABC, ${def}. Phân tích vectơ A${p} theo vectơ AB và vectơ AC.` }), L({ en: "Insert A, then use the definition of the point.", vi: "Chèn điểm A rồi dùng định nghĩa của điểm." }));
  }
  const op = pick(rng, ["+", "-"] as const);
  return make(L({ en: `Equilateral triangle ABC has side a. Find |vector AB ${op} vector AC|.`, vi: `Cho tam giác đều ABC cạnh a. Tính |vectơ AB ${op} vectơ AC|.` }), L({ en: "Square the vector: |w|² = w·w.", vi: "Bình phương vô hướng: |w|² = w·w." }));
}
