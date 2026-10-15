"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** The board: blackboard (default), green chalkboard, or whiteboard. */
type Theme = "black" | "green" | "light";
const KEY = "mathcanvas:theme:v1";
const NEXT: Record<Theme, Theme> = { black: "green", green: "light", light: "black" };

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(KEY);
    // Anything else (nothing saved, or "dark", the older night theme) is the blackboard.
    return t === "light" || t === "green" ? t : "black";
  } catch {
    return "black";
  }
}

/** Cycles blackboard → green board → whiteboard. The choice is a per-browser convenience. */
export function ThemeToggle() {
  const t = useTranslations("theme");
  // Client-only component (the board is never server-rendered).
  const [theme, setTheme] = useState<Theme>(readTheme);

  const cycle = () => {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "black") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "black") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the board still applies for this visit */
    }
  };

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={cycle}
      aria-label={t("switch", { current: t(theme), next: t(NEXT[theme]) })}
      title={t("title", { current: t(theme) })}
    >
      <span className="theme-swatch" data-board={theme} aria-hidden />
    </button>
  );
}
