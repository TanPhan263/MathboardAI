import { geometryLatex } from "../geometry/display";
import { L } from "../lang";
import type { PracticeProblem } from "../practice";

type Rng = () => number;
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const make = (input: string, focus: string): PracticeProblem => ({ topic: "conic", input, latex: geometryLatex(input), focus });

/** Pythagorean triples: (a, b, c) with a² = b² + c² for ellipses, c² = a² + b² for hyperbolas. */
const ELL: Array<[number, number, number]> = [[5, 3, 4], [5, 4, 3], [13, 5, 12], [10, 6, 8], [10, 8, 6], [13, 12, 5]];
const HYP: Array<[number, number, number]> = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [6, 8, 10], [8, 6, 10], [12, 5, 13]];

/** A conic problem with whole-number answers: elements from an equation, or the equation from elements. */
export function conicPractice(rng: Rng = Math.random): PracticeProblem {
  const kind = Math.floor(rng() * 5);
  if (kind === 0) {
    const [a, b] = pick(rng, ELL);
    return make(L({ en: `Find the focal length of the ellipse (E): x^2/${a * a} + y^2/${b * b} = 1.`, vi: `Tìm tiêu cự của elip (E): x^2/${a * a} + y^2/${b * b} = 1.` }), L({ en: "Ellipse: c² = a² − b², focal length 2c.", vi: "Elip: c² = a² − b², tiêu cự 2c." }));
  }
  if (kind === 1) {
    const [a, b] = pick(rng, HYP);
    return make(L({ en: `Find the eccentricity of the hyperbola (H): x^2/${a * a} - y^2/${b * b} = 1.`, vi: `Tìm tâm sai của hypebol (H): x^2/${a * a} - y^2/${b * b} = 1.` }), L({ en: "Hyperbola: c² = a² + b², e = c/a.", vi: "Hypebol: c² = a² + b², e = c/a." }));
  }
  if (kind === 2) {
    const [a, , c] = pick(rng, ELL);
    return make(L({ en: `Write the standard equation of the ellipse with major axis ${2 * a} and focal length ${2 * c}.`, vi: `Viết phương trình chính tắc của elip có độ dài trục lớn bằng ${2 * a} và tiêu cự bằng ${2 * c}.` }), L({ en: "a from the major axis, c from the focal length, then b² = a² − c².", vi: "Tìm a từ trục lớn, c từ tiêu cự, rồi b² = a² − c²." }));
  }
  if (kind === 3) {
    const [a, b] = pick(rng, HYP);
    return make(L({ en: `Write the standard equation of the hyperbola with transverse axis ${2 * a} and conjugate axis ${2 * b}.`, vi: `Viết phương trình chính tắc của hypebol có độ dài trục thực bằng ${2 * a} và trục ảo bằng ${2 * b}.` }), L({ en: "Transverse axis 2a, conjugate axis 2b.", vi: "Trục thực 2a, trục ảo 2b." }));
  }
  const f = pick(rng, [1, 2, 3, 4, 5]);
  return make(L({ en: `Write the standard equation of the parabola with focus F(${f}; 0).`, vi: `Viết phương trình chính tắc của parabol có tiêu điểm F(${f}; 0).` }), L({ en: "Focus (p/2; 0): y² = 2px.", vi: "Tiêu điểm (p/2; 0): y² = 2px." }));
}
