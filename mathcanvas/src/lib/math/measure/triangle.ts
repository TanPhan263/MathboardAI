import { L } from "../lang";
import { clean } from "../geometry/parse";
import { type MeasureAnswer, RAD, Steps, type Text, VAL, close, degTex, measureTex, oops, ratioTex, readValue } from "./num";

/**
 * Solving a triangle from its measures (grade 10, “hệ thức lượng”): law of
 * cosines, law of sines, area, circumradius, inradius, altitudes, medians.
 */

type Goal =
  | { k: "side"; i: number }
  | { k: "angle"; i: number }
  | { k: "area" }
  | { k: "R" }
  | { k: "r" }
  | { k: "perimeter" }
  | { k: "height"; i: number; name?: string }
  | { k: "median"; i: number; name?: string };

export type TriangleProblem = {
  names: [string, string, string];
  /** side[i] is opposite vertex i (a = BC, b = CA, c = AB). */
  side: Array<number | undefined>;
  /** Degrees. */
  angle: Array<number | undefined>;
  sym: string | null;
  goals: Goal[];
  /** Isosceles at this vertex (its two sides are equal). */
  iso?: number;
};

export function isTriangleProblem(s: string): boolean {
  return /tam giác|triangle/iu.test(s) && !/hình chóp|khối chóp|lăng trụ|prism|pyramid|\b[A-Z]\.[A-Z]{3}/u.test(s);
}

/* ───────────────────────────── Reading ───────────────────────────── */

export function parseTriangle(raw: string): TriangleProblem {
  const s = clean(raw).replace(/Â/g, "góc A").replace(/B̂/g, "góc B").replace(/Ĉ/g, "góc C");
  const tri = s.match(/(?:tam giác|triangle)\s+([A-Z])([A-Z])([A-Z])(?![A-Z])/u);
  const names: [string, string, string] = tri ? [tri[1], tri[2], tri[3]] : ["A", "B", "C"];
  const side: Array<number | undefined> = [undefined, undefined, undefined];
  const angle: Array<number | undefined> = [undefined, undefined, undefined];
  let sym: string | null = null;
  const noteSym = (v: { sym: string | null }) => {
    if (v.sym && sym && v.sym !== sym) oops({ en: "Use one letter for lengths (like a).", vi: "Chỉ dùng một chữ cho độ dài (như a)." }, { en: "Write the other lengths as multiples of it.", vi: "Viết các độ dài khác theo chữ đó." });
    sym = v.sym ?? sym;
  };
  const vertex = (ch: string) => names.indexOf(ch);
  let rest = s;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    rest = rest.replace(re, (...args) => {
      fn(args.slice(0, -2) as unknown as RegExpMatchArray);
      return " ";
    });
  };

  // Angles: góc A = 60°, ∠BAC = 60°, angle B = 45, \hat{A} = 60.
  take(new RegExp(String.raw`(?:góc|angle|∠|\\angle|\\hat\{?)\s*([A-Z]{1,3})\}?\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ|\^\\circ|deg(?:rees)?)?`, "gu"), (m) => {
    const n = m[1].length === 3 ? m[1][1] : m[1];
    const i = vertex(n);
    if (i >= 0) angle[i] = Number(m[2].replace(",", "."));
  });
  take(new RegExp(String.raw`(?<![\p{L}])([A-Z])\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)`, "gu"), (m) => {
    const i = vertex(m[1]);
    if (i >= 0) angle[i] = Number(m[2].replace(",", "."));
  });
  // Sides: AB = 5, BC = a√3, a = 7 (a = BC when the vertices are A, B, C).
  take(new RegExp(String.raw`(?<![\p{L}])([A-Z])([A-Z])\s*=\s*${VAL}`, "gu"), (m) => {
    const [i, j] = [vertex(m[1]), vertex(m[2])];
    const v = readValue(m[3]);
    if (i < 0 || j < 0 || i === j || !v) return;
    noteSym(v);
    side[3 - i - j] = v.value;
  });
  take(new RegExp(String.raw`(?<![\p{L}])([abc])\s*=\s*${VAL}`, "gu"), (m) => {
    const v = readValue(m[2]);
    if (!v || v.sym === m[1]) return;
    noteSym(v);
    side["abc".indexOf(m[1])] = v.value;
  });
  // Shapes: đều cạnh a, vuông (cân) tại A, cân tại A.
  const eq = s.match(new RegExp(String.raw`(?:tam giác\s+(?:[A-Z]{3}\s+)?đều(?:\s+[A-Z]{3})?|equilateral(?: triangle)?(?:\s+[A-Z]{3})?)(?:\s+(?:có\s+)?(?:cạnh|side|with side)\s+(?:bằng\s+|=\s*|of\s+)?${VAL})?`, "u"));
  if (eq) {
    angle.fill(60);
    if (eq[1]) {
      const v = readValue(eq[1]);
      if (v) {
        noteSym(v);
        side.fill(v.value);
      }
    }
  }
  const right = s.match(/(vuông cân|vuông|right(?:[- ]angled)?(?: isosceles)?|isosceles right)\s+(?:triangle\s+)?(?:tại|at)\s+([A-Z])/u);
  if (right) {
    const i = vertex(right[2]);
    if (i >= 0) {
      angle[i] = 90;
      if (/cân|isosceles/u.test(right[1])) angle.forEach((_, j) => j !== i && (angle[j] = 45));
    }
  }
  const iso = s.match(/(?<!vuông\s)(?:cân|isosceles(?: triangle)?)\s+(?:tại|at)\s+([A-Z])/u);
  const isoAt = iso ? vertex(iso[1]) : -1;

  // Questions.
  const goals: Goal[] = [];
  const q = rest;
  for (const m of q.matchAll(/(?:đường cao|altitude|height)\s+(?:([A-Z])([A-Z])|(?:kẻ\s+)?(?:từ|from)\s+(?:đỉnh\s+)?([A-Z]))|h_?\{?([abc])\}?/gu)) {
    const from = m[1] ?? m[3] ?? (m[4] ? names["abc".indexOf(m[4])] : undefined);
    const i = from ? vertex(from) : -1;
    if (i >= 0) goals.push({ k: "height", i, name: m[1] ? `${m[1]}${m[2]}` : undefined });
  }
  for (const m of q.matchAll(/(?:trung tuyến|median)\s+(?:([A-Z])([A-Z])|(?:kẻ\s+)?(?:từ|from)\s+(?:đỉnh\s+)?([A-Z]))|m_?\{?([abc])\}?/gu)) {
    const from = m[1] ?? m[3] ?? (m[4] ? names["abc".indexOf(m[4])] : undefined);
    const i = from ? vertex(from) : -1;
    if (i >= 0) goals.push({ k: "median", i, name: m[1] ? `${m[1]}${m[2]}` : undefined });
  }
  const q2 = q.replace(/(?:đường cao|altitude|height|trung tuyến|median)\s+[A-Z]{2}/gu, " ");
  if (/ngoại tiếp|circumradius|circumscribed|circumcircle|(?<![\p{L}])R(?![\p{L}])/u.test(q2)) goals.push({ k: "R" });
  if (/nội tiếp|inradius|inscribed|incircle|(?<![\p{L}])r(?![\p{L}])/u.test(q2)) goals.push({ k: "r" });
  if (/diện tích|area|(?<![\p{L}])S(?![\p{L}.])/u.test(q2)) goals.push({ k: "area" });
  if (/chu vi|perimeter/u.test(q2)) goals.push({ k: "perimeter" });
  for (const m of q2.matchAll(/(?:góc|angle|\\hat\{?)\s*([A-Z]{1,3})(?![\p{L}])/gu)) {
    const i = vertex(m[1].length === 3 ? m[1][1] : m[1]);
    if (i >= 0 && !goals.some((g) => g.k === "angle" && g.i === i)) goals.push({ k: "angle", i });
  }
  const q3 = q2.replace(/(?:góc|angle)\s*[A-Z]{1,3}/gu, " ").replace(/tam giác\s+[A-Z]{3}|triangle\s+[A-Z]{3}/gu, " ");
  for (const m of q3.matchAll(/(?<![\p{L}])([A-Z])([A-Z])(?![\p{L}])/gu)) {
    const [i, j] = [vertex(m[1]), vertex(m[2])];
    if (i >= 0 && j >= 0 && i !== j && !goals.some((g) => g.k === "side" && g.i === 3 - i - j)) goals.push({ k: "side", i: 3 - i - j });
  }
  // Answer in the order the questions were asked.
  const at = (g: Goal): number => {
    const re =
      g.k === "side" ? new RegExp(`${names[(g.i + 1) % 3]}${names[(g.i + 2) % 3]}|${names[(g.i + 2) % 3]}${names[(g.i + 1) % 3]}`, "u")
      : g.k === "angle" ? new RegExp(`(?:góc|angle|hat\\{?)\\s*\\S*${names[g.i]}`, "u")
      : g.k === "area" ? /diện tích|area|(?<![\p{L}])S(?![\p{L}])/u
      : g.k === "R" ? /ngoại tiếp|circum|(?<![\p{L}])R(?![\p{L}])/u
      : g.k === "r" ? /nội tiếp|inradius|inscribed|incircle|(?<![\p{L}])r(?![\p{L}])/u
      : g.k === "perimeter" ? /chu vi|perimeter/u
      : g.k === "height" ? /đường cao|altitude|height|h_/u
      : /trung tuyến|median|m_/u;
    const i = q.search(re);
    return i < 0 ? Infinity : i;
  };
  goals.sort((x, y) => at(x) - at(y));
  return { names, side, angle, sym, goals, iso: isoAt >= 0 ? isoAt : undefined };
}

/* ───────────────────────────── Solving ───────────────────────────── */

type Solved = { side: number[]; angle: number[] };

const NEED: Text = {
  en: "Give three measures including at least one side: three sides, two sides and an angle, or a side and two angles.",
  vi: "Cần ba yếu tố, trong đó có ít nhất một cạnh: ba cạnh, hai cạnh và một góc, hoặc một cạnh và hai góc.",
};

export function solveTriangle(p: TriangleProblem): { steps: Steps; answers: MeasureAnswer[]; solved: Solved; notes: string[] } {
  const st = new Steps();
  const notes: string[] = [];
  const N = p.names;
  const sideName = (i: number) => `${N[(i + 1) % 3]}${N[(i + 2) % 3]}`.split("").sort((x, y) => N.indexOf(x) - N.indexOf(y)).join("");
  const angName = (i: number) => `\\hat{${N[i]}}`;
  const len = (x: number) => measureTex(x, p.sym, 1);
  const sq = (x: number) => measureTex(x * x, p.sym, 2);
  const side = [...p.side];
  const angle = [...p.angle];

  if (p.iso !== undefined) {
    const [j, k] = [(p.iso + 1) % 3, (p.iso + 2) % 3];
    if (side[j] === undefined && side[k] !== undefined) side[j] = side[k];
    if (side[k] === undefined && side[j] !== undefined) side[k] = side[j];
    if (angle[p.iso] !== undefined) angle[j] = angle[k] = (180 - angle[p.iso]!) / 2;
    else if (angle[j] !== undefined) angle[k] = angle[j];
    else if (angle[k] !== undefined) angle[j] = angle[k];
  }
  if (side.every((x) => x === undefined)) oops(NEED, { en: "E.g. “Triangle ABC with AB = 5, AC = 8, angle A = 60°. Find BC.”", vi: "Ví dụ “Tam giác ABC có AB = 5, AC = 8, góc A = 60°. Tính BC.”" });
  if (side.some((x) => x !== undefined && x <= 0) || angle.some((x) => x !== undefined && (x <= 0 || x >= 180))) {
    oops({ en: "Sides must be positive and angles between 0° and 180°.", vi: "Cạnh phải dương và góc nằm giữa 0° và 180°." }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
  }

  // Three given sides must fit together before any angle is worked out.
  if (side.every((x) => x !== undefined) && side.some((x, i) => x! >= side[(i + 1) % 3]! + side[(i + 2) % 3]! - 1e-12)) {
    oops({ en: "These sides break the triangle inequality, so no triangle exists.", vi: "Ba cạnh không thỏa mãn bất đẳng thức tam giác nên không tạo thành tam giác." }, { en: "Each side must be shorter than the other two together.", vi: "Mỗi cạnh phải nhỏ hơn tổng hai cạnh kia." });
  }
  // Two angles give the third.
  const knownA = angle.filter((x) => x !== undefined).length;
  if (knownA === 2) {
    const i = angle.findIndex((x) => x === undefined);
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    angle[i] = 180 - angle[j]! - angle[k]!;
    if (angle[i]! <= 0) oops({ en: "Those two angles already add up to 180° or more.", vi: "Hai góc đã cho có tổng không nhỏ hơn 180°." }, { en: "Check the angles.", vi: "Kiểm tra lại các góc." });
    st.push("formula", { en: "Angle sum", vi: "Tổng ba góc" },
      `${angName(i)} = 180^\\circ - ${angName(j)} - ${angName(k)} = 180^\\circ - ${degTex(angle[j]!)} - ${degTex(angle[k]!)} = ${degTex(angle[i]!)}`,
      { en: "The three angles of a triangle add up to 180°.", vi: "Tổng ba góc của một tam giác bằng 180°." },
      { en: "Angle sum theorem.", vi: "Định lý tổng ba góc trong tam giác." },
      { en: "What do the three angles add up to?", vi: "Ba góc cộng lại bằng bao nhiêu?" });
  }

  const cosineSide = (i: number) => {
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    const v2 = side[j]! ** 2 + side[k]! ** 2 - 2 * side[j]! * side[k]! * Math.cos(angle[i]! * RAD);
    side[i] = Math.sqrt(v2);
    st.push("formula", { en: "Law of cosines", vi: "Định lý côsin" },
      `${sideName(i)}^2 = ${sideName(j)}^2 + ${sideName(k)}^2 - 2\\cdot ${sideName(j)}\\cdot ${sideName(k)}\\cdot\\cos ${angName(i)} = ${sq(side[j]!)} + ${sq(side[k]!)} - 2\\cdot ${len(side[j]!)}\\cdot ${len(side[k]!)}\\cdot ${ratioTex(Math.cos(angle[i]! * RAD))} = ${sq(side[i]!)}\\\\ \\Rightarrow ${sideName(i)} = ${len(side[i]!)}`,
      { en: `Two sides and the angle between them are known, so the law of cosines gives the third side.`, vi: `Biết hai cạnh và góc xen giữa, nên dùng định lý côsin để tính cạnh thứ ba.` },
      { en: "a² = b² + c² − 2bc·cos A generalises Pythagoras (cos 90° = 0).", vi: "a² = b² + c² − 2bc·cos A là định lý Pi-ta-go mở rộng (cos 90° = 0)." },
      { en: "Which angle sits between the two known sides?", vi: "Góc nào nằm xen giữa hai cạnh đã biết?" });
  };
  const cosineAngle = (i: number) => {
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    const c = (side[j]! ** 2 + side[k]! ** 2 - side[i]! ** 2) / (2 * side[j]! * side[k]!);
    angle[i] = Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
    st.push("formula", { en: `Angle ${N[i]}`, vi: `Góc ${N[i]}` },
      `\\cos ${angName(i)} = \\frac{${sideName(j)}^2 + ${sideName(k)}^2 - ${sideName(i)}^2}{2\\cdot ${sideName(j)}\\cdot ${sideName(k)}} = \\frac{${sq(side[j]!)} + ${sq(side[k]!)} - ${sq(side[i]!)}}{2\\cdot ${len(side[j]!)}\\cdot ${len(side[k]!)}} = ${ratioTex(c)}\\ \\Rightarrow\\ ${angName(i)} ${degTex(angle[i]!).startsWith("\\approx") ? "" : "= "}${degTex(angle[i]!)}`,
      { en: "With all three sides known, the law of cosines, solved for cos, gives each angle.", vi: "Biết ba cạnh, dùng hệ quả của định lý côsin để tính côsin của từng góc." },
      { en: "From a² = b² + c² − 2bc·cos A.", vi: "Suy ra từ a² = b² + c² − 2bc·cos A." },
      { en: "Put the three sides into cos A = (b² + c² − a²) / 2bc.", vi: "Thay ba cạnh vào cos A = (b² + c² − a²) / 2bc." });
  };
  const sineSide = (i: number, from: number) => {
    side[i] = (side[from]! * Math.sin(angle[i]! * RAD)) / Math.sin(angle[from]! * RAD);
    st.push("formula", { en: "Law of sines", vi: "Định lý sin" },
      `\\frac{${sideName(i)}}{\\sin ${angName(i)}} = \\frac{${sideName(from)}}{\\sin ${angName(from)}}\\ \\Rightarrow\\ ${sideName(i)} = \\frac{${len(side[from]!)}\\cdot\\sin ${degTex(angle[i]!)}}{\\sin ${degTex(angle[from]!)}} = ${len(side[i]!)}`,
      { en: "All angles are known, so each side is proportional to the sine of the angle opposite it.", vi: "Đã biết các góc, nên mỗi cạnh tỉ lệ với sin của góc đối diện." },
      { en: "a / sin A = b / sin B = c / sin C = 2R.", vi: "a / sin A = b / sin B = c / sin C = 2R." },
      { en: "Pair each side with the angle opposite it.", vi: "Ghép mỗi cạnh với góc đối diện." });
  };

  const known = () => side.filter((x) => x !== undefined).length;
  let guard = 0;
  while ((side.some((x) => x === undefined) || angle.some((x) => x === undefined)) && guard++ < 6) {
    if (known() === 3) {
      angle.forEach((a, i) => a === undefined && cosineAngle(i));
      continue;
    }
    if (angle.every((x) => x !== undefined)) {
      const from = side.findIndex((x) => x !== undefined);
      side.forEach((x, i) => x === undefined && sineSide(i, from));
      continue;
    }
    if (known() === 2) {
      const i = side.findIndex((x) => x === undefined);
      if (angle[i] !== undefined) {
        cosineSide(i);
        continue;
      }
      // Two sides and an angle that isn't between them: the law of sines, maybe two triangles.
      const j = [0, 1, 2].find((x) => x !== i && angle[x] !== undefined);
      if (j === undefined) oops(NEED, { en: "Add an angle.", vi: "Hãy cho thêm một góc." });
      const k = 3 - i - j!;
      const sinK = (side[k]! * Math.sin(angle[j!]! * RAD)) / side[j!]!;
      if (sinK > 1 + 1e-12) oops({ en: "No triangle has these measures: the side is too short to reach.", vi: "Không có tam giác nào thỏa mãn: cạnh đối diện quá ngắn." }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
      const k1 = Math.asin(Math.min(1, sinK)) / RAD;
      const k2 = 180 - k1;
      const two = !close(k1, k2) && angle[j!]! + k2 < 180;
      angle[k] = k1;
      st.push("formula", { en: "Law of sines", vi: "Định lý sin" },
        `\\sin ${angName(k)} = \\frac{${sideName(k)}\\cdot\\sin ${angName(j!)}}{${sideName(j!)}} = \\frac{${len(side[k]!)}\\cdot\\sin ${degTex(angle[j!]!)}}{${len(side[j!]!)}} = ${ratioTex(sinK)}\\ \\Rightarrow\\ ${angName(k)} ${degTex(k1).startsWith("\\approx") ? "" : "= "}${degTex(k1)}${two ? `\\ \\text{${L({ en: "or", vi: "hoặc" })}}\\ ${degTex(k2)}` : ""}`,
        { en: "The known angle isn't between the two known sides, so use the law of sines for the angle opposite the other side.", vi: "Góc đã biết không xen giữa hai cạnh đã biết, nên dùng định lý sin để tính góc đối diện cạnh còn lại." },
        { en: "sin has the same value at x and 180° − x, so there may be two triangles.", vi: "sin x = sin(180° − x), nên có thể có hai tam giác." },
        { en: "Which side is opposite the known angle?", vi: "Cạnh nào đối diện góc đã biết?" });
      if (two) notes.push(L({ en: `Two triangles fit these measures (${N[k]} ≈ ${Number(k1.toFixed(2))}° or ${Number(k2.toFixed(2))}°); the answers below use the first.`, vi: `Có hai tam giác thỏa mãn (${N[k]} ≈ ${Number(k1.toFixed(2))}° hoặc ${Number(k2.toFixed(2))}°); các kết quả dưới đây ứng với trường hợp đầu.` }));
      continue;
    }
    oops(NEED, { en: "Add another side.", vi: "Hãy cho thêm một cạnh." });
  }
  const sd = side as number[];
  const an = angle as number[];
  if (an.some((x) => x <= 0) || sd.some((x) => !(x > 0))) oops({ en: "No triangle has these measures.", vi: "Không có tam giác nào thỏa mãn dữ kiện." }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
  // Sides must satisfy the triangle inequality when all were given.
  if (sd.some((x, i) => x >= sd[(i + 1) % 3] + sd[(i + 2) % 3] - 1e-12)) oops({ en: "These sides break the triangle inequality, so no triangle exists.", vi: "Ba cạnh không thỏa mãn bất đẳng thức tam giác nên không tạo thành tam giác." }, { en: "Each side must be shorter than the other two together.", vi: "Mỗi cạnh phải nhỏ hơn tổng hai cạnh kia." });

  const area = 0.5 * sd[1] * sd[2] * Math.sin(an[0] * RAD);
  const answers: MeasureAnswer[] = [];
  const goals = p.goals.length ? p.goals : defaultGoals(p);
  const areaStep = () => {
    if (st.drafts.some((d) => d.operation === L({ en: "Area", vi: "Diện tích" }))) return;
    // Use an angle whose two sides were given, when there is one.
    const i = [0, 1, 2].find((x) => p.side[(x + 1) % 3] !== undefined && p.side[(x + 2) % 3] !== undefined) ?? 0;
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    st.push("formula", { en: "Area", vi: "Diện tích" },
      `S = \\frac{1}{2}\\cdot ${sideName(j)}\\cdot ${sideName(k)}\\cdot\\sin ${angName(i)} = \\frac{1}{2}\\cdot ${len(sd[j])}\\cdot ${len(sd[k])}\\cdot ${ratioTex(Math.sin(an[i] * RAD))} = ${measureTex(area, p.sym, 2)}`,
      { en: "Half the product of two sides and the sine of the angle between them.", vi: "Bằng nửa tích hai cạnh nhân với sin góc xen giữa." },
      { en: "The height on one side is the other side times sin of the angle.", vi: "Đường cao ứng với một cạnh bằng cạnh kia nhân sin góc xen giữa." },
      { en: "Pick two sides and the angle between them.", vi: "Chọn hai cạnh và góc xen giữa." });
  };
  for (const g of goals) {
    if (g.k === "side") answers.push({ key: `side${g.i}`, latex: `${sideName(g.i)} = ${len(sd[g.i])}`, value: sd[g.i] });
    else if (g.k === "angle") answers.push({ key: `angle${g.i}`, latex: `${angName(g.i)} ${degTex(an[g.i]).startsWith("\\approx") ? "" : "= "}${degTex(an[g.i])}`, value: an[g.i], degrees: true });
    else if (g.k === "area") {
      areaStep();
      answers.push({ key: "area", latex: `S = ${measureTex(area, p.sym, 2)}`, value: area });
    } else if (g.k === "perimeter") {
      const per = sd[0] + sd[1] + sd[2];
      st.push("formula", { en: "Perimeter", vi: "Chu vi" }, `P = ${sd.map(len).join(" + ")} ${measureTex(per, p.sym).startsWith("\\approx") ? "" : "= "}${measureTex(per, p.sym)}`,
        { en: "Add the three sides.", vi: "Cộng ba cạnh." }, { en: "Definition of perimeter.", vi: "Định nghĩa chu vi." }, { en: "Find all three sides first.", vi: "Tìm đủ ba cạnh trước." });
      answers.push({ key: "perimeter", latex: `P ${measureTex(per, p.sym).startsWith("\\approx") ? "" : "= "}${measureTex(per, p.sym)}`, value: per });
    } else if (g.k === "R") {
      const R = sd[0] / (2 * Math.sin(an[0] * RAD));
      st.push("formula", { en: "Circumradius", vi: "Bán kính đường tròn ngoại tiếp" },
        `R = \\frac{${sideName(0)}}{2\\sin ${angName(0)}} = \\frac{${len(sd[0])}}{2\\cdot ${ratioTex(Math.sin(an[0] * RAD))}} = ${len(R)}`,
        { en: "From the law of sines, each side over the sine of its opposite angle is 2R.", vi: "Theo định lý sin, mỗi cạnh chia sin góc đối diện bằng 2R." },
        { en: "a / sin A = 2R.", vi: "a / sin A = 2R." }, { en: "Use one side and the angle opposite it.", vi: "Dùng một cạnh và góc đối diện." });
      answers.push({ key: "R", latex: `R = ${len(R)}`, value: R });
    } else if (g.k === "r") {
      areaStep();
      const half = (sd[0] + sd[1] + sd[2]) / 2;
      const r = area / half;
      st.push("formula", { en: "Inradius", vi: "Bán kính đường tròn nội tiếp" },
        `p = \\frac{${sd.map(len).join(" + ")}}{2} = ${len(half)},\\quad r = \\frac{S}{p} = ${len(r)}`,
        { en: "The area equals the half-perimeter times the inradius.", vi: "Diện tích bằng nửa chu vi nhân bán kính đường tròn nội tiếp." },
        { en: "S = p·r: split the triangle into three triangles with height r.", vi: "S = p·r: chia tam giác thành ba tam giác có chung chiều cao r." },
        { en: "Find the half-perimeter first.", vi: "Tính nửa chu vi trước." });
      answers.push({ key: "r", latex: `r = ${len(r)}`, value: r });
    } else if (g.k === "height") {
      areaStep();
      const h = (2 * area) / sd[g.i];
      const name = g.name ?? `h_{${"abc"[g.i]}}`;
      st.push("formula", { en: "Altitude", vi: "Đường cao" }, `${name} = \\frac{2S}{${sideName(g.i)}} = ${len(h)}`,
        { en: `Area = ½ · base · height, with ${sideName(g.i)} as the base.`, vi: `Diện tích = ½ · đáy · chiều cao, lấy ${sideName(g.i)} làm đáy.` },
        { en: "S = ½·a·hₐ.", vi: "S = ½·a·hₐ." }, { en: "Use the area you already have.", vi: "Dùng diện tích đã tính." });
      answers.push({ key: `height${g.i}`, latex: `${name} = ${len(h)}`, value: h });
    } else if (g.k === "median") {
      const [j, k] = [(g.i + 1) % 3, (g.i + 2) % 3];
      const m = Math.sqrt((2 * sd[j] ** 2 + 2 * sd[k] ** 2 - sd[g.i] ** 2) / 4);
      const name = g.name ?? `m_{${"abc"[g.i]}}`;
      st.push("formula", { en: "Median", vi: "Đường trung tuyến" },
        `${name}^2 = \\frac{2${sideName(j)}^2 + 2${sideName(k)}^2 - ${sideName(g.i)}^2}{4} = ${sq(m)}\\ \\Rightarrow\\ ${name} = ${len(m)}`,
        { en: "The median length formula uses all three sides.", vi: "Công thức độ dài trung tuyến dùng cả ba cạnh." },
        { en: "It follows from the law of cosines in the two halves of the triangle.", vi: "Suy ra từ định lý côsin trong hai nửa tam giác." },
        { en: "Which side does this median cut in half?", vi: "Trung tuyến này chia đôi cạnh nào?" });
      answers.push({ key: `median${g.i}`, latex: `${name} = ${len(m)}`, value: m });
    }
  }
  // Independent check: every side satisfies the law of cosines, angles add to 180°.
  const ok = [0, 1, 2].every((i) => close(sd[i] ** 2, sd[(i + 1) % 3] ** 2 + sd[(i + 2) % 3] ** 2 - 2 * sd[(i + 1) % 3] * sd[(i + 2) % 3] * Math.cos(an[i] * RAD), 1e-9)) && close(an[0] + an[1] + an[2], 180, 1e-9);
  st.push("verify", { en: "Check", vi: "Kiểm tra" },
    `${angName(0)} + ${angName(1)} + ${angName(2)} = 180^\\circ,\\quad ${[0, 1, 2].map((i) => `${sideName(i)} = ${len(sd[i])}`).join(",\\ ")}`,
    { en: "The angles add up to 180° and every side fits the law of cosines with the other two.", vi: "Ba góc có tổng 180° và mỗi cạnh đều thỏa mãn định lý côsin với hai cạnh còn lại." },
    { en: "A real triangle must satisfy all three relations at once.", vi: "Một tam giác thật phải thỏa mãn cả ba hệ thức cùng lúc." },
    { en: "Check one relation you didn't use.", vi: "Kiểm tra một hệ thức chưa dùng." },
    ok ? "passed" : "failed");
  return { steps: st, answers, solved: { side: sd, angle: an }, notes };
}

function defaultGoals(p: TriangleProblem): Goal[] {
  const g: Goal[] = [];
  p.side.forEach((x, i) => x === undefined && g.push({ k: "side", i }));
  p.angle.forEach((x, i) => x === undefined && g.push({ k: "angle", i }));
  g.push({ k: "area" }, { k: "R" }, { k: "r" });
  return g;
}

/** Vertex positions for drawing: first at the origin, second along the x-axis. */
export function trianglePoints(s: Solved): number[][] {
  const c = s.side[2];
  const b = s.side[1];
  const A = s.angle[0] * RAD;
  return [[0, 0], [c, 0], [b * Math.cos(A), b * Math.sin(A)]];
}
