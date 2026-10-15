import { clean } from "../geometry/parse";
import { L } from "../lang";
import { type Text, oops } from "./num";
import { type V3, add3, cross3, dot3, len3, mul3, near, sub3 } from "./space";
import type { SpaceSolver } from "./spaceSolve";

/**
 * Grade 11 “quan hệ song song”: planes given by points or by “qua M, song
 * song với SA và BC”, the intersection line of two planes (giao tuyến), the
 * point where a line meets a plane (giao điểm) and cross-sections (thiết
 * diện) — each found the textbook way: common points, lines meeting inside a
 * common plane, auxiliary planes, and parallels.
 */

type Line = [string, string];
type Plane = string[];
type Par = { k: "line"; l: Line } | { k: "plane"; pl: Plane };
export type PlaneDef = { name: string; tex: string; pts: Plane; n: V3; through: string[]; par: Par[]; shown: boolean };

const EPS = 1e-9;
const GREEK: Record<string, string> = { α: "\\alpha", β: "\\beta", γ: "\\gamma" };
const NAME = String.raw`\((?:α|β|γ|P|Q|R)\)`;
const OBJ = String.raw`\((?:[A-Z]'?){3,4}\)|[A-Z]'?[A-Z]'?(?![A-Z'])`;
const COORDS: Text = { en: "found with coordinates", vi: "tìm bằng tọa độ" };

export class Affine {
  named = new Map<string, PlaneDef>();
  /** The polygon side each cut point lies on. */
  edgeOf = new Map<string, Line>();

  constructor(readonly s: SpaceSolver) {}

  private P = (x: string) => this.s.P(x);
  private names = () => [...this.s.m.pts.keys()];
  private t = (x: string) => `\\text{${x}}`;

  /** A plane named by three vertices of the solid when it has them ((SBD), not (BMN)). */
  hostName(pl: Plane): string {
    const s = this.s;
    const verts = [...(s.m.apex ? [s.m.apex] : []), ...s.m.base, ...(s.m.top ?? [])].filter((v) => s.onPlane(this.P(v), pl));
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        for (let k = j + 1; k < verts.length; k++) {
          if (len3(cross3(sub3(this.P(verts[j]), this.P(verts[i])), sub3(this.P(verts[k]), this.P(verts[i])))) > EPS) return s.pt([verts[i], verts[j], verts[k]]);
        }
      }
    }
    return s.pt(pl);
  }

  /** Edges of the solid, each once. */
  edges(): Line[] {
    const out: Line[] = [];
    const seen = new Set<string>();
    for (const f of this.s.m.faces) {
      for (let i = 0; i < f.pts.length; i++) {
        const e: Line = [f.pts[i], f.pts[(i + 1) % f.pts.length]];
        const k = [...e].sort().join("|");
        if (!seen.has(k)) {
          seen.add(k);
          out.push(e);
        }
      }
    }
    return out;
  }

  /* ───────────────────────────── Planes named in the text ───────────────────────────── */

  readPlanes(raw: string) {
    const s = clean(raw.replace(/[’′`]/g, "'")).replace(/\s+/g, " ");
    const re = new RegExp(String.raw`(?:(?:mặt phẳng|mp|the plane|a plane|plane)\s*(${NAME})?|(${NAME}))\s*(?:là\s+mặt phẳng\s+|is\s+the\s+plane\s+|is\s+a\s+plane\s+)?(?:đi\s+)?(?:qua|through|passing through|containing|chứa)\s+((?:[A-Z]'?\s*){1,3}?)\s*,?\s*(?:và\s+|and\s+)?(?:is\s+|là\s+)?(?:song song|parallel)\s+(?:với\s+|to\s+)?(${OBJ})(?:\s*(?:,|và|and)\s*(${OBJ}))?`, "gu");
    for (const m of s.matchAll(re)) {
      const name = m[1] ?? m[2] ?? "(α)";
      if (this.named.has(name)) continue;
      const through = m[3].match(/[A-Z]'?/g) ?? [];
      const par: Par[] = [m[4], m[5]].filter((o): o is string => !!o).map((o) => (o.startsWith("(") ? { k: "plane", pl: o.slice(1, -1).match(/[A-Z]'?/g)! } : { k: "line", l: o.match(/[A-Z]'?/g)! as Line }));
      const all = [...through, ...par.flatMap((p) => (p.k === "line" ? p.l : p.pl))];
      if (!through.length || !all.every((x) => this.s.m.pts.has(x))) continue;
      const p0 = this.P(through[0]!);
      const dirs: V3[] = [
        ...through.slice(1).map((x) => sub3(this.P(x), p0)),
        ...par.flatMap((p) => (p.k === "line" ? [this.s.dir(p.l)] : [sub3(this.P(p.pl[1]), this.P(p.pl[0])), sub3(this.P(p.pl[2]), this.P(p.pl[0]))])),
      ];
      let n: V3 | null = null;
      for (let i = 0; i < dirs.length && !n; i++) {
        for (let j = i + 1; j < dirs.length && !n; j++) {
          const c = cross3(dirs[i], dirs[j]);
          if (len3(c) > EPS) n = c;
        }
      }
      if (!n) continue;
      const letter = name.slice(1, -1);
      if (/^[A-Z]$/.test(letter)) this.s.m.taken.add(letter);
      const tex = `(${letter.replace(/[αβγ]/g, (g) => GREEK[g])})`;
      const pts = this.cut(n, p0, through, name);
      const def: PlaneDef = { name, tex, pts, n, through, par, shown: false };
      this.named.set(name, def);
      this.s.alias.set(this.s.planeKey(pts), tex);
    }
  }

  /**
   * The section of the solid by the plane through p0 with normal n: its
   * vertices in order around the polygon, existing names kept, new ones
   * named in turn (M, N, P, Q…) starting from a given point.
   */
  cut(n: V3, p0: V3, first: string[], plain: string): Plane {
    const nn = mul3(n, 1 / len3(n));
    const d = (x: string) => dot3(sub3(this.P(x), p0), nn);
    const raw: Array<{ x: V3; name?: string; edge?: Line }> = [];
    const add = (x: V3, name?: string, edge?: Line) => {
      const r = raw.find((q) => near(q.x, x));
      if (r) {
        r.name ??= name;
        r.edge ??= edge;
      } else raw.push({ x, name, edge });
    };
    for (const [u, v] of this.edges()) {
      const [du, dv] = [d(u), d(v)];
      if (Math.abs(du) < EPS) add(this.P(u), u);
      if (Math.abs(dv) < EPS) add(this.P(v), v);
      if (du * dv < 0 && Math.abs(du) > EPS && Math.abs(dv) > EPS) add(add3(this.P(u), mul3(sub3(this.P(v), this.P(u)), du / (du - dv))), undefined, [u, v]);
    }
    if (raw.length < 3) oops({ en: "That plane doesn't cut the solid in a polygon.", vi: "Mặt phẳng đó không cắt hình theo một đa giác." }, { en: "Check the points that define the plane.", vi: "Kiểm tra lại các điểm xác định mặt phẳng." });
    const c = mul3(raw.reduce<V3>((acc, r) => add3(acc, r.x), [0, 0, 0]), 1 / raw.length);
    const e1 = sub3(raw[0].x, c);
    const e2 = cross3(nn, e1);
    raw.sort((a, b) => Math.atan2(dot3(sub3(a.x, c), e2), dot3(sub3(a.x, c), e1)) - Math.atan2(dot3(sub3(b.x, c), e2), dot3(sub3(b.x, c), e1)));
    for (const r of raw) r.name ??= [...this.s.m.pts].find(([, v]) => near(v, r.x))?.[0];
    // Start at the first given point, going towards the second (M, N, …).
    let start = raw.findIndex((r) => r.name === first[0]);
    if (start < 0) start = Math.max(0, raw.findIndex((r) => r.name && first.includes(r.name)));
    let ordered = [...raw.slice(start), ...raw.slice(0, start)];
    if (first[1] && ordered.at(-1)?.name === first[1]) ordered = [ordered[0], ...ordered.slice(1).reverse()];
    for (const r of ordered) {
      if (!r.name) {
        const e = r.edge!.join("");
        r.name = this.s.nameAt(r.x, ["N", "P", "Q", "R", "K", "E", "F", "I", "J", "H", "T"], { en: `the point where ${plain} meets ${e}`, vi: `giao điểm của ${plain} với ${e}` }).name;
      }
      if (r.edge) this.edgeOf.set(r.name, r.edge);
    }
    return ordered.map((r) => r.name!);
  }

  /* ───────────────────────────── Intersection line of two planes ───────────────────────────── */

  /**
   * Two points of P ∩ Q — common named points, or lines of P and Q meeting
   * inside a common plane (AB ∩ CD = E in (ABCD)) — or one point and a
   * parallel direction (AB ∥ CD ⇒ the line through S parallel to them).
   */
  common(p: Plane, q: Plane): { pts: string[]; rows: string[]; par?: { a: Line; b: Line; why: string } } | null {
    const s = this.s;
    const dir = cross3(s.normal(p), s.normal(q));
    if (len3(dir) < EPS * len3(s.normal(p)) * len3(s.normal(q))) return null;
    const rows: string[] = [];
    const found: string[] = [];
    const on = (x: string) => s.onPlane(this.P(x), p) && s.onPlane(this.P(x), q);
    for (const x of this.names()) {
      if (found.length >= 2) break;
      if (on(x) && !found.some((f) => near(this.P(f), this.P(x)))) {
        found.push(x);
        rows.push(`${x} \\in ${s.pt(p)} \\cap ${s.pt(q)}`);
      }
    }
    if (found.length < 2) {
      // Lines of P and Q in a common plane (a face or the base) meet on the intersection line.
      const linesIn = (pl: Plane) => {
        const ins = s.pointsIn(pl);
        const out: Line[] = [];
        for (let i = 0; i < ins.length; i++) for (let j = i + 1; j < ins.length; j++) if (!near(this.P(ins[i]), this.P(ins[j]))) out.push([ins[i], ins[j]]);
        return out;
      };
      const hosts = [s.m.base, ...s.m.faces.map((f) => f.pts), ...(s.m.top ? [s.m.top] : [])];
      outer: for (const host of hosts) {
        for (const a of linesIn(p)) {
          if (!s.lineIn(a, host) || s.lineIn(a, q)) continue;
          for (const b of linesIn(q)) {
            if (!s.lineIn(b, host) || s.lineIn(b, p) || s.parLL(a, b)) continue;
            const x = meet(this.P(a[0]), s.dir(a), this.P(b[0]), s.dir(b));
            if (found.some((f) => near(this.P(f), x))) continue;
            const diag = s.m.base.length === 4 && [a, b].every((l) => s.sameLine(l, [s.m.base[0], s.m.base[2]]) || s.sameLine(l, [s.m.base[1], s.m.base[3]]));
            const e = s.nameAt(x, diag ? ["O", "I", "E"] : ["E", "F", "I", "K", "J"], { en: `the intersection of ${s.lt(a)} and ${s.lt(b)}`, vi: `giao điểm của ${s.lt(a)} và ${s.lt(b)}` }).name;
            rows.push(`${this.t(L({ en: "In ", vi: "Trong " }))}${this.hostName(host)}:\\ ${s.lt(a)} \\cap ${s.lt(b)} = ${e},\\ ${s.lt(a)} \\subset ${s.pt(p)},\\ ${s.lt(b)} \\subset ${s.pt(q)}\\ \\Rightarrow\\ ${e} \\in ${s.pt(p)} \\cap ${s.pt(q)}`);
            s.extra.push([a[0], e], [b[0], e]);
            found.push(e);
            if (found.length >= 2) break outer;
            continue outer;
          }
        }
      }
    }
    if (found.length >= 2) return { pts: found.slice(0, 2), rows };
    if (found.length === 1) {
      // Parallel lines, one in each plane: the intersection line is parallel to both.
      const ins = (pl: Plane) => s.pointsIn(pl);
      for (const a of pairs(ins(p))) {
        if (s.lineIn(a, q) || len3(cross3(s.dir(a), dir)) > EPS * len3(s.dir(a)) * len3(dir)) continue;
        for (const b of pairs(ins(q))) {
          if (s.lineIn(b, p) || !s.parLL(a, b) || s.sameLine(a, b)) continue;
          const why = s.whyParLL(a, b);
          if (!why) continue;
          return { pts: found, rows, par: { a, b, why } };
        }
      }
    }
    return null;
  }

  meetPlanes(p: Plane, q: Plane) {
    const s = this.s;
    this.showDefs([p, q]);
    const label = `${s.pt(p)} \\cap ${s.pt(q)}`;
    const c = this.common(p, q);
    if (!c) {
      const parallel = len3(cross3(s.normal(p), s.normal(q))) < EPS * len3(s.normal(p)) * len3(s.normal(q));
      if (parallel) {
        s.notes.push(L({ en: `${s.pt(p)} ∥ ${s.pt(q)}: they have no intersection line.`, vi: `${s.pt(p)} ∥ ${s.pt(q)}: hai mặt phẳng không có giao tuyến.` }));
        s.answers.push({ key: `meet-${p.join("")}-${q.join("")}`, latex: `${s.pt(p)} \\parallel ${s.pt(q)}`, value: null });
        return;
      }
      return oops({ en: "I couldn't find two common points of these planes from the figure.", vi: "Chưa tìm được hai điểm chung của hai mặt phẳng này từ hình vẽ." }, { en: "Name more points (like O = AC ∩ BD).", vi: "Hãy đặt tên thêm điểm (như O = AC ∩ BD)." });
    }
    if (c.par) {
      const [x] = c.pts;
      s.st.push("construct", { en: "Intersection line", vi: "Giao tuyến" },
        `${c.rows.join("\\\\ ")}\\\\ ${s.lt(c.par.a)} \\subset ${s.pt(p)},\\ ${s.lt(c.par.b)} \\subset ${s.pt(q)},\\ ${s.lt(c.par.a)} \\parallel ${s.lt(c.par.b)}\\ (${tx(c.par.why)})\\\\ \\Rightarrow\\ ${label} = ${x}x,\\ ${x}x \\parallel ${s.lt(c.par.a)} \\parallel ${s.lt(c.par.b)}`,
        { en: `${x} is a common point, and the planes contain the parallel lines ${s.lt(c.par.a)} and ${s.lt(c.par.b)}, so their intersection is the line through ${x} parallel to both.`, vi: `${x} là điểm chung, và hai mặt phẳng lần lượt chứa hai đường thẳng song song ${s.lt(c.par.a)}, ${s.lt(c.par.b)}, nên giao tuyến là đường thẳng qua ${x} và song song với chúng.` },
        { en: "If two planes through two parallel lines meet, their intersection line is parallel to those lines (or is one of them).", vi: "Hai mặt phẳng lần lượt chứa hai đường thẳng song song thì giao tuyến của chúng (nếu có) song song với hai đường thẳng đó (hoặc trùng với một trong hai)." },
        { en: "Find one common point, then look for parallel lines in the two planes.", vi: "Tìm một điểm chung, rồi tìm hai đường thẳng song song nằm trong hai mặt phẳng." });
      s.answers.push({ key: `meet-${p.join("")}-${q.join("")}`, latex: `${label} = ${x}x \\parallel ${s.lt(c.par.a)}`, value: null });
      return;
    }
    const [x, y] = c.pts;
    s.st.push("construct", { en: "Intersection line", vi: "Giao tuyến" },
      `${c.rows.join("\\\\ ")}\\\\ \\Rightarrow\\ ${label} = ${x}${y}`,
      { en: `${x} and ${y} lie on both planes, so the intersection line is ${x}${y}.`, vi: `${x} và ${y} là hai điểm chung của hai mặt phẳng, nên giao tuyến là ${x}${y}.` },
      { en: "Two distinct common points determine the intersection line of two planes.", vi: "Hai điểm chung phân biệt xác định giao tuyến của hai mặt phẳng." },
      { en: "Look for points on both planes — often where two lines meet inside the base.", vi: "Tìm các điểm chung — thường là giao điểm của hai đường thẳng trong mặt đáy." });
    s.extra.push([x, y]);
    s.answers.push({ key: `meet-${p.join("")}-${q.join("")}`, latex: `${label} = ${x}${y}`, value: null });
  }

  /* ───────────────────────────── A line meeting a plane ───────────────────────────── */

  /** Rows explaining X = l ∩ pl: a line of pl meeting l in a common plane, or an auxiliary plane through l. */
  locate(l: Line, pl: Plane, x: V3, name: string, known?: Set<string>, hidden = new Set<string>()): string[] | null {
    const s = this.s;
    const inPl = (known ? [...known] : s.pointsIn(pl)).filter((p) => s.onPlane(this.P(p), pl) && !hidden.has(p) && p !== name);
    // (i) A line of the plane meets l.
    for (const m of pairs(inPl)) {
      if (s.parLL(m, l) || s.sameLine(m, l)) continue;
      if (!coplanar(this.P(l[0]), s.dir(l), this.P(m[0]), s.dir(m))) continue;
      if (!near(meet(this.P(l[0]), s.dir(l), this.P(m[0]), s.dir(m)), x)) continue;
      const host = s.planesThrough(l).find((h) => s.lineIn(m, h));
      return [`${host ? `${this.t(L({ en: "In ", vi: "Trong " }))}${this.hostName(host)}:\\ ` : ""}${s.lt(l)} \\cap ${s.lt(m)} = ${name},\\ ${s.lt(m)} \\subset ${s.pt(pl)}\\ \\Rightarrow\\ ${name} = ${s.lt(l)} \\cap ${s.pt(pl)}`];
    }
    // (ii) An auxiliary plane through l: its intersection with pl meets l at X.
    for (const pass of [0, 1]) {
      if (pass === 1 && !this.addCentre()) break;
      for (const q of s.planesThrough(l)) {
        if (s.samePlane(q, pl)) continue;
        const c = this.commonWith(q, pl, inPl, new Set([...hidden, name]));
        if (!c) continue;
        const [y, z] = c.pts;
        if (!coplanar(this.P(l[0]), s.dir(l), this.P(y), sub3(this.P(z), this.P(y)))) continue;
        if (!near(meet(this.P(l[0]), s.dir(l), this.P(y), sub3(this.P(z), this.P(y))), x)) continue;
        known?.add(y);
        known?.add(z);
        return [
          `${this.t(L({ en: "Take the plane ", vi: "Chọn mặt phẳng " }))}${s.pt(q)} \\supset ${s.lt(l)}`,
          ...c.rows,
          `${s.pt(q)} \\cap ${s.pt(pl)} = ${y}${z};\\ ${this.t(L({ en: "in ", vi: "trong " }))}${s.pt(q)}:\\ ${s.lt(l)} \\cap ${y}${z} = ${name}\\ \\Rightarrow\\ ${name} = ${s.lt(l)} \\cap ${s.pt(pl)}`,
        ];
      }
    }
    return null;
  }

  /** Two points of q ∩ pl, using points already known on pl (and lines through them). */
  private commonWith(q: Plane, pl: Plane, inPl: string[], hidden: Set<string>): { pts: [string, string]; rows: string[] } | null {
    const s = this.s;
    const rows: string[] = [];
    const found = inPl.filter((p) => s.onPlane(this.P(p), q));
    const uniq: string[] = [];
    for (const f of found) if (!uniq.some((u) => near(this.P(u), this.P(f)))) uniq.push(f);
    if (uniq.length >= 2) return { pts: [uniq[0], uniq[1]], rows };
    // A line of pl and a line of q in a common plane meet at a point of both.
    const qPts = s.pointsIn(q).filter((p) => !hidden.has(p));
    const b = s.m.base;
    const diag = (m: Line, k: Line) => b.length === 4 && [m, k].every((l) => s.sameLine(l, [b[0], b[2]]) || s.sameLine(l, [b[1], b[3]]));
    for (const m of pairs(inPl)) {
      if (s.lineIn(m, q)) continue;
      for (const k of pairs(qPts)) {
        if (s.parLL(m, k) || !coplanar(this.P(m[0]), s.dir(m), this.P(k[0]), s.dir(k))) continue;
        const x = meet(this.P(m[0]), s.dir(m), this.P(k[0]), s.dir(k));
        if (uniq.some((u) => near(this.P(u), x))) continue;
        const host = s.planesThrough(m).find((h) => s.lineIn(k, h));
        const j = s.nameAt(x, diag(m, k) ? ["O", "I", "J"] : ["I", "J", "K", "E", "F"], { en: `the intersection of ${s.lt(m)} and ${s.lt(k)}`, vi: `giao điểm của ${s.lt(m)} và ${s.lt(k)}` }).name;
        rows.push(`${host ? `${this.t(L({ en: "In ", vi: "Trong " }))}${this.hostName(host)}:\\ ` : ""}${s.lt(m)} \\cap ${s.lt(k)} = ${j}`);
        s.extra.push([m[0], j], [k[0], j]);
        uniq.push(j);
        if (uniq.length >= 2) return { pts: [uniq[0], uniq[1]], rows };
      }
    }
    return null;
  }

  /** O = AC ∩ BD for a four-sided base, when the text didn't name it. */
  private addCentre(): boolean {
    const s = this.s;
    const b = s.m.base;
    if (b.length !== 4) return false;
    const x = meet(this.P(b[0]), s.dir([b[0], b[2]]), this.P(b[1]), s.dir([b[1], b[3]]));
    return s.nameAt(x, ["O", "I", "E"], { en: `the intersection of ${b[0]}${b[2]} and ${b[1]}${b[3]}`, vi: `giao điểm của ${b[0]}${b[2]} và ${b[1]}${b[3]}` }).isNew;
  }

  meetLine(l: Line, pl: Plane) {
    const s = this.s;
    this.showDefs([pl]);
    const n = s.normal(pl);
    const u = s.dir(l);
    const key = `meet-${l.join("")}-${pl.join("")}`;
    if (Math.abs(dot3(u, n)) < EPS * len3(u) * len3(n)) {
      const inside = s.lineIn(l, pl);
      s.notes.push(L(inside ? { en: `${s.lt(l)} lies in ${s.pt(pl)}.`, vi: `${s.lt(l)} nằm trong ${s.pt(pl)}.` } : { en: `${s.lt(l)} ∥ ${s.pt(pl)}: they don't meet.`, vi: `${s.lt(l)} ∥ ${s.pt(pl)}: không có giao điểm.` }));
      s.answers.push({ key, latex: `${s.lt(l)} ${inside ? "\\subset" : "\\parallel"} ${s.pt(pl)}`, value: null });
      return;
    }
    const t = dot3(sub3(this.P(pl[0]), this.P(l[0])), n) / dot3(u, n);
    const x = add3(this.P(l[0]), mul3(u, t));
    const existing = this.names().find((p) => near(this.P(p), x));
    // Reserve the name before the explanation names its helper points.
    const name = existing ?? this.peekName();
    s.m.taken.add(name);
    const rows = this.locate(l, pl, x, name);
    if (!existing) {
      s.m.pts.set(name, x);
      s.m.why.set(name, { en: `${name} is the intersection of ${s.lt(l)} and ${s.pt(pl)}`, vi: `${name} là giao điểm của ${s.lt(l)} và ${s.pt(pl)}` });
    }
    s.st.push("construct", { en: "Intersection point", vi: "Giao điểm" },
      rows ? rows.join("\\\\ ") : `${s.lt(l)} \\cap ${s.pt(pl)} = ${name}\\ (${this.t(L(COORDS))})`,
      { en: `To find where a line meets a plane, find a line of the plane that meets it inside a common plane — if none is in sight, take a plane through the line and its intersection line with the given plane.`, vi: `Muốn tìm giao điểm của đường thẳng với mặt phẳng, tìm một đường thẳng của mặt phẳng cắt nó (cùng nằm trong một mặt phẳng) — nếu chưa có, chọn mặt phẳng phụ chứa đường thẳng và tìm giao tuyến của nó với mặt phẳng đã cho.` },
      { en: "If d meets a line of (P), that point is d ∩ (P).", vi: "Nếu d cắt một đường thẳng nằm trong (P) thì giao điểm đó là giao điểm của d và (P)." },
      { en: `Which plane through ${s.lt(l)} is easy to intersect with ${s.pt(pl)}?`, vi: `Mặt phẳng nào chứa ${s.lt(l)} dễ tìm giao tuyến với ${s.pt(pl)}?` },
      rows ? "passed" : "unverified");
    s.extra.push([l[0], name]);
    s.answers.push({ key, latex: `${s.lt(l)} \\cap ${s.pt(pl)} = ${name}`, value: null });
  }

  /** The next free point name (for a point named before the explanation is written). */
  private peekName(): string {
    const all = ["I", "J", "K", "E", "F", "H", "T", "U", "V"];
    return all.find((p) => !this.s.m.taken.has(p) && !this.s.m.pts.has(p))!;
  }

  /* ───────────────────────────── Cross-sections ───────────────────────────── */

  /** Explain how a named plane was built (once), then its section. */
  showDefs(planes: Plane[]) {
    for (const pl of planes) {
      const def = [...this.named.values()].find((d) => this.s.planeKey(d.pts) === this.s.planeKey(pl));
      if (def && !def.shown) this.section(pl, false, true);
    }
  }

  section(pl: Plane, area: boolean, quiet = false) {
    const s = this.s;
    const def = [...this.named.values()].find((d) => s.planeKey(d.pts) === s.planeKey(pl));
    if (def) def.shown = true;
    const n = def ? def.n : s.normal(pl);
    const name = s.pt(pl);
    const poly = def ? def.pts : this.cut(n, this.P(pl[0]), pl, `(${pl.join("")})`);
    const known = new Set<string>(def ? def.through : pl);
    const rows: string[] = [];
    if (def) {
      rows.push(`${name}\\ ${this.t(L({ en: "passes through ", vi: "qua " }))}${def.through.join(", ")}${def.par.map((p) => `,\\ ${name} \\parallel ${p.k === "line" ? s.lt(p.l) : s.pt(p.pl)}`).join("")}`);
    }
    const traces: Array<{ a: string; b: string; f: Plane }> = [];
    for (let i = 0; i < poly.length; i++) {
      const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
      const f = s.m.faces.map((x) => x.pts).find((F) => s.onPlane(this.P(a), F) && s.onPlane(this.P(b), F));
      if (f) traces.push({ a, b, f });
    }
    const done = new Set<number>();
    // Section vertices not found yet can't be used to find others.
    const hidden = () => new Set(poly.filter((p) => !known.has(p)));
    for (let guard = 0; guard < 16 && done.size < traces.length; guard++) {
      let progress = false;
      // First the easy rules on every face: two known points, or a cut parallel to a line of the face.
      for (const [i, tr] of traces.entries()) {
        if (done.has(i)) continue;
        const [ka, kb] = [known.has(tr.a), known.has(tr.b)];
        if (ka && kb) {
          rows.push(`${name} \\cap ${s.pt(tr.f)} = ${tr.a}${tr.b}`);
          done.add(i);
          progress = true;
          continue;
        }
        if (!ka && !kb) {
          // A known point inside the face (like the centre O of the base) on this cut: the cut runs through it parallel to a line of the face.
          const K = [...known].find((p) => !poly.includes(p) && s.onPlane(this.P(p), tr.f) && s.collinear(this.P(p), [tr.a, tr.b]));
          const par = K && this.parallelInFace(tr.f, [tr.a, tr.b], def, known, name);
          if (K && par) {
            const ea = this.edgeOf.get(tr.a);
            const eb = this.edgeOf.get(tr.b);
            rows.push(`${name} \\cap ${s.pt(tr.f)} = ${tr.a}${tr.b},\\ ${tr.a}${tr.b} \\ni ${K},\\ ${tr.a}${tr.b} \\parallel ${s.lt(par.l)}\\ (${par.why})${ea ? `,\\ ${tr.a} \\in ${s.lt(ea)}` : ""}${eb ? `,\\ ${tr.b} \\in ${s.lt(eb)}` : ""}`);
            known.add(tr.a);
            known.add(tr.b);
            done.add(i);
            progress = true;
          }
          continue;
        }
        const [K, U] = ka ? [tr.a, tr.b] : [tr.b, tr.a];
        const par = this.parallelInFace(tr.f, [K, U], def, known, name);
        if (par) {
          const edge = this.edgeOf.get(U);
          rows.push(`${name} \\cap ${s.pt(tr.f)} = ${K}${U},\\ ${K}${U} \\parallel ${s.lt(par.l)}\\ (${par.why})${edge ? `,\\ ${U} \\in ${s.lt(edge)}` : ""}`);
          known.add(U);
          done.add(i);
          progress = true;
        }
      }
      if (progress) continue;
      // Then one new vertex where an edge meets the plane (through an auxiliary plane if need be).
      for (const [i, tr] of traces.entries()) {
        if (done.has(i)) continue;
        const U = [tr.a, tr.b].find((p) => !known.has(p))!;
        const edge = this.edgeOf.get(U);
        const r = edge && this.locate(edge, pl, this.P(U), U, known, hidden());
        if (r) {
          rows.push(...r);
          known.add(U);
          progress = true;
          break;
        }
      }
      if (!progress) break;
    }
    let coords = false;
    for (const [i, tr] of traces.entries()) {
      if (done.has(i)) continue;
      coords = true;
      rows.push(`${name} \\cap ${s.pt(tr.f)} = ${tr.a}${tr.b}\\ (${this.t(L(COORDS))})`);
    }
    s.section = poly;
    const shape = this.shapeOf(poly);
    s.st.push("construct", { en: "Section, face by face", vi: "Xác định thiết diện" },
      `${rows.join("\\\\ ")}\\\\ \\Rightarrow\\ ${this.t(`${L({ en: "the section is ", vi: "thiết diện là " })}${L(shape.name)} `)}${poly.join("")}`,
      { en: `Find where ${name} cuts each face: start from the points it is given through; in a face holding a line parallel to ${name}, the cut runs parallel to that line; otherwise find where an edge meets ${name}.`, vi: `Tìm giao tuyến của ${name} với từng mặt của hình: bắt đầu từ các điểm đã biết; mặt nào chứa đường thẳng song song với ${name} thì giao tuyến song song với đường thẳng đó; còn lại thì tìm giao điểm của cạnh với ${name}.` },
      { en: "The section is the polygon of the intersection lines with the faces.", vi: "Thiết diện là đa giác tạo bởi các đoạn giao tuyến của mặt phẳng với các mặt của hình." },
      { en: `Which faces does ${name} cut, and through which known points?`, vi: `${name} cắt những mặt nào, qua những điểm đã biết nào?` },
      coords ? "unverified" : "passed");
    if (quiet) return;
    s.answers.push({ key: `section-${poly.join("")}`, latex: `${this.t(L({ en: "Section: ", vi: "Thiết diện: " }))}${poly.join("")}\\ (${this.t(L(shape.name))})`, value: null });
    if (shape.why) s.notes.push(L(shape.why));
    if (area) {
      if (s.m.missing) oops(s.m.missing.msg, s.m.missing.hint);
      const S = polyArea(poly.map(this.P));
      s.st.push("formula", { en: "Area of the section", vi: "Diện tích thiết diện" },
        `${s.coordIntro(poly)}\\\\ S_{${poly.join("")}} = \\frac{1}{2}\\left|${poly.slice(1, -1).map((_, i) => `\\left[\\overrightarrow{${poly[0]}${poly[i + 1]}}, \\overrightarrow{${poly[0]}${poly[i + 2]}}\\right]`).join(" + ")}\\right| = ${s.area(S)}`,
        { en: "Split the polygon into triangles from one vertex and add their areas (half the cross products).", vi: "Chia đa giác thành các tam giác chung một đỉnh và cộng diện tích (nửa độ dài tích có hướng)." },
        { en: "A triangle's area is half the length of the cross product of two sides.", vi: "Diện tích tam giác bằng nửa độ dài tích có hướng của hai cạnh." },
        { en: "Write the coordinates of the section's vertices.", vi: "Viết tọa độ các đỉnh của thiết diện." });
      s.answers.push({ key: `area-${poly.join("")}`, latex: `S_{${poly.join("")}} = ${s.area(S)}`, value: S });
    }
  }

  /** A line ℓ of the face, parallel to the plane (for a reason), along which the cut through K runs. */
  private parallelInFace(face: Plane, ku: Line, def: PlaneDef | undefined, known: Set<string>, name: string): { l: Line; why: string } | null {
    const s = this.s;
    const ins = s.pointsIn(face);
    const sides: Line[] = face.map((x, i) => [x, face[(i + 1) % face.length]]);
    const cands = [...sides, ...pairs(ins).filter((l) => !sides.some((sd) => s.sameLine(sd, l)))];
    for (const l of cands) {
      if (!s.parLL(l, ku) || s.sameLine(l, ku)) continue;
      // Given: (α) ∥ that line, or ∥ a plane holding it.
      for (const p of def?.par ?? []) {
        if (p.k === "line" && s.sameLine(p.l, l)) return { l, why: `${name} \\parallel ${s.lt(l)}` };
        if (p.k === "plane" && s.lineIn(l, p.pl)) return { l, why: `${name} \\parallel ${s.pt(p.pl)} \\supset ${s.lt(l)}` };
        if (p.k === "line" && s.parLL(p.l, l)) {
          const r = s.whyParLL(l, p.l);
          if (r) return { l, why: `${s.lt(l)} \\parallel ${s.lt(p.l)}\\ (${tx(r)}),\\ ${name} \\parallel ${s.lt(p.l)}` };
        }
      }
      // ℓ parallel to a line between two known points of the plane.
      for (const m of pairs([...known])) {
        if (!s.parLL(m, l) || s.sameLine(m, l)) continue;
        const r = s.whyParLL(l, m);
        if (r) return { l, why: `${s.lt(l)} \\parallel ${s.lt(m)} \\subset ${name}\\ (${tx(r)})` };
      }
    }
    return null;
  }

  private shapeOf(poly: string[]): { name: Text; why?: Text } {
    const s = this.s;
    const k = poly.length;
    if (k === 3) return { name: { en: "a triangle", vi: "tam giác" } };
    if (k === 5) return { name: { en: "a pentagon", vi: "ngũ giác" } };
    if (k === 6) return { name: { en: "a hexagon", vi: "lục giác" } };
    if (k !== 4) return { name: { en: "a polygon", vi: "đa giác" } };
    const side = (i: number): Line => [poly[i], poly[(i + 1) % 4]];
    const p1 = s.parLL(side(0), side(2));
    const p2 = s.parLL(side(1), side(3));
    if (p1 && p2) {
      const right = s.perpLL(side(0), side(1));
      const eq = Math.abs(s.dist(poly[0], poly[1]) - s.dist(poly[1], poly[2])) < 1e-9;
      const nm = right && eq ? { en: "a square", vi: "hình vuông" } : right ? { en: "a rectangle", vi: "hình chữ nhật" } : eq ? { en: "a rhombus", vi: "hình thoi" } : { en: "a parallelogram", vi: "hình bình hành" };
      return { name: nm, why: { en: `${poly.join("")}: both pairs of opposite sides are parallel (checked with coordinates).`, vi: `${poly.join("")}: hai cặp cạnh đối song song (đã kiểm tra bằng tọa độ).` } };
    }
    if (p1 || p2) {
      const [a, b] = p1 ? [side(0), side(2)] : [side(1), side(3)];
      return { name: { en: "a trapezoid", vi: "hình thang" }, why: { en: `${a.join("")} ∥ ${b.join("")}, so ${poly.join("")} is a trapezoid.`, vi: `${a.join("")} ∥ ${b.join("")} nên ${poly.join("")} là hình thang.` } };
    }
    return { name: { en: "a quadrilateral", vi: "tứ giác" } };
  }

  /* ───────────────────────────── Parallel planes ───────────────────────────── */

  /** x ∥ y: two intersecting lines of x, each parallel to a line of y. Rows, or null. */
  provePlanes(x: Plane, y: Plane): string[] | null {
    const s = this.s;
    const ins = s.pointsIn(x);
    const yIns = s.pointsIn(y);
    for (const c of ins) {
      const others = ins.filter((p) => p !== c && !near(this.P(p), this.P(c)));
      const found: Array<{ m: Line; k: Line; why: string }> = [];
      for (const o of others) {
        const m: Line = [c, o];
        if (found.some((f) => s.parLL(f.m, m))) continue;
        for (const k of pairs(yIns)) {
          if (!s.parLL(m, k) || s.sameLine(m, k)) continue;
          const r = s.whyParLL(m, k, true) ?? s.whyParLL(m, k);
          if (r) {
            found.push({ m, k, why: r });
            break;
          }
        }
        if (found.length === 2) {
          const [a, b] = found;
          return [
            `${s.lt(a.m)} \\parallel ${s.lt(a.k)}\\ (${tx(a.why)}) \\Rightarrow ${s.lt(a.m)} \\parallel ${s.pt(y)}`,
            `${s.lt(b.m)} \\parallel ${s.lt(b.k)}\\ (${tx(b.why)}) \\Rightarrow ${s.lt(b.m)} \\parallel ${s.pt(y)}`,
            `${s.lt(a.m)} \\cap ${s.lt(b.m)} = ${c};\\ ${s.lt(a.m)}, ${s.lt(b.m)} \\subset ${s.pt(x)}`,
          ];
        }
      }
    }
    return null;
  }
}

/* ───────────────────────────── Helpers ───────────────────────────── */

function pairs(xs: string[]): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

const coplanar = (a: V3, u: V3, b: V3, v: V3) => Math.abs(dot3(cross3(u, v), sub3(b, a))) < EPS * Math.max(1, len3(u) * len3(v) * len3(sub3(b, a)));

/** Where the lines a + t·u and b + s·v meet (they are coplanar and not parallel). */
function meet(a: V3, u: V3, b: V3, v: V3): V3 {
  const uxv = cross3(u, v);
  const t = dot3(cross3(sub3(b, a), v), uxv) / dot3(uxv, uxv);
  return add3(a, mul3(u, t));
}

function polyArea(P: V3[]): number {
  let acc: V3 = [0, 0, 0];
  for (let i = 1; i + 1 < P.length; i++) acc = add3(acc, cross3(sub3(P[i], P[0]), sub3(P[i + 1], P[0])));
  return len3(acc) / 2;
}

/** Reason text inside \text{…}; maths symbols stay maths. */
function tx(r: string): string {
  if (/\\perp|\\supset|\\subset|\\parallel|\^2/.test(r)) return r;
  return `\\text{${r.replace(/⊥/g, "$\\perp$").replace(/⊃/g, "$\\supset$").replace(/∥/g, "$\\parallel$")}}`;
}
