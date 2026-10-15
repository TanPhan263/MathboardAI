"use client";

import { CircleCheck, CircleHelp, CircleX, Flag } from "lucide-react";
import type { LineStatus } from "@/lib/math/check";
import { Katex } from "@/components/ui/Katex";
import { useBoard } from "@/components/board/BoardProvider";
import { useTranslations } from "next-intl";
import { useTutor } from "./TutorProvider";

const META: Record<LineStatus, { Icon: typeof Flag; cls: string }> = {
  start: { Icon: Flag, cls: "text-muted" },
  passed: { Icon: CircleCheck, cls: "text-good" },
  failed: { Icon: CircleX, cls: "text-bad" },
  unverified: { Icon: CircleHelp, cls: "text-warn" },
};

export function CheckView() {
  const t = useTranslations("tutor.check");
  const { state, actions } = useTutor();
  const { state: board } = useBoard();
  const { checks } = state;
  if (!checks) return null;

  const firstBad = checks.find((c) => c.status === "failed");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted" aria-live="polite">
        {firstBad
          ? t("wrongAt", { line: firstBad.index + 1 })
          : checks.every((c) => c.status === "passed" || c.status === "start")
            ? t("allGood")
            : t("some")}
      </p>
      <ol className="space-y-2">
        {checks.map((c) => {
          const { Icon, cls } = META[c.status];
          const obj = board.byId.get(c.objectId);
          return (
            <li key={c.objectId} className="check-card" data-status={c.status}>
              <button type="button" className="w-full text-left" onClick={() => actions.focusObject(c.objectId)}>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${cls}`}>
                  <Icon className="size-4" aria-hidden />
                  {t("line", { line: c.index + 1, label: t(c.status) })}
                </span>
                {obj?.type === "math" ? (
                  <span className="step-math">
                    <Katex latex={obj.latex} display />
                  </span>
                ) : null}
                <span className="block text-sm text-muted">{c.message}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
