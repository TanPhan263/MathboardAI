"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { uid } from "@/lib/board/storage";
import type { BoardObject, Camera, GraphObject, ShapeObject, StrokeObject, Tool } from "@/lib/board/types";
import type { GraphHandle } from "@/lib/math/graphEdit";
import { InkOverlay } from "@/components/ink/InkPanel";
import { boundsOf } from "@/lib/board/geometry";
import { useInk } from "@/components/ink/InkProvider";
import { useTranslations } from "next-intl";
import { useBoard } from "./BoardProvider";
import { ObjectView, TextEditor, graphPoint, graphSnap } from "./objects";
import { DEFAULT_VIEW } from "./SpaceView";

type Gesture =
  | { kind: "pan"; startX: number; startY: number; camera: Camera }
  /** Turning a 3-D figure: horizontal drag spins it, vertical drag tilts it. */
  | { kind: "orbit"; id: string; startX: number; startY: number; view0: { yaw: number; pitch: number } }
  | { kind: "draw"; origin: { x: number; y: number }; id: string }
  | { kind: "shape"; origin: { x: number; y: number }; id: string }
  | { kind: "erase" }
  | { kind: "area"; origin: { x: number; y: number } }
  | {
      kind: "resize";
      /** Object id, or "ink" for the handwriting being read. */
      id: string;
      start: { x: number; y: number };
      /** Size on screen when the drag started, in world units. */
      w0: number;
      h0: number;
      from: BoardObject | null;
      moved: boolean;
    }
  | {
      kind: "move";
      start: { x: number; y: number };
      origins: Map<string, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      /**
       * Dragging a point on a graph. The graph previews the rewritten problem;
       * the problem itself changes only when the learner presses Apply.
       */
      kind: "graph";
      graph: GraphObject;
      handle: GraphHandle;
      /** Problem text the drag started from, and the one last previewed. */
      from: string;
      last: string;
      /** Latest pointer position in graph units, drawn once per frame. */
      at: { x: number; y: number } | null;
      frame: number | null;
      moved: boolean;
    };

/** Comfortably inside the picture: not within 6 % of an edge. */
function inView(p: { x: number; y: number }, [x0, x1]: [number, number], [y0, y1]: [number, number]) {
  const mx = (x1 - x0) * 0.06;
  const my = (y1 - y0) * 0.06;
  return p.x > x0 + mx && p.x < x1 - mx && p.y > y0 + my && p.y < y1 - my;
}

/** The graph maths, loaded with the first graph (it is already in memory by then). */
type GraphLibs = { moveHandle: typeof import("@/lib/math/graphEdit").moveHandle; graphFor: typeof import("@/lib/math/graph").graphFor };
let graphLibs: GraphLibs | null = null;
const loadGraphLibs = () =>
  Promise.all([import("@/lib/math/graphEdit"), import("@/lib/math/graph")]).then(([e, g]) => {
    graphLibs = { moveHandle: e.moveHandle, graphFor: g.graphFor };
  });

const CURSORS: Record<Tool, string> = {
  select: "default",
  hand: "grab",
  pen: "crosshair",
  area: "crosshair",
  eraser: "cell",
  text: "text",
  line: "crosshair",
  rect: "crosshair",
  ellipse: "crosshair",
};

const SHAPE_TOOLS: Partial<Record<Tool, ShapeObject["kind"]>> = {
  line: "line",
  rect: "rect",
  ellipse: "ellipse",
};

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true'], math-field");
};

export function Whiteboard() {
  const t = useTranslations("board");
  const { state, actions, meta } = useBoard();
  const { svgRef, toWorld } = meta;
  const { camera, tool, selection, objects, color, size, editingTextId } = state;
  const { state: inkState, actions: ink } = useInk();

  // O(1) lookups while rendering every object.
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraftState] = useState<BoardObject | null>(null);
  // The stroke being drawn, always current: pointer events can outrun renders,
  // and finishing a stroke must never save a stale copy of it.
  const draftRef = useRef<BoardObject | null>(null);
  const setDraft = (next: BoardObject | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [newText, setNewText] = useState<{ x: number; y: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [area, setAreaState] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const areaRef = useRef(area);
  const setArea = (next: typeof area) => {
    areaRef.current = next;
    setAreaState(next);
  };
  const [panning, setPanning] = useState(false);
  /** Live outline while the handwriting being read is resized (applied on release). */
  const [inkResize, setInkResize] = useState<{ x: number; y: number; w: number; h: number; k: number } | null>(null);

  // Always call the latest actions/state from long-lived listeners.
  const live = useRef({ state, actions });
  useEffect(() => {
    live.current = { state, actions };
  });

  /* ── Wheel: pan, or zoom with ctrl/⌘ (also how trackpad pinch arrives). ── */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Not passive on purpose: we preventDefault to stop browser page-zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { actions: a, state: s } = live.current;
      const rect = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        a.zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        a.setCamera({ ...s.camera, x: s.camera.x - e.deltaX, y: s.camera.y - e.deltaY });
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const TOOL_KEYS: Record<string, Tool> = {
      v: "select", h: "hand", p: "pen", a: "area", e: "eraser", t: "text", l: "line", r: "rect", o: "ellipse",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const { actions: a, state: s } = live.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) a.redo();
        else a.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        a.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        a.select(s.objects.map((o) => o.id));
      } else if (mod) {
        return;
      } else if (key === "delete" || key === "backspace") {
        if (s.selection.length) {
          e.preventDefault();
          a.remove(s.selection);
        }
      } else if (key === "escape") {
        a.select([]);
      } else if (key === " ") {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (key === "+" || key === "=") {
        a.zoomBy(1.2);
      } else if (key === "-") {
        a.zoomBy(1 / 1.2);
      } else if (key === "0") {
        a.resetView();
      } else if (TOOL_KEYS[key]) {
        a.setTool(TOOL_KEYS[key]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  /* ── Pointer gestures ── */
  const eraseAt = (cx: number, cy: number) => {
    const el = document.elementFromPoint(cx, cy)?.closest("[data-oid]");
    const id = el?.getAttribute("data-oid");
    if (id) actions.remove([id], { record: false });
  };

  const originsOf = (ids: string[]) => {
    const origins = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const o = state.byId.get(id);
      if (o) origins.set(id, { x: o.x, y: o.y });
    }
    return origins;
  };

  /**
   * Show the graph of the problem the drag leads to. Only the graph changes
   * (its `pending` problem): the maths on the board waits for Apply.
   */
  const previewGraph = (g: Extract<Gesture, { kind: "graph" }>, step: number, final = false) => {
    if (!graphLibs || !g.at) return;
    const o = g.graph;
    const edit = graphLibs.moveHandle(g.from, g.handle, g.at, step);
    const next = edit?.source ?? g.from;
    if (next === g.last && !final) return;
    // Same framing while dragging, so the picture doesn't jump under the pointer.
    let spec = graphLibs.graphFor(next, { domain: o.domain, range: o.range });
    if (!spec.ok) return;
    // On release, re-frame if a solution or turning point ended up at (or past) the edge.
    if (final && spec.handles?.some((h) => !inView(h, o.domain, o.range))) {
      const fitted = graphLibs.graphFor(next);
      if (fitted.ok) spec = fitted;
    }
    g.last = next;
    if (!g.moved) {
      g.moved = true;
      actions.checkpoint();
    }
    const { ok: _ok, ...rest } = spec;
    void _ok;
    const pending = next === o.source ? undefined : edit ? { source: edit.source, latex: edit.latex } : o.pending;
    actions.update([{ id: o.id, patch: { ...rest, pending } }], { record: false });
  };

  /** Apply or cancel the problem a graph drag proposed. */
  const decideGraph = async (id: string, apply: boolean) => {
    const o = state.byId.get(id);
    if (o?.type !== "graph" || !o.pending || !o.source) return;
    await loadGraphLibs();
    if (apply) {
      const p = state.byId.get(o.forProblemId);
      actions.update([
        { id: o.id, patch: { source: o.pending.source, pending: undefined } },
        // Typeset from now on: the handwriting no longer says this.
        ...(p?.type === "math"
          ? [{ id: p.id, patch: { source: o.pending.source, latex: o.pending.latex, showInk: false, validation: undefined } }]
          : []),
      ]);
      // Steps already written for the old problem are rewritten for the new one.
      if (p) window.dispatchEvent(new CustomEvent("mathcanvas:problem-edited", { detail: { id: p.id } }));
      return;
    }
    const spec = graphLibs!.graphFor(o.source, { domain: o.domain, range: o.range });
    if (!spec.ok) return;
    const { ok: _ok, ...rest } = spec;
    void _ok;
    actions.update([{ id: o.id, patch: { ...rest, pending: undefined } }]);
  };
  const decide = useRef(decideGraph);
  useEffect(() => {
    decide.current = decideGraph;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const { id, apply } = (e as CustomEvent<{ id: string; apply: boolean }>).detail;
      void decide.current(id, apply);
    };
    window.addEventListener("mathcanvas:graph-decision", on);
    return () => window.removeEventListener("mathcanvas:graph-decision", on);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Apply / Cancel under a graph are plain buttons: no board gesture.
    if ((e.target as Element).closest("[data-graph-action]")) return;
    const isMiddle = e.button === 1;
    if (e.button !== 0 && !isMiddle) return;
    // Commit any open text/math editor before starting a new gesture.
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.("[contenteditable='true'], math-field, input, textarea")) active.blur();
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);

    if (isMiddle || tool === "hand" || spaceHeld) {
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, camera };
      setPanning(true);
      return;
    }

    const hitId = (e.target as Element).closest("[data-oid]")?.getAttribute("data-oid") ?? null;

    // Resize corners work with any tool but the eraser.
    const target = e.target as Element;
    const rz = target.closest("[data-resize]")?.getAttribute("data-resize");
    if (rz && tool !== "eraser") {
      let size: { w: number; h: number } | null = inkState.box;
      if (rz !== "ink") {
        const el = target.closest(".widget, .math-ink") ?? target.closest("[data-oid]");
        const r = el?.getBoundingClientRect();
        size = r ? { w: r.width / camera.z, h: r.height / camera.z } : null;
        actions.select([rz]);
      }
      if (!size?.w || !size.h) return;
      gesture.current = { kind: "resize", id: rz, start: w, w0: size.w, h0: size.h, from: state.byId.get(rz) ?? null, moved: false };
      return;
    }

    // A 3-D figure turns under any tool but the eraser.
    const orbit = target.closest("[data-orbit]")?.getAttribute("data-orbit");
    if (orbit && tool !== "eraser") {
      const fig = state.byId.get(orbit);
      if (fig?.type === "graph") {
        actions.select([fig.id]);
        gesture.current = { kind: "orbit", id: fig.id, startX: e.clientX, startY: e.clientY, view0: fig.view ?? fig.space?.view ?? DEFAULT_VIEW };
        return;
      }
    }

    // Points on a graph drag with any tool but the eraser and preview a new problem.
    const gh = target.closest("[data-graph]");
    if (gh && tool !== "eraser") {
      const graph = state.byId.get(gh.getAttribute("data-graph") ?? "");
      const handle = graph?.type === "graph" ? graph.handles?.[Number(gh.getAttribute("data-handle"))] : undefined;
      if (graph?.type === "graph" && graph.source && handle) {
        void loadGraphLibs();
        actions.select([graph.id]);
        // A second drag carries on from the change still waiting for approval.
        const from = graph.pending?.source ?? graph.source;
        gesture.current = { kind: "graph", graph, handle, from, last: from, at: null, frame: null, moved: false };
        return;
      }
    }

    // Pressing outside the handwriting box lets it go; pressing empty board with
    // a drawing tool clears the selection (Select handles its own clicks below).
    const onHandle = !!target.closest("[data-drag], [data-resize], [data-graph], [data-orbit]");
    const b = inkState.box;
    const pad = 14;
    const outside = b && (w.x < b.x - pad || w.x > b.x + b.w + pad || w.y < b.y - pad || w.y > b.y + b.h + pad);
    if (outside && !onHandle) ink.dismiss();
    if (tool !== "select" && !onHandle && selection.length) actions.select([]);

    // Move grips (graph header, handwriting) drag with any tool but the eraser.
    const grip = (e.target as Element).closest("[data-drag]")?.getAttribute("data-drag");
    if (grip && tool !== "eraser") {
      const ids = grip === "ink" ? inkState.ids : [grip];
      if (grip !== "ink") actions.select([grip]);
      gesture.current = { kind: "move", start: w, origins: originsOf(ids), moved: false };
      return;
    }

    switch (tool) {
      case "area":
        gesture.current = { kind: "area", origin: w };
        setArea({ x: w.x, y: w.y, w: 0, h: 0 });
        break;
      case "pen": {
        const id = uid("s");
        gesture.current = { kind: "draw", origin: w, id };
        const stroke: StrokeObject = { id, type: "stroke", x: w.x, y: w.y, points: [[0, 0]], color, size };
        setDraft(stroke);
        break;
      }
      case "line":
      case "rect":
      case "ellipse": {
        const id = uid("h");
        gesture.current = { kind: "shape", origin: w, id };
        setDraft({ id, type: "shape", kind: SHAPE_TOOLS[tool]!, x: w.x, y: w.y, w: 0, h: 0, color, size });
        break;
      }
      case "eraser":
        actions.checkpoint();
        gesture.current = { kind: "erase" };
        eraseAt(e.clientX, e.clientY);
        break;
      case "text":
        if (!hitId) setNewText(w);
        break;
      case "select": {
        if (!hitId) {
          actions.select([]);
          break;
        }
        const additive = e.shiftKey;
        const next = additive
          ? selection.includes(hitId)
            ? selection.filter((id) => id !== hitId)
            : [...selection, hitId]
          : selection.includes(hitId)
            ? selection
            : [hitId];
        actions.select(next);
        gesture.current = { kind: "move", start: w, origins: originsOf(next), moved: false };
        break;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      actions.setCamera({
        ...g.camera,
        x: g.camera.x + (e.clientX - g.startX),
        y: g.camera.y + (e.clientY - g.startY),
      });
      return;
    }
    if (g.kind === "erase") {
      eraseAt(e.clientX, e.clientY);
      return;
    }
    if (g.kind === "orbit") {
      // Screen pixels, not world units: the figure turns at the same speed at any zoom.
      const yaw = g.view0.yaw - (e.clientX - g.startX) * 0.01;
      const pitch = Math.max(-1.45, Math.min(1.45, g.view0.pitch + (e.clientY - g.startY) * 0.01));
      actions.update([{ id: g.id, patch: { view: { yaw, pitch } } }], { record: false });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (g.kind === "area") {
      setArea({
        x: Math.min(w.x, g.origin.x),
        y: Math.min(w.y, g.origin.y),
        w: Math.abs(w.x - g.origin.x),
        h: Math.abs(w.y - g.origin.y),
      });
    } else if (g.kind === "draw") {
      const d = draftRef.current;
      if (d?.type === "stroke") setDraft({ ...d, points: [...d.points, [w.x - g.origin.x, w.y - g.origin.y]] });
    } else if (g.kind === "shape") {
      let dx = w.x - g.origin.x;
      let dy = w.y - g.origin.y;
      if (e.shiftKey && tool !== "line") {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * m;
        dy = Math.sign(dy || 1) * m;
      }
      const d = draftRef.current;
      if (d?.type === "shape") setDraft({ ...d, w: dx, h: dy });
    } else if (g.kind === "resize") {
      const dx = w.x - g.start.x;
      const dy = w.y - g.start.y;
      // Even scaling for maths and handwriting: follow the corner, never below a fifth.
      const k = Math.max(0.2, ((g.w0 + dx) / g.w0 + (g.h0 + dy) / g.h0) / 2);
      if (g.id === "ink") {
        const b = inkState.box;
        if (b) setInkResize({ x: b.x, y: b.y, w: b.w * k, h: b.h * k, k });
        return;
      }
      if (!g.moved) {
        if (Math.hypot(dx, dy) * camera.z < 3) return;
        g.moved = true;
        actions.checkpoint();
      }
      const o = g.from;
      if (o?.type === "graph") {
        actions.update([{ id: o.id, patch: { w: Math.max(220, o.w + dx), h: Math.max(170, o.h + dy) } }], { record: false });
      } else if (o?.type === "math") {
        const scale = Math.min(4, Math.max(0.4, (o.scale ?? 1) * k));
        actions.update([{ id: o.id, patch: { scale } }], { record: false });
      }
    } else if (g.kind === "graph") {
      const o = g.graph;
      const at = graphPoint(o, w.x - o.x, w.y - o.y);
      // Stay inside the picture: the point can't be dragged off the edge.
      g.at = {
        x: Math.min(o.domain[1], Math.max(o.domain[0], at.x)),
        y: Math.min(o.range[1], Math.max(o.range[0], at.y)),
      };
      // At most one redraw per frame, on a fine grid, so the curve glides with the pointer.
      g.frame ??= requestAnimationFrame(() => {
        g.frame = null;
        if (gesture.current === g) previewGraph(g, graphSnap(o) / 5);
      });
    } else if (g.kind === "move") {
      const dx = w.x - g.start.x;
      const dy = w.y - g.start.y;
      if (!g.moved) {
        if (Math.hypot(dx, dy) * camera.z < 3) return; // ignore click jitter
        g.moved = true;
        actions.checkpoint();
      }
      actions.update(
        [...g.origins].map(([id, o]) => ({ id, patch: { x: o.x + dx, y: o.y + dy } })),
        { record: false },
      );
    }
  };

  const endGesture = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!g) return;
    if (g.kind === "resize" && g.id === "ink" && inkResize && inkState.box) {
      // Scale the strokes about the box's corner, in one undo step.
      const { x: bx, y: by } = inkState.box;
      const { k } = inkResize;
      const patches = inkState.ids.flatMap((id) => {
        const s = state.byId.get(id);
        return s?.type === "stroke"
          ? [{ id, patch: { x: bx + (s.x - bx) * k, y: by + (s.y - by) * k, points: s.points.map(([px, py]) => [px * k, py * k] as [number, number]) } }]
          : [];
      });
      if (patches.length && Math.abs(k - 1) > 0.01) actions.update(patches);
      setInkResize(null);
    } else if (g.kind === "draw" && draftRef.current?.type === "stroke") {
      actions.add([draftRef.current]);
    } else if (g.kind === "area" && areaRef.current) {
      const area = areaRef.current;
      // Strokes whose middle lies inside the box are the maths to read.
      const inside = objects.filter((o) => {
        if (o.type !== "stroke") return false;
        const b = boundsOf(o);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return cx >= area.x && cx <= area.x + area.w && cy >= area.y && cy <= area.y + area.h;
      });
      if (inside.length) ink.read(inside.map((o) => o.id));
      else ink.dismiss();
      setArea(null);
    } else if (g.kind === "shape" && draftRef.current?.type === "shape") {
      const d = draftRef.current;
      if (Math.hypot(d.w, d.h) > 6) actions.add([d]);
    } else if (g.kind === "graph") {
      if (g.frame !== null) cancelAnimationFrame(g.frame);
      // Settle on whole or half units: the change offered for approval has clean numbers.
      if (g.at) previewGraph(g, graphSnap(g.graph), true);
    }
    setDraft(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const id = (e.target as Element).closest("[data-oid]")?.getAttribute("data-oid");
    if (!id) return;
    const o = state.byId.get(id);
    if (o?.type === "text") {
      actions.select([id]);
      actions.setEditingText(id);
    }
  };

  const cursor = panning ? "grabbing" : spaceHeld ? "grab" : CURSORS[tool];
  const editingText = editingTextId ? state.byId.get(editingTextId) : null;

  return (
    <svg
      ref={svgRef}
      className="board-canvas"
      // Handles (move, resize) stay one size on screen at every zoom: see objects.tsx.
      style={{ cursor, "--zoom-k": 1 / camera.z, "--grip-k": 1 / camera.z } as CSSProperties}
      role="application"
      aria-label={t("label")}
      onMouseDown={(e) => {
        // Keep focus where our handlers put it (e.g. a new text editor).
        if (!(e.target as Element).closest("[contenteditable='true']")) e.preventDefault();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern
          id="board-dots"
          width={28 * camera.z}
          height={28 * camera.z}
          x={camera.x}
          y={camera.y}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={1.5} cy={1.5} r={Math.max(1, 1.3 * camera.z)} fill="var(--dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#board-dots)" />

      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
        {objects.map((o) =>
          o.id === editingTextId ? null : (
            <ObjectView key={o.id} o={o} selected={selectedSet.has(o.id)} />
          ),
        )}
        <InkOverlay />
        {inkResize ? (
          <rect
            x={inkResize.x - 14}
            y={inkResize.y - 14}
            width={inkResize.w + 28}
            height={inkResize.h + 28}
            rx={10}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        {area ? (
          <rect
            x={area.x}
            y={area.y}
            width={area.w}
            height={area.h}
            rx={6}
            fill="var(--brand)"
            fillOpacity={0.06}
            stroke="var(--brand)"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        {draft ? (
          <g pointerEvents="none">
            <ObjectView o={draft} selected={false} />
          </g>
        ) : null}

        {newText ? (
          <TextEditor
            key="new-text"
            x={newText.x}
            y={newText.y}
            initial=""
            color={color}
            fontSize={28}
            onCommit={(text) => {
              if (text) {
                actions.add([{ id: uid("t"), type: "text", x: newText.x, y: newText.y, text, color, fontSize: 28 }]);
              }
              setNewText(null);
              actions.setTool("select");
            }}
          />
        ) : null}
        {editingText?.type === "text" ? (
          <TextEditor
            key={editingText.id}
            x={editingText.x}
            y={editingText.y}
            initial={editingText.text}
            color={editingText.color}
            fontSize={editingText.fontSize}
            onCommit={(text) => {
              if (!text) actions.remove([editingText.id]);
              else if (text !== editingText.text) actions.update([{ id: editingText.id, patch: { text } }]);
              actions.setEditingText(null);
            }}
          />
        ) : null}
      </g>
    </svg>
  );
}
