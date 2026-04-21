"""Backfill any plan_tier='growth' users to 'starter'

The growth tier was removed from PLAN_TIERS. This migration is a safety net
for any existing users who may still be on the deprecated tier; by design
there should be zero rows matched in production.

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET plan_tier = 'starter' WHERE plan_tier = 'growth'")


def downgrade() -> None:
    # Irreversible — 'growth' no longer exists in the application. No-op.
    pass
