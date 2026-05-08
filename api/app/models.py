from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base, relationship, backref
from sqlalchemy.sql import func

Base = declarative_base()


class ProductAnalysis(Base):
    """Per-product page analysis (one per product_url + user).

    Intentionally has no foreign key to :class:`StoreAnalysis`. The two
    tables describe the same store from different angles:

    * ``ProductAnalysis`` — written by ``/analyze``, scores a single
      product page.
    * ``StoreAnalysis``   — written by ``/discover-products`` and
      ``/store/.../rescan``, aggregates store-wide signals
      (shipping, trust, checkout, etc.).

    A user may have one without the other for a given domain depending
    on which entry point they used. ``count_user_stores`` in
    ``services/entitlement.py`` reconciles them by unioning
    ``store_domain`` across both tables, so quota math stays correct
    even when only one row exists.
    """

    __tablename__ = "product_analyses"
    __table_args__ = (
        UniqueConstraint("product_url", "user_id", name="uq_product_analyses_product_url_user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    product_url = Column(Text, nullable=False)
    store_domain = Column(Text, nullable=False)
    score = Column(Integer, nullable=False)
    summary = Column(Text, nullable=True)
    tips = Column(JSONB, nullable=True)
    categories = Column(JSONB, nullable=True)
    product_price = Column(Numeric, nullable=True)
    product_category = Column(Text, nullable=True)
    estimated_monthly_visitors = Column(Integer, nullable=True)
    signals = Column(JSONB, nullable=True)
    is_shopify = Column(Boolean, nullable=True)
    is_ecommerce = Column(Boolean, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    user = relationship("User", backref=backref("product_analyses", lazy="dynamic"))


class StoreAnalysis(Base):
    """Aggregated store-wide analysis (one per store_domain + user).

    Companion table to :class:`ProductAnalysis`; see that docstring for
    the relationship rationale (no FK by design — joined at the
    ``store_domain`` column).
    """

    __tablename__ = "store_analyses"
    __table_args__ = (
        UniqueConstraint("store_domain", "user_id", name="uq_store_analyses_domain_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    store_domain = Column(Text, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    score = Column(Integer, nullable=False)
    categories = Column(JSONB, nullable=True)
    tips = Column(JSONB, nullable=True)
    signals = Column(JSONB, nullable=True)
    checks = Column(JSONB, nullable=True)
    analyzed_url = Column(Text, nullable=True)
    is_shopify = Column(Boolean, nullable=True)
    is_ecommerce = Column(Boolean, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    user = relationship("User", backref=backref("store_analyses", lazy="dynamic"))


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    score = Column(Integer, nullable=False)
    summary = Column(Text, nullable=True)
    tips = Column(JSONB, nullable=True)
    categories = Column(JSONB, nullable=True)
    product_price = Column(Numeric, nullable=True)
    product_category = Column(Text, nullable=True)
    estimated_visitors = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    url = Column(Text, nullable=False)
    score = Column(Integer, nullable=True)
    product_category = Column(Text, nullable=True)
    product_price = Column(Numeric, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", backref=backref("scans", lazy="dynamic"))


class Store(Base):
    __tablename__ = "stores"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    domain = Column(Text, nullable=False, unique=True)
    name = Column(Text, nullable=True)
    product_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    products = relationship("StoreProduct", back_populates="store")


class StoreProduct(Base):
    __tablename__ = "store_products"
    __table_args__ = (
        UniqueConstraint("store_id", "url", name="store_products_store_id_url_unique"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    store_id = Column(UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False)
    url = Column(Text, nullable=False)
    slug = Column(Text, nullable=False)
    image = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    store = relationship("Store", back_populates="products")


class StoreSubscription(Base):
    """Per-(user, store) paid plan.

    A row exists only when the user has bought (or been grandfathered
    into) a paid tier for a specific domain. Absence of a row means the
    pair is on the implicit free tier; an expired row (``current_period_end
    <= now()``) is treated as expired-and-revertable to free, but the row
    itself is retained until the next webhook event clears it.

    Replaces the user-level ``users.plan_tier`` / ``users.current_period_end``
    fields, which were one-tier-per-user and contradicted the marketing
    promise of "one store per plan".
    """

    __tablename__ = "store_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "store_domain", name="uq_store_subscriptions_user_domain"
        ),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    store_domain = Column(Text, nullable=False)
    plan_tier = Column(Text, nullable=False)
    paddle_transaction_id = Column(Text, nullable=True)
    paddle_subscription_id = Column(Text, nullable=True)
    paddle_customer_id = Column(Text, nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship(
        "User", backref=backref("store_subscriptions", lazy="dynamic")
    )


class StoreShare(Base):
    """Revocable shareable link for one (owner, store) report.

    The ``token`` column is the public bearer credential — anyone with
    the URL can read the report rendered at ``share_tier``. Expiry is
    derived live from the owner's ``store_subscriptions`` row (see
    ``services.store_subscriptions.get_effective_tier``); a Fixes share
    becomes 410 when the owner's Fixes subscription lapses, an Insights
    share becomes 410 when they drop below Insights, and Free shares
    never auto-expire because Free is the baseline.

    ``revoked_at`` is a soft revoke so the public endpoint can return a
    deterministic ``share_revoked`` body and the owner UI can show
    struck-through entries.
    """

    __tablename__ = "store_shares"
    __table_args__ = (
        UniqueConstraint("token", name="uq_store_shares_token"),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    token = Column(Text, nullable=False)
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    store_domain = Column(Text, nullable=False)
    share_tier = Column(Text, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    view_count = Column(Integer, nullable=False, server_default=text("0"))
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owner = relationship(
        "User", backref=backref("store_shares", lazy="dynamic")
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    google_sub = Column(Text, nullable=True, unique=True)
    email = Column(Text, nullable=False, unique=True)
    name = Column(Text, nullable=True)
    picture = Column(Text, nullable=True)
    password_hash = Column(Text, nullable=True)
    email_verified = Column(Boolean, nullable=False, server_default=text("false"))
    verification_token = Column(Text, nullable=True)
    verification_token_expires_at = Column(DateTime, nullable=True)
    reset_token = Column(Text, nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    # --- Subscription & credit fields ---
    plan_tier = Column(Text, server_default="free")
    credits_used = Column(Integer, server_default=text("0"))
    credits_reset_at = Column(DateTime, server_default=func.now())
    store_quota = Column(Integer, nullable=False, server_default=text("1"))
    paddle_subscription_id = Column(Text, nullable=True)
    paddle_customer_id = Column(Text, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    paddle_customer_portal_url = Column(Text, nullable=True)

    # --- Role ---
    role = Column(Text, server_default="user", nullable=False)

    # --- Waitlist ---
    pro_waitlist = Column(Boolean, nullable=False, server_default=text("false"))

    # --- Trust / fraud ---
    flagged_for_review = Column(Boolean, nullable=False, server_default=text("false"))


class Subscriber(Base):
    __tablename__ = "subscribers"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, nullable=False, unique=True)
    first_scan_url = Column(Text, nullable=True)
    first_scan_score = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
