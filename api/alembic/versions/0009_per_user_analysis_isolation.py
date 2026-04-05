"""Per-user analysis isolation

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Delete orphaned rows that have no owning user — these cannot satisfy
    #    the upcoming NOT NULL constraint and represent anonymous/legacy data.
    op.execute("DELETE FROM product_analyses WHERE user_id IS NULL")

    # 2. Drop the old single-column unique on product_url (auto-named by PG
    #    from the unique=True in migration 0001).
    op.drop_constraint(
        "product_analyses_product_url_unique", "product_analyses", type_="unique"
    )

    # 3. Make user_id NOT NULL now that orphaned rows are gone.
    op.alter_column(
        "product_analyses",
        "user_id",
        existing_type=sa.UUID(),
        nullable=False,
    )

    # 4. Add composite unique so each user can have one analysis per product URL.
    op.create_unique_constraint(
        "uq_product_analyses_product_url_user_id",
        "product_analyses",
        ["product_url", "user_id"],
    )


def downgrade() -> None:
    # Reverse in opposite order. Note: deleted rows cannot be restored.

    # 4 → drop composite unique
    op.drop_constraint(
        "uq_product_analyses_product_url_user_id", "product_analyses", type_="unique"
    )

    # 3 → make user_id nullable again
    op.alter_column(
        "product_analyses",
        "user_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # 2 → restore single-column unique on product_url
    op.create_unique_constraint(
        "product_analyses_product_url_unique", "product_analyses", ["product_url"]
    )
