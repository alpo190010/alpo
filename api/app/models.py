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
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    user = relationship("User", backref=backref("product_analyses", lazy="dynamic"))


class StoreAnalysis(Base):
    """Aggregated store-wide analysis (one per store_domain + user)."""

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
    analyzed_url = Column(Text, nullable=True)
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
    paddle_subscription_id = Column(Text, nullable=True)
    paddle_customer_id = Column(Text, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    paddle_customer_portal_url = Column(Text, nullable=True)

    # --- Role ---
    role = Column(Text, server_default="user", nullable=False)

    # --- Waitlist ---
    pro_waitlist = Column(Boolean, nullable=False, server_default=text("false"))


class Subscriber(Base):
    __tablename__ = "subscribers"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, nullable=False, unique=True)
    first_scan_url = Column(Text, nullable=True)
    first_scan_score = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
