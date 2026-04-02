"""Add plan tier and credit fields to users

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plan_tier", sa.Text(), server_default="free"))
    op.add_column("users", sa.Column("credits_used", sa.Integer(), server_default="0"))
    op.add_column("users", sa.Column("credits_reset_at", sa.DateTime(), server_default=sa.func.now()))
    op.add_column("users", sa.Column("lemon_subscription_id", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("lemon_customer_id", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("current_period_end", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("lemon_customer_portal_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "lemon_customer_portal_url")
    op.drop_column("users", "current_period_end")
    op.drop_column("users", "lemon_customer_id")
    op.drop_column("users", "lemon_subscription_id")
    op.drop_column("users", "credits_reset_at")
    op.drop_column("users", "credits_used")
    op.drop_column("users", "plan_tier")
