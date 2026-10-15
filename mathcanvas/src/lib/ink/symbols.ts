/** Everything the handwriting reader can return, in the network's class order. */
export const SYMBOLS = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "x", "y", "z", "a", "b", "c", "n", "t",
  "+", "-", "=", "<", ">", "≤", "≥", "(", ")", "/", ".", "·",
  /** Something we don't handle yet (√, ∫, Greek…): forces a check instead of a wrong guess. */
  "?",
] as const;

export type Sym = (typeof SYMBOLS)[number];
export type Pt = { x: number; y: number };

export const DIGITS = new Set<Sym>(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
export const LETTERS = new Set<Sym>(["x", "y", "z", "a", "b", "c", "n", "t"]);
