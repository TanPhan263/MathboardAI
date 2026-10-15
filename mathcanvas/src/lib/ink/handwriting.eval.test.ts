import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type ModelFile, SymbolNet } from "./model";
import { type InkStroke, recognizeInk } from "./recognize";

/*
 * Real-handwriting benchmark: MathWriting's held-out test split (writers and
 * expressions not used for training), filtered to maths this app handles.
 * Skipped when the dataset or model isn't on disk (see mathcanvas-api/ml/README.md).
 *
 *   MW_DIR=../mathcanvas-api/ml/data/mathwriting-2024 npx vitest run handwriting.eval
 */

const ROOT = path.resolve(__dirname, "../../..");
const MODEL = process.env.INK_MODEL ?? path.join(ROOT, "../mathcanvas-api/models/base.json");
const DIR = process.env.MW_DIR ? path.resolve(ROOT, process.env.MW_DIR) : path.join(ROOT, "../mathcanvas-api/ml/data/mathwriting-2024");
const SPLIT = path.join(DIR, process.env.MW_SPLIT ?? "test");
const ready = existsSync(MODEL) && existsSync(SPLIT);

const ALLOWED = /^(?:[0-9xyzabcnt+\-=<>()/.]|\\le|\\leq|\\ge|\\geq|\\cdot|\\frac|\^|\{|\})+$/;

/** Canonical LaTeX so ours and the dataset's compare fairly. */
export function canon(latex: string): string {
  return latex
    .replace(/\\leq?(?![a-z])/g, "≤")
    .replace(/\\geq?(?![a-z])/g, "≥")
    .replace(/\\cdot/g, "·")
    .replace(/\^\{([^{}])\}/g, "^$1")
    .replace(/\s+/g, "");
}

function readInk(file: string): { label: string; strokes: InkStroke[] } {
  const xml = readFileSync(file, "utf8");
  const label = /type="normalizedLabel">([^<]*)</.exec(xml)?.[1] ?? "";
  const strokes: InkStroke[] = [];
  for (const m of xml.matchAll(/<trace[^>]*>([^<]*)<\/trace>/g)) {
    const points = m[1]
      .trim()
      .split(",")
      .map((p) => p.trim().split(/\s+/).map(Number))
      .filter((v) => v.length >= 2)
      .map(([x, y]) => ({ x, y }));
    if (points.length) strokes.push({ id: `t${strokes.length}`, points });
  }
  return { label: label.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), strokes };
}

describe.skipIf(!ready)("handwriting on real test inks", () => {
  it("reads held-out handwriting", () => {
    const net = new SymbolNet(JSON.parse(readFileSync(MODEL, "utf8")) as ModelFile);
    const classify = net.classifier();
    const files = readdirSync(SPLIT).filter((f) => f.endsWith(".inkml"));
    let total = 0;
    let exact = 0;
    let symbolsRight = 0;
    let symbolsAll = 0;
    const misses: string[] = [];
    const why = { split: 0, symbol: 0, layout: 0 };
    const layoutMisses: string[] = [];
    const splitMisses: string[] = [];
    let stable = 0;
    let steady = 0;
    let seed = 1;
    const noise = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32 - 0.5;
    };
    for (const f of files) {
      const { label, strokes } = readInk(path.join(SPLIT, f));
      if (!ALLOWED.test(label) || label.includes("\\frac{}")) continue;
      const r = recognizeInk(strokes, { classify });
      if (!r) continue;
      total++;
      const want = canon(label);
      const got = canon(r.latex);
      // Stability: the same ink, smaller / bigger / elsewhere, must read the same.
      const moved = [
        { k: 0.5, dx: 300, dy: -120 },
        { k: 2, dx: -50, dy: 400 },
      ].every(({ k, dx, dy }) => {
        const t = strokes.map((s) => ({ id: s.id, points: s.points.map((p) => ({ x: p.x * k + dx, y: p.y * k + dy })) }));
        return canon(recognizeInk(t, { classify })!.latex) === got;
      });
      if (moved) stable++;
      // Steadiness: written again a little differently — each stroke nudged and gently
      // bent by up to ~3 % of the ink height — should read the same.
      const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
      const amp = 0.03 * (Math.max(...ys) - Math.min(...ys));
      const shaky = strokes.map((s) => {
        const [dx, dy, fx, fy, ph] = [noise() * amp, noise() * amp, noise() * amp, noise() * amp, noise() * 6];
        const n = Math.max(1, s.points.length - 1);
        return {
          id: s.id,
          points: s.points.map((p, i) => ({
            x: p.x + dx + fx * Math.sin((i / n) * Math.PI + ph),
            y: p.y + dy + fy * Math.sin((i / n) * Math.PI + ph),
          })),
        };
      });
      if (canon(recognizeInk(shaky, { classify })!.latex) === got) steady++;
      // Symbol accuracy where the split into symbols came out right.
      const wantSyms = [...want.replace(/\\frac|[{}^]/g, "")];
      const gotSyms = r.tokens.map((t) => t.symbol);
      if (want === got) exact++;
      else {
        if (misses.length < 25) misses.push(`${want}  →  ${got}`);
        if (wantSyms.length !== gotSyms.length) {
          why.split++;
          if (splitMisses.length < 30) splitMisses.push(`${wantSyms.join(" ")}  →  ${gotSyms.join(" ")}`);
        }
        else if (wantSyms.join("") !== gotSyms.join("")) why.symbol++;
        else {
          why.layout++;
          if (layoutMisses.length < 15) layoutMisses.push(`${want}  →  ${got}`);
        }
      }
      if (wantSyms.length === gotSyms.length) {
        symbolsAll += wantSyms.length;
        symbolsRight += wantSyms.filter((s, i) => s === gotSyms[i]).length;
      }
    }
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "–");
    console.log(
      [
        `expressions in scope: ${total}`,
        `exact match: ${exact} (${pct(exact, total)} %)`,
        `symbol accuracy (when segmented right): ${pct(symbolsRight, symbolsAll)} %`,
        `same reading when resized/moved: ${pct(stable, total)} %`,
        `same reading with a little extra wobble: ${pct(steady, total)} %`,
        `misses by cause: wrong split ${why.split}, wrong symbol ${why.symbol}, wrong layout ${why.layout}`,
        "split misses (symbols want → got):",
        ...splitMisses.map((m) => `  ${m}`),
        "layout misses:",
        ...layoutMisses.map((m) => `  ${m}`),
        "sample misses (want → got):",
        ...misses.map((m) => `  ${m}`),
      ].join("\n"),
    );
    expect(total).toBeGreaterThan(0);
  }, 600_000);
});
