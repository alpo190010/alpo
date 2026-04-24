"""Per-user analysis isolation

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Delete orphaned rows that have no owning user — these cannot satisfy
    #    the upcoming NOT NULL constraint and represent anonymous/legacy data.
    op.execute("DELETE FROM product_analyses WHERE user_id IS NULL")

    # 2. Drop the old single-column unique on product_url. Postgres auto-names
    #    these `<table>_<col>_key` by default, but the legacy Supabase DB had
    #    it named `<table>_<col>_unique` — use dynamic SQL so either name works.
    op.execute(
        """
        DO $$
        DECLARE c_name text;
        BEGIN
            SELECT con.conname INTO c_name
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_attribute att ON att.attrelid = con.conrelid
                                  AND att.attnum = ANY(con.conkey)
            WHERE rel.relname = 'product_analyses'
              AND con.contype = 'u'
              AND cardinality(con.conkey) = 1
              AND att.attname = 'product_url'
            LIMIT 1;
            IF c_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE product_analyses DROP CONSTRAINT '
                     || quote_ident(c_name);
            END IF;
        END $$;
        """
    )

    # 3. Make user_id NOT NULL now that orphaned rows are gone.
    op.alter_column(
        "product_analyses",
        "user_id",
        existing_type=sa.UUID(),
        nullable=False,
    )

    # 4. Add composite unique so each user can have one analysis per product URL.
    op.create_unique_constraint(
        "uq_product_analyses_product_url_user_id",
        "product_analyses",
        ["product_url", "user_id"],
    )


def downgrade() -> None:
    # Reverse in opposite order. Note: deleted rows cannot be restored.

    # 4 → drop composite unique
    op.drop_constraint(
        "uq_product_analyses_product_url_user_id", "product_analyses", type_="unique"
    )

    # 3 → make user_id nullable again
    op.alter_column(
        "product_analyses",
        "user_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # 2 → restore single-column unique on product_url
    op.create_unique_constraint(
        "product_analyses_product_url_unique", "product_analyses", ["product_url"]
    )
