import { exact } from "../math/polynomial";
import bigram from "./bigram.json";
import { DIGITS, LETTERS, type Pt, type Sym } from "./symbols";

/**
 * Handwritten maths → text, entirely in the browser.
 *
 *   strokes → rows → fraction bars → symbols → shape match → superscripts
 *           → the cheapest reading that still parses as maths.
 *
 * Every symbol keeps its runner-up guesses, so the learner can correct a
 * single symbol instead of rewriting the whole line (blueprint §11).
 */

export type { Pt, Sym } from "./symbols";
export type InkStroke = { id: string; points: Pt[] };
export type Box = { x: number; y: number; w: number; h: number };
/** cost = −log(probability): lower is better, and costs add up across symbols. */
export type Candidate = { symbol: Sym; cost: number };

/** Turns one symbol's strokes into ranked guesses (the trained network in the app). */
export type SymbolClassifier = (strokes: Pt[][], info: { box: Box; unit: number }) => Candidate[];

export type InkToken = {
  /** Stable for the same strokes: sorted stroke ids. */
  key: string;
  strokeIds: string[];
  box: Box;
  /** Best guess first. */
  candidates: Candidate[];
  /** What the reading uses (may differ from candidates[0] when context wins). */
  symbol: Sym;
  /** Worth a second look: close call, poor match, or overridden by context. */
  uncertain: boolean;
  /** Chosen by the learner. */
  fixed: boolean;
};

/** How the symbols sit: on the line, raised as exponents, or stacked in fractions. */
export type InkNode =
  | { kind: "sym"; key: string; sup: InkNode[] }
  | { kind: "frac"; bar: string; num: InkNode[]; den: InkNode[]; sup: InkNode[] };

export type InkResult = {
  tokens: InkToken[];
  /** One list per written line. */
  layout: InkNode[][];
  /** Typical symbol height in ink units. */
  unit: number;
  latex: string;
  ascii: string;
  box: Box;
  rows: number;
  /** The reading parses as maths. */
  valid: boolean;
};

export type RecognizeOptions = {
  classify: SymbolClassifier;
  /** token key → symbol the learner picked. */
  overrides?: Record<string, Sym>;
  /**
   * Stroke ids the learner marked as one symbol (split or joined by hand). Each
   * is read as exactly one symbol: never cut up, never joined to its neighbours.
   */
  groups?: string[][];
};

type S = { id: string; pts: Pt[]; box: Box; cx: number; cy: number; flat: boolean; tiny: boolean };

type Item =
  | { kind: "sym"; token: InkToken; box: Box; flat: boolean; sup: Item[] }
  | { kind: "frac"; bar: S; num: Item[]; den: Item[]; box: Box; sup: Item[] };

const RELATIONS = new Set<Sym>(["=", "<", ">", "≤", "≥"]);
const MAX_CANDIDATES = 5;
/** Never start an exponent (a minus can, see isRaised). */
const OPERATORS = new Set<Sym>(["+", "·", "/"]);
/** School algebra rarely needs an unknown symbol: a close real guess should win. */
const OTHER_PENALTY = Number(globalThis.process?.env?.INK_OTHER_PENALTY ?? 3);

/* ───────────── Geometry ───────────── */

function boxOf(pts: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const bottom = (b: Box) => b.y + b.h;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Typical symbol height: the yardstick for every threshold below. */
function unitHeight(strokes: Array<{ box: Box }>): number {
  const upright = strokes.filter((s) => s.box.h >= 0.4 * s.box.w).map((s) => s.box.h);
  const h = median(upright.length ? upright : strokes.map((s) => Math.max(s.box.w, s.box.h)));
  return h > 1 ? h : 40;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  // Inclusive: a pen sample often lands exactly on the other stroke.
  return o(a, b, c) * o(a, b, d) <= 0 && o(c, d, a) * o(c, d, b) <= 0 && (o(a, b, c) !== 0 || o(a, b, d) !== 0);
}

/** Where s and t cross, as a fraction along each stroke; null if they don't. */
function crossing(s: S, t: S): { s: number; t: number } | null {
  const { box: a } = s;
  const { box: b } = t;
  if (a.x > b.x + b.w || b.x > a.x + a.w || a.y > b.y + b.h || b.y > a.y + a.h) return null;
  for (let i = 1; i < s.pts.length; i++) {
    for (let j = 1; j < t.pts.length; j++) {
      if (segmentsCross(s.pts[i - 1], s.pts[i], t.pts[j - 1], t.pts[j])) {
        return { s: i / s.pts.length, t: j / t.pts.length };
      }
    }
  }
  return null;
}

/**
 * Crossing strokes are one symbol (+, x, t) — unless a dash only touches the
 * other stroke with its tip, as a hurried "−1" does. That pair is left for the
 * network to split or join.
 */
function glued(s: S, t: S): boolean {
  const c = crossing(s, t);
  if (!c) return false;
  const tip = (f: number) => f < 0.2 || f > 0.8;
  if (s.flat && !t.flat && tip(c.s)) return false;
  if (t.flat && !s.flat && tip(c.t)) return false;
  return true;
}

/* ───────────── Layout ───────────── */

function splitRows(strokes: S[], H: number): S[][] {
  const rows: Array<{ strokes: S[]; bottom: number }> = [];
  for (const s of [...strokes].sort((a, b) => a.box.y - b.box.y)) {
    const row = rows.at(-1);
    if (row && s.box.y <= row.bottom + 0.45 * H) {
      row.strokes.push(s);
      row.bottom = Math.max(row.bottom, bottom(s.box));
    } else {
      rows.push({ strokes: [s], bottom: bottom(s.box) });
    }
  }
  return rows.map((r) => r.strokes);
}

/**
 * Choose how strokes split into symbols by asking the network: try every run of
 * 1–4 neighbouring stroke clusters and keep the split whose symbols it is most
 * sure about overall. Strokes that cross or sit on top of each other (+, x, =, 5)
 * are always kept together. Each symbol costs SYMBOL_COST, so lumping two symbols
 * together only wins if the network really sees one symbol there.
 */
const SYMBOL_COST = Number(globalThis.process?.env?.INK_SYMBOL_COST ?? 0.25); // tuned on MathWriting valid

/** a and b share some width. */
const overlapsX = (a: Box, b: Box) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= 0;

function segment(strokes: S[], ctx: Ctx): S[][] {
  const { H } = ctx;
  if (strokes.length <= 1) return strokes.length ? [strokes] : [];
  // Hard links via union-find.
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const mine = (s: S) => ctx.groupOf.get(s.id);
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      // The learner's grouping beats every rule below.
      const gi = mine(strokes[i]);
      const gj = mine(strokes[j]);
      if (gi !== undefined || gj !== undefined) {
        if (gi === gj) parent[find(i)] = find(j);
        continue;
      }
      const a = strokes[i].box;
      const b = strokes[j].box;
      const wa = Math.max(a.w, 0.15 * H);
      const wb = Math.max(b.w, 0.15 * H);
      const ca = a.x + a.w / 2;
      const cb = b.x + b.w / 2;
      const overlap = Math.min(ca + wa / 2, cb + wb / 2) - Math.max(ca - wa / 2, cb - wb / 2);
      const stacked = overlap >= 0.8 * Math.min(wa, wb) && Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 0.9 * H;
      if (stacked || glued(strokes[i], strokes[j])) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, S[]>();
  strokes.forEach((s, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), s]));
  const atoms = [...clusters.values()]
    .map((g) => ({ g, box: unionBox(g.map((s) => s.box)), fixed: mine(g[0]) !== undefined }))
    .sort((a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2));

  const costOf = (g: S[]) => {
    const c = classify(g, ctx);
    return c.length ? c[0].cost : 20;
  };
  const n = atoms.length;
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let k = 1; k <= Math.min(4, j); k++) {
      const run = atoms.slice(j - k, j);
      if (k > 1) {
        if (run.some((a) => a.fixed)) break;
        const box = unionBox(run.map((a) => a.box));
        if (box.w > 1.6 * H || box.h > 1.8 * H) break;
        // Neighbours must touch or nearly touch to be one symbol.
        if (run.some((a, i) => i > 0 && a.box.x - (run[i - 1].box.x + run[i - 1].box.w) > 0.35 * H)) break;
        // A lone dash belongs to a symbol only when it reaches over the rest (t, +, =, 5);
        // beside it, it is a minus ("−1").
        if (run.some((a) => a.g.length === 1 && a.box.h < 0.5 * a.box.w && !overlapsX(a.box, unionBox(run.filter((o) => o !== a).map((o) => o.box))))) continue;
      }
      const total = best[j - k] + costOf(run.flatMap((a) => a.g)) + SYMBOL_COST;
      if (total < best[j]) {
        best[j] = total;
        from[j] = j - k;
      }
    }
  }
  const groups: S[][] = [];
  for (let j = n; j > 0; j = from[j]) groups.unshift(atoms.slice(from[j], j).flatMap((a) => a.g));
  return groups;
}

/* ───────────── Symbol classification ───────────── */

function classify(group: S[], ctx: Ctx): Candidate[] {
  const { H } = ctx;
  const box = unionBox(group.map((s) => s.box));
  // Shapes too small or too flat for a picture to say much: geometry decides.
  if (group.every((s) => s.tiny) && Math.max(box.w, box.h) < 0.2 * H) {
    // A short level dash is a hurried minus; a speck is a dot.
    if (group.length === 1 && box.w >= 0.1 * H && box.h < 0.35 * box.w) {
      return [{ symbol: "-", cost: 0 }, { symbol: "·", cost: 1 }, { symbol: ".", cost: 1.5 }];
    }
    return [{ symbol: "·", cost: 0 }, { symbol: ".", cost: 0.7 }];
  }
  if (group.length === 1 && group[0].flat) return [{ symbol: "-", cost: 0 }];
  if (group.length === 2 && group.every((s) => s.flat)) return [{ symbol: "=", cost: 0 }];
  return ctx
    .classify(group.map((s) => s.pts), { box, unit: H })
    .map((c) => (c.symbol === "?" ? { ...c, cost: c.cost + OTHER_PENALTY } : c))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, MAX_CANDIDATES);
}

/* ───────────── Structure ───────────── */

type Ctx = {
  H: number;
  classify: SymbolClassifier;
  overrides: Record<string, Sym>;
  /** stroke id → index of the learner's group it belongs to. */
  groupOf: Map<string, number>;
  tokens: InkToken[];
};

function makeToken(group: S[], ctx: Ctx): InkToken {
  const strokeIds = group.map((s) => s.id).sort();
  const key = strokeIds.join("+");
  const fixed = ctx.overrides[key];
  const candidates = fixed ? [{ symbol: fixed, cost: 0 }] : classify(group, ctx);
  const token: InkToken = {
    key,
    strokeIds,
    box: unionBox(group.map((s) => s.box)),
    candidates,
    symbol: candidates[0].symbol,
    uncertain: false,
    fixed: !!fixed,
  };
  ctx.tokens.push(token);
  return token;
}

/** A long flat stroke with ink above and below it is a fraction bar. */
function findFraction(rest: S[], ctx: Ctx) {
  const { H } = ctx;
  // A stroke the learner grouped with others is part of a symbol, not a bar.
  const alone = (s: S) => {
    const g = ctx.groupOf.get(s.id);
    return g === undefined || !rest.some((o) => o !== s && ctx.groupOf.get(o.id) === g);
  };
  const bars = rest.filter((s) => s.flat && s.box.w >= 0.5 * H && alone(s)).sort((a, b) => b.box.w - a.box.w);
  for (const bar of bars) {
    const x0 = bar.box.x - 0.1 * bar.box.w;
    const x1 = bar.box.x + 1.1 * bar.box.w;
    const inSpan = rest.filter((s) => s !== bar && s.cx >= x0 && s.cx <= x1);
    const num = inSpan.filter((s) => bottom(s.box) <= bar.cy + 0.15 * H);
    const den = inSpan.filter((s) => s.box.y >= bar.cy - 0.15 * H);
    if (num.some((s) => !s.flat) && den.some((s) => !s.flat)) return { bar, num, den };
  }
  return null;
}

function layout(strokes: S[], ctx: Ctx): Item[] {
  let rest = strokes;
  const items: Item[] = [];
  for (let f = findFraction(rest, ctx); f; f = findFraction(rest, ctx)) {
    const used = new Set([f.bar, ...f.num, ...f.den]);
    rest = rest.filter((s) => !used.has(s));
    items.push({
      kind: "frac",
      bar: f.bar,
      num: layout(f.num, ctx),
      den: layout(f.den, ctx),
      box: unionBox([...used].map((s) => s.box)),
      sup: [],
    });
  }
  for (const g of segment(rest, ctx)) {
    const token = makeToken(g, ctx);
    items.push({ kind: "sym", token, box: token.box, flat: g.every((s) => s.flat || s.tiny), sup: [] });
  }
  items.sort((a, b) => a.box.x - b.box.x);
  return attachScripts(items);
}

const canBeBase = (it: Item) =>
  it.kind === "sym" && (DIGITS.has(it.token.symbol) || LETTERS.has(it.token.symbol) || it.token.symbol === ")");

/**
 * Small symbols written up and to the right of a base are its exponent. Once an
 * exponent has started, later symbols join it only while they stay at its height.
 */
function isRaised(it: Item, base: Item, run: Item[]): boolean {
  if (it.kind === "sym" && RELATIONS.has(it.token.symbol)) return false;
  const b = base.box;
  const cy = it.box.y + it.box.h / 2;
  if (run.length) {
    const r = unionBox(run.map((x) => x.box));
    const reach = 0.6 * Math.max(r.h, 0.35 * b.h);
    return Math.abs(cy - (r.y + r.h / 2)) <= reach && bottom(it.box) <= b.y + 0.65 * b.h;
  }
  // Only a minus can start an exponent (x⁻¹), and only when clearly above the base.
  if (it.kind === "sym" && OPERATORS.has(it.token.symbol)) return false;
  if (it.kind === "sym" && it.flat) return cy < b.y;
  return it.box.h < 0.95 * b.h && (bottom(it.box) <= b.y + 0.55 * b.h || (cy < b.y + 0.25 * b.h && bottom(it.box) < b.y + 0.8 * b.h));
}

function attachScripts(items: Item[]): Item[] {
  const out: Item[] = [];
  let base: Item | null = null;
  for (const it of items) {
    if (base && isRaised(it, base, base.sup)) {
      base.sup.push(it);
      continue;
    }
    out.push(it);
    base = canBeBase(it) ? it : null;
  }
  return out;
}

/* ───────────── Text output ───────────── */

type Kind = "num" | "var" | "open" | "close" | "op";

const LATEX: Partial<Record<Sym, string>> = { "≤": "\\le ", "≥": "\\ge ", "·": "\\cdot " };
const ASCII: Partial<Record<Sym, string>> = { "≤": "<=", "≥": ">=", "·": "*" };

function kindOf(sym: Sym): Kind {
  if (DIGITS.has(sym) || sym === ".") return "num";
  if (LETTERS.has(sym)) return "var";
  if (sym === "(") return "open";
  if (sym === ")") return "close";
  return "op";
}

type Choice = (t: InkToken) => Sym;

/** Serialise items, writing every multiplication explicitly for the parser. */
function render(items: Item[], choose: Choice, resolved?: Map<InkToken, Sym>): { ascii: string; latex: string } {
  let ascii = "";
  let latex = "";
  let prev: Kind = "op";
  const glue = (next: Kind) => {
    const leftOk = prev === "num" || prev === "var" || prev === "close";
    const needs = next === "var" || next === "open" || (next === "num" && prev !== "num");
    if (leftOk && needs) ascii += "*";
  };
  items.forEach((it, i) => {
    if (it.kind === "frac") {
      const n = render(it.num, choose, resolved);
      const d = render(it.den, choose, resolved);
      glue("open");
      ascii += `((${n.ascii})/(${d.ascii}))`;
      latex += `\\frac{${n.latex}}{${d.latex}}`;
      prev = "close";
      return;
    }
    let sym = choose(it.token);
    // A low dot after a digit is a decimal point ("0.5", "0.(3)"); a raised one means "times".
    if (sym === "." || sym === "·") {
      const a = items[i - 1];
      const b = items[i + 1];
      const digit = (x?: Item) => x?.kind === "sym" && DIGITS.has(choose(x.token));
      const low = a ? it.box.y + it.box.h / 2 > a.box.y + 0.6 * a.box.h : false;
      const next = b?.kind === "sym" && (DIGITS.has(choose(b.token)) || choose(b.token) === "(");
      sym = digit(a) && a!.sup.length === 0 && next && (low || digit(b)) ? "." : "·";
      resolved?.set(it.token, sym);
    }
    const kind = kindOf(sym);
    glue(kind);
    ascii += ASCII[sym] ?? sym;
    latex += LATEX[sym] ?? sym;
    prev = kind;
    if (it.sup.length) {
      const s = render(it.sup, choose, resolved);
      const single = /^[0-9a-z]$/.test(s.ascii);
      ascii += single ? `^${s.ascii}` : `^(${s.ascii})`;
      latex += `^{${s.latex}}`;
      prev = "close";
    }
  });
  return { ascii, latex };
}

const RELATION_RE = /<=|>=|<|>|=/;

/** Does one row read as maths the solver could parse? */
function rowParses(ascii: string): boolean {
  const parts = ascii.split(RELATION_RE);
  if (parts.length > 3 || parts.some((p) => !p.trim())) return false;
  try {
    for (const p of parts) {
      const node = exact.parse(p);
      let bad = false;
      node.traverse((n) => {
        if (n.type === "FunctionNode") bad = true;
      });
      if (bad) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cheapest combination of candidates whose text parses — so "2(x+1)" beats
 * "21x+1)" even if the "(" alone looked a little more like a "1".
 */
/** How often one symbol follows another in real maths (mathcanvas-api/ml/lm.py), as −log p. */
const NEXT = (bigram as { cost: Record<string, Record<string, number>> }).cost;
const LM_WEIGHT = Number(globalThis.process?.env?.INK_LM_WEIGHT ?? 0.3);
const START = "^";
const nextCost = (prev: string, cur: Sym) => NEXT[prev]?.[cur] ?? 6;

/**
 * Cheapest reading that parses. Cost = the network's doubt about each symbol +
 * how unusual the sequence is ("2x" is common, "2t+" less so). So "2(x+1)" beats
 * "21x+1)" even when the "(" alone looked a little more like a "1".
 */
function bestReading(rows: Item[][], tokens: InkToken[]): { choice: Map<InkToken, number>; valid: boolean } {
  // Reading order, row by row, so the sequence model sees what a person would.
  const lines = rows.map((r) => flatten([r]));
  const pos = new Map(tokens.map((t, i) => [t, i]));
  const cost = (idx: number[]) => {
    let sum = 0;
    for (const line of lines) {
      let prev = START;
      for (const t of line) {
        const c = t.candidates[idx[pos.get(t)!]];
        sum += c.cost + LM_WEIGHT * nextCost(prev, c.symbol);
        prev = c.symbol;
      }
    }
    return sum;
  };
  const choiceOf = (idx: number[]) => new Map(tokens.map((t, i) => [t, idx[i]]));
  const textOf = (choice: Map<InkToken, number>) =>
    rows.map((r) => render(r, (t) => t.candidates[choice.get(t) ?? 0].symbol).ascii);

  // Start from the best sequence ignoring grammar (Viterbi), then search nearby.
  const start = tokens.map(() => 0);
  for (const line of lines) {
    if (!line.length) continue;
    let best = line[0].candidates.map((c) => ({ cost: c.cost + LM_WEIGHT * nextCost(START, c.symbol), path: [0] as number[] }));
    best = best.map((b, k) => ({ ...b, path: [k] }));
    for (let i = 1; i < line.length; i++) {
      best = line[i].candidates.map((c) => {
        let top = { cost: Infinity, path: [] as number[] };
        best.forEach((b, k) => {
          const v = b.cost + LM_WEIGHT * nextCost(line[i - 1].candidates[k].symbol, c.symbol);
          if (v < top.cost) top = { cost: v, path: b.path };
        });
        return { cost: top.cost + c.cost, path: [...top.path, line[i].candidates.indexOf(c)] };
      });
    }
    const win = best.reduce((a, b) => (b.cost < a.cost ? b : a));
    line.forEach((t, i) => (start[pos.get(t)!] = win.path[i]));
  }

  const queue: Array<{ idx: number[]; cost: number }> = [{ idx: start, cost: cost(start) }];
  const seen = new Set([start.join(",")]);
  for (let tries = 0; queue.length && tries < 400; tries++) {
    queue.sort((a, b) => a.cost - b.cost);
    const { idx } = queue.shift()!;
    const choice = choiceOf(idx);
    if (textOf(choice).every(rowParses)) return { choice, valid: true };
    idx.forEach((k, i) => {
      for (let alt = 0; alt < tokens[i].candidates.length; alt++) {
        if (alt === k) continue;
        const next = [...idx];
        next[i] = alt;
        const id = next.join(",");
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push({ idx: next, cost: cost(next) });
      }
    });
  }
  return { choice: choiceOf(start), valid: false };
}

/* ───────────── Entry point ───────────── */

export function recognizeInk(input: InkStroke[], opts: RecognizeOptions): InkResult | null {
  const raw = input.filter((s) => s.points.length > 0);
  if (raw.length === 0) return null;
  const boxes = raw.map((s) => ({ s, box: boxOf(s.points) }));
  const H = unitHeight(boxes);
  const strokes: S[] = boxes.map(({ s, box }) => ({
    id: s.id,
    pts: s.points,
    box,
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    flat: box.w >= 0.15 * H && box.h < 0.3 * box.w,
    tiny: Math.max(box.w, box.h) < 0.2 * H,
  }));

  const ctx: Ctx = {
    H,
    classify: opts.classify,
    overrides: opts.overrides ?? {},
    groupOf: new Map((opts.groups ?? []).flatMap((g, i) => g.map((id) => [id, i] as const))),
    tokens: [],
  };
  const rows = splitRows(strokes, H).map((r) => layout(r, ctx));
  const { tokens } = ctx;
  const { choice, valid } = bestReading(rows, tokens);

  for (const t of tokens) {
    const k = choice.get(t) ?? 0;
    t.symbol = t.candidates[k].symbol;
    const [a, b] = t.candidates;
    // Unsure: context overruled the picture, the best guess is under 60 %, or the
    // runner-up is within a factor of 3.
    t.uncertain = !t.fixed && (k > 0 || a.cost > 0.51 || (b !== undefined && b.cost - a.cost < Math.log(3)));
  }
  const pick: Choice = (t) => t.symbol;
  // Dots read as decimal points or "times" by position: show the tile that way too.
  const resolved = new Map<InkToken, Sym>();
  const out = rows.map((r) => render(r, pick, resolved));
  for (const [t, sym] of resolved) t.symbol = sym;
  const reading = flatten(rows);
  return {
    tokens: reading,
    layout: rows.map(toNodes),
    unit: H,
    ascii: out.map((o) => o.ascii).join("; "),
    latex: out.length > 1 ? `\\begin{cases}${out.map((o) => o.latex).join("\\\\")}\\end{cases}` : out[0].latex,
    box: unionBox(strokes.map((s) => s.box)),
    rows: rows.length,
    valid,
  };
}

/** Scores many stroke groups in one go (the handwriting API). Same order back. */
export type BatchClassifier = (groups: Array<{ strokes: Pt[][]; unit: number }>) => Promise<Candidate[][]>;

/** Scores already fetched, by stroke ids + line height: kept across re-reads of the same ink. */
export type ScoreCache = Map<string, Candidate[]>;

const NOT_YET: Candidate[] = [{ symbol: "?", cost: 20 }];

/**
 * recognizeInk with the network on a server. Which stroke groups get scored
 * depends only on where the strokes are, never on the scores, so one dry run
 * finds every group the reading needs, a single request scores them all, and
 * the second run reads with real scores. Fixes, splits and joins reuse the cache
 * and usually need no request at all.
 */
export async function recognizeInkAsync(
  input: InkStroke[],
  opts: Omit<RecognizeOptions, "classify"> & { classifyBatch: BatchClassifier; cache?: ScoreCache },
): Promise<InkResult | null> {
  const cache = opts.cache ?? new Map();
  const idOf = new Map(input.map((s) => [s.points, s.id]));
  const keyOf = (strokes: Pt[][], unit: number) => `${strokes.map((p) => idOf.get(p)).sort().join("+")}@${unit.toFixed(2)}`;
  for (let pass = 0; ; pass++) {
    const missing = new Map<string, { strokes: Pt[][]; unit: number }>();
    const classify: SymbolClassifier = (strokes, { unit }) => {
      const key = keyOf(strokes, unit);
      const hit = cache.get(key);
      if (hit) return hit;
      missing.set(key, { strokes, unit });
      return NOT_YET;
    };
    const result = recognizeInk(input, { ...opts, classify });
    if (missing.size === 0 || pass === 2) return result;
    const asked = [...missing];
    const scores = await opts.classifyBatch(asked.map(([, g]) => g));
    asked.forEach(([key], i) => cache.set(key, scores[i]));
  }
}

function toNodes(items: Item[]): InkNode[] {
  return items.map((it) =>
    it.kind === "frac"
      ? { kind: "frac", bar: it.bar.id, num: toNodes(it.num), den: toNodes(it.den), sup: toNodes(it.sup) }
      : { kind: "sym", key: it.token.key, sup: toNodes(it.sup) },
  );
}

/** Tokens in reading order (base, its exponent, numerator, denominator…). */
function flatten(rows: Item[][]): InkToken[] {
  const out: InkToken[] = [];
  const walk = (items: Item[]) => {
    for (const it of items) {
      if (it.kind === "frac") {
        walk(it.num);
        walk(it.den);
      } else {
        out.push(it.token);
      }
      walk(it.sup);
    }
  };
  rows.forEach(walk);
  return out;
}
