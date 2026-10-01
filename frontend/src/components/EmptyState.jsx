import React from 'react';
import { Sparkles, UploadCloud, FileText, CheckCircle2, Globe, FileSpreadsheet } from 'lucide-react';

export default function EmptyState({ onSelectPrompt, onTriggerUpload, activeFilename, chunksCreated, hasCustomDoc }) {
  const examplePrompts = [
    "What are the primary causes of global greenhouse gas emissions?",
    "How does deforestation specifically affect the carbon cycle?",
    "Summarize the key practical solutions outlined for climate mitigation.",
    "What are the agricultural practices contributing to methane and nitrous oxide?"
  ];

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-center select-none">
      {/* Icon and Title */}
      <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-brand-600/30 to-cyan-500/20 border border-brand-500/30 shadow-glow mb-4">
        <Sparkles className="w-8 h-8 text-brand-400" />
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
        ClimaMind RAG Intelligence
      </h2>
      <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto leading-relaxed">
        Ask a question below, or upload your own document to query customized context.
      </p>



      {/* Suggested Questions */}
      <div className="mt-8">
        <p className="text-xs uppercase font-semibold tracking-wider text-slate-400 mb-3">
          Click any question to ask immediately
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
          {examplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPrompt(prompt)}
              className="p-3 text-left rounded-xl glass-panel hover:bg-slate-800/80 border border-slate-800/80 hover:border-brand-500/40 text-xs text-slate-300 hover:text-white transition-all duration-200 shadow-sm hover:shadow-glow/50 active:scale-[0.99]"
            >
              "{prompt}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
