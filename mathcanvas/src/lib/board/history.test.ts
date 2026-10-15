import { describe, expect, it } from "vitest";
import { type HistoryState, historyReducer, initialHistory } from "./history";
import type { BoardObject, MathObject } from "./types";

const math = (id: string, x = 0): MathObject => ({
  id,
  type: "math",
  x,
  y: 0,
  latex: "x=1",
  source: "x=1",
  role: "problem",
});

const run = (actions: Parameters<typeof historyReducer>[1][], from: HistoryState = initialHistory) =>
  actions.reduce(historyReducer, from);

describe("historyReducer", () => {
  it("undoes and redoes additions", () => {
    const added = run([{ type: "add", objects: [math("a")] }]);
    expect(added.objects).toHaveLength(1);
    const undone = historyReducer(added, { type: "undo" });
    expect(undone.objects).toHaveLength(0);
    expect(historyReducer(undone, { type: "redo" }).objects).toHaveLength(1);
  });

  it("a new edit clears the redo stack", () => {
    const s = run([
      { type: "add", objects: [math("a")] },
      { type: "undo" },
      { type: "add", objects: [math("b")] },
    ]);
    expect(s.future).toHaveLength(0);
  });

  it("collapses a drag (checkpoint + unrecorded updates) into one undo step", () => {
    let s = run([{ type: "add", objects: [math("a")] }]);
    s = run(
      [
        { type: "checkpoint" },
        { type: "update", patches: [{ id: "a", patch: { x: 10 } }], record: false },
        { type: "update", patches: [{ id: "a", patch: { x: 20 } }], record: false },
        { type: "update", patches: [{ id: "a", patch: { x: 30 } }], record: false },
      ],
      s,
    );
    expect(s.objects[0].x).toBe(30);
    expect(historyReducer(s, { type: "undo" }).objects[0].x).toBe(0);
  });

  it("does not push history for a no-op removal", () => {
    const s = run([{ type: "add", objects: [math("a")] }]);
    expect(historyReducer(s, { type: "remove", ids: ["nope"] })).toBe(s);
  });

  it("never mutates earlier snapshots", () => {
    const s1 = run([{ type: "add", objects: [math("a")] }]);
    const before: BoardObject[] = s1.objects;
    const s2 = historyReducer(s1, { type: "update", patches: [{ id: "a", patch: { x: 99 } }] });
    expect(before[0].x).toBe(0);
    expect(s2.past.at(-1)).toBe(before);
  });

  it("clear is undoable", () => {
    const s = run([{ type: "add", objects: [math("a"), math("b")] }, { type: "clear" }]);
    expect(s.objects).toHaveLength(0);
    expect(historyReducer(s, { type: "undo" }).objects).toHaveLength(2);
  });
});
