import type { InkNode, InkResult, InkToken } from "./recognize";
import type { Pt, Sym } from "./symbols";

/**
 * Beautify keeps the learner's own handwriting and tidies it: shaky strokes are
 * smoothed, nearly straight ones made straight, and every symbol is resized and
 * set on one baseline with even spacing — exponents raised and smaller, fraction
 * bars level with the parts centred above and below. A small typesetter whose
 * "font" is the learner's ink.
 */

type Glyph = { ids: string[]; pts: Pt[][] };
type Laid = { w: number; asc: number; desc: number; draw(x: number, baseline: number, out: Map<string, Pt[]>): void };

/**
 * How a symbol sits on the line, in units of the line's symbol height. Letters
 * and digits: their height and how far they rise above the baseline. Operators:
 * their size (largest side, or width for − and =), centred on the maths axis.
 */
type Fit = { height: number; top: number } | { size: number; by: "side" | "width" };
const TALL: Fit = { height: 1, top: 1 };
const SMALL: Fit = { height: 0.62, top: 0.62 };
const FIT: Partial<Record<Sym, Fit>> = {
  a: SMALL, c: SMALL, n: SMALL, x: SMALL, z: SMALL,
  y: { height: 0.95, top: 0.62 },
  t: { height: 0.9, top: 0.9 },
  "(": { height: 1.25, top: 1.1 },
  ")": { height: 1.25, top: 1.1 },
  "+": { size: 0.6, by: "side" },
  "<": { size: 0.6, by: "side" },
  ">": { size: 0.6, by: "side" },
  "≤": { size: 0.7, by: "side" },
  "≥": { size: 0.7, by: "side" },
  "-": { size: 0.55, by: "width" },
  "=": { size: 0.6, by: "width" },
};
const OPS = new Set<Sym>(["+", "-", "=", "<", ">", "≤", "≥", "·"]);
/** Height of the maths axis (where − and the fraction bar sit) above the baseline. */
const AXIS = 0.35;

export function neaten(result: InkResult, strokes: Map<string, Pt[]>): Map<string, Pt[]> {
  const byKey = new Map(result.tokens.map((t) => [t.key, t]));
  const H = lineHeight(result, byKey);
  const out = new Map<string, Pt[]>();

  const glyph = (ids: string[]): Glyph => ({ ids, pts: ids.map((id) => tidy(strokes.get(id) ?? [], H)) });

  function sym(node: Extract<InkNode, { kind: "sym" }>, h: number): Laid {
    const token = byKey.get(node.key)!;
    const g = glyph(token.strokeIds);
    const b = bounds(g.pts.flat());
    const symbol = token.symbol;
    // Dots keep their size: scaling a speck up would make a blob.
    if (symbol === "." || symbol === "·") {
      const r = Math.min(Math.max(b.w, b.h), 0.12 * h);
      const lift = symbol === "·" ? AXIS * h : 0.05 * h;
      return place(g, b, r / Math.max(b.w, b.h, 1e-6), r, lift + r, -(lift), 0.12 * h);
    }
    const fit = FIT[symbol] ?? TALL;
    const want =
      "height" in fit ? (fit.height * h) / Math.max(b.h, 1e-6)
      : fit.by === "width" ? (fit.size * h) / Math.max(b.w, 1e-6)
      : (fit.size * h) / Math.max(b.w, b.h, 1e-6);
    // Never stretch a symbol wider than 1.3 lines (a long scrawled minus stays sane).
    const scale = Math.min(want, (1.3 * h) / Math.max(b.w, 1e-6));
    const hh = b.h * scale;
    // Letters and digits rest on the baseline (y and brackets dip below); operators centre on the axis.
    const top = "height" in fit ? (fit.top / fit.height) * hh : AXIS * h + hh / 2;
    const pad = OPS.has(symbol) ? 0.28 * h : 0.12 * h;
    return place(g, b, scale, b.w * scale, top, hh - top, pad);
  }

  /** Scale a glyph and report its box; `top` is how far it rises above the baseline. */
  function place(g: Glyph, b: Box, scale: number, w: number, top: number, desc: number, pad: number): Laid {
    return {
      w: w + 2 * pad,
      asc: top,
      desc: Math.max(0, desc),
      draw(x, baseline, sink) {
        g.ids.forEach((id, i) =>
          sink.set(id, g.pts[i].map((p) => ({ x: x + pad + (p.x - b.x) * scale, y: baseline - top + (p.y - b.y) * scale }))),
        );
      },
    };
  }

  function line(nodes: InkNode[], h: number): Laid {
    const parts: Array<{ laid: Laid; dy: number }> = [];
    for (const n of nodes) {
      parts.push({ laid: n.kind === "frac" ? frac(n, h) : sym(n, h), dy: 0 });
      if (n.sup.length) {
        // Exponents: smaller, tucked up against the base.
        const sup = line(n.sup, 0.6 * h);
        parts.push({ laid: sup, dy: -0.5 * h });
      }
    }
    const w = parts.reduce((s, p) => s + p.laid.w, 0);
    return {
      w,
      asc: Math.max(0, ...parts.map((p) => p.laid.asc - p.dy)),
      desc: Math.max(0, ...parts.map((p) => p.laid.desc + p.dy)),
      draw(x, baseline, sink) {
        let cx = x;
        for (const p of parts) {
          p.laid.draw(cx, baseline + p.dy, sink);
          cx += p.laid.w;
        }
      },
    };
  }

  function frac(node: Extract<InkNode, { kind: "frac" }>, h: number): Laid {
    const num = line(node.num, h);
    const den = line(node.den, h);
    const pad = 0.15 * h;
    const inner = Math.max(num.w, den.w) + 0.2 * h;
    const gap = 0.18 * h;
    return {
      w: inner + 2 * pad,
      asc: AXIS * h + gap + num.desc + num.asc,
      desc: Math.max(0, gap + den.asc + den.desc - AXIS * h),
      draw(x, baseline, sink) {
        const axis = baseline - AXIS * h;
        num.draw(x + pad + (inner - num.w) / 2, axis - gap - num.desc, sink);
        den.draw(x + pad + (inner - den.w) / 2, axis + gap + den.asc, sink);
        sink.set(node.bar, straight({ x: x + pad, y: axis }, { x: x + pad + inner, y: axis }));
      },
    };
  }

  // Each written line starts where it did, one line height apart at least.
  let lastBottom = -Infinity;
  for (const nodes of result.layout) {
    const ids = collect(nodes, byKey);
    const orig = bounds(ids.flatMap((id) => strokes.get(id) ?? []));
    const laid = line(nodes, H);
    const baseline = Math.max(orig.y + laid.asc, lastBottom + 0.5 * H + laid.asc);
    laid.draw(orig.x, baseline, out);
    lastBottom = baseline + laid.desc;
  }
  // Anything the layout didn't place stays as written.
  for (const [id, pts] of strokes) if (!out.has(id)) out.set(id, pts);
  return out;
}

type Box = { x: number; y: number; w: number; h: number };

/** How tall the learner wrote a digit on the main line: the size to keep. */
function lineHeight(result: InkResult, byKey: Map<string, InkToken>): number {
  const tall = new Set<Sym>(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "b", "t", "(", ")"]);
  const hs = result.layout
    .flat()
    .flatMap((n) => (n.kind === "sym" ? [byKey.get(n.key)!] : []))
    .filter((t) => tall.has(t.symbol))
    .map((t) => (t.symbol === "(" || t.symbol === ")" ? t.box.h / 1.25 : t.box.h))
    .sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length / 2)] : 1.2 * result.unit;
}

function bounds(pts: Pt[]): Box {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) [x0, y0, x1, y1] = [Math.min(x0, p.x), Math.min(y0, p.y), Math.max(x1, p.x), Math.max(y1, p.y)];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function collect(nodes: InkNode[], byKey: Map<string, { strokeIds: string[] }>): string[] {
  return nodes.flatMap((n) => [
    ...(n.kind === "frac" ? [n.bar, ...collect(n.num, byKey), ...collect(n.den, byKey)] : (byKey.get(n.key)?.strokeIds ?? [])),
    ...collect(n.sup, byKey),
  ]);
}

const straight = (a: Pt, b: Pt): Pt[] => Array.from({ length: 9 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }));

/** Even spacing, a gentle smoothing pass, and ruler-straight lines where the pen meant one. */
export function tidy(pts: Pt[], H: number): Pt[] {
  if (pts.length < 3) return pts;
  const even = resample(pts, Math.max(H / 24, 0.5));
  const a = even[0];
  const b = even[even.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len > 0.15 * H) {
    const off = Math.max(...even.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len));
    if (off < 0.07 * len) {
      // Nearly level dashes (−, =, bars) become level; nearly upright strokes (1) upright.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dy) < 0.2 * Math.abs(dx)) {
        const y = (a.y + b.y) / 2;
        return straight({ x: a.x, y }, { x: b.x, y });
      }
      if (Math.abs(dx) < 0.12 * Math.abs(dy)) {
        const x = (a.x + b.x) / 2;
        return straight({ x, y: a.y }, { x, y: b.y });
      }
      return straight(a, b);
    }
  }
  // Moving average; the ends stay put so strokes still meet where they did.
  return even.map((p, i) => {
    if (i < 2 || i > even.length - 3) return p;
    const w = even.slice(i - 2, i + 3);
    return { x: w.reduce((s, q) => s + q.x, 0) / 5, y: w.reduce((s, q) => s + q.y, 0) / 5 };
  });
}

function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = [pts[i - 1].x, pts[i - 1].y];
    const { x: bx, y: by } = pts[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      [ax, ay] = [ax + (bx - ax) * t, ay + (by - ay) * t];
      out.push({ x: ax, y: ay });
      seg = Math.hypot(bx - ax, by - ay);
      carry = 0;
    }
    carry += seg;
  }
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
