from __future__ import annotations

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_endpoints():
    print("1. Testing /health...")
    health_resp = client.get("/health")
    assert health_resp.status_code == 200, f"Health check failed: {health_resp.text}"
    print("   -> /health OK:", health_resp.json())

    print("2. Testing POST /sessions (fresh session without upload)...")
    create_resp = client.post("/sessions", json={"title": "Global Warming Query"})
    assert create_resp.status_code == 200, f"Create session failed: {create_resp.text}"
    session = create_resp.json()
    session_id = session["session_id"]
    print(f"   -> Session created with default KB: {session['filename']} ({session['chunks_created']} chunks)")
    assert "knowledge_base.txt" in session["filename"]

    print("3. Testing POST /chat without document upload (should query default knowledge_base.txt)...")
    chat_resp = client.post(
        "/chat",
        json={"session_id": session_id, "message": "What are the primary causes of global greenhouse gas emissions?"},
    )
    assert chat_resp.status_code == 200, f"Chat without upload failed: {chat_resp.text}"
    chat_data = chat_resp.json()
    safe_snippet = chat_data["answer"][:140].encode("ascii", "replace").decode("ascii")
    print("   -> Chat response received successfully!")
    print(f"   -> Answer snippet: {safe_snippet}...")
    assert len(chat_data["answer"]) > 20

    print("4. Testing GET /sessions/{session_id}/messages...")
    msgs_resp = client.get(f"/sessions/{session_id}/messages")
    assert msgs_resp.status_code == 200
    messages = msgs_resp.json()
    assert len(messages) == 2, f"Expected 2 messages (user + assistant), got {len(messages)}"
    print(f"   -> Found {len(messages)} messages recorded in session.")

    print("5. Testing DELETE /sessions/{session_id}...")
    del_resp = client.delete(f"/sessions/{session_id}")
    assert del_resp.status_code == 200
    print("   -> Session deleted successfully.")

    print("\nALL VERIFICATIONS PASSED: Default Knowledge Base fallback works perfectly!")

if __name__ == "__main__":
    test_endpoints()
