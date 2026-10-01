from __future__ import annotations

# ── sys.path bootstrap ────────────────────────────────────────────────────────
# Ensures backend/ siblings (auth, config, database, models, document_loader)
# are importable whether uvicorn is called as:
#   uvicorn backend.main:app   (from project root)
#   uvicorn main:app           (from inside backend/)
import sys as _sys
from pathlib import Path as _Path
_backend_dir = str(_Path(__file__).resolve().parent)
if _backend_dir not in _sys.path:
    _sys.path.insert(0, _backend_dir)
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from authlib.integrations.starlette_client import OAuthError
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_groq import ChatGroq
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from auth import create_access_token, get_current_user, oauth
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from config import (
    FRONTEND_URL,
    GOOGLE_REDIRECT_URI,
    GROQ_API_KEY,
    SESSION_SECRET_KEY,
)
from database import Base, engine, get_db
from document_loader import SUPPORTED_EXTENSIONS, load_documents
from models import ChatMessage, ChatSession, User


try:
    from langchain.chains import create_history_aware_retriever, create_retrieval_chain
    from langchain.chains.combine_documents import create_stuff_documents_chain
except ImportError:
    from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
    from langchain_classic.chains.combine_documents import create_stuff_documents_chain

# ---------------------------------------------------------------------------
# App + Middleware
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RAG Chatbot API",
    description="Backend API supporting document ingestion, conversational RAG, session management, and Google OAuth.",
    version="2.0.0",
)

# SessionMiddleware MUST come before CORSMiddleware — Authlib requires it.
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup — create DB tables
# ---------------------------------------------------------------------------

@app.on_event("startup")
def on_startup() -> None:
    """Create all SQLAlchemy tables on first startup if they don't exist."""
    Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# In-memory stores (sessions, chat history, FAISS vector stores)
# ---------------------------------------------------------------------------

vector_stores: dict[str, FAISS] = {}
chat_histories: dict[str, list[HumanMessage | AIMessage]] = {}
chat_messages: dict[str, list[dict[str, Any]]] = {}
sessions: dict[str, dict[str, Any]] = {}

embeddings: HuggingFaceEmbeddings | None = None
llm: ChatGroq | None = None

# Default Knowledge Base
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_KB_PATH = BASE_DIR / "knowledge_base.txt"
default_vector_store: FAISS | None = None
default_chunks_count: int = 0


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: str
    message: str


class CreateSessionRequest(BaseModel):
    title: str | None = None


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str


class SessionSummary(BaseModel):
    session_id: str
    title: str
    filename: str | None = None
    chunks_created: int = 0
    created_at: str
    updated_at: str
    message_count: int = 0
    has_custom_doc: bool = False


# ---------------------------------------------------------------------------
# Helper Initializers
# ---------------------------------------------------------------------------

def get_embeddings() -> HuggingFaceEmbeddings:
    global embeddings
    if embeddings is None:
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
        )
    return embeddings


def get_llm() -> ChatGroq:
    global llm
    if llm is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured in environment or .env")
        llm = ChatGroq(
            groq_api_key=GROQ_API_KEY,
            model="openai/gpt-oss-120b",
            temperature=0.3,
        )
    return llm


def get_default_vector_store() -> tuple[FAISS, int]:
    """Load and cache the default knowledge_base.txt into a FAISS vector store."""
    global default_vector_store, default_chunks_count
    if default_vector_store is None:
        if not DEFAULT_KB_PATH.exists():
            raise FileNotFoundError(f"Default knowledge base not found at: {DEFAULT_KB_PATH}")
        content = DEFAULT_KB_PATH.read_text(encoding="utf-8")
        doc = Document(page_content=content, metadata={"source": "knowledge_base.txt"})
        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = splitter.split_documents([doc])
        default_chunks_count = len(chunks)
        default_vector_store = FAISS.from_documents(chunks, get_embeddings())
    return default_vector_store, default_chunks_count


def current_iso_time() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_session_record(session_id: str, title: str = "New Chat", user_id: int | None = None) -> dict[str, Any]:
    """Initialize a session record pre-configured with the default knowledge base."""
    now = current_iso_time()
    chunks_count = 0
    default_filename = "knowledge_base.txt (Default)"
    try:
        _, chunks_count = get_default_vector_store()
    except Exception:
        pass

    session_data = {
        "session_id": session_id,
        "title": title,
        "filename": default_filename,
        "chunks_created": chunks_count,
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
        "has_custom_doc": False,
        "user_id": user_id,   # ← scope session to its creator
    }
    sessions[session_id] = session_data
    chat_histories.setdefault(session_id, [])
    chat_messages.setdefault(session_id, [])
    return session_data


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------

@app.get("/auth/google/login", tags=["auth"])
async def google_login(request: Request) -> RedirectResponse:
    """
    Redirect the user's browser to Google's OAuth consent screen.
    Authlib stores the CSRF state in the server-side session cookie.
    """
    return await oauth.google.authorize_redirect(request, GOOGLE_REDIRECT_URI)


@app.get("/auth/google/callback", tags=["auth"])
async def google_callback(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
    """
    Handles the OAuth redirect from Google.
    - Exchanges the authorization code for tokens.
    - Upserts the User row in the database.
    - Issues a signed JWT.
    - Redirects the browser to the frontend callback page with only
      `?access_token=<jwt>` in the URL. The frontend then calls
      GET /auth/me to fetch the user profile.
    """
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        # Redirect to frontend with error so user sees a friendly message
        params = urlencode({"error": str(exc.description or "OAuth failed")})
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback?{params}")

    # Prefer the ID-token userinfo (already validated by Authlib)
    user_info = token.get("userinfo")
    if not user_info:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {token['access_token']}"},
            )
        user_info = resp.json()

    google_id: str = str(user_info["sub"])
    email: str = user_info.get("email", "")
    name: str | None = user_info.get("name")
    picture: str | None = user_info.get("picture")

    # Upsert the user record
    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        user = User(google_id=google_id, email=email, name=name, picture=picture)
        db.add(user)
    else:
        user.email = email
        user.name = name
        user.picture = picture
    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})

    # Redirect to frontend — only the token, no PII in the URL
    params = urlencode({"access_token": access_token})
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?{params}")


@app.get("/auth/me", tags=["auth"])
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> dict[str, Any]:
    """
    Return the currently authenticated user's profile.
    Requires a valid Bearer JWT in the Authorization header.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": "RAG Chatbot API"}


# ---------------------------------------------------------------------------
# Session Endpoints
# ---------------------------------------------------------------------------

# Optional auth — returns the User if a valid Bearer token is provided, else None.
# This lets us scope sessions per-user while keeping unauthenticated health checks working.
_optional_bearer = HTTPBearer(auto_error=False)

def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """Returns the current User from the JWT, or None if no / invalid token."""
    if credentials is None:
        return None
    try:
        from auth import decode_access_token
        payload = decode_access_token(credentials.credentials)
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        return db.get(User, int(user_id_str))
    except Exception:
        return None


@app.get("/sessions", response_model=list[SessionSummary], tags=["sessions"])
def list_sessions(
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    """Return chat sessions for the current user only from SQLite, sorted by latest activity."""
    user_id = current_user.id if current_user else None
    db_sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [
        {
            "session_id": s.id,
            "title": s.title,
            "filename": s.filename,
            "chunks_created": s.chunks_created,
            "created_at": s.created_at.isoformat() if s.created_at else current_iso_time(),
            "updated_at": s.updated_at.isoformat() if s.updated_at else current_iso_time(),
            "message_count": s.message_count,
            "has_custom_doc": s.has_custom_doc,
        }
        for s in db_sessions
    ]


@app.post("/sessions", response_model=SessionSummary, tags=["sessions"])
def create_session(
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[Session, Depends(get_db)],
    payload: CreateSessionRequest | None = None,
) -> dict[str, Any]:
    """Create a new chat session in SQLite tagged to the current user."""
    session_id = str(uuid4())
    title = (payload.title.strip() if payload and payload.title and payload.title.strip() else "New Chat")
    user_id = current_user.id if current_user else None

    chunks_count = 0
    try:
        _, chunks_count = get_default_vector_store()
    except Exception:
        pass

    db_session = ChatSession(
        id=session_id,
        title=title,
        filename="knowledge_base.txt (Default)",
        chunks_created=chunks_count,
        has_custom_doc=False,
        user_id=user_id,
        message_count=0,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    chat_histories.setdefault(session_id, [])

    return {
        "session_id": db_session.id,
        "title": db_session.title,
        "filename": db_session.filename,
        "chunks_created": db_session.chunks_created,
        "created_at": db_session.created_at.isoformat(),
        "updated_at": db_session.updated_at.isoformat(),
        "message_count": db_session.message_count,
        "has_custom_doc": db_session.has_custom_doc,
    }


@app.get("/sessions/{session_id}/messages", response_model=list[MessageItem], tags=["sessions"])
def get_session_messages(
    session_id: str,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    """Retrieve message history for a session from SQLite."""
    session = db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    # Ownership check
    if session.user_id != (current_user.id if current_user else None):
        raise HTTPException(status_code=403, detail="Access denied")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "timestamp": m.timestamp.isoformat() if m.timestamp else current_iso_time(),
        }
        for m in messages
    ]


@app.delete("/sessions/{session_id}", tags=["sessions"])
def delete_session(
    session_id: str,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Delete a session and all its messages permanently from SQLite."""
    session = db.get(ChatSession, session_id)
    if session:
        if session.user_id != (current_user.id if current_user else None):
            raise HTTPException(status_code=403, detail="Access denied")
        db.delete(session)
        db.commit()

    vector_stores.pop(session_id, None)
    chat_histories.pop(session_id, None)
    return {"success": True, "message": "Session deleted successfully", "session_id": session_id}


# ---------------------------------------------------------------------------
# Document Upload
# ---------------------------------------------------------------------------

@app.post("/upload", tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    session_id: str | None = Form(None),
    current_user: Annotated[User | None, Depends(get_optional_user)] = None,
    db: Annotated[Session, Depends(get_db)] = None,
) -> dict[str, Any]:
    """
    Ingest a user document (PDF, DOCX, TXT, XLSX, CSV), split into chunks,
    compute embeddings, and store in FAISS scoped to session_id.
    Persists or updates session record in SQLite.
    """
    filename = file.filename or "uploaded_document"
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{extension}'. Supported types: {supported}",
        )

    try:
        content_bytes = await file.read()
        documents = load_documents(filename, content_bytes)
    except (UnicodeDecodeError, ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=f"Could not read file: {error}") from error

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(documents)
    if not chunks:
        raise HTTPException(status_code=400, detail="The uploaded file contains no readable text")

    user_id = current_user.id if current_user else None
    if not session_id:
        session_id = str(uuid4())
        db_session = ChatSession(
            id=session_id,
            title=filename,
            filename=filename,
            chunks_created=len(chunks),
            has_custom_doc=True,
            user_id=user_id,
            message_count=0,
        )
        db.add(db_session)
    else:
        db_session = db.get(ChatSession, session_id)
        if db_session:
            db_session.filename = filename
            db_session.chunks_created = len(chunks)
            db_session.has_custom_doc = True
            db_session.updated_at = datetime.now(timezone.utc)
        else:
            db_session = ChatSession(
                id=session_id,
                title=filename,
                filename=filename,
                chunks_created=len(chunks),
                has_custom_doc=True,
                user_id=user_id,
                message_count=0,
            )
            db.add(db_session)

    db.commit()
    db.refresh(db_session)
    vector_stores[session_id] = FAISS.from_documents(chunks, get_embeddings())
    chat_histories.setdefault(session_id, [])

    return {
        "session_id": session_id,
        "filename": filename,
        "chunks_created": len(chunks),
        "message": f"Successfully indexed {len(chunks)} chunks from '{filename}'",
    }


# ---------------------------------------------------------------------------
# Audio Transcription (Whisper Large v3 Turbo via Groq)
# ---------------------------------------------------------------------------

@app.post("/transcribe", tags=["audio"])
async def transcribe_audio(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """
    Transcribes spoken audio into text using Groq's whisper-large-v3-turbo model.
    Accepts webm, wav, mp3, m4a, ogg files recorded directly from the browser.
    """
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured on the server."
        )

    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Audio file is empty.")

        filename = file.filename or "audio_recording.webm"
        content_type = file.content_type or "audio/webm"
        file_tuple = (filename, audio_bytes, content_type)

        transcription = groq_client.audio.transcriptions.create(
            file=file_tuple,
            model="whisper-large-v3-turbo",
            response_format="json",
            temperature=0.0,
        )

        transcribed_text = transcription.text.strip() if hasattr(transcription, "text") else str(transcription)
        return {
            "text": transcribed_text,
            "filename": filename,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Speech transcription failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@app.post("/chat", tags=["chat"])
async def chat(
    request: ChatRequest,
    current_user: Annotated[User | None, Depends(get_optional_user)] = None,
    db: Annotated[Session, Depends(get_db)] = None,
) -> dict[str, Any]:
    """
    RAG Chat endpoint with history-aware query reformulation and permanent SQLite persistence.
    Falls back to the default knowledge_base.txt if no custom document is uploaded.
    """
    session_id = request.session_id
    user_query = request.message.strip()

    if not user_query:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_id = current_user.id if current_user else None
    db_session = db.get(ChatSession, session_id)
    if not db_session:
        chunks_count = 0
        try:
            _, chunks_count = get_default_vector_store()
        except Exception:
            pass
        title = user_query[:35] + ("..." if len(user_query) > 35 else "")
        db_session = ChatSession(
            id=session_id,
            title=title,
            filename="knowledge_base.txt (Default)",
            chunks_created=chunks_count,
            has_custom_doc=False,
            user_id=user_id,
            message_count=0,
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)

    # Reconstruct chat_history from DB if session memory was reset
    if session_id not in chat_histories or not chat_histories[session_id]:
        chat_histories[session_id] = []
        past_msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.timestamp.asc())
            .all()
        )
        for m in past_msgs:
            if m.role == "user":
                chat_histories[session_id].append(HumanMessage(content=m.content))
            else:
                chat_histories[session_id].append(AIMessage(content=m.content))

    vector_store = vector_stores.get(session_id)
    if vector_store is None:
        try:
            vector_store, default_count = get_default_vector_store()
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Could not load default knowledge base: {error}",
            ) from error

    chat_history = list(chat_histories[session_id])

    try:
        retriever = vector_store.as_retriever(search_kwargs={"k": 4})
        contextualize_q_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Given a chat history and the latest user question, formulate a "
                    "standalone question which can be understood without the chat history. "
                    "Do NOT answer the question, just reformulate it if needed and otherwise "
                    "return it as is.",
                ),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        history_aware_retriever = create_history_aware_retriever(
            get_llm(), retriever, contextualize_q_prompt
        )

        qa_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are ClimaMind, an expert, thoughtful, and articulate AI assistant specializing in climate science and document analysis. "
                    "Answer user questions accurately and comprehensively based on the provided retrieved context. "
                    "If the user has not uploaded a custom document, your context comes from the default Global Warming Knowledge Base. "
                    "If the user has uploaded a custom document, your context comes from that document. "
                    "If the context does not contain sufficient information to answer the question, state that clearly rather than guessing. "
                    "Format your response cleanly with markdown (bold headers, bullet points, and well-structured paragraphs).\n\n"
                    "Context:\n{context}",
                ),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        question_answer_chain = create_stuff_documents_chain(get_llm(), qa_prompt)
        rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
        result = rag_chain.invoke({"input": user_query, "chat_history": chat_history})
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Could not generate answer: {error}") from error

    answer = result.get("answer", "")
    now_iso = current_iso_time()
    now_dt = datetime.now(timezone.utc)

    # In-memory LangChain history
    chat_histories[session_id].extend(
        [HumanMessage(content=user_query), AIMessage(content=answer)]
    )

    # Save to SQLite database
    user_msg_id = str(uuid4())
    asst_msg_id = str(uuid4())
    user_msg = ChatMessage(id=user_msg_id, session_id=session_id, role="user", content=user_query, timestamp=now_dt)
    asst_msg = ChatMessage(id=asst_msg_id, session_id=session_id, role="assistant", content=answer, timestamp=now_dt)
    db.add(user_msg)
    db.add(asst_msg)

    # Update session metadata
    db_session.updated_at = now_dt
    db_session.message_count = db_session.message_count + 2
    if db_session.title == "New Chat":
        db_session.title = user_query[:35] + ("..." if len(user_query) > 35 else "")

    db.commit()

    return {
        "answer": answer,
        "session_id": session_id,
        "timestamp": now_iso,
    }

