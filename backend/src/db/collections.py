"""
All MongoDB collection accessors and index definitions.
Each function returns a Motor AsyncIOMotorCollection.
Indexes are created at startup via ensure_indexes().
"""
from motor.motor_asyncio import AsyncIOMotorDatabase


# ── Ingestion (mirrors file-ingestion-service) ────────────────────────────────

def jobs(db: AsyncIOMotorDatabase):
    return db["jobs"]

def documents(db: AsyncIOMotorDatabase):
    return db["documents"]

def attachments(db: AsyncIOMotorDatabase):
    return db["attachments"]


# ── Invoice pipeline (mirrors invoice-validator-be) ───────────────────────────

def invoices(db: AsyncIOMotorDatabase):
    return db["invoices"]

def bboxes(db: AsyncIOMotorDatabase):
    return db["bboxes"]

def bills(db: AsyncIOMotorDatabase):
    return db["bills"]

def matching(db: AsyncIOMotorDatabase):
    return db["matching"]

def pipeline_runs(db: AsyncIOMotorDatabase):
    return db["pipeline_runs"]

def executed_stages(db: AsyncIOMotorDatabase):
    return db["executed_stages"]

def executed_tasks(db: AsyncIOMotorDatabase):
    return db["executed_tasks"]

def pipelines(db: AsyncIOMotorDatabase):
    return db["pipelines"]

def stage_definitions(db: AsyncIOMotorDatabase):
    return db["stage_definitions"]

def task_definitions(db: AsyncIOMotorDatabase):
    return db["task_definitions"]

def erp_cache(db: AsyncIOMotorDatabase):
    return db["erp_cache"]

def field_acknowledgement_memory(db: AsyncIOMotorDatabase):
    return db["field_acknowledgement_memory"]

def po_recommendations(db: AsyncIOMotorDatabase):
    return db["po_recommendations"]


# ── Tenants ──────────────────────────────────────────────────────────────────

def tenants(db: AsyncIOMotorDatabase):
    return db["tenants"]


# ── Auth / Demo-specific ──────────────────────────────────────────────────────

def users(db: AsyncIOMotorDatabase):
    return db["users"]

def token_blocklist(db: AsyncIOMotorDatabase):
    return db["token_blocklist"]

def email_log(db: AsyncIOMotorDatabase):
    return db["email_log"]

def app_settings(db: AsyncIOMotorDatabase):
    return db["app_settings"]

def workflow_settings(db: AsyncIOMotorDatabase):
    return db["workflow_settings"]


# ── Index creation ────────────────────────────────────────────────────────────

async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    from pymongo import ASCENDING, DESCENDING

    # jobs
    await jobs(db).create_index([("status", ASCENDING)])
    await jobs(db).create_index([("tenant_id", ASCENDING)])

    # documents
    await documents(db).create_index([("job_id", ASCENDING)])
    await documents(db).create_index([("status", ASCENDING)])

    # attachments
    await attachments(db).create_index([("document_id", ASCENDING)])
    await attachments(db).create_index([("content_hash", ASCENDING)])

    # invoices
    await invoices(db).create_index([("run_id", ASCENDING)], unique=True)

    # bboxes
    await bboxes(db).create_index([("run_id", ASCENDING)], unique=True)

    # bills
    await bills(db).create_index([("run_id", ASCENDING)])

    # matching
    await matching(db).create_index([("run_id", ASCENDING)])

    # pipeline_runs
    await pipeline_runs(db).create_index([("document_id", ASCENDING)])
    await pipeline_runs(db).create_index([("status", ASCENDING)])
    await pipeline_runs(db).create_index([("created_at", DESCENDING)])
    await pipeline_runs(db).create_index([("tenant_id", ASCENDING)])

    # executed_stages
    await executed_stages(db).create_index([("run_id", ASCENDING)])
    await executed_stages(db).create_index([("run_id", ASCENDING), ("stage_slug", ASCENDING)])

    # executed_tasks
    await executed_tasks(db).create_index([("stage_id", ASCENDING)])

    # stage_definitions
    await stage_definitions(db).create_index([("slug", ASCENDING)], unique=True)
    await stage_definitions(db).create_index([("order", ASCENDING)])

    # tenants
    await tenants(db).create_index([("slug", ASCENDING)], unique=True)
    await tenants(db).create_index([("is_active", ASCENDING)])

    # users
    await users(db).create_index([("email", ASCENDING)], unique=True)
    await users(db).create_index([("tenant_id", ASCENDING)])

    # token_blocklist
    await token_blocklist(db).create_index([("token", ASCENDING)], unique=True)
    await token_blocklist(db).create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0
    )

    # email_log
    await email_log(db).create_index([("invoice_id", ASCENDING)])

    # field_acknowledgement_memory — unique per (tenant, field, normalized-PO-value)
    await field_acknowledgement_memory(db).create_index(
        [("tenant_id", ASCENDING), ("field_name", ASCENDING), ("source_value", ASCENDING)],
        unique=True,
    )

    # workflow_settings
    await workflow_settings(db).create_index([("section", ASCENDING)], unique=True)

    # po_recommendations
    await po_recommendations(db).create_index([("run_id", ASCENDING)], unique=True)

    # erp_cache
    await erp_cache(db).create_index([("run_id", ASCENDING)])
