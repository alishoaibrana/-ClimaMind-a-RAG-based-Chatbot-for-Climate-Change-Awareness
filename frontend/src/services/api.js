const API_BASE = 'http://localhost:8000';
const TOKEN_KEY = 'climamind_token';

/**
 * Custom error class with HTTP status code and server detail
 */
export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Returns the Authorization header object if a token is stored, else empty object */
function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(response) {
  if (!response.ok) {
    let errorDetail = null;
    try {
      const data = await response.json();
      errorDetail = data.detail || data.message || 'Request failed';
    } catch {
      errorDetail = response.statusText;
    }
    throw new ApiError(errorDetail || `HTTP ${response.status}`, response.status, errorDetail);
  }
  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Fetch the current user's profile using a specific token.
 * Called by AuthCallback immediately after storing the token.
 */
export async function getMe(accessToken) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return handleResponse(res);
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse(res);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`, {
    headers: { ...getAuthHeaders() },
  });
  return handleResponse(res);
}

export async function createSession(title = 'New Chat') {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ title }),
  });
  return handleResponse(res);
}

export async function getSessionMessages(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    headers: { ...getAuthHeaders() },
  });
  return handleResponse(res);
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  return handleResponse(res);
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function uploadDocument(file, sessionId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },   // no Content-Type: browser sets it with boundary
    body: formData,
  });
  return handleResponse(res);
}

// ─── Audio / Speech-to-Text ──────────────────────────────────────────────────

export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');

  const res = await fetch(`${API_BASE}/transcribe`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: formData,
  });
  return handleResponse(res);
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function sendChatMessage(sessionId, message) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse(res);
}


