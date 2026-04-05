"""GET /store/{domain} — return store, products, and analyses for a domain."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import get_db
from app.models import ProductAnalysis, Store, StoreAnalysis, StoreProduct, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/store/{domain}")
def get_store(
    domain: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if not domain:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    try:
        store = db.query(Store).filter(Store.domain == domain).first()
        if not store:
            return JSONResponse(
                status_code=404, content={"error": "Store not found"}
            )

        products = (
            db.query(StoreProduct)
            .filter(StoreProduct.store_id == store.id)
            .order_by(asc(StoreProduct.created_at))
            .all()
        )

        if current_user is not None:
            analysis_rows = (
                db.query(ProductAnalysis)
                .filter(ProductAnalysis.store_domain == domain)
                .filter(ProductAnalysis.user_id == current_user.id)
                .all()
            )
            store_analysis_row = (
                db.query(StoreAnalysis)
                .filter(StoreAnalysis.store_domain == domain)
                .filter(StoreAnalysis.user_id == current_user.id)
                .first()
            )
        else:
            analysis_rows = []
            store_analysis_row = None

        # Build analyses dict keyed by productUrl
        analyses: dict = {}
        for row in analysis_rows:
            analyses[row.product_url] = {
                "id": str(row.id),
                "score": row.score,
                "summary": row.summary,
                "tips": row.tips,
                "categories": row.categories,
                "productPrice": (
                    str(row.product_price)
                    if row.product_price is not None
                    else None
                ),
                "productCategory": row.product_category,
                "signals": row.signals,
                "updatedAt": (
                    row.updated_at.isoformat() if row.updated_at else None
                ),
            }

        return {
            "store": {
                "id": str(store.id),
                "domain": store.domain,
                "name": store.name,
                "updatedAt": (
                    store.updated_at.isoformat() if store.updated_at else None
                ),
            },
            "products": [
                {
                    "id": str(p.id),
                    "url": p.url,
                    "slug": p.slug,
                    "image": p.image,
                }
                for p in products
            ],
            "analyses": analyses,
            "storeAnalysis": {
                "score": store_analysis_row.score,
                "categories": store_analysis_row.categories,
                "tips": store_analysis_row.tips,
                "signals": store_analysis_row.signals,
                "analyzedUrl": store_analysis_row.analyzed_url,
                "updatedAt": (
                    store_analysis_row.updated_at.isoformat()
                    if store_analysis_row.updated_at
                    else None
                ),
            }
            if store_analysis_row
            else None,
        }
    except Exception:
        logger.exception("Failed to fetch store data")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch store data"},
        )
