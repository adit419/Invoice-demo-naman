"""
Pipeline state machine — mirrors OrchestratorService logic from invoice-validator-be.

Stage statuses:  start → in_progress → in_review → approved → completed | rejected
Pipeline statuses: pending → in_progress → completed | failed
Task statuses:   pending → in_progress → done | error

Auto-approve rule (last stage):
  bill_posting is system-validated — when ERP post succeeds the stage auto-transitions
  in_review → approved → completed with no second human click.

Cascade-complete rule:
  When a stage reaches completed or rejected, ALL upstream stages in 'approved'
  state transition to 'completed' (locked, preventing rework).
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException

from ...db.collections import executed_stages, executed_tasks, invoices, pipeline_runs
from ...models.user import UserOut

_MANDATORY_CHECK_STAGES = {"extraction", "vendor_validation", "metadata_validation", "line_item_matching"}

# ── Sequence and metadata ─────────────────────────────────────────────────────

STAGE_SEQUENCE = [
    "ingestion",
    "extraction",
    # vendor_validation is intentionally skipped — after extraction the pipeline
    # transitions directly into metadata_validation. The vendor_validation
    # stage definition (display name, tasks, percent, fixture) is preserved
    # below so any pre-existing pipeline runs that still reference the slug
    # keep working, but it is no longer part of the forward flow.
    "metadata_validation",
    "line_item_matching",
    "bill_posting",
]

STAGE_DISPLAY = {
    "ingestion": "Ingestion",
    "extraction": "Extraction",
    "vendor_validation": "Vendor Validation",
    "metadata_validation": "Metadata Validation",
    "line_item_matching": "Line Item Matching",
    "bill_posting": "Bill Posting",
}

# Tasks that each stage owns (simulated — all complete immediately on trigger)
STAGE_TASKS = {
    "ingestion":            ["receive", "checksum", "store"],
    "extraction":           ["ocr", "field_extract", "confidence"],
    "vendor_validation":    ["master_lookup", "field_compare"],
    "metadata_validation":  ["po_lookup", "meta_compare"],
    "line_item_matching":   ["ai_match", "match_review"],
    "bill_posting":         ["bill_prepare", "erp_post", "notify"],
}

STAGE_PERCENT = {
    "ingestion":            5,
    "extraction":           20,
    "vendor_validation":    37,
    "metadata_validation":  54,
    "line_item_matching":   70,
    "bill_posting":         87,
}


def get_next_stage(slug: str) -> str | None:
    """Return the slug that follows *slug* in the pipeline, or None if last."""
    try:
        idx = STAGE_SEQUENCE.index(slug)
        return STAGE_SEQUENCE[idx + 1] if idx + 1 < len(STAGE_SEQUENCE) else None
    except ValueError:
        return None


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _write_stage_tasks(db, run_id: ObjectId, slug: str, now: datetime) -> None:
    """Simulate task execution: upsert all tasks for *slug* as done."""
    for task_slug in STAGE_TASKS.get(slug, []):
        await executed_tasks(db).update_one(
            {"run_id": run_id, "stage_slug": slug, "task_slug": task_slug},
            {"$set": {
                "status": "done",
                "started_at": now,
                "completed_at": now,
                "updated_at": now,
            }},
            upsert=True,
        )


async def _trigger_stage(db, run_id: ObjectId, slug: str, now: datetime) -> None:
    """
    Bring *slug* from start → in_progress → in_review (tasks complete instantly).
    Upserts so it's safe to call even if the stage doc already exists.
    """
    # in_progress phase (tasks running)
    await executed_stages(db).update_one(
        {"run_id": run_id, "stage_slug": slug},
        {"$set": {
            "status": "in_progress",
            "started_at": now,
            "completed_at": None,
            "approved_by": None,
            "approved_at": None,
            "updated_at": now,
        }},
        upsert=True,
    )
    # Simulate tasks completing immediately
    await _write_stage_tasks(db, run_id, slug, now)
    # Advance to in_review (all tasks done)
    await executed_stages(db).update_one(
        {"run_id": run_id, "stage_slug": slug},
        {"$set": {"status": "in_review", "updated_at": now}},
    )


async def _cascade_complete_upstream(db, run_id: ObjectId, now: datetime) -> None:
    """Lock all upstream approved stages to completed."""
    await executed_stages(db).update_many(
        {"run_id": run_id, "status": "approved"},
        {"$set": {"status": "completed", "completed_at": now, "updated_at": now}},
    )


async def _complete_pipeline(
    db,
    run_id: ObjectId,
    last_slug: str,
    actor_id: ObjectId,
    now: datetime,
) -> None:
    """
    Terminal success path for the last stage (bill_posting auto-approve).
    Transitions: bill_posting approved → completed, pipeline → completed,
    cascade-completes all upstream approved stages.
    """
    # Mark last stage completed
    await executed_stages(db).update_one(
        {"run_id": run_id, "stage_slug": last_slug},
        {"$set": {
            "status": "completed",
            "completed_at": now,
            "approved_by": actor_id,
            "approved_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
    # Lock all other approved stages
    await _cascade_complete_upstream(db, run_id, now)
    # Mark pipeline completed
    await pipeline_runs(db).update_one(
        {"_id": run_id},
        {"$set": {
            "status": "completed",
            "current_stage": {
                "slug": last_slug,
                "display_name": STAGE_DISPLAY.get(last_slug, last_slug),
                "status": "completed",
            },
            "updated_at": now,
        }},
    )
    await invoices(db).update_one(
        {"run_id": run_id},
        {"$set": {"status": "completed", "updated_at": now}},
    )


# ── Public helpers called by stage routers ────────────────────────────────────

async def approve_stage(
    db,
    run_id: ObjectId,
    slug: str,
    current_user: UserOut,
    action: str,
    payload: dict | None = None,
) -> dict:
    """
    Approve *slug* (in_review → approved).

    If *slug* is the last stage: auto-complete the pipeline.
    Otherwise: trigger the next stage to in_review, update current_stage.

    Returns { next_stage: str|None, status: str }
    """
    # Enforce mandatory field rules for validation stages
    if slug in _MANDATORY_CHECK_STAGES:
        passed, missing = await check_stp_mandatory(db, run_id, slug)
        if not passed:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "mandatory_fields_missing",
                    "message": f"Cannot approve: mandatory field(s) missing — {', '.join(missing)}",
                    "missing": missing,
                },
            )

    now = datetime.now(timezone.utc)
    actor_oid = ObjectId(current_user.id)

    # Approve this stage
    await executed_stages(db).update_one(
        {"run_id": run_id, "stage_slug": slug},
        {"$set": {
            "status": "approved",
            "approved_by": actor_oid,
            "approved_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )

    next_slug = get_next_stage(slug)

    if next_slug is None:
        # Last stage — auto-complete (system-validated, no second human click)
        await _complete_pipeline(db, run_id, slug, actor_oid, now)
        return {"next_stage": None, "status": "completed"}

    # Trigger next stage (start → in_progress → in_review)
    await _trigger_stage(db, run_id, next_slug, now)

    # If STP is enabled and the next stage is bill_posting, auto-post to ERP.
    # Lazy import avoids circular dependency (stp.py imports from stages.py).
    if next_slug == "bill_posting":
        import asyncio as _asyncio
        import logging as _logging

        async def _stp_auto_post(db_inner, run_id_inner):
            _log = _logging.getLogger(__name__)
            try:
                from .stp import get_global_stp, _auto_post_bill  # noqa: PLC0415
                if not await get_global_stp(db_inner):
                    return
                # Brief pause to ensure bill_posting is fully settled in in_review
                await _asyncio.sleep(1)
                await _auto_post_bill(db_inner, run_id_inner)
                _log.info("STP auto-post triggered (manual approval flow) for run %s", run_id_inner)
            except Exception:
                _log.exception("STP auto-post (manual flow) failed for run %s", run_id_inner)

        _asyncio.create_task(_stp_auto_post(db, run_id))

    # Update pipeline_run.current_stage
    await pipeline_runs(db).update_one(
        {"_id": run_id},
        {"$set": {
            "status": "in_progress",
            "current_stage": {
                "slug": next_slug,
                "display_name": STAGE_DISPLAY.get(next_slug, next_slug),
                "status": "in_review",
            },
            "updated_at": now,
        }},
    )
    await invoices(db).update_one(
        {"run_id": run_id},
        {"$set": {"status": "in_progress", "updated_at": now}},
    )

    return {"next_stage": next_slug, "status": "in_review"}


def _unwrap_list(data) -> dict:
    if isinstance(data, list) and data:
        return data[0]
    return data if isinstance(data, dict) else {}


async def check_stp_mandatory(db, run_id: ObjectId, slug: str) -> tuple[bool, list[str]]:
    """
    Verify all mandatory fields for *slug* are satisfied using dynamic
    workflow settings (falls back to DEFAULT_WORKFLOW_SETTINGS if not set).
    Returns (passed, list_of_human_readable_missing_field_names).
    Only covers stages extraction → line_item_matching.
    """
    from ...services.fixtures import get_loader
    from .workflow_settings import get_workflow_settings

    run = await pipeline_runs(db).find_one({"_id": run_id}) or {}
    loader = get_loader()
    bundle = loader.discover().get(run.get("fixture_key", ""))
    settings = await get_workflow_settings(db)
    missing: list[str] = []

    def _mandatory_keys(section: str) -> set[str]:
        # A field only counts as mandatory when it is also shown (mask ON).
        # get_workflow_settings already enforces mandatory⇒mask, but stay
        # explicit so STP can never block on a hidden field.
        return {
            f["key"]
            for f in settings.get(section, {}).get("fields", [])
            if f.get("mandatory") and f.get("mask", True)
        }

    if slug == "extraction":
        mandatory = _mandatory_keys("extraction_metadata")
        # Live extraction state: fixture extraction.json + replayed edit_history.
        # Local import to avoid an import cycle (invoice_state → fixtures → …).
        from ...services.invoice_state import get_invoice_schema
        invoice_schema = await get_invoice_schema(db, run_id)
        for m in invoice_schema.get("metadata", []):
            if m.get("field") in mandatory and not m.get("value"):
                label = m.get("field", "unknown_field").replace("_", " ").title()
                missing.append(label)

    elif slug == "vendor_validation":
        mandatory = _mandatory_keys("vendor_validation")
        fixture = _unwrap_list(bundle.vendor_validation if bundle else {})
        for f in fixture.get("fields", []):
            field_key = f.get("field_name", "")
            if field_key in mandatory and f.get("match_status") != "match":
                missing.append(f.get("display_name") or field_key)

    elif slug == "metadata_validation":
        mandatory = _mandatory_keys("metadata_validation")
        fixture = _unwrap_list(bundle.metadata_validation if bundle else {})
        for f in fixture.get("fields", []):
            field_key = f.get("field_name", "")
            if field_key in mandatory and f.get("match_status") != "match":
                missing.append(f.get("display_name") or field_key)

    elif slug == "line_item_matching":
        mandatory_li = _mandatory_keys("line_item_validation")
        li_fixture = bundle.line_item if bundle else {}
        if isinstance(li_fixture, list):
            li_fixture = li_fixture[0] if li_fixture else {}
        # If any mandatory line-item fields → require all rows to match
        if mandatory_li:
            for r in li_fixture.get("results", []):
                if r.get("match_status") == "no_match":
                    missing.append(f"Line item #{r.get('id', '?')} — no match found")

    return len(missing) == 0, missing


async def reject_stage(
    db,
    run_id: ObjectId,
    slug: str,
    current_user: UserOut,
    reason: str,
) -> None:
    """
    Reject *slug* (in_review → rejected).
    Marks pipeline failed, cascade-completes upstream approved stages.
    """
    now = datetime.now(timezone.utc)
    actor_oid = ObjectId(current_user.id)

    await executed_stages(db).update_one(
        {"run_id": run_id, "stage_slug": slug},
        {"$set": {
            "status": "rejected",
            "completed_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )

    # Lock upstream
    await _cascade_complete_upstream(db, run_id, now)

    await pipeline_runs(db).update_one(
        {"_id": run_id},
        {"$set": {
            "status": "failed",
            "current_stage": {
                "slug": slug,
                "display_name": STAGE_DISPLAY.get(slug, slug),
                "status": "rejected",
            },
            "rejection": {
                "stage": slug,
                "reason": reason,
                "actor_name": current_user.full_name,
                "actor_role": current_user.role,
                "rejected_at": now,
            },
            "updated_at": now,
        }},
    )
    await invoices(db).update_one(
        {"run_id": run_id},
        {"$set": {"status": "failed", "updated_at": now}},
    )
