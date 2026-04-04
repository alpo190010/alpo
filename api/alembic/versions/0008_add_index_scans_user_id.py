"""Add index on scans.user_id and product_analyses.user_id

Revision ID: 0008
Revises: a335b2dc6b17
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "a335b2dc6b17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_scans_user_id", "scans", ["user_id"])
    op.create_index("ix_product_analyses_user_id", "product_analyses", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_product_analyses_user_id", table_name="product_analyses")
    op.drop_index("ix_scans_user_id", table_name="scans")
