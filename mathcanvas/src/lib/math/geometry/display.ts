import { normalizeInput, toTex } from "../polynomial";

/** Text for \text{…}: escape what LaTeX would read as commands. */
const escapeText = (s: string) =>
  s.replace(/[\\{}$&#%_^~]/g, (c) =>
    c === "\\" ? "\\textbackslash{}" : c === "^" ? "\\textasciicircum{}" : c === "~" ? "\\textasciitilde{}" : `\\${c}`,
  );
/** Symbols inside words become maths: ⊥, ∥, √2, 60°. */
const inlineMath = (s: string) =>
  s
    .replace(/(?:vectơ|vecto|vector)\s+([A-Z][0-9']*[A-Z][0-9']*|0)(?![\p{L}\d])/gu, "$\\overrightarrow{$1}$")
    .replace(/sqrt\s*\(?(\d+(?:\.\d+)?)\)?/g, "$\\sqrt{$1}$")
    .replace(/⊥/g, "$\\perp$")
    .replace(/\/\/|∥/g, "$\\parallel$")
    .replace(/°/g, "$^\\circ$");
const text = (s: string) => (s.trim() ? `\\text{${inlineMath(escapeText(s))}}` : "");

/** A long sentence without equations, cut at commas into rows of about 56 characters. */
function wrap(line: string): string[] {
  if (line.length <= 64 || /:\s*[^:]*=/.test(line)) return [line];
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of line) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    cur += ch;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    }
  }
  if (cur) parts.push(cur);
  const rows: string[] = [];
  for (const p of parts) {
    // Join while the row stays short — and never leave a stub like “Tính BC,” on its own.
    const last = rows[rows.length - 1];
    if (last !== undefined && (last.length + p.length <= 60 || last.length < 24)) rows[rows.length - 1] += p;
    else rows.push(p.replace(/^\s+/, ""));
  }
  return rows.flatMap(words);
}

/** A row still too long (no commas to break at): break between words, outside brackets. */
function words(row: string): string[] {
  if (row.length <= 72) return [row];
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let word = "";
  const flush = () => {
    if (cur && cur.length + word.length > 60 && cur.length >= 24) {
      out.push(cur.trimEnd());
      cur = word.trimStart();
    } else cur += word;
    word = "";
  };
  for (const ch of row) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0) flush();
    word += ch;
  }
  flush();
  if (cur.trim()) out.push(cur.trim());
  // No stub row like “= 0.” at the end.
  if (out.length > 1 && out[out.length - 1].length < 20) out[out.length - 2] += ` ${out.pop()}`;
  return out;
}

/** “x = 1 + 2t, y = 2 − t, z = 3t” as cases; “a = b = c” and plain equations as they are. */
function equationTex(eq: string): string {
  const coords = eq.split(",").map((p) => p.trim());
  if (coords.length > 1 && coords.every((p) => /^[xyz]\s*=/.test(p))) {
    return `\\begin{cases}${coords.map((p) => p.split("=").map((side) => toTex(side.trim())).join(" = ")).join("\\\\")}\\end{cases}`;
  }
  return eq
    .split("=")
    .map((side) => toTex(side.trim()))
    .join(" = ");
}

/** Points and vectors with their coordinates as maths, the words around them as text. */
function inlineTex(s: string): string {
  const decl = /(?<![\p{L}\d'])([A-Z][0-9']*|[a-wΔ][0-9']*)\s*(=?)\s*\(([^()]*[;,][^()]*)\)/gu;
  let out = "";
  let last = 0;
  for (const m of s.matchAll(decl)) {
    const parts = m[3].split(/[;,]/).map((p) => p.trim());
    if (!parts.every((p) => /^-?[\d./]+$/.test(p.replace(/(\d),(\d)/g, "$1.$2")))) continue;
    out += text(s.slice(last, m.index));
    const sep = m[3].includes(";") ? ";\\ " : ",\\ ";
    out += `${m[1]}${m[2] ? " = " : ""}\\left(${parts.map((p) => toTex(p)).join(sep)}\\right)`;
    last = m.index! + m[0].length;
  }
  return out + text(s.slice(last));
}

/** Characters of plain text after which an equation starts a new row. */
const ROW = 44;

/**
 * One sentence as rows of LaTeX. A named equation after a long run of words
 * (“…tangent to (P): 2x + 2y − z + 3 = 0”) moves to its own row, so problems
 * stay a readable width on the board.
 */
function lineRows(line: string): string[] {
  const pieces = line.split(/\s+(và|and)\s+(?=(?:\([^()]+\)|[a-zΔ][0-9']*)\s*:)/u);
  const rows: string[][] = [[]];
  let used = 0;
  const add = (tex: string, plain: string, breakBefore: boolean) => {
    if (breakBefore && used > ROW) {
      rows.push([]);
      used = 0;
    }
    if (tex) rows[rows.length - 1].push(tex);
    used += plain.length;
  };
  for (let i = 0; i < pieces.length; i += 2) {
    if (i > 0) add(text(` ${pieces[i - 1]} `), pieces[i - 1], true);
    const seg = pieces[i];
    const named = seg.match(/^(.*?)(\([^()]+\)|(?<![\p{L}\d])[a-zA-ZΔαβγ][0-9']*)\s*(?::|có phương trình|có pt|with equation|has equation)\s*(.*=.*)$/u);
    if (named && /[xyz]/.test(named[3])) {
      add(inlineTex(named[1]), named[1], false);
      add(`${named[2].replace(/Δ/g, "\\Delta ").replace(/α/g, "\\alpha ")}\\colon ${equationTex(named[3])}`, named[3], true);
    } else {
      add(inlineTex(seg), seg, false);
    }
  }
  return rows.map((r) => r.join("")).filter(Boolean);
}

/**
 * LaTeX for a typed geometry problem: one line per sentence, coordinates and
 * equations typeset, words kept as text.
 */
export function geometryLatex(raw: string): string {
  const s = normalizeInput(raw.normalize("NFC").replace(/\r?\n/g, " \n "));
  const lines: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    const stop = depth === 0 && ((ch === "." && /\s/.test(s[i + 1] ?? " ")) || ch === "\n");
    if (stop) {
      if (ch === ".") cur += ".";
      if (cur.trim()) lines.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) lines.push(cur.trim());
  try {
    const tex = lines.flatMap(wrap).flatMap(lineRows);
    return tex.length === 1 ? tex[0] : `\\begin{array}{l}${tex.join("\\\\")}\\end{array}`;
  } catch {
    return text(raw);
  }
}
