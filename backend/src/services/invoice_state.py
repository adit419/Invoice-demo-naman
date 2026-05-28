"""
Shared helper that returns the *current* extraction state for an invoice.

The state is computed every time as:
    base = fixture extraction.json  (always read fresh from disk)
    state = base + replay(edit_history)

This is event-sourcing: fixtures are the immutable base, and per-invoice
`edit_history` is an append-only log layered on top. The persistent
`invoice_schema` field on the `invoices` document is ignored on read —
only `edit_history` survives across fixture changes.
"""
from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from bson import ObjectId

from ..db.collections import invoices, pipeline_runs
from .fixtures import get_loader


# Line-item fields that should be cast back to float when applying edits.
_NUMERIC_LINE_ITEM_FIELDS = {"quantity", "unit_price", "total_price_before_vat"}


def coerce_line_item_value(field: str, value: Any) -> Any:
    """Cast a stringified edit back to a number for known numeric fields."""
    if field not in _NUMERIC_LINE_ITEM_FIELDS:
        return value
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def _apply_history(invoice_schema: dict, history: list[dict]) -> dict:
    """Mutate-and-return a copy of *invoice_schema* with *history* replayed."""
    metadata_list = list(invoice_schema.get("metadata") or [])
    line_items_list = list(invoice_schema.get("line_items") or [])

    meta_index: dict[str, int] = {
        m.get("field"): i for i, m in enumerate(metadata_list) if m.get("field")
    }
    line_item_index: dict[str, int] = {
        li.get("row_id"): i for i, li in enumerate(line_items_list) if li.get("row_id")
    }

    sorted_history = sorted(
        history, key=lambda h: h.get("timestamp") or datetime.min
    )

    for entry in sorted_history:
        scope = entry.get("scope")
        field = entry.get("field")
        new_value = entry.get("new_value")
        if scope == "metadata":
            idx = meta_index.get(field)
            if idx is None:
                # Orphan edit (fixture removed this field) — skip but keep in history.
                continue
            metadata_list[idx] = {**metadata_list[idx], "value": new_value}
        elif scope == "line_item":
            row_id = entry.get("row_id")
            idx = line_item_index.get(row_id) if row_id else None
            if idx is None:
                continue
            coerced = coerce_line_item_value(field, new_value) if new_value is not None else None
            line_items_list[idx] = {**line_items_list[idx], field: coerced}

    invoice_schema["metadata"] = metadata_list
    invoice_schema["line_items"] = line_items_list
    return invoice_schema


async def _load_fixture_extraction(db, run_id: ObjectId) -> dict:
    run = await pipeline_runs(db).find_one(
        {"_id": run_id}, {"fixture_key": 1}
    )
    fixture_key = (run or {}).get("fixture_key", "")
    loader = get_loader()
    bundle = loader.discover().get(fixture_key)
    if not bundle:
        return {}
    extraction = bundle.extraction or {}
    return extraction


async def get_invoice_state(db, run_id: ObjectId) -> dict:
    """Return the current extraction state for an invoice.

    Returns:
        {
            "invoice_schema": {"metadata": [...], "line_items": [...]},
            "bbox_schema":    {"metadata": [...], "line_items": [...]},
        }

    Both fields come fresh from the fixture every call; user edits stored in
    `invoices.edit_history` are replayed on top of `invoice_schema`.
    """
    extraction = await _load_fixture_extraction(db, run_id)
    invoice_schema = copy.deepcopy(extraction.get("invoice_schema", {}) or {})
    bbox_schema = copy.deepcopy(extraction.get("bbox_schema", {}) or {})

    inv = await invoices(db).find_one(
        {"run_id": run_id}, {"edit_history": 1}
    ) or {}
    history = inv.get("edit_history") or []
    if history:
        invoice_schema = _apply_history(invoice_schema, history)

    return {"invoice_schema": invoice_schema, "bbox_schema": bbox_schema}


async def get_invoice_schema(db, run_id: ObjectId) -> dict:
    """Convenience wrapper: just the `invoice_schema` portion of the state."""
    state = await get_invoice_state(db, run_id)
    return state["invoice_schema"]
