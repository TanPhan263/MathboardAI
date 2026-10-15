import { describe, expect, it } from "vitest";
import { graphHandles, moveHandle } from "./graphEdit";
import { solutionSetOf } from "./solutionset";
import { solveProblem } from "./solve";
import { analyzeSystem } from "./system";

/** The solution set as plain numbers / intervals, for comparing. */
function solutions(source: string) {
  const s = solutionSetOf(source);
  if (!s.ok) throw new Error(`${source}: ${s.message}`);
  return s.set.map((i) => (i.lo === i.hi ? i.lo : [i.lo, i.hi]));
}

describe("dragging a graph rewrites the problem", () => {
  it("moves the solution of a linear equation, changing only the number", () => {
    const h = graphHandles("2*x+3 = 7");
    expect(h).toEqual([{ kind: "root", index: 0, x: 2, y: 0 }]);
    const e = moveHandle("2*x+3 = 7", h[0], { x: 4.1, y: 0.7 })!;
    expect(e.source).toBe("2*x+3 = 11");
    expect(e.latex).toContain("= 11");
    expect(solutions(e.source)).toEqual([4]);
    expect(solveProblem(e.source).ok).toBe(true);
  });

  it("keeps the other solution of a quadratic where it was", () => {
    const src = "x^2-5*x+6 = 0"; // solutions 2 and 3
    const [r2, r3] = graphHandles(src).filter((h) => h.kind === "root");
    expect([r2.x, r3.x]).toEqual([2, 3]);
    const e = moveHandle(src, r2, { x: -1, y: 0 })!;
    expect(e.source).toBe("x^2-2*x-3 = 0");
    expect(solutions(e.source)).toEqual([-1, 3]);
  });

  it("moves a parabola's turning point, which can take the solutions away", () => {
    const src = "x^2-4 = 0";
    const v = graphHandles(src).find((h) => h.kind === "vertex")!;
    expect(v).toMatchObject({ x: 0, y: -4 });
    const e = moveHandle(src, v, { x: 1, y: 2 })!;
    expect(e.source).toBe("x^2-2*x+3 = 0");
    expect(solutions(e.source)).toEqual([]); // no real solutions: still a valid problem
    expect(solveProblem(e.source).ok).toBe(true);
  });

  it("drags an inequality's boundary and keeps its direction", () => {
    const src = "3*x-1 <= 8"; // x ≤ 3
    const e = moveHandle(src, graphHandles(src)[0], { x: 5, y: 0 })!;
    expect(e.source).toBe("3*x-1 <= 14");
    expect(solutions(e.source)).toEqual([[-Infinity, 5]]);
  });

  it("puts a new x-term on the side that has x, when the other side is a number", () => {
    const src = "x^2+x = 6"; // −3, 2
    const root = graphHandles(src).find((h) => h.kind === "root" && h.x === 2)!;
    const e = moveHandle(src, root, { x: 1, y: 0 })!;
    expect(e.source).toBe("x^2+2*x = 3");
    expect(solutions(e.source)).toEqual([-3, 1]);
  });

  it("snaps to half units so the numbers stay exact", () => {
    const e = moveHandle("2*x+3 = 7", { kind: "root", index: 0, x: 2, y: 0 }, { x: 1.4, y: 0 })!;
    expect(solutions(e.source)).toEqual([1.5]);
  });

  it("moves where a system's lines cross; each line keeps its slope", () => {
    const src = "x + y = 5; x - y = 1"; // (3, 2)
    const [p] = graphHandles(src);
    expect(p).toMatchObject({ kind: "point", x: 3, y: 2 });
    const e = moveHandle(src, p, { x: 1, y: 4 })!;
    expect(e.source).toBe("x + y = 5; x - y = -3");
    const sa = analyzeSystem(e.source);
    expect(sa.ok).toBe(true);
    expect(solveProblem(e.source).ok).toBe(true);
    expect(graphHandles(e.source)).toEqual([{ kind: "point", x: 1, y: 4 }]);
  });

  it("returns nothing when the snapped spot is where it already was", () => {
    expect(moveHandle("2*x+3 = 7", graphHandles("2*x+3 = 7")[0], { x: 2.1, y: 0 })).toBeNull();
  });

  it("offers no handles on equations it can't rewrite safely", () => {
    expect(graphHandles("1/x = 2")).toEqual([]);
  });
});
