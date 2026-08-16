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
class DpDocumentEntry:
    """One real invoice-like document within a vendor folder that has MORE
    than one (see `documents.json`) — e.g. Palladium's Promo Fee/Electricity/
    Water invoices all live under fixtures/dp/PALLADIUM/. Optional and
    additive: a vendor folder with a single invoice (PT_BANGUN, RATNA_INTAN)
    never has a documents.json and just keeps using
    DpFixtureBundle.invoice_extraction/invoice_pdf_path exactly as before."""
    key: str
    match: list[str]
    pdf_path: Optional[Path]
    invoice_extraction: dict
    # None when this document's Faktur Pajak wasn't captured separately (or
    # doesn't exist — e.g. an individual/non-PKP vendor).
    faktur_pajak: Optional[dict]


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
    # Populated only when the folder has a documents.json manifest (a vendor
    # with multiple real invoices — rent + utilities + installments, etc.).
    documents: list[DpDocumentEntry] = field(default_factory=list)
    # Faktur Pajak data for a single-invoice vendor folder (no documents.json)
    # — e.g. fixtures/dp/PT_BANGUN/fp_extraction.json, named to mirror P2P's
    # own fixture file exactly. A multi-invoice folder's FP data lives per
    # DpDocumentEntry.faktur_pajak instead (see documents.json) — the two
    # mechanisms are mutually exclusive per folder, not layered.
    fp_extraction: Optional[dict] = None
    # Contract-derived payment schedule (fixtures/dp/<KEY>/payment_schedule.json)
    # — the Extraction Postprocessing stage's source of truth for fields the
    # raw invoice extraction leaves empty (due_date, wht_rate, wht,
    # net_amount_after_wht), computed from the underlying lease's own
    # installment schedule rather than the invoice document itself.
    payment_schedule: Optional[dict] = None

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
            documents_json = entry / "documents.json"

            # Discovery gate: a scenario needs at least one side authored —
            # a multi-invoice vendor's own documents.json counts too (its
            # contract may not be authored yet, e.g. deferred to a follow-up).
            if not contract_json.exists() and not invoice_json.exists() and not documents_json.exists():
                continue

            bundle = DpFixtureBundle(key=entry.name)
            if contract_json.exists():
                bundle.contract_extraction = json.loads(contract_json.read_text())
            if contract_meta_json.exists():
                bundle.contract_field_meta = json.loads(contract_meta_json.read_text())
            if invoice_json.exists():
                bundle.invoice_extraction = json.loads(invoice_json.read_text())
            fp_json = entry / "fp_extraction.json"
            if fp_json.exists():
                bundle.fp_extraction = json.loads(fp_json.read_text())
            payment_schedule_json = entry / "payment_schedule.json"
            if payment_schedule_json.exists():
                bundle.payment_schedule = json.loads(payment_schedule_json.read_text())
            if matching_json.exists():
                bundle.matching = json.loads(matching_json.read_text())
            if bill_posting_json.exists():
                bundle.bill_posting = json.loads(bill_posting_json.read_text())

            contract_pdf = entry / "contract.pdf"
            invoice_pdf = entry / "invoice.pdf"
            bundle.contract_pdf_path = contract_pdf if contract_pdf.exists() else None
            bundle.invoice_pdf_path = invoice_pdf if invoice_pdf.exists() else None

            if documents_json.exists():
                manifest = json.loads(documents_json.read_text())
                for doc in manifest.get("invoices", []):
                    pdf_path = entry / doc["pdf"] if doc.get("pdf") else None
                    extraction_path = entry / doc["extraction"] if doc.get("extraction") else None
                    fp_path = entry / doc["faktur_pajak"] if doc.get("faktur_pajak") else None
                    bundle.documents.append(DpDocumentEntry(
                        key=doc["key"],
                        match=doc.get("match", [doc["key"]]),
                        pdf_path=pdf_path if pdf_path and pdf_path.exists() else None,
                        invoice_extraction=json.loads(extraction_path.read_text()) if extraction_path and extraction_path.exists() else {},
                        faktur_pajak=json.loads(fp_path.read_text()) if fp_path and fp_path.exists() else None,
                    ))

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

    def resolve_document(self, file_name: str) -> tuple[Optional[DpFixtureBundle], Optional[DpDocumentEntry]]:
        """Like resolve(), but for a vendor folder with multiple real
        invoices: also picks WHICH of the folder's documents the uploaded
        filename refers to (via documents.json's `match` aliases, longest
        alias wins). Returns (bundle, None) for a single-invoice folder with
        no documents.json — callers fall back to bundle.invoice_extraction/
        invoice_pdf_path exactly as before."""
        bundle = self.resolve(file_name)
        if not bundle or not bundle.documents:
            return bundle, None

        norm = _normalise(file_name)
        best_doc, best_len = None, -1
        for doc in bundle.documents:
            for alias in doc.match:
                norm_alias = _normalise(alias)
                if norm_alias and norm_alias in norm and len(norm_alias) > best_len:
                    best_doc, best_len = doc, len(norm_alias)
        return bundle, best_doc

    def keys(self) -> list[str]:
        return list(self.discover().keys())


_loader_instance: Optional[DpFixtureLoader] = None


def get_dp_loader() -> DpFixtureLoader:
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = DpFixtureLoader()
    return _loader_instance
