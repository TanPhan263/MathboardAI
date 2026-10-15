import { describe, expect, it } from "vitest";
import { solveProblem } from "../math/solve";
import { type Candidate, type InkStroke, type SymbolClassifier, recognizeInk, recognizeInkAsync } from "./recognize";
import { SYMBOLS, type Pt, type Sym } from "./symbols";

/*
 * Layout tests: rows, fraction bars, exponents, grouping and context. Symbol
 * shapes are judged by the trained network, measured separately on real
 * handwriting (handwriting.eval.test.ts). Here an oracle classifier knows
 * which symbol each stroke group was drawn as, so failures are layout bugs.
 */

const truth = new Map<string, Sym>();
/** stroke id → the written symbol it belongs to, and how many strokes that symbol has. */
const owner = new Map<string, { glyph: number; size: number }>();
let ids = 0;
let glyphs = 0;

/** Simple stroke skeletons per symbol, in digit-height units (y down). */
const SKELETON: Partial<Record<Sym, Array<Array<[number, number]>>>> = {
  "+": [[[0.35, 0.2], [0.35, 0.85]], [[0, 0.52], [0.7, 0.52]]],
  "-": [[[0, 0.55], [0.55, 0.55]]],
  "=": [[[0, 0.4], [0.6, 0.4]], [[0, 0.72], [0.6, 0.72]]],
  x: [[[0, 0.35], [0.6, 1]], [[0.6, 0.35], [0, 1]]],
  "(": [[[0.3, 0], [0.05, 0.5], [0.3, 1]]],
  ")": [[[0, 0], [0.25, 0.5], [0, 1]]],
  "≤": [[[0.6, 0.15], [0, 0.4], [0.6, 0.65]], [[0, 0.9], [0.6, 0.9]]],
};
// Anything else: one upright zig-zag stroke.
const plain: Array<Array<[number, number]>> = [[[0.1, 0], [0.5, 0.3], [0.1, 0.6], [0.5, 1]]];

function write(text: Array<Sym | { sym: Sym; raised: true }>, at: { x?: number; y?: number; size?: number } = {}): InkStroke[] {
  const size = at.size ?? 40;
  let x = at.x ?? 0;
  const out: InkStroke[] = [];
  for (const g of text) {
    const { sym, raised } = typeof g === "string" ? { sym: g, raised: false } : g;
    const k = raised ? 0.55 : 1;
    const dy = raised ? -0.2 * size : 0;
    const shape = SKELETON[sym] ?? plain;
    let w = 0;
    const glyph = glyphs++;
    for (const s of shape) {
      const id = `s${ids++}`;
      owner.set(id, { glyph, size: shape.length });
      const points: Pt[] = [];
      for (let i = 1; i < s.length; i++) {
        const [ax, ay] = s[i - 1];
        const [bx, by] = s[i];
        for (let t = 0; t <= 8; t++) {
          points.push({ x: x + (ax + ((bx - ax) * t) / 8) * size * k, y: (at.y ?? 0) + dy + (ay + ((by - ay) * t) / 8) * size * k });
        }
      }
      truth.set(id, sym);
      out.push({ id, points });
      w = Math.max(w, ...s.map(([px]) => px));
    }
    x += Math.max(w, 0.3) * size * k + size * 0.35;
  }
  return out;
}

/** Knows the answer: confident only for exactly one whole written symbol. */
function oracle(strokesById: Map<string, Pt[]>, swap: Partial<Record<Sym, Sym>> = {}): SymbolClassifier {
  const idOf = (pts: Pt[]) => [...strokesById].find(([, p]) => p === pts)![0];
  return (strokes) => {
    const strokeIds = strokes.map(idOf);
    const owners = strokeIds.map((id) => owner.get(id)!);
    const whole = owners.every((o) => o.glyph === owners[0].glyph) && owners[0].size === strokeIds.length;
    if (!whole) return SYMBOLS.map((s) => ({ symbol: s, cost: 6 }));
    const sym = truth.get(strokeIds[0])!;
    const best = swap[sym] ?? sym;
    const rest = SYMBOLS.filter((s) => s !== best).map((s): Candidate => ({ symbol: s, cost: s === sym ? 1 : 6 }));
    return [{ symbol: best, cost: 0.05 }, ...rest].sort((a, b) => a.cost - b.cost);
  };
}

/** One hand-placed stroke written as `sym` (for marks too small for the skeletons). */
function mark(sym: Sym, points: Array<[number, number]>): InkStroke {
  const id = `s${ids++}`;
  owner.set(id, { glyph: glyphs++, size: 1 });
  truth.set(id, sym);
  return { id, points: points.map(([x, y]) => ({ x, y })) };
}

function read(strokes: InkStroke[], swap?: Partial<Record<Sym, Sym>>) {
  return recognizeInk(strokes, { classify: oracle(new Map(strokes.map((s) => [s.id, s.points])), swap) })!;
}

const chars = (s: string) => [...s] as Sym[];

function fraction(num: Sym[], den: Sym[], x: number): InkStroke[] {
  const top = write(num, { x: x + 6, y: -46 });
  const bottom = write(den, { x: x + 6, y: 10 });
  const right = Math.max(...[...top, ...bottom].flatMap((s) => s.points.map((p) => p.x)));
  const bar = { id: `s${ids++}`, points: [{ x, y: 0 }, { x: right + 6, y: 1 }] };
  truth.set(bar.id, "-");
  owner.set(bar.id, { glyph: glyphs++, size: 1 });
  return [...top, bar, ...bottom];
}

describe("recognizeInk layout", () => {
  it("returns null for no ink", () => {
    expect(recognizeInk([], { classify: () => [] })).toBeNull();
  });

  it("reads a line and writes multiplication explicitly", () => {
    const r = read(write(chars("2x+3=7")));
    expect(r.ascii).toBe("2*x+3=7");
    expect(r.latex).toBe("2x+3=7");
    expect(r.valid).toBe(true);
  });

  it("keeps a ruler-straight plus sign together", () => {
    const r = read(write(chars("2+3")));
    expect(r.tokens.map((t) => t.symbol)).toEqual(["2", "+", "3"]);
  });

  it("reads exponents", () => {
    const r = read(write(["x", { sym: "2", raised: true }, "-", "5", "x", "+", "6", "=", "0"]));
    expect(r.ascii).toBe("x^2-5*x+6=0");
    expect(r.latex).toBe("x^{2}-5x+6=0");
    expect(solveProblem(r.ascii).ok).toBe(true);
  });

  it("reads inequalities", () => {
    expect(read(write(chars("3x-1≤8"))).ascii).toBe("3*x-1<=8");
  });

  it("reads stacked fractions", () => {
    const r = read([...fraction(["1"], ["x"], 0), ...write(chars("=2"), { x: 70, y: -20 })]);
    expect(r.ascii).toBe("((1)/(x))=2");
    expect(r.latex).toBe("\\frac{1}{x}=2");
  });

  it("reads two lines as a system", () => {
    const r = read([...write(chars("x+y=5")), ...write(chars("x-y=1"), { y: 80 })]);
    expect(r.rows).toBe(2);
    expect(r.ascii).toBe("x+y=5; x-y=1");
    expect(solveProblem(r.ascii).ok).toBe(true);
  });

  it("reads a hurried short dash as minus, not times", () => {
    // b − 1, the minus barely longer than a dot.
    const r = read([...write(["b"]), mark("-", [[34, 22], [41, 22]]), ...write(["1"], { x: 50 })]);
    expect(r.ascii).toBe("b-1");
  });

  it("shows a low dot between digits as a decimal point", () => {
    const r = read([...write(["0"]), mark(".", [[30, 39], [31, 40]]), ...write(["5"], { x: 40 })]);
    expect(r.ascii).toBe("0.5");
    expect(r.tokens.map((t) => t.symbol)).toEqual(["0", ".", "5"]);
  });

  it("uses context when the picture is unsure", () => {
    // The network prefers "1" for the bracket, but only "(" makes valid maths.
    const r = read(write(chars("2(x+1)=8")), { "(": "1" });
    expect(r.ascii).toBe("2*(x+1)=8");
    expect(r.tokens[1].uncertain).toBe(true);
  });

  it("applies the learner's correction", () => {
    const strokes = write(chars("2x=4"));
    const key = read(strokes).tokens[0].key;
    const map = new Map(strokes.map((s) => [s.id, s.points]));
    const r = recognizeInk(strokes, { classify: oracle(map), overrides: { [key]: "3" } })!;
    expect(r.ascii).toBe("3*x=4");
    expect(r.tokens[0].fixed).toBe(true);
  });

  it("splits a symbol the learner cut apart", () => {
    // The two crossing strokes of an x would always be glued together.
    const strokes = write(chars("x"));
    const r = recognizeInk(strokes, {
      classify: oracle(new Map(strokes.map((s) => [s.id, s.points]))),
      groups: strokes.map((s) => [s.id]),
    })!;
    expect(r.tokens.map((t) => t.strokeIds)).toEqual(strokes.map((s) => [s.id]));
  });

  it("joins strokes the learner marked as one symbol", () => {
    // Two strokes read as "1 1"; the learner says they are one "4".
    const strokes = write(chars("11"));
    const map = new Map(strokes.map((s) => [s.id, s.points]));
    const ids = strokes.map((s) => s.id);
    expect(read(strokes).tokens).toHaveLength(2);
    const r = recognizeInk(strokes, { classify: oracle(map), groups: [ids], overrides: { [[...ids].sort().join("+")]: "4" } })!;
    expect(r.tokens).toHaveLength(1);
    expect(r.ascii).toBe("4");
  });

  it("does not take a grouped dash for a fraction bar", () => {
    const strokes = fraction(["1"], ["2"], 0);
    const bar = strokes.find((s) => truth.get(s.id) === "-")!;
    const den = strokes.at(-1)!;
    const r = recognizeInk(strokes, { classify: oracle(new Map(strokes.map((s) => [s.id, s.points]))), groups: [[bar.id, den.id]] })!;
    expect(r.latex).not.toContain("\\frac");
    expect(r.tokens.some((t) => t.strokeIds.includes(bar.id) && t.strokeIds.includes(den.id))).toBe(true);
  });

  it("flags symbols it does not handle instead of guessing", () => {
    // A shape the network can't place: context may pick a stand-in, but it is flagged.
    const r = read(write(chars("2?=4")));
    expect(r.tokens[1].uncertain).toBe(true);
  });
});

describe("recognizeInkAsync (network on the server)", () => {
  it("reads the same as the local reader with one request", async () => {
    const strokes = [...write(chars("2x+3=7")), ...write(chars("x-1"), { y: 80 })];
    const local = read(strokes);
    const net = oracle(new Map(strokes.map((s) => [s.id, s.points])));
    let requests = 0;
    const classifyBatch = async (groups: Array<{ strokes: Pt[][]; unit: number }>) => {
      requests++;
      return groups.map((g) => net(g.strokes, { box: { x: 0, y: 0, w: 0, h: 0 }, unit: g.unit }));
    };
    const cache = new Map();
    const remote = await recognizeInkAsync(strokes, { classifyBatch, cache });
    expect(remote!.ascii).toBe(local.ascii);
    expect(requests).toBe(1);
    // A fix re-reads from the cache: no new request.
    await recognizeInkAsync(strokes, { classifyBatch, cache, overrides: { [remote!.tokens[0].key]: "3" } });
    expect(requests).toBe(1);
  });
});
