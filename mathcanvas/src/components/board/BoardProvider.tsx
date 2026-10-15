"use client";

import {
  type ReactNode,
  type RefObject,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { historyReducer, initialHistory } from "@/lib/board/history";
import { MATH_SIZE, boundsOf, clampZoom, screenToWorld } from "@/lib/board/geometry";
import { HOME_CAMERA, loadBoard, saveBoard, uid } from "@/lib/board/storage";
import type {
  BoardObject,
  Camera,
  MathObject,
  MathRole,
  ObjectPatch,
  Tool,
} from "@/lib/board/types";
import type { ValidationStatus } from "@/lib/math/types";

/** Theme-aware pens: CSS variables, so ink stays readable in light and dark mode. */
export const PALETTE = [
  { value: "var(--pen-ink)", name: "Ink" },
  { value: "var(--pen-violet)", name: "Violet" },
  { value: "var(--pen-blue)", name: "Blue" },
  { value: "var(--pen-red)", name: "Red" },
  { value: "var(--pen-green)", name: "Green" },
  { value: "var(--pen-orange)", name: "Orange" },
] as const;
export const SIZES = [2, 4, 8] as const;

export interface BoardState {
  objects: BoardObject[];
  byId: ReadonlyMap<string, BoardObject>;
  selection: string[];
  tool: Tool;
  color: string;
  size: number;
  camera: Camera;
  canUndo: boolean;
  canRedo: boolean;
  /** Text object currently being typed into. */
  editingTextId: string | null;
  /** Short-lived message with an optional Undo. */
  /** `message` is a key in the "toast" messages. */
  toast: { id: number; message: "cleared"; undoable: boolean } | null;
}

export type NewMath = {
  latex: string;
  source: string;
  role?: MathRole;
  caption?: string;
  validation?: ValidationStatus;
  stepOf?: MathObject["stepOf"];
  ink?: MathObject["ink"];
  showInk?: boolean;
  neatInk?: MathObject["neatInk"];
  neat?: boolean;
  x?: number;
  y?: number;
  /** Select the new object (default true). */
  select?: boolean;
  /** false: part of a gesture started with checkpoint(). */
  record?: boolean;
};

export interface BoardActions {
  setTool(tool: Tool): void;
  setColor(color: string): void;
  setSize(size: number): void;
  select(ids: string[], opts?: { additive?: boolean }): void;
  add(objects: BoardObject[], opts?: { record?: boolean }): void;
  update(patches: Array<{ id: string; patch: ObjectPatch }>, opts?: { record?: boolean }): void;
  remove(ids: string[], opts?: { record?: boolean }): void;
  /** Start a gesture: later `record: false` edits undo as one step. */
  checkpoint(): void;
  undo(): void;
  redo(): void;
  clear(): void;
  addMath(input: NewMath): MathObject;
  setEditingText(id: string | null): void;
  dismissToast(): void;
  setCamera(camera: Camera): void;
  zoomBy(factor: number, anchor?: { x: number; y: number }): void;
  resetView(): void;
  /** Pan just enough that the object is on screen. */
  reveal(id: string): void;
  nextMathPosition(): { x: number; y: number };
}

export interface BoardMeta {
  svgRef: RefObject<SVGSVGElement | null>;
  /** Client → world coordinates using the live camera. */
  toWorld(clientX: number, clientY: number): { x: number; y: number };
}

interface BoardContextValue {
  state: BoardState;
  actions: BoardActions;
  meta: BoardMeta;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = use(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

type Saved = ReturnType<typeof loadBoard>;

/**
 * The only place that knows how board state is stored. Everything below talks
 * to the `{ state, actions, meta }` interface, so persistence or history could
 * change (e.g. to a server) without touching a single component.
 */
export function BoardProvider({ children }: { children: ReactNode }) {
  // The board is client-only (loaded with ssr: false), so reading storage in
  // lazy initialisers can't cause a hydration mismatch.
  const [saved] = useState<Saved>(() => loadBoard());
  const [history, dispatch] = useReducer(historyReducer, saved, (s) => ({
    ...initialHistory,
    objects: s.objects,
  }));
  const [camera, setCameraState] = useState<Camera>(saved.camera);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(PALETTE[0].value);
  const [size, setSize] = useState<number>(SIZES[1]);
  const [editingTextId, setEditingText] = useState<string | null>(null);
  const [toast, setToast] = useState<BoardState["toast"]>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Latest values for stable callbacks (no re-created handlers on each pan).
  const cameraRef = useRef(camera);
  const objectsRef = useRef(history.objects);
  useEffect(() => {
    cameraRef.current = camera;
    objectsRef.current = history.objects;
  });

  // Debounced autosave.
  useEffect(() => {
    const t = window.setTimeout(() => saveBoard(history.objects, camera), 500);
    return () => window.clearTimeout(t);
  }, [history.objects, camera]);

  const byId = useMemo(
    () => new Map(history.objects.map((o) => [o.id, o] as const)),
    [history.objects],
  );

  // Drop selection entries for objects that no longer exist (derived, no effect).
  const liveSelection = useMemo(
    () => selection.filter((id) => byId.has(id)),
    [selection, byId],
  );

  const viewport = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 1000, h: r?.height ?? 700, left: r?.left ?? 0, top: r?.top ?? 0 };
  }, []);

  const toWorld = useCallback<BoardMeta["toWorld"]>(
    (cx, cy) => {
      const v = viewport();
      return screenToWorld(cameraRef.current, cx - v.left, cy - v.top);
    },
    [viewport],
  );

  const actions = useMemo<BoardActions>(
    () => ({
      setTool,
      setColor,
      setSize,
      select(ids, opts) {
        setSelection((prev) =>
          opts?.additive ? [...new Set([...prev, ...ids])] : ids,
        );
      },
      add: (objects, opts) => dispatch({ type: "add", objects, record: opts?.record }),
      update: (patches, opts) => dispatch({ type: "update", patches, record: opts?.record }),
      remove: (ids, opts) => dispatch({ type: "remove", ids, record: opts?.record }),
      checkpoint: () => dispatch({ type: "checkpoint" }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      clear() {
        if (objectsRef.current.length === 0) return;
        dispatch({ type: "clear" });
        setSelection([]);
        setToast({ id: Date.now(), message: "cleared", undoable: true });
      },
      dismissToast: () => setToast(null),
      addMath(input) {
        const pos = input.x !== undefined && input.y !== undefined
          ? { x: input.x, y: input.y }
          : nextPosition();
        const obj: MathObject = {
          id: uid("m"),
          type: "math",
          x: pos.x,
          y: pos.y,
          latex: input.latex,
          source: input.source,
          role: input.role ?? "problem",
          caption: input.caption,
          validation: input.validation,
          stepOf: input.stepOf,
          ink: input.ink,
          showInk: input.showInk,
          neatInk: input.neatInk,
          neat: input.neat,
        };
        dispatch({ type: "add", objects: [obj], record: input.record });
        if (input.select !== false) setSelection([obj.id]);
        return obj;
      },
      setEditingText,
      setCamera: setCameraState,
      zoomBy(factor, anchor) {
        const cam = cameraRef.current;
        const v = viewport();
        const a = anchor ?? { x: v.w / 2, y: v.h / 2 };
        const z = clampZoom(cam.z * factor);
        const k = z / cam.z;
        setCameraState({ z, x: a.x - (a.x - cam.x) * k, y: a.y - (a.y - cam.y) * k });
      },
      resetView: () => setCameraState(HOME_CAMERA),
      reveal(id) {
        // Callers usually add the object in the same tick (sometimes inside a
        // transition), so wait until our "latest objects" ref has caught up.
        let tries = 0;
        const attempt = () => {
          const o = objectsRef.current.find((x) => x.id === id);
          if (!o) {
            if (++tries < 30) requestAnimationFrame(attempt);
            return;
          }
          const cam = cameraRef.current;
          const v = viewport();
          const b = boundsOf(o);
          const margin = 48;
          const left = b.x * cam.z + cam.x;
          const top = b.y * cam.z + cam.y;
          const right = left + b.w * cam.z;
          const bottom = top + b.h * cam.z;
          let { x, y } = cam;
          if (right > v.w - margin) x -= right - (v.w - margin);
          if (left + (x - cam.x) < margin + 56) x = cam.x + (margin + 56 - left); // left edge wins; clear the toolbar
          if (bottom > v.h - margin) y -= bottom - (v.h - margin);
          if (top + (y - cam.y) < margin) y = cam.y + (margin - top);
          if (x !== cam.x || y !== cam.y) setCameraState({ ...cam, x, y });
        };
        requestAnimationFrame(attempt);
      },
      nextMathPosition: () => nextPosition(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nextPosition reads refs only
    [viewport],
  );

  function nextPosition(): { x: number; y: number } {
    const cam = cameraRef.current;
    const v = viewport();
    const left = -cam.x / cam.z;
    const top = -cam.y / cam.z;
    const maths = objectsRef.current.filter((o): o is MathObject => o.type === "math");
    if (maths.length === 0) return { x: left + 140 / cam.z, y: top + 140 / cam.z };
    const lowest = maths.reduce((a, b) => (b.y > a.y ? b : a));
    const anchor = [...maths].reverse().find((m) => m.role !== "step") ?? lowest;
    // Below the lowest bottom edge: worded problems run to several rows.
    const y = Math.max(...maths.map((m) => {
      const b = boundsOf(m);
      return b.y + b.h;
    })) + 24;
    // Stay inside the viewport horizontally.
    const x = Math.min(Math.max(anchor.x, left + 40 / cam.z), left + (v.w - MATH_SIZE.w) / cam.z);
    return { x, y };
  }

  const state = useMemo<BoardState>(
    () => ({
      objects: history.objects,
      byId,
      selection: liveSelection,
      tool,
      color,
      size,
      camera,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      editingTextId,
      toast,
    }),
    [history, byId, liveSelection, tool, color, size, camera, editingTextId, toast],
  );

  const meta = useMemo<BoardMeta>(() => ({ svgRef, toWorld }), [toWorld]);
  const value = useMemo(() => ({ state, actions, meta }), [state, actions, meta]);

  return <BoardContext value={value}>{children}</BoardContext>;
}
