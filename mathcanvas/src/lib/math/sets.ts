import { L } from "./lang";

/**
 * A real solution set as sorted, disjoint intervals. One model covers every
 * problem type: finite roots are closed points [r, r], "all reals" is
 * (−∞, ∞), "no solution" is the empty list.
 */
export type Interval = {
  lo: number;
  hi: number;
  loClosed: boolean;
  hiClosed: boolean;
  /** Exact LaTeX for the endpoints when known (e.g. "-2-\\sqrt{3}"). */
  loTex?: string;
  hiTex?: string;
};

export type SolutionSet = Interval[];

const TOL = 1e-7;
const close = (a: number, b: number) =>
  a === b ||
  (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b)));

export const ALL: SolutionSet = [{ lo: -Infinity, hi: Infinity, loClosed: false, hiClosed: false }];
export const NONE: SolutionSet = [];

export const points = (values: number[], tex?: string[]): SolutionSet =>
  values.map((v, i) => ({ lo: v, hi: v, loClosed: true, hiClosed: true, loTex: tex?.[i], hiTex: tex?.[i] }));

export function contains(set: SolutionSet, x: number): boolean {
  return set.some(
    (i) =>
      (x > i.lo || (i.loClosed && close(x, i.lo))) && (x < i.hi || (i.hiClosed && close(x, i.hi))),
  );
}

function sameInterval(a: Interval, b: Interval): boolean {
  const lo = close(a.lo, b.lo) && (a.lo === -Infinity || a.loClosed === b.loClosed);
  const hi = close(a.hi, b.hi) && (a.hi === Infinity || a.hiClosed === b.hiClosed);
  return lo && hi;
}

export function setsEqual(a: SolutionSet, b: SolutionSet): boolean {
  return a.length === b.length && a.every((iv, k) => sameInterval(iv, b[k]));
}

/** Probe points: every endpoint, just either side of it, and the gaps between. */
function probes(a: SolutionSet, b: SolutionSet): number[] {
  const ends = [...a, ...b]
    .flatMap((i) => [i.lo, i.hi])
    .filter(Number.isFinite)
    .sort((x, y) => x - y);
  if (ends.length === 0) return [0];
  const out: number[] = [ends[0] - 1, ends[ends.length - 1] + 1];
  ends.forEach((e, k) => {
    out.push(e, e - 1e-4, e + 1e-4);
    if (k > 0) out.push((ends[k - 1] + e) / 2);
  });
  return out;
}

export function isSubset(sub: SolutionSet, sup: SolutionSet): boolean {
  return probes(sub, sup).every((x) => !contains(sub, x) || contains(sup, x));
}

const fmt = (n: number) => String(Number(n.toFixed(4)));

function endTex(i: Interval, side: "lo" | "hi"): string {
  const v = side === "lo" ? i.lo : i.hi;
  if (v === -Infinity) return "-\\infty";
  if (v === Infinity) return "\\infty";
  return (side === "lo" ? i.loTex : i.hiTex) ?? fmt(v);
}

/** LaTeX like (−∞, 2) ∪ (3, ∞), {2, 3}, ℝ or ∅. */
export function setLatex(set: SolutionSet): string {
  if (set.length === 0) return "\\varnothing";
  if (set.length === 1 && set[0].lo === -Infinity && set[0].hi === Infinity) return "\\mathbb{R}";
  const pts = set.filter((i) => i.lo === i.hi);
  if (pts.length === set.length) return `\\{${pts.map((i) => endTex(i, "lo")).join(",\\ ")}\\}`;
  return set
    .map((i) =>
      i.lo === i.hi
        ? `\\{${endTex(i, "lo")}\\}`
        : `${i.loClosed ? "[" : "("}${endTex(i, "lo")},\\ ${endTex(i, "hi")}${i.hiClosed ? "]" : ")"}`,
    )
    .join(" \\cup ");
}

/** Plain-language description for messages. */
export function describeSet(set: SolutionSet, v: string): string {
  if (set.length === 0) return L({ en: "no solutions", vi: "vô nghiệm" });
  if (set.length === 1 && set[0].lo === -Infinity && set[0].hi === Infinity) return L({ en: "every real number", vi: "mọi số thực" });
  return set
    .map((i) => {
      if (i.lo === i.hi) return `${v} = ${fmt(i.lo)}`;
      if (i.lo === -Infinity) return `${v} ${i.hiClosed ? "≤" : "<"} ${fmt(i.hi)}`;
      if (i.hi === Infinity) return `${v} ${i.loClosed ? "≥" : ">"} ${fmt(i.lo)}`;
      return `${fmt(i.lo)} ${i.loClosed ? "≤" : "<"} ${v} ${i.hiClosed ? "≤" : "<"} ${fmt(i.hi)}`;
    })
    .join(L({ en: " or ", vi: " hoặc " }));
}

/** Merge touching pieces into canonical form. */
export function normalizeSet(set: SolutionSet): SolutionSet {
  const sorted = [...set].sort((a, b) => a.lo - b.lo || Number(b.loClosed) - Number(a.loClosed));
  const out: SolutionSet = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && (iv.lo < last.hi || (close(iv.lo, last.hi) && (last.hiClosed || iv.loClosed)))) {
      if (iv.hi > last.hi || (close(iv.hi, last.hi) && iv.hiClosed)) {
        out[out.length - 1] = { ...last, hi: iv.hi, hiClosed: iv.hiClosed, hiTex: iv.hiTex };
      }
    } else out.push({ ...iv });
  }
  return out;
}
