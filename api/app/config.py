from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve .env paths relative to this module — independent of the CWD that
# uvicorn / pytest / docker happens to be launched from. Without this, a
# Pydantic env_file like "./.env" would silently miss the file and every
# secret would default to "".
#
# We support two locations and load both when present, with api/.env taking
# precedence over the workspace-root .env. In local dev the workspace-root
# .env is shared between webapp and API, so it's the primary source. In
# Docker the API ships standalone with only api/.env present.
_API_ROOT = Path(__file__).resolve().parents[1]
_WORKSPACE_ROOT = _API_ROOT.parent
_ENV_FILES = tuple(
    str(p) for p in (_WORKSPACE_ROOT / ".env", _API_ROOT / ".env") if p.exists()
)


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
    paddle_price_insights: str = ""  # $79/yr one-time — diagnostic prose unlocked
    paddle_price_fixes: str = ""     # $149/yr one-time — fix steps + code unlocked
    # Delta-priced upgrade SKU. Used when an Insights customer pays only the
    # difference to lift the same store to Fixes. Resolves to "fixes" tier;
    # webhook preserves the existing current_period_end on upgrade.
    paddle_price_fixes_upgrade: str = ""
    paddle_price_starter_monthly: str = ""  # dormant subscription path
    paddle_price_starter_annual: str = ""  # dormant subscription path

    auth_secret: str = ""
    google_pagespeed_api_key: str = ""
    webapp_url: str = "http://localhost:3000"

    model_config = {"env_file": _ENV_FILES, "extra": "ignore"}


settings = Settings()
