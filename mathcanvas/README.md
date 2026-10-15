# MathCanvas

A whiteboard that explains the math. Write a problem, get a step-by-step solution where **every step is checked by real computation**, ask why any line works, check your own work, and practise.

Frontend-first build of the blueprint in `../.claude/docs/ai_math_whiteboard_startup_blueprint.md`; no accounts yet. Setup for the whole project is in the [root README](../README.md). Handwriting is read by the handwriting API in `../mathcanvas-api`
(Python, FastAPI; set up its venv once, see its README). The browser only calls
`/api/ink/*` on this site; `next.config.ts` forwards it to `MATHCANVAS_API_URL`
(set before `next build` / `next dev`).

```bash
cp .env.example .env.local   # MATHCANVAS_API_URL=http://localhost:8000
npm install
npm run dev:all    # API on :8000 + app on http://localhost:3000 (Ctrl+C stops both)
npm run dev        # the app alone (handwriting needs the API: npm run api)
npm test           # vitest: solver, answer checker, work checker, board history
npm run typecheck
npm run lint
npm run build
```

## What works

| Area | Details |
|---|---|
| Board | Pen, eraser, text, line/rect/ellipse, select + drag, pan, zoom, undo/redo, autosave (localStorage, versioned + migrated) |
| Look | A Vietnamese classroom board: blackboard (bảng đen, default, wooden frame), green board (bảng xanh, aluminium frame, faint printed squares) or whiteboard, switched from the top bar; no flash on load. On the chalkboards, strokes, shapes and kept handwriting are drawn as chalk (an SVG filter: rough edges and grain), typeset maths and text notes get the grain only, text notes use a hand-lettered face with Vietnamese tone marks, and tutor steps sit on the board in dashed chalk boxes |
| Math input | Handwriting: write with the pen, box it with Select Math Area (A), fix symbols in the panel. Or type a problem in **Examples → Type a Problem** (needed for worded geometry problems) |
| Coordinate geometry | Plane (Oxy) and space (Oxyz), worded the way textbooks do in Vietnamese or English: `A(1; 2; 3), (P): 2x − y + 2z − 3 = 0. Tính khoảng cách từ A đến (P)`. Reads points, vectors, lines (general, parametric, canonical), planes, circles and spheres; answers vectors, lengths, midpoints, centroids, dot/cross products, angles, distances (point/line/plane, parallel planes, skew lines), areas, volumes, planes and lines through/perpendicular/parallel, intersections (line–plane, line–line, plane–plane, line/circle/sphere, circle–circle), projections and reflections, centre/radius, tangent and circumscribed circles/spheres, relative positions. Exact arithmetic with square roots (`src/lib/math/surd.ts`: 2√3, 3√2/2); every result is re-checked by substitution or an independent calculation (`src/lib/math/geometry/`) |
| Triangles and solids | Without coordinates (`src/lib/math/measure/`). **Triangles** (grade 10): from three sides, two sides and an angle (including the two-triangle case) or a side and two angles — law of cosines/sines, area, R, r, altitudes, medians, perimeter. **Solids by formula**: cone, cylinder, sphere (also from an axial section), pyramid/prism from base area and height; answers keep π. **Pyramids, prisms, cubes, boxes and tetrahedra described in words** (grades 11–12: `S.ABCD`, `ABC.A'B'C'`; square, rectangle, right or equilateral bases; apex over a vertex, the centre, or the midpoint of an edge in a perpendicular face; height from a length, a lateral edge or an angle): volumes (also of smaller pyramids inside), angles between lines and planes, distances (point–plane, skew lines…), lengths — each worked the textbook way (projection of the apex, perpendicular to the common line, the foot on a face, ratio of distances) and checked again with coordinates — and **⊥ / ∥ proofs** written as textbook arguments (right angles of faces, “perpendicular to a plane containing it”, midlines), falling back to a coordinate proof, and saying when a claim is false. Lengths can be in terms of `a` (answers like `a³√2/3`); values are computed in floating point and shown exactly when they are a rational multiple of one square root |
| More solids | Bases may also be a rhombus, parallelogram, right/isosceles trapezoid, half hexagon or any triangle given by sides and angles; the apex may stand over a point dividing an edge, the circumcentre (SA = SB = SC) or the centre of a rhombus; slanted prisms from the projection of a top vertex. **Dihedral angles** [S, BC, A] with the plane angle constructed; **skew-line distances** the textbook way (an existing common perpendicular, a plane through one line perpendicular to the other, or a parallel plane — built with a parallelogram if needed); angles between skew lines by moving one parallel (`src/lib/math/measure/`) |
| Parallel lines (grade 11) | Intersection lines of two planes (common points, lines meeting in the base, or the parallel through a common point), where a line meets a plane (directly or through an auxiliary plane), **cross-sections** by (MNP) or by a plane “qua M, song song với SA và BC”, face by face, with their shape and area, and proofs that two planes are parallel. Works without lengths or the apex's position, and for any tetrahedron ABCD: those questions don't need them, so an unstated base is drawn as an irregular quadrilateral the way it is drawn in class, and the view turns slightly when a section would otherwise be seen edge-on (`src/lib/math/measure/affine.ts`) |
| Vectors (grade 10) | Without coordinates, in a triangle, parallelogram, trapezoid or among free points: prove identities (every point kept exactly as weights on the figure's free points, then written from one origin), write a vector in terms of two others, find the point a vector equation defines, and dot products, lengths and angles (`src/lib/math/vector/`) |
| Conics (grade 10) | Ellipse, hyperbola, parabola in standard position: elements from any form of the equation, the standard equation from axes, foci, eccentricity, asymptotes, directrix or points (exact a², b², c², p), focal radii of a point, and a drawn curve (`src/lib/math/conic/`) |
| Figures | Oxy problems draw on the graph with equal units (circles stay round); Oxyz problems draw a 3-D figure — planes clipped to a box, lines, spheres, points — that turns when dragged. Blue: given, orange: found. Solids are drawn the textbook way (no axes, hidden edges dashed and updated as the figure turns, constructions in orange); triangles to scale |
| Graph ↔ maths | On a graph, drag a solution dot along the axis, a parabola's turning point, or where a system's lines cross. The graph previews the rewritten problem (dashed). The maths on the board changes only when you press **Apply**; **Cancel** restores it. Rewrites keep what you wrote where possible (`2x+3=7` → `2x+3=11`), snap to half units and always stay solvable (`src/lib/math/graphEdit.ts`) |
| Floating tutor | The tutor starts closed, as a button at the right edge (opening it is remembered per browser). Minimize the tutor (or close it on small screens) and it becomes that button at the right edge, with Explain, Hint, Check Work, Graph and Practice in a half circle around it. They work without the drawer: steps, graph, check marks and practice go on the board; hints and results show in a small note |
| Languages | Vietnamese (`/vi`) and English (`/en`) with next-intl. `/` sends visitors to the language they chose before, else their browser's, else Vietnamese. UI text lives in `messages/{vi,en}.json` (a test keeps their keys identical). The solver's steps, hints and messages are generated from each problem's numbers, so both languages sit side by side in the code (`L({ en, vi })`, `src/lib/math/lang.ts`). Vietnamese answers are accepted ("x = 2 hoặc x = 3", "vô nghiệm", decimal comma). Text already written on the board (step captions, graph titles) keeps the language it was written in |
| Moving & resizing | Boxed handwriting, handwritten problems, graphs, tutor steps and practice problems have a Move grip (graphs and steps: their header) and a corner resize handle; both work with any tool |
| Handwriting | Write with the Pen, then use **Select Math Area** (`A`) to drag a box around it. A trained network on the handwriting API reads it (one request per reading; the page itself ships no model): digits, x y z a b c n t, + − = < > ≤ ≥ ( ) / and the decimal point, plus exponents, stacked fractions and multi-line systems. Unsure symbols are highlighted. Tap any symbol to pick the right one from the full symbol keyboard, **Split** a symbol that is really several, or **Join Next** when one symbol was cut in two. Every symbol fixed by hand is sent to the API, and **Train On My Writing** fine-tunes a model on that learner's handwriting. The new model is used only if it scores no worse. Then **Explain**, **Hint**, **Graph** (the handwriting stays on the board), **Beautify**: keeps your own handwriting but tidies it — smooths shaky strokes, straightens lines, evens out sizes, sets everything on one baseline with even spacing, exponents raised and fraction bars level (`src/lib/ink/neaten.ts`). The original strokes are kept; the tutor card toggles between the two |
| Maths | Linear & quadratic **equations**; **fractions** with x in a denominator (restrictions, LCD, extraneous roots); linear & quadratic **inequalities** (sign flips, sign charts, interval notation); **systems** of 2–3 linear equations (elimination, back-substitution) |
| Tutor | **Explain** (Back/Next step player or all steps, each verified), **Hint**, **Check Work**, **Graph**, **Practice** (generated per topic + answer check), per-step Q&A |
| Board ↔ tutor link | Steps can be written onto the board as widgets; select 2–3 equations to **Make a System** |
| Honesty | Unsupported input gets a plain message and a next step. Steps are marked Verified / Unverified / Failed |

Type systems with `;` (`x+y=5; x-y=1`), inequalities with `<`, `<=`, `>`, `>=` (or ≤ ≥).

## Architecture

```
src/lib/math      pure TS, no React — the source of truth for correctness
  polynomial.ts   parse → exact (Fraction) polynomial fit; rejects anything not ≤ quadratic
  fractions.ts    denominators → restrictions + least common denominator
  sets.ts/signs.ts  one solution-set model (intervals) + sign analysis
  equation.ts / inequality.ts / system.ts   step-by-step solvers
  solve.ts        router; every restating step is re-checked for an identical solution set
  check.ts        "check my work" + answer checking (values, inequalities, systems)
  practice.ts     problems built backwards from a known answer, per topic
  graph.ts        curves, shaded regions, asymptotes, line pairs
src/lib/ink       handwriting → maths, no React
  recognize.ts    rows → fraction bars → split chosen by the network → exponents →
                  cheapest reading that parses (network + symbol-sequence model).
                  recognizeInkAsync: one request scores every stroke group it needs
  api.ts          handwriting API client (classify, samples, training)
  raster.ts, model.ts  TypeScript copy of the network, for tests and benchmarks only
                  (parity-tested against the API's Python)
../mathcanvas-api FastAPI service: the network, learner samples, fine-tuning,
                  and the training pipeline (ml/)
src/lib/board     object model, history reducer, storage (no React)
src/lib/tutor     TutorProvider interface + offline implementation
src/components/board   BoardProvider ({state, actions, meta} context) · Whiteboard (SVG) · tools
src/components/tutor   TutorProvider (orchestration) · panel + one view per mode
src/components/ink     InkProvider (handwriting session) · result panel · on-board symbol boxes
```

Principles carried over from the blueprint:

- **Computation is separate from language.** The tutor only explains steps the engine already produced and validated.
- **Board objects are typed with stable ids** (`math`, `stroke`, `shape`, `text`, `graph`), not pixels.
- **Heavy code is lazy**: mathjs loads on first Explain; the board isn't in the landing bundle.

## Plugging in a real AI tutor

`src/lib/tutor/provider.ts` defines `TutorProvider`. The built-in `localTutor` is **template-based, not an LLM**. To use a model:

1. Add a route (e.g. `app/api/math/explain/route.ts`) that holds the API key server-side, rate-limits, and prompts with the validated `MathSolution`, the selected step, and the question — instructing it not to change the verified result.
2. Implement `TutorProvider.answer` as a `fetch` to that route, and pass it as `<TutorProvider backend={…}>` in `Workspace.tsx`.

No UI changes are needed.

## Known limits / next steps

- Up to quadratic after simplifying; systems must be linear; no inequalities with x in a denominator yet.
- Handwriting, measured on MathWriting's held-out test inks (real writers never seen in training; harder than school algebra): **91.9 % of symbols** and **44 % of whole expressions** exactly right (validation 55.5 %). Most misses are one symbol, fixed with a tap. No roots, subscripts or Greek yet. The model is trained on CC BY-NC-SA data: **retrain on licensed data before commercial use** (../mathcanvas-api/ml/README.md).
- Boards live in one browser's localStorage — no sync or sharing yet.
- No marquee selection, image export, or touch pinch-zoom (use the zoom buttons).
- tldraw/GeoGebra were deliberately **not** used: their commercial licence terms are flagged as an open question in the blueprint, so the canvas is a small custom SVG engine.
- Add analytics + feedback ("report a wrong answer") before the pilot.
