"""
FixtureLoader — auto-discovers fixture scenario folders.

Usage:
    loader = FixtureLoader("/fixtures")
    bundle = loader.resolve("nike.pdf")
    data   = bundle.extraction          # dict
    is_ph  = loader.is_placeholder(bundle, "vendor_validation")

Adding a new scenario:
    1. Create fixtures/{new_key}/ with the 6 required JSON files.
    2. Restart the backend — discover() picks it up automatically.
    Zero code changes.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

STAGE_FILES = {
    "extraction": "extraction.json",
    "vendor_validation": "vendor_validation.json",
    "metadata_validation": "metadata_validation.json",
    "line_item": "line_item.json",
    "bill_posting": "bill_posting.json",
    "erp_result": "erp_result.json",
}

_PLACEHOLDER_TEMPLATE: dict[str, Any] = {"_placeholder": True}


@dataclass
class FixtureBundle:
    key: str
    extraction: dict = field(default_factory=dict)
    vendor_validation: dict = field(default_factory=lambda: dict(_PLACEHOLDER_TEMPLATE))
    metadata_validation: dict = field(default_factory=lambda: dict(_PLACEHOLDER_TEMPLATE))
    line_item: dict = field(default_factory=dict)
    bill_posting: dict = field(default_factory=dict)
    erp_result: dict = field(default_factory=dict)

    def get_stage(self, stage: str) -> dict:
        """Return fixture data for a given stage slug."""
        mapping = {
            "extraction": self.extraction,
            "vendor_validation": self.vendor_validation,
            "metadata_validation": self.metadata_validation,
            "line_item_matching": self.line_item,
            "bill_posting": self.bill_posting,
            "erp_result": self.erp_result,
        }
        return mapping.get(stage, {})


def _normalise(name: str) -> str:
    """Lowercase, strip extension, replace spaces/hyphens with underscores."""
    stem = re.sub(r"\.[^.]+$", "", name)          # strip extension
    stem = stem.lower()
    stem = re.sub(r"[\s\-]+", "_", stem)           # spaces/hyphens → _
    stem = re.sub(r"[^a-z0-9_]", "", stem)         # remove other chars
    return stem


def _load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


class FixtureLoader:
    def __init__(self, fixtures_dir: str | Path | None = None):
        if fixtures_dir is None:
            # Default: /fixtures (Docker) or siblings of this file
            fixtures_dir = os.environ.get("FIXTURES_DIR", "/fixtures")
            if not Path(fixtures_dir).exists():
                fixtures_dir = Path(__file__).parent
        self._root = Path(fixtures_dir)
        self._bundles: dict[str, FixtureBundle] | None = None

    def discover(self) -> dict[str, FixtureBundle]:
        """Scan root dir; return {scenario_key: FixtureBundle}."""
        if self._bundles is not None:
            return self._bundles

        bundles: dict[str, FixtureBundle] = {}

        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir():
                continue
            # Skip hidden dirs, __pycache__, and dirs without extraction.json
            if entry.name.startswith(".") or entry.name.startswith("__"):
                continue
            if not (entry / "extraction.json").exists():
                continue
            key = entry.name
            bundle = FixtureBundle(key=key)

            for attr, filename in STAGE_FILES.items():
                fpath = entry / filename
                if fpath.exists():
                    setattr(bundle, attr, _load_json(fpath))

            bundles[key] = bundle

        self._bundles = bundles
        return bundles

    def resolve(self, file_name: str) -> FixtureBundle:
        """
        Match a file_name to the best-fitting fixture bundle.

        Algorithm:
          1. Normalise file_name.
          2. Longest-prefix match against known keys.
          3. Fallback: first available bundle (never raises on demo upload).
        """
        bundles = self.discover()
        if not bundles:
            raise RuntimeError("No fixture bundles found in " + str(self._root))

        normalised = _normalise(file_name)

        # Longest prefix match
        best_key: str | None = None
        best_len = -1
        for key in bundles:
            norm_key = _normalise(key)
            if normalised.startswith(norm_key) and len(norm_key) > best_len:
                best_key = key
                best_len = len(norm_key)

        if best_key:
            return bundles[best_key]

        # Fallback: first bundle
        return next(iter(bundles.values()))

    def is_placeholder(self, bundle: FixtureBundle, stage: str) -> bool:
        """True if the stage fixture has _placeholder: true."""
        data = bundle.get_stage(stage)
        return bool(data.get("_placeholder", False))

    def keys(self) -> list[str]:
        return list(self.discover().keys())

    def scenario_display(self, key: str) -> dict:
        """Return human-readable metadata for a scenario key (for upload chip)."""
        bundles = self.discover()
        bundle = bundles.get(key)
        if not bundle:
            return {"key": key, "label": key, "line_items": 0}

        ext = bundle.extraction
        n_items = len(ext.get("invoice_schema", {}).get("line_items", []))
        currency = next(
            (m["value"] for m in ext.get("invoice_schema", {}).get("metadata", [])
             if m["field"] == "currency"),
            "—"
        )
        vendor = next(
            (m["value"] for m in ext.get("invoice_schema", {}).get("metadata", [])
             if m["field"] == "vendor_name"),
            key
        )
        return {
            "key": key,
            "label": f"{vendor} ({n_items} line item{'s' if n_items != 1 else ''})",
            "line_items": n_items,
            "currency": currency,
        }


# Module-level singleton — imported by backend services
_loader_instance: FixtureLoader | None = None


def get_loader() -> FixtureLoader:
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = FixtureLoader()
    return _loader_instance
