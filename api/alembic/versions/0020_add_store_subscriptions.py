"""Add store_subscriptions table for per-store paid plans.

Replaces the user-level plan model. Each row represents one paid plan
(``insights`` or ``fixes``) attached to one store for one user. A user
may own multiple rows across different stores; tier is resolved as
"free" when no active row exists.

Backfill: every user currently on a paid tier gets one row per
distinct domain they have already scanned (StoreAnalysis ∪ ProductAnalysis),
honoring the existing ``current_period_end`` window.

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "store_subscriptions",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("store_domain", sa.Text(), nullable=False),
        sa.Column("plan_tier", sa.Text(), nullable=False),
        sa.Column("paddle_transaction_id", sa.Text(), nullable=True),
        sa.Column("paddle_subscription_id", sa.Text(), nullable=True),
        sa.Column("paddle_customer_id", sa.Text(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id", "store_domain", name="uq_store_subscriptions_user_domain"
        ),
    )
    op.create_index(
        "ix_store_subscriptions_user",
        "store_subscriptions",
        ["user_id"],
    )
    op.create_index(
        "ix_store_subscriptions_paddle_sub",
        "store_subscriptions",
        ["paddle_subscription_id"],
        postgresql_where=sa.text("paddle_subscription_id IS NOT NULL"),
    )

    # Backfill: grandfather each currently-paid user into rows for every
    # distinct domain they have already scanned. Existing pricing copy
    # promised "one store" but never enforced it; this gives existing
    # paying users coverage on every store they touched.
    op.execute(
        """
        INSERT INTO store_subscriptions (
            user_id, store_domain, plan_tier, current_period_end,
            paddle_subscription_id, paddle_customer_id
        )
        SELECT u.id, d.domain, u.plan_tier, u.current_period_end,
               u.paddle_subscription_id, u.paddle_customer_id
        FROM users u
        CROSS JOIN LATERAL (
            SELECT DISTINCT store_domain AS domain
              FROM store_analyses WHERE user_id = u.id
            UNION
            SELECT DISTINCT store_domain AS domain
              FROM product_analyses WHERE user_id = u.id
        ) d
        WHERE u.plan_tier IN ('insights', 'fixes')
          AND u.current_period_end IS NOT NULL
          AND u.current_period_end > now()
        ON CONFLICT (user_id, store_domain) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_store_subscriptions_paddle_sub", table_name="store_subscriptions"
    )
    op.drop_index("ix_store_subscriptions_user", table_name="store_subscriptions")
    op.drop_table("store_subscriptions")
