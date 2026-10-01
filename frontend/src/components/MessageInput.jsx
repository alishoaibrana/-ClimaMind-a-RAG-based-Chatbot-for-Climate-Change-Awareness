import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Loader2, FileCheck, Mic, Square, Trash2 } from 'lucide-react';
import { transcribeAudio } from '../services/api';

export default function MessageInput({
  onSendMessage,
  onTriggerUpload,
  isSending,
  isUploading,
  activeFilename,
  chunksCreated,
  disabled
}) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioError, setAudioError] = useState(null);

  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  // Recording duration timer
  useEffect(() => {
    if (isRecording) {
      setRecordDuration(0);
      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setAudioError(null);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioError('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        // Don't send empty/extremely short recordings (< 0.5s)
        if (audioBlob.size < 100) return;

        setIsTranscribing(true);
        try {
          const result = await transcribeAudio(audioBlob);
          if (result && result.text) {
            setText((prev) => {
              const trimmed = prev.trim();
              return trimmed ? `${trimmed} ${result.text}` : result.text;
            });
          }
        } catch (err) {
          console.error('Transcription error:', err);
          setAudioError(err.message || 'Speech transcription failed. Please try again.');
        } finally {
          setIsTranscribing(false);
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        }
      };

      mediaRecorder.start(250); // Slice data every 250ms
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setAudioError('Microphone permission was denied. Please allow microphone access in browser settings.');
      } else {
        setAudioError('Could not start voice recording. Please check your microphone.');
      }
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      audioChunksRef.current = []; // clear chunks so nothing is transcribed
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isRecording) {
      stopRecording();
      return;
    }
    const cleanText = text.trim();
    if (!cleanText || isSending || isUploading || isTranscribing || disabled) return;
    onSendMessage(cleanText);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-t from-surface-darker via-surface-darker/90 to-transparent">
      <div className="max-w-3xl mx-auto">
        {/* Error Alert */}
        {audioError && (
          <div className="mb-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between animate-fade-in">
            <span>{audioError}</span>
            <button
              onClick={() => setAudioError(null)}
              className="ml-2 hover:text-white font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Document Indicator Pill (if uploaded) */}
        {activeFilename && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs w-fit">
            <FileCheck className="w-3.5 h-3.5" />
            <span className="font-medium truncate max-w-xs">{activeFilename}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`relative flex items-end gap-2 rounded-2xl glass-input p-2 transition-all shadow-lg ${
            isRecording
              ? 'ring-2 ring-red-500/50 bg-red-950/10'
              : 'focus-within:ring-1 focus-within:ring-brand-500/50'
          }`}
        >
          {/* File Upload Trigger */}
          <button
            type="button"
            onClick={onTriggerUpload}
            disabled={isUploading || isSending || isRecording || isTranscribing}
            title="Upload Document (PDF, DOCX, TXT, XLSX, CSV)"
            className="p-2.5 rounded-xl text-slate-400 hover:text-brand-400 hover:bg-slate-800/80 transition-colors disabled:opacity-40"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>

          {/* Dynamic Voice Recording Bar OR Expanding Textarea */}
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 py-2 px-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-xs font-mono font-medium text-red-400">
                  {formatDuration(recordDuration)}
                </span>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <span className="text-xs text-slate-300 font-medium">Listening... Speak now</span>
                {/* Voice waveform simulation */}
                <div className="flex items-center gap-0.5 ml-2">
                  <span className="w-1 h-3 bg-red-400/80 rounded-full animate-pulse"></span>
                  <span className="w-1 h-5 bg-red-400 rounded-full animate-pulse delay-75"></span>
                  <span className="w-1 h-2 bg-red-400/60 rounded-full animate-pulse delay-150"></span>
                  <span className="w-1 h-4 bg-red-400/90 rounded-full animate-pulse delay-100"></span>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelRecording}
                title="Cancel recording"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending || isTranscribing || disabled}
              placeholder={
                isTranscribing
                  ? 'Transcribing audio with Whisper...'
                  : 'Ask any question about global warming or your documents...'
              }
              className="flex-1 bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:ring-0 resize-none py-2.5 px-2 max-h-44 focus:outline-none"
            />
          )}

          {/* Voice Input Button */}
          {isRecording ? (
            <button
              type="button"
              onClick={stopRecording}
              title="Stop and transcribe"
              className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center animate-pulse"
            >
              <Square className="w-4 h-4 fill-white" />
            </button>
          ) : isTranscribing ? (
            <div className="p-2.5 rounded-xl bg-slate-800 text-brand-400 flex items-center justify-center" title="Transcribing...">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={isSending || isUploading || disabled}
              title="Speak your question (Groq Whisper)"
              className="p-2.5 rounded-xl text-slate-400 hover:text-brand-400 hover:bg-slate-800/80 transition-all disabled:opacity-40"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}

          {/* Send Button */}
          {!isRecording && (
            <button
              type="submit"
              disabled={!text.trim() || isSending || isUploading || isTranscribing || disabled}
              title="Send message"
              className={`p-2.5 rounded-xl flex items-center justify-center transition-all ${
                text.trim() && !isSending && !isUploading && !isTranscribing
                  ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-glow active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

