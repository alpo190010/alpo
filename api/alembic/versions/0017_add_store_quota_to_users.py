"""Add store_quota column to users

Per-user cap on how many distinct stores a user can have scanned.
Defaults to 1 for all users, including existing rows. Admins edit
this via PATCH /admin/users/{id}. Enforced at scan time; re-scans
of an already-tracked store never consume a slot.

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "store_quota",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "store_quota")
