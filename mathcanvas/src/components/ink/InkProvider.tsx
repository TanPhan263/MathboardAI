"use client";

import { type ReactNode, createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/board/BoardProvider";
import { type Rect, boundsOf } from "@/lib/board/geometry";
import type { MathObject, StrokeObject } from "@/lib/board/types";
import { ApiError, classifyRemote, forgetLearner, learnerInfo, sendSamples, startTraining, trainingJob } from "@/lib/ink/api";
import { neaten } from "@/lib/ink/neaten";
import { type InkResult, type ScoreCache, recognizeInkAsync, unionBox } from "@/lib/ink/recognize";
import { type InkSample, outbox, setOutbox, toSample } from "@/lib/ink/samples";
import type { Pt, Sym } from "@/lib/ink/symbols";

export type InkStatus = "idle" | "loading" | "ready" | "error";

export interface InkState {
  status: InkStatus;
  /** Strokes being read (they move together when the learner drags the box). */
  ids: string[];
  /** World box around the handwriting being read. */
  box: Rect | null;
  /** Reading of the boxed handwriting, once the model is loaded. */
  result: InkResult | null;
  /** Token the learner is looking at (highlighted on the board). */
  activeKey: string | null;
  /** The learner split or joined symbols, or picked one by hand. */
  edited: boolean;
  /** Training on this learner's handwriting (on the handwriting API). */
  training: Training;
}

export type Training = {
  /** Symbols the learner fixed by hand that the API has (plus any still waiting to send). */
  saved: number;
  /** How many the API wants before it will train. */
  needed: number;
  /** The reader already uses a model trained on this learner's handwriting. */
  personal: boolean;
  status: "idle" | "running" | "done" | "failed";
  /** What happened, as a key in the "ink.train" messages. */
  message: { key: TrainingNote; count?: number } | null;
};

export type TrainingNote = "installed" | "keptWorse" | "keptNoBetter" | "failed" | "needMore" | "unavailable" | "error";

/** An API failure as something to tell the learner. */
function noteFor(e: unknown, needed: number): Training["message"] {
  if (e instanceof ApiError && e.status === 422) return { key: "needMore", count: needed };
  if (e instanceof ApiError && e.status === 503) return { key: "unavailable" };
  return { key: "error" };
}

export interface InkActions {
  /** Read these strokes (the ones inside the box the learner dragged). */
  read(ids: string[]): void;
  setActive(key: string | null): void;
  choose(key: string, symbol: Sym): void;
  /** Read each stroke of this symbol on its own. */
  split(key: string): void;
  /** Read this symbol and the next one as a single symbol. */
  join(key: string): void;
  /** Forget every split, join and pick in this reading. */
  undoFixes(): void;
  /** Ask the handwriting reader again (after it couldn't be reached). */
  retry(): void;
  /** Train a model on the symbols this learner fixed. */
  train(): void;
  /** Delete this learner's saved symbols and personal model from the API. */
  forget(): void;
  /**
   * Turn the ink into a problem that still looks handwritten. "neat" shows it
   * tidied (Beautify); the strokes as written are kept either way.
   */
  commit(style: "ink" | "neat"): MathObject | null;
  dismiss(): void;
}

interface InkContextValue {
  state: InkState;
  actions: InkActions;
}

const InkContext = createContext<InkContextValue | null>(null);

export function useInk(): InkContextValue {
  const ctx = use(InkContext);
  if (!ctx) throw new Error("useInk must be used inside <InkProvider>");
  return ctx;
}

const worldPoints = (s: StrokeObject): Pt[] => s.points.map(([x, y]) => ({ x: s.x + x, y: s.y + y }));

const shift = <B extends { x: number; y: number }>(b: B, dx: number, dy: number): B => ({ ...b, x: b.x + dx, y: b.y + dy });

function shiftResult(r: InkResult, dx: number, dy: number): InkResult {
  return { ...r, box: shift(r.box, dx, dy), tokens: r.tokens.map((t) => ({ ...t, box: shift(t.box, dx, dy) })) };
}

/** Which strokes are being read, the learner's fixes, and training on their handwriting. */
export function InkProvider({ children }: { children: ReactNode }) {
  const { state: board, actions: boardActions } = useBoard();
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Sym>>({});
  const [groups, setGroups] = useState<string[][]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [training, setTraining] = useState<Training>({ saved: 0, needed: 20, personal: false, status: "idle", message: null });
  // Network scores for this ink, kept while the learner fixes it (dropped when a new model arrives).
  const scores = useRef<ScoreCache>(new Map());

  // Erased or undone strokes simply drop out of the reading.
  const strokes = useMemo(
    () => sessionIds.map((id) => board.byId.get(id)).filter((o): o is StrokeObject => o?.type === "stroke"),
    [sessionIds, board.byId],
  );
  // Read the strokes relative to the first one, so dragging the whole box
  // (every stroke moved alike) reuses the reading instead of reading again.
  const first = strokes[0];
  const layout = strokes.map((s) => `${s.id}:${s.x - first.x}:${s.y - first.y}`).join("|");
  const [relative, setRelative] = useState<InkResult | null>(null);
  const [modelVersion, setModelVersion] = useState(0);
  useEffect(() => {
    if (!strokes.length) return;
    let stale = false;
    const input = strokes.map((s) => ({ id: s.id, points: worldPoints({ ...s, x: s.x - first.x, y: s.y - first.y }) }));
    recognizeInkAsync(input, { overrides, groups, classifyBatch: classifyRemote, cache: scores.current })
      .then((r) => {
        if (stale) return;
        setRelative(r);
        setFailed(false);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layout` is the strokes' shape and relative placement
  }, [layout, overrides, groups, modelVersion]);
  const [dx, dy] = [first?.x ?? 0, first?.y ?? 0];
  const result = useMemo(() => (relative && strokes.length ? shiftResult(relative, dx, dy) : null), [relative, strokes.length, dx, dy]);
  const box = useMemo(() => (strokes.length ? unionBox(strokes.map(boundsOf)) : null), [strokes]);
  const status: InkStatus = strokes.length === 0 ? "idle" : failed ? "error" : relative ? "ready" : "loading";

  // How the reader first cut the ink into symbols: any of those groups the
  // learner then split or joined away is saved as "not a symbol".
  const firstCut = useRef(new Map<string, string[]>());
  useEffect(() => {
    if (result && groups.length === 0 && firstCut.current.size === 0) {
      firstCut.current = new Map(result.tokens.map((t) => [t.key, t.strokeIds]));
    }
  }, [result, groups]);

  const live = useRef({ result, strokes, boardActions, overrides, groups });
  useEffect(() => {
    live.current = { result, strokes, boardActions, overrides, groups };
  });

  const actions = useMemo<InkActions>(() => {
    const reset = () => {
      harvest();
      setSessionIds([]);
      setOverrides({});
      setGroups([]);
      setActiveKey(null);
      firstCut.current = new Map();
    };

    /** Keep what the learner taught the reader in this session, for training. */
    const harvest = () => {
      const { result: r, strokes: ink, overrides: picked, groups: mine } = live.current;
      if (!r) return;
      const pts = new Map(ink.map((s) => [s.id, worldPoints(s)]));
      const of = (ids: string[]) => ids.flatMap((id) => (pts.has(id) ? [pts.get(id)!] : []));
      const out: InkSample[] = [];
      for (const t of r.tokens) {
        const label = picked[t.key];
        if (label && label !== "?" && t.strokeIds.every((id) => pts.has(id))) out.push(toSample(label, of(t.strokeIds), r.unit));
      }
      const now = new Set(r.tokens.map((t) => t.key));
      const touched = new Set(mine.flat());
      for (const [key, ids] of firstCut.current) {
        if (!now.has(key) && ids.every((id) => pts.has(id)) && ids.some((id) => touched.has(id))) {
          out.push(toSample("∅", of(ids), r.unit));
        }
      }
      if (out.length) {
        setOutbox([...outbox(), ...out]);
        flush();
      }
    };

    /** Send waiting samples; whatever fails stays in the outbox for next time. */
    const flush = () => {
      const waiting = outbox();
      if (!waiting.length) return;
      sendSamples(waiting)
        .then(({ total }) => {
          // Keep anything saved while the request was in flight.
          setOutbox(outbox().slice(waiting.length));
          setTraining((t) => ({ ...t, saved: total }));
        })
        .catch(() => setTraining((t) => ({ ...t, saved: Math.max(t.saved, waiting.length) })));
    };

    const refreshInfo = () =>
      learnerInfo()
        .then((info) =>
          setTraining((t) => ({ ...t, saved: info.samples + outbox().length, needed: info.minSamples, personal: info.model.personal })),
        )
        .catch(() => {});

    const watch = (jobId: string) => {
      const poll = () =>
        trainingJob(jobId)
          .then((job) => {
            if (job.status === "queued" || job.status === "running") {
              setTimeout(poll, 3000);
              return;
            }
            const ok = job.status === "done";
            setTraining((t) => ({
              ...t,
              status: ok ? "done" : "failed",
              personal: t.personal || !!job.installed,
              message: !ok
                ? { key: "failed" }
                : job.installed
                  ? { key: "installed" }
                  : { key: job.verdict === "worse_personal" ? "keptNoBetter" : "keptWorse" },
            }));
            if (job.installed) {
              // New model: read the ink on the board again with it.
              scores.current = new Map();
              setModelVersion((v) => v + 1);
            }
          })
          .catch(() => setTimeout(poll, 5000));
      poll();
    };

    /** Replace any of the learner's groups touching these strokes with `next`. */
    const regroup = (ids: string[], next: string[][]) =>
      setGroups((gs) => [...gs.filter((g) => !g.some((id) => ids.includes(id))), ...next]);

    const commit = (style: "ink" | "neat"): MathObject | null => {
      const { result: r, strokes: ink, boardActions: ba } = live.current;
      if (!r) return null;
      const { x, y } = r.box;
      const tidy = neaten(r, new Map(ink.map((s) => [s.id, worldPoints(s)])));
      const neatInk = ink.map((s): StrokeObject => {
        const pts = tidy.get(s.id) ?? worldPoints(s);
        const o = pts[0];
        return { ...s, x: o.x - x, y: o.y - y, points: pts.map((p) => [p.x - o.x, p.y - o.y]) };
      });
      ba.checkpoint();
      ba.remove(ink.map((s) => s.id), { record: false });
      const obj = ba.addMath({
        latex: r.latex,
        source: r.ascii,
        x,
        y,
        // Stored relative to the problem so the ink moves with it.
        ink: ink.map((s) => ({ ...s, x: s.x - x, y: s.y - y })),
        showInk: true,
        neatInk,
        neat: style === "neat",
        record: false,
      });
      reset();
      return obj;
    };

    return {
      read(ids) {
        harvest();
        firstCut.current = new Map();
        scores.current = new Map();
        setRelative(null);
        setSessionIds(ids);
        setOverrides({});
        setGroups([]);
        setActiveKey(null);
        setFailed(false);
        // The API is only contacted once someone reads handwriting.
        refreshInfo();
        flush();
      },
      setActive: setActiveKey,
      choose(key, symbol) {
        setOverrides((o) => ({ ...o, [key]: symbol }));
        setActiveKey(null);
      },
      split(key) {
        const t = live.current.result?.tokens.find((x) => x.key === key);
        if (!t || t.strokeIds.length < 2) return;
        regroup(t.strokeIds, t.strokeIds.map((id) => [id]));
        // Straight on to labelling the first piece.
        setActiveKey(t.strokeIds[0]);
      },
      join(key) {
        const tokens = live.current.result?.tokens ?? [];
        const i = tokens.findIndex((x) => x.key === key);
        const next = tokens[i + 1];
        if (i < 0 || !next) return;
        const ids = [...tokens[i].strokeIds, ...next.strokeIds];
        regroup(ids, [ids]);
        setActiveKey([...ids].sort().join("+"));
      },
      undoFixes() {
        setGroups([]);
        setOverrides({});
        setActiveKey(null);
      },
      retry() {
        setFailed(false);
        setModelVersion((v) => v + 1);
        flush();
        refreshInfo();
      },
      train() {
        setTraining((t) => ({ ...t, status: "running", message: null }));
        startTraining()
          .then((job) => watch(job.id))
          .catch((e: unknown) => setTraining((t) => ({ ...t, status: "failed", message: noteFor(e, t.needed) })));
      },
      forget() {
        setOutbox([]);
        forgetLearner()
          .then(() => setTraining((t) => ({ ...t, saved: 0, personal: false, status: "idle", message: null })))
          .catch((e: unknown) => setTraining((t) => ({ ...t, message: noteFor(e, t.needed) })));
      },
      commit,
      dismiss: reset,
    };
  }, []);

  const ids = useMemo(() => strokes.map((s) => s.id), [strokes]);
  const edited = groups.length > 0 || Object.keys(overrides).length > 0;
  const state = useMemo<InkState>(
    () => ({ status, ids, box, result, activeKey, edited, training }),
    [status, ids, box, result, activeKey, edited, training],
  );
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <InkContext value={value}>{children}</InkContext>;
}
