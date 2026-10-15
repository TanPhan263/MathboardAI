import type { GraphSpec } from "../math/graph";
import type { ValidationStatus } from "../math/types";

export type Tool =
  | "select"
  | "hand"
  | "pen"
  /** Drag a box around handwriting to read it as maths. */
  | "area"
  | "eraser"
  | "text"
  | "line"
  | "rect"
  | "ellipse";

export type Camera = { x: number; y: number; z: number };

/**
 * Every board object has a stable id and typed semantics (blueprint §9), so
 * the tutor can point at "this equation" or "step 3" instead of pixels.
 */
type Base = { id: string; x: number; y: number };

export type StrokeObject = Base & {
  type: "stroke";
  /** Points relative to (x, y). */
  points: Array<[number, number]>;
  color: string;
  size: number;
};

export type ShapeObject = Base & {
  type: "shape";
  kind: "line" | "rect" | "ellipse";
  /** Extent from (x, y); may be negative for lines. */
  w: number;
  h: number;
  color: string;
  size: number;
};

export type TextObject = Base & {
  type: "text";
  text: string;
  color: string;
  fontSize: number;
};

export type MathRole = "problem" | "step" | "practice";

export type MathObject = Base & {
  type: "math";
  latex: string;
  /** Parser-friendly form that the solver reads. */
  source: string;
  role: MathRole;
  /** Small label above the expression, e.g. "Step 2 · Factor". */
  caption?: string;
  validation?: ValidationStatus;
  /** Set when this object was written from a solution step. */
  stepOf?: { problemId: string; stepId: string };
  /** The handwriting this was read from, relative to (x, y) — the link isn't lost (blueprint §11). */
  ink?: StrokeObject[];
  /** Draw the handwriting instead of typeset maths. */
  showInk?: boolean;
  /** The same handwriting tidied by Beautify (same stroke ids, relative to (x, y)). */
  neatInk?: StrokeObject[];
  /** Show the tidied handwriting instead of the original. */
  neat?: boolean;
  /** Drawn this many times its natural size (resized by the learner). */
  scale?: number;
};

export type GraphObject = Base &
  GraphSpec & {
    type: "graph";
    w: number;
    h: number;
    forProblemId: string;
    /** The problem text this graph belongs to. */
    source?: string;
    /** Viewing angles of a 3-D figure (radians), changed by dragging it. */
    view?: { yaw: number; pitch: number };
    /** A rewrite of that problem from dragging the graph, shown until the learner applies or cancels it. */
    pending?: { source: string; latex: string };
  };

export type BoardObject =
  | StrokeObject
  | ShapeObject
  | TextObject
  | MathObject
  | GraphObject;

type PatchOf<T> = T extends unknown ? Partial<Omit<T, "id" | "type">> : never;
/** A partial update valid for exactly one object type (distributes over the union). */
export type ObjectPatch = PatchOf<BoardObject>;
