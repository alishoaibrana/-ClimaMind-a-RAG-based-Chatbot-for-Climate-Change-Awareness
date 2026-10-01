import React from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  FileText,
  FileSpreadsheet,
  Bot,
  LogOut,
} from 'lucide-react';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  isBackendConnected,
  isCreatingSession,
  user,
  onLogout,
}) {
  const getDocIcon = (filename) => {
    if (!filename) return <MessageSquare className="w-4 h-4 text-slate-400" />;
    const ext = filename.split('.').pop().toLowerCase();
    if (['xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    if (ext === 'pdf')  return <FileText className="w-4 h-4 text-rose-400" />;
    if (ext === 'docx') return <FileText className="w-4 h-4 text-sky-400" />;
    return <FileText className="w-4 h-4 text-amber-400" />;
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diffSecs = Math.floor((Date.now() - date) / 1000);
    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="w-72 md:w-80 flex-shrink-0 h-screen flex flex-col bg-surface-dark/95 border-r border-slate-800/80 select-none z-20">

      {/* ── Brand Header ── */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center shadow-glow">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold font-display text-white tracking-tight">ClimaMind</h1>
            <p className="text-[11px] text-slate-400">Context-Aware AI Assistant</p>
          </div>
        </div>
        {/* Live backend status dot */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${isBackendConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}
          title={isBackendConnected ? 'Backend connected' : 'Backend offline'}
        />
      </div>

      {/* ── New Chat Button ── */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          disabled={isCreatingSession}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-teal-600 hover:from-brand-500 hover:to-teal-500 text-white font-medium text-sm transition-all shadow-md hover:shadow-glow active:scale-[0.98] disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* ── Session History ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Recent Conversations</span>
          <span className="bg-slate-800 text-slate-300 px-1.5 rounded-full font-mono text-[10px]">
            {sessions.length}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-500">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-400">No chat sessions yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">Upload a document or ask a question to start.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.session_id === activeSessionId;
            return (
              <div
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-slate-800/90 text-white border-brand-500/40 shadow-sm'
                    : 'hover:bg-slate-800/50 text-slate-300 border-transparent hover:border-slate-700/50'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${isActive ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800/80'}`}>
                    {getDocIcon(session.filename)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate group-hover:text-white">
                      {session.title || 'Untitled Session'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatRelativeTime(session.updated_at)}
                    </p>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this conversation and its vector index?')) {
                        onDeleteSession(session.session_id);
                      }
                    }}
                    title="Delete Chat"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── User Profile + Logout ── */}
      {user && (
        <div className="p-3 border-t border-slate-800/80">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-800/50 transition-colors group">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || 'User'}
                className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-slate-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                {(user.name || user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.name || 'User'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
