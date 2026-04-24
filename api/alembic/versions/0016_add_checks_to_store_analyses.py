"""Add checks column to store_analyses

Surfaces per-dimension pass/fail checks for the "What's working /
What's missing" UI on the dimension detail page. Populated by the
``list_*_checks`` helpers in each rubric; nullable to keep legacy
rows readable before a re-analyze repopulates them.

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "store_analyses",
        sa.Column("checks", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("store_analyses", "checks")
