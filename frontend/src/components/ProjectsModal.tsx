'use client';

import React, { useRef, useState } from 'react';
import {
  X,
  FolderOpen,
  Trash2,
  Download,
  Upload,
  AlertCircle,
  Clock,
  Save,
} from 'lucide-react';
import type { SavedProject } from '../types';

interface ProjectsModalProps {
  projects: SavedProject[];
  darkMode: boolean;
  onClose: () => void;
  onLoad: (project: SavedProject) => void;
  onDelete: (id: string) => void;
  onExport: (project: SavedProject) => void;
  onImportFile: (file: File) => void;
  importError: string | null;
}

export function ProjectsModal({
  projects,
  darkMode,
  onClose,
  onLoad,
  onDelete,
  onExport,
  onImportFile,
  importError,
}: ProjectsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const theme = {
    overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
    modal: darkMode
      ? 'bg-slate-900 border-slate-700 text-slate-100'
      : 'bg-white border-slate-200 text-slate-900',
    header: darkMode ? 'border-slate-800' : 'border-slate-200',
    card: darkMode
      ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800'
      : 'bg-slate-50 border-slate-200 hover:bg-slate-100',
    subText: darkMode ? 'text-slate-400' : 'text-slate-500',
    btn: darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
    danger: 'text-rose-400 hover:text-rose-300',
    input: darkMode
      ? 'bg-slate-950 border-slate-700 text-slate-100'
      : 'bg-white border-slate-300 text-slate-900',
  };

  return (
    <div className={theme.overlay} onClick={onClose}>
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col ${theme.modal}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${theme.header}`}>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <FolderOpen className="w-4 h-4 text-cyan-500" />
            Saved Projects
          </div>
          <div className="flex items-center gap-2">
            {/* Import JSON button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${theme.btn}`}
            >
              <Upload className="w-3.5 h-3.5" /> Import .json
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) onImportFile(file);
                e.currentTarget.value = '';
              }}
            />
            <button onClick={onClose} className={`p-1.5 rounded-lg ${theme.btn}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Import error */}
        {importError && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {importError}
          </div>
        )}

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {projects.length === 0 ? (
            <div className={`text-center py-12 text-sm ${theme.subText}`}>
              <Save className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No saved projects yet.</p>
              <p className="text-xs mt-1">Use the Save button in the header to save your current design.</p>
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className={`rounded-xl border px-4 py-3 transition ${theme.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{project.name}</p>
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] font-mono ${theme.subText}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(project.savedAt).toLocaleString()}
                      </span>
                      <span>{project.history.length} revision{project.history.length !== 1 ? 's' : ''}</span>
                      <span>{project.messages.filter((m) => m.sender === 'user').length} chat message{project.messages.filter((m) => m.sender === 'user').length !== 1 ? 's' : ''}</span>
                      {project.importedMesh && (
                        <span className="text-amber-400">⚠ Has imported STL (needs re-upload)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onExport(project)}
                      title="Export as JSON"
                      className={`p-1.5 rounded-lg border text-xs transition ${theme.btn}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteId === project.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onDelete(project.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1.5 rounded-lg border border-rose-500/50 bg-rose-950/40 text-xs text-rose-300 font-semibold hover:bg-rose-900/50 transition"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className={`p-1.5 rounded-lg border text-xs transition ${theme.btn}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(project.id)}
                        title="Delete"
                        className={`p-1.5 rounded-lg border text-xs transition ${theme.btn} ${theme.danger}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onLoad(project)}
                      className="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/15 text-xs text-cyan-400 font-semibold hover:bg-cyan-500/25 transition"
                    >
                      Load
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={`px-5 py-3 border-t text-[11px] ${theme.subText} ${theme.header}`}>
          Projects are stored in your browser. Export as JSON to back them up or move them to another device.
        </div>
      </div>
    </div>
  );
}
