import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Ensure database directory is absolute relative to this backend module
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "lifeline.db"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")
# Normalize postgres:// to postgresql:// for SQLAlchemy compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite specific config
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that provides an active database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from sqlalchemy import text


def upgrade_schema():
    """Idempotently adds missing columns to existing SQLite tables for Module 4."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.connect() as conn:
        # Check emergencies columns
        try:
            res = conn.execute(text("PRAGMA table_info(emergencies)"))
            existing_cols = {row[1] for row in res.fetchall()}
            
            new_emergency_cols = [
                ("patient_id", "INTEGER"),
                ("selected_hospital_id", "INTEGER"),
                ("latitude", "FLOAT"),
                ("longitude", "FLOAT"),
                ("location_description", "VARCHAR(255)"),
                ("cancellation_reason", "TEXT"),
                ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ]
            for col_name, col_type in new_emergency_cols:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE emergencies ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
        except Exception as e:
            print(f"[Schema Upgrade] Notice on emergencies table: {e}")

        # Check ambulances columns
        try:
            res = conn.execute(text("PRAGMA table_info(ambulances)"))
            existing_cols = {row[1] for row in res.fetchall()}

            new_ambulance_cols = [
                ("latitude", "FLOAT"),
                ("longitude", "FLOAT"),
                ("capability", "VARCHAR(60) DEFAULT 'Advanced Life Support (ALS)'"),
                ("last_location_update", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ]
            for col_name, col_type in new_ambulance_cols:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE ambulances ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
        except Exception as e:
            print(f"[Schema Upgrade] Notice on ambulances table: {e}")


def init_db():
    """Creates all database tables defined in the models and performs idempotent upgrades."""
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    upgrade_schema()

