"use client";

import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTutor } from "./TutorProvider";

export function HintView() {
  const t = useTranslations("tutor.hints");
  const { state, actions } = useTutor();
  const { solution, hintsShown } = state;
  if (!solution) return null;
  const total = solution.steps.length;
  const shown = solution.steps.slice(0, hintsShown);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("intro")}</p>
      <ol className="space-y-2">
        {shown.map((s, i) => (
          <li key={s.id} className="hint-card">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-muted">{t("of", { n: i + 1, total })}</p>
              <p className="text-sm text-ink">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {hintsShown < total ? (
          <button type="button" className="btn btn-secondary" onClick={actions.moreHint}>
            {t("another")}
          </button>
        ) : (
          <p className="text-sm text-muted">{t("allShown")}</p>
        )}
        <button type="button" className="btn btn-ghost" onClick={actions.explain}>
          {t("full")}
        </button>
      </div>
    </div>
  );
}
