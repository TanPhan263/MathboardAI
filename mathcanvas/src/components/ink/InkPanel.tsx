"use client";

import { BookOpen, ChartLine, CircleAlert, CircleCheck, GraduationCap, Lightbulb, Link2, Loader2, RotateCcw, ScanText, Scissors, Sparkles, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useBoard } from "@/components/board/BoardProvider";
import { MoveGrip, ResizeGrip } from "@/components/board/objects";
import { useTutor } from "@/components/tutor/TutorProvider";
import { Katex } from "@/components/ui/Katex";
import type { Rect } from "@/lib/board/geometry";
import type { Camera } from "@/lib/board/types";
import type { InkResult, InkToken } from "@/lib/ink/recognize";
import type { Sym } from "@/lib/ink/symbols";
import { solveProblem } from "@/lib/math/solve";
import { type Training, useInk } from "./InkProvider";

/** How a symbol is shown on its tile. */
const SHOW: Partial<Record<Sym, string>> = { "-": "−", "·": "×" };
const show = (s: Sym) => SHOW[s] ?? s;
/**
 * Symbols with a spoken name (screen readers), by message key; digits and letters
 * read as themselves. Keys are words: next-intl reads "." in a key as nesting.
 */
const NAMED: Partial<Record<Sym, string>> = {
  "-": "minus",
  "+": "plus",
  "=": "equals",
  "<": "less",
  ">": "greater",
  "≤": "atMost",
  "≥": "atLeast",
  "(": "open",
  ")": "close",
  "/": "divide",
  ".": "point",
  "·": "times",
  "?": "unknown",
};

/** "plus", "mở ngoặc"…: what a screen reader says for a symbol. */
function useSpoken() {
  const t = useTranslations("ink.symbol");
  return (s: Sym) => {
    const key = NAMED[s];
    return key ? t(key) : s;
  };
}

const isTyping = (t: EventTarget | null) =>
  !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], math-field");

const toScreen = (b: Rect, cam: Camera) => ({
  left: b.x * cam.z + cam.x,
  top: b.y * cam.z + cam.y,
  right: (b.x + b.w) * cam.z + cam.x,
  bottom: (b.y + b.h) * cam.z + cam.y,
});

function kindOf(r: InkResult): "system" | "inequality" | "equation" | "expression" {
  if (r.rows > 1) return "system";
  if (/[<>]/.test(r.ascii)) return "inequality";
  if (r.ascii.includes("=")) return "equation";
  return "expression";
}

/** Boxes drawn over the ink in world space: what each symbol was read as. */
export function InkOverlay() {
  const { state } = useInk();
  const { result, activeKey, box } = state;
  if (!box) return null;
  const pad = 5;
  return (
    <g pointerEvents="none" aria-hidden>
      <rect
        x={box.x - 14}
        y={box.y - 14}
        width={box.w + 28}
        height={box.h + 28}
        rx={10}
        fill="var(--brand)"
        fillOpacity={0.04}
        stroke="var(--brand)"
        strokeOpacity={0.5}
        strokeDasharray="6 5"
        vectorEffect="non-scaling-stroke"
      />
      <MoveGrip x={box.x + box.w + 14} y={box.y - 14 - 6} target="ink" />
      <ResizeGrip x={box.x + box.w + 14} y={box.y + box.h + 14} target="ink" />
      {result?.tokens.map((t) =>
        t.key === activeKey || t.uncertain ? (
          <rect
            key={t.key}
            x={t.box.x - pad}
            y={t.box.y - pad}
            width={t.box.w + pad * 2}
            height={t.box.h + pad * 2}
            rx={5}
            fill={t.key === activeKey ? "var(--brand)" : "var(--warn)"}
            fillOpacity={0.1}
            stroke={t.key === activeKey ? "var(--brand)" : "var(--warn)"}
            strokeWidth={t.key === activeKey ? 2 : 1.25}
            strokeDasharray={t.key === activeKey ? undefined : "4 3"}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </g>
  );
}

/** Every symbol the reader knows, in keyboard rows. */
const KEYS: Sym[][] = [
  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  ["x", "y", "z", "a", "b", "c", "n", "t"],
  ["+", "-", "·", "/", "=", "<", ">", "≤", "≥"],
  ["(", ")", "."],
];

function SymbolPicker({
  token,
  canJoin,
  onPick,
  onSplit,
  onJoin,
}: {
  token: InkToken;
  canJoin: boolean;
  onPick: (s: Sym) => void;
  onSplit: () => void;
  onJoin: () => void;
}) {
  const t = useTranslations("ink");
  const spoken = useSpoken();
  const guesses = token.candidates.map((c) => c.symbol).filter((s) => s !== token.symbol && s !== "?").slice(0, 4);
  return (
    <div className="ink-picker" role="group" aria-label={t("changeTo", { name: spoken(token.symbol) })}>
      <div className="flex flex-wrap items-center gap-1">
        {guesses.map((s) => (
          <button key={s} type="button" className="ink-chip" onClick={() => onPick(s)} aria-label={spoken(s)}>
            {show(s)}
          </button>
        ))}
        <span className="ms-auto flex gap-1">
          {token.strokeIds.length > 1 ? (
            <button type="button" className="btn btn-ghost min-h-8 gap-1 px-2 text-xs" onClick={onSplit} title={t("splitTitle")}>
              <Scissors className="size-3.5" aria-hidden />
              {t("split")}
            </button>
          ) : null}
          {canJoin ? (
            <button type="button" className="btn btn-ghost min-h-8 gap-1 px-2 text-xs" onClick={onJoin} title={t("joinTitle")}>
              <Link2 className="size-3.5" aria-hidden />
              {t("joinNext")}
            </button>
          ) : null}
        </span>
      </div>
      <div className="ink-keys" translate="no">
        {KEYS.map((row, i) => (
          <div key={i} className="ink-keys-row">
            {row.map((s) => (
              <button
                key={s}
                type="button"
                className="ink-chip ink-chip-sm"
                aria-pressed={s === token.symbol}
                onClick={() => onPick(s)}
                aria-label={spoken(s)}
              >
                {show(s)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Symbols fixed so far, and training a model on the learner's own handwriting. */
function TrainingFooter({ training, onTrain, onForget }: { training: Training; onTrain: () => void; onForget: () => void }) {
  const t = useTranslations("ink.train");
  const { saved, needed, personal, status, message } = training;
  const running = status === "running";
  const ready = saved >= needed;
  return (
    <footer className="ink-train">
      <div className="flex items-center justify-between gap-2">
        <span>
          {saved ? t("saved", { count: saved }) + (ready ? "" : t("more", { count: needed - saved })) : t("empty")}
          {personal ? t("personal") : ""}
        </span>
        {saved ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="btn btn-ghost min-h-7 gap-1 px-2 text-xs"
              disabled={!ready || running}
              onClick={onTrain}
              title={ready ? t("readyTitle") : t("needTitle", { count: needed - saved })}
            >
              {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <GraduationCap className="size-3.5" aria-hidden />}
              {running ? t("running") : t("button")}
            </button>
            <button
              type="button"
              className="icon-btn size-7"
              disabled={running}
              onClick={() => {
                if (window.confirm(t("confirmDelete"))) onForget();
              }}
              aria-label={t("delete")}
              title={t("deleteTitle")}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      {message ? (
        <p className={status === "failed" ? "text-bad" : undefined} role="status">
          {t(message.key, { count: message.count ?? 0 })}
        </p>
      ) : null}
    </footer>
  );
}

type Mode = "explain" | "hint" | "graph";
const ACTIONS: Array<{ mode: Mode; Icon: typeof BookOpen }> = [
  { mode: "explain", Icon: BookOpen },
  { mode: "hint", Icon: Lightbulb },
  { mode: "graph", Icon: ChartLine },
];

/** What the boxed handwriting was read as, with one-tap fixes and next steps. */
export function InkPanel() {
  const t = useTranslations("ink");
  const spoken = useSpoken();
  const { state: board, meta } = useBoard();
  const { actions: tutor } = useTutor();
  const { state, actions } = useInk();
  const { result, status, activeKey, box } = state;
  const panel = useRef<HTMLElement>(null);

  const check = useMemo(() => {
    if (!result) return null;
    if (!result.valid) return { ok: false, solvable: false, text: t("notMaths") };
    const solved = solveProblem(result.ascii);
    return solved.ok
      ? { ok: true, solvable: true, text: t("ready") }
      : { ok: false, solvable: false, text: solved.message };
  }, [result, t]);

  const run = (mode: Mode) => {
    const obj = actions.commit("ink");
    if (!obj) return;
    tutor.actOn(obj, mode);
    window.dispatchEvent(new Event("mathcanvas:open-tutor"));
  };

  // Beside the ink when there's room, else below or above it.
  const cam = board.camera;
  useLayoutEffect(() => {
    const el = panel.current;
    const surface = meta.svgRef.current?.getBoundingClientRect();
    if (!el || !box || !surface) return;
    const s = toScreen(box, cam);
    const gap = 24;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const minLeft = surface.width >= 640 ? 64 : 12; // clear of the toolbar
    const maxLeft = surface.width - w - 12;
    const maxTop = Math.max(8, surface.height - 12 - h);
    const clampTop = (t: number) => Math.min(Math.max(8, t), maxTop);
    let left: number;
    let top: number;
    if (s.right + gap <= maxLeft) [left, top] = [s.right + gap, clampTop(s.top)];
    else if (s.bottom + gap + h <= surface.height - 12) [left, top] = [s.left, s.bottom + gap];
    else if (s.top - gap - h >= 8) [left, top] = [s.left, s.top - gap - h];
    else if (s.left - gap - w >= minLeft) [left, top] = [s.left - gap - w, clampTop(s.top)];
    else [left, top] = [s.left, clampTop(s.bottom + gap)];
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  });

  useEffect(() => {
    if (status === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        if (activeKey) actions.setActive(null);
        else actions.dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, activeKey, actions]);

  if (status === "idle") return null;
  const active = result?.tokens.find((t) => t.key === activeKey) ?? null;
  const unsure = result?.tokens.filter((t) => t.uncertain).length ?? 0;
  const activeIndex = result?.tokens.findIndex((t) => t.key === activeKey) ?? -1;

  return (
    <section ref={panel} className="ink-panel floating" aria-label={t("panel")} onPointerDown={(e) => e.stopPropagation()}>
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <ScanText className="size-3.5" aria-hidden />
          {t("readAs")}
        </span>
        <span className="flex items-center gap-1">
          {result ? <span className="tag tag-soft">{t(`kind.${kindOf(result)}`)}</span> : null}
          <button type="button" className="icon-btn size-7" onClick={actions.dismiss} aria-label={t("close")}>
            <X className="size-4" aria-hidden />
          </button>
        </span>
      </header>

      {status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="flex items-start gap-1.5 text-sm text-bad">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("unreachable")}
          </p>
          <button type="button" className="btn btn-primary min-h-8 gap-1.5 px-3 text-sm" onClick={actions.retry}>
            <RotateCcw className="size-3.5" aria-hidden />
            {t("tryAgain")}
          </button>
        </div>
      ) : result ? (
        <>
          <div className="ink-preview" translate="no" aria-live="polite">
            <Katex latex={result.latex} display />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted" id="ink-symbols-label">
              {unsure ? t("checkHighlighted", { count: unsure }) : t("tapToFix")}
            </p>
            <div className="flex flex-wrap gap-1" role="group" aria-labelledby="ink-symbols-label" translate="no">
              {result.tokens.map((tok, i) => (
                <button
                  key={tok.key}
                  type="button"
                  className="ink-chip"
                  data-uncertain={tok.uncertain || undefined}
                  data-fixed={tok.fixed || undefined}
                  aria-expanded={tok.key === activeKey}
                  aria-label={t("chip", { index: i + 1, total: result.tokens.length, name: spoken(tok.symbol), unsure: String(tok.uncertain) })}
                  onClick={() => actions.setActive(tok.key === activeKey ? null : tok.key)}
                >
                  {show(tok.symbol)}
                </button>
              ))}
            </div>
            {active ? (
              <SymbolPicker
                key={active.key}
                token={active}
                canJoin={activeIndex >= 0 && activeIndex < result.tokens.length - 1}
                onPick={(s) => actions.choose(active.key, s)}
                onSplit={() => actions.split(active.key)}
                onJoin={() => actions.join(active.key)}
              />
            ) : null}
            {state.edited ? (
              <button type="button" className="btn btn-ghost mt-1 min-h-7 gap-1 px-2 text-xs" onClick={actions.undoFixes}>
                <RotateCcw className="size-3.5" aria-hidden />
                {t("undoFixes")}
              </button>
            ) : null}
          </div>

          {check ? (
            <p className={`flex items-start gap-1.5 text-xs ${check.ok ? "text-good" : "text-warn"}`} role="status">
              {check.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
              <span>{check.text}</span>
            </p>
          ) : null}

          <div className="ink-actions" role="group" aria-label={t("next")}>
            {ACTIONS.map(({ mode, Icon }) => (
              <button key={mode} type="button" className="app-tile" disabled={!check?.solvable} onClick={() => run(mode)}>
                <span className="app-tile-icon" aria-hidden>
                  <Icon className="size-4.5" />
                </span>
                {t(mode)}
              </button>
            ))}
            <button type="button" className="app-tile" disabled={!result.valid} onClick={() => actions.commit("neat")}>
              <span className="app-tile-icon" aria-hidden>
                <Sparkles className="size-4.5" />
              </span>
              {t("beautify")}
            </button>
          </div>

          <TrainingFooter training={state.training} onTrain={actions.train} onForget={actions.forget} />
        </>
      ) : null}
    </section>
  );
}
