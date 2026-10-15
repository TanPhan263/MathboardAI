# MathboardAI

StepBoard is a smart whiteboard for high-school students: write the problem, understand every step. Handwrite or type a problem and StepBoard solves it step by step, the way textbooks present it. Every step is verified by real computation — no guessing, no made-up answers.

The board looks like a Vietnamese classroom board: a blackboard (bảng đen) by default, a green board (bảng xanh), or a whiteboard, with handwriting drawn as chalk. The interface is in Vietnamese and English.

## What it can do

- **Write or type a problem.** Write with the pen and draw a box around it to have it read, or type it in. Worded problems can be typed the way textbooks write them, e.g. `A(1; 2; 3), (P): 2x − y + 2z − 3 = 0. Tính khoảng cách từ A đến (P)`.
- **Get a checked solution.** Each step is worked out exactly and checked again by substitution or a second calculation, then marked Verified, Unverified or Failed.
- **Learn from it.** The tutor offers Explain (step by step), Hint, Check Work, Graph, Practice (new problems of the same kind) and "why does this step work?" questions.
- **Topics covered so far:**
  - Algebra: linear and quadratic equations, equations with x in a denominator, linear and quadratic inequalities, systems of 2–3 linear equations.
  - Coordinate geometry: Oxy and Oxyz.
  - Triangles, vectors, conics.
  - Solid geometry (grades 11–12): angles, distances, volumes, cross-sections, ⊥ and ∥ proofs, with figures that turn when dragged.

Calculus, trigonometry, probability, logarithms and complex numbers are not supported yet.

## How it is built

| Folder | What it is |
|---|---|
| [`mathcanvas/`](mathcanvas/) | The web app: Next.js 16, React 19, TypeScript. Contains the board, the tutor, and the maths engine (`src/lib/math`, pure TypeScript). |
| [`mathcanvas-api/`](mathcanvas-api/) | The handwriting API: Python, FastAPI, PyTorch (CPU). Reads handwritten symbols and can learn each student's handwriting. |

The browser only talks to the web app. The app forwards `/api/ink/*` to the handwriting API, so the API never has to be public. Everything except reading handwriting works without the API.

## Running it locally

### 1. Install the prerequisites

- **Node.js 20.9 or newer** (includes npm)
- **Python 3.13 or newer**
- Git

### 2. Set up the handwriting API (once)

```bash
cd mathcanvas-api
python -m venv .venv

# Windows
.venv/Scripts/python -m pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
# macOS / Linux
.venv/bin/python -m pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

The trained model is already in `mathcanvas-api/models/base.json`, so you don't need to train anything.

### 3. Set up the web app (once)

```bash
cd mathcanvas
cp .env.example .env.local     # MATHCANVAS_API_URL=http://localhost:8000
npm install
```

### 4. Start both

```bash
cd mathcanvas
npm run dev:all
```

This starts the API on http://localhost:8000 and the app on **http://localhost:3000** (`/vi` for Vietnamese, `/en` for English). Press Ctrl+C to stop both.

To run them separately:

```bash
npm run api     # only the handwriting API (from mathcanvas/)
npm run dev     # only the web app; handwriting won't be read without the API
```

You can check that the API is up at http://localhost:8000/health.

### 5. Try it

1. Open **Ví dụ / Examples** and pick a problem, or choose **Type a Problem** and type your own.
2. Or pick the pen (`P`), write something like `2x + 3 = 7`, choose **Select Math Area** (`A`) and draw a box around it.
3. Open the tutor (the round button on the right) and press **Explain**.

## Tests and checks

```bash
# Web app (from mathcanvas/)
npm test                 # all tests
npx vitest run src/lib/math/solve.test.ts   # one file
npm run typecheck
npm run lint
npm run build            # production build

# Handwriting API (from mathcanvas-api/)
.venv/Scripts/python -m pytest      # macOS / Linux: .venv/bin/python -m pytest
```

## Common problems

| Problem | Fix |
|---|---|
| `npm run dev:all` says there is no Python venv | Do step 2 first. The script looks for `mathcanvas-api/.venv`. |
| `EADDRINUSE` on port 3000 or 8000 | An older server is still running. Stop it, or run the app on another port: `npx next dev --port 3100`. |
| Handwriting is never read | Make sure the API is running (`/health`) and that `MATHCANVAS_API_URL` in `.env.local` points to it. Restart the app after changing `.env.local`. |
| "Train On My Writing" says training isn't set up | Fine-tuning needs the training data (`MC_BASE_DATA`). See [mathcanvas-api/README.md](mathcanvas-api/README.md). |

## More detail

- [mathcanvas/README.md](mathcanvas/README.md): full feature list, architecture, and how to plug in an AI tutor
- [mathcanvas-api/README.md](mathcanvas-api/README.md): API endpoints, settings, Docker
- [mathcanvas-api/ml/README.md](mathcanvas-api/ml/README.md): training the handwriting model

## Licence

The code is under the [MIT licence](LICENSE). The handwriting model was trained on MathWriting, which is CC BY-NC-SA 4.0 (non-commercial). Retrain it on licensed data before any commercial use.
