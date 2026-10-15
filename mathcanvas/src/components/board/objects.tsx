"use client";

import { CircleCheck, CircleHelp, CircleX, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, memo, useEffect, useRef } from "react";
import { boundsOf, drawnInk, inkBounds, strokePath } from "@/lib/board/geometry";
import type {
  BoardObject,
  GraphObject,
  MathObject,
  ShapeObject,
  StrokeObject,
  TextObject,
} from "@/lib/board/types";
import type { GraphTone } from "@/lib/math/graph";
import type { ValidationStatus } from "@/lib/math/types";
import { Katex } from "@/components/ui/Katex";
import { SpacePlot } from "./SpaceView";

export const GRIP = { w: 26, h: 26 };
const CORNER = 14;

/**
 * Handles are drawn at one size on screen: whatever the zoom, and however big
 * the learner made the object. `--grip-k` (set on the board, and on each scaled
 * object) undoes both, around the handle's anchor point.
 */
const FIXED = { transform: "scale(var(--grip-k, 1))" };

/** Corner handle centred on (x, y) that resizes `target` (an object id, or "ink"), with any tool. */
export function ResizeGrip({ x, y, target }: { x: number; y: number; target: string }) {
  const t = useTranslations("board");
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="resize-grip" data-resize={target} style={FIXED} pointerEvents="all">
        <title>{t("dragResize")}</title>
        <g transform={`translate(${-CORNER / 2} ${-CORNER / 2})`}>
          <rect width={CORNER} height={CORNER} rx={3} fill="var(--panel)" stroke="var(--brand)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={`M4 ${CORNER - 4} L${CORNER - 4} 4 M8 ${CORNER - 4} L${CORNER - 4} 8`} stroke="var(--brand)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </g>
  );
}

/**
 * Drag handle that works with every tool, so the learner can move maths or a
 * graph without switching to Select. (x, y) is its bottom-right corner, so it
 * sits just above an object's top-right corner. `target` is an object id, or
 * "ink" for the handwriting being read (see Whiteboard's pointer handling).
 */
export function MoveGrip({ x, y, target }: { x: number; y: number; target: string }) {
  const t = useTranslations("board");
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="move-grip" data-drag={target} style={FIXED} pointerEvents="all">
        <title>{t("dragMove")}</title>
        <g transform={`translate(${-GRIP.w} ${-GRIP.h})`}>
          <rect width={GRIP.w} height={GRIP.h} rx={GRIP.h / 2} fill="var(--panel)" stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
          <GripVertical x={6} y={6} width={14} height={14} color="var(--muted)" />
        </g>
      </g>
    </g>
  );
}

function SelectionBox({ o }: { o: BoardObject }) {
  const b = boundsOf(o);
  const pad = 8;
  return (
    <rect
      x={b.x - o.x - pad}
      y={b.y - o.y - pad}
      width={b.w + pad * 2}
      height={b.h + pad * 2}
      rx={6}
      fill="none"
      stroke="var(--brand)"
      strokeWidth={1.5}
      pointerEvents="none"
    />
  );
}

function StrokeView({ o, selected }: { o: StrokeObject; selected: boolean }) {
  const d = strokePath(o.points);
  return (
    <>
      <path d={d} fill="none" stroke={o.color} strokeWidth={o.size} strokeLinecap="round" strokeLinejoin="round" />
      {/* Wider invisible path so thin lines are easy to grab and erase. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(o.size, 16)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
      {selected ? <SelectionBox o={o} /> : null}
    </>
  );
}

function ShapeView({ o, selected }: { o: ShapeObject; selected: boolean }) {
  const common = { fill: "none", stroke: o.color, strokeWidth: o.size, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const hit = { fill: "none", stroke: "transparent", strokeWidth: Math.max(o.size, 16), pointerEvents: "stroke" as const };
  const x = Math.min(0, o.w);
  const y = Math.min(0, o.h);
  const w = Math.abs(o.w);
  const h = Math.abs(o.h);
  return (
    <>
      {o.kind === "line" ? (
        <>
          <line x1={0} y1={0} x2={o.w} y2={o.h} {...common} />
          <line x1={0} y1={0} x2={o.w} y2={o.h} {...hit} />
        </>
      ) : o.kind === "rect" ? (
        <>
          <rect x={x} y={y} width={w} height={h} rx={4} {...common} />
          <rect x={x} y={y} width={w} height={h} rx={4} {...hit} />
        </>
      ) : (
        <>
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...hit} />
        </>
      )}
      {selected ? <SelectionBox o={o} /> : null}
    </>
  );
}

function TextView({ o, selected }: { o: TextObject; selected: boolean }) {
  return (
    <foreignObject width={640} height={240} overflow="visible" pointerEvents="none">
      <div className="board-text" data-selected={selected || undefined} style={{ color: o.color, fontSize: o.fontSize }}>
        {o.text}
      </div>
    </foreignObject>
  );
}

/** Inline editor for new or existing text; commits on blur / Enter. */
export function TextEditor({
  x,
  y,
  initial,
  color,
  fontSize,
  onCommit,
}: {
  x: number;
  y: number;
  initial: string;
  color: string;
  fontSize: number;
  onCommit: (text: string) => void;
}) {
  const t = useTranslations("board");
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onCommit(ref.current?.innerText.trim() ?? "");
  };

  return (
    <foreignObject x={x} y={y} width={640} height={240} overflow="visible">
      <div
        ref={ref}
        className="board-text board-text-editing"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={t("textNote")}
        spellCheck={false}
        style={{ color, fontSize }}
        onBlur={finish}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            finish();
          }
        }}
      >
        {initial}
      </div>
    </foreignObject>
  );
}

const STATUS: Record<ValidationStatus, { Icon: typeof CircleCheck; cls: string }> = {
  passed: { Icon: CircleCheck, cls: "text-good" },
  failed: { Icon: CircleX, cls: "text-bad" },
  unverified: { Icon: CircleHelp, cls: "text-warn" },
};

/** Status is always icon + text, never colour alone. */
export function StatusBadge({ status }: { status: ValidationStatus }) {
  const t = useTranslations("board.status");
  const { Icon, cls } = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${cls}`}>
      <Icon className="size-3.5" aria-hidden />
      {t(status)}
    </span>
  );
}

/** A problem read from handwriting that still looks handwritten. */
function InkMathView({ o, ink, selected }: { o: MathObject; ink: StrokeObject[]; selected: boolean }) {
  const b = inkBounds(ink);
  const pad = 10;
  return (
    <>
      <rect
        x={b.x - pad}
        y={b.y - pad}
        width={b.w + pad * 2}
        height={b.h + pad * 2}
        rx={8}
        fill="transparent"
        stroke={selected ? "var(--brand)" : "transparent"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        pointerEvents="all"
      />
      {ink.map((s) => (
        <path
          key={s.id}
          transform={`translate(${s.x} ${s.y})`}
          d={strokePath(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.size}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ))}
      {o.validation ? (
        <foreignObject x={b.x - pad} y={b.y - pad - 24} width={200} height={22} pointerEvents="none">
          <StatusBadge status={o.validation} />
        </foreignObject>
      ) : null}
      <MoveGrip x={b.x + b.w + pad} y={b.y - pad - 4} target={o.id} />
      {selected ? <ResizeGrip x={b.x + b.w + pad} y={b.y + b.h + pad} target={o.id} /> : null}
    </>
  );
}

function MathView({ o, selected }: { o: MathObject; selected: boolean }) {
  const t = useTranslations("board");
  const ink = drawnInk(o);
  if (ink) return <InkMathView o={o} ink={ink} selected={selected} />;
  if (o.role === "step") {
    return (
      <foreignObject width={720} height={320} overflow="visible" pointerEvents="none">
        <div className="widget" data-selected={selected || undefined} translate="no">
          {/* The header drags the step, whatever tool is active. */}
          <div className="widget-head move-grip" data-drag={o.id} title={t("dragMove")}>
            <span className="flex items-center gap-1.5">
              <GripVertical className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="tag tag-violet">{t("tutorTag")}</span>
              <span>{o.caption}</span>
            </span>
            {o.validation ? <StatusBadge status={o.validation} /> : null}
          </div>
          <div className="widget-body">
            <Katex latex={o.latex} display />
          </div>
          <span className="resize-corner" data-resize={o.id} title={t("dragResize")} />
        </div>
      </foreignObject>
    );
  }
  const head = o.role === "practice" || o.validation;
  return (
    <foreignObject width={720} height={320} overflow="visible" pointerEvents="none">
      <div className="math-ink" data-selected={selected || undefined} translate="no">
        {head ? (
          <div className="math-ink-head move-grip" data-drag={o.id} title={t("dragMove")}>
            <GripVertical className="size-3.5 shrink-0 text-muted" aria-hidden />
            {o.role === "practice" ? <span className="tag tag-accent">{t("practiceTag")}</span> : null}
            {o.validation ? <StatusBadge status={o.validation} /> : null}
          </div>
        ) : null}
        <Katex latex={o.latex} display />
        <span className="resize-corner" data-resize={o.id} title={t("dragResize")} />
      </div>
    </foreignObject>
  );
}

function niceStep(span: number): number {
  const raw = span / 8;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

const TONE: Record<GraphTone, string> = { brand: "var(--brand)", accent: "var(--accent)", violet: "var(--violet)" };
const HEAD = 30;
const FOOT = 26;

/**
 * The x- and y-ranges actually shown. A geometry figure keeps one unit the
 * same length on both axes (circles stay round), whatever the widget's shape.
 */
export function graphFrame(o: GraphObject): { domain: [number, number]; range: [number, number] } {
  if (!o.equal) return { domain: o.domain, range: o.range };
  const plotH = o.h - HEAD - FOOT;
  const unit = Math.max((o.domain[1] - o.domain[0]) / o.w, (o.range[1] - o.range[0]) / plotH);
  const cx = (o.domain[0] + o.domain[1]) / 2;
  const cy = (o.range[0] + o.range[1]) / 2;
  return {
    domain: [cx - (unit * o.w) / 2, cx + (unit * o.w) / 2],
    range: [cy - (unit * plotH) / 2, cy + (unit * plotH) / 2],
  };
}

/** Graph coordinates of a point given relative to the graph's top-left corner. */
export function graphPoint(o: GraphObject, lx: number, ly: number): { x: number; y: number } {
  const plotH = o.h - HEAD - FOOT;
  const { domain: [x0, x1], range: [y0, y1] } = graphFrame(o);
  return { x: x0 + (lx / o.w) * (x1 - x0), y: y0 + ((HEAD + plotH - ly) / plotH) * (y1 - y0) };
}

/** Grid step for dragged points: half units on a close-up, whole or coarser further out. */
export function graphSnap(o: GraphObject): number {
  const span = o.domain[1] - o.domain[0];
  return span <= 16 ? 0.5 : span <= 40 ? 1 : span <= 100 ? 5 : 10;
}

/** A system's cases on one line, to fit under the graph. */
const inline = (latex: string) => latex.replace(/\\(begin|end)\{cases\}/g, "").replace(/\\\\/g, ",\\quad ");

const decideGraph = (id: string, apply: boolean) =>
  window.dispatchEvent(new CustomEvent("mathcanvas:graph-decision", { detail: { id, apply } }));

function GraphView({ o, selected }: { o: GraphObject; selected: boolean }) {
  const t = useTranslations("board");
  const plotH = o.h - HEAD - FOOT;
  const { domain: [x0, x1], range: [y0, y1] } = graphFrame(o);
  const figure = !!(o.space || o.equal);
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * o.w;
  const sy = (y: number) => HEAD + plotH - ((y - y0) / (y1 - y0)) * plotH;
  const clampY = (y: number) => Math.min(y1 + (y1 - y0) * 2, Math.max(y0 - (y1 - y0) * 2, y));
  const xStep = niceStep(x1 - x0);
  const yStep = niceStep(y1 - y0);
  const xTicks: number[] = [];
  for (let t = Math.ceil(x0 / xStep) * xStep; t <= x1; t += xStep) xTicks.push(Number(t.toFixed(6)));
  const yTicks: number[] = [];
  for (let t = Math.ceil(y0 / yStep) * yStep; t <= y1; t += yStep) yTicks.push(Number(t.toFixed(6)));
  const axisX = x0 <= 0 && x1 >= 0 ? sx(0) : 0;
  const axisY = y0 <= 0 && y1 >= 0 ? sy(0) : HEAD + plotH;
  const clipId = `clip-${o.id}`;
  const halo = { stroke: "var(--canvas)", strokeWidth: 4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };

  return (
    <g>
      <rect width={o.w} height={o.h} rx={10} fill="var(--canvas)" stroke={selected ? "var(--brand)" : "var(--line-strong)"} strokeWidth={selected ? 2 : 1} />
      <path d={`M0.5,${HEAD} V10.5 Q0.5,0.5 10.5,0.5 H${o.w - 10.5} Q${o.w - 0.5},0.5 ${o.w - 0.5},10.5 V${HEAD} Z`} fill="var(--panel-2)" />
      <line x1={0} x2={o.w} y1={HEAD} y2={HEAD} stroke="var(--line)" />
      <GripVertical x={8} y={8} width={14} height={14} color="var(--muted)" />
      <text x={30} y={20} fontSize={12} fontWeight={600} fill="var(--muted)">{t(figure ? "figure" : "graph")}</text>
      <text x={o.w - 10} y={20} fontSize={11} fill="var(--muted)" textAnchor="end">
        {o.title.length > 48 ? `${o.title.slice(0, 47)}…` : o.title}
      </text>
      {/* The header is the graph's drag handle, whatever tool is active. */}
      <rect className="move-grip" data-drag={o.id} width={o.w} height={HEAD} fill="transparent" pointerEvents="all">
        <title>{t("dragMove")}</title>
      </rect>

      {o.space ? <SpacePlot o={{ ...o, space: o.space }} top={HEAD} height={plotH} /> : null}
      {o.space ? null : (
      <>
      <clipPath id={clipId}>
        <rect y={HEAD} width={o.w} height={plotH} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {o.shade.map((s, i) => (
          <rect
            key={`s${i}`}
            x={sx(Math.max(s.lo, x0))}
            y={HEAD}
            width={Math.max(0, sx(Math.min(s.hi, x1)) - sx(Math.max(s.lo, x0)))}
            height={plotH}
            fill="var(--brand)"
            opacity={0.12}
          />
        ))}
        {xTicks.map((t) => (
          <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={HEAD} y2={HEAD + plotH} stroke="var(--line)" />
        ))}
        {yTicks.map((t) => (
          <line key={`gy${t}`} y1={sy(t)} y2={sy(t)} x1={0} x2={o.w} stroke="var(--line)" />
        ))}
        <line x1={0} x2={o.w} y1={axisY} y2={axisY} stroke="var(--muted)" strokeWidth={1.25} />
        <line y1={HEAD} y2={HEAD + plotH} x1={axisX} x2={axisX} stroke="var(--muted)" strokeWidth={1.25} />
        {xTicks.filter((t) => t !== 0).map((t) => (
          <text key={`tx${t}`} x={sx(t)} y={Math.min(HEAD + plotH - 4, axisY + 14)} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {t}
          </text>
        ))}
        {yTicks.filter((t) => t !== 0).map((t) => (
          <text key={`ty${t}`} x={Math.min(o.w - 18, axisX + 5)} y={sy(t) + 4} fontSize={10} fill="var(--muted)">
            {t}
          </text>
        ))}
        {o.asymptotes.map((a) => (
          <line key={`a${a}`} x1={sx(a)} x2={sx(a)} y1={HEAD} y2={HEAD + plotH} stroke="var(--bad)" strokeWidth={1.25} strokeDasharray="5 4" />
        ))}
        {o.curves.map((c, ci) =>
          c.segments.map((seg, si) => (
            <path
              key={`c${ci}-${si}`}
              className="graph-curve"
              d={seg.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(clampY(y)).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={TONE[c.tone]}
              strokeWidth={c.thin ? 1.75 : 2.5}
              strokeLinejoin="round"
              // A preview (not applied yet) is dashed, and so is a construction line.
              strokeDasharray={o.pending ? "8 5" : c.dashed ? "6 4" : undefined}
            />
          )),
        )}
        {o.marks.map((m) => (
          <g key={`m${m.x}-${m.y}`} className="graph-mark">
            <circle cx={sx(m.x)} cy={sy(m.y)} r={5.5} fill={m.open ? "var(--canvas)" : m.given ? "var(--brand)" : "var(--accent)"} stroke={m.given ? "var(--brand)" : "var(--accent)"} strokeWidth={2.5} />
            <text x={sx(m.x)} y={sy(m.y) - 11} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink)" {...halo}>
              {m.label}
            </text>
          </g>
        ))}
        {/* Drag these to change the problem: the maths on the board follows. */}
        {o.source
          ? (o.handles ?? []).map((h, i) => (
              <g
                key={`h${i}`}
                className="graph-handle"
                data-graph={o.id}
                data-handle={i}
                data-kind={h.kind}
                transform={`translate(${sx(h.x)} ${sy(clampY(h.y))})`}
                pointerEvents="all"
              >
                <title>{t(`handle.${h.kind}`)}</title>
                <circle r={13} fill="transparent" />
                {h.kind === "vertex" ? (
                  <rect x={-6} y={-6} width={12} height={12} rx={2} transform="rotate(45)" fill="var(--canvas)" stroke="var(--violet)" strokeWidth={2.5} />
                ) : (
                  <circle r={8} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="3 2.5" />
                )}
              </g>
            ))
          : null}
      </g>
      </>
      )}
      {o.curves.filter((c) => !c.thin).length > 1
        ? o.curves.filter((c) => !c.thin).map((c, i) => (
            <g key={`l${i}`} transform={`translate(${10 + i * 56} ${HEAD + 10})`}>
              <rect width={14} height={4} y={3} rx={2} fill={TONE[c.tone]} />
              <text x={18} y={9} fontSize={11} fontWeight={600} fill="var(--ink)" {...halo}>
                {c.label}
              </text>
            </g>
          ))
        : null}
      {o.pending ? (
        <foreignObject x={0} y={o.h - FOOT - 8} width={o.w} height={FOOT + 8}>
          <div className="graph-pending">
            <span className="graph-pending-math" translate="no">
              <Katex latex={inline(o.pending.latex)} />
            </span>
            <button type="button" className="btn btn-primary graph-pending-btn" data-graph-action="apply" onClick={() => decideGraph(o.id, true)}>
              {t("apply")}
            </button>
            <button type="button" className="btn btn-ghost graph-pending-btn" data-graph-action="cancel" onClick={() => decideGraph(o.id, false)}>
              {t("cancel")}
            </button>
          </div>
        </foreignObject>
      ) : (
        <text x={10} y={o.h - 9} fontSize={11} fill="var(--muted)">
          {o.handles?.length && o.source ? t("graphDragHint") : o.caption}
        </text>
      )}
      {selected ? <ResizeGrip x={o.w} y={o.h} target={o.id} /> : null}
    </g>
  );
}

export const ObjectView = memo(function ObjectView({ o, selected }: { o: BoardObject; selected: boolean }) {
  return (
    <g
      data-oid={o.id}
      data-type={o.type}
      transform={`translate(${o.x} ${o.y})${o.type === "math" && o.scale ? ` scale(${o.scale})` : ""}`}
      style={o.type === "math" && o.scale ? ({ "--grip-k": `calc(var(--zoom-k, 1) / ${o.scale})` } as CSSProperties) : undefined}
    >
      {o.type === "stroke" ? (
        <StrokeView o={o} selected={selected} />
      ) : o.type === "shape" ? (
        <ShapeView o={o} selected={selected} />
      ) : o.type === "text" ? (
        <TextView o={o} selected={selected} />
      ) : o.type === "math" ? (
        <MathView o={o} selected={selected} />
      ) : (
        <GraphView o={o} selected={selected} />
      )}
    </g>
  );
});
