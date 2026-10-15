"use client";

import { useLocale } from "next-intl";
import type { GraphObject } from "@/lib/board/types";
import { clipLine, type SpaceScene } from "@/lib/math/geometry/figure";

type V3 = [number, number, number];

/** Textbook view: Ox toward the viewer and left, Oy to the right, Oz up. */
export const DEFAULT_VIEW = { yaw: 0.62, pitch: 0.42 };

const TONE = { given: "var(--brand)", found: "var(--accent)", round: "var(--violet)" };

const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const fmt = (n: number) => String(Number(n.toFixed(2)));

/** Where a plane cuts the framing cube, as a polygon in order (or null). */
function planePatch(n: number[], d: number, lo: number[], hi: number[]): V3[] | null {
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) corners.push([i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const f = (p: number[]) => dot(n, p) + d;
  const pts: V3[] = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      const j = i | bit;
      if (j === i) continue;
      const [a, b] = [corners[i], corners[j]];
      const [fa, fb] = [f(a), f(b)];
      if (fa === 0) pts.push(a);
      if (fa * fb < 0) {
        const t = fa / (fa - fb);
        pts.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
      }
    }
  }
  const uniq = pts.filter((p, i) => pts.findIndex((q) => Math.hypot(...sub(p, q)) < 1e-9) === i);
  if (uniq.length < 3) return null;
  // Order around the centre, in the plane's own axes.
  const c = uniq.reduce<V3>((s, p) => [s[0] + p[0] / uniq.length, s[1] + p[1] / uniq.length, s[2] + p[2] / uniq.length], [0, 0, 0]);
  const nn = norm(n);
  const e1 = norm(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
  const e2 = cross(nn, e1);
  return uniq.sort((p, q) => Math.atan2(dot(sub(p, c), e2), dot(sub(p, c), e1)) - Math.atan2(dot(sub(q, c), e2), dot(sub(q, c), e1)));
}

/**
 * A rotatable 3-D figure inside a graph widget. Orthographic projection;
 * dragging the plot (see Whiteboard) changes yaw and pitch.
 */
/**
 * Edges of a convex solid, each marked hidden when every face it belongs to
 * faces away from the viewer. Faces are oriented outward from the centroid.
 */
function solidEdges(faces: number[][][], toViewer: V3): Array<{ a: number[]; b: number[]; hidden: boolean }> {
  const all = faces.flat();
  const c = all.reduce<V3>((s, p) => [s[0] + p[0] / all.length, s[1] + p[1] / all.length, s[2] + p[2] / all.length], [0, 0, 0]);
  const key = (p: number[]) => p.map((x) => x.toFixed(6)).join(",");
  const edges = new Map<string, { a: number[]; b: number[]; visible: boolean }>();
  for (const f of faces) {
    let n: V3 = [0, 0, 0];
    for (let i = 1; i + 1 < f.length && Math.hypot(...n) < 1e-12; i++) n = cross(sub(f[i], f[0]), sub(f[i + 1], f[0]));
    const fc = f.reduce<V3>((s, p) => [s[0] + p[0] / f.length, s[1] + p[1] / f.length, s[2] + p[2] / f.length], [0, 0, 0]);
    if (dot(n, sub(fc, c)) < 0) n = [-n[0], -n[1], -n[2]];
    const front = dot(n, toViewer) > 1e-9;
    f.forEach((p, i) => {
      const q = f[(i + 1) % f.length];
      const k = [key(p), key(q)].sort().join("|");
      const e = edges.get(k);
      if (e) e.visible ||= front;
      else edges.set(k, { a: p, b: q, visible: front });
    });
  }
  return [...edges.values()].map((e) => ({ a: e.a, b: e.b, hidden: !e.visible }));
}

export function SpacePlot({ o, top, height }: { o: GraphObject & { space: SpaceScene }; top: number; height: number }) {
  const s = o.space;
  // Coordinates read (1; 2; 3) in Vietnamese textbooks, (1, 2, 3) in English.
  const sep = useLocale() === "vi" ? "; " : ", ";
  const view = o.view ?? s.view ?? DEFAULT_VIEW;
  const { yaw, pitch } = view;
  const right: V3 = [-Math.sin(yaw), Math.cos(yaw), 0];
  const up: V3 = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];
  /** From the figure toward the eye. */
  const toViewer: V3 = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const scale = (Math.min(o.w, height) * 0.5) / (s.half * 1.75);
  const cx = o.w / 2;
  const cy = top + height / 2;
  const P = (p: number[]): [number, number] => {
    const q = sub(p, s.center);
    return [cx + dot(q, right) * scale, cy - dot(q, up) * scale];
  };
  const path = (pts: number[][]) => pts.map((p, i) => `${i ? "L" : "M"}${P(p).map((x) => x.toFixed(1)).join(",")}`).join(" ");
  const lo = s.center.map((x) => x - s.half);
  const hi = s.center.map((x) => x + s.half);
  const halo = { stroke: "var(--canvas)", strokeWidth: 4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };

  // Axes from the origin, a little past the frame.
  const reach = Math.max(...s.center.map((x) => Math.abs(x))) + s.half * 1.1;
  const axes = (["x", "y", "z"] as const).map((name, i) => {
    const end: V3 = [0, 0, 0];
    end[i] = reach;
    const back: V3 = [0, 0, 0];
    back[i] = -reach * 0.35;
    return { name, end, back };
  });

  return (
    <g data-orbit={o.id} className="space-plot">
      <rect x={0} y={top} width={o.w} height={height} fill="transparent" pointerEvents="all" style={{ cursor: "grab" }} />
      <clipPath id={`clip-${o.id}`}>
        <rect y={top} width={o.w} height={height} />
      </clipPath>
      <g clipPath={`url(#clip-${o.id})`} pointerEvents="none">
        {s.axes === false ? null : (
          <>
            {axes.map((a) => (
              <g key={a.name}>
                <path d={path([a.back, [0, 0, 0]])} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" fill="none" />
                <path d={path([[0, 0, 0], a.end])} stroke="var(--muted)" strokeWidth={1.25} fill="none" markerEnd={`url(#arrow-${o.id})`} />
                <text x={P(a.end)[0] + 6} y={P(a.end)[1] + 4} fontSize={12} fontStyle="italic" fill="var(--muted)">
                  {a.name}
                </text>
              </g>
            ))}
            <text x={P([0, 0, 0])[0] - 12} y={P([0, 0, 0])[1] + 14} fontSize={11} fontStyle="italic" fill="var(--muted)">
              O
            </text>
          </>
        )}

        {/* A solid: edges facing away from the viewer are dashed, as in textbooks. */}
        {s.poly ? solidEdges(s.poly, toViewer).map((e, i) => (
          <path key={`e${i}`} d={path([e.a, e.b])} stroke="var(--ink)" strokeOpacity={e.hidden ? 0.55 : 0.9} strokeWidth={e.hidden ? 1.1 : 1.6} strokeDasharray={e.hidden ? "5 4" : undefined} fill="none" />
        )) : null}
        {(s.curves ?? []).map((c, i) => (
          <path key={`k${i}`} d={path(c.pts)} stroke="var(--ink)" strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray={c.dashed ? "5 4" : undefined} fill="none" />
        ))}
        {(s.fills ?? []).map((f, i) => (
          <path key={`f${i}`} d={`${path(f)} Z`} fill={TONE.found} fillOpacity={0.18} stroke={TONE.found} strokeWidth={1.6} />
        ))}

        {s.planes.map((pl, i) => {
          const patch = planePatch(pl.n, pl.d, lo, hi);
          if (!patch) return null;
          const color = pl.derived ? TONE.found : TONE.given;
          const labelAt = P(patch[0]);
          return (
            <g key={`p${i}`}>
              <path d={`${path(patch)} Z`} fill={color} fillOpacity={0.13} stroke={color} strokeOpacity={0.6} strokeWidth={1} strokeDasharray={pl.derived ? "6 4" : undefined} />
              <text x={labelAt[0] + 4} y={labelAt[1] - 4} fontSize={12} fontWeight={700} fill={color} {...halo}>
                {pl.label}
              </text>
            </g>
          );
        })}

        {s.spheres.map((sp, i) => {
          const [x, y] = P(sp.c);
          const color = sp.derived ? TONE.found : TONE.given;
          const equator: number[][] = [];
          for (let k = 0; k <= 72; k++) {
            const a = (k / 72) * 2 * Math.PI;
            equator.push([sp.c[0] + sp.r * Math.cos(a), sp.c[1] + sp.r * Math.sin(a), sp.c[2]]);
          }
          return (
            <g key={`s${i}`}>
              <circle cx={x} cy={y} r={sp.r * scale} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={1.75} />
              <path d={path(equator)} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" />
              <text x={x + sp.r * scale * 0.72} y={y - sp.r * scale * 0.72} fontSize={12} fontWeight={700} fill={color} {...halo}>
                {sp.label}
              </text>
            </g>
          );
        })}

        {s.lines.map((l, i) => {
          const seg = clipLine(l.p, l.u, lo, hi);
          if (!seg) return null;
          const color = l.derived ? TONE.found : TONE.given;
          const end = P(seg[1]);
          return (
            <g key={`l${i}`}>
              <path d={path(seg)} stroke={color} strokeWidth={2.25} fill="none" />
              <text x={end[0] + 4} y={end[1] - 4} fontSize={12} fontWeight={700} fill={color} {...halo}>
                {l.label}
              </text>
            </g>
          );
        })}

        {s.segments.map((sg, i) => (
          <path key={`g${i}`} d={path([sg.a, sg.b])} stroke={sg.derived ? TONE.found : "var(--ink)"} strokeOpacity={sg.derived ? 1 : 0.7} strokeWidth={1.5} strokeDasharray={sg.derived ? "5 4" : undefined} fill="none" />
        ))}

        {s.vectors.map((v, i) => {
          const end = P(v.to);
          return (
            <g key={`v${i}`}>
              <path d={path([v.from, v.to])} stroke={TONE.round} strokeWidth={2} fill="none" markerEnd={`url(#arrow-v-${o.id})`} />
              <text x={end[0] + 5} y={end[1] - 5} fontSize={12} fontWeight={700} fill={TONE.round} {...halo}>
                {`→${v.label}`}
              </text>
            </g>
          );
        })}

        {s.points.map((p, i) => {
          const [x, y] = P(p.at);
          return (
            <g key={`m${i}`}>
              <circle cx={x} cy={y} r={4.5} fill={p.derived ? "var(--accent)" : "var(--brand)"} stroke="var(--canvas)" strokeWidth={1.5} />
              <text x={x + 7} y={y - 7} fontSize={11} fontWeight={700} fill="var(--ink)" {...halo}>
                {s.plain ? p.label : `${p.label}(${p.at.map(fmt).join(sep)})`}
              </text>
            </g>
          );
        })}
      </g>
      <defs>
        <marker id={`arrow-${o.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--muted)" />
        </marker>
        <marker id={`arrow-v-${o.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--violet)" />
        </marker>
      </defs>
    </g>
  );
}
