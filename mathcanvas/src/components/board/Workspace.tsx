"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { type MathLang, setMathLang } from "@/lib/math/lang";
import { TutorDock } from "@/components/tutor/TutorDock";
import { TutorPanel } from "@/components/tutor/TutorPanel";
import { TutorProvider } from "@/components/tutor/TutorProvider";
import { InkPanel } from "@/components/ink/InkPanel";
import { InkProvider } from "@/components/ink/InkProvider";
import { BoardProvider } from "./BoardProvider";
import { Toast } from "./Toast";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { ViewControls } from "./ViewControls";
import { Whiteboard } from "./Whiteboard";

const MINIMIZED_KEY = "mathcanvas:tutor-minimized";

function Shell() {
  const [tutorOpen, setTutorOpen] = useState(false);
  // Desktop: the docked tutor can be minimized to a floating button. It starts minimized,
  // leaving the board free, until the learner opens it; their choice is remembered per browser
  // (the board only renders in the browser, so storage is readable here).
  const [minimized, setMinimizedState] = useState(() => {
    try {
      return localStorage.getItem(MINIMIZED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setMinimized = (next: boolean) => {
    setMinimizedState(next);
    try {
      localStorage.setItem(MINIMIZED_KEY, next ? "1" : "0");
    } catch {}
  };
  // Board actions that produce tutor output (e.g. Explain, Graph) open the drawer.
  useEffect(() => {
    const open = () => {
      setTutorOpen(true);
      setMinimizedState(false);
    };
    window.addEventListener("mathcanvas:open-tutor", open);
    return () => window.removeEventListener("mathcanvas:open-tutor", open);
  }, []);
  return (
    <div className="flex h-dvh flex-col bg-app">
      <TopBar tutorOpen={tutorOpen} onToggleTutor={() => setTutorOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        <main className="board-surface" id="board">
          <Whiteboard />
          <Toolbar />
          <ViewControls />
          <InkPanel />
          <Toast />
        </main>
        <div id="tutor-drawer" className="tutor-drawer" data-open={tutorOpen || undefined} data-minimized={minimized || undefined}>
          <TutorPanel onClose={() => setTutorOpen(false)} onMinimize={() => setMinimized(true)} />
        </div>
        {/* While the drawer is hidden (minimized on desktop, closed on smaller screens). */}
        <div className="tutor-dock-host" data-open={tutorOpen || undefined} data-minimized={minimized || undefined}>
          <TutorDock
            onOpen={() => {
              setMinimized(false);
              setTutorOpen(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Board + tutor wired together. The only place providers are composed. */
export default function Workspace() {
  // The solver writes its steps in the page's language; set it before anything solves.
  const locale = useLocale() as MathLang;
  setMathLang(locale);
  return (
    <BoardProvider>
      <InkProvider>
        {/* A fresh tutor per language: cached solutions were written in the old one. */}
        <TutorProvider key={locale}>
          <Shell />
        </TutorProvider>
      </InkProvider>
    </BoardProvider>
  );
}
