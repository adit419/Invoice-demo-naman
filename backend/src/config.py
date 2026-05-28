from pydantic_settings import BaseSettings


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

    # Gmail ingestion (svc-tools@neoflo.ai)
    gmail_enabled: bool = False
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    gmail_target_email: str = "svc-tools@neoflo.ai"
    gmail_poll_interval: int = 30  # seconds

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
