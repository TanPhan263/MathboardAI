import type { BoardObject, Camera } from "./types";

/** Bump when the stored shape changes; old data is migrated or ignored, never misread. */
const VERSION = 2;
const KEY = `mathcanvas:board:v${VERSION}`;
const LEGACY_KEY = "mathcanvas:board:v1";

type Stored = { version: number; savedAt: number; objects: BoardObject[]; camera?: Camera };

export type SavedBoard = { objects: BoardObject[]; camera: Camera };

export const HOME_CAMERA: Camera = { x: 0, y: 0, z: 1 };

/** Browser storage can throw (private mode, quota, blocked) — never trust it. */
export function loadBoard(): SavedBoard {
  const empty = { objects: [], camera: HOME_CAMERA };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Stored;
      if (data.version !== VERSION || !Array.isArray(data.objects)) return empty;
      return { objects: data.objects, camera: data.camera ?? HOME_CAMERA };
    }
    // v1 → v2: graphs changed shape (they're cheap to redraw), everything else carries over.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (!legacy) return empty;
    const old = JSON.parse(legacy) as Stored;
    if (!Array.isArray(old.objects)) return empty;
    return { objects: old.objects.filter((o) => o.type !== "graph"), camera: old.camera ?? HOME_CAMERA };
  } catch {
    return empty;
  }
}

export function saveBoard(objects: BoardObject[], camera: Camera): boolean {
  try {
    const data: Stored = { version: VERSION, savedAt: Date.now(), objects, camera };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function uid(prefix = "o"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
