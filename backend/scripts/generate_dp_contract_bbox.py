"""
One-off/offline tool: computes bounding boxes for DirectPay contract fields,
mirroring generate_dp_invoice_bbox.py's approach but as a DELIBERATELY
SEPARATE script — contract.pdf files are a different beast (13-37 pages,
almost entirely scanned/no text layer, vs. an invoice's 1-2 pages) and
contract_extraction.json mixes literal document facts with paraphrased
summaries and outright computed fields (see CONTRACT_SKIP_FIELDS) — different
enough cost/value tradeoffs that tuning one script for both would risk
regressing the invoice/FP script's already-verified behavior. This script
never imports FROM invoice-specific state and generate_dp_invoice_bbox.py
never imports from this one — the only coupling is this file importing a few
shared, pure matching primitives (read-only reuse, changes nothing there).

Output: unlike invoice_field_meta.json/fp_field_meta.json (new sibling files
written from scratch), contract_field_meta.json ALREADY EXISTS per vendor
with hand-authored {label, section, mandatory, audit_trail,
ai_match_reasoning} per field (see fixtures/dp/*/contract_field_meta.json).
This script reads that file and MERGES a "bbox" key into each field's
existing entry, preserving everything else — never overwrites the file
wholesale.

Why coverage will be lower than invoices, by design (per explicit
instruction — better an honest gap than a wrong or fabricated box):
  - Several fields are computed, not extracted (CONTRACT_SKIP_FIELDS) —
    skipped outright, there is nothing to search for.
  - Several more are narrative summaries synthesized from the whole
    document (e.g. "rent_scenario_notes", a multi-sentence paraphrase) —
    not skipped, just very unlikely to literally match anywhere; the
    matcher's existing thresholds correctly omit these rather than guess.
  - Composite fields combine multiple facts in one string (e.g.
    customer_name = "PT BUMI BERKAH BOGA (Edward Tirtanata, Direktur
    Utama)") — _contract_value_variants also tries just the leading
    segment (before the first "(", em/en-dash, etc.), giving the core fact
    a chance to match even when the full composite string never will.
  - ISO dates (e.g. "2026-08-30") never appear in that format in an
    Indonesian lease — _contract_value_variants also tries Indonesian and
    English month-name renderings plus a couple of numeric formats.

Usage:
    cd backend && .venv/bin/python scripts/generate_dp_contract_bbox.py [VENDOR ...]
    (no args = every vendor folder with both contract_extraction.json and contract.pdf)

Same runtime requirements as generate_dp_invoice_bbox.py (pymupdf, pytesseract,
Pillow, the `tesseract` binary) — dev-time only, never imported by the app.
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generate_dp_invoice_bbox as inv  # noqa: E402 — shared matching primitives only
from directpay.fixtures import DpFixtureLoader  # noqa: E402

FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"

# Fields whose value is computed/derived, never printed in the contract
# itself (their own names say as much) — searching for these would only
# ever find (or worse, coincidentally false-positive-match) unrelated text.
CONTRACT_SKIP_FIELDS = {"computed_status", "days_to_expiry"}

# Cheaper OCR settings than the invoice script's — a contract can run 30+
# pages (vs. an invoice's 1-2), so the same 8-tiles-x-3-PSMs-per-page
# treatment there would take an impractical amount of time here. Contract
# text is also mostly normal-sized paragraph prose/form fields, not an
# invoice template's tiny cramped table cells, so it needs the aggressive
# upscaling less. PSM 3 (fully automatic) + PSM 6 (uniform block) covers
# both prose and form-like layouts reasonably without PSM 11's sparse-text
# mode, which is mainly what caught tiny isolated invoice-table strings.
CONTRACT_OCR_DPI = 250
CONTRACT_TILE_ROWS = 2
CONTRACT_TILE_COLS = 1
CONTRACT_TILE_OVERLAP = 0.15
CONTRACT_UPSCALE = 2
CONTRACT_PSMS = (3, 6)

_MONTH_EN = ["January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"]
_MONTH_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
             "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_COMPOSITE_SEPARATORS = (" (", " — ", " – ", " - ", ": ")


def _contract_value_variants(value) -> list:
    """Extra candidate values to try alongside the raw value itself —
    ISO-date reformatting and "just the leading fact" for a composite
    string (see module docstring). Returns [] for anything else (numbers,
    already-human-readable strings) — the raw value alone is already what
    generate_dp_invoice_bbox's own matching tries first."""
    if not isinstance(value, str):
        return []
    m = _ISO_DATE_RE.match(value.strip())
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if not (1 <= mo <= 12):
            return []
        return [
            f"{d} {_MONTH_ID[mo - 1]} {y}",
            f"{d} {_MONTH_EN[mo - 1]} {y}",
            f"{d:02d}/{mo:02d}/{y}",
            f"{d:02d}-{mo:02d}-{y}",
            f"{d:02d}.{mo:02d}.{y}",
        ]
    for sep in _COMPOSITE_SEPARATORS:
        if sep in value:
            leading = value.split(sep, 1)[0].strip()
            # A too-short/generic leading segment (e.g. "notice_period_days"
            # = "Renewal: 6 months. Tenant early termination: 30 days...."
            # splits to just "Renewal") has the same false-positive risk as
            # a bare short number in a long document — reject rather than
            # hand the matcher a near-meaningless single common word to go
            # find "somewhere" in a 30-page contract.
            if len(leading) >= _MIN_COMPOSITE_SEGMENT_CHARS:
                return [leading]
            return []
    return []


# A bare short number (day/month/percentage/installment counts — "3", "10",
# "60") carries almost no distinguishing signal in a 10-40 page document.
# Tried two levels of rescue, both failed on real data: (1) requiring exact
# text search — still matches as a SUBSTRING of an unrelated multi-digit
# number, since a scanned page can carry its own embedded OCR text layer
# from the scanning app itself, full of registration numbers and dates
# (RATNA_INTAN's no_of_installments=3 once landing inside an unrelated
# "13"); (2) requiring a whole-word token match instead of a substring —
# fixed that specific case, but wht_rate_pct="10" then landed EXACTLY (as a
# genuine, isolated token) on a *different* unrelated date's day-of-month,
# because "10" legitimately appears elsewhere on the same page for
# unrelated reasons. There is no purely textual way to tell "the real WHT
# rate" from "some other 2-digit number that happens to also be 10" without
# surrounding context this script doesn't model — so these are skipped
# outright rather than shown with false confidence, UNLESS that context
# comes from the document's own drafting convention (see
# _has_nearby_parenthetical below) — a real third rescue, not a repeat of
# the first two.
_SHORT_NUMBER_RE = re.compile(r"-?\d{1,3}(\.\d+)?$")
_MIN_COMPOSITE_SEGMENT_CHARS = 15

# A bare short number is allowed through ONLY when the match sits right next
# to a parenthesis — these Indonesian lease agreements consistently spell a
# contractually-stated figure both as a digit AND in words in the same
# breath ("24 (Dua Puluh Empat) bulan", "PPN 11% (Mengikuti peraturan...)"),
# a drafting convention no incidental table cell, page number, or date ever
# follows. Verified against PALLADIUM's own contract: term_months(24),
# vat_rate(11) and escalation_starts_after_months(12) each landed on a
# genuinely correct, parenthetical-adjacent occurrence (some restated more
# than once in the document, always consistently) — while
# lessor_split_pct(100)'s best textual match, a row boundary in an unrelated
# area-based fee table ("0 - 100"), had zero parenthetical neighbors and is
# correctly still rejected by this gate.
_PAREN_CHARS = ("(", ")")
_PAREN_WINDOW_TOKENS = 2


def _has_nearby_parenthetical(words_by_page: dict, page_number: int, rect: "fitz.Rect") -> bool:
    words = words_by_page.get(page_number)
    if not words:
        return False
    ws = sorted(words, key=lambda w: (round(w[1] / 5) * 5, w[0]))
    idx = None
    for i, w in enumerate(ws):
        if abs(w[0] - rect.x0) < 5 and abs(w[1] - rect.y0) < 5:
            idx = i
            break
    if idx is None:
        return False
    nbrs = ws[max(0, idx - _PAREN_WINDOW_TOKENS):idx + _PAREN_WINDOW_TOKENS + 1]
    return any(c in w[4] for w in nbrs for c in _PAREN_CHARS)


def _is_short_generic_value(value) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return abs(value) < 1000
    if isinstance(value, str):
        return bool(_SHORT_NUMBER_RE.fullmatch(value.strip()))
    return False


def _locate_field_best(doc, native_words, ocr_pages, page_rects, field, value):
    """Tries the raw value AND every contract-specific variant (best of
    both), keeping whichever result has the highest value_confidence — an
    exact match on any variant always wins over a fuzzy match on another.
    A short/generic value (see _is_short_generic_value) only ever survives
    if its best match also clears _has_nearby_parenthetical — every other
    tier's normal matching still runs and picks its usual best candidate,
    this is purely an extra acceptance gate on top."""
    is_short = _is_short_generic_value(value)
    best = None
    for candidate_value in [value, *_contract_value_variants(value)]:
        result = inv._locate_field(doc, native_words, ocr_pages, page_rects, field, candidate_value, None)
        if result is None:
            continue
        bbox, source = result
        if best is None or bbox["value_confidence"] > best[0]["value_confidence"]:
            best = (bbox, source)
    if best is None:
        return None
    if is_short:
        bbox, source = best
        rect = fitz.Rect(
            bbox["bbox_left"] * page_rects[bbox["page"]].width,
            bbox["bbox_top"] * page_rects[bbox["page"]].height,
            (bbox["bbox_left"] + bbox["bbox_width"]) * page_rects[bbox["page"]].width,
            (bbox["bbox_top"] + bbox["bbox_height"]) * page_rects[bbox["page"]].height,
        )
        words_by_page = native_words if bbox["page"] in native_words else ocr_pages
        if not _has_nearby_parenthetical(words_by_page, bbox["page"], rect):
            return None
    return best


def build_contract_field_meta(pdf_path: Path, extraction: dict, existing_meta: dict) -> dict:
    doc = fitz.open(pdf_path)
    page_rects = {i: p.rect for i, p in enumerate(doc, start=1)}
    text_pages = {i for i, p in enumerate(doc, start=1) if len(p.get_text().strip()) >= inv.MIN_PAGE_TEXT_CHARS}
    scanned_pages = set(page_rects) - text_pages

    native_words = inv._native_words_by_page(doc)
    native_words = {p: w for p, w in native_words.items() if p in text_pages}
    ocr_pages: dict = {}
    if scanned_pages:
        ocr_pages = inv._ocr_words_by_page(
            doc, scanned_pages,
            dpi=CONTRACT_OCR_DPI, tile_rows=CONTRACT_TILE_ROWS, tile_cols=CONTRACT_TILE_COLS,
            overlap=CONTRACT_TILE_OVERLAP, upscale=CONTRACT_UPSCALE, psms=CONTRACT_PSMS,
        )

    out = {k: dict(v) for k, v in existing_meta.items()}
    # A field's bbox from a PREVIOUS run of this script must never survive
    # into this run's output unless this run re-confirms it — otherwise a
    # field that stops matching (e.g. after tightening a matching rule, as
    # happened once here: several short-number false positives kept
    # appearing in the output file even after the rule that should have
    # rejected them shipped, because the merge only ever added/overwrote
    # "bbox" and never cleared a stale one when nothing new was found this
    # time) would silently keep showing a highlight from a run that's no
    # longer trusted. Every field starts this run with no bbox; one is only
    # ever added back in below, on a genuine match.
    for entry in out.values():
        entry.pop("bbox", None)

    found, skipped, missing = [], [], []
    for field, value in extraction.items():
        if field in CONTRACT_SKIP_FIELDS:
            skipped.append(field)
            continue
        # "NA" is the fixture convention for "field genuinely absent" (see
        # service.py's own _strip_na) — same as None/"", never search for it.
        # It's short enough to substring-match almost anywhere in a 10-40
        # page document at EXACT confidence — same false-positive risk
        # _is_short_generic_value already guards against for bare numbers,
        # just not numeric, so it slips past that check untouched.
        if value in (None, "", "NA"):
            continue

        best = _locate_field_best(doc, native_words, ocr_pages, page_rects, field, value)
        if best is None:
            missing.append(field)
            continue

        bbox, source = best
        entry = out.get(field, {})
        entry["bbox"] = bbox
        out[field] = entry
        found.append((field, source))

    print(
        f"    {pdf_path.name}: {len(found)}/{len(found) + len(missing)} matched "
        f"({len(skipped)} computed fields skipped) — not found: {missing}"
    )
    doc.close()
    return out


def process_vendor(vendor_dir: Path) -> None:
    contract_json = vendor_dir / "contract_extraction.json"
    contract_pdf = vendor_dir / "contract.pdf"
    meta_path = vendor_dir / "contract_field_meta.json"

    print(f"[{vendor_dir.name}]")
    if not (contract_json.exists() and contract_pdf.exists()):
        print("  (no contract_extraction.json/contract.pdf — skipped)")
        return

    extraction = json.loads(contract_json.read_text())
    existing_meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    field_meta = build_contract_field_meta(contract_pdf, extraction, existing_meta)
    meta_path.write_text(json.dumps(field_meta, indent=2) + "\n")
    print(f"  -> wrote {meta_path.relative_to(REPO_ROOT)}")


def main() -> None:
    requested = set(sys.argv[1:])
    loader = DpFixtureLoader(fixtures_dir=str(FIXTURES_DP))
    bundles = loader.discover()
    keys = requested if requested else set(bundles.keys())
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if not vendor_dir.is_dir():
            print(f"[{key}] no such fixtures/dp folder — skipped")
            continue
        process_vendor(vendor_dir)


if __name__ == "__main__":
    main()
