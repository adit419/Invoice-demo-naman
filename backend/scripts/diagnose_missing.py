"""One-off diagnostic: for every field currently missing a bbox, print the
extraction value alongside the full text of every page that lacks a match,
so a human (or the next matching-rule fix) can tell whether it's genuinely
absent from the document or just missed."""
import json
import sys
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"


def show(vendor, doc_label, pdf_path, extraction_path, meta_path):
    extraction = json.loads(extraction_path.read_text())
    meta = json.loads(meta_path.read_text())
    missing = [f for f in extraction if f not in meta and extraction[f] not in (None, "", "NA")
               and f not in {"line_items", "notes", "ai_reasoning"}]
    if not missing:
        return
    print(f"\n{'='*80}\n[{vendor}/{doc_label}] missing: {missing}\n{'='*80}")
    doc = fitz.open(pdf_path)
    for field in missing:
        print(f"\n--- {field} = {extraction[field]!r} ---")
    print("\n--- full page text ---")
    for i, page in enumerate(doc, 1):
        txt = page.get_text().strip()
        tag = "TEXT" if len(txt) >= 250 else "SCANNED/no-text-layer"
        print(f"[page {i} - {tag}]")
        if tag == "TEXT":
            print(txt[:3000])
    doc.close()


def process_vendor(vendor_dir: Path):
    vendor = vendor_dir.name

    def _run(pdf, meta_path, extraction_path, label):
        if pdf.exists() and meta_path.exists() and extraction_path.exists():
            show(vendor, label, pdf, extraction_path, meta_path)

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


def main():
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if vendor_dir.is_dir():
            process_vendor(vendor_dir)


if __name__ == "__main__":
    main()
