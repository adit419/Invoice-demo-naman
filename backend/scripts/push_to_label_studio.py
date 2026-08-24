"""
Pushes every DP invoice/FP page (rendered to PNG) plus its current
*_field_meta.json boxes into a running local Label Studio project as
pre-annotated tasks (Label Studio "predictions"), so a human reviewer can
visually confirm/nudge/delete boxes instead of drawing from scratch, and add
boxes for fields the generator missed but that ARE genuinely printed on the
page.

Each task also carries a "missing_fields" text block (fields present in the
extraction JSON but with no bbox yet) so the reviewer knows what to look for
in addition to what's already boxed.

One-shot, dev-time only. Not part of the running app.

Usage:
    cd backend && .venv/bin/python scripts/push_to_label_studio.py [VENDOR ...]
"""
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DP = REPO_ROOT / "fixtures" / "dp"
LS_URL = "http://localhost:8080"
PROJECT_ID = 10
REFRESH_TOKEN_PATH = Path("/tmp/ls_setup/refresh.token")
DPI = 150
SKIP_FIELDS = {"line_items", "notes", "ai_reasoning"}
BATCH_SIZE = 4  # tasks per import call — keeps base64 payload well under Django's upload-size default

_token_cache = {"access": None, "ts": 0}


def _post_json(url: str, payload, headers: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"POST {url} -> {e.code}: {e.read().decode('utf-8')[:500]}") from e


def get_access_token() -> str:
    if _token_cache["access"] and time.time() - _token_cache["ts"] < 200:
        return _token_cache["access"]
    refresh = REFRESH_TOKEN_PATH.read_text().strip()
    data = _post_json(f"{LS_URL}/api/token/refresh", {"refresh": refresh},
                       {"Content-Type": "application/json"})
    _token_cache["access"] = data["access"]
    _token_cache["ts"] = time.time()
    return _token_cache["access"]


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {get_access_token()}", "Content-Type": "application/json"}


def page_to_data_uri(page: "fitz.Page") -> tuple[str, int, int]:
    pix = page.get_pixmap(dpi=DPI)
    b64 = base64.b64encode(pix.tobytes("png")).decode("ascii")
    return f"data:image/png;base64,{b64}", pix.width, pix.height


def field_meta_to_predictions(field_meta: dict, page_number: int, img_w: int, img_h: int) -> list:
    results = []
    for field, entry in field_meta.items():
        bbox = entry.get("bbox") if isinstance(entry, dict) else None
        if not bbox or bbox["page"] != page_number:
            continue
        results.append({
            "original_width": img_w, "original_height": img_h, "image_rotation": 0,
            "value": {
                "x": bbox["bbox_left"] * 100, "y": bbox["bbox_top"] * 100,
                "width": bbox["bbox_width"] * 100, "height": bbox["bbox_height"] * 100,
                "rotation": 0, "rectanglelabels": [field],
            },
            "from_name": "label", "to_name": "image", "type": "rectanglelabels",
        })
    if not results:
        return []
    return [{"result": results, "model_version": "generator_v2"}]


def missing_fields_text(extraction: dict, field_meta: dict) -> str:
    lines = []
    for field, value in extraction.items():
        if field in SKIP_FIELDS or value in (None, "", "NA"):
            continue
        if field not in field_meta or not field_meta[field].get("bbox"):
            lines.append(f"{field}: {value!r}")
    if not lines:
        return "(nothing missing — every non-empty field has a box)"
    return "NO BOX YET for (check if genuinely printed on this page):\n" + "\n".join(lines)


def build_tasks_for_doc(vendor: str, label: str, pdf_path: Path, field_meta_path: Path,
                         extraction_path: Path) -> list:
    if not (pdf_path.exists() and field_meta_path.exists() and extraction_path.exists()):
        return []
    field_meta = json.loads(field_meta_path.read_text())
    extraction = json.loads(extraction_path.read_text())
    doc = fitz.open(pdf_path)
    tasks = []
    for i, page in enumerate(doc, start=1):
        data_uri, w, h = page_to_data_uri(page)
        predictions = field_meta_to_predictions(field_meta, i, w, h)
        task = {
            "data": {
                "image": data_uri,
                "doc_title": f"{vendor} / {label} / page {i} of {doc.page_count} — {pdf_path.name}",
                "missing_fields": missing_fields_text(extraction, field_meta) if i == 1 else
                                   "(missing-field list shown on page 1 of this document)",
            },
        }
        if predictions:
            task["predictions"] = predictions
        tasks.append(task)
    doc.close()
    return tasks


def collect_vendor_tasks(vendor_dir: Path) -> list:
    vendor = vendor_dir.name
    tasks = []

    if (vendor_dir / "invoice.pdf").exists() and (vendor_dir / "invoice_field_meta.json").exists():
        tasks += build_tasks_for_doc(vendor, "invoice", vendor_dir / "invoice.pdf",
                                      vendor_dir / "invoice_field_meta.json",
                                      vendor_dir / "invoice_extraction.json")
    if (vendor_dir / "invoice.pdf").exists() and (vendor_dir / "fp_field_meta.json").exists():
        tasks += build_tasks_for_doc(vendor, "fp", vendor_dir / "invoice.pdf",
                                      vendor_dir / "fp_field_meta.json",
                                      vendor_dir / "fp_extraction.json")

    documents_json = vendor_dir / "documents.json"
    if documents_json.exists():
        manifest = json.loads(documents_json.read_text())
        for entry in manifest.get("invoices", []):
            pdf_path = vendor_dir / entry["pdf"] if entry.get("pdf") else None
            if pdf_path:
                tasks += build_tasks_for_doc(vendor, entry["key"], pdf_path,
                                              vendor_dir / f"{entry['key']}_field_meta.json",
                                              vendor_dir / entry["extraction"])
            fp_pdf = vendor_dir / entry["faktur_pajak_pdf"] if entry.get("faktur_pajak_pdf") else pdf_path
            if entry.get("faktur_pajak") and fp_pdf:
                tasks += build_tasks_for_doc(vendor, f"{entry['key']}_fp", fp_pdf,
                                              vendor_dir / f"{entry['key']}_fp_field_meta.json",
                                              vendor_dir / entry["faktur_pajak"])
    return tasks


def push_batch(tasks: list) -> None:
    for i in range(0, len(tasks), BATCH_SIZE):
        batch = tasks[i:i + BATCH_SIZE]
        result = _post_json(f"{LS_URL}/api/projects/{PROJECT_ID}/import", batch, auth_headers())
        print(f"    imported {result.get('task_count')} tasks, "
              f"{result.get('prediction_count')} predictions")


def main() -> None:
    requested = set(sys.argv[1:])
    keys = requested if requested else {p.name for p in FIXTURES_DP.iterdir() if p.is_dir()}
    for key in sorted(keys):
        vendor_dir = FIXTURES_DP / key
        if not vendor_dir.is_dir():
            continue
        print(f"[{key}]")
        tasks = collect_vendor_tasks(vendor_dir)
        if not tasks:
            print("  (nothing to push)")
            continue
        push_batch(tasks)


if __name__ == "__main__":
    main()
