/**
 * Language of the explanations the solver writes (steps, hints, messages).
 * The board sets it from the page's locale; tests and the API default to English.
 *
 * Solver text is built from the numbers of each problem, so the Vietnamese and
 * English versions sit side by side in the code (`L({ en, vi })`) instead of in
 * message files: one glance shows both, and a missing translation is a type error.
 */
export type MathLang = "en" | "vi";

let current: MathLang = "en";

export function setMathLang(lang: MathLang): void {
  current = lang;
}

export function mathLang(): MathLang {
  return current;
}

/** The sentence in the board's language. */
export const L = (text: { en: string; vi: string }): string => text[current];
