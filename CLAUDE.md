# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent projects (no root package.json):

- `mathcanvas/`: the web app (Next.js 16 + React 19, TypeScript, Tailwind 4, next-intl, vitest). A step-by-step maths whiteboard for Vietnamese high-school students.
- `mathcanvas-api/`: the handwriting API (Python, FastAPI, PyTorch CPU). It serves the symbol-classifier network and fine-tunes per-learner models.
- `.claude/docs/ai_math_whiteboard_startup_blueprint.md`: the product blueprint the app is built from.

`mathcanvas/README.md`, `mathcanvas-api/README.md` and `mathcanvas-api/ml/README.md` are detailed and current. Read them for the feature list, API endpoints and env vars.

**Next.js warning (from `mathcanvas/AGENTS.md`):** Next 16 has breaking changes compared with your training data. Read the relevant guide in `mathcanvas/node_modules/next/dist/docs/` before writing Next-specific code. For example, middleware is `src/proxy.ts`, and `next.config.ts` enables `cacheComponents`/`partialPrefetching`. `next dev` re-adds the AGENTS.md block, so leave it there.

## Commands

Web app (run from `mathcanvas/`; uses npm, `.env.local` from `.env.example`):

```bash
npm run dev:all      # API on :8000 + app on :3000 (needs the API venv)
npm run dev          # app only
npm run api          # API only (via scripts/dev-all.mjs)
npm test             # vitest run
npx vitest run src/lib/math/solve.test.ts   # one file
npx vitest run -t "name of test"            # by test name
npm run typecheck
npm run lint
npm run build
```

`handwriting.eval.test.ts` is a real-ink benchmark. It is skipped unless the MathWriting dataset is on disk (`MW_DIR=... INK_MODEL=... npx vitest run handwriting.eval`).

API (run from `mathcanvas-api/`; Windows venv paths):

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m uvicorn app.main:app --port 8000
.venv/Scripts/python -m pytest                       # all tests
.venv/Scripts/python -m pytest tests/test_api.py -k <name>
```

## Architecture

### Request flow
The browser only calls `/api/ink/*` on the Next site. `next.config.ts` rewrites those requests to `MATHCANVAS_API_URL` (read at build/dev start), and `src/proxy.ts` (next-intl middleware) excludes `/api`. The page bundle contains no ML model. Layout logic (rows, fraction bars, exponents, grammar check) runs in TS (`src/lib/ink/recognize.ts`). Only per-symbol classification runs in Python.

### Web app layers (`mathcanvas/src`)
- `lib/math`: pure TS, no React. This is the source of truth for correctness. `solve.ts#solveProblem` routes the input in this order: conic → vector → measure (triangles/solids without coordinates) → coordinate geometry → system → rational equation → polynomial equation/inequality. Order matters: `isMeasure` must run before `isGeometry` ("mặt cầu bán kính 3" is not Oxyz). Each solver emits `MathSolution` steps with a `ValidationStatus`, and each result is re-checked independently (substitution, a second computation, or coordinates). Exact arithmetic uses `rational.ts` (Fraction) and `surd.ts` (√ forms). Topic subfolders (`geometry/`, `measure/`, `conic/`, `vector/`) each have their own `practice.ts` generator and tests.
- `lib/ink`: handwriting → maths. `raster.ts`/`model.ts` are a TS copy of the network, used only in tests and benchmarks.
- `lib/board`: typed board objects with stable ids, a history reducer (undo/redo) and versioned localStorage storage with migrations.
- `lib/tutor`: `TutorProvider` interface. `localTutor` is template-based (not an LLM). A real LLM would go behind a server route, implement `TutorProvider.answer`, and be passed into `<TutorProvider backend>` in `Workspace.tsx`. It must only explain already-validated steps and never change the result.
- `components/{board,tutor,ink}`: React providers (`BoardProvider`, `TutorProvider`, `InkProvider`) plus views. The board is a custom SVG engine (tldraw/GeoGebra were avoided on purpose because of licensing). Heavy code (mathjs, the board) is lazy-loaded.

### Internationalisation
- UI strings live in `messages/{vi,en}.json`. `src/i18n/messages.test.ts` requires the key sets to match.
- Solver-generated text (steps, hints, errors) does **not** use message files. Write it inline as `L({ en: "...", vi: "..." })` from `lib/math/lang.ts`, so a missing translation is a type error. The language is a module-level global set with `setMathLang`. Tests default to English.
- Vietnamese is the default locale. Parsers accept Vietnamese textbook wording ("Tính khoảng cách từ A đến (P)", `A(1; 2; 3)`, decimal commas, "vô nghiệm").

### Cross-project invariants
- `mathcanvas-api/ml/raster.py` must stay byte-for-byte equivalent to `mathcanvas/src/lib/ink/raster.ts`. Parity is checked by `raster.test.ts` and `tests/test_api.py` against `mathcanvas/src/lib/ink/__fixtures__/parity.json`.
- After retraining (`ml/train.py`), copy the export to `mathcanvas-api/models/base.json` (hot-reloaded). Then run `ml/parity.py` to regenerate the fixture. `ml/parity.py` and `ml/lm.py` write into the web app (`WEB_DIR`, default `../mathcanvas`; `lm.py` produces `src/lib/ink/bigram.json`).
- A fine-tuned personal model is installed only if base validation accuracy drops by ≤1 point and held-out learner accuracy does not drop. Fine-tuning is disabled unless `MC_BASE_DATA` is set.
- The current model is trained on CC BY-NC-SA data (MathWriting), so it is non-commercial only.
