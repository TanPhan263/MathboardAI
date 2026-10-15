import { clean } from "../geometry/parse";
import { type MeasureAnswer, Steps, VAL, measureTex, oops, readValue } from "./num";

/**
 * Solids by formula: cones, cylinders, spheres, and pyramids/prisms given by
 * base area and height. Answers keep π and the unit length symbolic.
 */

export type RoundKind = "cone" | "cylinder" | "sphere" | "pyramid" | "prism";
type Goal = "V" | "Sxq" | "Stp" | "S" | "l" | "h";

export type SolidProblem = {
  kind: RoundKind;
  r?: number;
  h?: number;
  l?: number;
  B?: number;
  sym: string | null;
  goals: Goal[];
};

const KIND: Array<[RegExp, RoundKind]> = [
  [/(?:hình|khối)\s+nón|(?<![\p{L}])cone/u, "cone"],
  [/(?:hình|khối)\s+trụ(?!\s*đứng)|cylinder/u, "cylinder"],
  [/(?:hình|khối|mặt)\s+cầu|sphere|(?<![\p{L}])ball/u, "sphere"],
  [/(?:hình|khối)\s+chóp|pyramid/u, "pyramid"],
  [/(?:hình|khối)\s+lăng trụ|prism/u, "prism"],
];

export function solidKind(s: string): RoundKind | null {
  for (const [re, k] of KIND) if (re.test(s)) return k;
  return null;
}

export function parseSolid(raw: string): SolidProblem {
  const s = clean(raw);
  const kind = solidKind(s);
  if (!kind) oops({ en: "I couldn't tell which solid this is.", vi: "Chưa nhận ra đây là khối gì." }, { en: "Name it: cone, cylinder, sphere, pyramid or prism.", vi: "Hãy nêu tên khối: nón, trụ, cầu, chóp hoặc lăng trụ." });
  let sym: string | null = null;
  const grab = (re: RegExp): number | undefined => {
    const m = s.match(re);
    if (!m) return undefined;
    const v = readValue(m[m.length - 1]);
    if (!v) return undefined;
    if (v.sym && sym && v.sym !== sym) oops({ en: "Use one letter for lengths (like a).", vi: "Chỉ dùng một chữ cho độ dài (như a)." }, { en: "Write the others as multiples of it.", vi: "Viết các độ dài khác theo chữ đó." });
    sym = v.sym ?? sym;
    return v.value;
  };
  const is = String.raw`\s*(?:(?:bằng|là|=|of|is|equal to)\s*)?`;
  let r = grab(new RegExp(String.raw`(?:bán kính(?: đáy)?|radius)\s*(?:[rR]\s*)?${is}${VAL}`, "u"));
  const d = grab(new RegExp(String.raw`(?:đường kính(?: đáy)?|diameter)\s*(?:d\s*)?${is}${VAL}`, "u"));
  if (r === undefined && d !== undefined) r = d / 2;
  let h = grab(new RegExp(String.raw`(?:chiều cao|đường cao|height)\s*(?:h\s*)?${is}${VAL}`, "u"));
  let l = grab(new RegExp(String.raw`(?:đường sinh|slant height|generatrix)\s*(?:l\s*)?${is}${VAL}`, "u"));
  const B = grab(new RegExp(String.raw`(?:diện tích (?:mặt )?đáy|base area)\s*(?:B\s*)?${is}${VAL}`, "u"));
  // Axial section: equilateral triangle of side x (cone) or a square of side x (cylinder).
  const sec = grab(new RegExp(String.raw`(?:thiết diện qua trục|axial (?:cross[- ])?section)[^.;]*?(?:tam giác đều|equilateral triangle|hình vuông|square)\s*(?:có\s+)?(?:cạnh|side|of side)?${is}${VAL}`, "u"));
  if (sec !== undefined) {
    r ??= sec / 2;
    if (kind === "cone") {
      l ??= sec;
      h ??= (sec * Math.sqrt(3)) / 2;
    } else h ??= sec;
  }
  const q = s;
  const goals: Goal[] = [];
  if (/thể tích|volume|(?<![\p{L}])V(?![\p{L}])/u.test(q)) goals.push("V");
  if (/xung quanh|lateral/u.test(q)) goals.push("Sxq");
  if (/toàn phần|total surface/u.test(q)) goals.push("Stp");
  if (kind === "sphere" && /diện tích|surface area|area/u.test(q)) goals.push("S");
  if (/(?:tính|tìm|find)\s+(?:độ dài\s+)?(?:đường sinh|slant height)/u.test(q)) goals.push("l");
  if (/(?:tính|tìm|find)\s+(?:the\s+)?(?:chiều cao|height)/u.test(q)) goals.push("h");
  return { kind: kind!, r, h, l, B, sym, goals };
}

export function solveSolid(p: SolidProblem): { steps: Steps; answers: MeasureAnswer[] } {
  const st = new Steps();
  const answers: MeasureAnswer[] = [];
  const L1 = (x: number) => measureTex(x, p.sym, 1);
  const L2 = (x: number, pi = false) => measureTex(x, p.sym, 2, pi);
  const L3 = (x: number, pi = false) => measureTex(x, p.sym, 3, pi);
  let { r, h, l } = p;
  const missing = (what: { en: string; vi: string }) => oops({ en: `I need the ${what.en}.`, vi: `Cần biết ${what.vi}.` }, { en: "Add it to the problem.", vi: "Hãy bổ sung vào đề bài." });
  const goals = p.goals.length ? p.goals : p.kind === "sphere" ? (["V", "S"] as Goal[]) : p.kind === "pyramid" || p.kind === "prism" ? (["V"] as Goal[]) : (["V", "Sxq", "Stp"] as Goal[]);

  if (p.kind === "pyramid" || p.kind === "prism") {
    if (p.B === undefined) missing({ en: "base area B", vi: "diện tích đáy B" });
    if (h === undefined) missing({ en: "height h", vi: "chiều cao h" });
    const k = p.kind === "pyramid" ? 1 / 3 : 1;
    const V = k * p.B! * h!;
    st.push("formula", { en: "Volume", vi: "Thể tích" },
      `V = ${p.kind === "pyramid" ? "\\frac{1}{3}" : ""}B\\cdot h = ${p.kind === "pyramid" ? "\\frac{1}{3}\\cdot " : ""}${L2(p.B!)}\\cdot ${L1(h!)} = ${L3(V)}`,
      p.kind === "pyramid" ? { en: "A pyramid's volume is a third of base area times height.", vi: "Thể tích khối chóp bằng một phần ba diện tích đáy nhân chiều cao." } : { en: "A prism's volume is base area times height.", vi: "Thể tích khối lăng trụ bằng diện tích đáy nhân chiều cao." },
      { en: "Three pyramids with the same base and height fill the prism on that base.", vi: "Ba khối chóp cùng đáy, cùng chiều cao ghép lại được khối lăng trụ trên đáy đó." },
      { en: "What are B and h here?", vi: "Ở đây B và h bằng bao nhiêu?" });
    answers.push({ key: "V", latex: `V = ${L3(V)}`, value: V });
    return { steps: st, answers };
  }

  if (p.kind === "sphere") {
    if (r === undefined) missing({ en: "radius", vi: "bán kính" });
    for (const g of goals) {
      if (g === "V") {
        const V = (4 / 3) * Math.PI * r! ** 3;
        st.push("formula", { en: "Volume of the sphere", vi: "Thể tích khối cầu" }, `V = \\frac{4}{3}\\pi R^3 = \\frac{4}{3}\\pi\\cdot\\left(${L1(r!)}\\right)^3 = ${L3(V, true)}`,
          { en: "Put the radius into V = 4/3·π·R³.", vi: "Thay bán kính vào V = 4/3·π·R³." }, { en: "Standard formula for a ball.", vi: "Công thức thể tích khối cầu." }, { en: "Cube the radius first.", vi: "Tính lập phương bán kính trước." });
        answers.push({ key: "V", latex: `V = ${L3(V, true)}`, value: V });
      } else if (g === "S" || g === "Stp" || g === "Sxq") {
        const S = 4 * Math.PI * r! ** 2;
        st.push("formula", { en: "Surface area", vi: "Diện tích mặt cầu" }, `S = 4\\pi R^2 = 4\\pi\\cdot\\left(${L1(r!)}\\right)^2 = ${L2(S, true)}`,
          { en: "Put the radius into S = 4πR².", vi: "Thay bán kính vào S = 4πR²." }, { en: "A sphere's area is four of its great circles.", vi: "Diện tích mặt cầu bằng bốn lần diện tích hình tròn lớn." }, { en: "Square the radius first.", vi: "Bình phương bán kính trước." });
        answers.push({ key: "S", latex: `S = ${L2(S, true)}`, value: S });
      }
    }
    return { steps: st, answers };
  }

  // Cone and cylinder: any two of r, h, l (a cylinder's l is its h).
  if (p.kind === "cylinder") {
    h ??= l;
    if (r === undefined || h === undefined) missing({ en: "radius and height", vi: "bán kính đáy và chiều cao" });
    l = h;
  } else {
    if (r !== undefined && h !== undefined && l === undefined) {
      l = Math.sqrt(r ** 2 + h ** 2);
      st.push("formula", { en: "Slant height", vi: "Đường sinh" }, `l = \\sqrt{r^2 + h^2} = \\sqrt{${L2(r ** 2)} + ${L2(h ** 2)}} = ${L1(l)}`,
        { en: "Radius, height and slant height form a right triangle.", vi: "Bán kính, chiều cao và đường sinh tạo thành tam giác vuông." }, { en: "Pythagoras in the axial section.", vi: "Định lý Pi-ta-go trong thiết diện qua trục." }, { en: "Which segment is the hypotenuse?", vi: "Đoạn nào là cạnh huyền?" });
    } else if (r !== undefined && l !== undefined && h === undefined) {
      if (l <= r) oops({ en: "The slant height must be longer than the radius.", vi: "Đường sinh phải dài hơn bán kính." }, { en: "Check the data.", vi: "Kiểm tra lại dữ kiện." });
      h = Math.sqrt(l ** 2 - r ** 2);
      st.push("formula", { en: "Height", vi: "Chiều cao" }, `h = \\sqrt{l^2 - r^2} = \\sqrt{${L2(l ** 2)} - ${L2(r ** 2)}} = ${L1(h)}`,
        { en: "Radius, height and slant height form a right triangle.", vi: "Bán kính, chiều cao và đường sinh tạo thành tam giác vuông." }, { en: "Pythagoras in the axial section.", vi: "Định lý Pi-ta-go trong thiết diện qua trục." }, { en: "Which segment is the hypotenuse?", vi: "Đoạn nào là cạnh huyền?" });
    } else if (h !== undefined && l !== undefined && r === undefined) {
      r = Math.sqrt(l ** 2 - h ** 2);
      st.push("formula", { en: "Radius", vi: "Bán kính đáy" }, `r = \\sqrt{l^2 - h^2} = ${L1(r)}`,
        { en: "Radius, height and slant height form a right triangle.", vi: "Bán kính, chiều cao và đường sinh tạo thành tam giác vuông." }, { en: "Pythagoras in the axial section.", vi: "Định lý Pi-ta-go trong thiết diện qua trục." }, { en: "Which segment is the hypotenuse?", vi: "Đoạn nào là cạnh huyền?" });
    }
    if (r === undefined || h === undefined || l === undefined) missing({ en: "two of radius, height and slant height", vi: "hai trong ba yếu tố: bán kính, chiều cao, đường sinh" });
  }
  const cone = p.kind === "cone";
  for (const g of goals) {
    if (g === "V") {
      const V = (cone ? 1 / 3 : 1) * Math.PI * r! ** 2 * h!;
      st.push("formula", { en: "Volume", vi: "Thể tích" }, `V = ${cone ? "\\frac{1}{3}" : ""}\\pi r^2 h = ${cone ? "\\frac{1}{3}" : ""}\\pi\\cdot\\left(${L1(r!)}\\right)^2\\cdot ${L1(h!)} = ${L3(V, true)}`,
        cone ? { en: "A cone is a third of the cylinder with the same base and height.", vi: "Khối nón bằng một phần ba khối trụ cùng đáy, cùng chiều cao." } : { en: "Base area πr² times height.", vi: "Diện tích đáy πr² nhân chiều cao." },
        { en: "Volume = (base area × height), a third of it for a cone.", vi: "Thể tích = diện tích đáy × chiều cao, khối nón lấy một phần ba." },
        { en: "Find the base area πr² first.", vi: "Tính diện tích đáy πr² trước." });
      answers.push({ key: "V", latex: `V = ${L3(V, true)}`, value: V });
    } else if (g === "Sxq" || g === "Stp") {
      const side = cone ? Math.PI * r! * l! : 2 * Math.PI * r! * h!;
      if (g === "Sxq" || !st.drafts.some((d) => d.latex.startsWith("S_{xq}"))) {
        st.push("formula", { en: "Lateral area", vi: "Diện tích xung quanh" }, `S_{xq} = ${cone ? "\\pi r l" : "2\\pi r h"} = ${L2(side, true)}`,
          cone ? { en: "Unrolled, the side of a cone is a sector with area π·r·l.", vi: "Trải phẳng mặt xung quanh hình nón được hình quạt có diện tích π·r·l." } : { en: "Unrolled, the side of a cylinder is a rectangle 2πr by h.", vi: "Trải phẳng mặt xung quanh hình trụ được hình chữ nhật 2πr × h." },
          { en: "Standard lateral-area formula.", vi: "Công thức diện tích xung quanh." }, { en: "Which lengths does the formula need?", vi: "Công thức cần những độ dài nào?" });
        if (g === "Sxq") answers.push({ key: "Sxq", latex: `S_{xq} = ${L2(side, true)}`, value: side });
      }
      if (g === "Stp") {
        const total = side + (cone ? 1 : 2) * Math.PI * r! ** 2;
        st.push("formula", { en: "Total area", vi: "Diện tích toàn phần" }, `S_{tp} = S_{xq} + ${cone ? "" : "2"}\\pi r^2 = ${L2(total, true)}`,
          { en: `Add the area of the ${cone ? "base" : "two bases"}.`, vi: `Cộng thêm diện tích ${cone ? "đáy" : "hai đáy"}.` },
          { en: "Total = side + bases.", vi: "Toàn phần = xung quanh + các đáy." }, { en: "How many bases does it have?", vi: "Khối này có mấy đáy?" });
        answers.push({ key: "Stp", latex: `S_{tp} = ${L2(total, true)}`, value: total });
      }
    } else if (g === "l") answers.push({ key: "l", latex: `l = ${L1(l!)}`, value: l! });
    else if (g === "h") answers.push({ key: "h", latex: `h = ${L1(h!)}`, value: h! });
  }
  return { steps: st, answers };
}
