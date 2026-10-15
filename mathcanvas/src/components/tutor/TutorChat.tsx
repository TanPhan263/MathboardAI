"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { QUICK_QUESTIONS } from "@/lib/tutor/provider";
import { useTutor } from "./TutorProvider";

export function TutorChat() {
  const t = useTranslations("tutor.chat");
  const { state, actions } = useTutor();
  const { solution, activeStepId, messages, busy } = state;
  const [text, setText] = useState("");
  if (!solution) return null;

  const stepId = activeStepId ?? solution.steps[0].id;
  const stepNo = solution.steps.findIndex((s) => s.id === stepId) + 1;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    actions.ask("free", q);
    setText("");
  };

  return (
    <section aria-labelledby="chat-title" className="space-y-3 border-t border-line pt-4">
      <h3 id="chat-title" className="text-sm font-semibold text-ink">
        {t("title", { n: stepNo })}
      </h3>
      <p className="-mt-2 text-xs text-muted">{t("pick")}</p>

      <div className="flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q.intent}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => actions.ask(q.intent)}
          >
            {t(`quick.${q.intent}`)}
          </button>
        ))}
      </div>

      <div className="space-y-2" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className="chat-bubble" data-role={m.role}>
            <span className="sr-only">{m.role === "user" ? t("you") : t("tutor")}</span>
            {m.text}
          </div>
        ))}
        {busy && messages.at(-1)?.role === "user" ? (
          <div className="chat-bubble" data-role="tutor">
            <span className="typing" aria-label={t("typing")}>
              <i /> <i /> <i />
            </span>
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="tutor-question">
          {t("ask")}
        </label>
        <input
          id="tutor-question"
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={!text.trim() || busy} aria-label={t("send")}>
          <Send className="size-4" aria-hidden />
        </button>
      </form>
      <p className="text-xs text-muted">{t("provider", { name: state.providerLabel })}</p>
    </section>
  );
}
