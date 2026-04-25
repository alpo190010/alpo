"""Add product_count column to stores

Total catalog size of the store, populated lazily on /discover-products
via the Shopify sitemap (or /products.json paginated count fallback).
Nullable because non-Shopify stores may not expose this — NULL is the
canonical "unknown total" signal that downstream UI renders as "?".

Existing rows get NULL on upgrade and are repopulated on the next scan
(``_persist_store_and_products`` runs an upsert that includes this
column).

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stores",
        sa.Column("product_count", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stores", "product_count")
