import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Surface app-level logs (gmail poller, ingestion, etc.) alongside uvicorn's
# request lines. Without this, getLogger(__name__).info() goes nowhere because
# root has no handlers under uvicorn.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

from .config import settings
from .database import connect_db, close_db, get_db
from .db.collections import ensure_indexes
from .db.seeder import seed_pipeline
from .api.v1 import auth as auth_router
from .api.v1 import ingestion as ingestion_router
from .api.v1 import extraction as extraction_router
from .api.v1 import vendor_validation as vendor_validation_router
from .api.v1 import metadata_validation as metadata_validation_router
from .api.v1 import line_item_matching as line_item_matching_router
from .api.v1 import bill_posting as bill_posting_router
from .api.v1 import erp as erp_router
from .api.v1 import rejected as rejected_router
from .api.v1 import admin as admin_router
from .api.v1 import demo as demo_router
from .api.v1 import tenants as tenants_router
from .api.v1 import zoho as zoho_router
from .api.v1 import stp as stp_router
from .api.v1 import workflow_settings as workflow_settings_router
from .api.v1 import pipeline_nav as pipeline_nav_router
from .cash.router import router as cash_router, startup as cash_startup


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    await connect_db()
    db = get_db()
    await ensure_indexes(db)
    await seed_pipeline(db)

    # Start Gmail poller if configured
    from .config import settings as _cfg
    log = logging.getLogger("startup")
    log.info(
        "Gmail config: enabled=%s client_id=%s refresh_token=%s target=%s",
        _cfg.gmail_enabled,
        "<set>" if _cfg.gmail_client_id else "<empty>",
        "<set>" if _cfg.gmail_refresh_token else "<empty>",
        _cfg.gmail_target_email,
    )
    if _cfg.gmail_enabled and _cfg.gmail_client_id and _cfg.gmail_refresh_token:
        from .workers.gmail_poller import gmail_poll_loop
        asyncio.create_task(gmail_poll_loop())
        log.info("Gmail poller task scheduled")
    else:
        log.warning("Gmail poller NOT started — missing one of: gmail_enabled / client_id / refresh_token")

    # Initialize Cash Application module
    import asyncio as _asyncio
    await _asyncio.get_event_loop().run_in_executor(None, cash_startup)

    yield
    await close_db()


app = FastAPI(
    title="Invoice Demo API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(ingestion_router.router, prefix="/api/v1")
app.include_router(extraction_router.router, prefix="/api/v1")
app.include_router(vendor_validation_router.router, prefix="/api/v1")
app.include_router(metadata_validation_router.router, prefix="/api/v1")
app.include_router(line_item_matching_router.router, prefix="/api/v1")
app.include_router(bill_posting_router.router, prefix="/api/v1")
app.include_router(erp_router.router, prefix="/api/v1")
app.include_router(rejected_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(demo_router.router, prefix="/api/v1")
app.include_router(tenants_router.router, prefix="/api/v1")
app.include_router(zoho_router.router, prefix="/api/v1")
app.include_router(stp_router.router, prefix="/api/v1")
app.include_router(workflow_settings_router.router, prefix="/api/v1")
app.include_router(pipeline_nav_router.router, prefix="/api/v1")
app.include_router(cash_router, prefix="/cash-api")


@app.get("/health")
async def health():
    return {"status": "ok"}
