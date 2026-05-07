"""Add ``is_shopify`` flag to product_analyses and store_analyses.

Records whether the analyzed URL was identified as a Shopify store.
On non-Shopify sites the orchestrator skips the 5 Shopify-specific
dimensions (checkout, social proof, cross sell, size guide, variant
UX) and rebases the overall score over the remaining 13 dimensions.

The column is nullable so:
* Existing cached rows keep working without a backfill (the orchestrator
  treats ``NULL`` as "Shopify" for backward compatibility).
* Future re-detections can overwrite the value when the cache misses.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "product_analyses",
        sa.Column("is_shopify", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "store_analyses",
        sa.Column("is_shopify", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("store_analyses", "is_shopify")
    op.drop_column("product_analyses", "is_shopify")
