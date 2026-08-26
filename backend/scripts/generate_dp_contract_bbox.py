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
# rent_scenario_notes joins this list for the same reason despite being a
# free-text field, not a computed one: it's the author's OWN multi-sentence
# synthesis of the whole document (see this module's own docstring), never a
# literal transcription. Verified as a real false-positive source once the
# trailing-parenthetical variant (below) started trying its embedded asides
# as candidates: RATNA_INTAN's rent_scenario_notes landed on "(Kenangan
# Signature, Chigo)" — a brand-name aside from an unrelated subletting
# clause deep in the document, textually genuine but meaningless as "the"
# highlight for this field's actual content.
CONTRACT_SKIP_FIELDS = {"computed_status", "days_to_expiry", "rent_scenario_notes"}

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


# A composite value's literal, page-printed fact is sometimes followed by an
# editorial annotation the fixture author added themselves — always
# introduced with this exact marker (verified: GRAHA_MEGARIA/PALLADIUM/
# PAKUWON's premises_address all read "...Indonesia. NOTE: Section 1(a)
# states X while Y states Z ..."). The pre-existing _COMPOSITE_SEPARATORS
# split below picks whichever separator is FIRST IN ITS OWN PRIORITY LIST,
# not whichever occurs earliest in the string — a dash or colon buried deep
# inside the NOTE clause itself can outrank it, producing a "leading
# segment" that swallows half the annotation and then never matches
# literally anywhere. Tried as an EXTRA candidate below, never a
# replacement for the existing split — a value with no "NOTE:" at all is
# completely unaffected.
_NOTE_MARKER = "NOTE:"

# Several fields (contract_type especially) are phrased as "<English
# description> (<literal Indonesian document term>)" — the parenthetical is
# the part actually printed on the page, not the leading English
# description (verified: DEBORA_KEMANG/GRAHA_MEGARIA/KARYA_NASTARI/PAKUWON's
# contract_type all have their real page text sitting in a parenthetical —
# "Perjanjian Kerja Sama", "Penawaran Umum Perpanjangan Sewa", "Surat
# Penawaran Sewa Baru" — none of which the leading-segment split below ever
# tries, since it only ever looks at the text BEFORE a separator). Every
# parenthetical group is tried, not just the first — some values (e.g.
# PALLADIUM's contract_type) have more than one, and the literal one isn't
# always first ("(LOI)" before "(Perjanjian Sewa Menyewa)"). Same
# minimum-length gate as the leading-segment split below — a short
# parenthetical ("(LOI)") carries the same false-positive risk as any other
# short generic value and is better left to _is_short_generic_value's own
# gate than guessed at here.
_PAREN_RE = re.compile(r"\(([^()]{3,})\)")


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

    variants = []
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
                variants.append(leading)
            break  # only the pre-existing priority-first split, unchanged

    if _NOTE_MARKER in value:
        prefix = value.split(_NOTE_MARKER, 1)[0].strip()
        if len(prefix) >= _MIN_COMPOSITE_SEGMENT_CHARS:
            variants.append(prefix)

    for paren_match in _PAREN_RE.finditer(value):
        inner = paren_match.group(1).strip()
        # A parenthetical containing a digit is almost always a supporting
        # DATE or figure (e.g. "(12-Mar-2026 to 11-Mar-2027)", "(paid
        # 21-07-2026)") rather than the field's own defining literal phrase —
        # verified false positives: DEBORA_KEMANG's revenue_share_pct (15%)
        # matched onto an unrelated Year-1 date range, and RATNA_INTAN's
        # security_deposit (an amount) matched onto its own "paid" date
        # instead. Every GENUINE parenthetical match seen (contract-type/
        # co-landlord phrases — "Perjanjian Kerja Sama", "PT Graha Megaria
        # Raya", "Penawaran Umum Perpanjangan Sewa", "Surat Permohonan Sewa",
        # "Notaris Melissa Bianca Phrisckylla, Bekasi") is pure name/phrase
        # text with no digits at all, so this costs nothing on real matches.
        if len(inner) >= _MIN_COMPOSITE_SEGMENT_CHARS and not any(c.isdigit() for c in inner):
            variants.append(inner)

    return list(dict.fromkeys(variants))  # dedupe, preserve priority order


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


def _match_word_index(words: list, rect: "fitz.Rect") -> tuple[list, int] | tuple[None, None]:
    ws = sorted(words, key=lambda w: (round(w[1] / 5) * 5, w[0]))
    for i, w in enumerate(ws):
        if abs(w[0] - rect.x0) < 5 and abs(w[1] - rect.y0) < 5:
            return ws, i
    return None, None


def _has_nearby_parenthetical(words_by_page: dict, page_number: int, rect: "fitz.Rect") -> bool:
    words = words_by_page.get(page_number)
    if not words:
        return False
    ws, idx = _match_word_index(words, rect)
    if idx is None:
        return False
    nbrs = ws[max(0, idx - _PAREN_WINDOW_TOKENS):idx + _PAREN_WINDOW_TOKENS + 1]
    return any(c in w[4] for w in nbrs for c in _PAREN_CHARS)


# A nearby parenthetical alone only proves "this number is spelled out in
# words somewhere close by" — it says nothing about whether that number
# means what THIS field claims. Verified false positives from real fixtures:
# RATNA_INTAN's term_months(60) landed on "60 (enam puluh) HARI" — a 60-DAY
# notice period, correctly spelled out in words, just the wrong unit; and
# DEBORA_KEMANG's vat_rate(11) landed on "...11 Maret 2027)" — a date range's
# own closing paren sitting next to an unrelated day-of-month "11", with no
# percent sign or tax keyword anywhere nearby. A contract reuses the same
# "N (spelled-out N) unit" convention for many unrelated figures (rent
# terms, notice periods, grace periods, tax rates), so the parenthetical
# gate alone can't tell them apart — only checking for the field's own unit
# word can. Scoped to the two field shapes where this was actually observed;
# other short-generic fields keep relying on the parenthetical gate alone
# rather than guessing at a unit check with no verified failure to fix.
_UNIT_WINDOW_TOKENS = 6


def _nearby_text(words_by_page: dict, page_number: int, rect: "fitz.Rect") -> str:
    words = words_by_page.get(page_number)
    if not words:
        return ""
    ws, idx = _match_word_index(words, rect)
    if idx is None:
        return ""
    nbrs = ws[max(0, idx - 2):idx + _UNIT_WINDOW_TOKENS + 1]
    return " ".join(w[4].lower() for w in nbrs)


# _nearby_text's 6-token lookahead is appropriate for "bulan"/"hari" (a
# months figure's own unit word can sit a few words after it, e.g. "24 (dua
# puluh empat) bulan"), but it's too wide for a percent sign: every verified
# genuine percent occurrence on these documents has the "%" glued to or
# immediately after its own digits, never several tokens later — and a
# 6-token reach can cross into an ENTIRELY DIFFERENT number's own "%".
# Verified false positive: DEBORA_KEMANG's vat_rate(11) matched "tanggal 11
# Maret 2027)" (an unrelated date, correctly gated by the parenthetical
# check's own proximity) but then passed the unit check anyway, because the
# very next sentence's unrelated "15% (lima belas persen)" fell inside the
# same 6-token lookahead. Scoped narrowly: only the matched word plus the
# ONE immediately following token (covers "11 %" with a stray space,
# "11%" glued — though that also has its own faster _value_glued_to_percent
# path above — and nothing further).
_PCT_UNIT_WINDOW_TOKENS = 1


def _immediate_nearby_text(words_by_page: dict, page_number: int, rect: "fitz.Rect") -> str:
    words = words_by_page.get(page_number)
    if not words:
        return ""
    ws, idx = _match_word_index(words, rect)
    if idx is None:
        return ""
    nbrs = ws[idx:idx + _PCT_UNIT_WINDOW_TOKENS + 1]
    return " ".join(w[4].lower() for w in nbrs)


def _field_unit_ok(field: str, nearby_text: str, tight_text: str) -> bool:
    if field.endswith("_months"):
        return "bulan" in nearby_text and "hari" not in nearby_text
    if field.endswith(("_rate", "_pct")):
        return "%" in tight_text or "persen" in tight_text
    return True


# A short number glued DIRECTLY to its own "%" (no space — "PPN 11%", not
# "11 %") is unambiguous proof of a real percentage on its own, independent
# of the "N (spelled-out N)" parenthetical convention _has_nearby_parenthetical
# looks for — verified: GRAHA_MEGARIA's vat_rate=11 is printed exactly this
# way ("...per bulan + PPN 11%") with no parenthetical anywhere nearby, so
# the parenthetical-first gate below rejected a match _field_unit_ok would
# otherwise have happily confirmed. Scoped to _rate/_pct fields only (the
# one field shape actually verified to appear glued like this) and checked
# against the SAME matched word the gate below would otherwise inspect —
# never a separate, independently-chosen occurrence.
def _value_glued_to_percent(words_by_page: dict, page_number: int, rect: "fitz.Rect", value) -> bool:
    words = words_by_page.get(page_number)
    if not words:
        return False
    ws, idx = _match_word_index(words, rect)
    if idx is None:
        return False
    word_text = ws[idx][4].strip()
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        num = f"{int(value)}" if float(value).is_integer() else str(value)
    else:
        num = str(value).strip()
    return word_text.startswith(f"{num}%")


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
        glued_percent = (
            field.endswith(("_rate", "_pct"))
            and _value_glued_to_percent(words_by_page, bbox["page"], rect, value)
        )
        if not glued_percent:
            if not _has_nearby_parenthetical(words_by_page, bbox["page"], rect):
                return None
            if not _field_unit_ok(
                field,
                _nearby_text(words_by_page, bbox["page"], rect),
                _immediate_nearby_text(words_by_page, bbox["page"], rect),
            ):
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
    # contract_type processed FIRST (regardless of its position in the JSON)
    # so its own match location is known before any other field's — see the
    # collision check below.
    ordered_fields = sorted(extraction.items(), key=lambda kv: kv[0] != "contract_type")
    contract_type_rect_key = None
    for field, value in ordered_fields:
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
        rect_key = (
            bbox["page"], round(bbox["bbox_left"], 4), round(bbox["bbox_top"], 4),
            round(bbox["bbox_width"], 4), round(bbox["bbox_height"], 4),
        )
        if field == "contract_type":
            contract_type_rect_key = rect_key
        elif contract_type_rect_key is not None and rect_key == contract_type_rect_key:
            # Landed on the EXACT SAME text as this document's own
            # contract_type match — verified real cases: DEBORA_KEMANG's
            # rent_basis_type and GRAHA_MEGARIA/KARYA_NASTARI's
            # stamp_duty_registered all echo their contract_type's own
            # "(Perjanjian Kerja Sama)"/"(Penawaran Umum Perpanjangan
            # Sewa)"/"(Surat Penawaran Sewa Baru)" phrase as a passing aside
            # ("...not a conventional lease", "...this is a General Renewal
            # Offer, not yet registered..."). That phrase IS contract_type's
            # own defining fact, not this other field's — highlighting the
            # document's genre line for a field asking about rent basis or
            # stamp duty is misleading, not merely imprecise. contract_type
            # itself keeps the match; every other field with the identical
            # location is treated as not found instead of borrowing it.
            missing.append(field)
            continue

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
