"use client";

import { Maximize2, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBoard } from "./BoardProvider";

/** Undo/redo and zoom, floating bottom-left of the board. */
export function ViewControls() {
  const t = useTranslations("view");
  const { state, actions } = useBoard();
  const pct = Math.round(state.camera.z * 100);
  return (
    <div className="view-controls floating" role="toolbar" aria-label={t("group")}>
      <button type="button" className="icon-btn" onClick={actions.undo} disabled={!state.canUndo} aria-label={t("undo")} title={t("undo")}>
        <Undo2 className="size-4.5" aria-hidden />
      </button>
      <button type="button" className="icon-btn" onClick={actions.redo} disabled={!state.canRedo} aria-label={t("redo")} title={t("redo")}>
        <Redo2 className="size-4.5" aria-hidden />
      </button>
      <span className="view-sep" aria-hidden />
      <button type="button" className="icon-btn only-from-sm" onClick={() => actions.zoomBy(1 / 1.2)} aria-label={t("zoomOut")} title={t("zoomOut")}>
        <ZoomOut className="size-4.5" aria-hidden />
      </button>
      <button type="button" className="zoom-readout" onClick={actions.resetView} aria-label={t("zoom", { pct })} title={t("resetTitle")}>
        {pct}%
      </button>
      <button type="button" className="icon-btn only-from-sm" onClick={() => actions.zoomBy(1.2)} aria-label={t("zoomIn")} title={t("zoomIn")}>
        <ZoomIn className="size-4.5" aria-hidden />
      </button>
      <button type="button" className="icon-btn only-from-sm" onClick={actions.resetView} aria-label={t("back")} title={t("backTitle")}>
        <Maximize2 className="size-4.5" aria-hidden />
      </button>
    </div>
  );
}
