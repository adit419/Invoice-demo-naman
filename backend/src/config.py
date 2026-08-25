from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Resolve the .env file relative to this file so it works regardless of
# the working directory the server is started from.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

# Explicitly load .env into os.environ first — pydantic-settings v2 reads
# from os.environ reliably even when the class Config env_file parsing fails.
load_dotenv(_ENV_FILE, override=True)


class Settings(BaseSettings):
    secret_key: str = "change_me_in_production"
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_database: str = "invoice_demo"
    demo_mode: bool = True
    demo_mode_show_placeholder_banner: bool = True
    cors_origin: str = "http://localhost:3000"
    fixtures_dir: str = "../../fixtures"
    zoho_client_id: str = ""
    zoho_client_secret: str = ""
    zoho_refresh_token: str = ""
    # Target Zoho Books organisation. Leave blank only for single-org accounts —
    # /organizations is unordered, so an unpinned org can silently change.
    zoho_organization_id: str = ""

    # Anthropic / Claude
    anthropic_api_key: str = ""

    # erp-integration-service — live PO candidate lookup for the AI PO
    # recommendation. When unset, candidates come from fixture PO sidecars
    # (same demo-mode convention as the Zoho bill-posting fallback).
    erp_integration_base_url: str = ""
    erp_integration_secret: str = ""
    erp_integration_tenant_id: str = ""

    # QBWC bridge (QuickBooks Desktop integration)
    qbwc_bridge_url: str = ""
    qbwc_bridge_secret: str = ""
    qbwc_bridge_tenant_id: str = ""

    # Gmail ingestion (svc-tools@neoflo.ai)
    gmail_enabled: bool = False
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    gmail_target_email: str = "svc-tools@neoflo.ai"
    gmail_poll_interval: int = 30  # seconds

    # Dedicated pricing mailbox (finance-pricing@neoflo.ai) — BD emails pricing
    # changes here; the claim engine polls, extracts the change with Claude and
    # drops it into the maker-checker approval queue. Reuses gmail_client_id /
    # gmail_client_secret (same OAuth app); only the refresh token differs.
    pricing_gmail_enabled: bool = False
    pricing_gmail_refresh_token: str = ""
    pricing_gmail_target_email: str = "finance-pricing@neoflo.ai"
    pricing_gmail_poll_interval: int = 60  # seconds

    # FreshDesk — DirectPay replies to the vendor's original ticket instead of
    # sending fresh mail. A vendor emails vendor@neoflo.ai, that lands as a
    # ticket, and VendorQuery polls FreshDesk and kicks off the upload carrying
    # the ticket id in `tag`. Every notification then posts back into that same
    # thread. freshdesk_token is the Basic-auth value ("<api_key>:X" base64'd, or
    # the raw API key — see freshdesk_client).
    freshdesk_enabled: bool = False
    freshdesk_domain: str = "neoflo.freshdesk.com"
    freshdesk_token: str = ""

    # Google Drive upload for DirectPay's standardised documents. Reuses the
    # gmail_client_id / gmail_client_secret / gmail_refresh_token above — one
    # OAuth app, one refresh token, three scopes (gmail.send, gmail.modify,
    # drive). There is no separate Drive credential.
    drive_enabled: bool = False
    # The shared drive / folder documents land in. A shared drive's own ID
    # doubles as its root folder ID, which is why one value serves as both the
    # upload parent and the driveId.
    drive_folder_id: str = ""
    # Test seam: pointed at a local stub so the upload path can be exercised
    # end-to-end without Google. Never set in normal operation.
    drive_api_base: str = "https://www.googleapis.com"

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()
