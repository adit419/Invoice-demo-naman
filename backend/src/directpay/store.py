"""
DirectPay's own Mongo(-compatible) collections — deliberately separate from
`pipeline_runs`/`invoices`/`executed_stages` (P2P's schema, hard-wired to the
P2P stage vocabulary). Same in-memory DB (`get_db()`), new collection names.
"""
from motor.motor_asyncio import AsyncIOMotorDatabase


def dp_contract_runs(db: AsyncIOMotorDatabase):
    return db["dp_contract_runs"]


def dp_invoice_runs(db: AsyncIOMotorDatabase):
    return db["dp_invoice_runs"]


def dp_contract_recommendations(db: AsyncIOMotorDatabase):
    """One doc per invoice run — cached/applied AI contract-match recommendation."""
    return db["dp_contract_recommendations"]


def dp_field_acknowledgement_memory(db: AsyncIOMotorDatabase):
    """Learned (field, contract-value) -> invoice-value ack counts, isolated
    from P2P's `field_acknowledgement_memory` so field-name overlaps between
    the two modules (e.g. "vendor_name") can never cross-contaminate."""
    return db["dp_field_acknowledgement_memory"]


async def ensure_dp_indexes(db: AsyncIOMotorDatabase) -> None:
    from pymongo import ASCENDING, DESCENDING

    await dp_contract_runs(db).create_index([("created_at", DESCENDING)])
    await dp_invoice_runs(db).create_index([("created_at", DESCENDING)])
    await dp_invoice_runs(db).create_index([("contract_id", ASCENDING)])
    # Duplicate detection looks runs up by file name on every upload — by the
    # invoice's own name and by every companion name the run has received.
    await dp_invoice_runs(db).create_index([("file_name", ASCENDING)])
    await dp_contract_runs(db).create_index([("file_name", ASCENDING)])
    await dp_invoice_runs(db).create_index([("uploaded_file_names", ASCENDING)])
    await dp_contract_runs(db).create_index([("uploaded_file_names", ASCENDING)])
    await dp_contract_recommendations(db).create_index([("run_id", ASCENDING)], unique=True)
    await dp_field_acknowledgement_memory(db).create_index(
        [("field_name", ASCENDING), ("source_value", ASCENDING)], unique=True
    )
