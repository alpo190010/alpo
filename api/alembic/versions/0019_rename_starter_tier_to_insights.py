"""Rename plan_tier 'starter' to 'insights' for 3-tier pricing pivot.

The 2-tier pricing (Free, Membership@$79) is being split into three tiers:
Free / Insights ($79/yr) / Fixes ($149/yr). The legacy ``"starter"`` value
maps to the middle tier (price-strict mapping — they paid $79).

This is a value-only rename: ``users.plan_tier`` is a free-form String
column with no CHECK constraint or enum, so no schema change is needed.

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-04

"""
from typing import Sequence, Union

from alembic import op


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE users SET plan_tier = 'insights' WHERE plan_tier = 'starter'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE users SET plan_tier = 'starter' WHERE plan_tier = 'insights'"
    )
