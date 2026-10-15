# MathCanvas handwriting API

The backend for the board's **Select Math Area** reader. The web app
(`../mathcanvas`) keeps the light layout logic: rows, fractions, exponents and
the grammar check. This service runs the trained symbol network, and it learns
each learner's handwriting from the symbols they fix.

```
board ──POST /v1/classify──▶ network (shared model, or the learner's own)
      ──POST /v1/learners/{id}/samples──▶ symbols the learner fixed by hand
      ──POST /v1/learners/{id}/finetune──▶ ml/finetune.py in a child process
                                            └─ installed only if it is no worse
```

## Run it

```
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Or from the web app: `npm run api` (this service only) or `npm run dev:all`
(this service and the app). The app reaches it through its own `/api/ink/*`
path (`MATHCANVAS_API_URL` in the app's `.env.local`), so in production the API
can stay on a private network; `MC_CORS_ORIGINS` matters only when browsers call
it directly.

With Docker:

```
docker build -t mathcanvas-api .
docker run -p 8000:8000 -v mathcanvas-data:/data \
  -e MC_CORS_ORIGINS=https://your-site.example \
  -e MC_BASE_DATA=/data/symbols.npz mathcanvas-api
```

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `MC_CORS_ORIGINS` | `http://localhost:3000,http://localhost:3100` | Sites allowed to call the API (comma-separated) |
| `MC_DATA_DIR` | `./data` | Learner samples, personal models, job logs |
| `MC_BASE_MODEL` | `./models/base.json` | The shared network (from `ml/train.py`) |
| `MC_BASE_DATA` | not set | Training set (`symbols.npz` from `ml/prepare.py`). Fine-tuning mixes it in so a personal model doesn't forget other writers. **Fine-tuning is off without it.** |
| `MC_MIN_SAMPLES` | `20` | Fixed symbols needed before a learner can train |
| `MC_FINETUNE_EPOCHS` | `4` | Fine-tune length (about 1 minute per epoch on a laptop CPU) |

## API

| Method and path | Purpose |
|---|---|
| `GET /health` | Status and shared-model info |
| `POST /v1/classify` | `{learner?, groups: [{strokes: [[[x,y],…],…], unit}]}` → `{classes, costs, personal}`. `costs` holds −log p per symbol, in `classes` order |
| `POST /v1/learners/{id}/samples` | `{samples: [{label, strokes, unit, at}]}`. Labels are symbols, or `∅` for "not a symbol" |
| `GET /v1/learners/{id}` | Samples stored, per label, personal model, running job |
| `DELETE /v1/learners/{id}` | Deletes the learner's samples and model |
| `POST /v1/learners/{id}/finetune` | Starts training; returns the job (`202`) |
| `GET /v1/jobs/{id}` | `queued` / `running` / `done` / `failed`, log tail, scores, `installed` |

A personal model is installed only when both hold:
- base validation accuracy drops by at most 1 point;
- accuracy on the learner's held-out samples does not drop.

Otherwise the current model is kept and the job explains why.

**Before going public:** learner ids are random ids made by the browser, not
accounts. Add real authentication (and rate limits) in front of this service
before it is exposed on the internet.

## Training the shared model

See [ml/README.md](ml/README.md). After training, copy the exported file to
`models/base.json` (the service reloads it automatically). Then regenerate the
web app's parity fixture with `ml/parity.py`.

## Tests

```
.venv/Scripts/python -m pytest
```

They check that the network gives the same probabilities as the web app's
TypeScript copy (`../mathcanvas/src/lib/ink/__fixtures__/parity.json`). They
also run the HTTP API and a full fine-tune job on a tiny dataset.
