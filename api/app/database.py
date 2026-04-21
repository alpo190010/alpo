from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

connect_args = {}
if settings.db_ssl:
    connect_args["sslmode"] = "require"

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=10,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
