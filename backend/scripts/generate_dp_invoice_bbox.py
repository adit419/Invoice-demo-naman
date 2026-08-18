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
SKIP_FIELDS = {"line_items", "notes"}

EXACT_CONFIDENCE = 1.0
NORMALIZED_CONFIDENCE = 0.95
FUZZY_MATCH_THRESHOLD = 0.6
# OCR introduces a second layer of uncertainty on top of fuzzy matching (a
# misread digit can coincidentally resemble a formatted number) — held to a
# stricter bar than native-text fuzzy matching so it only fires on a
# genuinely close read, never a "good enough" guess.
OCR_MATCH_THRESHOLD = 0.8
OCR_MAX_CONFIDENCE = 0.9
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


def _id_number_variants(value: float) -> list[str]:
    """Indonesian-locale renderings of a number as it actually appears on
    these documents: '.' thousands, ',' decimals — plus a no-decimals form
    (most totals print as whole rupiah) and a bare-digits fallback."""
    variants = []
    is_int_valued = float(value).is_integer()
    whole = f"{value:,.0f}".replace(",", ".")
    variants.append(whole)
    if not is_int_valued:
        with_decimals = f"{value:,.2f}".replace(",", "\0").replace(".", ",").replace("\0", ".")
        variants.append(with_decimals)
    else:
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
        return out
    if isinstance(value, (int, float)):
        cands = []
        if field.endswith("_rate"):
            cands.extend((v, NORMALIZED_CONFIDENCE) for v in _percent_variants(value))
        cands.extend((v, NORMALIZED_CONFIDENCE) for v in _id_number_variants(value))
        return cands
    return []


def _normalized_bbox(rect: "fitz.Rect", page_size: "fitz.Rect", page_number: int, confidence: float) -> dict:
    w, h = page_size.width, page_size.height
    return {
        "page": page_number,
        "bbox_left": round(rect.x0 / w, 6),
        "bbox_top": round(rect.y0 / h, 6),
        "bbox_width": round((rect.x1 - rect.x0) / w, 6),
        "bbox_height": round((rect.y1 - rect.y0) / h, 6),
        "value_confidence": confidence,
    }


def _text_layer_match(doc: "fitz.Document", field: str, value, allowed_pages: set[int] | None = None) -> dict | None:
    for candidate, confidence in _search_candidates(field, value):
        for page_number, page in enumerate(doc, start=1):
            if allowed_pages is not None and page_number not in allowed_pages:
                continue
            hits = page.search_for(candidate)
            if hits:
                return _normalized_bbox(hits[0], page.rect, page_number, confidence)
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
    docstring)."""
    cache: dict[int, list[tuple]] = {}
    for page_number in page_numbers:
        page = doc[page_number - 1]
        try:
            cache[page_number] = _tiled_ocr_words(page, **ocr_kwargs)
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


def _fuzzy_word_match(
    words_by_page: dict[int, list[tuple]],
    page_rects: dict[int, "fitz.Rect"],
    field: str,
    value,
    threshold: float,
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
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        target_tokens = _norm_tokens(_id_number_variants(float(value))[0])
    else:
        target_tokens = _norm_tokens(str(value))
    if not target_tokens:
        return None
    candidate_text = " ".join(target_tokens)
    n = len(target_tokens)

    best = None  # (ratio, page_number, rect)
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
                ratio = difflib.SequenceMatcher(None, window_text, candidate_text).ratio()
                if best is not None and ratio <= best[0]:
                    continue
                word_idxs = sorted({wi for _, wi in window})
                ws = [words[i] for i in word_idxs]
                if not _is_spatially_coherent(ws):
                    continue
                x0 = min(w[0] for w in ws)
                y0 = min(w[1] for w in ws)
                x1 = max(w[2] for w in ws)
                y1 = max(w[3] for w in ws)
                best = (ratio, page_number, fitz.Rect(x0, y0, x1, y1))

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
        hit = _fuzzy_word_match(op, page_rects, field, value, OCR_MATCH_THRESHOLD)
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
            _, non_fp_pages = _partition_fp_pages(pdf_path)
            field_meta = build_field_meta(pdf_path, extraction, restrict_pages=non_fp_pages)
            out_name = f"{entry['key']}_field_meta.json"
            out_path = vendor_dir / out_name
            out_path.write_text(json.dumps(field_meta, indent=2) + "\n")
            print(f"  -> wrote {out_path.relative_to(REPO_ROOT)}")

            fp_path = vendor_dir / entry["faktur_pajak"] if entry.get("faktur_pajak") else None
            fp_pdf_path = vendor_dir / entry["faktur_pajak_pdf"] if entry.get("faktur_pajak_pdf") else None
            if fp_path and fp_path.exists() and fp_pdf_path and fp_pdf_path.exists():
                fp_data = json.loads(fp_path.read_text())
                fp_field_meta = build_field_meta(fp_pdf_path, fp_data)
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
