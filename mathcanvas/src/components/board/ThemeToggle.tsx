"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "mathcanvas:theme:v1";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Cycles system → light → dark. The choice is a per-browser convenience. */
export function ThemeToggle() {
  const t = useTranslations("theme");
  // Client-only component (the board is never server-rendered).
  const [theme, setTheme] = useState<Theme>(readTheme);

  const cycle = () => {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the theme still applies for this visit */
    }
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={cycle}
      aria-label={t("switch", { current: t(theme), next: t(NEXT[theme]) })}
      title={t("title", { current: t(theme) })}
    >
      <Icon className="size-4.5" aria-hidden />
    </button>
  );
}
