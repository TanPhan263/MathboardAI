"""MathCanvas handwriting API: reads symbols for the board and learns each learner's hand."""

import sys
from pathlib import Path

# The training scripts in ml/ import each other as top-level modules (raster, symbols, …).
ML_DIR = Path(__file__).resolve().parent.parent / "ml"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
