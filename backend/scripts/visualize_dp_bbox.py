"""
QA tool: renders each DP invoice PDF page with its generated *_field_meta.json
boxes drawn on top, so a bbox can be verified by eye instead of trusted
blind. Not part of the app — dev-time only, same as generate_dp_invoice_bbox.py.

Usage:
    cd backend && .venv/bin/python scripts/visualize_dp_bbox.py [VENDOR ...]
Writes one PNG per page-with-boxes to /tmp/dp_bbox_qa/<vendor>_<doc>_p<N>.png
"""
import json
import sys
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"
OUT_DIR = Path("/tmp/dp_bbox_qa")
OUT_DIR.mkdir(exist_ok=True)

DPI = 150
COLOR = (1, 0, 0)  # red boxes, readable against any invoice background


def draw(pdf_path: Path, field_meta: dict, out_prefix: str) -> None:
    doc = fitz.open(pdf_path)
    by_page: dict[int, list[tuple[str, dict]]] = {}
    for field, meta in field_meta.items():
        bbox = meta.get("bbox")
        if not bbox:
            continue
        by_page.setdefault(bbox["page"], []).append((field, bbox))

    for page_number, entries in by_page.items():
        page = doc[page_number - 1]
        w, h = page.rect.width, page.rect.height
        # page.rect (used above, and by every bbox this script reads — they're
        # all fractions of it) reflects the EFFECTIVE, already-rotated page —
        # the same space page.search_for()/get_text() work in. page.draw_rect()
        # itself draws in the page's RAW content-stream space, which for a
        # rotated page (see KARYA_NASTARI's invoice PDFs — rotation=270) is a
        # different box entirely; drawing the rect as-is silently lands
        # somewhere else on the page instead of over the real field. Transform
        # through derotation_matrix first so the drawn box lines up with what
        # get_pixmap() renders (also rotation-aware) — verified empirically
        # against a known top-left-corner marker, since the naming direction
        # you'd guess from the matrix names alone is the wrong way round.
        mat = page.derotation_matrix
        for field, b in entries:
            rect = fitz.Rect(
                b["bbox_left"] * w,
                b["bbox_top"] * h,
                (b["bbox_left"] + b["bbox_width"]) * w,
                (b["bbox_top"] + b["bbox_height"]) * h,
            ) * mat
            page.draw_rect(rect, color=COLOR, width=1.2)
            conf = b.get("value_confidence", 0)
            page.insert_text(
                (rect.x0, max(rect.y0 - 3, 8)),
                f"{field} ({conf:.2f})",
                fontsize=6,
                color=COLOR,
                rotate=page.rotation,
            )
        pix = page.get_pixmap(dpi=DPI)
        out_path = OUT_DIR / f"{out_prefix}_p{page_number}.png"
        pix.save(out_path)
        print(f"  -> {out_path} ({len(entries)} boxes)")
    doc.close()


def process_vendor(vendor_dir: Path) -> None:
    print(f"[{vendor_dir.name}]")
    invoice_pdf = vendor_dir / "invoice.pdf"
    field_meta_path = vendor_dir / "invoice_field_meta.json"
    if invoice_pdf.exists() and field_meta_path.exists():
        draw(invoice_pdf, json.loads(field_meta_path.read_text()), f"{vendor_dir.name}_invoice")

    fp_field_meta_path = vendor_dir / "fp_field_meta.json"
    if invoice_pdf.exists() and fp_field_meta_path.exists():
        draw(invoice_pdf, json.loads(fp_field_meta_path.read_text()), f"{vendor_dir.name}_fp")

    documents_json = vendor_dir / "documents.json"
    if documents_json.exists():
        manifest = json.loads(documents_json.read_text())
        for entry in manifest.get("invoices", []):
            pdf_path = vendor_dir / entry["pdf"] if entry.get("pdf") else None
            fm_path = vendor_dir / f"{entry['key']}_field_meta.json"
            if pdf_path and pdf_path.exists() and fm_path.exists():
                draw(pdf_path, json.loads(fm_path.read_text()), f"{vendor_dir.name}_{entry['key']}")

            fp_pdf_path = vendor_dir / entry["faktur_pajak_pdf"] if entry.get("faktur_pajak_pdf") else None
            fp_fm_path = vendor_dir / f"{entry['key']}_fp_field_meta.json"
            if fp_pdf_path and fp_pdf_path.exists() and fp_fm_path.exists():
                draw(fp_pdf_path, json.loads(fp_fm_path.read_text()), f"{vendor_dir.name}_{entry['key']}_fp")


def main() -> None:
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if vendor_dir.is_dir():
            process_vendor(vendor_dir)


if __name__ == "__main__":
    main()
