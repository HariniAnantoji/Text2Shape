'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';

interface SaveDialogProps {
  darkMode: boolean;
  defaultName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export function SaveDialog({ darkMode, defaultName, onSave, onClose }: SaveDialogProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const theme = {
    overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
    modal: darkMode
      ? 'bg-slate-900 border-slate-700 text-slate-100'
      : 'bg-white border-slate-200 text-slate-900',
    input: darkMode
      ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400',
    btn: darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className={theme.overlay} onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-4 ${theme.modal}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Save className="w-4 h-4 text-cyan-500" />
            Save project
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg border ${theme.btn}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className={`block text-xs font-mono ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Project name
            <input
              ref={inputRef}
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500 ${theme.input}`}
              placeholder="My baseplate design"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition ${theme.btn}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-40 hover:opacity-90 transition"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
