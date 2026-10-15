"use client";

import { BookOpen, ChartLine, Dumbbell, GraduationCap, Lightbulb, ListChecks, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useState } from "react";
import { type QuickAction, type QuickResult, useTutor } from "./TutorProvider";

const QUICK: Array<{ action: QuickAction; label: "explain" | "hint" | "checkWork" | "graph" | "practice"; Icon: typeof BookOpen }> = [
  { action: "explain", label: "explain", Icon: BookOpen },
  { action: "hint", label: "hint", Icon: Lightbulb },
  { action: "checkWork", label: "checkWork", Icon: ListChecks },
  { action: "visualize", label: "graph", Icon: ChartLine },
  { action: "startPractice", label: "practice", Icon: Dumbbell },
];

/** Distance from the Tutor button's centre to each action's centre, in px. */
const RADIUS = 78;

/**
 * Where each action sits: a half circle on the board side of the Tutor button,
 * from straight above it (90°) round to straight below (270°).
 */
function spot(i: number, n: number): CSSProperties {
  const deg = 90 + (180 * i) / (n - 1);
  const rad = (deg * Math.PI) / 180;
  return { "--dx": `${Math.round(RADIUS * Math.cos(rad))}px`, "--dy": `${Math.round(-RADIUS * Math.sin(rad))}px` } as CSSProperties;
}

/**
 * The tutor while its drawer is out of the way: one button (fixed at the right
 * edge, vertically centred) that brings the drawer back, ringed by the five
 * actions so they work without opening it.
 */
export function TutorDock({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("tutor");
  const { actions } = useTutor();
  const [running, setRunning] = useState<QuickAction | null>(null);
  const [note, setNote] = useState<QuickResult | null>(null);

  const run = async (action: QuickAction) => {
    setRunning(action);
    try {
      setNote(await actions.quick(action));
    } catch {
      setNote({ tone: "bad", title: t("dock.failed") });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="tutor-dock">
      <div className="tutor-dock-ring" role="toolbar" aria-label={t("dock.toolbar")}>
        {QUICK.map(({ action, label, Icon }, i) => (
          <button
            key={action}
            type="button"
            className="tutor-dock-action"
            style={spot(i, QUICK.length)}
            onClick={() => run(action)}
            disabled={running !== null}
            aria-label={t(label)}
            data-label={t(label)}
          >
            {running === action ? <Loader2 className="size-4.5 animate-spin" aria-hidden /> : <Icon className="size-4.5" aria-hidden />}
          </button>
        ))}
        <button
          type="button"
          className="tutor-dock-main"
          onClick={() => {
            setNote(null);
            onOpen();
          }}
          aria-label={t("dock.open")}
          data-label={t("dock.label")}
        >
          <GraduationCap className="size-6" aria-hidden />
        </button>
      </div>

      {note ? (
        <div className="tutor-dock-note floating" data-tone={note.tone} role="status">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm font-semibold text-ink">{note.title}</p>
            <button type="button" className="icon-btn size-6 shrink-0" onClick={() => setNote(null)} aria-label={t("dock.dismiss")}>
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          {note.text ? <p className="mt-1 text-xs text-muted">{note.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
