import type { Pt, Sym } from "./symbols";

/**
 * Symbols the learner labelled by hand, sent to the handwriting API so it can
 * fine-tune a model on their handwriting. "∅" marks strokes the learner said are
 * not one symbol (a grouping they split or joined away), which teaches the
 * network where symbols start and end.
 *
 * Samples wait in this browser's outbox until the API has them, so a dropped
 * connection loses nothing.
 */
export type SampleLabel = Sym | "∅";

export type InkSample = {
  label: SampleLabel;
  /** Strokes relative to the symbol's top-left corner, in board units. */
  strokes: Array<Array<[number, number]>>;
  /** Typical symbol height in the line it came from (the network's size yardstick). */
  unit: number;
  /** When it was saved (ms since epoch). */
  at: number;
};

const KEY = "mathcanvas:ink-outbox:v1";
/** About 1 KB each: the cap keeps well inside the browser's storage quota. */
const MAX = 2000;

export function outbox(): InkSample[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as InkSample[]) : [];
  } catch {
    return [];
  }
}

export function setOutbox(samples: InkSample[]): void {
  try {
    if (samples.length) localStorage.setItem(KEY, JSON.stringify(samples.slice(-MAX)));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** One symbol's strokes, shifted to its corner and rounded to keep requests small. */
export function toSample(label: SampleLabel, strokes: Pt[][], unit: number): InkSample {
  const pts = strokes.flat();
  const x0 = Math.min(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    label,
    strokes: strokes.map((s) => s.map((p): [number, number] => [r(p.x - x0), r(p.y - y0)])),
    unit: r(unit),
    at: Date.now(),
  };
}
