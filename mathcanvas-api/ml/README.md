# Handwriting model

Trains the symbol network that the API serves (`../models/base.json`: int8, a
few hundred KB). Run these from `mathcanvas-api/` with its venv.

```
# MathWriting (Google, 2024): ~3 GB. Extract only train/ valid/ test/ symbols.jsonl.
curl -LO https://storage.googleapis.com/mathwriting_data/mathwriting-2024.tgz

python ml/prepare.py <mathwriting-2024 dir> symbols.npz      # real strokes → 32×32 pictures
python ml/train.py symbols.npz symbols-new.json [epochs] [width]
python ml/parity.py <mathwriting-2024 dir> symbols-new.json  # writes the web app's TS ⇔ Python fixture
cp symbols-new.json models/base.json                         # the API picks it up automatically

# Real-ink benchmark of the whole reader (from ../mathcanvas):
MW_DIR=<mathwriting-2024 dir> INK_MODEL=<model.json> npx vitest run handwriting.eval
```

- `train.py` saves progress after every epoch to `<out>.ckpt.pt`. Running the
  same command again continues from there. Multi-hour runs: pause Windows
  Update first, because an update restart kills the run.
- `parity.py` and `lm.py` write into the web app (`WEB_DIR`, default
  `../mathcanvas`).

Training data:
- `symbols.jsonl`: single glyphs cut from human inks by the dataset authors.
- Bootstrapped glyphs: one-line human inks made only of supported symbols are
  split with the app's own grouping rules; an ink is used only when the
  number of groups equals the number of symbols in its label.

Fine-tuning on one learner's handwriting (`finetune.py`) is run by the API
(`app/jobs.py`) when a learner presses **Train On My Writing**. It mixes their
fixed symbols with a slice of the original data, so the network does not
forget other writers, and reports accuracy before and after.

**Licence:** MathWriting is CC BY-NC-SA 4.0 (non-commercial). The model is fine
for a prototype; retrain on licensed data (e.g. consented corrections from
learners) before any commercial launch. `ml/raster.py` and the web app's
`src/lib/ink/raster.ts` must stay identical: `raster.test.ts` and
`tests/test_api.py` check them.
