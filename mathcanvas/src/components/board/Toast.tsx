"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useBoard } from "./BoardProvider";

const TIMEOUT_MS = 6000;

/** Brief confirmation with Undo — the safety net for destructive actions. */
export function Toast() {
  const t = useTranslations("toast");
  const { state, actions } = useBoard();
  const toast = state.toast;
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) return;
    const t = window.setTimeout(actions.dismissToast, TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [id, actions]);

  return (
    <div aria-live="polite" className="contents">
      {toast ? (
        <div className="toast floating" role="status">
          <span>{t(toast.message)}</span>
          {toast.undoable ? (
            <button
              type="button"
              className="btn btn-ghost min-h-8 px-2 text-brand-strong"
              onClick={() => {
                actions.undo();
                actions.dismissToast();
              }}
            >
              {t("undo")}
            </button>
          ) : null}
          <button type="button" className="icon-btn size-8" onClick={actions.dismissToast} aria-label={t("dismiss")}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
