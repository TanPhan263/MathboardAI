import { L } from "../lang";
import { clean } from "../geometry/parse";
import { type MeasureAnswer, MeasureError, RAD, Steps, type Text, close, degTex, measureTex, oops, ratioTex } from "./num";
import { Affine, type PlaneDef } from "./affine";
import { type Model, type V3, add3, cross3, dot3, len3, mul3, near, polygonArea, sub3 } from "./space";

/**
 * Questions about a solid from words: volumes, angles, distances, lengths,
 * and ⊥ / ∥ proofs. Each angle or distance is worked the textbook way when a
 * standard construction applies (projection of the apex, perpendicular to the
 * common line, foot of the altitude on a face) and always checked again with
 * coordinates (phương pháp tọa độ).
 */

type Line = [string, string];
type Plane = string[];
type Ref = { k: "point"; p: string } | { k: "line"; l: Line } | { k: "plane"; pl: Plane };
type Goal =
  | { k: "volume"; of?: { apex: string; base: string[] } }
  | { k: "angle" | "distance"; x: Ref; y: Ref }
  | { k: "dihedral"; a: string; e: Line; b: string }
  | { k: "meetPlanes"; x: Plane; y: Plane }
  | { k: "meetLine"; l: Line; pl: Plane }
  | { k: "section"; pl: Plane | null; area: boolean }
  | { k: "length"; l: Line }
  | { k: "area"; pts: string[] }
  | { k: "prove"; rel: "perp" | "parallel"; x: Ref; y: Ref };

const EPS = 1e-9;

/* ───────────────────────────── Reading questions ───────────────────────────── */

const PL = String.raw`(\((?:[A-Z]'?){3,4}\)|\((?:α|β|γ|P|Q|R)\)|(?:mặt\s+)?(?:phẳng\s+)?đáy|the base)`;
const REF = String.raw`(\((?:[A-Z]'?){3,4}\)|\((?:α|β|γ|P|Q|R)\)|(?:mặt\s+)?(?:phẳng\s+)?đáy|the base|[A-Z]'?(?:[A-Z]'?)?(?![A-Z']))`;
const TW = String.raw`(?:(?:a|an|hai|two|đường thẳng|mặt phẳng|mp|cạnh|điểm|the|line|plane|point|edge|lines|planes)\s+)*`;

function refOf(t: string, m: Model, named?: Map<string, PlaneDef>): Ref | null {
  const t2 = t.trim();
  const def = named?.get(t2);
  if (def) return { k: "plane", pl: def.pts };
  if (/^\((?:α|β|γ|P|Q|R)\)$/u.test(t2)) return null;
  if (/đáy|base/u.test(t2)) return { k: "plane", pl: m.base };
  const names = t2.replace(/[()]/g, "").match(/[A-Z]'?/g) ?? [];
  if (!names.every((x) => m.pts.has(x))) return null;
  if (t2.startsWith("(")) return names.length >= 3 ? { k: "plane", pl: names } : null;
  if (names.length === 2) return { k: "line", l: [names[0], names[1]] };
  if (names.length === 1) return { k: "point", p: names[0] };
  return null;
}

function parseGoals(raw: string, m: Model, named: Map<string, PlaneDef>): Goal[] {
  let s = clean(raw.replace(/[’′`]/g, "'"))
    .replace(/\s+/g, " ")
    // Given angles are data, not questions: “góc giữa SB và đáy bằng 60°”.
    .replace(/(?:góc giữa|angle between)[^.;,]*?\s(?:bằng|=|là|is|equals?)\s*\d+(?:[.,]\d+)?\s*(?:°|độ|\^\\circ)/gu, " ")
    .replace(/(?:góc nhị diện|dihedral angle)?\s*\[[^\]]*\]\s*(?:bằng|=|là|is|equals?|of)\s*\d+(?:[.,]\d+)?\s*(?:°|độ)?/gu, " ")
    .replace(/(?:tạo với|hợp với|makes)[^.;,]*?(?:góc|angle)(?:\s+of)?\s*\d+(?:[.,]\d+)?\s*(?:°|độ)?/gu, " ");
  if (m.apex) {
    // “cạnh bên” / “mặt bên” of a pyramid: any one of them (they're all alike in a regular pyramid).
    const b = m.base.find((x) => x !== m.foot) ?? m.base[0];
    s = s.replace(/cạnh bên|lateral edge/gu, `${m.apex}${b}`).replace(/mặt bên|lateral face/gu, `(${m.apex}${m.base[0]}${m.base[1]})`);
  } else if (m.top) {
    s = s.replace(/cạnh bên|lateral edge/gu, `${m.base[0]}${m.top[0]}`);
  }
  const found: Array<{ at: number; g: Goal }> = [];
  const take = (re: RegExp, make: (x: RegExpMatchArray) => Goal | null) => {
    for (let guard = 0; guard < 8; guard++) {
      const x = s.match(re);
      if (!x || x.index === undefined) return;
      const g = make(x);
      if (g) found.push({ at: x.index, g });
      s = s.slice(0, x.index) + " ".repeat(x[0].length) + s.slice(x.index + x[0].length);
    }
  };
  const two = (a: string, b: string, make: (x: Ref, y: Ref) => Goal | null) => {
    const x = refOf(a, m, named);
    const y = refOf(b, m, named);
    return x && y ? make(x, y) : null;
  };
  // Intersections and sections (quan hệ song song).
  // “giao tuyến của (SAB) và (SCD), (SAD) và (SBC)”: every pair in the list.
  const PLN = PL.replace(/^\(/, "(?:");
  const meet = (a: string, b: string) => two(a, b, (p, q) => (p.k === "plane" && q.k === "plane" ? { k: "meetPlanes", x: p.pl, y: q.pl } : null));
  take(new RegExp(String.raw`(?:giao tuyến|intersection line|line of intersection)\s+(?:của\s+|of\s+)?(?:hai\s+)?(?:mặt phẳng\s+|mp\s+|the planes\s+|planes\s+)?${PL}\s*(?:và|and|,)\s*(?:mặt phẳng\s+|mp\s+)?${PL}((?:\s*[,;]\s*(?:và\s+|and\s+)?(?:của\s+|of\s+)?${PLN}\s*(?:và|and)\s*${PLN})*)`, "u"), (x) => {
    for (const p of x[3].matchAll(new RegExp(String.raw`${PL}\s*(?:và|and)\s*${PL}`, "gu"))) {
      const g = meet(p[1], p[2]);
      if (g) found.push({ at: x.index! + x[0].length - x[3].length + p.index!, g });
    }
    return meet(x[1], x[2]);
  });
  take(new RegExp(String.raw`(?:giao điểm|intersection point|point of intersection|point where)\s+(?:của\s+|of\s+)?(?:đường thẳng\s+|line\s+)?([A-Z]'?[A-Z]'?)\s+(?:và|với|and|with|meets)\s+(?:mặt phẳng\s+|mp\s+|the plane\s+|plane\s+)?${PL}`, "u"), (x) =>
    two(x[1], x[2], (a, b) => (a.k === "line" && b.k === "plane" ? { k: "meetLine", l: a.l, pl: b.pl } : null)),
  );
  let lastSection: Extract<Goal, { k: "section" }> | null = null;
  take(new RegExp(String.raw`(diện tích\s+|area of\s+(?:the\s+)?)?(?:thiết diện|cross-?section|section)(?:[^.;]*?${PL})?`, "u"), (x) => {
    const ref = x[2] ? refOf(x[2], m, named) : null;
    // “…và tính diện tích thiết diện”: the area of the section found just before.
    if (x[1] && !ref && lastSection) {
      lastSection.area = true;
      return null;
    }
    const last = [...named.values()].at(-1);
    const pl = ref?.k === "plane" ? ref.pl : (last?.pts ?? null);
    lastSection = { k: "section", pl, area: !!x[1] };
    return lastSection;
  });
  // Proofs: “Chứng minh BC ⊥ (SAB) và (SBC) ⊥ (SAB)”.
  take(/(?:chứng minh|cmr|prove|show)(?:\s+(?:rằng|that))?\s+((?:[^.;]|\.(?!\s))+)/u, (x) => {
    for (const c of x[1].matchAll(new RegExp(String.raw`${TW}${REF}\s*(⊥|vuông góc(?:\s+với)?|is perpendicular to|perpendicular to|//|song song(?:\s+với)?|is parallel to|parallel to)\s*${TW}${REF}`, "gu"))) {
      const g = two(c[1], c[3], (a, b) => (a.k === "point" || b.k === "point" ? null : { k: "prove", rel: /⊥|vuông|perpendicular/u.test(c[2]) ? "perp" : "parallel", x: a, y: b }));
      if (g) found.push({ at: x.index! + (c.index ?? 0), g });
    }
    return null;
  });
  take(/(?:(?:góc phẳng nhị diện|góc nhị diện|dihedral angles?)\s*)?\[\s*([A-Z]'?)\s*,?\s*([A-Z]'?)([A-Z]'?)\s*,?\s*([A-Z]'?)\s*\]/u, (x) =>
    [x[1], x[2], x[3], x[4]].every((p) => m.pts.has(p)) ? { k: "dihedral", a: x[1], e: [x[2], x[3]], b: x[4] } : null,
  );
  take(new RegExp(String.raw`(?:góc giữa|angle between)\s+${TW}${REF}\s+(?:và|and)\s+${TW}${REF}`, "u"), (x) => two(x[1], x[2], (a, b) => ({ k: "angle", x: a, y: b })));
  take(new RegExp(String.raw`(?:khoảng cách từ|distance from)\s+${TW}${REF}\s+(?:đến|tới|to)\s+${TW}${REF}`, "u"), (x) => two(x[1], x[2], (a, b) => ({ k: "distance", x: a, y: b })));
  take(new RegExp(String.raw`(?:khoảng cách giữa|distance between)\s+${TW}${REF}\s+(?:và|and)\s+${TW}${REF}`, "u"), (x) => two(x[1], x[2], (a, b) => ({ k: "distance", x: a, y: b })));
  take(new RegExp(String.raw`(?<![\p{L}])d\s*\(\s*${REF}\s*[,;]\s*${REF}\s*\)`, "u"), (x) => two(x[1], x[2], (a, b) => ({ k: "distance", x: a, y: b })));
  take(/(?:thể tích|volume)(?:\s+(?:của\s+|of\s+)?(?:the\s+)?(?:khối\s+)?(?:chóp\s+|tứ diện\s+|lăng trụ\s+|hộp\s+|lập phương\s+|pyramid\s+|tetrahedron\s+|prism\s+)?((?:[A-Z]'?)\.?(?:[A-Z]'?(?:\.)?){2,8}))?/u, (x) => {
    const nm = x[1]?.replace(/\./g, "");
    const names = nm?.match(/[A-Z]'?/g) ?? [];
    if (!x[1] || x[1] === m.name || nm === m.name.replace(".", "") || names.length < 4 || !names.every((p) => m.pts.has(p))) return { k: "volume" };
    return { k: "volume", of: { apex: names[0]!, base: names.slice(1) } };
  });
  take(/(?:diện tích|area of)\s+(?:tam giác|triangle)\s+([A-Z]'?)([A-Z]'?)([A-Z]'?)/u, (x) => ([x[1], x[2], x[3]].every((p) => m.pts.has(p)) ? { k: "area", pts: [x[1], x[2], x[3]] } : null));
  take(/(?:độ dài(?:\s+đoạn)?|length of|(?:tính|find)\s+(?:đoạn\s+)?)\s*([A-Z]'?)([A-Z]'?)(?![\p{L}'(])/u, (x) => (m.pts.has(x[1]) && m.pts.has(x[2]) ? { k: "length", l: [x[1], x[2]] } : null));
  const goals = found.sort((a, b) => a.at - b.at).map((f) => f.g);
  return goals.length ? goals : [{ k: "volume" }];
}

/* ───────────────────────────── The solver ───────────────────────────── */

export class SpaceSolver {
  st = new Steps();
  answers: MeasureAnswer[] = [];
  notes: string[] = [];
  /** Construction segments to draw dashed (foot of a perpendicular…). */
  extra: Array<[string, string]> = [];
  private coordsShown = false;
  private proven = new Map<string, Proof | null>();

  /** Planes shown by a given name, (α) instead of (MNPQ); keyed by planeKey. */
  alias = new Map<string, string>();
  /** The cross-section polygon, for the figure. */
  section: string[] | null = null;
  affine: Affine;

  constructor(readonly m: Model) {
    this.affine = new Affine(this);
  }

  planeKey = (p: Plane) => [...p].sort().join(",");

  P = (x: string): V3 => this.m.pts.get(x)!;
  len = (x: number) => measureTex(x, this.m.sym, 1);
  area = (x: number) => measureTex(x, this.m.sym, 2);
  vol = (x: number) => measureTex(x, this.m.sym, 3);
  eqOr = (tex: string) => (tex.startsWith("\\approx") ? tex : `= ${tex}`);
  dist = (a: string, b: string) => len3(sub3(this.P(b), this.P(a)));

  /* ── Geometry helpers ── */

  normal(pl: Plane): V3 {
    for (let i = 1; i < pl.length; i++) {
      for (let j = i + 1; j < pl.length; j++) {
        const n = cross3(sub3(this.P(pl[i]), this.P(pl[0])), sub3(this.P(pl[j]), this.P(pl[0])));
        if (len3(n) > EPS) return n;
      }
    }
    return oops({ en: `The points of (${pl.join("")}) lie on one line.`, vi: `Các điểm của (${pl.join("")}) thẳng hàng.` }, { en: "Check the plane's name.", vi: "Kiểm tra lại tên mặt phẳng." });
  }
  onPlane = (x: V3, pl: Plane) => Math.abs(dot3(sub3(x, this.P(pl[0])), this.normal(pl))) < EPS * Math.max(1, len3(this.normal(pl)));
  pointsIn = (pl: Plane) => [...this.m.pts.keys()].filter((x) => this.onPlane(this.P(x), pl));
  footPlane(x: V3, pl: Plane): V3 {
    const n = this.normal(pl);
    return sub3(x, mul3(n, dot3(sub3(x, this.P(pl[0])), n) / dot3(n, n)));
  }
  footLine(x: V3, l: Line): V3 {
    const u = sub3(this.P(l[1]), this.P(l[0]));
    return add3(this.P(l[0]), mul3(u, dot3(sub3(x, this.P(l[0])), u) / dot3(u, u)));
  }
  dir = (l: Line) => sub3(this.P(l[1]), this.P(l[0]));
  collinear = (x: V3, l: Line) => len3(cross3(sub3(x, this.P(l[0])), this.dir(l))) < EPS * Math.max(1, len3(this.dir(l)));
  sameLine = (a: Line, b: Line) => this.collinear(this.P(b[0]), a) && this.collinear(this.P(b[1]), a);
  samePlane = (a: Plane, b: Plane) => b.every((x) => this.onPlane(this.P(x), a));
  lineIn = (l: Line, pl: Plane) => this.onPlane(this.P(l[0]), pl) && this.onPlane(this.P(l[1]), pl);
  perpLL = (a: Line, b: Line) => Math.abs(dot3(this.dir(a), this.dir(b))) < EPS * len3(this.dir(a)) * len3(this.dir(b));
  parLL = (a: Line, b: Line) => len3(cross3(this.dir(a), this.dir(b))) < EPS * len3(this.dir(a)) * len3(this.dir(b));
  perpLP = (l: Line, pl: Plane) => len3(cross3(this.dir(l), this.normal(pl))) < EPS * len3(this.dir(l)) * len3(this.normal(pl));

  /** The name of a point at x: an existing one, or a new one with how it's defined. */
  nameAt(x: V3, prefer: string[], def: Text): { name: string; isNew: boolean } {
    for (const [k, v] of this.m.pts) if (near(v, x)) return { name: k, isNew: false };
    const all = [...prefer, "K", "H", "I", "E", "F", "J", "P", "Q", "R", "T", "U", "V"];
    const name = all.find((p) => !this.m.taken.has(p) && !this.m.pts.has(p))!;
    this.m.taken.add(name);
    this.m.pts.set(name, x);
    this.m.why.set(name, def);
    return { name, isNew: true };
  }

  /** A line from the apex (or a top vertex) straight down to a named foot on `pl`, with the reason. */
  dropTo(pl: Plane, from?: string): { top: string; foot: string; why: Text } | null {
    for (const f of this.m.perp) {
      if (!this.samePlane(pl, f.plane) || !this.samePlane(f.plane, pl)) continue;
      const [a, b] = f.line;
      const top = this.onPlane(this.P(a), pl) ? b : a;
      const foot = top === a ? b : a;
      if (from && top !== from) continue;
      if (this.onPlane(this.P(foot), pl) && !this.onPlane(this.P(top), pl)) return { top, foot, why: f.why };
    }
    return null;
  }

  ptTex(name: string): string {
    return `${name}\\left(${this.P(name).map((c) => (Math.abs(c) < EPS ? "0" : measureTex(c, this.m.sym, 1))).join(L({ en: ",\\ ", vi: ";\\ " }))}\\right)`;
  }

  /** The axes, once, then the coordinates of the points a calculation uses. */
  coordIntro(names: string[]): string {
    const { origin, x, y } = this.m.axes;
    const first = !this.coordsShown;
    this.coordsShown = true;
    const unit = this.m.sym ? L({ en: ` (lengths in terms of ${this.m.sym})`, vi: ` (độ dài tính theo ${this.m.sym})` }) : "";
    const set = first
      ? `\\text{${L({ en: `Axes: origin ${origin}, Ox along ${origin}${x}, ${y ? `Oy along ${origin}${y}` : "Oy in the base, ⊥ Ox"}, Oz ⊥ base${unit}`, vi: `Hệ trục: gốc ${origin}, Ox theo ${origin}${x}, ${y ? `Oy theo ${origin}${y}` : "Oy nằm trong đáy, ⊥ Ox"}, Oz ⊥ đáy${unit}` })}}\\\\`
      : "";
    return `${set}${[...new Set(names)].map((n) => this.ptTex(n)).join(",\\ ")}`;
  }

  /* ───────────────────────── Questions ───────────────────────── */

  run(g: Goal) {
    // Parallel lines, intersections and sections hold on any figure; measures and ⊥ need the data.
    const affine = g.k === "meetPlanes" || g.k === "meetLine" || (g.k === "section" && !g.area) || (g.k === "prove" && g.rel === "parallel");
    if (!affine && this.m.missing && (this.m.generic || g.k !== "prove")) oops(this.m.missing.msg, this.m.missing.hint);
    if (g.k === "meetPlanes") return this.affine.meetPlanes(g.x, g.y);
    if (g.k === "meetLine") return this.affine.meetLine(g.l, g.pl);
    if (g.k === "section") {
      if (!g.pl) oops({ en: "Which plane cuts the solid?", vi: "Mặt phẳng nào cắt hình?" }, { en: "E.g. “thiết diện của hình chóp với mặt phẳng (MNP)”.", vi: "Ví dụ “thiết diện của hình chóp với mặt phẳng (MNP)”." });
      return this.affine.section(g.pl!, g.area);
    }
    if (this.m.freeHeight && g.k !== "prove") {
      const ap = this.m.apex ?? "S";
      oops(
        { en: "This needs the height of the solid, which the problem doesn't give.", vi: "Câu này cần chiều cao của hình, nhưng đề chưa cho." },
        { en: `Add e.g. “${ap}${this.m.foot} = a√2”, a lateral edge, or an angle with the base.`, vi: `Bổ sung ví dụ “${ap}${this.m.foot} = a√2”, một cạnh bên, hoặc góc giữa cạnh bên và đáy.` },
      );
    }
    if (g.k === "volume") return this.volume(g.of);
    if (g.k === "length") return this.length(g.l);
    if (g.k === "area") return this.triArea(g.pts);
    if (g.k === "prove") return this.prove(g);
    if (g.k === "angle") return this.angle(g.x, g.y);
    if (g.k === "dihedral") return this.dihedral(g.a, g.e, g.b);
    return this.distance(g.x, g.y);
  }

  baseAreaTex(): { tex: string; value: number } {
    const m = this.m;
    const b = m.base;
    const S = polygonArea(m, b);
    const A = (x: string, y: string) => this.len(this.dist(x, y));
    const name = `S_{${b.join("")}}`;
    if (m.shape === "square") {
      const side = A(b[0], b[1]);
      // A plain side (a, 3) squares without brackets: AB² = a².
      const sq = /^[a-z\d]+$/.test(side) ? `${side}^2` : `\\left(${side}\\right)^2`;
      return { tex: `${name} = ${b[0]}${b[1]}^2 = ${sq === this.area(S) ? sq : `${sq} = ${this.area(S)}`}`, value: S };
    }
    if (m.shape === "rectangle") return { tex: `${name} = ${b[0]}${b[1]}\\cdot ${b[1]}${b[2]} = ${A(b[0], b[1])}\\cdot ${A(b[1], b[2])} = ${this.area(S)}`, value: S };
    if (m.shape === "equilateral") return { tex: `${name} = \\frac{${b[0]}${b[1]}^2\\sqrt{3}}{4} = ${this.area(S)}`, value: S };
    if (m.shape === "right") {
      const o = m.axes.origin;
      const [y, z] = b.filter((p) => p !== o);
      return { tex: `${name} = \\frac{1}{2}\\cdot ${o}${y}\\cdot ${o}${z} = \\frac{1}{2}\\cdot ${A(o, y)}\\cdot ${A(o, z)} = ${this.area(S)}`, value: S };
    }
    const sinAt = (o: string, y: string, z: string) => len3(cross3(sub3(this.P(y), this.P(o)), sub3(this.P(z), this.P(o)))) / (this.dist(o, y) * this.dist(o, z));
    if (m.shape === "rhombus") {
      return { tex: `${name} = \\frac{1}{2}\\cdot ${b[0]}${b[2]}\\cdot ${b[1]}${b[3]} = \\frac{1}{2}\\cdot ${A(b[0], b[2])}\\cdot ${A(b[1], b[3])} = ${this.area(S)}`, value: S };
    }
    if (m.shape === "parallelogram") {
      const [p, q, , r] = b;
      return { tex: `${name} = ${p}${q}\\cdot ${p}${r}\\cdot\\sin\\widehat{${q}${p}${r}} = ${A(p, q)}\\cdot ${A(p, r)}\\cdot ${ratioTex(sinAt(p, q, r))} = ${this.area(S)}`, value: S };
    }
    const face = m.faces[0];
    if (m.shape === "trapezoid" && face.par) {
      const [p, q, r, t] = face.par;
      const hgt = len3(cross3(sub3(this.P(r), this.P(p)), this.dir([p, q]))) / this.dist(p, q);
      const hName = face.right ? face.right.join("") : "h";
      return { tex: `${name} = \\frac{\\left(${p}${q} + ${r}${t}\\right)\\cdot ${hName}}{2} = \\frac{\\left(${A(p, q)} + ${A(r, t)}\\right)\\cdot ${this.len(hgt)}}{2} = ${this.area(S)}`, value: S };
    }
    if (b.length === 3) {
      const o = m.axes.origin;
      const [y, z] = b.filter((p) => p !== o);
      return { tex: `${name} = \\frac{1}{2}\\cdot ${o}${y}\\cdot ${o}${z}\\cdot\\sin\\widehat{${y}${o}${z}} = \\frac{1}{2}\\cdot ${A(o, y)}\\cdot ${A(o, z)}\\cdot ${ratioTex(sinAt(o, y, z))} = ${this.area(S)}`, value: S };
    }
    return { tex: `${name} = ${this.area(S)}`, value: S };
  }

  volume(of?: { apex: string; base: string[] }) {
    const m = this.m;
    if (!of) {
      const B = this.baseAreaTex();
      const hName = m.kind === "pyramid" ? `${m.apex}${m.foot}` : m.lift ? `${m.lift.top}${m.lift.foot}` : `${m.base[0]}${m.top![0]}`;
      const V = m.kind === "pyramid" ? (B.value * m.h) / 3 : B.value * m.h;
      const hWhy = m.kind === "pyramid" ? this.dropTo(m.base, m.apex)?.why : m.lift ? this.dropTo(m.base, m.lift.top)?.why : m.perp[0]?.why;
      if (m.lift) this.extra.push([m.lift.top, m.lift.foot]);
      else if (m.apex && m.foot && !m.base.includes(m.foot)) this.extra.push([m.apex, m.foot]);
      this.st.push("formula", { en: "Base area", vi: "Diện tích đáy" }, B.tex,
        { en: "Area of the base polygon from its shape.", vi: "Tính diện tích đáy theo hình dạng của nó." },
        { en: "Standard area formulas.", vi: "Công thức diện tích quen thuộc." }, { en: "What shape is the base?", vi: "Đáy là hình gì?" });
      this.st.push("construct", { en: "Height", vi: "Chiều cao" },
        `${hName} \\perp (${m.base.join("")})\\ \\Rightarrow\\ h = ${hName} = ${this.len(m.h)}`,
        { en: `${hWhy ? `${L(hWhy)}. ` : ""}${m.heightWhy ? L(m.heightWhy) : `The height is ${hName}.`}`, vi: `${hWhy ? `${L(hWhy)}. ` : ""}${m.heightWhy ? L(m.heightWhy) : `Chiều cao là ${hName}.`}` },
        { en: "The height is the segment from the top straight down to the base plane.", vi: "Chiều cao là đoạn vuông góc hạ từ đỉnh xuống mặt phẳng đáy." },
        { en: "Which segment is perpendicular to the base?", vi: "Đoạn nào vuông góc với đáy?" });
      // Check with coordinates: split into tetrahedra.
      const check = this.solidVolume();
      this.st.push("formula", { en: "Volume", vi: "Thể tích" },
        `V = ${m.kind === "pyramid" ? "\\frac{1}{3}" : ""}S_{${m.base.join("")}}\\cdot ${hName} = ${m.kind === "pyramid" ? "\\frac{1}{3}\\cdot " : ""}${this.area(B.value)}\\cdot ${this.len(m.h)} = ${this.vol(V)}`,
        m.kind === "pyramid" ? { en: "A pyramid's volume is a third of base area times height.", vi: "Thể tích khối chóp bằng một phần ba diện tích đáy nhân chiều cao." } : { en: "A prism's volume is base area times height.", vi: "Thể tích khối lăng trụ bằng diện tích đáy nhân chiều cao." },
        { en: "Checked again by splitting the solid into tetrahedra in coordinates.", vi: "Đã kiểm tra lại bằng cách chia khối thành các tứ diện trong hệ tọa độ." },
        { en: "Multiply base area by height (and by 1/3 for a pyramid).", vi: "Nhân diện tích đáy với chiều cao (khối chóp nhân thêm 1/3)." },
        close(V, check) ? "passed" : "failed");
      this.answers.push({ key: "V", latex: `V_{${m.name}} = ${this.vol(V)}`, value: V });
      return;
    }
    // A smaller pyramid inside: V = 1/3 · d(apex, base plane) · area of its base.
    const { apex, base } = of;
    const S = polygonArea(this.m, base);
    if (S < EPS) oops({ en: `${base.join("")} is flat (its points are on one line).`, vi: `${base.join("")} suy biến (các điểm thẳng hàng).` }, { en: "Check the names.", vi: "Kiểm tra lại tên." });
    const n = this.normal(base);
    const d = Math.abs(dot3(sub3(this.P(apex), this.P(base[0])), n)) / len3(n);
    const V = (S * d) / 3;
    let tet = 0;
    for (let i = 1; i + 1 < base.length; i++) tet += Math.abs(dot3(cross3(sub3(this.P(base[i]), this.P(base[0])), sub3(this.P(base[i + 1]), this.P(base[0]))), sub3(this.P(apex), this.P(base[0])))) / 6;
    this.st.push("formula", { en: `Volume of ${apex}.${base.join("")}`, vi: `Thể tích khối ${apex}.${base.join("")}` },
      `${this.coordIntro([apex, ...base])}\\\\ S_{${base.join("")}} = ${this.area(S)},\\ d\\left(${apex}, (${base.join("")})\\right) = ${this.len(d)}\\\\ V = \\frac{1}{3}\\cdot ${this.area(S)}\\cdot ${this.len(d)} = ${this.vol(V)}`,
      { en: "Find the base area and the distance from the apex to the base plane, then V = ⅓·S·h.", vi: "Tính diện tích đáy và khoảng cách từ đỉnh đến mặt phẳng đáy, rồi V = ⅓·S·h." },
      { en: "Checked with the mixed product V = ⅙·|[u, v]·w|.", vi: "Đã kiểm tra bằng tích hỗn tạp V = ⅙·|[u, v]·w|." },
      { en: "Which face is the base, and how far is the apex from it?", vi: "Mặt nào làm đáy, và đỉnh cách mặt đó bao xa?" },
      close(V, tet) ? "passed" : "failed");
    this.answers.push({ key: `V-${apex}${base.join("")}`, latex: `V_{${apex}.${base.join("")}} = ${this.vol(V)}`, value: V });
  }

  /** The whole solid's volume from coordinates (tetrahedra from one vertex). */
  solidVolume(): number {
    const m = this.m;
    if (m.kind === "pyramid") {
      const b = m.base;
      let v = 0;
      for (let i = 1; i + 1 < b.length; i++) v += Math.abs(dot3(cross3(sub3(this.P(b[i]), this.P(b[0])), sub3(this.P(b[i + 1]), this.P(b[0]))), sub3(this.P(m.apex!), this.P(b[0])))) / 6;
      return v;
    }
    return polygonArea(m, m.base) * Math.abs(this.P(m.top![0])[2] - this.P(m.base[0])[2]);
  }

  length(l: Line) {
    const d = this.dist(l[0], l[1]);
    const v = sub3(this.P(l[1]), this.P(l[0]));
    this.st.push("formula", { en: `Length ${l.join("")}`, vi: `Độ dài ${l.join("")}` },
      `${this.coordIntro(l)}\\\\ ${l.join("")} = \\sqrt{${v.map((c) => `\\left(${Math.abs(c) < EPS ? "0" : this.len(c)}\\right)^2`).join(" + ")}} = ${this.len(d)}`,
      { en: "Distance between two points from their coordinates.", vi: "Khoảng cách giữa hai điểm theo tọa độ." },
      { en: "Pythagoras along the axes.", vi: "Định lý Pi-ta-go theo các trục." },
      { en: "Which right triangle contains this segment?", vi: "Đoạn này là cạnh của tam giác vuông nào?" });
    this.answers.push({ key: `len-${l.join("")}`, latex: `${l.join("")} = ${this.len(d)}`, value: d });
  }

  triArea(p: string[]) {
    const S = len3(cross3(sub3(this.P(p[1]), this.P(p[0])), sub3(this.P(p[2]), this.P(p[0])))) / 2;
    this.st.push("formula", { en: "Area of the triangle", vi: "Diện tích tam giác" },
      `${this.coordIntro(p)}\\\\ S_{${p.join("")}} = \\frac{1}{2}\\left|\\left[\\overrightarrow{${p[0]}${p[1]}}, \\overrightarrow{${p[0]}${p[2]}}\\right]\\right| = ${this.area(S)}`,
      { en: "Half the length of the cross product of two sides.", vi: "Bằng nửa độ dài tích có hướng của hai cạnh." },
      { en: "|[AB, AC]| is the area of the parallelogram on AB, AC.", vi: "|[AB, AC]| là diện tích hình bình hành dựng trên AB, AC." },
      { en: "Find two side vectors first.", vi: "Tìm hai vectơ cạnh trước." });
    this.answers.push({ key: `area-${p.join("")}`, latex: `S_{${p.join("")}} = ${this.area(S)}`, value: S });
  }

  /* ── Angles ── */

  angle(x: Ref, y: Ref) {
    if (x.k === "plane" && y.k === "line") [x, y] = [y, x];
    if (x.k === "line" && y.k === "plane") return this.angleLinePlane(x.l, y.pl);
    if (x.k === "plane" && y.k === "plane") return this.anglePlanes(x.pl, y.pl);
    if (x.k === "line" && y.k === "line") return this.angleLines(x.l, y.l);
    oops({ en: "An angle needs two lines, two planes, or a line and a plane.", vi: "Góc cần hai đường thẳng, hai mặt phẳng, hoặc một đường thẳng và một mặt phẳng." }, { en: "Name them like SC and (ABCD).", vi: "Gọi tên như SC và (ABCD)." });
  }

  angleAnswer(key: string, label: string, deg: number) {
    this.answers.push({ key, latex: `${label} ${degTex(deg).startsWith("\\approx") ? "" : "= "}${degTex(deg)}`, value: deg, degrees: true });
  }

  angleLinePlane(l: Line, pl: Plane) {
    const u = this.dir(l);
    const n = this.normal(pl);
    const sin = Math.abs(dot3(u, n)) / (len3(u) * len3(n));
    const deg = Math.asin(Math.min(1, sin)) / RAD;
    const label = `\\left(${l.join("")}, (${pl.join("")})\\right)`;
    const plT = `(${pl.join("")})`;
    // Textbook way: one end on the plane, the other dropping to a named foot.
    const onIdx = l.findIndex((x) => this.onPlane(this.P(x), pl));
    const top = onIdx >= 0 ? l[1 - onIdx] : null;
    const drop = top ? this.dropTo(pl, top) : null;
    let synthetic: number | null = null;
    if (top && drop && !this.onPlane(this.P(top), pl)) {
      const q = l[onIdx];
      const f = drop.foot;
      if (q === f) synthetic = 90;
      else {
        const tan = this.dist(top, f) / this.dist(q, f);
        synthetic = Math.atan(tan) / RAD;
        this.st.push("construct", { en: "Find the angle", vi: "Xác định góc" },
          `${top}${f} \\perp ${plT}\\ \\Rightarrow\\ ${f}${q} = \\text{${L({ en: "projection of", vi: "hình chiếu của" })}}\\ ${l.join("")}\\ \\Rightarrow\\ ${label} = \\widehat{${top}${q}${f}}`,
          { en: `${L(drop.why)}, so ${f} is the projection of ${top} and ${f}${q} is the projection of ${l.join("")} on ${plT}. The angle is between the line and its projection.`, vi: `${L(drop.why)}, nên ${f} là hình chiếu của ${top}, và ${f}${q} là hình chiếu của ${l.join("")} lên ${plT}. Góc cần tìm là góc giữa đường thẳng và hình chiếu của nó.` },
          { en: "The angle between a line and a plane is the angle between the line and its projection on the plane.", vi: "Góc giữa đường thẳng và mặt phẳng là góc giữa đường thẳng đó và hình chiếu của nó trên mặt phẳng." },
          { en: `Where does ${top} land when you drop it straight onto ${plT}?`, vi: `Hình chiếu của ${top} lên ${plT} là điểm nào?` });
        this.extra.push([top, f], [f, q]);
        this.st.push("formula", { en: "Right triangle", vi: "Tam giác vuông" },
          `\\tan\\widehat{${top}${q}${f}} = \\frac{${top}${f}}{${f}${q}} = \\frac{${this.len(this.dist(top, f))}}{${this.len(this.dist(q, f))}} = ${ratioTex(tan)}\\ \\Rightarrow\\ \\widehat{${top}${q}${f}} ${this.eqOr(degTex(synthetic))}`,
          { en: `Triangle ${top}${f}${q} is right-angled at ${f}.`, vi: `Tam giác ${top}${f}${q} vuông tại ${f}.` },
          { en: "tan = opposite / adjacent.", vi: "tan = cạnh đối / cạnh kề." },
          { en: "Which sides of the right triangle do you know?", vi: "Biết những cạnh nào của tam giác vuông?" });
      }
    }
    this.coordCheck(`\\sin\\varphi = \\frac{|\\vec{u}\\cdot\\vec{n}|}{|\\vec{u}|\\cdot|\\vec{n}|} = ${ratioTex(sin)}\\ \\Rightarrow\\ \\varphi ${this.eqOr(degTex(deg))}`, [...l, ...pl], synthetic, deg,
      { en: "u is the line's direction, n the plane's normal (a cross product of two of its sides).", vi: "u là vectơ chỉ phương của đường thẳng, n là pháp tuyến của mặt phẳng (tích có hướng của hai cạnh)." });
    this.angleAnswer(`ang-${l.join("")}-${pl.join("")}`, label, synthetic ?? deg);
  }

  anglePlanes(a: Plane, b: Plane) {
    const na = this.normal(a);
    const nb = this.normal(b);
    const cos = Math.abs(dot3(na, nb)) / (len3(na) * len3(nb));
    const deg = Math.acos(Math.min(1, cos)) / RAD;
    const label = `\\left((${a.join("")}), (${b.join("")})\\right)`;
    let synthetic: number | null = null;
    // Common line through two shared named points.
    const shared = [...this.m.pts.keys()].filter((x) => this.onPlane(this.P(x), a) && this.onPlane(this.P(x), b));
    const common: Line | null = shared.length >= 2 ? [shared[0], shared.find((x) => !near(this.P(x), this.P(shared[0])))!] : null;
    for (const [p, q] of [[a, b], [b, a]] as const) {
      if (synthetic !== null || !common || !common[1]) break;
      const drop = this.dropTo(q);
      if (!drop || !this.onPlane(this.P(drop.top), p)) continue;
      const { top, foot } = drop;
      if (this.collinear(this.P(foot), common)) {
        synthetic = 90;
        this.st.push("construct", { en: "Perpendicular planes", vi: "Hai mặt phẳng vuông góc" },
          `${top}${foot} \\perp (${q.join("")}),\\ ${top}${foot} \\subset (${p.join("")})\\ \\Rightarrow\\ (${p.join("")}) \\perp (${q.join("")})`,
          { en: `${L(drop.why)}, and ${top}${foot} lies in (${p.join("")}).`, vi: `${L(drop.why)}, và ${top}${foot} nằm trong (${p.join("")}).` },
          { en: "A plane containing a line perpendicular to another plane is perpendicular to it.", vi: "Mặt phẳng chứa một đường thẳng vuông góc với mặt phẳng kia thì vuông góc với mặt phẳng đó." },
          { en: "Look for a line in one plane that is perpendicular to the other.", vi: "Tìm một đường thẳng trong mặt này vuông góc với mặt kia." });
        break;
      }
      const kx = this.footLine(this.P(foot), common);
      const k = this.nameAt(kx, ["K", "H", "I"], { en: `foot of the perpendicular from ${foot} to ${common.join("")}`, vi: `chân đường vuông góc hạ từ ${foot} xuống ${common.join("")}` });
      const tan = this.dist(top, foot) / this.dist(foot, k.name);
      synthetic = Math.atan(tan) / RAD;
      const cl = common.join("");
      this.st.push("construct", { en: "Find the angle", vi: "Xác định góc" },
        `${k.isNew ? `\\text{${L({ en: "Draw", vi: "Kẻ" })}}\\ ${foot}${k.name} \\perp ${cl}\\ (${k.name} \\in ${cl})\\\\ ` : ""}\\begin{cases} ${cl} \\perp ${foot}${k.name} \\\\ ${cl} \\perp ${top}${foot} \\end{cases} \\Rightarrow ${cl} \\perp (${top}${foot}${k.name}) \\Rightarrow ${cl} \\perp ${top}${k.name}\\\\ \\Rightarrow\\ ${label} = \\widehat{${top}${k.name}${foot}}`,
        { en: `${cl} is the common line. ${foot}${k.name} ⊥ ${cl}${k.isNew ? "" : ` (${k.name} is already on the figure)`}; and ${L(drop.why)}, so ${cl} ⊥ ${top}${foot}. Hence ${cl} ⊥ (${top}${foot}${k.name}), so ${top}${k.name} ⊥ ${cl} as well: the angle between the planes is ∠${top}${k.name}${foot}.`, vi: `${cl} là giao tuyến. ${foot}${k.name} ⊥ ${cl}${k.isNew ? "" : ` (${k.name} có sẵn trên hình)`}; và ${L(drop.why)} nên ${cl} ⊥ ${top}${foot}. Do đó ${cl} ⊥ (${top}${foot}${k.name}), suy ra ${top}${k.name} ⊥ ${cl}: góc giữa hai mặt phẳng là góc ${top}${k.name}${foot}.` },
        { en: "The angle between two planes is the angle between two lines, one in each plane, both perpendicular to the common line at the same point.", vi: "Góc giữa hai mặt phẳng là góc giữa hai đường thẳng lần lượt nằm trong hai mặt phẳng và cùng vuông góc với giao tuyến tại một điểm." },
        { en: "First find the common line of the two planes.", vi: "Trước hết tìm giao tuyến của hai mặt phẳng." });
      this.extra.push([foot, k.name], [top, k.name], [top, foot]);
      this.st.push("formula", { en: "Right triangle", vi: "Tam giác vuông" },
        `${foot}${k.name} = ${this.len(this.dist(foot, k.name))},\\quad \\tan\\widehat{${top}${k.name}${foot}} = \\frac{${top}${foot}}{${foot}${k.name}} = ${ratioTex(tan)}\\ \\Rightarrow\\ \\widehat{${top}${k.name}${foot}} ${this.eqOr(degTex(synthetic))}`,
        { en: `Triangle ${top}${foot}${k.name} is right-angled at ${foot}.`, vi: `Tam giác ${top}${foot}${k.name} vuông tại ${foot}.` },
        { en: "tan = opposite / adjacent.", vi: "tan = cạnh đối / cạnh kề." },
        { en: `How long is ${foot}${k.name}?`, vi: `${foot}${k.name} dài bao nhiêu?` });
    }
    this.coordCheck(`\\cos\\varphi = \\frac{|\\vec{n}_1\\cdot\\vec{n}_2|}{|\\vec{n}_1|\\cdot|\\vec{n}_2|} = ${ratioTex(cos)}\\ \\Rightarrow\\ \\varphi ${this.eqOr(degTex(deg))}`, [...a, ...b], synthetic, deg,
      { en: "n₁, n₂ are normal vectors of the two planes.", vi: "n₁, n₂ là vectơ pháp tuyến của hai mặt phẳng." });
    this.angleAnswer(`ang-${a.join("")}-${b.join("")}`, label, synthetic ?? deg);
  }

  angleLines(a: Line, b: Line) {
    const u = this.dir(a);
    const v = this.dir(b);
    const cos = Math.abs(dot3(u, v)) / (len3(u) * len3(v));
    const deg = Math.acos(Math.min(1, cos)) / RAD;
    const label = `\\left(${a.join("")}, ${b.join("")}\\right)`;
    let synthetic: number | null = null;
    if (this.perpLL(a, b)) {
      const subs: Proof[] = [];
      const r = this.whyPerpLL(a, b, 2, subs);
      if (r) {
        subs.forEach((s) => this.emit(s));
        synthetic = 90;
        this.st.push("proof", { en: "Perpendicular lines", vi: "Hai đường thẳng vuông góc" }, `${this.lt(a)} \\perp ${this.lt(b)}\\ (${tx(r)})\\ \\Rightarrow\\ ${label} = 90^\\circ`,
          { en: "The two lines are perpendicular, for the reason in brackets.", vi: "Hai đường thẳng vuông góc, vì lý do trong ngoặc." },
          { en: "Perpendicular lines make a 90° angle.", vi: "Hai đường thẳng vuông góc tạo góc 90°." },
          { en: "Is one line perpendicular to a plane holding the other?", vi: "Có đường nào vuông góc với một mặt phẳng chứa đường kia không?" });
      }
    }
    if (synthetic === null) synthetic = this.angleByParallel(a, b, label);
    this.coordCheck(`\\cos\\varphi = \\frac{|\\vec{u}\\cdot\\vec{v}|}{|\\vec{u}|\\cdot|\\vec{v}|} = ${ratioTex(cos)}\\ \\Rightarrow\\ \\varphi ${this.eqOr(degTex(deg))}`, [...a, ...b], synthetic, deg,
      { en: "u, v are direction vectors of the two lines; the angle between lines is between 0° and 90°.", vi: "u, v là vectơ chỉ phương của hai đường thẳng; góc giữa hai đường thẳng nằm trong khoảng 0° đến 90°." });
    this.angleAnswer(`ang-${a.join("")}-${b.join("")}`, label, synthetic ?? deg);
  }

  /**
   * Two lines through a common point make the angle of a triangle; skew lines
   * first move one of them parallel through a point of the other
   * ((SB, CD) = (SB, AB) since CD ∥ AB). The angle comes from the law of cosines.
   */
  angleByParallel(a: Line, b: Line, label: string): number | null {
    const names = [...this.m.pts.keys()];
    for (const meets of [true, false]) {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        for (const e of x) {
          const xo = x[0] === e ? x[1] : x[0];
          for (const q of names) {
            if (q === e || near(this.P(q), this.P(e)) || this.collinear(this.P(q), x)) continue;
            const ml: Line = [e, q];
            if (!this.parLL(ml, y)) continue;
            const same = this.sameLine(ml, y);
            if (same !== meets) continue;
            const r = same ? null : this.whyParLL(ml, y, true) ?? this.whyParLL(ml, y);
            if (!same && !r) continue;
            const [p1, p2, p3] = [this.dist(e, xo), this.dist(e, q), this.dist(xo, q)];
            const c = (p1 ** 2 + p2 ** 2 - p3 ** 2) / (2 * p1 * p2);
            const th = Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
            const angName = `\\widehat{${xo}${e}${q}}`;
            const value = th <= 90 + 1e-9 ? angName : `180^\\circ - ${angName}`;
            this.st.push("construct", { en: "Find the angle", vi: "Xác định góc" },
              same
                ? `${this.lt(x)} \\cap ${this.lt(y)} = ${e}\\ \\Rightarrow\\ ${label} = ${value}`
                : `${this.lt(ml)} \\parallel ${this.lt(y)}\\ (${tx(r!)})\\ \\Rightarrow\\ ${label} = \\left(${this.lt(x)}, ${this.lt(ml)}\\right) = ${value}`,
              same
                ? { en: `The lines meet at ${e}, so the angle between them is an angle of triangle ${xo}${e}${q} (or its supplement, if obtuse).`, vi: `Hai đường thẳng cắt nhau tại ${e}, nên góc giữa chúng là góc của tam giác ${xo}${e}${q} (hoặc góc bù nếu góc đó tù).` }
                : { en: `${this.lt(ml)} ∥ ${this.lt(y)} and passes through ${e} on ${this.lt(x)}, so the angle between ${this.lt(x)} and ${this.lt(y)} equals the angle between ${this.lt(x)} and ${this.lt(ml)}.`, vi: `${this.lt(ml)} ∥ ${this.lt(y)} và đi qua điểm ${e} của ${this.lt(x)}, nên góc giữa ${this.lt(x)} và ${this.lt(y)} bằng góc giữa ${this.lt(x)} và ${this.lt(ml)}.` },
              { en: "The angle between two lines is the angle between two intersecting lines parallel to them; it is at most 90°.", vi: "Góc giữa hai đường thẳng bằng góc giữa hai đường thẳng cắt nhau lần lượt song song với chúng; góc này không quá 90°." },
              { en: `Is there a line through a point of ${this.lt(x)} parallel to ${this.lt(y)}?`, vi: `Có đường thẳng nào đi qua một điểm của ${this.lt(x)} và song song với ${this.lt(y)} không?` });
            this.extra.push(ml);
            this.st.push("formula", { en: "Law of cosines", vi: "Định lý cô-sin" },
              `${e}${xo} = ${this.len(p1)},\\ ${e}${q} = ${this.len(p2)},\\ ${xo}${q} = ${this.len(p3)}\\\\ \\cos${angName} = \\frac{${e}${xo}^2 + ${e}${q}^2 - ${xo}${q}^2}{2\\cdot ${e}${xo}\\cdot ${e}${q}} = ${ratioTex(c)}\\ \\Rightarrow\\ ${angName} ${this.eqOr(degTex(th))}`,
              { en: `Three sides of triangle ${xo}${e}${q} give its angle at ${e}.`, vi: `Biết ba cạnh của tam giác ${xo}${e}${q} thì tính được góc tại ${e}.` },
              { en: "cos = (b² + c² − a²) / 2bc.", vi: "cos = (b² + c² − a²) / 2bc." },
              { en: "Find the three sides of the triangle first.", vi: "Tính ba cạnh của tam giác trước." });
            return Math.min(th, 180 - th);
          }
        }
      }
    }
    return null;
  }

  /** Dihedral angle [x, e, y]: between the half-planes from edge e through x and through y (0° to 180°). */
  dihedral(x: string, e: Line, y: string) {
    const u = this.dir(e);
    const off = (p: V3) => {
      const w = sub3(p, this.P(e[0]));
      return sub3(w, mul3(u, dot3(w, u) / dot3(u, u)));
    };
    const vx = off(this.P(x));
    const vy = off(this.P(y));
    if (len3(vx) < EPS || len3(vy) < EPS) oops({ en: `${x} and ${y} must be off the edge ${e.join("")}.`, vi: `${x} và ${y} không được nằm trên cạnh ${e.join("")}.` }, { en: "Write it like [S, BC, A].", vi: "Viết dạng [S, BC, A]." });
    const cos = dot3(vx, vy) / (len3(vx) * len3(vy));
    const deg = Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
    const el = this.lt(e);
    const label = `\\left[${x}, ${el}, ${y}\\right]`;
    let synthetic: number | null = null;
    for (const [p, q] of [[x, y], [y, x]] as const) {
      const face: Plane = [e[0], e[1], q];
      const drop = this.dropTo(face, p);
      if (!drop) continue;
      const F = drop.foot;
      const pf = `${p}${F}`;
      if (this.collinear(this.P(F), e)) {
        synthetic = 90;
        this.st.push("construct", { en: "Perpendicular planes", vi: "Hai mặt phẳng vuông góc" },
          `${pf} \\perp (${el}${q}),\\ ${pf} \\subset (${p}${el})\\ \\Rightarrow\\ (${p}${el}) \\perp (${q}${el})\\ \\Rightarrow\\ ${label} = 90^\\circ`,
          { en: `${L(drop.why)}, and ${pf} lies in the half-plane through ${p}.`, vi: `${L(drop.why)}, và ${pf} nằm trong nửa mặt phẳng chứa ${p}.` },
          { en: "A plane containing a line perpendicular to another plane is perpendicular to it.", vi: "Mặt phẳng chứa một đường thẳng vuông góc với mặt phẳng kia thì vuông góc với mặt phẳng đó." },
          { en: `Where does ${p} drop onto the other face?`, vi: `Hình chiếu của ${p} lên mặt kia là điểm nào?` });
        break;
      }
      const k = this.nameAt(this.footLine(this.P(F), e), ["K", "H", "I"], { en: `foot of the perpendicular from ${F} to ${el}`, vi: `chân đường vuông góc hạ từ ${F} xuống ${el}` });
      const K = k.name;
      const tan = this.dist(p, F) / this.dist(F, K);
      const plane = Math.atan(tan) / RAD;
      // F on the same side of the edge as q: the plane angle is ∠pKF itself; otherwise its supplement.
      const sameSide = dot3(off(this.P(F)), off(this.P(q))) > 0;
      synthetic = sameSide ? plane : 180 - plane;
      const angName = `\\widehat{${p}${K}${F}}`;
      this.st.push("construct", { en: "Find the plane angle", vi: "Xác định góc phẳng nhị diện" },
        `${k.isNew ? `\\text{${L({ en: "Draw", vi: "Kẻ" })}}\\ ${F}${K} \\perp ${el}\\ (${K} \\in ${el})\\\\ ` : ""}\\begin{cases} ${el} \\perp ${F}${K} \\\\ ${el} \\perp ${pf} \\end{cases} \\Rightarrow ${el} \\perp (${p}${F}${K}) \\Rightarrow ${el} \\perp ${p}${K}\\\\ \\Rightarrow\\ ${label} = ${sameSide ? angName : `180^\\circ - ${angName}`}`,
        { en: `${L(drop.why)}, so ${el} ⊥ ${pf}; with ${F}${K} ⊥ ${el}, the edge is ⊥ (${p}${F}${K}), so ${p}${K} ⊥ ${el} too. ${K}${p} and the ray from ${K} towards ${q} are both ⊥ ${el}: their angle is the plane angle. ${sameSide ? `${F} is on the same side of ${el} as ${q}, so it is ∠${p}${K}${F}.` : `${F} is on the other side of ${el} from ${q}, so it is 180° − ∠${p}${K}${F}.`}`, vi: `${L(drop.why)}, nên ${el} ⊥ ${pf}; lại có ${F}${K} ⊥ ${el} nên ${el} ⊥ (${p}${F}${K}), suy ra ${p}${K} ⊥ ${el}. ${K}${p} và tia từ ${K} về phía ${q} cùng vuông góc với ${el}: góc giữa chúng là góc phẳng nhị diện. ${sameSide ? `${F} cùng phía với ${q} đối với ${el}, nên đó là góc ${p}${K}${F}.` : `${F} khác phía với ${q} đối với ${el}, nên đó là 180° − góc ${p}${K}${F}.`}` },
        { en: "The plane angle of a dihedral angle: two rays from one point of the edge, one in each half-plane, both perpendicular to the edge.", vi: "Góc phẳng nhị diện: hai tia xuất phát từ một điểm trên cạnh, lần lượt nằm trong hai nửa mặt phẳng và cùng vuông góc với cạnh." },
        { en: `Drop ${F} perpendicular to ${el} first.`, vi: `Trước hết kẻ ${F} vuông góc với ${el}.` });
      this.extra.push([F, K], [p, K], [p, F]);
      this.st.push("formula", { en: "Right triangle", vi: "Tam giác vuông" },
        `${F}${K} = ${this.len(this.dist(F, K))},\\quad \\tan${angName} = \\frac{${pf}}{${F}${K}} = ${ratioTex(tan)}\\ \\Rightarrow\\ ${angName} ${this.eqOr(degTex(plane))}${sameSide ? "" : `\\\\ \\Rightarrow\\ ${label} = 180^\\circ - ${degTex(plane).replace("\\approx ", "")} ${this.eqOr(degTex(180 - plane))}`}`,
        { en: `Triangle ${p}${F}${K} is right-angled at ${F}.`, vi: `Tam giác ${p}${F}${K} vuông tại ${F}.` },
        { en: "tan = opposite / adjacent.", vi: "tan = cạnh đối / cạnh kề." },
        { en: `How long is ${F}${K}?`, vi: `${F}${K} dài bao nhiêu?` });
      break;
    }
    // Both points drop onto the edge at the same K (BK ⊥ SC and DK ⊥ SC): the plane angle is ∠xKy.
    const kx = this.footLine(this.P(x), e);
    if (synthetic === null && near(kx, this.footLine(this.P(y), e))) {
      const xy: Line = [x, y];
      const subs: Proof[] = [];
      const r = this.whyPerpLL(xy, e, 2, subs);
      if (r) {
        subs.forEach((sp) => this.emit(sp));
        const K = this.nameAt(kx, ["H", "K", "I"], { en: `foot of the perpendicular from ${x} to ${el}`, vi: `chân đường vuông góc hạ từ ${x} xuống ${el}` }).name;
        const [p1, p2, p3] = [this.dist(x, K), this.dist(y, K), this.dist(x, y)];
        const c = (p1 ** 2 + p2 ** 2 - p3 ** 2) / (2 * p1 * p2);
        synthetic = Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
        const angName = `\\widehat{${x}${K}${y}}`;
        this.st.push("construct", { en: "Find the plane angle", vi: "Xác định góc phẳng nhị diện" },
          `\\text{${L({ en: "Draw", vi: "Kẻ" })}}\\ ${x}${K} \\perp ${el}\\ (${K} \\in ${el});\\ ${el} \\perp ${this.lt(xy)}\\ (${tx(r)})\\\\ \\Rightarrow ${el} \\perp (${x}${y}${K}) \\Rightarrow ${el} \\perp ${y}${K}\\ \\Rightarrow\\ ${label} = ${angName}`,
          { en: `${el} is perpendicular to ${x}${K} and to ${this.lt(xy)}, so to the plane (${x}${y}${K}); hence ${y}${K} ⊥ ${el} as well, and ∠${x}${K}${y} is the plane angle.`, vi: `${el} vuông góc với ${x}${K} và ${this.lt(xy)} nên vuông góc với (${x}${y}${K}); do đó ${y}${K} ⊥ ${el}, và góc ${x}${K}${y} là góc phẳng nhị diện.` },
          { en: "The plane angle of a dihedral angle: two rays from one point of the edge, one in each half-plane, both perpendicular to the edge.", vi: "Góc phẳng nhị diện: hai tia xuất phát từ một điểm trên cạnh, lần lượt nằm trong hai nửa mặt phẳng và cùng vuông góc với cạnh." },
          { en: `Drop ${x} perpendicular to ${el}; where does ${y} drop?`, vi: `Kẻ ${x} vuông góc với ${el}; ${y} hạ xuống điểm nào?` });
        this.extra.push([x, K], [y, K]);
        this.st.push("formula", { en: "Law of cosines", vi: "Định lý cô-sin" },
          `${x}${K} = ${this.len(p1)},\\ ${y}${K} = ${this.len(p2)},\\ ${this.lt(xy)} = ${this.len(p3)}\\\\ \\cos${angName} = \\frac{${x}${K}^2 + ${y}${K}^2 - ${this.lt(xy)}^2}{2\\cdot ${x}${K}\\cdot ${y}${K}} = ${ratioTex(c)}\\ \\Rightarrow\\ ${angName} ${this.eqOr(degTex(synthetic))}`,
          { en: `Three sides of triangle ${x}${K}${y} give its angle at ${K}.`, vi: `Biết ba cạnh của tam giác ${x}${K}${y} thì tính được góc tại ${K}.` },
          { en: "cos = (b² + c² − a²) / 2bc.", vi: "cos = (b² + c² − a²) / 2bc." },
          { en: `How far are ${x} and ${y} from ${el}?`, vi: `${x} và ${y} cách ${el} bao xa?` });
      }
    }
    this.coordCheck(`\\cos\\varphi = \\frac{\\vec{u}\\cdot\\vec{v}}{|\\vec{u}|\\cdot|\\vec{v}|} = ${ratioTex(cos)}\\ \\Rightarrow\\ \\varphi ${this.eqOr(degTex(deg))}`, [x, ...e, y], synthetic, deg,
      { en: `u and v run from the edge ${el} to ${x} and to ${y}, both perpendicular to it.`, vi: `u, v là các vectơ vuông góc với cạnh ${el}, hướng từ cạnh tới ${x} và tới ${y}.` });
    this.angleAnswer(`dih-${x}${el}${y}`, label, synthetic ?? deg);
  }

  /** The coordinate calculation; it confirms the construction above when there is one. */
  coordCheck(formula: string, names: string[], synthetic: number | null, value: number, explain: Text) {
    this.st.push(synthetic === null ? "formula" : "verify", synthetic === null ? { en: "With coordinates", vi: "Tính bằng tọa độ" } : { en: "Check with coordinates", vi: "Kiểm tra bằng tọa độ" },
      `${this.coordIntro(names)}\\\\ ${formula}`,
      explain,
      { en: "Placing the solid on axes turns lengths and angles into vector calculations.", vi: "Đặt hình vào hệ trục tọa độ, mọi độ dài và góc trở thành phép tính vectơ." },
      { en: "Write the coordinates of the points involved.", vi: "Viết tọa độ các điểm liên quan." },
      synthetic === null || close(synthetic, value, 1e-7) ? "passed" : "failed");
  }

  /* ── Distances ── */

  distance(x: Ref, y: Ref) {
    if (y.k === "point" && x.k !== "point") [x, y] = [y, x];
    if (x.k === "line" && y.k === "line") return this.distLines(x.l, y.l);
    if (x.k === "plane" && y.k === "line") [x, y] = [y, x];
    if (x.k === "line" && y.k === "plane") {
      if (Math.abs(dot3(this.dir(x.l), this.normal(y.pl))) > EPS * len3(this.dir(x.l)) * len3(this.normal(y.pl))) {
        this.notes.push(L({ en: `${x.l.join("")} cuts (${y.pl.join("")}), so the distance is 0.`, vi: `${x.l.join("")} cắt (${y.pl.join("")}) nên khoảng cách bằng 0.` }));
        this.answers.push({ key: "d", latex: `d = 0`, value: 0 });
        return;
      }
      const z = x.l.find((p) => this.onPlane(this.P(p), this.m.base)) ?? x.l[0];
      this.notes.push(L({ en: `${x.l.join("")} ∥ (${y.pl.join("")}), so every point of it is equally far; we use ${z}.`, vi: `${x.l.join("")} ∥ (${y.pl.join("")}) nên mọi điểm của nó cách đều mặt phẳng; ta dùng điểm ${z}.` }));
      this.distPointPlane(z, y.pl);
      return;
    }
    if (x.k === "plane" && y.k === "plane") return void this.distPointPlane(y.pl[0], x.pl);
    if (x.k === "point" && y.k === "plane") return void this.distPointPlane(x.p, y.pl);
    if (x.k === "point" && y.k === "line") return this.distPointLine(x.p, y.l);
    if (x.k === "point" && y.k === "point") return this.length([x.p, y.p]);
  }

  /**
   * d(z, pl). `inner`: a step inside another distance (skew lines) — no
   * coordinate check or answer of its own; returns the construction's value
   * (null when there is none).
   */
  distPointPlane(z: string, pl: Plane, inner = false): number | null {
    const n = this.normal(pl);
    const d = Math.abs(dot3(sub3(this.P(z), this.P(pl[0])), n)) / len3(n);
    const label = `d\\left(${z}, (${pl.join("")})\\right)`;
    let synthetic: number | null = null;
    // A face through the apex: drop the apex foot F to the base, F to the trace line, F to the face.
    const base = this.m.base;
    const drop = this.dropTo(base);
    const trace = pl.filter((x) => this.onPlane(this.P(x), base));
    if (drop && this.onPlane(this.P(drop.top), pl) && trace.length >= 2 && !this.onPlane(this.P(drop.foot), pl) && this.onPlane(this.P(z), base)) {
      const { top: S, foot: F } = drop;
      const xy: Line = [trace[0], trace.find((t) => !near(this.P(t), this.P(trace[0])))!];
      const k = this.nameAt(this.footLine(this.P(F), xy), ["K", "I", "E"], { en: `foot of the perpendicular from ${F} to ${xy.join("")}`, vi: `chân đường vuông góc hạ từ ${F} xuống ${xy.join("")}` });
      const sk: Line = [S, k.name];
      const h = this.nameAt(this.footLine(this.P(F), sk), ["H", "K", "I"], { en: `foot of the perpendicular from ${F} to ${S}${k.name}`, vi: `chân đường vuông góc hạ từ ${F} xuống ${S}${k.name}` });
      const SF = this.dist(S, F);
      const FK = this.dist(F, k.name);
      const dF = (SF * FK) / Math.hypot(SF, FK);
      const cl = xy.join("");
      this.st.push("construct", { en: `Distance from ${F} to the face`, vi: `Khoảng cách từ ${F} đến mặt phẳng` },
        `${k.isNew ? `\\text{${L({ en: "Draw", vi: "Kẻ" })}}\\ ` : ""}${F}${k.name} \\perp ${cl},\\ ${F}${h.name} \\perp ${S}${k.name}\\\\ ${cl} \\perp (${S}${F}${k.name}) \\Rightarrow ${cl} \\perp ${F}${h.name} \\Rightarrow ${F}${h.name} \\perp (${pl.join("")})\\\\ \\frac{1}{${F}${h.name}^2} = \\frac{1}{${S}${F}^2} + \\frac{1}{${F}${k.name}^2}\\ \\Rightarrow\\ ${F}${h.name} = \\frac{${S}${F}\\cdot ${F}${k.name}}{\\sqrt{${S}${F}^2 + ${F}${k.name}^2}} = ${this.len(dF)}`,
        { en: `${cl} ⊥ ${F}${k.name} and ${cl} ⊥ ${S}${F} (${L(drop.why)}), so ${cl} ⊥ (${S}${F}${k.name}) and therefore ${cl} ⊥ ${F}${h.name}. With ${F}${h.name} ⊥ ${S}${k.name} too, ${F}${h.name} ⊥ (${pl.join("")}). ${F}${h.name} is the altitude to the hypotenuse of the right triangle ${S}${F}${k.name}.`, vi: `${cl} ⊥ ${F}${k.name} và ${cl} ⊥ ${S}${F} (${L(drop.why)}) nên ${cl} ⊥ (${S}${F}${k.name}), do đó ${cl} ⊥ ${F}${h.name}. Lại có ${F}${h.name} ⊥ ${S}${k.name} nên ${F}${h.name} ⊥ (${pl.join("")}). ${F}${h.name} là đường cao ứng với cạnh huyền của tam giác vuông ${S}${F}${k.name}.` },
        { en: "A line perpendicular to two intersecting lines of a plane is perpendicular to the plane.", vi: "Đường thẳng vuông góc với hai đường thẳng cắt nhau nằm trong một mặt phẳng thì vuông góc với mặt phẳng đó." },
        { en: `First drop ${F} perpendicular to ${cl}.`, vi: `Trước hết kẻ ${F} vuông góc với ${cl}.` });
      this.extra.push([F, k.name], [S, k.name], [F, h.name]);
      if (z === F) synthetic = dF;
      else {
        // Ratio: distances along a line through F scale with the distance to the trace line.
        const fz: Line = [F, z];
        if (this.parLL(fz, xy)) {
          synthetic = dF;
          this.st.push("formula", { en: "Move to the foot", vi: "Chuyển về chân đường cao" },
            `${F}${z} \\parallel ${cl} \\subset (${pl.join("")})\\ \\Rightarrow\\ ${label} = d\\left(${F}, (${pl.join("")})\\right) = ${this.len(dF)}`,
            { en: `${F}${z} is parallel to the plane, so ${z} and ${F} are equally far from it.`, vi: `${F}${z} song song với mặt phẳng, nên ${z} và ${F} cách đều mặt phẳng.` },
            { en: "All points of a line parallel to a plane are at the same distance from it.", vi: "Mọi điểm của đường thẳng song song với mặt phẳng đều cách mặt phẳng một khoảng bằng nhau." },
            { en: `Is ${F}${z} parallel to the plane?`, vi: `${F}${z} có song song với mặt phẳng không?` });
        } else {
          const u = this.dir(fz);
          const w = this.dir(xy);
          // Solve F + t·u on line XY.
          const den = cross3(u, w);
          const t = dot3(cross3(sub3(this.P(xy[0]), this.P(F)), w), den) / dot3(den, den);
          const ix = add3(this.P(F), mul3(u, t));
          const I = this.nameAt(ix, ["I", "E", "J"], { en: `intersection of ${F}${z} and ${cl}`, vi: `giao điểm của ${F}${z} và ${cl}` });
          const ratio = this.dist(z, I.name) / this.dist(F, I.name);
          synthetic = dF * ratio;
          this.st.push("formula", { en: "Ratio of distances", vi: "Tỉ số khoảng cách" },
            `${F}${z} \\cap (${pl.join("")}) = ${I.name}\\ \\Rightarrow\\ \\frac{d\\left(${z}, (${pl.join("")})\\right)}{d\\left(${F}, (${pl.join("")})\\right)} = \\frac{${z}${I.name}}{${F}${I.name}} = ${ratioTex(ratio)}\\\\ \\Rightarrow\\ ${label} = ${ratioTex(ratio)}\\cdot ${this.len(dF)} = ${this.len(synthetic)}`,
            { en: `${F}${z} meets the plane at ${I.name}; distances to the plane along that line are proportional to the distances to ${I.name}.`, vi: `${F}${z} cắt mặt phẳng tại ${I.name}; khoảng cách đến mặt phẳng tỉ lệ với khoảng cách đến ${I.name}.` },
            { en: "Similar right triangles (Thales).", vi: "Hai tam giác vuông đồng dạng (định lý Ta-lét)." },
            { en: `Where does ${F}${z} meet the plane?`, vi: `${F}${z} cắt mặt phẳng tại đâu?` });
        }
      }
    }
    if (inner) return synthetic;
    const pts = [z, ...pl.slice(0, 3)];
    this.coordCheck(`(${pl.join("")}):\\ \\vec{n} = ${vecT(n.map((c) => c / (len3(n) || 1)))}\\ \\text{(${L({ en: "unit normal", vi: "pháp tuyến đơn vị" })})}\\\\ ${label} = \\left|\\overrightarrow{${pl[0]}${z}}\\cdot\\vec{n}\\right| = ${this.len(d)}`, pts, synthetic, d,
      { en: "The distance is the length of the projection of a vector from the plane to the point onto the unit normal.", vi: "Khoảng cách bằng độ dài hình chiếu của vectơ nối một điểm của mặt phẳng tới điểm đó lên pháp tuyến đơn vị." });
    this.answers.push({ key: `d-${z}-${pl.join("")}`, latex: `${label} = ${this.len(synthetic ?? d)}`, value: synthetic ?? d });
    return synthetic ?? d;
  }

  distPointLine(z: string, l: Line) {
    const u = this.dir(l);
    const d = len3(cross3(sub3(this.P(z), this.P(l[0])), u)) / len3(u);
    const label = `d\\left(${z}, ${l.join("")}\\right)`;
    const f = this.nameAt(this.footLine(this.P(z), l), ["H", "K"], { en: `foot of the perpendicular from ${z} to ${l.join("")}`, vi: `chân đường vuông góc hạ từ ${z} xuống ${l.join("")}` });
    this.extra.push([z, f.name]);
    this.coordCheck(`${label} = \\frac{\\left|\\left[\\overrightarrow{${l[0]}${z}}, \\overrightarrow{${l[0]}${l[1]}}\\right]\\right|}{${l[0]}${l[1]}} = ${this.len(d)}`, [z, ...l], null, d,
      { en: "The cross product's length is the parallelogram's area; dividing by the base gives the height.", vi: "Độ dài tích có hướng là diện tích hình bình hành; chia cho cạnh đáy được chiều cao." });
    this.answers.push({ key: `d-${z}-${l.join("")}`, latex: `${label} = ${this.len(d)}`, value: d });
  }

  distLines(a: Line, b: Line) {
    const n = cross3(this.dir(a), this.dir(b));
    const label = `d\\left(${a.join("")}, ${b.join("")}\\right)`;
    if (len3(n) < EPS) {
      this.notes.push(L({ en: `${a.join("")} ∥ ${b.join("")}: the distance is from any point of one to the other.`, vi: `${a.join("")} ∥ ${b.join("")}: khoảng cách bằng khoảng cách từ một điểm của đường này đến đường kia.` }));
      return this.distPointLine(a[0], b);
    }
    const w = sub3(this.P(b[0]), this.P(a[0]));
    const d = Math.abs(dot3(n, w)) / len3(n);
    let synthetic: number | null = null;
    if (d < EPS) {
      this.notes.push(L({ en: `${a.join("")} and ${b.join("")} intersect, so the distance is 0.`, vi: `${a.join("")} và ${b.join("")} cắt nhau nên khoảng cách bằng 0.` }));
    } else {
      synthetic = this.commonPerp(a, b, label) ?? this.viaPerpPlane(a, b, label) ?? this.viaParallelPlane(a, b, label);
    }
    this.coordCheck(`${label} = \\frac{\\left|\\left[\\overrightarrow{${a.join("")}}, \\overrightarrow{${b.join("")}}\\right]\\cdot\\overrightarrow{${a[0]}${b[0]}}\\right|}{\\left|\\left[\\overrightarrow{${a.join("")}}, \\overrightarrow{${b.join("")}}\\right]\\right|} = ${this.len(d)}`, [...a, ...b], synthetic, d,
      { en: "For skew lines: the mixed product is the volume of a box on the three vectors; divide by its base area to get the height — the shortest distance.", vi: "Với hai đường thẳng chéo nhau: tích hỗn tạp là thể tích hình hộp dựng trên ba vectơ; chia cho diện tích đáy được chiều cao — chính là khoảng cách ngắn nhất." });
    this.answers.push({ key: `d-${a.join("")}-${b.join("")}`, latex: `${label} = ${this.len(synthetic ?? d)}`, value: synthetic ?? d });
  }

  /** A segment already on the figure perpendicular to both skew lines, each for a known reason. */
  commonPerp(a: Line, b: Line, label: string): number | null {
    const on = (l: Line) => [...this.m.pts.keys()].filter((p) => this.collinear(this.P(p), l));
    for (const p of on(a)) {
      for (const q of on(b)) {
        if (near(this.P(p), this.P(q))) continue;
        const pq: Line = [p, q];
        if (!this.perpLL(pq, a) || !this.perpLL(pq, b)) continue;
        const subs: Proof[] = [];
        const r1 = this.whyPerpLL(pq, a, 1, subs);
        const r2 = r1 && this.whyPerpLL(pq, b, 1, subs);
        if (!r1 || !r2) continue;
        subs.forEach((s) => this.emit(s));
        const v = this.dist(p, q);
        this.st.push("construct", { en: "Common perpendicular", vi: "Đoạn vuông góc chung" },
          `\\begin{cases} ${this.lt(pq)} \\perp ${this.lt(a)}\\ (${tx(r1)}) \\\\ ${this.lt(pq)} \\perp ${this.lt(b)}\\ (${tx(r2)}) \\end{cases} \\Rightarrow\\ ${label} = ${this.lt(pq)} = ${this.len(v)}`,
          { en: `${this.lt(pq)} meets both lines and is perpendicular to both: it is their common perpendicular.`, vi: `${this.lt(pq)} cắt cả hai đường thẳng và vuông góc với cả hai: đó là đoạn vuông góc chung.` },
          { en: "The distance between two skew lines is the length of their common perpendicular.", vi: "Khoảng cách giữa hai đường thẳng chéo nhau bằng độ dài đoạn vuông góc chung." },
          { en: "Is there a segment on the figure perpendicular to both lines?", vi: "Trên hình có sẵn đoạn nào vuông góc với cả hai đường thẳng không?" });
        this.extra.push(pq);
        return v;
      }
    }
    return null;
  }

  /**
   * Perpendicular skew lines: a plane through y perpendicular to x meets x at
   * O, and the foot H of O on y gives the common perpendicular OH
   * (BD ⊥ (SAC) at O; OH ⊥ SC).
   */
  viaPerpPlane(a: Line, b: Line, label: string): number | null {
    if (!this.perpLL(a, b)) return null;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const pl of this.planesThrough(y)) {
        if (!this.perpLP(x, pl)) continue;
        const proof = this.provePerpLP(x, pl, 2);
        if (!proof) continue;
        const n = this.normal(pl);
        const t = dot3(sub3(this.P(pl[0]), this.P(x[0])), n) / dot3(this.dir(x), n);
        const ox = add3(this.P(x[0]), mul3(this.dir(x), t));
        if (this.collinear(ox, y)) continue;
        const o = this.nameAt(ox, ["O", "I", "E"], { en: `the intersection of ${this.lt(x)} and ${this.pt(pl)}`, vi: `giao điểm của ${this.lt(x)} và ${this.pt(pl)}` });
        const O = o.name;
        const hh = this.nameAt(this.footLine(this.P(O), y), ["H", "K", "I"], { en: `foot of the perpendicular from ${O} to ${this.lt(y)}`, vi: `chân đường vuông góc hạ từ ${O} xuống ${this.lt(y)}` });
        const H = hh.name;
        const v = this.dist(O, H);
        this.emit(proof);
        const shown = proof.given ? tx(proof.given) : `\\text{${L({ en: "shown above", vi: "chứng minh trên" })}}`;
        this.st.push("construct", { en: "Common perpendicular", vi: "Đoạn vuông góc chung" },
          `${this.lt(x)} \\cap ${this.pt(pl)} = ${O},\\ \\text{${L({ en: "draw", vi: "kẻ" })}}\\ ${O}${H} \\perp ${this.lt(y)}\\ (${H} \\in ${this.lt(y)})\\\\ ${this.lt(x)} \\perp ${this.pt(pl)}\\ (${shown}),\\ ${O}${H} \\subset ${this.pt(pl)} \\Rightarrow ${O}${H} \\perp ${this.lt(x)}\\\\ \\Rightarrow\\ ${label} = ${O}${H}`,
          { en: `${O}${H} meets both lines, is ⊥ ${this.lt(y)} by construction, and ⊥ ${this.lt(x)} because it lies in ${this.pt(pl)} ⊥ ${this.lt(x)}: it is the common perpendicular.`, vi: `${O}${H} cắt cả hai đường thẳng, vuông góc với ${this.lt(y)} (cách dựng) và vuông góc với ${this.lt(x)} vì nằm trong ${this.pt(pl)} ⊥ ${this.lt(x)}: đó là đoạn vuông góc chung.` },
          { en: "If a ⊥ b, take the plane through b perpendicular to a; from where a crosses it, drop a perpendicular to b.", vi: "Nếu a ⊥ b, lấy mặt phẳng chứa b và vuông góc với a; từ giao điểm của a với mặt phẳng đó, kẻ đường vuông góc xuống b." },
          { en: `Which plane through ${this.lt(y)} is perpendicular to ${this.lt(x)}?`, vi: `Mặt phẳng nào chứa ${this.lt(y)} và vuông góc với ${this.lt(x)}?` });
        this.extra.push([O, H]);
        // Similar right triangles when y runs from the top of the height down to a base point on the line through O.
        const drop = this.dropTo(this.m.base);
        const T = drop && y.includes(drop.top) ? drop.top : null;
        const C = T ? y.find((p) => p !== T)! : null;
        if (drop && T && C && !near(this.P(drop.foot), this.P(C)) && this.collinear(this.P(O), [drop.foot, C])) {
          const F = drop.foot;
          this.st.push("formula", { en: "Similar triangles", vi: "Tam giác đồng dạng" },
            `\\triangle ${C}${H}${O} \\backsim \\triangle ${C}${F}${T}\\ \\Rightarrow\\ \\frac{${O}${H}}{${T}${F}} = \\frac{${C}${O}}{${C}${T}}\\\\ \\Rightarrow\\ ${O}${H} = \\frac{${T}${F}\\cdot ${C}${O}}{${C}${T}} = \\frac{${this.len(this.dist(T, F))}\\cdot ${this.len(this.dist(C, O))}}{${this.len(this.dist(C, T))}} = ${this.len(v)}`,
            { en: `Right triangles ${C}${H}${O} and ${C}${F}${T} share the angle at ${C}.`, vi: `Hai tam giác vuông ${C}${H}${O} và ${C}${F}${T} có chung góc ${C}.` },
            { en: "Two right triangles with a common acute angle are similar.", vi: "Hai tam giác vuông có chung một góc nhọn thì đồng dạng." },
            { en: `Compare triangle ${C}${H}${O} with the triangle of the height.`, vi: `So sánh tam giác ${C}${H}${O} với tam giác chứa đường cao.` });
        } else {
          this.st.push("formula", { en: "Length of the common perpendicular", vi: "Độ dài đoạn vuông góc chung" },
            `${O}${H} = d\\left(${O}, ${this.lt(y)}\\right) = ${this.len(v)}`,
            { en: `The distance from ${O} to ${this.lt(y)} inside ${this.pt(pl)}.`, vi: `Khoảng cách từ ${O} đến ${this.lt(y)} trong mặt phẳng ${this.pt(pl)}.` },
            { en: "Twice the triangle's area divided by the base.", vi: "Bằng hai lần diện tích tam giác chia cho cạnh đáy." },
            { en: `Which triangle in ${this.pt(pl)} has ${O}${H} as an altitude?`, vi: `${O}${H} là đường cao của tam giác nào trong ${this.pt(pl)}?` });
        }
        return v;
      }
    }
    return null;
  }

  /**
   * Skew lines x, y: a plane through y parallel to x — a face of the solid, or
   * one built with a parallelogram (through C draw Cx ∥ BD) — turns d(x, y)
   * into the distance from a point of x to that plane.
   */
  viaParallelPlane(a: Line, b: Line, label: string): number | null {
    const base = this.m.base;
    const drop = this.dropTo(base);
    const onBase = (l: Line) => l.find((p) => this.onPlane(this.P(p), base));
    const parLP = (l: Line, pl: Plane) => Math.abs(dot3(this.dir(l), this.normal(pl))) < EPS * len3(this.dir(l)) * len3(this.normal(pl)) && !this.lineIn(l, pl);
    // The point–plane distance has a construction when the plane passes through the top of the height and meets the base in a line.
    const good = (x: Line, pl: V3[]) => {
      if (!drop || !onBase(x)) return false;
      const nrm = cross3(sub3(pl[1], pl[0]), sub3(pl[2], pl[0]));
      const on = (v: V3) => Math.abs(dot3(sub3(v, pl[0]), nrm)) < EPS * Math.max(1, len3(nrm));
      return on(this.P(drop.top)) && pl.filter((v) => Math.abs(v[2] - this.P(base[0])[2]) < EPS).length >= 2;
    };
    type Pick = { x: Line; pl: Plane; why: string; built?: { end: string; e: string } };
    const cands: Array<Pick & { ok: boolean }> = [];
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const pl of this.planesThrough(y)) {
        if (!parLP(x, pl)) continue;
        const inside = this.pointsIn(pl);
        let why: string | null = null;
        for (let i = 0; i < inside.length && !why; i++) {
          for (let j = i + 1; j < inside.length && !why; j++) {
            const m: Line = [inside[i], inside[j]];
            const r = this.whyParLL(x, m);
            if (r) why = `${this.lt(x)} \\parallel ${this.lt(m)}\\ (${tx(r)}),\\ ${this.lt(m)} \\subset ${this.pt(pl)}`;
          }
        }
        if (why) cands.push({ x, pl, why, ok: good(x, pl.map(this.P)) });
      }
    }
    let pick: Pick | undefined = cands.find((c) => c.ok);
    if (!pick) {
      // Build the plane: through an end of y on the base, a line parallel to x.
      outer: for (const [x, y] of [[a, b], [b, a]] as const) {
        for (const end of y) {
          const ex = add3(this.P(end), this.dir(x));
          if (!good(x, [this.P(y[0]), this.P(y[1]), ex])) continue;
          const [x0, x1] = x;
          const e = this.nameAt(ex, ["E", "F", "K"], { en: `the fourth vertex of the parallelogram ${x0}${x1}?${end}`, vi: `đỉnh thứ tư của hình bình hành ${x0}${x1}?${end}` });
          const def = this.m.why.get(e.name);
          if (e.isNew && def) this.m.why.set(e.name, { en: def.en.replace("?", e.name), vi: def.vi.replace("?", e.name) });
          pick = { x, pl: [...y, e.name], why: `${this.lt([end, e.name])} \\parallel ${this.lt(x)}`, built: { end, e: e.name } };
          this.extra.push([end, e.name], [x[1], e.name]);
          break outer;
        }
      }
    }
    pick ??= cands[0];
    if (!pick) return null;
    const z = onBase(pick.x) ?? pick.x[0];
    const plT = this.pt(pick.pl);
    const built = pick.built;
    this.st.push("construct", { en: "A parallel plane", vi: "Mặt phẳng song song" },
      `${built ? `\\text{${L({ en: "Draw the parallelogram", vi: "Dựng hình bình hành" })}}\\ ${pick.x.join("")}${built.e}${built.end}\\\\ ` : ""}${pick.why}\\ \\Rightarrow\\ ${this.lt(pick.x)} \\parallel ${plT}\\\\ \\Rightarrow\\ ${label} = d\\left(${this.lt(pick.x)}, ${plT}\\right) = d\\left(${z}, ${plT}\\right)`,
      built
        ? { en: `Through ${built.end} draw a line parallel to ${this.lt(pick.x)}; the plane ${plT} through it and the other line is parallel to ${this.lt(pick.x)}, so every point of ${this.lt(pick.x)} is equally far from it.`, vi: `Qua ${built.end} kẻ đường thẳng song song với ${this.lt(pick.x)}; mặt phẳng ${plT} chứa nó và đường thẳng còn lại song song với ${this.lt(pick.x)}, nên mọi điểm của ${this.lt(pick.x)} cách đều mặt phẳng đó.` }
        : { en: `${this.lt(pick.x)} is parallel to a line of ${plT}, so it is parallel to the plane, and every point of it is equally far from the plane.`, vi: `${this.lt(pick.x)} song song với một đường thẳng của ${plT} nên song song với mặt phẳng đó, và mọi điểm của nó cách đều mặt phẳng.` },
      { en: "For skew lines a, b: if (P) ⊃ b and (P) ∥ a, then d(a, b) = d(a, (P)) = d(M, (P)) for any M on a.", vi: "Với hai đường thẳng chéo nhau a, b: nếu (P) chứa b và song song với a thì d(a, b) = d(a, (P)) = d(M, (P)) với M bất kỳ thuộc a." },
      { en: "Find a plane through one line, parallel to the other.", vi: "Tìm mặt phẳng chứa đường này và song song với đường kia." });
    return this.distPointPlane(z, pick.pl, true);
  }

  /* ───────────────────────── Proofs ───────────────────────── */

  /** Textbook order inside a name: the apex first (SA, not AS), then the order points were given. */
  rank = (p: string) => [this.m.apex, ...this.m.base, ...(this.m.top ?? []), ...this.m.pts.keys()].indexOf(p);
  lt = (l: Line) => [...l].sort((a, b) => this.rank(a) - this.rank(b)).join("");
  /** A plane's name; three points in textbook order ((SAC), not (SCA)). */
  pt = (p: Plane) => this.alias.get(this.planeKey(p)) ?? `(${(p.length === 3 ? [...p].sort((a, b) => this.rank(a) - this.rank(b)) : p).join("")})`;

  /** Why a ⊥ b, without new constructions: given, a right angle of a face, or one ⊥ a plane holding the other. */
  whyPerpLL(a: Line, b: Line, depth: number, out: Proof[]): string | null {
    if (!this.perpLL(a, b)) return null;
    for (const f of this.m.lines) {
      if (f.kind === "perp" && ((this.sameLine(f.a, a) && this.sameLine(f.b, b)) || (this.sameLine(f.a, b) && this.sameLine(f.b, a)))) return L(f.why);
    }
    for (const face of this.m.faces) {
      if (!face.shape || face.shape === "triangle" || face.shape === "parallelogram") continue;
      if (!this.lineIn(a, face.pts) || !this.lineIn(b, face.pts)) continue;
      const nm = face.pts.join("");
      const p = face.pts;
      const sides: Line[] = p.map((x, i) => [x, p[(i + 1) % p.length]]);
      const onSide = (l: Line) => sides.some((sd) => this.sameLine(l, sd));
      const pair = (x: Line, y: Line) => (this.sameLine(a, x) && this.sameLine(b, y)) || (this.sameLine(a, y) && this.sameLine(b, x));
      switch (face.shape) {
        case "square":
        case "rectangle":
          if (onSide(a) && onSide(b)) return face.shape === "square" ? L({ en: `${nm} is a square`, vi: `${nm} là hình vuông` }) : L({ en: `${nm} is a rectangle`, vi: `${nm} là hình chữ nhật` });
          if (face.shape === "square" && pair([p[0], p[2]], [p[1], p[3]])) return L({ en: `the diagonals of the square ${nm} are perpendicular`, vi: `hai đường chéo của hình vuông ${nm} vuông góc` });
          continue;
        case "right":
          if (onSide(a) && onSide(b)) return L({ en: `triangle ${nm} is right-angled at ${face.rightAt}`, vi: `tam giác ${nm} vuông tại ${face.rightAt}` });
          continue;
        case "rhombus":
          if (pair([p[0], p[2]], [p[1], p[3]])) return L({ en: `the diagonals of the rhombus ${nm} are perpendicular`, vi: `hai đường chéo của hình thoi ${nm} vuông góc` });
          continue;
        case "trapezoid":
          if (face.right && onSide(a) && onSide(b)) return L({ en: `${nm} is a right trapezoid at ${face.right.join(" and ")}`, vi: `${nm} là hình thang vuông tại ${face.right.join(" và ")}` });
          continue;
        case "equilateral":
        case "isosceles": {
          // An altitude: one line along a side, the other through the opposite vertex.
          const alt = [[a, b], [b, a]].some(([x, y]) => sides.some((sd) => this.sameLine(x, sd) && (face.shape === "equilateral" || !sd.includes(face.rightAt!)) && p.some((v) => !sd.includes(v) && this.collinear(this.P(v), y))));
          if (!alt) continue;
          return face.shape === "equilateral"
            ? L({ en: `in the equilateral triangle ${nm} a median is also an altitude`, vi: `trong tam giác đều ${nm}, trung tuyến cũng là đường cao` })
            : L({ en: `in triangle ${nm}, isosceles at ${face.rightAt}, the median from ${face.rightAt} is also an altitude`, vi: `trong tam giác ${nm} cân tại ${face.rightAt}, trung tuyến từ ${face.rightAt} cũng là đường cao` });
        }
      }
    }
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const f of this.m.perp) {
        if (this.sameLine(f.line, x) && this.lineIn(y, f.plane)) return L({ en: `${this.lt(x)} ⊥ ${this.pt(f.plane)} ⊃ ${this.lt(y)}`, vi: `${this.lt(x)} ⊥ ${this.pt(f.plane)} ⊃ ${this.lt(y)}` });
      }
    }
    if (depth > 0) {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        for (const pl of this.planesThrough(y)) {
          const p = this.provePerpLP(x, pl, depth - 1);
          if (p) {
            out.push(p);
            return `${this.lt(x)} \\perp ${this.pt(pl)} \\supset ${this.lt(y)}`;
          }
        }
      }
    }
    // Two sides of a triangle in the base with exact lengths: the converse of Pythagoras (AC² + CD² = AD²).
    const q = a.find((p) => b.includes(p));
    if (q && this.lineIn(a, this.m.base) && this.lineIn(b, this.m.base)) {
      const p = a.find((x) => x !== q)!;
      const r = b.find((x) => x !== q)!;
      const sq = [this.dist(q, p) ** 2, this.dist(q, r) ** 2, this.dist(p, r) ** 2];
      const tex = sq.map((v) => this.area(v));
      if (tex.every((t) => !t.includes("approx"))) return `${this.lt([q, p])}^2 + ${this.lt([q, r])}^2 = ${tex[0]} + ${tex[1]} = ${tex[2]} = ${this.lt([p, r])}^2`;
    }
    return null;
  }

  /** Named planes through a line: faces, and the line with one more named point. */
  planesThrough(l: Line): Plane[] {
    const out: Plane[] = this.m.faces.filter((f) => this.lineIn(l, f.pts)).map((f) => f.pts);
    for (const p of this.m.pts.keys()) {
      if (l.includes(p) || this.collinear(this.P(p), l)) continue;
      const pl = [...l, p];
      if (!out.some((o) => this.samePlane(o, pl))) out.push(pl);
    }
    return out.slice(0, 10);
  }

  provePerpLP(l: Line, pl: Plane, depth: number): Proof | null {
    const key = `${this.lt(l)}|${pl.join("")}|${depth}`;
    if (this.proven.has(key)) return this.proven.get(key)!;
    this.proven.set(key, null);
    if (!this.perpLP(l, pl)) return null;
    for (const f of this.m.perp) {
      if (this.sameLine(f.line, l) && this.samePlane(pl, f.plane) && this.samePlane(f.plane, pl)) {
        const p: Proof = { claim: `${this.lt(l)} \\perp ${this.pt(pl)}`, lines: [], given: L(f.why), subs: [] };
        this.proven.set(key, p);
        return p;
      }
    }
    // Two lines of the plane through a common named point, each ⊥ l for a known reason.
    const inside = this.pointsIn(pl);
    for (const c of inside) {
      const others = inside.filter((x) => x !== c && !near(this.P(x), this.P(c)));
      for (let i = 0; i < others.length; i++) {
        for (let j = i + 1; j < others.length; j++) {
          const m1: Line = [c, others[i]];
          const m2: Line = [c, others[j]];
          if (this.parLL(m1, m2)) continue;
          const subs: Proof[] = [];
          const r1 = this.whyPerpLL(l, m1, depth, subs);
          if (!r1) continue;
          const r2 = this.whyPerpLL(l, m2, depth, subs);
          if (!r2) continue;
          const p: Proof = {
            claim: `${this.lt(l)} \\perp ${this.pt(pl)}`,
            lines: [`${this.lt(l)} \\perp ${this.lt(m1)}\\ (${tx(r1)})`, `${this.lt(l)} \\perp ${this.lt(m2)}\\ (${tx(r2)})`, `${this.lt(m1)} \\cap ${this.lt(m2)} = ${c};\\ ${this.lt(m1)}, ${this.lt(m2)} \\subset ${this.pt(pl)}`],
            subs,
          };
          this.proven.set(key, p);
          return p;
        }
      }
    }
    return null;
  }

  /** Why a ∥ b: midline of a triangle, opposite sides of a rectangle/square face, prism edges. */
  whyParLL(a: Line, b: Line, direct = false): string | null {
    if (!this.parLL(a, b) || this.sameLine(a, b)) return null;
    const names = [...this.m.pts.keys()];
    // Only midpoints the text defines (or the centre of a parallelogram base) count — not ones that happen to fall there.
    const b4 = this.m.base;
    const centreOf = b4.length === 4 && ["square", "rectangle", "rhombus", "parallelogram"].includes(this.m.shape);
    const isMid = (p: string, u: string, v: string) => {
      const d = this.m.mids.get(p);
      if (d && d.includes(u) && d.includes(v)) return true;
      return centreOf && ((u === b4[0] && v === b4[2]) || (u === b4[2] && v === b4[0]) || (u === b4[1] && v === b4[3]) || (u === b4[3] && v === b4[1]));
    };
    const midOf = (p: string) => {
      const out: Line[] = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (names[i] !== p && names[j] !== p && near(mul3(add3(this.P(names[i]), this.P(names[j])), 0.5), this.P(p)) && isMid(p, names[i], names[j])) out.push([names[i], names[j]]);
      return out;
    };
    for (const [x, y] of [[a, b], [b, a]] as const) {
      // x = MN with M, N midpoints of XA, XB: MN ∥ AB.
      for (const s1 of midOf(x[0])) {
        for (const s2 of midOf(x[1])) {
          const common = s1.find((p) => s2.includes(p));
          if (!common) continue;
          const e: Line = [s1.find((p) => p !== common)!, s2.find((p) => p !== common)!];
          if (this.sameLine(e, y) || (!direct && this.parLL(e, y))) {
            const tri = [common, ...e].sort((p, q) => this.rank(p) - this.rank(q)).join("");
            return L({ en: `${this.lt(x)} is a midline of triangle ${tri}${this.sameLine(e, y) ? "" : `, and ${this.lt(e)} ∥ ${this.lt(y)}`}`, vi: `${this.lt(x)} là đường trung bình của tam giác ${tri}${this.sameLine(e, y) ? "" : `, mà ${this.lt(e)} ∥ ${this.lt(y)}`}` });
          }
        }
      }
    }
    for (const face of this.m.faces) {
      if (!this.lineIn(a, face.pts) || !this.lineIn(b, face.pts)) continue;
      const nm = face.pts.join("");
      if (face.shape === "square" || face.shape === "rectangle" || face.shape === "rhombus" || face.shape === "parallelogram") {
        const vi = { square: "hình vuông", rectangle: "hình chữ nhật", rhombus: "hình thoi", parallelogram: "hình bình hành" }[face.shape];
        return L({ en: `opposite sides of ${face.shape === "square" || face.shape === "rectangle" ? "" : `the ${face.shape} `}${nm}`, vi: `${nm} là ${vi}` });
      }
      if (face.shape === "trapezoid" && face.par && this.parLL(a, [face.par[0], face.par[1]])) {
        return L({ en: `${nm} is a trapezoid with ${face.par[0]}${face.par[1]} ∥ ${face.par[2]}${face.par[3]}`, vi: `${nm} là hình thang có ${face.par[0]}${face.par[1]} ∥ ${face.par[2]}${face.par[3]}` });
      }
    }
    if (this.m.kind === "prism") return L({ en: "sides of a prism", vi: "tính chất hình lăng trụ" });
    return null;
  }

  prove(g: Extract<Goal, { k: "prove" }>) {
    let { x, y } = g;
    if (x.k === "plane" && y.k === "line") [x, y] = [y, x];
    const claimTex = (rel: string) => `${x.k === "line" ? this.lt(x.l) : x.k === "plane" ? this.pt(x.pl) : ""} ${rel} ${y.k === "line" ? this.lt(y.l) : y.k === "plane" ? this.pt(y.pl) : ""}`;
    const rel = g.rel === "perp" ? "\\perp" : "\\parallel";
    const claim = claimTex(rel);
    // Is it true?
    let truth: boolean;
    if (g.rel === "perp") {
      truth =
        x.k === "line" && y.k === "line" ? this.perpLL(x.l, y.l)
        : x.k === "line" && y.k === "plane" ? this.perpLP(x.l, y.pl)
        : x.k === "plane" && y.k === "plane" ? Math.abs(dot3(this.normal(x.pl), this.normal(y.pl))) < EPS * len3(this.normal(x.pl)) * len3(this.normal(y.pl))
        : false;
    } else {
      truth =
        x.k === "line" && y.k === "line" ? this.parLL(x.l, y.l) && !this.sameLine(x.l, y.l)
        : x.k === "line" && y.k === "plane" ? Math.abs(dot3(this.dir(x.l), this.normal(y.pl))) < EPS * len3(this.dir(x.l)) * len3(this.normal(y.pl)) && !this.lineIn(x.l, y.pl)
        : x.k === "plane" && y.k === "plane" ? len3(cross3(this.normal(x.pl), this.normal(y.pl))) < EPS * len3(this.normal(x.pl)) * len3(this.normal(y.pl)) && !this.samePlane(x.pl, y.pl)
        : false;
    }
    if (!truth) {
      this.st.push("relation", { en: "The claim is false", vi: "Mệnh đề sai" }, `${claim}\\ \\text{${L({ en: "is false", vi: "là sai" })}}`,
        { en: "Checked with coordinates: the vectors don't satisfy it. Re-read the problem — a letter may be different.", vi: "Kiểm tra bằng tọa độ: các vectơ không thỏa mãn. Hãy đọc lại đề — có thể sai tên một điểm." },
        { en: "Perpendicular means dot product 0; parallel means proportional vectors.", vi: "Vuông góc nghĩa là tích vô hướng bằng 0; song song nghĩa là các vectơ cùng phương." },
        { en: "Check the names in the claim.", vi: "Kiểm tra lại tên trong mệnh đề." });
      this.answers.push({ key: `prove-${claim}`, latex: `${claim}\\ \\text{${L({ en: "(false)", vi: "(sai)" })}}`, value: null });
      return;
    }
    let done = false;
    if (g.rel === "perp") {
      if (x.k === "line" && y.k === "plane") done = this.emit(this.provePerpLP(x.l, y.pl, 2));
      else if (x.k === "line" && y.k === "line") {
        const subs: Proof[] = [];
        const r = this.whyPerpLL(x.l, y.l, 2, subs);
        if (r) {
          subs.forEach((s) => this.emit(s));
          this.proofStep(claim, [`${claim}\ (${tx(r)})`]);
          done = true;
        }
      } else if (x.k === "plane" && y.k === "plane") {
        for (const [p, q] of [[x.pl, y.pl], [y.pl, x.pl]] as const) {
          if (done) break;
          const inside = this.pointsIn(p);
          for (let i = 0; i < inside.length && !done; i++) {
            for (let j = i + 1; j < inside.length && !done; j++) {
              const l: Line = [inside[i], inside[j]];
              if (near(this.P(l[0]), this.P(l[1]))) continue;
              const pr = this.provePerpLP(l, q, 2);
              if (pr) {
                this.emit(pr);
                const shown = pr.given ? tx(pr.given) : `\\text{${L({ en: "shown above", vi: "chứng minh trên" })}}`;
                this.proofStep(claim, [`${this.lt(l)} \\perp ${this.pt(q)}\\ (${shown})`, `${this.lt(l)} \\subset ${this.pt(p)}`]);
                done = true;
              }
            }
          }
        }
      }
    } else if (x.k === "line" && y.k === "plane") {
      const inside = this.pointsIn(y.pl);
      // A one-step reason (MN ∥ BC as a midline) before a chained one (MN ∥ BC ∥ AD).
      outer: for (const direct of [true, false]) {
        for (let i = 0; i < inside.length; i++) {
          for (let j = i + 1; j < inside.length; j++) {
            const m: Line = [inside[i], inside[j]];
            const r = this.whyParLL(x.l, m, direct);
            if (r) {
              this.proofStep(claim, [`${this.lt(x.l)} \\parallel ${this.lt(m)}\\ (${tx(r)})`, `${this.lt(m)} \\subset ${this.pt(y.pl)},\\ ${this.lt(x.l)} \\not\\subset ${this.pt(y.pl)}`]);
              done = true;
              break outer;
            }
          }
        }
      }
    } else if (x.k === "plane" && y.k === "plane") {
      const rows = this.affine.provePlanes(x.pl, y.pl) ?? this.affine.provePlanes(y.pl, x.pl);
      if (rows) {
        this.proofStep(claim, rows);
        done = true;
      }
    } else if (x.k === "line" && y.k === "line") {
      const r = this.whyParLL(x.l, y.l);
      if (r) {
        this.proofStep(claim, [`${claim}\ (${tx(r)})`]);
        done = true;
      }
    }
    if (!done) {
      // A coordinate proof is a proof too.
      const names = [...(x.k === "line" ? x.l : x.k === "plane" ? x.pl : []), ...(y.k === "line" ? y.l : y.k === "plane" ? y.pl : [])];
      this.st.push("proof", { en: "Proof with coordinates", vi: "Chứng minh bằng tọa độ" },
        `${this.coordIntro(names)}\\\\ ${g.rel === "perp" ? L({ en: "\\text{the dot products are } 0", vi: "\\text{các tích vô hướng bằng } 0" }) : L({ en: "\\text{the vectors are proportional}", vi: "\\text{các vectơ cùng phương}" })}\\ \\Rightarrow\\ ${claim}`,
        { en: "Put the solid on axes and compare direction and normal vectors.", vi: "Đặt hình vào hệ trục và so sánh các vectơ chỉ phương, pháp tuyến." },
        { en: "Perpendicular ⇔ dot product 0; a line ⊥ a plane ⇔ its direction is parallel to the normal.", vi: "Vuông góc ⇔ tích vô hướng bằng 0; đường thẳng ⊥ mặt phẳng ⇔ vectơ chỉ phương cùng phương với pháp tuyến." },
        { en: "Write the coordinates of the points involved.", vi: "Viết tọa độ các điểm liên quan." });
      this.notes.push(L({ en: "No short textbook argument was found for this claim, so it is proved with coordinates.", vi: "Chưa tìm được lập luận hình học ngắn cho mệnh đề này, nên chứng minh bằng tọa độ." }));
    }
    this.answers.push({ key: `prove-${claim}`, latex: `${claim}\\ \\checkmark`, value: null });
  }

  /** Write a proof and the ones it relies on, innermost first. */
  emit(p: Proof | null): boolean {
    if (!p) return false;
    p.subs.forEach((s) => this.emit(s));
    if (p.given) return true;
    this.proofStep(p.claim, p.lines);
    return true;
  }

  private written = new Set<string>();
  proofStep(claim: string, lines: string[]) {
    if (this.written.has(claim)) return;
    this.written.add(claim);
    this.st.push("proof", { en: "Prove", vi: "Chứng minh" },
      `\\begin{cases} ${lines.join(" \\\\ ")} \\end{cases}\\ \\Rightarrow\\ ${claim}`,
      { en: "Each line on the left is justified by the reason in brackets.", vi: "Mỗi dòng bên trái được giải thích bởi lý do trong ngoặc." },
      /^\(.*\\parallel \(/.test(claim)
        ? { en: "A plane containing two intersecting lines, each parallel to another plane, is parallel to that plane.", vi: "Nếu mặt phẳng chứa hai đường thẳng cắt nhau cùng song song với mặt phẳng kia thì hai mặt phẳng song song." }
        : claim.includes("\\parallel") ? { en: "A line parallel to a line in a plane (and not in it) is parallel to the plane.", vi: "Đường thẳng không nằm trong mặt phẳng và song song với một đường thẳng của mặt phẳng thì song song với mặt phẳng đó." } :{ en: "A line perpendicular to two intersecting lines of a plane is perpendicular to the plane; a plane through a line ⊥ another plane is ⊥ to it.", vi: "Đường thẳng vuông góc với hai đường thẳng cắt nhau của mặt phẳng thì vuông góc với mặt phẳng; mặt phẳng chứa đường thẳng vuông góc với mặt phẳng khác thì vuông góc với mặt phẳng đó." },
      { en: "Look for two intersecting lines in the plane that are perpendicular to the line.", vi: "Tìm hai đường thẳng cắt nhau trong mặt phẳng cùng vuông góc với đường thẳng đó." });
  }
}

type Proof = { claim: string; lines: string[]; subs: Proof[]; given?: string };

/** Reason text inside \text{…}; maths symbols stay maths. */
function tx(r: string): string {
  if (/\\perp|\\supset|\\subset|\^2/.test(r)) return r;
  return `\\text{${r.replace(/⊥/g, "$\\perp$").replace(/⊃/g, "$\\supset$").replace(/∥/g, "$\\parallel$")}}`;
}

function vecT(v: number[]): string {
  return `\\left(${v.map((c) => (Math.abs(c) < EPS ? "0" : ratioTex(c))).join(L({ en: ",\\ ", vi: ";\\ " }))}\\right)`;
}

export function solveSpace(raw: string, m: Model): SpaceSolver {
  const s = new SpaceSolver(m);
  s.affine.readPlanes(raw);
  // A question the data can't answer becomes a note, as long as another one is answered.
  let first: MeasureError | null = null;
  for (const g of parseGoals(raw, m, s.affine.named)) {
    try {
      s.run(g);
    } catch (e) {
      if (!(e instanceof MeasureError)) throw e;
      first ??= e;
      s.notes.push(`${e.message} ${e.suggestion}`.trim());
    }
  }
  if (first && !s.answers.length) throw first;
  return s;
}
