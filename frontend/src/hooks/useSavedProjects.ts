import { useCallback, useState } from 'react';
import type { SavedProject } from '../types';

const STORAGE_KEY = 'text2shape_projects';

function readFromStorage(): SavedProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedProject[]) : [];
  } catch {
    return [];
  }
}

function writeToStorage(projects: SavedProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

export function useSavedProjects() {
  const [projects, setProjects] = useState<SavedProject[]>(() => readFromStorage());

  const saveProject = useCallback((project: SavedProject) => {
    setProjects((prev) => {
      // Replace if same ID, otherwise prepend
      const exists = prev.some((p) => p.id === project.id);
      const next = exists
        ? prev.map((p) => (p.id === project.id ? project : p))
        : [project, ...prev];
      writeToStorage(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  const exportProject = useCallback((project: SavedProject) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.text2shape.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importProjectFile = useCallback(
    (file: File): Promise<SavedProject> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed: unknown = JSON.parse(event.target?.result as string);
            if (
              typeof parsed !== 'object' ||
              parsed === null ||
              !('id' in parsed) ||
              !('name' in parsed) ||
              !('history' in parsed)
            ) {
              reject(new Error('File does not look like a Text2Shape project.'));
              return;
            }
            const project = parsed as SavedProject;
            // Give it a fresh ID so it doesn't silently overwrite an existing save
            const imported: SavedProject = {
              ...project,
              id: Date.now().toString(16) + Math.random().toString(16).slice(2, 8),
              name: `${project.name} (imported)`,
              savedAt: new Date().toISOString(),
            };
            resolve(imported);
          } catch {
            reject(new Error('Could not parse the selected file.'));
          }
        };
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsText(file);
      }),
    [],
  );

  return { projects, saveProject, deleteProject, exportProject, importProjectFile };
}
