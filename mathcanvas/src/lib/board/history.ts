import type { BoardObject, ObjectPatch } from "./types";

const MAX_HISTORY = 100;

export type HistoryState = {
  objects: BoardObject[];
  past: BoardObject[][];
  future: BoardObject[][];
};

export type HistoryAction =
  | { type: "load"; objects: BoardObject[] }
  /** Snapshot the current board so the *next* un-recorded edits undo as one. */
  | { type: "checkpoint" }
  | { type: "add"; objects: BoardObject[]; record?: boolean }
  | { type: "update"; patches: Array<{ id: string; patch: ObjectPatch }>; record?: boolean }
  | { type: "remove"; ids: string[]; record?: boolean }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export const initialHistory: HistoryState = { objects: [], past: [], future: [] };

function push(state: HistoryState): Pick<HistoryState, "past" | "future"> {
  return { past: [...state.past, state.objects].slice(-MAX_HISTORY), future: [] };
}

/**
 * Snapshot-based undo. Objects are replaced, never mutated, so a snapshot is
 * just a reference — cheap even for large boards.
 */
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "load":
      return { objects: action.objects, past: [], future: [] };
    case "checkpoint":
      return { ...state, ...push(state) };
    case "add": {
      const base = action.record === false ? state : { ...state, ...push(state) };
      return { ...base, objects: [...state.objects, ...action.objects] };
    }
    case "update": {
      const byId = new Map(action.patches.map((p) => [p.id, p.patch]));
      const base = action.record === false ? state : { ...state, ...push(state) };
      return {
        ...base,
        objects: state.objects.map((o) =>
          byId.has(o.id) ? ({ ...o, ...byId.get(o.id) } as BoardObject) : o,
        ),
      };
    }
    case "remove": {
      const ids = new Set(action.ids);
      if (!state.objects.some((o) => ids.has(o.id))) return state;
      const base = action.record === false ? state : { ...state, ...push(state) };
      return { ...base, objects: state.objects.filter((o) => !ids.has(o.id)) };
    }
    case "clear":
      return state.objects.length === 0
        ? state
        : { objects: [], ...push(state) };
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return {
        objects: prev,
        past: state.past.slice(0, -1),
        future: [state.objects, ...state.future],
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { objects: next, past: [...state.past, state.objects], future: rest };
    }
  }
}
