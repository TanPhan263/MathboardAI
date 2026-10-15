"use client";

import { useBoard } from "@/components/board/BoardProvider";
import { Katex } from "@/components/ui/Katex";
import {
  BookOpen,
  ChartLine,
  Dumbbell,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  MousePointerClick,
  PanelRightClose,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CheckView } from "./CheckView";
import { HintView } from "./HintView";
import { PracticeView } from "./PracticeView";
import { StepsView } from "./StepsView";
import { type Panel, useTutor } from "./TutorProvider";

const ACTIONS = [
  { key: "explain", label: "explain", Icon: BookOpen, panel: "steps" },
  { key: "hint", label: "hint", Icon: Lightbulb, panel: "hint" },
  { key: "checkWork", label: "checkWork", Icon: ListChecks, panel: "check" },
  { key: "visualize", label: "graph", Icon: ChartLine, panel: null },
  { key: "startPractice", label: "practice", Icon: Dumbbell, panel: "practice" },
] as const satisfies ReadonlyArray<{
  key: "explain" | "hint" | "checkWork" | "visualize" | "startPractice";
  /** Key in the "tutor" messages. */
  label: string;
  Icon: typeof BookOpen;
  panel: Panel | null;
}>;

function ProblemCard() {
  const t = useTranslations("tutor");
  const { state } = useTutor();
  const { actions: board } = useBoard();
  const { problem } = state;
  return (
    <div className="problem-card" data-empty={!problem || undefined}>
      {problem ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {problem.showInk ? t("readFromHandwriting") : t("workingOn")}
            </p>
            {problem.showInk && problem.neatInk?.length ? (
              <button
                type="button"
                className="btn btn-ghost min-h-7 px-2 text-xs"
                aria-pressed={!!problem.neat}
                onClick={() => board.update([{ id: problem.id, patch: { neat: !problem.neat } }])}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {problem.neat ? t("showAsWritten") : t("beautify")}
              </button>
            ) : null}
          </div>
          <div translate="no">
            <Katex latex={problem.latex} display />
          </div>
        </>
      ) : (
        <p className="flex items-start gap-2 text-sm text-muted">
          <MousePointerClick className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t.rich("selectProblem", { b: (c) => <strong className="font-semibold text-ink">{c}</strong> })}</span>
        </p>
      )}
    </div>
  );
}

function CombineBanner() {
  const t = useTranslations("tutor");
  const { state, actions } = useTutor();
  const n = state.combinable.length;
  if (n < 2) return null;
  return (
    <div className="combine">
      <p className="text-sm text-ink">{t.rich("combine", { count: n, b: (c) => <strong className="font-semibold">{c}</strong> })}</p>
      <button type="button" className="btn btn-secondary shrink-0" onClick={actions.combineAsSystem}>
        <Layers className="size-4" aria-hidden />
        {t("makeSystem")}
      </button>
    </div>
  );
}

function ActionGrid() {
  const t = useTranslations("tutor");
  const { state, actions } = useTutor();
  return (
    <div className="app-grid" role="group" aria-label={t("actions")}>
      {ACTIONS.map(({ key, label, Icon, panel }) => (
        <button
          key={key}
          type="button"
          className="app-tile"
          data-active={(panel !== null && state.panel === panel) || undefined}
          aria-pressed={panel !== null ? state.panel === panel : undefined}
          disabled={state.busy}
          onClick={() => actions[key]()}
        >
          <span className="app-tile-icon" aria-hidden>
            <Icon className="size-4.5" />
          </span>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function Notice() {
  const t = useTranslations("tutor");
  const { state, actions } = useTutor();
  if (!state.notice) return null;
  return (
    <div role="alert" className="notice">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{state.notice.message}</p>
        <p className="text-sm text-muted">{state.notice.suggestion}</p>
      </div>
      <button type="button" className="icon-btn size-8" onClick={actions.dismissNotice} aria-label={t("dismissMessage")}>
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function Body() {
  const t = useTranslations("tutor");
  const { state } = useTutor();
  const { panel, solution, checks, practice } = state;
  if (panel === "steps" && solution) return <StepsView />;
  if (panel === "hint" && solution) return <HintView />;
  if (panel === "check" && checks) return <CheckView />;
  if (panel === "practice" && practice) return <PracticeView />;
  if (state.busy) return null;
  return (
    <ul className="space-y-2 text-sm text-muted">
      {ACTIONS.map(({ key, label }) => (
        <li key={key}>
          <strong className="text-ink">{t(label)}</strong> — {t(`about.${label}`)}
        </li>
      ))}
    </ul>
  );
}

export function TutorPanel({ onClose, onMinimize }: { onClose?: () => void; onMinimize?: () => void }) {
  const t = useTranslations("tutor");
  const { state } = useTutor();
  return (
    <aside className="tutor-panel" aria-label={t("title")}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] font-bold text-ink">{t("title")}</h2>
          <span className="tag tag-soft">{t("beta")}</span>
        </div>
        <div className="flex items-center gap-2">
          {state.busy ? (
            <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("working")}
            </span>
          ) : null}
          {onMinimize ? (
            <button type="button" className="icon-btn justify-center only-from-lg" onClick={onMinimize} aria-label={t("minimize")} title={t("minimizeTitle")}>
              <PanelRightClose className="size-5" aria-hidden />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="icon-btn only-below-lg" onClick={onClose} aria-label={t("close")}>
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4">
        <ProblemCard />
        <CombineBanner />
        <ActionGrid />
        <Notice />
        <div aria-live="polite">
          <Body />
        </div>
      </div>
    </aside>
  );
}
