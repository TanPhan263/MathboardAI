"use client";

import {
  Circle,
  Eraser,
  Hand,
  type LucideIcon,
  Minus,
  MousePointer2,
  Pencil,
  SquareDashedMousePointer,
  Square,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tool } from "@/lib/board/types";
import { PALETTE, SIZES, useBoard } from "./BoardProvider";

const TOOLS: Array<{ tool: Tool; key: string; Icon: LucideIcon }> = [
  { tool: "select", key: "V", Icon: MousePointer2 },
  { tool: "hand", key: "H", Icon: Hand },
  { tool: "pen", key: "P", Icon: Pencil },
  { tool: "area", key: "A", Icon: SquareDashedMousePointer },
  { tool: "eraser", key: "E", Icon: Eraser },
  { tool: "text", key: "T", Icon: Type },
  { tool: "line", key: "L", Icon: Minus },
  { tool: "rect", key: "R", Icon: Square },
  { tool: "ellipse", key: "O", Icon: Circle },
];

/** Floating tool palette, top-left of the board. */
export function Toolbar() {
  const t = useTranslations("tools");
  const { state, actions } = useBoard();
  const drawing = state.tool === "pen" || state.tool === "line" || state.tool === "rect" || state.tool === "ellipse" || state.tool === "text";

  return (
    <nav className="toolbar floating" aria-label={t("nav")}>
      <div className="flex flex-col gap-0.5" role="toolbar" aria-orientation="vertical" aria-label={t("group")}>
        {TOOLS.map(({ tool, key, Icon }) => (
          <button
            key={tool}
            type="button"
            className="tool-btn"
            aria-pressed={state.tool === tool}
            aria-label={`${t(tool)} (${key})`}
            title={`${t(tool)} (${key})`}
            onClick={() => actions.setTool(tool)}
          >
            <Icon className="size-4.5" aria-hidden />
          </button>
        ))}
      </div>

      {drawing ? (
        <>
          <div className="tool-sep" role="separator" />
          <div className="flex flex-col items-center" role="group" aria-label={t("colour")}>
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                className="swatch"
                style={{ background: c.value }}
                aria-pressed={state.color === c.value}
                aria-label={t("penColour", { name: t(`colours.${c.name}`) })}
                title={t(`colours.${c.name}`)}
                onClick={() => actions.setColor(c.value)}
              />
            ))}
          </div>
          <div className="tool-sep" role="separator" />
          <div className="flex flex-col items-center gap-0.5" role="group" aria-label={t("strokeSize")}>
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className="tool-btn"
                aria-pressed={state.size === s}
                aria-label={t("strokeSizeN", { size: s })}
                onClick={() => actions.setSize(s)}
              >
                <span className="rounded-full bg-current" style={{ width: s + 3, height: s + 3 }} aria-hidden />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </nav>
  );
}
