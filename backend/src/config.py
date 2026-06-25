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

    # Anthropic / Claude
    anthropic_api_key: str = ""

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

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()
