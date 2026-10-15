import { describe, expect, it } from "vitest";
import { neaten, tidy } from "./neaten";
import type { InkNode, InkResult, InkToken } from "./recognize";
import type { Pt, Sym } from "./symbols";

/** A wobbly hand-drawn zig-zag filling a box, standing in for one symbol. */
function scrawl(x: number, y: number, w: number, h: number): Pt[] {
  return Array.from({ length: 30 }, (_, i) => ({
    x: x + (w * i) / 29 + Math.sin(i * 1.7) * 0.03 * w,
    y: y + (i % 2 ? h : 0) + Math.cos(i) * 0.02 * h,
  }));
}

function ink(glyphs: Array<{ sym: Sym; box: [number, number, number, number] }>, layout: (keys: string[]) => InkNode[]) {
  const strokes = new Map<string, Pt[]>();
  const tokens: InkToken[] = glyphs.map(({ sym, box: [x, y, w, h] }, i) => {
    strokes.set(`s${i}`, scrawl(x, y, w, h));
    return { key: `s${i}`, strokeIds: [`s${i}`], box: { x, y, w, h }, candidates: [{ symbol: sym, cost: 0 }], symbol: sym, uncertain: false, fixed: false };
  });
  const result: InkResult = {
    tokens,
    layout: [layout(tokens.map((t) => t.key))],
    unit: 40,
    latex: "",
    ascii: "",
    box: { x: 0, y: 0, w: 400, h: 100 },
    rows: 1,
    valid: true,
  };
  return { result, strokes };
}

function box(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const flat = (keys: string[]): InkNode[] => keys.map((key) => ({ kind: "sym", key, sup: [] }));

describe("Beautify (neaten)", () => {
  it("sets a messy line on one baseline, evenly spaced, without overlaps", () => {
    // "2x=4", written drifting downhill with uneven sizes.
    const { result, strokes } = ink(
      [
        { sym: "2", box: [0, 0, 30, 50] },
        { sym: "x", box: [45, 30, 40, 38] },
        { sym: "=", box: [100, 30, 30, 20] },
        { sym: "4", box: [150, 22, 34, 60] },
      ],
      flat,
    );
    const out = neaten(result, strokes);
    const [two, x, , four] = ["s0", "s1", "s2", "s3"].map((id) => box(out.get(id)!));
    expect(two.y1).toBeCloseTo(four.y1, 5);
    expect(x.y1).toBeCloseTo(four.y1, 5);
    expect(two.y1 - two.y0).toBeCloseTo(four.y1 - four.y0, 5);
    // Small letters are shorter than digits.
    expect(x.y1 - x.y0).toBeLessThan(0.75 * (four.y1 - four.y0));
    const boxes = ["s0", "s1", "s2", "s3"].map((id) => box(out.get(id)!));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x0).toBeGreaterThan(boxes[i - 1].x1);
  });

  it("keeps exponents raised and smaller", () => {
    const { result, strokes } = ink(
      [
        { sym: "x", box: [0, 20, 40, 40] },
        { sym: "2", box: [42, 0, 22, 30] },
      ],
      ([x, two]) => [{ kind: "sym", key: x, sup: [{ kind: "sym", key: two, sup: [] }] }],
    );
    const out = neaten(result, strokes);
    const base = box(out.get("s0")!);
    const sup = box(out.get("s1")!);
    expect(sup.y1).toBeLessThan(base.y1);
    expect(sup.x0).toBeGreaterThan(base.x1);
  });

  it("straightens a stroke that was meant to be a line", () => {
    const shaky = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 50 + Math.sin(i) * 1.5 }));
    const line = tidy(shaky, 40);
    const ys = line.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });
});
