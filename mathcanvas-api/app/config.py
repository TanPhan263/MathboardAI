"""Settings, all from environment variables (see README.md)."""

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _list(name: str, default: str) -> list[str]:
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("MC_DATA_DIR", ROOT / "data")))
    base_model: Path = field(default_factory=lambda: Path(os.environ.get("MC_BASE_MODEL", ROOT / "models" / "base.json")))
    # The training set (symbols.npz from ml/prepare.py). Fine-tuning mixes it in so
    # a personal model doesn't forget other writers; without it, fine-tuning is off.
    base_data: Path | None = field(default_factory=lambda: Path(p) if (p := os.environ.get("MC_BASE_DATA")) else None)
    cors_origins: list[str] = field(default_factory=lambda: _list("MC_CORS_ORIGINS", "http://localhost:3000,http://localhost:3100"))
    min_samples: int = field(default_factory=lambda: int(os.environ.get("MC_MIN_SAMPLES", "20")))
    finetune_epochs: int = field(default_factory=lambda: int(os.environ.get("MC_FINETUNE_EPOCHS", "4")))
    python: str = field(default_factory=lambda: os.environ.get("MC_PYTHON", sys.executable))
    ml_dir: Path = ROOT / "ml"
