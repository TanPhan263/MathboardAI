"use client";

import { ChevronDown, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { SolutionStep } from "@/lib/math/types";
import { StatusBadge } from "@/components/board/objects";
import { Katex } from "@/components/ui/Katex";
import { TutorChat } from "./TutorChat";
import { useTutor } from "./TutorProvider";

function StepCard({
  step,
  index,
  active,
  onFocus,
}: {
  step: SolutionStep;
  index: number;
  active: boolean;
  onFocus: () => void;
}) {
  const t = useTranslations("tutor.steps");
  const ref = useRef<HTMLLIElement>(null);

  // Bring the card into view when the learner picks the step on the board.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <li ref={ref} className="step-card" data-active={active || undefined} data-status={step.validation}>
      <button type="button" className="step-card-main" onClick={onFocus} aria-current={active ? "step" : undefined}>
        <span className="step-index" aria-hidden>
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-ink">{step.operation}</span>
            <StatusBadge status={step.validation} />
          </span>
          <span className="step-math" translate="no">
            <Katex latex={step.latex} display />
          </span>
          <span className="block text-[13px] leading-relaxed text-muted">{step.explanation}</span>
        </span>
      </button>
      <details className="step-why">
        <summary>
          <ChevronDown className="size-4 transition-transform" aria-hidden />
          {t("why")}
        </summary>
        <p>{step.why}</p>
      </details>
    </li>
  );
}

type Mode = "player" | "all";

export function StepsView() {
  const t = useTranslations("tutor.steps");
  const { state, actions } = useTutor();
  const { solution, activeStepId, writtenSteps } = state;
  const [mode, setMode] = useState<Mode>("player");
  if (!solution) return null;

  const steps = solution.steps;
  const current = Math.max(0, steps.findIndex((s) => s.id === activeStepId));
  const atEnd = current === steps.length - 1;
  const shown = mode === "all" ? steps : [steps[current]];
  const written = writtenSteps.size > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted" aria-live="polite">
          {mode === "player" ? t("stepOf", { current: current + 1, total: steps.length }) : t("count", { count: steps.length })}
        </p>
        <div className="segmented" role="group" aria-label={t("how")}>
          <button type="button" aria-pressed={mode === "player"} onClick={() => setMode("player")}>
            {t("player")}
          </button>
          <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            {t("all")}
          </button>
        </div>
      </div>

      {mode === "player" ? (
        <div className="progress" aria-hidden>
          {steps.map((s, i) => (
            <i key={s.id} data-on={i <= current || undefined} />
          ))}
        </div>
      ) : null}

      <ol className="space-y-2.5" start={mode === "player" ? current + 1 : 1}>
        {shown.map((s) => {
          const i = steps.indexOf(s);
          return (
            <StepCard key={s.id} step={s} index={i} active={mode === "all" && activeStepId === s.id} onFocus={() => actions.focusStep(s.id)} />
          );
        })}
      </ol>

      {mode === "player" ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={current === 0}
            onClick={() => actions.focusStep(steps[current - 1].id)}
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t("back")}
          </button>
          {atEnd ? (
            <button type="button" className="btn btn-ghost" onClick={() => setMode("all")}>
              {t("review")}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => actions.focusStep(steps[current + 1].id)}>
              {t("next")}
              <ChevronRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ) : null}

      {mode === "all" || atEnd ? (
        <div className="answer-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-good">{t("answer")}</p>
          <div translate="no">
            <Katex latex={solution.finalAnswer} display />
          </div>
          {solution.confidenceNotes.map((n) => (
            <p key={n} className="mt-1 text-xs text-muted">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      <button type="button" className="btn btn-secondary w-full" onClick={actions.writeStepsToBoard}>
        <PenLine className="size-4" aria-hidden />
        {written ? t("rewrite") : t("write")}
      </button>

      <TutorChat />
    </div>
  );
}
