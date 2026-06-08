"""
Startup seeder — runs once on first boot.
Seeds tenants, pipeline definition, stage_definitions, and task_definitions.
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase

import bcrypt

from .collections import pipelines, stage_definitions, task_definitions, tenants, users


PIPELINE_SLUG = "invoice_processing"

STAGES = [
    {
        "slug": "ingestion",
        "display_name": "Ingestion",
        "order": 1,
        "is_optional": False,
        "description": "File received and queued for processing.",
    },
    {
        "slug": "extraction",
        "display_name": "Extraction",
        "order": 2,
        "is_optional": False,
        "description": "AI extracts structured data from the invoice PDF.",
    },
    {
        "slug": "vendor_validation",
        "display_name": "Vendor Validation",
        "order": 3,
        "is_optional": False,
        "description": "Vendor details validated against master data.",
    },
    {
        "slug": "metadata_validation",
        "display_name": "Metadata Validation",
        "order": 4,
        "is_optional": False,
        "description": "Invoice-level metadata matched against PO/GRN.",
    },
    {
        "slug": "line_item_matching",
        "display_name": "Line Item Matching",
        "order": 5,
        "is_optional": False,
        "description": "AI performs 3-way match on each line item.",
    },
    {
        "slug": "bill_posting",
        "display_name": "Bill Posting",
        "order": 6,
        "is_optional": False,
        "description": "Reviewed bill posted to ERP (Zoho Books).",
    },
]

TASKS = [
    # Extraction
    {"stage_slug": "extraction", "slug": "ocr",         "display_name": "OCR Processing",      "order": 1},
    {"stage_slug": "extraction", "slug": "field_extract","display_name": "Field Extraction",    "order": 2},
    {"stage_slug": "extraction", "slug": "confidence",  "display_name": "Confidence Scoring",  "order": 3},
    # Vendor validation
    {"stage_slug": "vendor_validation", "slug": "master_lookup",  "display_name": "Master Data Lookup", "order": 1},
    {"stage_slug": "vendor_validation", "slug": "field_compare",  "display_name": "Field Comparison",  "order": 2},
    # Metadata validation
    {"stage_slug": "metadata_validation", "slug": "po_lookup",    "display_name": "PO/GRN Lookup",      "order": 1},
    {"stage_slug": "metadata_validation", "slug": "meta_compare", "display_name": "Metadata Comparison","order": 2},
    # Line item matching
    {"stage_slug": "line_item_matching", "slug": "ai_match",      "display_name": "AI 3-Way Match",     "order": 1},
    {"stage_slug": "line_item_matching", "slug": "match_review",  "display_name": "Match Review",       "order": 2},
    # Bill posting
    {"stage_slug": "bill_posting", "slug": "bill_prepare", "display_name": "Bill Preparation",  "order": 1},
    {"stage_slug": "bill_posting", "slug": "erp_post",     "display_name": "ERP Post (Zoho)",   "order": 2},
    {"stage_slug": "bill_posting", "slug": "notify",       "display_name": "Email Notification","order": 3},
]


SEED_TENANTS = [
    {
        "slug": "neoflo",
        "name": "Neoflo",
        "is_active": True,
    },
    {
        "slug": "acme-corp",
        "name": "ACME Corp",
        "is_active": True,
    },
    {
        "slug": "demo-co",
        "name": "Demo Co",
        "is_active": True,
    },
]

SEED_ADMIN = {
    "email": "admin@neoflo.ai",
    "full_name": "Neoflo Admin",
    "password": "Admin@123",   # plaintext — hashed at seed time
    "role": "tenant_admin",
    "tenant_slug": "neoflo",
}

SEED_ACME_USERS = [
    {"email": "emily.carter@acmecorp.com",      "full_name": "Emily Carter",      "role": "tenant_admin"},
    {"email": "michael.johnson@acmecorp.com",   "full_name": "Michael Johnson",   "role": "tenant_admin"},
    {"email": "jessica.martinez@acmecorp.com",  "full_name": "Jessica Martinez",  "role": "workspace_admin"},
    {"email": "david.thompson@acmecorp.com",    "full_name": "David Thompson",    "role": "member"},
    {"email": "ashley.robinson@acmecorp.com",   "full_name": "Ashley Robinson",   "role": "member"},
    {"email": "christopher.davis@acmecorp.com", "full_name": "Christopher Davis", "role": "tenant_admin"},
    {"email": "olivia.bennett@acmecorp.com",    "full_name": "Olivia Bennett",    "role": "member"},
]

ACME_PASSWORD = "Asdf@1234"

# Extra demo users seeded in the Neoflo tenant so admin@neoflo.ai can test
# role-based access without needing to switch tenants.
SEED_NEOFLO_DEMO_USERS = [
    {"email": "workspace@neoflo.ai", "full_name": "Alex Workspace",  "role": "workspace_admin"},
    {"email": "reviewer@neoflo.ai",  "full_name": "Sam Reviewer",    "role": "reviewer"},
    {"email": "member@neoflo.ai",    "full_name": "Jordan Member",   "role": "member"},
]

NEOFLO_DEMO_PASSWORD = "Admin@123"

SEED_NEOFLO_TEAM_USERS = [
    {"email": "hem@neoflo.ai",       "full_name": "Hem"},
    {"email": "nipun@neoflo.ai",     "full_name": "Nipun"},
    {"email": "naman.s@neoflo.ai",   "full_name": "Naman Sharma"},
    {"email": "prithvi@neoflo.ai",   "full_name": "Prithvi"},
    {"email": "rajesh.ks@neoflo.ai", "full_name": "Rajesh KS"},
    {"email": "kaustav.r@neoflo.ai", "full_name": "Kaustav Ray"},
    {"email": "shubham.s@neoflo.ai", "full_name": "Shubham S"},
    {"email": "sundip@neoflo.ai",    "full_name": "Sundip"},
    {"email": "vibs@neoflo.ai",      "full_name": "Vibs"},
    {"email": "adit.n@neoflo.ai",    "full_name": "Adit"},
]

NEOFLO_TEAM_PASSWORD = "Neoflo@123"


async def seed_tenants(db: AsyncIOMotorDatabase) -> None:
    """Idempotent — inserts tenants that don't exist yet."""
    now = datetime.now(timezone.utc)
    for t in SEED_TENANTS:
        exists = await tenants(db).find_one({"slug": t["slug"]})
        if not exists:
            await tenants(db).insert_one({**t, "created_at": now, "updated_at": now})
    print(f"[seeder] Tenants seeded ({len(SEED_TENANTS)} configured).")


async def seed_admin_user(db: AsyncIOMotorDatabase) -> None:
    """Ensure at least one admin user exists, tied to the Neoflo tenant."""
    existing = await users(db).find_one({"email": SEED_ADMIN["email"]})
    if existing:
        return

    tenant_doc = await tenants(db).find_one({"slug": SEED_ADMIN["tenant_slug"]})
    if not tenant_doc:
        print(f"[seeder] WARNING: tenant '{SEED_ADMIN['tenant_slug']}' not found; skipping admin seed.")
        return

    now = datetime.now(timezone.utc)
    pw_hash = bcrypt.hashpw(SEED_ADMIN["password"].encode(), bcrypt.gensalt()).decode()
    await users(db).insert_one({
        "email": SEED_ADMIN["email"],
        "full_name": SEED_ADMIN["full_name"],
        "password_hash": pw_hash,
        "role": SEED_ADMIN["role"],
        "is_active": True,
        "tenant_id": tenant_doc["_id"],
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    })
    print(f"[seeder] Admin user '{SEED_ADMIN['email']}' created (tenant: {SEED_ADMIN['tenant_slug']}).")


async def seed_acme_users(db: AsyncIOMotorDatabase) -> None:
    """Idempotent — inserts ACME Corp demo users if they don't exist."""
    tenant_doc = await tenants(db).find_one({"slug": "acme-corp"})
    if not tenant_doc:
        print("[seeder] WARNING: acme-corp tenant not found; skipping demo user seed.")
        return

    now = datetime.now(timezone.utc)
    pw_hash = bcrypt.hashpw(ACME_PASSWORD.encode(), bcrypt.gensalt()).decode()
    count = 0
    for u in SEED_ACME_USERS:
        if await users(db).find_one({"email": u["email"]}):
            continue
        await users(db).insert_one({
            "email": u["email"],
            "full_name": u["full_name"],
            "password_hash": pw_hash,
            "role": u["role"],
            "is_active": True,
            "tenant_id": tenant_doc["_id"],
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        })
        count += 1
    if count:
        print(f"[seeder] {count} ACME Corp demo user(s) seeded.")


async def seed_neoflo_demo_users(db: AsyncIOMotorDatabase) -> None:
    """Seed reviewer/member demo accounts in the Neoflo tenant.

    This lets admin@neoflo.ai configure role-permissions and immediately
    verify the effect by logging in as reviewer@neoflo.ai or member@neoflo.ai
    (password: Admin@123) — all within the same tenant.
    """
    tenant_doc = await tenants(db).find_one({"slug": "neoflo"})
    if not tenant_doc:
        return

    now = datetime.now(timezone.utc)
    pw_hash = bcrypt.hashpw(NEOFLO_DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
    count = 0
    for u in SEED_NEOFLO_DEMO_USERS:
        if await users(db).find_one({"email": u["email"]}):
            continue
        await users(db).insert_one({
            "email": u["email"],
            "full_name": u["full_name"],
            "password_hash": pw_hash,
            "role": u["role"],
            "is_active": True,
            "tenant_id": tenant_doc["_id"],
            "page_access": [],   # empty → derived from role_permissions at login
            "ar_sub_access": [],
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        })
        count += 1
    if count:
        print(f"[seeder] {count} Neoflo demo user(s) seeded (reviewer/member/workspace_admin).")


async def seed_neoflo_team_users(db: AsyncIOMotorDatabase) -> None:
    """Seed Neoflo team accounts as workspace_admin in the Neoflo tenant."""
    tenant_doc = await tenants(db).find_one({"slug": "neoflo"})
    if not tenant_doc:
        return

    now = datetime.now(timezone.utc)
    pw_hash = bcrypt.hashpw(NEOFLO_TEAM_PASSWORD.encode(), bcrypt.gensalt()).decode()
    count = 0
    for u in SEED_NEOFLO_TEAM_USERS:
        if await users(db).find_one({"email": u["email"]}):
            continue
        await users(db).insert_one({
            "email": u["email"],
            "full_name": u["full_name"],
            "password_hash": pw_hash,
            "role": "workspace_admin",
            "is_active": True,
            "tenant_id": tenant_doc["_id"],
            "page_access": [],
            "ar_sub_access": [],
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        })
        count += 1
    if count:
        print(f"[seeder] {count} Neoflo team user(s) seeded (workspace_admin, password: Neoflo@123).")


async def seed_pipeline(db: AsyncIOMotorDatabase) -> None:
    """Idempotent — does nothing if pipeline already seeded."""
    await seed_tenants(db)
    await seed_admin_user(db)
    await seed_acme_users(db)
    await seed_neoflo_demo_users(db)
    await seed_neoflo_team_users(db)

    existing = await pipelines(db).find_one({"slug": PIPELINE_SLUG})
    if existing:
        return

    now = datetime.now(timezone.utc)

    # Insert pipeline definition
    pipeline_doc = {
        "slug": PIPELINE_SLUG,
        "display_name": "Invoice Processing Pipeline",
        "stages": [s["slug"] for s in STAGES],
        "created_at": now,
        "updated_at": now,
    }
    result = await pipelines(db).insert_one(pipeline_doc)
    pipeline_id = result.inserted_id

    # Insert stage_definitions
    stage_docs = [
        {
            **s,
            "pipeline_id": pipeline_id,
            "created_at": now,
            "updated_at": now,
        }
        for s in STAGES
    ]
    if stage_docs:
        await stage_definitions(db).insert_many(stage_docs)

    # Insert task_definitions
    task_docs = [
        {
            **t,
            "pipeline_id": pipeline_id,
            "created_at": now,
            "updated_at": now,
        }
        for t in TASKS
    ]
    if task_docs:
        await task_definitions(db).insert_many(task_docs)

    print(
        f"[seeder] Pipeline '{PIPELINE_SLUG}' seeded: "
        f"{len(STAGES)} stages, {len(TASKS)} tasks."
    )
