"""
One-off/offline tool: computes accurate bounding boxes for each flat field in
a DirectPay invoice_extraction.json, WITHOUT touching that file's schema.

Output is a sibling file per document — invoice_field_meta.json (single-invoice
vendor folder) or <doc_key>_field_meta.json (multi-invoice folder, one per
documents.json entry) — shaped identically to the existing
contract_field_meta.json convention's per-field `bbox` sub-object:

    {"invoice_number": {"bbox": {"page": 2, "bbox_left": 0.15, "bbox_top": 0.86,
                                  "bbox_width": 0.1, "bbox_height": 0.01,
                                  "value_confidence": 1.0}}, ...}

invoice_extraction.json itself is never read as anything but a read-only
source of values to search for — this script only ever writes the new
*_field_meta.json sibling.

How bbox accuracy is achieved (no ML/vision guessing involved):
  1. Real (born-digital) PDF text layer: PyMuPDF's `page.search_for()` finds
     the field's value as literal text on the page and returns its exact
     rect — pixel-perfect, deterministic. Tried first with the raw value,
     then with Indonesian-locale number/percent formatting variants (the
     source documents are Indonesian invoices: "675.675.676,00" not
     "675675676.0").
  2. Scanned/photographed PDF with no text layer at all (e.g. RATNA_INTAN's
     invoice.pdf is a WhatsApp photo printed to PDF): falls back to OCR via
     Tesseract, then fuzzy-matches the field's value against a sliding
     window of OCR words (OCR text has small misreads — "10" -> "LO" etc. —
     so exact search_for would miss). The OCR pass itself is tiled: the page
     is cropped into an overlapping grid, each tile upscaled and run through
     several Tesseract page-segmentation modes, and every tile's words
     merged — a single whole-page OCR pass reliably drops short/isolated
     text near a table border (verified: PT_BANGUN's "BCA"/"C.O.D" never
     appeared at any single DPI/PSM whole-page, but were found immediately
     once cropped+upscaled) — see _tiled_ocr_words. This is deliberately
     expensive (several dozen Tesseract calls per scanned page): it's a
     one-time precompute, never run in the live app, so trading runtime for
     recall is the right side of that tradeoff. Confidence is the fuzzy
     match ratio, capped below the exact-match cases.
  3. A field that clears neither path is just omitted from the output — the
     frontend already renders "no highlight" for any field with no bbox
     (same convention contract_field_meta.json's currently-all-empty `bbox`
     already relies on), so an omission is safe, never a wrong box.

Usage:
    cd backend && .venv/bin/python scripts/generate_dp_invoice_bbox.py [VENDOR ...]
    (no args = every vendor folder discoverable by the normal DP fixture loader)

Requires `pymupdf` in the venv (dev-time only — never imported by the app
itself, same as this script). For OCR fallback, also requires the
`tesseract` binary on PATH (brew install tesseract).
"""
import difflib
import io
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from pytesseract import Output

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from directpay.fixtures import DpFixtureLoader  # noqa: E402

FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"

# Fields never worth searching for — free text/None-heavy or not meant to be
# highlighted (line_items get no bbox here; DP invoices' own line item count
# is usually 1-2, and no consumer currently reads a per-line-item bbox).
# ai_reasoning (a per-field {field: explanation} dict on some Faktur Pajak
# fixtures — see e.g. PAKUWON's faktur_pajak_5.json) is the same kind of
# narrative-not-transcribed value as notes — never printed verbatim anywhere,
# so leaving it unskipped let _fuzzy_word_match's str(dict) fallback (see its
# own guard below) land it on an unrelated paragraph of real PDF text at a
# misleadingly high ratio (verified: PAKUWON invoice_5's FP ai_reasoning once
# landed on its own "PPN Dibebaskan" boilerplate this way).
SKIP_FIELDS = {"line_items", "notes", "ai_reasoning"}

EXACT_CONFIDENCE = 1.0
NORMALIZED_CONFIDENCE = 0.95
FUZZY_MATCH_THRESHOLD = 0.6
# OCR introduces a second layer of uncertainty on top of fuzzy matching (a
# misread digit can coincidentally resemble a formatted number) — held to a
# stricter bar than native-text fuzzy matching so it only fires on a
# genuinely close read, never a "good enough" guess.
OCR_MATCH_THRESHOLD = 0.8
OCR_MAX_CONFIDENCE = 0.93
# A page's own get_text() is below this -> treat it as a scanned image,
# eligible for OCR. A page WITH a real text layer never gets OCR'd, even if
# some other page in the same document needs it — OCR-ing an already-digital
# page only adds false-positive risk (see PT_BANGUN: OCR on its blank/image
# cover page once produced a spurious match for a field that simply isn't
# printed anywhere in the real invoice text on page 2). Set well above a
# "printed to PDF from a browser" page's own boilerplate chrome (a
# timestamp/filename/URL — RATNA_INTAN's invoice.pdf has ~128 such chars and
# ZERO real content, being a WhatsApp screenshot embedded as an image) and
# well below a genuine text-layer invoice page (PT_BANGUN/PALLADIUM: ~1900+).
MIN_PAGE_TEXT_CHARS = 250

# `currency` holds an ISO code ("IDR", "USD", ...), but an Indonesian invoice
# never prints that code as text — it prints the symbol instead ("Rp"), so a
# literal search for the code itself always comes up empty (verified:
# RATNA_INTAN's invoice says "Rp 855.555.556", never "IDR" anywhere). Tried as
# an extra candidate, never a replacement for the raw value, in case some
# future fixture's document DOES print the code literally.
_CURRENCY_SYMBOLS = {"IDR": ["Rp"], "USD": ["$", "US$"]}

# An ISO date (e.g. "2026-05-21") never appears in that format on these
# Indonesian documents — verified: DEBORA_KEMANG's invoice prints "Jakarta,
# 21 Mei 2026" for invoice_date="2026-05-21", never "2026-05-21" itself.
# Mirrors generate_dp_contract_bbox.py's own _contract_value_variants (same
# reasoning, same variant set) — duplicated rather than imported the other
# way because this module is the one contract's script imports FROM, never
# the reverse (see that script's own module docstring).
_MONTH_EN = ["January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"]
_MONTH_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
             "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
_MONTH_EN_ABBR = [m[:3] for m in _MONTH_EN]
_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def _date_variants(value: str) -> list[str]:
    """Alternate renderings of an ISO date the way it actually appears on
    an Indonesian invoice/Faktur Pajak. [] for anything that isn't an
    ISO-shaped date string (the raw value alone is already tried elsewhere).

    Includes MM/DD/YYYY alongside DD/MM/YYYY — GRAHA_MEGARIA's own template
    ("Invoice Date: 07/01/2026" for 2026-07-01) prints American month-first
    order, not the DD/MM order every other vendor here uses. Without it,
    invoice_date/billing_period_start on that template went missing outright
    (the DD/MM candidate's digit string never matches the real MM/DD text,
    and the digit-consistency gate correctly refuses a mismatched-order
    guess rather than risk a wrong box) — verified on GRAHA_MEGARIA
    invoice_1's invoice_date."""
    m = _ISO_DATE_RE.match(value.strip())
    if not m:
        return []
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12):
        return []
    return [
        f"{d} {_MONTH_ID[mo - 1]} {y}",
        f"{d} {_MONTH_EN[mo - 1]} {y}",
        f"{d:02d}/{mo:02d}/{y}",
        f"{d:02d}-{mo:02d}-{y}",
        f"{d:02d}.{mo:02d}.{y}",
        f"{mo:02d}/{d:02d}/{y}",
        f"{mo:02d}-{d:02d}-{y}",
        f"{mo:02d}.{d:02d}.{y}",
        f"{d:02d}-{_MONTH_EN_ABBR[mo - 1]}-{y}",
    ]


# A composite string field combines several distinct facts in one value
# (e.g. PAKUWON's description = "IURAN PELAYANAN AIR MEI 26 — AIR/LISTRIK/GAS,
# Unit PSA-000-06-000-025") — the full string never appears verbatim on the
# document, but its leading fact alone often does (verified: the PDF prints
# "IURAN PELAYANAN AIR MEI 26" on its own, the rest is this script's own
# synthesized suffix). Mirrors generate_dp_contract_bbox.py's own
# _contract_value_variants composite-splitting (same separators, same
# minimum-length gate — a too-short leading segment carries the same
# false-positive risk as any other bare short value, see that script's own
# comment on _MIN_COMPOSITE_SEGMENT_CHARS).
_COMPOSITE_SEPARATORS = (" (", " — ", " – ", " - ", ": ")
_MIN_COMPOSITE_SEGMENT_CHARS = 15


def _composite_leading_segment(value: str) -> list[str]:
    for sep in _COMPOSITE_SEPARATORS:
        if sep in value:
            leading = value.split(sep, 1)[0].strip()
            if len(leading) >= _MIN_COMPOSITE_SEGMENT_CHARS:
                return [leading]
            return []
    return []


def _id_number_variants(value: float) -> list[str]:
    """Indonesian-locale renderings of a number as it actually appears on
    these documents: '.' thousands, ',' decimals — plus a no-decimals form
    (most totals print as whole rupiah) and a bare-digits fallback.

    For a non-integer value the with-decimals form is listed BEFORE the
    whole-number one — _text_layer_match tries candidates in order and
    returns on the first hit, and the whole-number form is always a literal
    substring of the with-decimals form when the document DOES print cents,
    so trying it first previously won every time and silently produced a box
    that stopped right before ",14" — narrower than the real printed text,
    even though the fuller/more-precise match was one candidate away
    (verified: GRAHA_MEGARIA's faktur_pajak_4 taxable_amount, 2407870.14,
    boxed only "2.407.870"). Listing with-decimals first still falls back to
    whole-number correctly whenever the document only prints whole rupiah
    (verified: PAKUWON invoice_6's total_amount, 4956647.28, has no ",28"
    anywhere on the page — with-decimals simply doesn't match there, and the
    whole-number candidate is tried next as before)."""
    variants = []
    is_int_valued = float(value).is_integer()
    whole = f"{value:,.0f}".replace(",", ".")
    if not is_int_valued:
        with_decimals = f"{value:,.2f}".replace(",", "\0").replace(".", ",").replace("\0", ".")
        variants.append(with_decimals)
        variants.append(whole)
    else:
        variants.append(whole)
        variants.append(f"{whole},00")
    variants.append(str(int(value)) if is_int_valued else str(value))
    return variants


def _percent_variants(fraction: float) -> list[str]:
    pct = fraction * 100
    out = []
    for v in ({f"{pct:.0f}", f"{pct:.2f}".rstrip("0").rstrip(".")}):
        out.append(f"{v}%")
        out.append(f"{v},00%" if "," not in v else f"{v}%")
    return list(dict.fromkeys(out))


def _search_candidates(field: str, value) -> list[tuple[str, float]]:
    """[(candidate_text, confidence_if_matched), ...] in priority order."""
    if isinstance(value, bool) or value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        out = [(s, EXACT_CONFIDENCE)]
        collapsed = re.sub(r"\s+", " ", s)
        if collapsed != s:
            out.append((collapsed, NORMALIZED_CONFIDENCE))
        out.extend((v, NORMALIZED_CONFIDENCE) for v in _date_variants(s))
        out.extend((v, NORMALIZED_CONFIDENCE) for v in _composite_leading_segment(s))
        # currency's symbol variant (e.g. "IDR" -> "Rp") is deliberately NOT
        # added here — page.search_for() is a raw substring search, and a
        # 2-3 character symbol matches as a substring of an unrelated word
        # constantly (verified: "Rp" matched twice inside PT_BANGUN's own
        # contract's "Perpanjangan"). _fuzzy_word_match's own symbol
        # handling is safe because it works from whole-word tokens and
        # gates short candidates on a near-exact ratio (see its own
        # min_ratio) — this exact/substring tier has no equivalent guard to
        # add that safety to, so the candidate is tried there instead.
        return out
    if isinstance(value, (int, float)):
        cands = []
        if field.endswith("_rate"):
            cands.extend((v, NORMALIZED_CONFIDENCE) for v in _percent_variants(value))
        cands.extend((v, NORMALIZED_CONFIDENCE) for v in _id_number_variants(value))
        return cands
    return []


# Floor on the confidence written to a fixture, per explicit instruction: no
# emitted box may report below 0.9. A weak fuzzy/OCR ratio is lifted to this
# instead of being written as-is.
#
# NOTE this deliberately discards a signal. Measured across all 407 boxes, the
# raw ratio tracked correctness closely: every box that reported 0.7 failed to
# contain its value, and 92% of all misses reported below 1.0, while all 122
# boxes at 0.9 and 122 at 0.9+ landed correctly. Flooring makes a weak match
# indistinguishable from a confident one, so a consumer can no longer filter on
# it. OCR_MAX_CONFIDENCE was raised to 0.93 alongside this so the three tiers
# (exact 1.0 > normalized 0.95 > OCR 0.93) stay ordered and above the floor —
# left at 0.9 the floor would have overridden the cap and collapsed them.
MIN_VALUE_CONFIDENCE = 0.91


def _normalized_bbox(rect: "fitz.Rect", page_size: "fitz.Rect", page_number: int, confidence: float) -> dict:
    w, h = page_size.width, page_size.height
    return {
        "page": page_number,
        "bbox_left": round(rect.x0 / w, 6),
        "bbox_top": round(rect.y0 / h, 6),
        "bbox_width": round((rect.x1 - rect.x0) / w, 6),
        "bbox_height": round((rect.y1 - rect.y0) / h, 6),
        "value_confidence": max(round(confidence, 3), MIN_VALUE_CONFIDENCE),
    }


def _group_into_occurrences(hits: list) -> list["fitz.Rect"]:
    """page.search_for() can split ONE logical occurrence into several rects
    when the matched text crosses a font/style run boundary mid-line —
    verified on DEBORA_KEMANG's invoice_date: searching for "21 Mei 2026"
    returns three separate same-line rects ("21" / " Mei" / "2026", each a
    different text run), and treating each as its own occurrence silently
    produced a box covering just "21" — missing "Mei 2026" entirely, a real
    too-narrow box, not a wrong-location one. Groups consecutive hits that
    continue the same line (y-ranges overlap, x-gap small relative to line
    height) into one unioned rect per genuine occurrence — a separate later
    occurrence elsewhere on the page starts a new group instead of being
    folded in."""
    groups = [[hits[0]]]
    for r in hits[1:]:
        prev = groups[-1][-1]
        same_line = min(prev.y1, r.y1) - max(prev.y0, r.y0) > 0
        gap = r.x0 - prev.x1
        # Must be a small POSITIVE gap (r continues immediately after prev) —
        # not just a small gap in absolute terms. A same-line occurrence far
        # to prev's LEFT (e.g. the same amount appearing again earlier in a
        # line-item's own description sentence, before its real right-aligned
        # column value) makes `gap` a large negative number, which used to
        # satisfy "gap < threshold" trivially and silently unioned two
        # unrelated same-line occurrences into one box spanning the entire
        # line — verified: PAKUWON's faktur_pajak taxable_amount (30.000.000)
        # appearing both inside "Rp 30.000.000 x 1,00 ..." and again in the
        # row's own right-hand amount column produced a box stretching
        # across ~79% of the page width instead of a tight box on just the
        # right-hand figure. A small negative allowance (-1pt) still permits
        # the rare hairline sub-pixel overlap between two genuinely adjacent
        # font runs.
        close_x = -1 <= gap < max(prev.height, r.height, 1) * 2
        if same_line and close_x:
            groups[-1].append(r)
        else:
            groups.append([r])
    return [fitz.Rect(
        min(r.x0 for r in g), min(r.y0 for r in g),
        max(r.x1 for r in g), max(r.y1 for r in g),
    ) for g in groups]


# Fields whose value routinely duplicates OTHER text on the same page — a
# bank account HOLDER name is very often just the vendor's own name again
# (or, on a few Indonesian templates, the CUSTOMER's), so the literal string
# also matches the letterhead/"Kepada Yth" block near the top of the page.
# The genuine occurrence — the one actually inside the payment/bank-details
# block — is consistently the LAST (bottom-most) one on these invoice
# templates, never the first. Verified as a real, non-hypothetical bug: all
# 6 PAKUWON invoices, all 3 PALLADIUM invoices, and RATNA_INTAN's invoice all
# had vendor_bank_account_name landing on the header occurrence (matching
# vendor_name's own position almost exactly) while vendor_bank_name /
# vendor_bank_account_number correctly resolved to the real bank-details
# block far below. Scoped to just this one field — the sibling bank fields
# (bank name, account number) are near-unique strings with no such ambiguity,
# and generalizing "prefer the last occurrence" to every field would be a
# guess with no verified failure to justify it.
_PREFER_LAST_OCCURRENCE_FIELDS = {"vendor_bank_account_name"}

# How close a fuzzy-match ratio has to be to the best one seen so far to
# still count as "the same real occurrence, just read back with slightly
# different OCR noise" for _PREFER_LAST_OCCURRENCE_FIELDS purposes (see its
# own comment above and _fuzzy_word_match's use of this).
_NEAR_TIE_TOLERANCE = 0.05


def _select_occurrence(field: str, occurrences: list["fitz.Rect"]) -> "fitz.Rect":
    if field in _PREFER_LAST_OCCURRENCE_FIELDS and len(occurrences) > 1:
        return max(occurrences, key=lambda r: r.y0)
    return occurrences[0]


def _text_layer_match(doc: "fitz.Document", field: str, value, allowed_pages: set[int] | None = None) -> dict | None:
    for candidate, confidence in _search_candidates(field, value):
        for page_number, page in enumerate(doc, start=1):
            if allowed_pages is not None and page_number not in allowed_pages:
                continue
            hits = page.search_for(candidate)
            if hits:
                occurrences = _group_into_occurrences(hits)
                rect = _select_occurrence(field, occurrences)
                return _normalized_bbox(rect, page.rect, page_number, confidence)
    return None


def _detect_fp_title_pages(doc: "fitz.Document") -> set[int]:
    """A page whose own text is titled "Faktur Pajak" — e.g. PT_BANGUN's
    invoice.pdf bundles the commercial invoice (page 1) and its own Faktur
    Pajak (page 2) as one physical file. That page is reserved for FP field
    lookups (fp_field_meta.json, searched separately) — the invoice's own
    field_meta should never point there just because a value (an invoice
    number footnote, a duplicated amount) happens to also appear on it; the
    Invoice Extraction screen highlighting a "Faktur Pajak"-titled page for
    its own Invoice Number is exactly the bug this exists to prevent. Native
    text only: an image-only page can't carry this title in its text layer,
    so there's nothing to detect there without OCR, and nothing here needs it."""
    return {
        page_number for page_number, page in enumerate(doc, start=1)
        if "faktur pajak" in page.get_text()[:80].lower()
    }


_WORD_RE = re.compile(r"[a-z0-9]+")


def _norm_tokens(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _native_words_by_page(doc: "fitz.Document") -> dict[int, list[tuple]]:
    """1-indexed page -> [(x0,y0,x1,y1,word), ...] straight from the PDF's own
    text layer (no OCR) — used for the fuzzy fallback tier so a field/PDF
    wording mismatch ("PT.Bangun Era Sejahtera" vs. the PDF's own "BANGUN ERA
    SEJAHTERA") can still be located without resorting to OCR."""
    return {
        page_number: [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]
        for page_number, page in enumerate(doc, start=1)
    }


# Tiled OCR parameters. This is a one-time, offline precompute (never run in
# the live app — the JSON it produces is what actually gets served), so it's
# tuned entirely for recall over runtime: a whole-page OCR pass at any single
# DPI/PSM reliably DROPS short/isolated text sitting near a table border
# (verified empirically: PT_BANGUN's "BCA"/"C.O.D" — 3-6 characters in a
# bordered cell — never appeared in a single word list at dpi 300/400/600
# across 5 different PSMs, whole-page). Cropping tightly to a tile and
# upscaling it fixes this (same text, same PSMs, now found first try) —
# tiling the whole page this way, across several PSMs, and merging every
# tile's words gives OCR many independent chances to catch each piece of
# text instead of one.
OCR_DPI = 300
OCR_TILE_ROWS = 4
OCR_TILE_COLS = 2
OCR_TILE_OVERLAP = 0.2  # fraction of tile size, so a word straddling a tile boundary still falls whole inside at least one tile
OCR_UPSCALE = 3
OCR_PSMS = (6, 11, 4)  # uniform block / sparse text / single column — different assumptions, different misses
OCR_MIN_CONF = 40  # Tesseract's own 0-100 confidence; below this is noise, not a genuine miss

# A SECOND, finer grid, merged with the one above rather than replacing it
# (see _ocr_words_by_page) — some text needs bigger tiles (a wrapped
# multi-line description reads best as one contiguous block) while other
# text needs smaller ones (RATNA_INTAN's "Rp 855.555.556" total line was
# ABSENT from every 4x2 tile's word list at every PSM, yet read back
# correctly, digit-for-digit, from the exact same line cropped tight and
# OCR'd in isolation — a busy 4x2 tile's own page-segmentation can silently
# drop a line a smaller, closer-to-isolated crop reads fine). Doubles OCR
# time per scanned page; still tractable for a 1-2 page invoice.
OCR_TILE_ROWS_FINE = 6
OCR_TILE_COLS_FINE = 3
OCR_TILE_OVERLAP_FINE = 0.25


def _tiled_ocr_words(
    page: "fitz.Page",
    dpi: int = OCR_DPI,
    tile_rows: int = OCR_TILE_ROWS,
    tile_cols: int = OCR_TILE_COLS,
    overlap: float = OCR_TILE_OVERLAP,
    upscale: int = OCR_UPSCALE,
    psms: tuple[int, ...] = OCR_PSMS,
) -> list[tuple]:
    """[(x0,y0,x1,y1,word), ...] in PAGE POINT coordinates, merged across a
    grid of overlapping tiles x several PSM configs (see OCR_* constants
    above for what the defaults mean and why). Deduped by (rounded position,
    lowercased text) — overlapping tiles and multiple PSMs both frequently
    re-find the same word, and without dedup that just wastes time in the
    fuzzy matcher, not accuracy.

    All of dpi/tile_rows/tile_cols/overlap/upscale/psms are overridable so a
    caller processing far more pages per document (e.g. a 30+ page contract
    PDF, vs. an invoice's 1-2 pages) can trade some recall for tractable
    runtime — see generate_dp_contract_bbox.py's own, cheaper defaults."""
    px_per_pt = dpi / 72
    pix = page.get_pixmap(dpi=dpi)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    w, h = img.size

    tile_w, tile_h = w / tile_cols, h / tile_rows
    overlap_w, overlap_h = tile_w * overlap, tile_h * overlap

    seen: set[tuple] = set()
    words: list[tuple] = []
    for row in range(tile_rows):
        for col in range(tile_cols):
            x0 = max(0, int(col * tile_w - overlap_w))
            y0 = max(0, int(row * tile_h - overlap_h))
            x1 = min(w, int((col + 1) * tile_w + overlap_w))
            y1 = min(h, int((row + 1) * tile_h + overlap_h))
            tile = img.crop((x0, y0, x1, y1))
            tile = tile.resize((tile.width * upscale, tile.height * upscale), Image.LANCZOS)

            for psm in psms:
                data = pytesseract.image_to_data(tile, config=f"--psm {psm}", output_type=Output.DICT)
                for i, text in enumerate(data["text"]):
                    text = text.strip()
                    if not text:
                        continue
                    try:
                        if int(data["conf"][i]) < OCR_MIN_CONF:
                            continue
                    except (ValueError, TypeError):
                        continue
                    # Tile-local upscaled pixels -> tile-local original pixels -> full-page pixels -> page points.
                    lx = data["left"][i] / upscale + x0
                    ly = data["top"][i] / upscale + y0
                    lw = data["width"][i] / upscale
                    lh = data["height"][i] / upscale
                    px0, py0 = lx / px_per_pt, ly / px_per_pt
                    px1, py1 = (lx + lw) / px_per_pt, (ly + lh) / px_per_pt
                    key = (text.lower(), round(px0), round(py0))
                    if key in seen:
                        continue
                    seen.add(key)
                    words.append((px0, py0, px1, py1, text))

    # Merged order so far is "tile append order" (all of tile (0,0)'s words,
    # then all of tile (0,1)'s, ...) — NOT reading order. The fuzzy matcher's
    # sliding window assumes adjacent-in-list means adjacent-on-page, and a
    # word straddling a tile boundary breaks that badly: e.g. RATNA_INTAN's
    # "Ny. Ratna Intan" (left tile) and "Mulyati G" (right tile, same visual
    # row) once ended up hundreds of words apart in the merged list, so no
    # window ever considered them together. Sorting into genuine top-to-
    # bottom, left-to-right reading order (row-bucketed so small baseline
    # jitter within one line doesn't reorder it) fixes this regardless of
    # which tile actually found each word.
    words.sort(key=lambda w: (round(w[1] / 5) * 5, w[0]))
    return words


def _ocr_words_by_page(doc: "fitz.Document", page_numbers: set[int], **ocr_kwargs) -> dict[int, list[tuple]]:
    """1-indexed page -> [(x0,y0,x1,y1,word), ...], OCR'd once per page and
    cached for every field on that document (expensive — several dozen
    Tesseract passes per page, not per field). Only ever called for
    `page_numbers` that lack a real text layer — see MIN_PAGE_TEXT_CHARS in
    build_field_meta; OCR-ing a page that already has real text just adds
    false-positive risk. `ocr_kwargs` forwards to _tiled_ocr_words (e.g. a
    cheaper tile grid/PSM set for a many-page document — see its own
    docstring).

    Called with no `ocr_kwargs` (this script's own default invoice/FP path,
    never generate_dp_contract_bbox.py's — it always passes its own cheaper
    grid explicitly), the default grid's words are merged with a second,
    finer pass (OCR_TILE_ROWS_FINE etc.) rather than either grid replacing
    the other — see those constants' own docstring for why one grid can't
    just be tuned to replace the other outright: a wrapped multi-line
    description needs bigger tiles to read as one contiguous block, while
    an isolated line near a table border needs smaller ones. Extra
    (duplicate-ish) candidate words from merging two grids cost the fuzzy
    matcher a bit of search time, never correctness — the same window still
    scores the same ratio regardless of how many times a word appears."""
    cache: dict[int, list[tuple]] = {}
    for page_number in page_numbers:
        page = doc[page_number - 1]
        try:
            words = _tiled_ocr_words(page, **ocr_kwargs)
            if not ocr_kwargs:
                words = words + _tiled_ocr_words(
                    page, tile_rows=OCR_TILE_ROWS_FINE, tile_cols=OCR_TILE_COLS_FINE,
                    overlap=OCR_TILE_OVERLAP_FINE,
                )
            cache[page_number] = words
        except Exception as exc:  # tesseract missing/misconfigured — skip OCR entirely
            print(f"    ! OCR unavailable ({exc!r}) — skipping OCR fallback", file=sys.stderr)
            return {}
    return cache


def _is_spatially_coherent(ws: list[tuple]) -> bool:
    """Rejects a candidate window whose words aren't actually close together
    on the page — a flat token-index window can span words that are
    contiguous in OCR's reading order but visually far apart (e.g. a
    stylized logo/heading splits a page into garbled fragments, and a
    genuinely-distant column's fragment ends up sequenced between two real
    lines of an address — see PT_BANGUN's vendor_address once grabbing the
    far-right "INVOICE" title between its own two address lines). Groups
    words into rows by y-proximity, then requires BOTH consecutive words
    within a row to be within a plausible word-spacing gap of each other,
    AND consecutive rows to be within a plausible line-spacing gap of each
    other — the latter is the one that matters most for tiled OCR
    specifically: RATNA_INTAN's "Ny. Ratna Intan Mulyati G" once matched a
    window pairing a "Nama" label with its own name a full 270pt further
    down the page, because each individual row was internally tight (no
    horizontal-gap violation) even though the two rows themselves were
    nowhere near each other — a within-row-only check never catches that."""
    if len(ws) <= 1:
        return True
    avg_height = sum(w[3] - w[1] for w in ws) / len(ws)
    row_tolerance = max(avg_height * 0.6, 4)
    max_gap = max(avg_height * 6, 50)  # generous vs. normal inter-word spacing
    max_row_gap = max(avg_height * 2.5, 30)  # generous vs. normal line spacing

    rows: list[list[tuple]] = []
    for w in sorted(ws, key=lambda w: w[1]):
        placed = False
        for row in rows:
            if abs(row[0][1] - w[1]) <= row_tolerance:
                row.append(w)
                placed = True
                break
        if not placed:
            rows.append([w])

    for row in rows:
        row.sort(key=lambda w: w[0])
        for a, b in zip(row, row[1:]):
            if b[0] - a[2] > max_gap:
                return False

    row_infos = sorted(
        (min(w[1] for w in row), max(w[3] for w in row), min(w[0] for w in row), max(w[2] for w in row))
        for row in rows
    )
    x_tolerance = max(avg_height * 3, 30)
    for (_, prev_bottom, prev_x0, prev_x1), (top, _, x0, x1) in zip(row_infos, row_infos[1:]):
        if top - prev_bottom > max_row_gap:
            return False
        # Consecutive lines of one wrapped paragraph overlap (or nearly so)
        # in x — two side-by-side columns at similar line-spacing (e.g.
        # RATNA_INTAN's "Kepada:"/"Dari:" addresses) never do, even though
        # each individual row passes the gap check above. A negative
        # "overlap" here is the horizontal gap between the two rows' spans;
        # a small one is a normal indent, a large one is a different column.
        overlap = min(prev_x1, x1) - max(prev_x0, x0)
        if overlap < -x_tolerance:
            return False
    return True


# Common OCR digit/letter confusions — 'O'/'o' for '0', 'l'/'I'/'i' for '1',
# etc. Applied ONLY within a token that already contains a real digit (never
# to a purely-alphabetic word like "Agustus"), and ONLY for OCR-sourced word
# lists — a native PDF text layer has no character-recognition noise to
# correct for, so the digit gate stays fully strict there.
_OCR_DIGIT_LOOKALIKES = str.maketrans({
    "o": "0", "O": "0", "l": "1", "I": "1", "i": "1",
    "s": "5", "S": "5", "b": "8", "B": "8", "z": "2", "Z": "2", "g": "9", "G": "9",
})


def _window_digits(window_text: str, ocr: bool) -> str:
    if not ocr:
        return "".join(ch for ch in window_text if ch.isdigit())
    out = []
    for tok in window_text.split(" "):
        if any(ch.isdigit() for ch in tok):
            tok = tok.translate(_OCR_DIGIT_LOOKALIKES)
        out.append("".join(ch for ch in tok if ch.isdigit()))
    return "".join(out)


def _fuzzy_word_match(
    words_by_page: dict[int, list[tuple]],
    page_rects: dict[int, "fitz.Rect"],
    field: str,
    value,
    threshold: float,
    ocr: bool = False,
) -> tuple[float, "fitz.Rect", int] | None:
    """Slides a window over a page's *normalized-token* stream (not its raw
    word list — a single source word like "6,523,000" expands to 3 tokens
    ["6","523","000"], and windowing by raw word count let the window balloon
    past the target's token count and dilute the ratio into never matching;
    windowing by token count keeps the compared strings the same rough
    length). Absorbs wording differences (missing "PT." prefix, "Jul" vs
    "Juli", reformatted punctuation) and OCR misreads alike, without ever
    inventing a box for text that plainly isn't on the page (gated by
    `threshold`). Returns the raw ratio (uncapped) so a caller comparing this
    against another word source's own match can tell which is genuinely the
    better textual match, before any confidence-display capping is applied."""
    # A numeric value additionally requires its window's digits to match the
    # target's digits EXACTLY (see `target_digits` below) — difflib's ratio
    # on two formatted numbers is misleadingly forgiving (e.g. "85.555.556"
    # vs "855.555.556" scores high: 10 of 11 characters line up), which once
    # landed RATNA_INTAN's total_amount_before_vat on its own WHT line
    # instead of its real line one row up. Wording/OCR slack (punctuation,
    # spacing, misread letters) is still fully absorbed for text values —
    # this gate only fires for numbers, where "close" is never good enough.
    #
    # A `currency` value also tries its symbol variant (_CURRENCY_SYMBOLS)
    # alongside the raw ISO code — same reasoning as _search_candidates' own
    # exact-tier currency handling, needed again here since this tier works
    # from the raw value directly rather than from _search_candidates'
    # output, and a fully scanned page (e.g. RATNA_INTAN's invoice) never
    # reaches the exact tier at all.
    # A dict/list value (e.g. an "ai_reasoning" map) has no business being
    # stringified and fuzzy-matched — str(some_dict) is an arbitrary blob of
    # punctuation-mangled text that can coincidentally ratio-match a real
    # paragraph on the page (see SKIP_FIELDS' own note on ai_reasoning).
    # _search_candidates' exact tier already safely no-ops on these (falls
    # through its own type checks to `return []`); this tier needs the same
    # explicit guard since it works from the raw value, not that function.
    if not isinstance(value, (str, int, float)):
        return None
    is_numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
    if is_numeric:
        # ALL variants, not just the first (whole-number) one — a
        # non-integer value's real cents only show up in the "with_decimals"
        # variant, and skipping straight to the whole-number one silently
        # ROUNDS first (35242.9 -> "35.243"), which then fails the digit
        # gate below against the real printed "35,242.90" (digits "3524290"
        # vs the rounded candidate's "35243") even though the with_decimals
        # variant's digits ("3524290") match exactly — verified missing on
        # GRAHA_MEGARIA invoice_3's vat_gst/total_amount before this fix.
        value_strs = _id_number_variants(float(value))
    else:
        value_strs = [str(value), *_date_variants(str(value)), *_composite_leading_segment(str(value))]
        if field == "currency":
            value_strs += _CURRENCY_SYMBOLS.get(str(value).strip(), [])

    best = None  # (ratio, page_number, rect) — the SELECTED occurrence
    best_ratio_seen = 0.0  # highest ratio observed, never lowered by a position-preferred pick
    for value_str in value_strs:
        target_tokens = _norm_tokens(value_str)
        if not target_tokens:
            continue
        # Applied to EVERY value, not just numeric-typed ones — a string
        # value's own digits (a date's day/month/year, an invoice number's
        # trailing sequence, an ID number) are exactly as load-bearing as a
        # numeric field's, and difflib's ratio alone is far too forgiving to
        # catch a wrong-but-textually-similar candidate on its own (verified:
        # DEBORA_KEMANG's due_date "2026-06-10" once matched onto
        # invoice_date's own "21 Mei 2026" text — same surrounding word
        # shapes, completely different digits — and invoice_number
        # "Invoice - 1" once matched a truncated "Invoice –" window missing
        # its own "1"). A target with NO digits at all (candidate_text is
        # pure text) still gates correctly: it requires the matched window to
        # ALSO carry no digits, which every genuine text-only match already
        # satisfies and a wrong match that drifted onto an adjacent number
        # would not.
        target_digits = "".join(ch for ch in "".join(target_tokens) if ch.isdigit())
        candidate_text = " ".join(target_tokens)
        n = len(target_tokens)
        # A SINGLE-token candidate of <=3 chars (a currency symbol like "Rp",
        # not a multi-token short string like "C.O.D" -> ["c","o","d"]) needs
        # a near-exact ratio, not just this tier's normal threshold —
        # difflib's ratio on a 2-3 character target is barely discriminating
        # at all (verified: PT_BANGUN's contract "Rp" once scored 0.8 — above
        # the normal 0.6/0.8 tier thresholds — against a fragment of
        # "Perpanjangan" that has nothing to do with currency). A genuine
        # exact "Rp" OCR word always scores a clean 1.0 here, so this costs
        # nothing on real matches, only false ones. Scoped to n==1 only —
        # broadening it to any short candidate_text once cost PT_BANGUN's own
        # payment_terms ("C.O.D" -> 3 short tokens, genuinely correct at a
        # borderline 0.8 ratio) its already-confirmed-good match.
        min_ratio = max(threshold, 0.99) if n == 1 and len(candidate_text) <= 3 else threshold

        for page_number, words in words_by_page.items():
            if not words:
                continue
            # Flatten to (token, source_word_index) so a matched window can map
            # back to exactly the words it came from (not padding neighbors).
            flat: list[tuple[str, int]] = [
                (tok, wi) for wi, w in enumerate(words) for tok in _norm_tokens(w[4])
            ]
            if not flat:
                continue
            m = len(flat)
            # Window-length band to try: tight (n-1..n+2) works well for short
            # values (names, numbers, dates) where OCR token-count variance is
            # small. A long multi-line address/description needs much more
            # slack — OCR can split or merge several of its ~15-20 tokens
            # differently line to line, and a fixed +/-2 band never finds a
            # window covering enough of it to clear the ratio threshold at all.
            wlen_lo = max(n - 1, 1) if n <= 8 else max(int(n * 0.5), 1)
            wlen_hi = (n + 3) if n <= 8 else int(n * 1.6) + 3
            for wlen in range(wlen_lo, wlen_hi):
                for start in range(0, m - wlen + 1):
                    window = flat[start:start + wlen]
                    window_text = " ".join(tok for tok, _ in window)
                    if target_digits is not None:
                        window_digits = _window_digits(window_text, ocr)
                        if window_digits != target_digits:
                            continue
                    ratio = difflib.SequenceMatcher(None, window_text, candidate_text).ratio()
                    if ratio < min_ratio:
                        continue
                    # A strict ratio improvement always wins outright for
                    # every field. For _PREFER_LAST_OCCURRENCE_FIELDS, a
                    # NEAR-tie also matters, not just an exact one — OCR
                    # noise can cost a genuine duplicate occurrence a few
                    # points of ratio without making it any less real
                    # (verified: RATNA_INTAN's real bank-details occurrence
                    # of "Mulyati G" got OCR'd as one merged "MulyatiG" token,
                    # no space, scoring ~0.976 against the header's clean
                    # 1.0 for the exact same name — an exact-tie check alone
                    # missed this and kept the wrong, higher-scoring header
                    # match). Comparing against best_ratio_seen (the highest
                    # ratio observed all scan, never lowered by a
                    # position-preferred pick) keeps the tolerance window
                    # anchored to the true best instead of drifting down
                    # across repeated near-tie replacements.
                    prefer_last = field in _PREFER_LAST_OCCURRENCE_FIELDS
                    if best is not None:
                        if prefer_last:
                            if ratio < best_ratio_seen - _NEAR_TIE_TOLERANCE:
                                continue
                        elif ratio <= best[0]:
                            continue
                    word_idxs = sorted({wi for _, wi in window})
                    ws = [words[i] for i in word_idxs]
                    if not _is_spatially_coherent(ws):
                        continue
                    x0 = min(w[0] for w in ws)
                    y0 = min(w[1] for w in ws)
                    x1 = max(w[2] for w in ws)
                    y1 = max(w[3] for w in ws)
                    if (
                        best is not None and prefer_last
                        and ratio >= best_ratio_seen - _NEAR_TIE_TOLERANCE
                        and y0 <= best[2].y0
                    ):
                        continue  # near-tied ratio, but no further down than the current pick
                    best = (ratio, page_number, fitz.Rect(x0, y0, x1, y1))
                    best_ratio_seen = max(best_ratio_seen, ratio)

    if best is None or best[0] < threshold:
        return None
    ratio, page_number, rect = best
    return (ratio, rect, page_number)


def _locate_field(
    doc: "fitz.Document",
    native_words: dict[int, list[tuple]],
    ocr_pages: dict[int, list[tuple]],
    page_rects: dict[int, "fitz.Rect"],
    field: str,
    value,
    allowed_pages: set[int] | None,
) -> tuple[dict, str] | None:
    """One matching attempt (exact -> fuzzy-text/ocr, best-ratio-wins),
    optionally restricted to `allowed_pages`. Returns (bbox, source_label)."""
    bbox = _text_layer_match(doc, field, value, allowed_pages)
    if bbox is not None:
        return bbox, "exact"

    nw = native_words if allowed_pages is None else {p: w for p, w in native_words.items() if p in allowed_pages}
    op = ocr_pages if allowed_pages is None else {p: w for p, w in ocr_pages.items() if p in allowed_pages}

    # Try every available word source and keep the one with the best raw
    # match quality — NOT just whichever tier happens to be tried first. A
    # generic/short value can coincidentally appear in more than one place
    # (e.g. PT_BANGUN's vendor_bank_account_name is textually identical to
    # its vendor_name, which also shows up as the Faktur Pajak's own
    # seller-name header on a different page) — picking "first tier that
    # finds anything" would silently prefer whichever source happens to be
    # checked first, even when another source has a tighter, more relevant
    # match. Each source still has its own acceptance bar (a mediocre OCR
    # read is never trusted just because it's the best OCR could do); among
    # survivors, best ratio wins.
    candidates = []  # (ratio, rect, page_number, source_label)
    if nw:
        hit = _fuzzy_word_match(nw, page_rects, field, value, FUZZY_MATCH_THRESHOLD)
        if hit:
            candidates.append((*hit, "fuzzy-text"))
    if op:
        hit = _fuzzy_word_match(op, page_rects, field, value, OCR_MATCH_THRESHOLD, ocr=True)
        if hit:
            candidates.append((*hit, "ocr"))
    if not candidates:
        return None

    ratio, rect, page_number, source = max(candidates, key=lambda c: c[0])
    max_confidence = NORMALIZED_CONFIDENCE if source == "fuzzy-text" else OCR_MAX_CONFIDENCE
    confidence = round(min(ratio, max_confidence), 3)
    return _normalized_bbox(rect, page_rects[page_number], page_number, confidence), source


def build_field_meta(pdf_path: Path, extraction: dict, restrict_pages: set[int] | None = None) -> dict:
    """restrict_pages: when given, a field is ONLY ever searched for on these
    pages — hard boundary, no fallback to the rest of the document. This is
    what keeps the invoice side and the Faktur Pajak side of a shared PDF
    (e.g. PT_BANGUN's invoice.pdf: page 1 is the commercial invoice, page 2
    is literally titled "Faktur Pajak" — see _detect_fp_title_pages)
    mutually exclusive: the Invoice Extraction screen must NEVER highlight
    something on the FP page, and vice versa, even if that means a field
    that only appears on the other side goes without a box entirely rather
    than borrowing it — a missing highlight is fine, a highlight on the
    wrong stage's page is not."""
    doc = fitz.open(pdf_path)
    page_rects = {i: p.rect for i, p in enumerate(doc, start=1)}
    # Per-PAGE, not per-document: a document can mix a real-text page with a
    # scanned/image page (e.g. PT_BANGUN's invoice.pdf), and OCR must never
    # run on a page that already has real text (see MIN_PAGE_TEXT_CHARS).
    text_pages = {i for i, p in enumerate(doc, start=1) if len(p.get_text().strip()) >= MIN_PAGE_TEXT_CHARS}
    scanned_pages = set(page_rects) - text_pages

    native_words = _native_words_by_page(doc)
    native_words = {p: w for p, w in native_words.items() if p in text_pages}
    # Computed once per document (not per-field): needed to compare against
    # native-text matches for cross-tier candidates below, whenever this
    # document has any scanned/image-only page at all.
    ocr_pages: dict[int, list[tuple]] = _ocr_words_by_page(doc, scanned_pages) if scanned_pages else {}

    out: dict = {}
    found_exact, found_fuzzy, found_ocr, missing = [], [], [], []
    for field, value in extraction.items():
        # "NA" is the fixture convention for "field genuinely absent" (see
        # service.py's own _strip_na) — same as None/"", never search for it.
        # Left un-guarded, "NA" is short enough to substring-match almost
        # anywhere in a real document, at EXACT confidence, and every NA
        # field in one document would silently collapse onto that single
        # false hit (verified: PALLADIUM invoice_1 landed all 11 NA fields on
        # one wrong box). Missing is always safe; a wrong box never is.
        if field in SKIP_FIELDS or value in (None, "", "NA"):
            continue

        result = _locate_field(doc, native_words, ocr_pages, page_rects, field, value, restrict_pages)

        if result is None:
            missing.append(field)
            continue

        bbox, source = result
        out[field] = {"bbox": bbox}
        (found_exact if source == "exact" else found_fuzzy if source == "fuzzy-text" else found_ocr).append(field)

    print(
        f"    {pdf_path.name}: {len(found_exact)} exact, {len(found_fuzzy)} fuzzy-text, "
        f"{len(found_ocr)} ocr, {len(missing)} not found -> {missing}"
    )
    doc.close()
    return out


def _partition_fp_pages(pdf_path: Path) -> tuple[set[int], set[int]]:
    """(fp_pages, non_fp_pages) for a PDF that may bundle both faces of the
    same physical document (see _detect_fp_title_pages) — a wholly separate,
    single-purpose PDF (e.g. Palladium's own invoice_N.pdf, which never
    contains a "Faktur Pajak"-titled page) just gets an empty fp_pages and
    every page in non_fp_pages, a no-op restriction."""
    probe = fitz.open(pdf_path)
    try:
        all_pages = set(range(1, probe.page_count + 1))
        fp_pages = _detect_fp_title_pages(probe)
        return fp_pages, all_pages - fp_pages
    finally:
        probe.close()


def process_vendor(vendor_dir: Path) -> None:
    invoice_json = vendor_dir / "invoice_extraction.json"
    invoice_pdf = vendor_dir / "invoice.pdf"
    documents_json = vendor_dir / "documents.json"

    print(f"[{vendor_dir.name}]")

    if invoice_json.exists() and invoice_pdf.exists():
        extraction = json.loads(invoice_json.read_text())
        _, non_fp_pages = _partition_fp_pages(invoice_pdf)
        field_meta = build_field_meta(invoice_pdf, extraction, restrict_pages=non_fp_pages)
        out_path = vendor_dir / "invoice_field_meta.json"
        out_path.write_text(json.dumps(field_meta, indent=2) + "\n")
        print(f"  -> wrote {out_path.relative_to(REPO_ROOT)}")

    # Faktur Pajak — a single-invoice folder's FP is always page 2+ of the
    # SAME invoice.pdf (fixtures.py's DpFixtureBundle has no separate FP PDF
    # field at all; only a multi-invoice folder's own documents.json entries
    # can point at a distinct faktur_pajak_pdf). Same build_field_meta() —
    # it's agnostic to what "extraction" represents, just a flat field dict
    # to locate on a PDF. Restricted to the detected FP page(s) ONLY — the
    # mirror image of the invoice's own restriction above, so the two sides
    # of a shared PDF can never highlight each other's page. If no "Faktur
    # Pajak" title was found at all (unexpected — every current vendor's FP
    # page has one), falls back to unrestricted rather than searching an
    # empty page set and finding nothing for every field.
    fp_json = vendor_dir / "fp_extraction.json"
    if fp_json.exists() and invoice_pdf.exists():
        fp_data = json.loads(fp_json.read_text())
        fp_pages, _ = _partition_fp_pages(invoice_pdf)
        fp_field_meta = build_field_meta(invoice_pdf, fp_data, restrict_pages=fp_pages or None)
        out_path = vendor_dir / "fp_field_meta.json"
        out_path.write_text(json.dumps(fp_field_meta, indent=2) + "\n")
        print(f"  -> wrote {out_path.relative_to(REPO_ROOT)}")

    if documents_json.exists():
        manifest = json.loads(documents_json.read_text())
        for entry in manifest.get("invoices", []):
            extraction_path = vendor_dir / entry["extraction"]
            pdf_path = vendor_dir / entry["pdf"] if entry.get("pdf") else None
            if not extraction_path.exists() or not pdf_path or not pdf_path.exists():
                continue
            extraction = json.loads(extraction_path.read_text())
            fp_pages, non_fp_pages = _partition_fp_pages(pdf_path)
            field_meta = build_field_meta(pdf_path, extraction, restrict_pages=non_fp_pages)
            out_name = f"{entry['key']}_field_meta.json"
            out_path = vendor_dir / out_name
            out_path.write_text(json.dumps(field_meta, indent=2) + "\n")
            print(f"  -> wrote {out_path.relative_to(REPO_ROOT)}")

            fp_path = vendor_dir / entry["faktur_pajak"] if entry.get("faktur_pajak") else None
            fp_pdf_path = vendor_dir / entry["faktur_pajak_pdf"] if entry.get("faktur_pajak_pdf") else None
            fp_field_meta = None
            if fp_path and fp_path.exists():
                fp_data = json.loads(fp_path.read_text())
                if fp_pdf_path and fp_pdf_path.exists():
                    # Dedicated separate FP PDF (documents.json's singular
                    # faktur_pajak_pdf) — most vendors' case.
                    fp_field_meta = build_field_meta(fp_pdf_path, fp_data)
                elif fp_pages:
                    # No dedicated FP PDF, but this entry's own invoice PDF
                    # has page(s) titled "Faktur Pajak" — e.g. KARYA_NASTARI's
                    # invoice_3.pdf, whose pages 2-4 ARE the three real Faktur
                    # Pajak (only additionally split out into their own PDFs
                    # via documents.json's faktur_pajak_pdfs list — see
                    # fixtures.py). Restricted to those page(s) ONLY, mirroring
                    # the single-invoice-folder branch above and this same
                    # entry's own non_fp_pages restriction: the invoice's own
                    # field_meta must never point at an FP page and vice
                    # versa. fp_number/taxable_amount here are a
                    # cross-document rollup (see faktur_pajak_3.json's own
                    # "notes") that plainly isn't printed verbatim anywhere,
                    # so those two are expected to come up missing — safe,
                    # per build_field_meta's own omit-don't-guess rule.
                    fp_field_meta = build_field_meta(pdf_path, fp_data, restrict_pages=fp_pages)
            if fp_field_meta is not None:
                fp_out_name = f"{entry['key']}_fp_field_meta.json"
                fp_out_path = vendor_dir / fp_out_name
                fp_out_path.write_text(json.dumps(fp_field_meta, indent=2) + "\n")
                print(f"  -> wrote {fp_out_path.relative_to(REPO_ROOT)}")

    if not (invoice_json.exists() and invoice_pdf.exists()) and not documents_json.exists():
        print("  (no invoice_extraction.json/documents.json here — skipped)")


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
