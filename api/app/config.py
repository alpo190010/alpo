from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/alpo"
    cors_origins: str = "http://localhost:3000,http://localhost:3005"
    db_ssl: bool = False
    openai_api_key: str = ""
    resend_api_key: str = ""

    # --- Paddle (billing) ---
    paddle_api_key: str = ""
    paddle_webhook_secret: str = ""
    paddle_environment: str = "sandbox"  # "sandbox" | "production"
    paddle_price_starter_monthly: str = ""
    paddle_price_starter_annual: str = ""

    auth_secret: str = ""
    google_pagespeed_api_key: str = ""
    webapp_url: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
