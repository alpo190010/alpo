from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/alpo"
    cors_origins: str = "http://localhost:3000,http://localhost:3005"
    db_ssl: bool = False
    openai_api_key: str = ""
    resend_api_key: str = ""
    lemonsqueezy_webhook_secret: str = ""
    lemonsqueezy_variant_starter: str = ""
    lemonsqueezy_variant_growth: str = ""
    lemonsqueezy_variant_pro: str = ""
    lemonsqueezy_variant_single_report: str = ""
    auth_secret: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
