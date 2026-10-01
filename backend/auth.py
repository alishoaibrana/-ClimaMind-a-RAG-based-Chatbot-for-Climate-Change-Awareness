"""
auth.py — Google OAuth 2.0 integration, JWT utilities, and auth dependencies.

Provides:
  - oauth           : Authlib OAuth registry configured with the Google provider
  - create_access_token(data)   : Issue a signed JWT for a user
  - get_current_user(token, db) : FastAPI dependency to validate Bearer JWT and return the User
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt as pyjwt
from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    JWT_ALGORITHM,
    JWT_EXPIRATION_MINUTES,
    JWT_SECRET,
)
from database import get_db
from models import User

# ─── Google OAuth Client ──────────────────────────────────────────────────────

oauth = OAuth()

oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile",
        "prompt": "select_account",
    },
)

# ─── JWT Utilities ────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a signed HS256 JWT containing the provided claims plus an 'exp' expiration.

    Args:
        data: Payload dict (should include at least 'sub': str user id).
        expires_delta: Token lifetime. Defaults to JWT_EXPIRATION_MINUTES.

    Returns:
        Encoded JWT string.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=JWT_EXPIRATION_MINUTES)
    )
    payload["exp"] = expire
    payload["iat"] = datetime.now(timezone.utc)
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT, raising HTTP 401 on any failure.

    Returns:
        The decoded payload dict.

    Raises:
        HTTPException 401 on expired or invalid token.
    """
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except pyjwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ─── FastAPI Auth Dependency ─────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """
    FastAPI dependency that:
      1. Extracts the Bearer token from the Authorization header.
      2. Decodes and validates the JWT.
      3. Looks up the User in the database and returns it.

    Raises HTTP 401 if the token is missing, invalid, expired, or the user is not found.
    Use with ``Depends(get_current_user)`` on any endpoint that requires authentication.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Provide a Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing the 'sub' claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, int(user_id_str))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
