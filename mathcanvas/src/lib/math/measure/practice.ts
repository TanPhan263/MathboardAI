import { L } from "../lang";
import { geometryLatex } from "../geometry/display";
import type { ProblemTopic } from "../types";

type Rng = () => number;
export type MeasurePractice = { topic: ProblemTopic; input: string; latex: string; focus: string };

const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const make = (topic: ProblemTopic, input: string, focus: string): MeasurePractice => ({ topic, input, latex: geometryLatex(input), focus });

/** Sides b, c with the angle between them and a whole-number third side. */
const SAS: Array<[number, number, number, number]> = [
  [3, 8, 60, 7],
  [5, 8, 60, 7],
  [7, 15, 60, 13],
  [8, 15, 60, 13],
  [5, 21, 60, 19],
  [3, 5, 120, 7],
  [7, 8, 120, 13],
  [5, 16, 120, 19],
];

function triangle(rng: Rng): MeasurePractice {
  const [b, c, A] = pick(rng, SAS);
  if (rng() < 0.5) {
    return make("triangle", L({ en: `Triangle ABC has AB = ${c}, AC = ${b}, angle A = ${A}°. Find BC.`, vi: `Cho tam giác ABC có AB = ${c}, AC = ${b}, góc A = ${A}°. Tính BC.` }), L({ en: "Law of cosines for the third side.", vi: "Định lý côsin tính cạnh thứ ba." }));
  }
  return make("triangle", L({ en: `Triangle ABC has AB = ${c}, AC = ${b}, angle A = ${A}°. Find the area of triangle ABC.`, vi: `Cho tam giác ABC có AB = ${c}, AC = ${b}, góc A = ${A}°. Tính diện tích tam giác ABC.` }), L({ en: "Area = ½·b·c·sin A.", vi: "Diện tích = ½·b·c·sin A." }));
}

function solid(rng: Rng): MeasurePractice {
  const kind = Math.floor(rng() * 3);
  if (kind === 0) {
    const [r, h] = pick(rng, [[3, 4], [6, 8], [5, 12], [8, 6]] as const);
    const ask = pick(rng, [{ en: "the volume", vi: "thể tích" }, { en: "the lateral area", vi: "diện tích xung quanh" }]);
    return make("solid", L({ en: `A cone has base radius ${r} and height ${h}. Find ${ask.en} of the cone.`, vi: `Khối nón có bán kính đáy ${r}, chiều cao ${h}. Tính ${ask.vi} của khối nón.` }), L({ en: "Cone: V = ⅓πr²h, S = πrl.", vi: "Khối nón: V = ⅓πr²h, S = πrl." }));
  }
  if (kind === 1) {
    const r = pick(rng, [1, 2, 3, 4]);
    const h = pick(rng, [2, 3, 5, 6]);
    return make("solid", L({ en: `A cylinder has base radius ${r} and height ${h}. Find the volume.`, vi: `Khối trụ có bán kính đáy ${r}, chiều cao ${h}. Tính thể tích.` }), L({ en: "Cylinder: V = πr²h.", vi: "Khối trụ: V = πr²h." }));
  }
  const R = pick(rng, [1, 2, 3, 6]);
  return make("solid", L({ en: `Find the volume of the sphere of radius ${R}.`, vi: `Tính thể tích khối cầu bán kính ${R}.` }), L({ en: "Sphere: V = 4/3·πR³.", vi: "Khối cầu: V = 4/3·πR³." }));
}

function space(rng: Rng): MeasurePractice {
  const h = pick(rng, ["a", "a√2", "a√3", "2a"]);
  const kind = Math.floor(rng() * 7);
  const given = L({
    en: `Pyramid S.ABCD has a square base ABCD of side a, SA ⊥ (ABCD), SA = ${h}.`,
    vi: `Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = ${h}.`,
  });
  if (kind === 3) {
    const t = pick(rng, [60, 120]);
    return make("space-figure", L({ en: `Pyramid S.ABCD has a rhombus base ABCD of side a with angle BAD = ${t}°, SA ⊥ (ABCD), SA = ${h}. Find the volume of S.ABCD.`, vi: `Cho hình chóp S.ABCD có đáy ABCD là hình thoi cạnh a, góc BAD = ${t}°, SA ⊥ (ABCD), SA = ${h}. Tính thể tích khối chóp S.ABCD.` }), L({ en: "Rhombus: area = ½·AC·BD.", vi: "Hình thoi: diện tích = ½·AC·BD." }));
  }
  if (kind === 4) return make("space-figure", `${given} ${L({ en: "Find the dihedral angle [S, BC, A].", vi: "Tính số đo góc nhị diện [S, BC, A]." })}`, L({ en: "Two rays ⊥ the edge at one point, one in each face.", vi: "Hai tia cùng vuông góc với cạnh tại một điểm, mỗi tia nằm trong một mặt." }));
  if (kind === 5) return make("space-figure", `${given} ${L({ en: "Find the distance between AB and SC.", vi: "Tính khoảng cách giữa AB và SC." })}`, L({ en: "AB ∥ (SCD): use the distance from A to (SCD).", vi: "AB ∥ (SCD): chuyển về khoảng cách từ A đến (SCD)." }));
  if (kind === 6) {
    const foot = pick(rng, [0, 1]);
    const ang = pick(rng, [30, 45, 60]);
    return make(
      "space-figure",
      L({
        en: `Prism ABC.A'B'C' has an equilateral base of side a. The projection of A' onto (ABC) is ${foot ? "the centroid of triangle ABC" : "the midpoint of BC"}, and the angle between AA' and (ABC) is ${ang}°. Find the volume of the prism.`,
        vi: `Cho lăng trụ ABC.A'B'C' có đáy là tam giác đều cạnh a, hình chiếu vuông góc của A' lên (ABC) là ${foot ? "trọng tâm của tam giác ABC" : "trung điểm của BC"}, góc giữa AA' và (ABC) bằng ${ang}°. Tính thể tích khối lăng trụ.`,
      }),
      L({ en: "The height is A'H, not AA'.", vi: "Chiều cao là A'H, không phải AA'." }),
    );
  }
  if (kind === 0) return make("space-figure", `${given} ${L({ en: "Find the volume of S.ABCD.", vi: "Tính thể tích khối chóp S.ABCD." })}`, L({ en: "V = ⅓·base area·height.", vi: "V = ⅓·diện tích đáy·chiều cao." }));
  if (kind === 1) return make("space-figure", `${given} ${L({ en: "Find the angle between SC and (ABCD).", vi: "Tính góc giữa SC và (ABCD)." })}`, L({ en: "The angle between a line and its projection.", vi: "Góc giữa đường thẳng và hình chiếu của nó." }));
  return make("space-figure", `${given} ${L({ en: "Find the distance from A to (SBC).", vi: "Tính khoảng cách từ A đến (SBC)." })}`, L({ en: "Drop the foot of the height onto the face.", vi: "Hạ đường vuông góc từ chân đường cao xuống mặt bên." }));
}

export function measurePractice(topic: "triangle" | "solid" | "space-figure", rng: Rng = Math.random): MeasurePractice {
  return topic === "triangle" ? triangle(rng) : topic === "solid" ? solid(rng) : space(rng);
}
