"""Rename lemon_* subscription columns to paddle_*

Billing provider switched from LemonSqueezy to Paddle (merchant country
eligibility). No production data exists on any of these columns, so the
rename is lossless.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "lemon_subscription_id", new_column_name="paddle_subscription_id")
    op.alter_column("users", "lemon_customer_id", new_column_name="paddle_customer_id")
    op.alter_column("users", "lemon_customer_portal_url", new_column_name="paddle_customer_portal_url")


def downgrade() -> None:
    op.alter_column("users", "paddle_subscription_id", new_column_name="lemon_subscription_id")
    op.alter_column("users", "paddle_customer_id", new_column_name="lemon_customer_id")
    op.alter_column("users", "paddle_customer_portal_url", new_column_name="lemon_customer_portal_url")
