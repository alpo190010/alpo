"""Index created_at on users and product_analyses

The admin analytics endpoint filters both tables by
`created_at >= 30_days_ago` and groups by the date cast. Without an index
on `created_at`, Postgres does a sequential scan — on modest tables this
already costs hundreds of milliseconds. A plain b-tree index turns the
filter into a range scan, after which the group-by only processes the
last-30-day slice.

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_users_created_at", "users", ["created_at"])
    op.create_index(
        "ix_product_analyses_created_at", "product_analyses", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_product_analyses_created_at", table_name="product_analyses")
    op.drop_index("ix_users_created_at", table_name="users")
