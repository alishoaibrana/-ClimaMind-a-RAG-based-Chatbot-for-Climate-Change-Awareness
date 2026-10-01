import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  User,
  Copy,
  Check,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
  FileSpreadsheet
} from 'lucide-react';
import EmptyState from './EmptyState';
import MessageInput from './MessageInput';

export default function ChatPanel({
  session,
  messages,
  isSending,
  isUploading,
  onSendMessage,
  onUploadFile,
  onTriggerUpload,
  fileInputRef,
  isDragging,
  setIsDragging,
  uploadStatus
}) {
  const messagesEndRef = useRef(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleCopy = (id, content) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <main
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-screen relative bg-surface-darker overflow-hidden"
    >
      {/* Drag and Drop Active Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-brand-500 rounded-2xl m-4 transition-all animate-in fade-in">
          <div className="p-4 rounded-full bg-brand-500/20 text-brand-400 mb-3 shadow-glow">
            <UploadCloud className="w-12 h-12 animate-bounce" />
          </div>
          <p className="text-lg font-bold text-white">Drop your document here</p>
          <p className="text-xs text-slate-400 mt-1">Supports PDF, DOCX, TXT, XLSX, CSV</p>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadFile(e.target.files[0]);
          }
        }}
        accept=".pdf,.docx,.txt,.xlsx,.csv"
        className="hidden"
      />

      {/* Chat Header */}
      <header className="h-16 px-6 border-b border-slate-800/80 bg-surface-dark/70 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-brand-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight truncate max-w-sm sm:max-w-md">
              {session?.title || 'Global Warming Chat'}
            </h2>
            <p className="text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <FileText className="w-3 h-3 text-brand-400" />
                {session?.filename || 'knowledge_base.txt (Default)'}
              </span>
            </p>
          </div>
        </div>

        {uploadStatus && (
          <div className="text-xs px-3 py-1 rounded-lg bg-brand-500/10 text-brand-300 border border-brand-500/20 flex items-center gap-2">
            {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{uploadStatus}</span>
          </div>
        )}
      </header>

      {/* Chat Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
        {messages.length === 0 ? (
          <EmptyState
            onSelectPrompt={onSendMessage}
            onTriggerUpload={onTriggerUpload}
            activeFilename={session?.filename}
            chunksCreated={session?.chunks_created}
            hasCustomDoc={session?.has_custom_doc}
          />
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl mx-auto ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`group relative max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 transition-all ${
                    isUser
                      ? 'bg-gradient-to-r from-brand-600 to-teal-700 text-white shadow-md rounded-br-none'
                      : 'glass-panel text-slate-200 border border-slate-800 shadow-sm rounded-bl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {!isUser && (
                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-end text-[11px] text-slate-400">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1 hover:text-slate-200 transition-colors p-1 rounded"
                        title="Copy Answer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-brand-400" />
                            <span className="text-brand-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Thinking / Processing Skeleton */}
        {isSending && (
          <div className="flex gap-3 max-w-3xl mx-auto justify-start animate-in fade-in">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-600 flex items-center justify-center text-white flex-shrink-0 shadow-glow mt-0.5">
              <Bot className="w-4 h-4" />
            </div>
            <div className="glass-panel text-slate-200 border border-brand-500/30 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              <span className="text-xs text-slate-300 font-medium animate-pulse">
                ClimaMind is retrieving context and generating answer...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Message Input Box */}
      <MessageInput
        onSendMessage={onSendMessage}
        onTriggerUpload={onTriggerUpload}
        isSending={isSending}
        isUploading={isUploading}
        activeFilename={session?.filename}
        chunksCreated={session?.chunks_created}
      />
    </main>
  );
}
