"""Add ``is_ecommerce`` flag to product_analyses and store_analyses.

Records whether the analyzed URL belongs to a site that sells things.
On non-ecommerce sites (SaaS landing, blog, portfolio, corporate) the
frontend swaps the right-hand "Products" tab to "Pages" so the UI
framing matches what the user is actually analyzing.

Detection lives in ``platform_detector.is_ecommerce`` and combines
JSON-LD Product schema, cart/checkout markup, and the existing
product-page heuristic. False positives are tolerated (we'd just show
"Products" on a non-store) so the bar is permissive.

The column is nullable so:
* Existing cached rows keep working without a backfill (the orchestrator
  treats ``NULL`` as ecommerce for backward compatibility — i.e. legacy
  reports keep their "Products" tab).
* Future re-detections overwrite the value when the cache misses.

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "product_analyses",
        sa.Column("is_ecommerce", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "store_analyses",
        sa.Column("is_ecommerce", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("store_analyses", "is_ecommerce")
    op.drop_column("product_analyses", "is_ecommerce")
