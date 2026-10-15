import { features, render, SIZE } from "./raster";
import type { Candidate, SymbolClassifier } from "./recognize";
import { type Pt, SYMBOLS, type Sym } from "./symbols";

/**
 * The symbol network (trained in mathcanvas-api/ml/train.py; served by that API — the app no longer runs it, tests and benchmarks do) in plain TypeScript: a few small
 * convolutions and two dense layers, int8 weights. No ML runtime needed, and a
 * symbol takes well under a millisecond.
 */

type ConvSpec = { type: "conv"; cin: number; cout: number; w: string; scale: number[]; b: number[]; pool: boolean };
type DenseSpec = { type: "dense"; nin: number; nout: number; w: string; scale: number[]; b: number[]; relu: boolean };
export type ModelFile = { version: 1; classes: string[]; input: number; layers: Array<ConvSpec | DenseSpec>; meta?: Record<string, unknown> };

type Conv = { kind: "conv"; cin: number; cout: number; w: Float32Array; b: Float32Array; pool: boolean };
type Dense = { kind: "dense"; nin: number; nout: number; w: Float32Array; b: Float32Array; relu: boolean };

function decode(b64: string, rows: number, scale: number[]): Float32Array {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Float32Array(bin.length);
  const per = bin.length / rows;
  for (let i = 0; i < bin.length; i++) {
    const byte = bin.charCodeAt(i);
    out[i] = (byte > 127 ? byte - 256 : byte) * scale[Math.floor(i / per)];
  }
  return out;
}

export class SymbolNet {
  private layers: Array<Conv | Dense>;
  /** Network outputs: our symbols plus "∅" (not a symbol — used to choose the split). */
  readonly classes: string[];
  readonly meta: Record<string, unknown>;

  constructor(file: ModelFile) {
    if (file.version !== 1 || file.input !== SIZE) throw new Error("Unsupported handwriting model");
    const known = new Set<string>([...SYMBOLS, JUNK]);
    if (!file.classes.every((c) => known.has(c))) throw new Error("Handwriting model has unknown symbols");
    this.classes = file.classes;
    this.meta = file.meta ?? {};
    this.layers = file.layers.map((l) =>
      l.type === "conv"
        ? { kind: "conv", cin: l.cin, cout: l.cout, w: decode(l.w, l.cout, l.scale), b: Float32Array.from(l.b), pool: l.pool }
        : { kind: "dense", nin: l.nin, nout: l.nout, w: decode(l.w, l.nout, l.scale), b: Float32Array.from(l.b), relu: l.relu },
    );
  }

  /** Class probabilities for one symbol picture + its size features. */
  predict(image: Float32Array, extra: Float32Array): Float32Array {
    let x = image;
    let side = SIZE;
    let ch = 1;
    let flat: Float32Array | null = null;
    for (const l of this.layers) {
      if (l.kind === "conv") {
        x = conv3x3(x, side, l);
        ch = l.cout;
        if (l.pool) {
          x = maxPool2(x, ch, side);
          side /= 2;
        }
        continue;
      }
      if (!flat) {
        flat = new Float32Array(x.length + extra.length);
        flat.set(x);
        flat.set(extra, x.length);
        x = flat;
      }
      x = dense(x, l);
    }
    return softmax(x);
  }

  /**
   * @param views how many slightly slanted copies to average (1 = just the ink).
   * Averaging makes the answer steadier: one borderline stroke can't flip it.
   */
  classifier(views = Number(globalThis.process?.env?.INK_VIEWS ?? 3)): SymbolClassifier {
    const slants = [0, 0.12, -0.12].slice(0, Math.max(1, views));
    return (strokes, { unit }) => {
      const f = features(strokes, unit);
      let p: Float32Array | null = null;
      for (const k of slants) {
        const q = this.predict(render(k === 0 ? strokes : slant(strokes, k)), f);
        if (!p) p = q;
        else for (let i = 0; i < p.length; i++) p[i] += q[i];
      }
      p = p!.map((v) => v / slants.length);
      // "Not a symbol" never becomes a guess, but its share of the probability
      // raises every real symbol's cost — that is what steers the split.
      const ranked: Candidate[] = [];
      p.forEach((prob, i) => {
        if (this.classes[i] !== JUNK) ranked.push({ symbol: this.classes[i] as Sym, cost: -Math.log(Math.max(prob, 1e-6)) });
      });
      return ranked.sort((a, b) => a.cost - b.cost);
    };
  }
}

/** Lean the strokes by k (x shifts with height), around their middle. */
function slant(strokes: Pt[][], k: number): Pt[][] {
  let y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) [y0, y1] = [Math.min(y0, p.y), Math.max(y1, p.y)];
  const mid = (y0 + y1) / 2;
  return strokes.map((s) => s.map((p) => ({ x: p.x + k * (mid - p.y), y: p.y })));
}

function conv3x3(x: Float32Array, side: number, l: Conv): Float32Array {
  const { cin, cout, w, b } = l;
  const n = side * side;
  const out = new Float32Array(cout * n);
  for (let o = 0; o < cout; o++) {
    const acc = out.subarray(o * n, (o + 1) * n);
    acc.fill(b[o]);
    for (let i = 0; i < cin; i++) {
      const src = x.subarray(i * n, (i + 1) * n);
      const k = (o * cin + i) * 9;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const wv = w[k + ky * 3 + kx];
          if (wv === 0) continue;
          const dy = ky - 1;
          const dx = kx - 1;
          const r0 = Math.max(0, -dy);
          const r1 = Math.min(side, side - dy);
          const c0 = Math.max(0, -dx);
          const c1 = Math.min(side, side - dx);
          for (let r = r0; r < r1; r++) {
            const ro = r * side;
            const ri = (r + dy) * side + dx;
            for (let c = c0; c < c1; c++) acc[ro + c] += wv * src[ri + c];
          }
        }
      }
    }
    for (let j = 0; j < n; j++) if (acc[j] < 0) acc[j] = 0; // ReLU
  }
  return out;
}

function maxPool2(x: Float32Array, ch: number, side: number): Float32Array {
  const h = side / 2;
  const out = new Float32Array(ch * h * h);
  for (let c = 0; c < ch; c++) {
    const base = c * side * side;
    for (let r = 0; r < h; r++) {
      for (let q = 0; q < h; q++) {
        const i = base + 2 * r * side + 2 * q;
        out[c * h * h + r * h + q] = Math.max(x[i], x[i + 1], x[i + side], x[i + side + 1]);
      }
    }
  }
  return out;
}

function dense(x: Float32Array, l: Dense): Float32Array {
  const out = new Float32Array(l.nout);
  for (let o = 0; o < l.nout; o++) {
    let s = l.b[o];
    const row = o * l.nin;
    for (let i = 0; i < l.nin; i++) s += l.w[row + i] * x[i];
    out[o] = l.relu && s < 0 ? 0 : s;
  }
  return out;
}

function softmax(x: Float32Array): Float32Array {
  const m = Math.max(...x);
  const e = x.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

const JUNK = "∅";

let loading: Promise<SymbolNet> | null = null;

/** Fetch the model once per page; later callers share the same promise. */
export function loadSymbolNet(url = "/models/symbols-v1.json"): Promise<SymbolNet> {
  loading ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Handwriting model missing (${r.status})`);
      return r.json() as Promise<ModelFile>;
    })
    .then((f) => new SymbolNet(f))
    .catch((e) => {
      loading = null; // allow a retry
      throw e;
    });
  return loading;
}
