# 🌍 ClimaMind — RAG AI Chatbot with Voice & Document Search

A full-stack, context-aware Retrieval-Augmented Generation (RAG) AI assistant built with **FastAPI**, **LangChain**, **Groq LLMs**, **FAISS**, and **React (Vite + Tailwind CSS)**.

Features real-time document search, Google OAuth 2.0 multi-user authentication, voice-to-text input with **Whisper Large v3 Turbo**, and permanent SQLite chat history persistence.

---

## ✨ Features

- 🧠 **Context-Aware RAG Pipeline**: Powered by LangChain, Groq LLM, and FAISS vector embeddings with history-aware query reformulation.
- 📄 **Multi-Format Document Ingestion**: Upload PDF, DOCX, TXT, XLSX, and CSV documents to index and chat with custom files dynamically.
- 🎙️ **Voice Speech-to-Text**: Real-time microphone audio recording with instant transcription powered by **Groq Whisper Large v3 Turbo**.
- 🔐 **Google OAuth 2.0 Authentication**: Secure sign-in with JWT token exchange and user-isolated data.
- 💾 **Permanent SQLite Storage**: Chat sessions, message history, and user metadata are saved permanently in local SQLite (`rag_chatbot.db`).
- 🎨 **Modern Sleek UI**: Built with React, Tailwind CSS, Lucide icons, glassmorphism, and responsive design.

---

## 🏗️ Architecture

```
RAG-Chatbot-LangChain/
├── backend/
│   ├── main.py               # FastAPI application & API endpoints
│   ├── auth.py               # Google OAuth & JWT authentication
│   ├── models.py             # SQLAlchemy models (User, ChatSession, ChatMessage)
│   ├── database.py           # SQLite database engine & session factory
│   ├── document_loader.py    # Multi-format document parser & splitter
│   ├── config.py             # App configuration & environment loader
│   ├── .env.example          # Environment variables template
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/       # UI Components (ChatPanel, Sidebar, MessageInput, EmptyState)
│   │   ├── context/          # React Auth Context
│   │   ├── pages/            # Login & OAuth callback handlers
│   │   └── services/         # Axios API client
│   ├── package.json          # Node dependencies
│   └── tailwind.config.js    # Styling configuration
└── knowledge_base.txt        # Default global warming knowledge base
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Navigate to project root
# Create and activate virtual environment
python -m venv chatbotenv
chatbotenv\Scripts\activate       # On Windows
# source chatbotenv/bin/activate  # On macOS/Linux

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment variables
cp backend/.env.example backend/.env
# Open backend/.env and add your GROQ_API_KEY and Google OAuth credentials

# Start backend server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup

```bash
# In a second terminal:
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

### 3. Open Application
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔑 Environment Configuration (`backend/.env`)

| Variable | Description |
| :--- | :--- |
| `GROQ_API_KEY` | Your Groq API key (for LLM and Whisper STT) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth Client ID |
| `GOOGLE_CLIENT_SECRET`| Google Cloud Console OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/auth/google/callback` |
| `JWT_SECRET` | Secret key for signing user JWT tokens |
| `SESSION_SECRET_KEY` | Secret key for Starlette session middleware |
| `FRONTEND_URL` | `http://localhost:5173` |

---

## 🛡️ License
MIT License.
