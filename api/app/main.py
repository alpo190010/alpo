import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

logger = logging.getLogger(__name__)
from app.routers.analyze import router as analyze_router
# Competitor analysis disabled — all scoring is now deterministic (no AI calls)
# from app.routers.analyze_competitors import router as analyze_competitors_router
from app.routers.discover_products import router as discover_products_router
from app.routers.health import router as health_router
from app.routers.request_report import router as request_report_router
from app.routers.send_report_now import router as send_report_now_router
from app.routers.store import router as store_router
from app.routers.user_plan import router as user_plan_router
from app.routers.user_scans import router as user_scans_router
from app.routers.auth_routes import router as auth_router
from app.routers.webhook import router as webhook_router
from app.routers.admin_users import router as admin_users_router
from app.routers.admin_analytics import router as admin_analytics_router
from app.routers.admin_impersonate import router as admin_impersonate_router

app = FastAPI(title="Alpo API")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return clean JSON for unhandled exceptions — never leak stack traces."""
    if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
        raise exc
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(analyze_router)
# app.include_router(analyze_competitors_router)
app.include_router(discover_products_router)
app.include_router(store_router)
app.include_router(request_report_router)
app.include_router(send_report_now_router)
app.include_router(user_plan_router)
app.include_router(user_scans_router)
app.include_router(webhook_router)
app.include_router(admin_users_router)
app.include_router(admin_analytics_router)
app.include_router(admin_impersonate_router)
