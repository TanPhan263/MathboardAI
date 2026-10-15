"use client";

import { CircleCheck, CircleX, RefreshCw, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Katex } from "@/components/ui/Katex";
import { useTutor } from "./TutorProvider";

export function PracticeView() {
  const t = useTranslations("tutor.practiceView");
  const { state, actions } = useTutor();
  const { practice, busy } = state;
  const [answer, setAnswer] = useState("");
  if (!practice) return null;
  const { problem, result } = practice;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) actions.submitPracticeAnswer(answer);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {t("intro")} {problem.focus}
      </p>
      <div className="answer-card">
        <Katex latex={problem.latex} display />
      </div>

      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="practice-answer" className="text-sm font-medium text-ink">
          {t("answer")}
        </label>
        <div className="flex gap-2">
          <input
            id="practice-answer"
            className="field"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t(`placeholder.${problem.topic}`)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="practice-help"
          />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!answer.trim() || busy}>
            {t("check")}
          </button>
        </div>
        <p id="practice-help" className="text-xs text-muted">
          {t(`help.${problem.topic}`)}
        </p>
      </form>

      {result ? (
        <div
          role="status"
          className="result-card"
          data-ok={result.status === "correct" || undefined}
        >
          {result.status === "correct" ? (
            <CircleCheck className="size-5 shrink-0 text-good" aria-hidden />
          ) : (
            <CircleX className="size-5 shrink-0 text-bad" aria-hidden />
          )}
          <p className="text-sm text-ink">{result.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={actions.putPracticeOnBoard} disabled={practice.placed}>
          <SquarePen className="size-4" aria-hidden />
          {practice.placed ? t("onBoard") : t("workOnBoard")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setAnswer("");
            actions.newPractice();
          }}
        >
          <RefreshCw className="size-4" aria-hidden />
          {t("new")}
        </button>
      </div>
    </div>
  );
}
