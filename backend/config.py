from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load variables from backend/.env
load_dotenv(Path(__file__).resolve().parent / ".env")

# ─── LLM ────────────────────────────────────────────────────────────────────
GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")

# ─── Google OAuth ────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET: str | None = os.getenv("GOOGLE_CLIENT_SECRET")

# Redirect URI registered in Google Cloud Console → Credentials
GOOGLE_REDIRECT_URI: str = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
)

# ─── JWT Settings ────────────────────────────────────────────────────────────
JWT_SECRET: str = os.getenv(
    "JWT_SECRET",
    "dev-only-change-in-prod-supersecretkey",   # overridden via .env in production
)
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRATION_MINUTES: int = int(os.getenv("JWT_EXPIRATION_MINUTES", "1440"))  # 24 h

# ─── Starlette Session Middleware ────────────────────────────────────────────
SESSION_SECRET_KEY: str = os.getenv(
    "SESSION_SECRET_KEY",
    "dev-session-secret-change-in-prod",        # overridden via .env in production
)

# ─── Frontend App URL ────────────────────────────────────────────────────────
FRONTEND_URL: str = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
)

