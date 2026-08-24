"""
QA tool: for every *_field_meta.json bbox on a page that HAS a native PDF text
layer, crops that exact rect out of the real PDF and extracts the text under
it, then checks the extraction actually looks like the field's own value —
programmatic ground truth instead of eyeballing a shrunk PNG (which turned out
to be unreliable: several boxes that visually looked wrong/truncated in a
compressed screenshot were confirmed byte-for-byte correct once cropped).

OCR-only pages (no native text layer) are skipped here — there's no
independent text layer to crop-check against; those need a visual pass.

Usage: cd backend && .venv/bin/python scripts/verify_dp_bbox.py [VENDOR ...]
"""
import json
import re
import sys
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"
MIN_PAGE_TEXT_CHARS = 250


_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_CURRENCY_SYMBOLS = {"IDR": ["rp"], "USD": ["$", "us$"]}
_COMPOSITE_SEPARATORS = (" (", " — ", " – ", " - ", ": ")


def _digits(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit())


def _words(s: str) -> set:
    return set(re.findall(r"[a-z0-9]+", s.lower()))


def _date_digit_orderings(value: str) -> list[str]:
    """Every digit-group order a reformatted date could plausibly print in
    (dd+yyyy when the month is spelled out, mm+dd+yyyy, yyyy+mm+dd, ...) —
    the generator's own _date_variants reformats an ISO date before ever
    searching for it, so comparing against the RAW ISO digit order alone
    (yyyymmdd) is a verifier bug, not evidence of a real mismatch."""
    m = _ISO_DATE_RE.match(value.strip())
    if not m:
        return []
    y, mo, d = m.group(1), m.group(2), m.group(3)
    d2 = d.lstrip("0") or "0"
    mo2 = mo.lstrip("0") or "0"
    groups = [y, mo, d, d2, mo2]
    orderings = [(d, mo, y), (d2, mo2, y), (mo, d, y), (mo2, d2, y), (y, mo, d)]
    return [y, "".join((d, mo, y)), "".join((d2, mo2, y))] + ["".join(o) for o in orderings]


def _composite_prefix_ok(value: str, cropped_norm: str) -> bool:
    """True if cropped_norm is exactly the leading segment of value up to one
    of the generator's own composite separators — the intentional "only the
    leading fact matched" fallback (see generate_dp_invoice_bbox.py's
    _composite_leading_segment), not a truncated/wrong box."""
    for sep in _COMPOSITE_SEPARATORS:
        if sep in value and value.split(sep, 1)[0].strip() == cropped_norm:
            return True
    return False


def check_field(field: str, value, cropped: str) -> str | None:
    """None if OK, else a short reason string."""
    cropped_norm = re.sub(r"\s+", " ", cropped).strip()
    if not cropped_norm:
        return "EMPTY crop — box points at blank space"
    if value is None or isinstance(value, bool):
        return None
    if field == "currency":
        return None  # symbol ("Rp") vs ISO code ("IDR") is intentional, see generator's own comments
    if isinstance(value, (int, float)):
        vd, cd = _digits(str(value)) or _digits(f"{value:,.0f}"), _digits(cropped_norm)
        int_digits = _digits(str(int(value))) if float(value).is_integer() else None
        if not (vd and vd in cd) and not (int_digits and int_digits in cd):
            return f"digit-mismatch (value digits {vd!r} not found in crop digits {cd!r})"
        return None
    value = str(value)
    if _composite_prefix_ok(value, cropped_norm):
        return None
    vd = _digits(value)
    cd = _digits(cropped_norm)
    date_orderings = _date_digit_orderings(value)
    if vd and vd not in cd and not any(o in cd for o in date_orderings):
        return f"digit-mismatch (value digits {vd!r} not found in crop digits {cd!r})"
    if not vd:
        # pure-text value: require at least one real word to overlap
        vw, cw = _words(value), _words(cropped_norm)
        if vw and not (vw & cw):
            return "no shared word between value and crop"
    if len(cropped_norm) > max(len(value) * 2.5, len(value) + 25):
        return f"oversized crop ({len(cropped_norm)} chars vs value's {len(value)})"
    return None


def check_doc(pdf_path: Path, field_meta_path: Path, extraction: dict, label: str) -> list[tuple]:
    doc = fitz.open(pdf_path)
    field_meta = json.loads(field_meta_path.read_text())
    issues = []
    for field, entry in field_meta.items():
        bbox = entry.get("bbox") if isinstance(entry, dict) else None
        if not bbox:
            continue
        page = doc[bbox["page"] - 1]
        if len(page.get_text().strip()) < MIN_PAGE_TEXT_CHARS:
            continue  # OCR-only page — needs visual check, not this
        w, h = page.rect.width, page.rect.height
        rect = fitz.Rect(
            bbox["bbox_left"] * w, bbox["bbox_top"] * h,
            (bbox["bbox_left"] + bbox["bbox_width"]) * w,
            (bbox["bbox_top"] + bbox["bbox_height"]) * h,
        )
        cropped = page.get_text("text", clip=rect)
        value = extraction.get(field)
        reason = check_field(field, value, cropped)
        if reason:
            issues.append((label, field, value, cropped.strip(), reason))
    doc.close()
    return issues


def process_vendor(vendor_dir: Path) -> list[tuple]:
    issues = []

    def _run(pdf, meta_path, extraction_path, label):
        if pdf.exists() and meta_path.exists() and extraction_path.exists():
            extraction = json.loads(extraction_path.read_text())
            issues.extend(check_doc(pdf, meta_path, extraction, f"{vendor_dir.name}/{label}"))

    _run(vendor_dir / "invoice.pdf", vendor_dir / "invoice_field_meta.json",
         vendor_dir / "invoice_extraction.json", "invoice")
    _run(vendor_dir / "invoice.pdf", vendor_dir / "fp_field_meta.json",
         vendor_dir / "fp_extraction.json", "fp")

    documents_json = vendor_dir / "documents.json"
    if documents_json.exists():
        manifest = json.loads(documents_json.read_text())
        for entry in manifest.get("invoices", []):
            pdf_path = vendor_dir / entry["pdf"] if entry.get("pdf") else None
            if pdf_path:
                _run(pdf_path, vendor_dir / f"{entry['key']}_field_meta.json",
                     vendor_dir / entry["extraction"], entry["key"])
            fp_pdf = vendor_dir / entry["faktur_pajak_pdf"] if entry.get("faktur_pajak_pdf") else pdf_path
            if entry.get("faktur_pajak") and fp_pdf:
                _run(fp_pdf, vendor_dir / f"{entry['key']}_fp_field_meta.json",
                     vendor_dir / entry["faktur_pajak"], f"{entry['key']}_fp")

    return issues


def main() -> None:
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    all_issues = []
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if vendor_dir.is_dir():
            all_issues.extend(process_vendor(vendor_dir))

    if not all_issues:
        print("No issues found on any native-text-layer page.")
        return
    print(f"{len(all_issues)} issue(s):\n")
    for label, field, value, cropped, reason in all_issues:
        print(f"[{label}] {field}")
        print(f"    value:   {value!r}")
        print(f"    cropped: {cropped!r}")
        print(f"    reason:  {reason}")
        print()


if __name__ == "__main__":
    main()
