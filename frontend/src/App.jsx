import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import {
  checkHealth,
  getSessions,
  createSession,
  getSessionMessages,
  deleteSession,
  uploadDocument,
  sendChatMessage,
} from './services/api';

// ─── Simple hash-based router ─────────────────────────────────────────────────
function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return path;
}

function navigate(to) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ─── Authenticated Chatbot Shell ──────────────────────────────────────────────
function ChatApp() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isBackendConnected, setIsBackendConnected] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    async function initialize() {
      try {
        await checkHealth();
        setIsBackendConnected(true);
      } catch {
        setIsBackendConnected(false);
      }
      try {
        const sessionList = await getSessions();
        setSessions(sessionList);
        if (sessionList.length > 0) {
          const firstId = sessionList[0].session_id;
          setActiveSessionId(firstId);
          loadSessionMessages(firstId);
        } else {
          await handleNewChat();
        }
      } catch (err) {
        console.error('Error fetching sessions:', err);
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try { await checkHealth(); setIsBackendConnected(true); }
      catch { setIsBackendConnected(false); }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadSessionMessages = async (sessionId) => {
    try {
      const msgs = await getSessionMessages(sessionId);
      setMessages(msgs || []);
    } catch {
      setMessages([]);
    }
  };

  const handleSelectSession = (sessionId) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    loadSessionMessages(sessionId);
  };

  const handleNewChat = async () => {
    setIsCreatingSession(true);
    try {
      const newSession = await createSession('New Chat');
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.session_id);
      setMessages([]);
    } catch (err) {
      alert('Could not create new session: ' + (err.message || 'Server error'));
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      const remaining = sessions.filter(s => s.session_id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].session_id);
          loadSessionMessages(remaining[0].session_id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      alert('Failed to delete session: ' + (err.message || 'Server error'));
    }
  };

  const handleTriggerUpload = () => fileInputRef.current?.click();

  const handleUploadFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadStatus(`Indexing ${file.name}…`);
    try {
      const res = await uploadDocument(file, activeSessionId);
      setUploadStatus(`Indexed ${res.chunks_created} chunks!`);
      setTimeout(() => setUploadStatus(null), 4000);
      const updatedSessions = await getSessions();
      setSessions(updatedSessions);
      setMessages(prev => [...prev, {
        id: 'sys-' + Date.now(),
        role: 'assistant',
        content: `📄 **Document Indexed Successfully!**\n\nI have processed **${res.filename}** into **${res.chunks_created} context chunks**.\n\nYou can now ask any questions about this document!`,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 4000);
      alert('Upload failed: ' + (err.detail || err.message));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (text) => {
    if (!text.trim() || isSending) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const newSession = await createSession(text.slice(0, 30));
        sessionId = newSession.session_id;
        setActiveSessionId(sessionId);
        setSessions([newSession, ...sessions]);
      } catch (err) {
        alert('Could not initialize session: ' + err.message);
        return;
      }
    }

    const optimisticMsg = {
      id: 'usr-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setIsSending(true);

    try {
      const response = await sendChatMessage(sessionId, text);
      setMessages(prev => [...prev, {
        id: 'asst-' + Date.now(),
        role: 'assistant',
        content: response.answer,
        timestamp: response.timestamp || new Date().toISOString(),
      }]);
      const updatedSessions = await getSessions();
      setSessions(updatedSessions);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: `⚠️ **Error**: ${err.detail || err.message || 'Could not reach the backend.'}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const activeSession = sessions.find(s => s.session_id === activeSessionId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-darker text-slate-100 antialiased">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        isBackendConnected={isBackendConnected}
        isCreatingSession={isCreatingSession}
        user={user}
        onLogout={logout}
      />
      <ChatPanel
        session={activeSession}
        messages={messages}
        isSending={isSending}
        isUploading={isUploading}
        onSendMessage={handleSendMessage}
        onUploadFile={handleUploadFile}
        onTriggerUpload={handleTriggerUpload}
        fileInputRef={fileInputRef}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        uploadStatus={uploadStatus}
      />
    </div>
  );
}

// ─── Root with routing ────────────────────────────────────────────────────────
function AppRouter() {
  const { isAuthenticated } = useAuth();
  const path = useRoute();

  // OAuth callback route — always render regardless of auth state
  if (path.startsWith('/auth/callback')) {
    return <AuthCallback onDone={(dest) => navigate(dest === 'login' ? '/' : '/')} />;
  }

  // Not authenticated → login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Authenticated → chatbot
  return <ChatApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
