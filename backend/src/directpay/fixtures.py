"""
DirectPay fixture loader.

Deliberately NOT the same `FixtureLoader` instance the P2P pipeline uses
(`backend/src/services/fixtures.py`'s `get_loader()`), because that singleton
is hardwired to resolve to `fixtures/p2p_invoices`. This is a small,
self-contained clone of the same discovery/resolution algorithm
(`fixtures/loader.py`), pointed at `fixtures/dp` instead, with its own
bundle shape (contract/invoice/matching instead of P2P's
extraction/vendor_validation/metadata_validation/line_item/bill_posting).

Resolution algorithm (identical to fixtures/loader.py's `resolve()`):
  1. Normalise the uploaded filename: lowercase, strip extension,
     spaces/hyphens -> underscores, strip anything else non-alphanumeric.
  2. Find the scenario folder whose normalised name is the longest prefix
     of the normalised filename.
  3. Fall back to the first bundle (directory order) if nothing matches.

A scenario folder's key is chosen so that BOTH its contract and invoice
source filenames share it as a normalised prefix (e.g. "PT_BANGUN" is a
prefix of both "PT_BANGUN_CONTRACT.pdf" and "PT_BANGUN_RENT_INV.pdf") — so
the same resolve() call correctly routes either upload to the same scenario.
"""
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _normalise(name: str) -> str:
    stem = re.sub(r"\.[^.]+$", "", name)
    stem = stem.lower()
    stem = re.sub(r"[\s\-]+", "_", stem)
    stem = re.sub(r"[^a-z0-9_]", "", stem)
    return stem


@dataclass
class DpFixtureBundle:
    key: str
    contract_extraction: dict = field(default_factory=dict)
    # Per-field metadata alongside contract_extraction's values — keyed the
    # same way, {label, section, mandatory, audit_trail, ai_match_reasoning}.
    # Optional: a scenario authored without it just has no metadata (the
    # review screen falls back to bare Field/Value rows).
    contract_field_meta: dict = field(default_factory=dict)
    invoice_extraction: dict = field(default_factory=dict)
    matching: dict = field(default_factory=dict)
    # Default ERP coding (GL account / VAT / WHT tax codes) per line item,
    # seeded onto the Bill Posting stage — mirrors P2P's ERP Fields, adapted
    # to DirectPay's simpler (no live VAT-code-by-country lookup) model.
    bill_posting: dict = field(default_factory=dict)
    contract_pdf_path: Optional[Path] = None
    invoice_pdf_path: Optional[Path] = None

    def display_label(self) -> str:
        vendor = self.contract_extraction.get("vendor_name") or self.invoice_extraction.get("vendor_name")
        return vendor or self.key


class DpFixtureLoader:
    def __init__(self, fixtures_dir: Optional[str] = None):
        candidates = []
        if fixtures_dir:
            candidates.append(Path(fixtures_dir))
        env_dir = os.environ.get("DP_FIXTURES_DIR")
        if env_dir:
            candidates.append(Path(env_dir))
        # Local dev: repo_root/fixtures/dp (this file is backend/src/directpay/fixtures.py)
        candidates.append(Path(__file__).resolve().parents[3] / "fixtures" / "dp")
        # Docker: the whole fixtures/ dir is bind-mounted at /fixtures
        candidates.append(Path("/fixtures/dp"))

        self._root = next((p for p in candidates if p.is_dir()), candidates[-1])

    def discover(self) -> dict[str, DpFixtureBundle]:
        """Re-reads disk on every call (same live-edit convention as fixtures/loader.py)."""
        bundles: dict[str, DpFixtureBundle] = {}
        if not self._root.is_dir():
            return bundles

        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir() or entry.name.startswith((".", "_")):
                continue

            contract_json = entry / "contract_extraction.json"
            contract_meta_json = entry / "contract_field_meta.json"
            invoice_json = entry / "invoice_extraction.json"
            matching_json = entry / "matching.json"
            bill_posting_json = entry / "bill_posting.json"

            # Discovery gate: a scenario needs at least one side authored.
            if not contract_json.exists() and not invoice_json.exists():
                continue

            bundle = DpFixtureBundle(key=entry.name)
            if contract_json.exists():
                bundle.contract_extraction = json.loads(contract_json.read_text())
            if contract_meta_json.exists():
                bundle.contract_field_meta = json.loads(contract_meta_json.read_text())
            if invoice_json.exists():
                bundle.invoice_extraction = json.loads(invoice_json.read_text())
            if matching_json.exists():
                bundle.matching = json.loads(matching_json.read_text())
            if bill_posting_json.exists():
                bundle.bill_posting = json.loads(bill_posting_json.read_text())

            contract_pdf = entry / "contract.pdf"
            invoice_pdf = entry / "invoice.pdf"
            bundle.contract_pdf_path = contract_pdf if contract_pdf.exists() else None
            bundle.invoice_pdf_path = invoice_pdf if invoice_pdf.exists() else None

            bundles[entry.name] = bundle

        return bundles

    def resolve(self, file_name: str) -> Optional[DpFixtureBundle]:
        bundles = self.discover()
        if not bundles:
            return None

        norm = _normalise(file_name)
        best_key, best_len = None, -1
        for key in bundles:
            norm_key = _normalise(key)
            if norm_key and norm.startswith(norm_key) and len(norm_key) > best_len:
                best_key, best_len = key, len(norm_key)

        if best_key:
            return bundles[best_key]
        return next(iter(bundles.values()))

    def keys(self) -> list[str]:
        return list(self.discover().keys())


_loader_instance: Optional[DpFixtureLoader] = None


def get_dp_loader() -> DpFixtureLoader:
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = DpFixtureLoader()
    return _loader_instance
