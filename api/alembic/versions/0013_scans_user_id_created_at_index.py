"""Add composite index on scans(user_id, created_at DESC)

The dashboard query `WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
can use this index for an index-only range scan, avoiding a separate Sort
node. The existing single-column `ix_scans_user_id` is kept for other
queries that filter on user_id alone.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_scans_user_id_created_at",
        "scans",
        ["user_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_scans_user_id_created_at", table_name="scans")
