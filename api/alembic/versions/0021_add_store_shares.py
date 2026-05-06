"""Add store_shares table for revocable shareable report links.

A row mints a public, tier-bound URL to a single store's report. The
``token`` column is the bearer credential — anyone who has the URL can
read the report at ``share_tier``.  Expiry is *not* stored — the public
endpoint resolves the owner's live tier via ``store_subscriptions`` and
returns 410 when the owner's tier drops below the share's tier. Free
shares never auto-expire.

Cascade on ``users.id`` cleans up all of an owner's shares when the user
is deleted.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "store_shares",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column(
            "owner_user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("store_domain", sa.Text(), nullable=False),
        sa.Column("share_tier", sa.Text(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "view_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("token", name="uq_store_shares_token"),
        sa.CheckConstraint(
            "share_tier IN ('free','insights','fixes')",
            name="ck_store_shares_share_tier",
        ),
    )
    op.create_index(
        "ix_store_shares_owner_domain",
        "store_shares",
        ["owner_user_id", "store_domain"],
    )


def downgrade() -> None:
    op.drop_index("ix_store_shares_owner_domain", table_name="store_shares")
    op.drop_table("store_shares")
