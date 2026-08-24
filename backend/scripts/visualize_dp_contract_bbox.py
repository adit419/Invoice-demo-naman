"""
QA tool: renders each DP contract PDF page that has at least one box, with
boxes drawn on top — same convention as visualize_dp_bbox.py (invoices),
rotation-aware. Not part of the app — dev-time only.

Usage:
    cd backend && .venv/bin/python scripts/visualize_dp_contract_bbox.py [VENDOR ...]
Writes one PNG per page-with-boxes to /tmp/dp_contract_qa/<vendor>_p<N>.png
"""
import json
import sys
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"
OUT_DIR = Path("/tmp/dp_contract_qa")
OUT_DIR.mkdir(exist_ok=True)

DPI = 200
COLOR = (1, 0, 0)


def draw(pdf_path: Path, field_meta: dict, out_prefix: str) -> None:
    doc = fitz.open(pdf_path)
    by_page: dict[int, list[tuple[str, dict]]] = {}
    for field, meta in field_meta.items():
        bbox = meta.get("bbox") if isinstance(meta, dict) else None
        if not bbox:
            continue
        by_page.setdefault(bbox["page"], []).append((field, bbox))

    for page_number, entries in by_page.items():
        page = doc[page_number - 1]
        w, h = page.rect.width, page.rect.height
        mat = page.derotation_matrix
        for field, b in entries:
            rect = fitz.Rect(
                b["bbox_left"] * w, b["bbox_top"] * h,
                (b["bbox_left"] + b["bbox_width"]) * w, (b["bbox_top"] + b["bbox_height"]) * h,
            ) * mat
            page.draw_rect(rect, color=COLOR, width=1.2)
            conf = b.get("value_confidence", 0)
            page.insert_text(
                (rect.x0, max(rect.y0 - 3, 8)), f"{field} ({conf:.2f})",
                fontsize=6, color=COLOR, rotate=page.rotation,
            )
        pix = page.get_pixmap(dpi=DPI)
        out_path = OUT_DIR / f"{out_prefix}_p{page_number}.png"
        pix.save(out_path)
        print(f"  -> {out_path} ({len(entries)} boxes)")
    doc.close()


def main() -> None:
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        contract_pdf = vendor_dir / "contract.pdf"
        meta_path = vendor_dir / "contract_field_meta.json"
        if contract_pdf.exists() and meta_path.exists():
            print(f"[{key}]")
            draw(contract_pdf, json.loads(meta_path.read_text()), key)


if __name__ == "__main__":
    main()
