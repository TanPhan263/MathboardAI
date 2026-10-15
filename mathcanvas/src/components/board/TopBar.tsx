"use client";

import { ChevronDown, CornerDownLeft, Languages, LibraryBig, PanelRight, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { getPathname, usePathname } from "@/i18n/navigation";
import { SAMPLE_PROBLEMS, type SampleProblem } from "@/lib/math/practice";
import { Katex } from "@/components/ui/Katex";
import { useBoard } from "./BoardProvider";
import { ThemeToggle } from "./ThemeToggle";

const GROUPS: Array<SampleProblem["group"]> = ["Equations", "Fractions", "Inequalities", "Systems", "Vectors", "Geometry2D", "Geometry3D", "Triangles", "Solids", "Space", "Parallel", "Conics"];

/** Typeset a problem typed as text (the parser loads on first use). */
async function latexOf(source: string): Promise<string> {
  const { sourceLatex } = await import("@/lib/math/display");
  return sourceLatex(source);
}

function ExamplesMenu() {
  const t = useTranslations("topbar");
  const locale = useLocale() as "vi" | "en";
  const { actions } = useBoard();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const place = async (source: string, latex?: string) => {
    const obj = actions.addMath({ latex: latex ?? (await latexOf(source)), source });
    actions.reveal(obj.id);
    setOpen(false);
  };
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <LibraryBig className="size-4" aria-hidden />
        <span className="only-from-sm">{t("examples")}</span>
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {open ? (
        <div className="menu floating" role="menu" aria-label={t("examplesMenu")}>
          <form
            className="menu-type"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void place(typed.trim()).then(() => setTyped(""));
            }}
          >
            <label className="menu-group" htmlFor="type-problem">
              {t("type.label")}
            </label>
            <div className="menu-type-row">
              <input
                id="type-problem"
                className="menu-type-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t("type.placeholder")}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn btn-primary px-2" disabled={!typed.trim()} aria-label={t("type.add")} title={t("type.add")}>
                <CornerDownLeft className="size-4" aria-hidden />
              </button>
            </div>
          </form>
          {GROUPS.map((g) => (
            <div key={g} role="group" aria-label={t(`groups.${g}`)}>
              <p className="menu-group">{t(`groups.${g}`)}</p>
              {SAMPLE_PROBLEMS.filter((s) => s.group === g).map((s) => {
                const input = typeof s.input === "string" ? s.input : s.input[locale];
                return (
                  <button
                    key={input}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => void place(input, s.latex)}
                  >
                    <span className="font-medium">{s.label[locale]}</span>
                    {s.latex ? (
                      <span className="text-muted" translate="no">
                        <Katex latex={s.latex} />
                      </span>
                    ) : (
                      <span className="menu-item-text text-muted">{input}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Vietnamese ⇄ English: the same board (it lives in this browser) at "/vi" or "/en".
 * A full page load, so nothing written in the old language stays mounted.
 */
function LanguageSwitch() {
  const t = useTranslations("topbar");
  const locale = useLocale();
  const pathname = usePathname();
  const next = locale === "vi" ? "en" : "vi";
  return (
    <button
      type="button"
      className="btn btn-ghost px-2"
      lang={next}
      aria-label={t("switchLanguageLabel")}
      title={t("switchLanguageLabel")}
      onClick={() => window.location.assign(getPathname({ href: pathname, locale: next }))}
    >
      <Languages className="size-4" aria-hidden />
      <span className="only-from-sm">{t("switchLanguage")}</span>
    </button>
  );
}

export function TopBar({ onToggleTutor, tutorOpen }: { onToggleTutor: () => void; tutorOpen: boolean }) {
  const t = useTranslations("topbar");
  const { state, actions } = useBoard();

  return (
    <header className="top-bar">
      <div className="brand-mark">
        <span className="brand-logo" aria-hidden>
          ∑
        </span>
        <span className="font-display only-from-sm text-[15px] font-bold tracking-tight" translate="no">
          MathCanvas
        </span>
      </div>

      <h1 className="board-tab font-display">
        <span className="text-muted" aria-hidden>
          #
        </span>
        <span>{t("boardTitle")}</span>
      </h1>

      <div className="flex items-center justify-end gap-1.5">
        <ExamplesMenu />
        <LanguageSwitch />
        <ThemeToggle />
        <button
          type="button"
          className="icon-btn"
          onClick={actions.clear}
          disabled={state.objects.length === 0}
          aria-label={t("clear")}
          title={t("clearTitle")}
        >
          <Trash2 className="size-4.5" aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-primary only-below-lg"
          onClick={onToggleTutor}
          aria-expanded={tutorOpen}
          aria-controls="tutor-drawer"
        >
          <PanelRight className="size-4" aria-hidden />
          {t("tutor")}
        </button>
      </div>
    </header>
  );
}
