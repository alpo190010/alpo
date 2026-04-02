from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.analyze import router as analyze_router
from app.routers.analyze_competitors import router as analyze_competitors_router
from app.routers.discover_products import router as discover_products_router
from app.routers.health import router as health_router
from app.routers.request_report import router as request_report_router
from app.routers.send_report_now import router as send_report_now_router
from app.routers.store import router as store_router
from app.routers.user_plan import router as user_plan_router
from app.routers.user_scans import router as user_scans_router
from app.routers.webhook import router as webhook_router

app = FastAPI(title="Alpo API")

origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analyze_router)
app.include_router(analyze_competitors_router)
app.include_router(discover_products_router)
app.include_router(store_router)
app.include_router(request_report_router)
app.include_router(send_report_now_router)
app.include_router(user_plan_router)
app.include_router(user_scans_router)
app.include_router(webhook_router)
