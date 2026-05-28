"""
Thin wrapper that imports FixtureLoader from the fixtures/ directory via importlib.
Supports local dev (relative to this file) and Docker (/fixtures volume mount).
"""
import importlib.util
from pathlib import Path

from ..config import settings as _settings


def _load_loader_module():
    candidates = [
        # invoice-demo/fixtures/loader.py (relative to this file)
        Path(__file__).parents[3] / "fixtures" / "loader.py",
        # Config-supplied FIXTURES_DIR/loader.py
        Path(_settings.fixtures_dir).resolve() / "loader.py",
        # Docker volume mount
        Path("/fixtures/loader.py"),
    ]
    for p in candidates:
        if p.exists():
            mod_name = "_fixture_loader_mod"
            spec = importlib.util.spec_from_file_location(mod_name, p)
            mod = importlib.util.module_from_spec(spec)
            # Must register in sys.modules before exec so dataclasses can resolve __module__
            import sys
            sys.modules[mod_name] = mod
            spec.loader.exec_module(mod)  # type: ignore[union-attr]
            return mod
    raise FileNotFoundError(
        "fixture loader.py not found. Tried:\n" + "\n".join(str(c) for c in candidates)
    )


_mod = _load_loader_module()
FixtureLoader = _mod.FixtureLoader
FixtureBundle = _mod.FixtureBundle


def get_loader():
    return _mod.get_loader()
