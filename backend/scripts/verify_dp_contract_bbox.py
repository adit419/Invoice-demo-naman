"""
QA tool: crop-checks every contract_field_meta.json bbox against the real
contract.pdf — a contract-aware counterpart to verify_dp_bbox.py (invoices/
FP), written as a separate script rather than an edit to that file: nearly
every contract page has NO native text layer at all (unlike invoices, which
are mostly native text with a few scanned pages), so a useful contract
checker needs an OCR path for the common case, not just the native-text
crop-and-compare that script already does well. Imports check_field (the
value-vs-cropped-text comparison logic) from verify_dp_bbox.py read-only —
same reuse pattern generate_dp_contract_bbox.py uses for
generate_dp_invoice_bbox.py's matching primitives — never edits it.

Native-text pages: crops via page.get_text(clip=rect), exact.
OCR-only pages: renders the bbox region (plus a small margin) at high DPI
and runs Tesseract on just that crop — cheap (one crop per bbox, not a
whole-page tiled pass) and good enough to confirm the box roughly contains
the right characters, even though it isn't the generator's own more
elaborate tiled/multi-PSM OCR.

Usage: cd backend && .venv/bin/python scripts/verify_dp_contract_bbox.py [VENDOR ...]
"""
import io
import json
import sys
from pathlib import Path

import fitz
import pytesseract
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verify_dp_bbox import check_field  # noqa: E402 — read-only reuse

FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"
MIN_PAGE_TEXT_CHARS = 250
CROP_DPI = 400
CROP_MARGIN = 0.01  # fraction of page dimension, added on each side before OCR


def _crop_text(page: "fitz.Page", bbox: dict) -> tuple[str, bool]:
    """Returns (text, is_native). Native pages use the real text layer
    (exact); OCR-only pages render+OCR just the bbox's own region."""
    w, h = page.rect.width, page.rect.height
    rect = fitz.Rect(
        bbox["bbox_left"] * w, bbox["bbox_top"] * h,
        (bbox["bbox_left"] + bbox["bbox_width"]) * w,
        (bbox["bbox_top"] + bbox["bbox_height"]) * h,
    )
    if len(page.get_text().strip()) >= MIN_PAGE_TEXT_CHARS:
        return page.get_text("text", clip=rect), True

    margin_w, margin_h = w * CROP_MARGIN, h * CROP_MARGIN
    clip = fitz.Rect(
        max(0, rect.x0 - margin_w), max(0, rect.y0 - margin_h),
        min(w, rect.x1 + margin_w), min(h, rect.y1 + margin_h),
    )
    pix = page.get_pixmap(dpi=CROP_DPI, clip=clip)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    text = pytesseract.image_to_string(img, config="--psm 7")
    if not text.strip():
        text = pytesseract.image_to_string(img, config="--psm 6")
    return text, False


def check_doc(pdf_path: Path, field_meta_path: Path, extraction: dict, label: str) -> list[tuple]:
    doc = fitz.open(pdf_path)
    field_meta = json.loads(field_meta_path.read_text())
    issues = []
    for field, entry in field_meta.items():
        bbox = entry.get("bbox") if isinstance(entry, dict) else None
        if not bbox:
            continue
        page = doc[bbox["page"] - 1]
        cropped, is_native = _crop_text(page, bbox)
        value = extraction.get(field)
        reason = check_field(field, value, cropped)
        if reason:
            issues.append((label, field, value, cropped.strip(), reason, "native" if is_native else "ocr"))
    doc.close()
    return issues


def process_vendor(vendor_dir: Path) -> list[tuple]:
    contract_pdf = vendor_dir / "contract.pdf"
    meta_path = vendor_dir / "contract_field_meta.json"
    extraction_path = vendor_dir / "contract_extraction.json"
    if not (contract_pdf.exists() and meta_path.exists() and extraction_path.exists()):
        return []
    extraction = json.loads(extraction_path.read_text())
    return check_doc(contract_pdf, meta_path, extraction, vendor_dir.name)


def main() -> None:
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    all_issues = []
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if vendor_dir.is_dir():
            all_issues.extend(process_vendor(vendor_dir))

    if not all_issues:
        print("No issues found.")
        return
    print(f"{len(all_issues)} issue(s):\n")
    for label, field, value, cropped, reason, source in all_issues:
        print(f"[{label}] {field} ({source})")
        print(f"    value:   {value!r}")
        print(f"    cropped: {cropped!r}")
        print(f"    reason:  {reason}")
        print()


if __name__ == "__main__":
    main()
