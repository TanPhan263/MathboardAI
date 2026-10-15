"use client";

import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { type Rect, boundsOf, drawnInk } from "@/lib/board/geometry";
import { uid } from "@/lib/board/storage";
import type { BoardObject, GraphObject, MathObject } from "@/lib/board/types";
import type { AnswerCheck, LineCheck } from "@/lib/math/check";
import { type PracticeProblem, generatePractice } from "@/lib/math/practice";
import type { MathSolution, ProblemTopic, SolveFailure } from "@/lib/math/types";
import { localTutor } from "@/lib/tutor/local";
import type { TutorIntent, TutorProvider as TutorBackend } from "@/lib/tutor/provider";
import { useBoard } from "@/components/board/BoardProvider";

export type Panel = "steps" | "hint" | "check" | "practice";

export type ChatMessage = { id: string; role: "user" | "tutor"; text: string };

export type Notice = { message: string; suggestion: string };

export type PracticeState = {
  problem: PracticeProblem;
  result: AnswerCheck | null;
  placed: boolean;
};

export type CheckedLine = LineCheck & { objectId: string };

export type QuickAction = "explain" | "hint" | "checkWork" | "visualize" | "startPractice";
/** What a quick action did, in a sentence or two (shown beside the floating tutor). */
export type QuickResult = { tone: "good" | "bad" | "info"; title: string; text?: string };

export interface TutorState {
  /** The equation the tutor is currently working on. */
  problem: MathObject | null;
  solution: MathSolution | null;
  notice: Notice | null;
  busy: boolean;
  panel: Panel | null;
  activeStepId: string | null;
  /** stepId → board object id, for steps already written to the board. */
  writtenSteps: ReadonlyMap<string, string>;
  hintsShown: number;
  checks: CheckedLine[] | null;
  practice: PracticeState | null;
  messages: ChatMessage[];
  providerLabel: string;
  /** Equations currently multi-selected that could form a system. */
  combinable: MathObject[];
}

export interface TutorActions {
  explain(): void;
  hint(): void;
  moreHint(): void;
  checkWork(): void;
  startPractice(): void;
  newPractice(): void;
  submitPracticeAnswer(answer: string): void;
  putPracticeOnBoard(): void;
  visualize(): void;
  writeStepsToBoard(): void;
  focusStep(stepId: string): void;
  focusObject(objectId: string): void;
  ask(intent: TutorIntent, question?: string): void;
  dismissNotice(): void;
  /** Turn 2–3 selected equations into one system. */
  combineAsSystem(): void;
  /** Run a tutor action on a problem that was just added (e.g. read from handwriting). */
  actOn(problem: MathObject, mode: "explain" | "hint" | "graph"): void;
  /** The problem was rewritten (e.g. by dragging its graph): solve it again and redo written steps. */
  refreshProblem(problemId: string): void;
  /**
   * Run an action with the drawer closed: the result goes on the board
   * (steps, graph, check marks, a practice problem) or comes back as a short note.
   */
  quick(action: QuickAction): Promise<QuickResult>;
}

interface TutorContextValue {
  state: TutorState;
  actions: TutorActions;
}

const TutorContext = createContext<TutorContextValue | null>(null);

export function useTutor(): TutorContextValue {
  const ctx = use(TutorContext);
  if (!ctx) throw new Error("useTutor must be used inside <TutorProvider>");
  return ctx;
}


const NO_MESSAGES: ChatMessage[] = [];



type Cached = { source: string; solution: MathSolution };

/** A fresh problem of the same kind; geometry practice (and its maths) loads on first use. */
async function practiceFor(topic: ProblemTopic): Promise<PracticeProblem> {
  if (topic === "geometry-2d" || topic === "geometry-3d") {
    return (await import("@/lib/math/geometry/practice")).geometryPractice(topic);
  }
  if (topic === "conic") return (await import("@/lib/math/conic/practice")).conicPractice();
  if (topic === "vector") return (await import("@/lib/math/vector/practice")).vectorPractice();
  if (topic === "triangle" || topic === "solid" || topic === "space-figure") {
    return (await import("@/lib/math/measure/practice")).measurePractice(topic);
  }
  return generatePractice(topic);
}

const STEP_GAP = 18;
const GRAPH = { w: 480, h: 330, gap: 40 };

/**
 * Width of a board object in world units. offsetWidth ignores the canvas
 * zoom transform, so no camera maths is needed (falls back to an estimate).
 */
function measuredWidth(id: string): number {
  const el = document.querySelector<HTMLElement>(`[data-oid="${id}"] .math-ink, [data-oid="${id}"] .widget`);
  return el ? el.offsetWidth : 360;
}

/** Handwritten problems know their size; typeset ones are measured in the DOM. */
function widthOf(o: MathObject | BoardObject): number {
  if (o.type === "math" && drawnInk(o)) {
    const b = boundsOf(o);
    return b.x - o.x + b.w;
  }
  return measuredWidth(o.id) * (o.type === "math" ? (o.scale ?? 1) : 1);
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Rough height of a written step: one row per line break, more for fractions and matrices. */
const stepHeight = (latex: string) =>
  84 + (latex.split("\\\\").length - 1) * 34 + (/\\frac|\\begin\{vmatrix\}/.test(latex) ? 24 : 0);

export function TutorProvider({
  children,
  backend = localTutor,
}: {
  children: ReactNode;
  /** Swap in a server-backed provider without touching any UI. */
  backend?: TutorBackend;
}) {
  const t = useTranslations("tutor");
  const NO_PROBLEM = useMemo<Notice>(() => ({ message: t("noProblem.message"), suggestion: t("noProblem.suggestion") }), [t]);
  const NO_WORK = useMemo<Notice>(() => ({ message: t("noWork.message"), suggestion: t("noWork.suggestion") }), [t]);
  const { state: board, actions: boardActions } = useBoard();
  const [busy, startBusy] = useTransition();

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<Record<string, Cached>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [checks, setChecks] = useState<CheckedLine[] | null>(null);
  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  /* ── Derived state: no effects, no duplicated truth ── */
  const combinable = useMemo(() => {
    if (board.selection.length < 2 || board.selection.length > 3) return [] as MathObject[];
    const picked = board.selection
      .map((id) => board.byId.get(id))
      .filter((o): o is MathObject => o?.type === "math" && o.role !== "step" && o.source.includes("=") && !/[<>;]/.test(o.source));
    return picked.length === board.selection.length ? picked.sort((a, b) => a.y - b.y) : [];
  }, [board.selection, board.byId]);

  const selectedMath = useMemo(() => {
    if (board.selection.length !== 1) return null;
    const o = board.byId.get(board.selection[0]);
    return o?.type === "math" ? o : null;
  }, [board.selection, board.byId]);

  const problem = useMemo<MathObject | null>(() => {
    if (selectedMath) {
      if (selectedMath.stepOf) {
        const parent = board.byId.get(selectedMath.stepOf.problemId);
        return parent?.type === "math" ? parent : null;
      }
      return selectedMath;
    }
    const pinned = pinnedId ? board.byId.get(pinnedId) : null;
    return pinned?.type === "math" ? pinned : null;
  }, [selectedMath, pinnedId, board.byId]);

  const cached = problem ? solutions[problem.id] : undefined;
  const solution = problem && cached && cached.source === problem.source ? cached.solution : null;

  const writtenSteps = useMemo(() => {
    const map = new Map<string, string>();
    if (!problem) return map;
    for (const o of board.objects) {
      if (o.type === "math" && o.stepOf?.problemId === problem.id) map.set(o.stepOf.stepId, o.id);
    }
    return map;
  }, [board.objects, problem]);

  const activeStepId = useMemo(() => {
    const fromBoard = selectedMath?.stepOf?.stepId;
    const id = fromBoard ?? manualStepId;
    return id && solution?.steps.some((s) => s.id === id) ? id : null;
  }, [selectedMath, manualStepId, solution]);

  const messages = (problem && chats[problem.id]) || NO_MESSAGES;
  const hintsShown = problem ? (hints[problem.id] ?? 0) : 0;

  const fail = useCallback((f: Pick<SolveFailure, "message" | "suggestion">) => {
    setNotice({ message: f.message, suggestion: f.suggestion });
  }, []);

  /** Solve once per distinct problem text; the math libs load on first use. */
  const ensureSolution = useCallback(
    async (p: MathObject): Promise<MathSolution | null> => {
      const hit = solutions[p.id];
      if (hit && hit.source === p.source) return hit.solution;
      const { solveProblem } = await import("@/lib/math/solve");
      const result = solveProblem(p.source, p.id);
      if (!result.ok) {
        fail(result);
        return null;
      }
      setSolutions((prev) => ({ ...prev, [p.id]: { source: p.source, solution: result.solution } }));
      return result.solution;
    },
    [solutions, fail],
  );

  const actions = useMemo<TutorActions>(() => {
    const withProblem = (fn: (p: MathObject) => unknown, target = problem) => {
      if (!target) {
        fail(NO_PROBLEM);
        return;
      }
      setNotice(null);
      setPinnedId(target.id);
      startBusy(async () => {
        await fn(target);
      });
    };

    /** Right of the problem (and its written steps), stepping down past anything in the way. */
    const graphSpot = (p: MathObject, size: { w: number; h: number } = GRAPH): { x: number; y: number } => {
      // `p` may be brand new and not in this render's objects yet.
      const family = [p, ...board.objects.filter((o) => o.type === "math" && o.stepOf?.problemId === p.id)];
      const right = Math.max(...family.map((o) => o.x + widthOf(o)));
      const spot: Rect = { x: right + GRAPH.gap, y: p.y, w: size.w, h: size.h };
      const others = board.objects
        .filter((o) => !(o.type === "graph" && o.forProblemId === p.id) && o.id !== p.id && !family.includes(o))
        .map((o) => (o.type === "math" ? { ...boundsOf(o), w: widthOf(o) } : boundsOf(o)));
      for (let i = 0; i < 40; i++) {
        const hit = others.find((r) => overlaps(spot, r));
        if (!hit) break;
        spot.y = hit.y + hit.h + 24;
      }
      return { x: spot.x, y: spot.y };
    };

    /** `quiet`: part of another edit's undo step, and no camera move. */
    const writeSteps = (p: MathObject, sol: MathSolution, quiet = false) => {
      const old = board.objects
        .filter((o) => o.type === "math" && o.stepOf?.problemId === p.id)
        .map((o) => o.id);
      let y = p.y + stepHeight(p.latex) + STEP_GAP;
      const created: MathObject[] = sol.steps.map((s, i) => {
        const obj: MathObject = {
          id: uid("m"),
          type: "math",
          x: p.x + 28,
          y,
          latex: s.latex,
          source: "",
          role: "step",
          caption: t("steps.caption", { n: i + 1, operation: s.operation }),
          validation: s.validation,
          stepOf: { problemId: p.id, stepId: s.id },
        };
        y += stepHeight(s.latex) + STEP_GAP;
        return obj;
      });
      // One undo step: remove the old rewrite and add the new one together.
      if (old.length) boardActions.remove(old, { record: !quiet });
      boardActions.add(created, { record: !quiet && old.length === 0 });
      if (!quiet) boardActions.reveal(created[0].id);
    };

    /** The graph (or geometry figure) it put on the board, or why it couldn't. */
    const drawGraph = async (p: MathObject): Promise<Notice | GraphObject> => {
      const { isGeometry } = await import("@/lib/math/geometry/parse");
      const { isMeasure, measureFigure } = await import("@/lib/math/measure");
      const conicMod = await import("@/lib/math/conic");
      const vectorMod = await import("@/lib/math/vector");
      const spec = conicMod.isConic(p.source)
        ? conicMod.conicFigure(p.source)
        : vectorMod.isVectorProblem(p.source)
        ? vectorMod.vectorFigure(p.source)
        : isMeasure(p.source)
        ? measureFigure(p.source)
        : isGeometry(p.source)
          ? (await import("@/lib/math/geometry/figure")).geometryFigure(p.source)
          : (await import("@/lib/math/graph")).graphFor(p.source);
      if (!spec.ok) {
        fail(spec);
        return { message: spec.message, suggestion: spec.suggestion };
      }
      const { ok: _ok, ...rest } = spec;
      void _ok;
      // Geometry figures are squarer: equal units (2-D) or room to turn (3-D).
      const size = rest.space ? { w: 460, h: 440 } : rest.equal ? { w: 440, h: 420 } : { w: GRAPH.w, h: GRAPH.h };
      const graph: GraphObject = {
        id: uid("g"),
        type: "graph",
        ...graphSpot(p, size),
        ...size,
        forProblemId: p.id,
        source: p.source,
        ...rest,
      };
      const old = board.objects.filter((o) => o.type === "graph" && o.forProblemId === p.id).map((o) => o.id);
      if (old.length) boardActions.remove(old);
      boardActions.add([graph], { record: old.length === 0 });
      boardActions.select([graph.id]);
      boardActions.reveal(graph.id);
      return graph;
    };

    /** Mark every line of working on the board; the results, or why there is nothing to check. */
    const runCheck = async (): Promise<CheckedLine[] | null> => {
      const lines = board.objects
        .filter((o): o is MathObject => o.type === "math" && o.role !== "step")
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (lines.length === 0) return null;
      const { checkWork } = await import("@/lib/math/check");
      const results = checkWork(lines.map((l) => l.source));
      const checked = results.map((r) => ({ ...r, objectId: lines[r.index].id }));
      setChecks(checked);
      boardActions.update(
        results.map((r) => ({ id: lines[r.index].id, patch: { validation: r.status === "start" ? undefined : r.status } })),
        { record: false },
      );
      return checked;
    };

    /** Solve without touching the drawer's notice: quick actions report failures themselves. */
    const solveQuietly = async (p: MathObject): Promise<MathSolution | Notice> => {
      const hit = solutions[p.id];
      if (hit && hit.source === p.source) return hit.solution;
      const { solveProblem } = await import("@/lib/math/solve");
      const result = solveProblem(p.source, p.id);
      if (!result.ok) return { message: result.message, suggestion: result.suggestion };
      setSolutions((prev) => ({ ...prev, [p.id]: { source: p.source, solution: result.solution } }));
      return result.solution;
    };

    return {
      explain: () =>
        withProblem(async (p) => {
          setPanel("steps");
          await ensureSolution(p);
        }),

      hint: () =>
        withProblem(async (p) => {
          setPanel("hint");
          const sol = await ensureSolution(p);
          if (sol) setHints((h) => ({ ...h, [p.id]: Math.max(1, h[p.id] ?? 0) }));
        }),

      moreHint: () => {
        if (!problem || !solution) return;
        setHints((h) => ({ ...h, [problem.id]: Math.min(solution.steps.length, (h[problem.id] ?? 0) + 1) }));
      },

      checkWork: () => {
        setNotice(null);
        setPanel("check");
        startBusy(async () => {
          if (!(await runCheck())) {
            fail(NO_WORK);
            setChecks(null);
          }
        });
      },

      quick: async (action) => {
        const bad = (n: Notice): QuickResult => ({ tone: "bad", title: n.message, text: n.suggestion });
        if (action === "checkWork") {
          const checked = await runCheck();
          if (!checked) return bad(NO_WORK);
          const wrong = checked.find((c) => c.status === "failed");
          const unsure = checked.filter((c) => c.status === "unverified").length;
          if (wrong) {
            return { tone: "bad", title: t("dock.wrongLine", { line: wrong.index + 1 }), text: wrong.message };
          }
          return {
            tone: unsure ? "info" : "good",
            title: unsure ? t("dock.unsure", { count: unsure }) : t("dock.allGood"),
            text: t("dock.marks"),
          };
        }
        const p = problem;
        if (!p) return bad(NO_PROBLEM);
        setPinnedId(p.id);
        if (action === "visualize") {
          const drawn = await drawGraph(p);
          if ("message" in drawn) return bad(drawn);
          const figure = !!(drawn.space || drawn.equal);
          return { tone: "good", title: t(figure ? "dock.figureDone" : "dock.graphDone"), text: figure ? drawn.caption : t("dock.graphHint") };
        }
        const sol = await solveQuietly(p);
        if (!("steps" in sol)) return bad(sol);
        if (action === "explain") {
          writeSteps(p, sol);
          return { tone: "good", title: t("dock.stepsDone", { count: sol.steps.length }), text: t("dock.stepsNote") };
        }
        if (action === "hint") {
          const n = Math.min(sol.steps.length, (hints[p.id] ?? 0) + 1);
          setHints((h) => ({ ...h, [p.id]: n }));
          return { tone: "info", title: t("dock.hintOf", { n, total: sol.steps.length }), text: sol.steps[n - 1].hint };
        }
        const next = await practiceFor(sol.topic);
        boardActions.addMath({ latex: next.latex, source: next.input, role: "practice", caption: t("practiceView.caption") });
        return { tone: "good", title: t("dock.practiceDone"), text: t("dock.practiceNote") };
      },

      startPractice: () =>
        withProblem(async (p) => {
          setPanel("practice");
          const sol = await ensureSolution(p);
          if (sol) setPractice({ problem: await practiceFor(sol.topic), result: null, placed: false });
        }),

      newPractice: () => {
        const topic = solution?.topic ?? practice?.problem.topic;
        if (!topic) return;
        startBusy(async () => {
          const problem = await practiceFor(topic);
          setPractice({ problem, result: null, placed: false });
        });
      },

      submitPracticeAnswer: (answer) => {
        if (!practice) return;
        startBusy(async () => {
          const { checkAnswer } = await import("@/lib/math/check");
          const result = checkAnswer(practice.problem.input, answer);
          setPractice((s) => (s ? { ...s, result } : s));
        });
      },

      putPracticeOnBoard: () => {
        if (!practice) return;
        boardActions.addMath({
          latex: practice.problem.latex,
          source: practice.problem.input,
          role: "practice",
          caption: t("practiceView.caption"),
        });
        setPractice((s) => (s ? { ...s, placed: true } : s));
      },

      visualize: () => withProblem(drawGraph),

      actOn: (target, mode) =>
        withProblem(async (p) => {
          if (mode === "graph") return drawGraph(p);
          setPanel(mode === "hint" ? "hint" : "steps");
          const sol = await ensureSolution(p);
          if (sol && mode === "hint") setHints((h) => ({ ...h, [p.id]: Math.max(1, h[p.id] ?? 0) }));
        }, target),

      refreshProblem: (id) => {
        const p = board.objects.find((o): o is MathObject => o.id === id && o.type === "math");
        if (!p) return;
        const hadSteps = board.objects.some((o) => o.type === "math" && o.stepOf?.problemId === id);
        startBusy(async () => {
          const sol = await ensureSolution(p);
          if (sol && hadSteps) writeSteps(p, sol, true);
        });
      },

      writeStepsToBoard: () =>
        withProblem(async (p) => {
          const sol = await ensureSolution(p);
          if (sol) writeSteps(p, sol);
        }),

      focusStep: (stepId) => {
        setManualStepId(stepId);
        const objectId = writtenSteps.get(stepId);
        if (objectId) {
          boardActions.select([objectId]);
          boardActions.reveal(objectId);
        }
      },

      focusObject: (objectId) => {
        boardActions.select([objectId]);
        boardActions.reveal(objectId);
      },

      ask: (intent, question = "") => {
        if (!problem) return fail(NO_PROBLEM);
        if (!solution) {
          fail({ message: t("explainFirst.message"), suggestion: t("explainFirst.suggestion") });
          return;
        }
        const stepId = activeStepId ?? solution.steps[0].id;
        const step = solution.steps.find((s) => s.id === stepId)!;
        const text = intent === "free" ? question : t(`chat.quick.${intent}`);
        const pid = problem.id;
        const userMsg: ChatMessage = { id: uid("c"), role: "user", text: `${step.operation}: ${text}` };
        setChats((c) => ({ ...c, [pid]: [...(c[pid] ?? []), userMsg] }));
        startBusy(async () => {
          let reply: string;
          try {
            reply = await backend.answer({ solution, stepId, intent, question: text });
          } catch {
            reply = t("chat.unreachable");
          }
          setChats((c) => ({
            ...c,
            [pid]: [...(c[pid] ?? []), { id: uid("c"), role: "tutor", text: reply }],
          }));
        });
      },

      dismissNotice: () => setNotice(null),

      combineAsSystem: () => {
        if (combinable.length < 2) return;
        const right = Math.max(...combinable.map((o) => o.x)) + 380;
        const top = Math.min(...combinable.map((o) => o.y));
        const obj = boardActions.addMath({
          latex: `\\begin{cases}${combinable.map((o) => o.latex).join("\\\\")}\\end{cases}`,
          source: combinable.map((o) => o.source).join("; "),
          x: right,
          y: top,
        });
        setPinnedId(obj.id);
        setNotice(null);
        boardActions.reveal(obj.id);
      },
    };
  }, [
    problem,
    solution,
    practice,
    activeStepId,
    writtenSteps,
    combinable,
    hints,
    solutions,
    board.objects,
    boardActions,
    backend,
    ensureSolution,
    fail,
    t,
    NO_PROBLEM,
    NO_WORK,
  ]);

  // Dragging a graph rewrites its problem (Whiteboard): keep the solution and written steps in step.
  const refresh = useRef(actions.refreshProblem);
  useEffect(() => {
    refresh.current = actions.refreshProblem;
  });
  useEffect(() => {
    const onEdited = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      // After the board has rendered the final drag position.
      setTimeout(() => refresh.current(id), 0);
    };
    window.addEventListener("mathcanvas:problem-edited", onEdited);
    return () => window.removeEventListener("mathcanvas:problem-edited", onEdited);
  }, []);

  const state = useMemo<TutorState>(
    () => ({
      problem,
      solution,
      notice,
      busy,
      panel,
      activeStepId,
      writtenSteps,
      hintsShown,
      checks,
      practice,
      messages,
      providerLabel: backend.label,
      combinable,
    }),
    [problem, solution, notice, busy, panel, activeStepId, writtenSteps, hintsShown, checks, practice, messages, backend.label, combinable],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <TutorContext value={value}>{children}</TutorContext>;
}
