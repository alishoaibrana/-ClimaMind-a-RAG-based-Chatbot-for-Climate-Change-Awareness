"""
database.py — SQLAlchemy engine, session factory, and dependency injection helper.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).resolve().parent.parent / "rag_chatbot.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite with FastAPI
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared base class for all ORM models."""


def get_db():
    """
    FastAPI dependency that provides a SQLAlchemy Session.
    Guarantees the session is closed even if an exception is raised.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
