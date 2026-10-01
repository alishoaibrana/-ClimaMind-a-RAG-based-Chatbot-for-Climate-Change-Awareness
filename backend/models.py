"""
models.py — SQLAlchemy ORM models for the RAG Chatbot.

Tables:
  - users        : Google-authenticated users
  - chat_sessions: Chat sessions scoped per user (user_id FK, nullable for anonymous)
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """
    Represents a Google-authenticated user.
    google_id and email are unique identifiers synced from Google's OAuth response.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    google_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    picture: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # profile photo URL
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # One user → many sessions
    sessions: Mapped[list[ChatSession]] = relationship(
        "ChatSession", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class ChatSession(Base):
    """
    Represents a single chat session with an optional link to a User.
    user_id is nullable for anonymous / pre-auth sessions.
    """

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)  # UUID string
    title: Mapped[str] = mapped_column(String(255), default="New Chat", nullable=False)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    chunks_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    has_custom_doc: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # FK to users.id — nullable so anonymous sessions remain valid
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user: Mapped[User | None] = relationship("User", back_populates="sessions")
    messages: Mapped[list[ChatMessage]] = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.timestamp",
    )

    def __repr__(self) -> str:
        return f"<ChatSession id={self.id!r} title={self.title!r} user_id={self.user_id}>"


class ChatMessage(Base):
    """
    Represents a single chat message (user or assistant) within a ChatSession.
    """

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)  # UUID string
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    session: Mapped[ChatSession] = relationship("ChatSession", back_populates="messages")

    def __repr__(self) -> str:
        return f"<ChatMessage id={self.id!r} session_id={self.session_id!r} role={self.role!r}>"

