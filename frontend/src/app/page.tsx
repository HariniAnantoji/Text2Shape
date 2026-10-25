"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BlueprintView } from '../components/BlueprintView';
import { ProjectsModal } from '../components/ProjectsModal';
import { SaveDialog } from '../components/SaveDialog';
import { ThreeViewport } from '../components/ThreeViewport';
import { useSavedProjects } from '../hooks/useSavedProjects';
import { INITIAL_MESSAGES, MATERIALS, QUICK_PROMPT_PILLS } from '../textToShapeData';
import type { CadParams, ChatMessage, GenerateResponse, HoleFeature, ImportedMesh, MaterialKey, ModelArtifacts, ModelVersion, PrimitiveFeature, SavedProject } from '../types';
import { 
  Box, 
  Cpu, 
  Code, 
  Eye, 
  Sparkles, 
  Sun, 
  Moon, 
  Grid, 
  Sliders, 
  FileText, 
  Ruler, 
  Loader2, 
  Compass,
  Copy,
  Check,
  Download,
  Terminal,
  Send,
  MessageSquare,
  History,
  Bot,
  User,
  ChevronDown,
  Plus,
  Trash2,
  Save,
  FolderOpen,
} from 'lucide-react';

// --- MAIN APP COMPONENT ---
export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('3d');

  // Saved Projects
  const { projects, saveProject, deleteProject, exportProject, importProjectFile } = useSavedProjects();
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectImportError, setProjectImportError] = useState<string | null>(null);
  const [savedBadge, setSavedBadge] = useState(false); // brief "Saved!" flash

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [modelArtifacts, setModelArtifacts] = useState<ModelArtifacts | null>(null);
  const [importedMesh, setImportedMesh] = useState<ImportedMesh | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [activeVersion, setActiveVersion] = useState('v1.0');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const nextMessageId = useRef(4);

  // Model Version History
  const [history, setHistory] = useState<ModelVersion[]>([
    {
      version: 'v1.0',
      title: 'Initial Baseplate',
      time: '10:43 AM',
      cadParams: {
        length: 100,
        width: 60,
        thickness: 8,
        holeDiameter: 6,
        edgeOffset: 10,
        x: 0,
        y: 0,
        z: 0,
      },
      features: [],
      holes: [],
      importedMesh: null,
      artifacts: null,
    },
  ]);

  // Viewport Settings
  const units = 'mm';
  const [copiedCode, setCopiedCode] = useState(false);
  const [materialKey, setMaterialKey] = useState<MaterialKey>('steel');
  const [wireframe, setWireframe] = useState(false);
  const [xrayMode, setXrayMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Dynamic CAD Parameters
  const [cadParams, setCadParams] = useState<CadParams>({
    length: 100,
    width: 60,
    thickness: 8,
    holeDiameter: 6,
    edgeOffset: 10,
    x: 0,
    y: 0,
    z: 0,
  });
  const [features, setFeatures] = useState<PrimitiveFeature[]>([]);
  const [holes, setHoles] = useState<HoleFeature[]>([]);
  const [primitiveShape, setPrimitiveShape] = useState<'box' | 'cylinder' | 'sphere'>('box');
  const [primitiveDraft, setPrimitiveDraft] = useState({
    length: 20,
    width: 20,
    height: 20,
    diameter: 20,
    x: 0,
    y: 0,
    z: 10,
  });

  // Dynamic Metrics Calculation
  const metrics = useMemo(() => {
    const holeRadius = cadParams.holeDiameter / 2;
    const baseplateVolume = (
      (cadParams.length * cadParams.width - 4 * Math.PI * holeRadius ** 2)
      * cadParams.thickness
    ) - holes.reduce((volume, hole) => volume + Math.PI * (hole.diameter / 2) ** 2 * cadParams.thickness, 0);
    const featureVolume = features.reduce((total, feature) => {
      if (feature.shape === 'box') return total + feature.length * feature.width * feature.height;
      if (feature.shape === 'cylinder') {
        return total + Math.PI * (feature.diameter / 2) ** 2 * feature.height;
      }
      return total + (4 / 3) * Math.PI * (feature.diameter / 2) ** 3;
    }, 0);
    const volume = ((baseplateVolume + featureVolume) / 1000).toFixed(2);
    const mass = (Number(volume) * 7.85).toFixed(1);
    const boundingBox = `${cadParams.length} x ${cadParams.width} x ${cadParams.thickness} ${units}`;
    return { volume, mass, boundingBox };
  }, [cadParams, features, holes, units]);

  const primitiveScript = features.map((feature, index) => {
    if (feature.shape === 'box') {
      return `\n# Added box ${index + 1}\nresult = result + Pos(${feature.x}, ${feature.y}, ${feature.z}) * Box(${feature.length}, ${feature.width}, ${feature.height}, align=(Align.CENTER, Align.CENTER, Align.CENTER))`;
    }
    if (feature.shape === 'cylinder') {
      return `\n# Added cylinder ${index + 1}\nresult = result + Pos(${feature.x}, ${feature.y}, ${feature.z}) * Cylinder(${feature.diameter / 2}, ${feature.height}, align=(Align.CENTER, Align.CENTER, Align.CENTER))`;
    }
    return `\n# Added sphere ${index + 1}\nresult = result + Pos(${feature.x}, ${feature.y}, ${feature.z}) * Sphere(${feature.diameter / 2})`;
  }).join('\n');

  const importedMeshScript = importedMesh
    ? `\n# Imported mesh: ${importedMesh.filename}\n# A triangulated STL mesh is not a B-rep solid, so it is merged into the STL\n# output only. The STEP export above stays solid (baseplate + primitives).\nimported = import_stl("${importedMesh.filename}")\nimported_bounds = imported.bounding_box()\nimported = Pos(-(imported_bounds.min.X + imported_bounds.max.X) / 2, -(imported_bounds.min.Y + imported_bounds.max.Y) / 2, -(imported_bounds.min.Z + imported_bounds.max.Z) / 2) * imported\nimported = imported.scale(${importedMesh.scale_factor})\nimported = Pos(${importedMesh.x}, ${importedMesh.y}, ${importedMesh.z}) * imported\nstl_model = Compound(children=[result, imported])`
    : '';

  const generatedScript = `from build123d import Align, Box, Compound, Cylinder, Pos, Sphere, export_step, export_stl, import_stl

# Baseplate parameters for ${activeVersion}
length = ${cadParams.length}  # ${units}
width = ${cadParams.width}  # ${units}
thickness = ${cadParams.thickness}  # ${units}
hole_diameter = ${cadParams.holeDiameter}  # ${units}
edge_offset = ${cadParams.edgeOffset}  # ${units}

baseplate_x = ${cadParams.x}
baseplate_y = ${cadParams.y}
baseplate_z = ${cadParams.z}
result = Pos(baseplate_x, baseplate_y, baseplate_z) * Box(length, width, thickness, align=(Align.CENTER, Align.CENTER, Align.CENTER))
hole_x = length / 2 - edge_offset
hole_y = width / 2 - edge_offset
for x in (-hole_x, hole_x):
    for y in (-hole_y, hole_y):
        cutter = Pos(baseplate_x + x, baseplate_y + y, baseplate_z) * Cylinder(
            hole_diameter / 2,
            thickness + 2,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        result -= cutter
${primitiveScript}
${holes.map((hole, index) => `\n# Extra through-hole ${index + 1}\nresult = result - Pos(${hole.x}, ${hole.y}, baseplate_z) * Cylinder(${hole.diameter / 2}, thickness + 2, align=(Align.CENTER, Align.CENTER, Align.CENTER))`).join('')}
${importedMeshScript}

export_step(result, "baseplate.step")
export_stl(${importedMesh ? 'stl_model' : 'result'}, "baseplate.stl")
`;

  // Auto-scroll Chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const updateCadParam = (key: keyof CadParams, value: number) => {
    if (!Number.isFinite(value)) {
      setEditorError('Enter a valid number for the baseplate.');
      return;
    }
    if ((key === 'x' || key === 'y' || key === 'z') && (value < -500 || value > 500)) {
      setEditorError('Baseplate position must be between -500 and 500 mm.');
      return;
    }
    setEditorError(null);
    setCadParams((current) => {
      const next = { ...current, [key]: value };
      const maxEdgeOffset = Math.min(next.length, next.width) / 2 - 1;
      next.edgeOffset = Math.min(next.edgeOffset, maxEdgeOffset);
      next.holeDiameter = Math.min(next.holeDiameter, next.edgeOffset * 2);
      return next;
    });
    setModelArtifacts(null);
  };

  const handleStlLoadError = useCallback((detail: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId.current++,
        sender: 'ai',
        text: `The STL could not be loaded in the viewport: ${detail}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        version: null,
      },
    ]);
  }, []);

  const handleImportStl = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setImportError('STL files must be 25 MB or smaller.');
      return;
    }
    setImportError(null);
    setIsImporting(true);
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/imports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Filename': file.name,
        },
        body: file,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(errorBody?.detail ?? `Upload failed (${response.status})`);
      }
      const uploadedMesh: ImportedMesh = await response.json();
      setImportedMesh(uploadedMesh);
      setModelArtifacts(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to upload this STL file.');
    } finally {
      setIsImporting(false);
    }
  };

  const updateImportedMesh = (key: 'x' | 'y' | 'z' | 'scale_factor', value: number) => {
    if (!Number.isFinite(value)) return;
    const min = key === 'scale_factor' ? 0.01 : -5000;
    const max = key === 'scale_factor' ? 100 : 5000;
    if (value < min || value > max || !importedMesh) return;
    setImportedMesh({ ...importedMesh, [key]: value });
    setModelArtifacts(null);
  };

  // Save / Load / Export handlers
  const handleSaveProject = (name: string) => {
    const project: SavedProject = {
      id: Date.now().toString(16) + Math.random().toString(16).slice(2, 8),
      name,
      savedAt: new Date().toISOString(),
      activeVersion,
      cadParams,
      features,
      holes,
      importedMesh,
      modelArtifacts,
      history,
      messages,
      materialKey,
      wireframe,
      xrayMode,
      showGrid,
      showDimensions,
    };
    saveProject(project);
    setShowSaveDialog(false);
    setSavedBadge(true);
    window.setTimeout(() => setSavedBadge(false), 2000);
  };

  const handleLoadProject = (project: SavedProject) => {
    setActiveVersion(project.activeVersion);
    setCadParams(project.cadParams);
    setFeatures(project.features);
    setHoles(project.holes);
    setImportedMesh(project.importedMesh);
    setModelArtifacts(project.modelArtifacts);
    setHistory(project.history);
    setMessages(project.messages);
    setMaterialKey(project.materialKey);
    setWireframe(project.wireframe);
    setXrayMode(project.xrayMode);
    setShowGrid(project.showGrid);
    setShowDimensions(project.showDimensions);
    // Reset transient UI state
    setEditorError(null);
    setImportError(null);
    setShowProjectsModal(false);
  };

  const handleImportProjectFile = async (file: File) => {
    setProjectImportError(null);
    try {
      const project = await importProjectFile(file);
      saveProject(project);
      // Immediately load the imported project
      handleLoadProject(project);
    } catch (error) {
      setProjectImportError(error instanceof Error ? error.message : 'Could not import file.');
    }
  };

  // Handle Prompt Submission
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? inputPrompt).trim();
    if (!query.trim() || isGenerating) return;

    const userMsg: ChatMessage = {
      id: nextMessageId.current++,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      version: null
    };

    setMessages((prev) => [...prev, userMsg]);
    if (textToSend === undefined) setInputPrompt('');
    setIsGenerating(true);
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          cad_params: {
            length: cadParams.length,
            width: cadParams.width,
            thickness: cadParams.thickness,
            hole_diameter: cadParams.holeDiameter,
            edge_offset: cadParams.edgeOffset,
            x: cadParams.x,
            y: cadParams.y,
            z: cadParams.z,
          },
          features,
          holes,
          imported_mesh: importedMesh
            ? {
                id: importedMesh.id,
                filename: importedMesh.filename,
                length: importedMesh.length,
                width: importedMesh.width,
                height: importedMesh.height,
                x: importedMesh.x,
                y: importedMesh.y,
                z: importedMesh.z,
                scale_factor: importedMesh.scale_factor,
              }
            : null,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(errorBody?.detail ?? `API request failed (${response.status})`);
      }

      const result: GenerateResponse = await response.json();
      if (result.status !== 'generated') {
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId.current++,
            sender: 'ai',
            text: result.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            version: null,
          },
        ]);
        return;
      }
      if (!result.files?.stl_url || !result.files.step_url) {
        throw new Error('API response is missing the generated STL or STEP file URL');
      }

      const returnedParams: CadParams = {
        length: result.cad_params.length,
        width: result.cad_params.width,
        thickness: result.cad_params.thickness,
        holeDiameter: result.cad_params.hole_diameter,
        edgeOffset: result.cad_params.edge_offset,
        x: result.cad_params.x ?? cadParams.x,
        y: result.cad_params.y ?? cadParams.y,
        z: result.cad_params.z ?? cadParams.z,
      };
      const returnedFeatures = result.features ?? features;
      const returnedHoles = result.holes ?? holes;
      const returnedImportedMesh = result.imported_mesh ?? null;
      const version = `v1.${history.length}`;
      const generatedArtifacts = {
        stlUrl: result.files.stl_url,
        stepUrl: result.files.step_url,
      };
      setCadParams(returnedParams);
      setFeatures(returnedFeatures);
      setHoles(returnedHoles);
      setImportedMesh(returnedImportedMesh);
      setModelArtifacts(generatedArtifacts);
      setHistory((previous) => [
        {
          version,
          title: query.slice(0, 24),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cadParams: returnedParams,
          features: returnedFeatures,
          holes: returnedHoles,
          importedMesh: returnedImportedMesh,
          artifacts: generatedArtifacts,
        },
        ...previous,
      ]);
      setActiveVersion(version);
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId.current++,
          sender: 'ai',
          text: result.message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          version,
        },
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId.current++,
          sender: 'ai',
          text: `Unable to complete the API request: ${detail}. Check that FastAPI is running at the configured API URL.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          version: null,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const [copyError, setCopyError] = useState(false);
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopyError(false);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
      setCopyError(true);
    }
  };

  const addPrimitive = () => {
    if (features.length >= 20 || !primitiveDraftValid) return;
    const id = crypto.randomUUID();
    const placement = { id, x: primitiveDraft.x, y: primitiveDraft.y, z: primitiveDraft.z };
    let feature: PrimitiveFeature;
    if (primitiveShape === 'box') {
      feature = {
        ...placement,
        shape: 'box',
        length: primitiveDraft.length,
        width: primitiveDraft.width,
        height: primitiveDraft.height,
      };
    } else if (primitiveShape === 'cylinder') {
      feature = {
        ...placement,
        shape: 'cylinder',
        diameter: primitiveDraft.diameter,
        height: primitiveDraft.height,
      };
    } else {
      feature = { ...placement, shape: 'sphere', diameter: primitiveDraft.diameter };
    }
    setFeatures((current) => [...current, feature]);
    setModelArtifacts(null);
  };

  const removePrimitive = (id: string) => {
    setFeatures((current) => current.filter((feature) => feature.id !== id));
    setModelArtifacts(null);
  };

  const updatePrimitive = (
    id: string,
    field: 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'diameter',
    value: number,
  ) => {
    const currentFeature = features.find((feature) => feature.id === id);
    if (!currentFeature) return;
    const updatedFeature = { ...currentFeature, [field]: value } as PrimitiveFeature;
    const validPosition = [updatedFeature.x, updatedFeature.y, updatedFeature.z]
      .every((value) => Number.isFinite(value) && value >= -500 && value <= 500);
    const dimensions = updatedFeature.shape === 'box'
      ? [updatedFeature.length, updatedFeature.width, updatedFeature.height]
      : updatedFeature.shape === 'cylinder'
        ? [updatedFeature.diameter, updatedFeature.height]
        : [updatedFeature.diameter];
    if (!validPosition || !dimensions.every((value) => Number.isFinite(value) && value > 0 && value <= 500)) {
      setEditorError('Primitive dimensions must be greater than 0 and at most 500 mm; positions must be between -500 and 500 mm.');
      return;
    }
    setEditorError(null);
    setFeatures((current) => current.map((feature) => (
      feature.id === id ? updatedFeature : feature
    )));
    setModelArtifacts(null);
  };

  const primitiveDraftValid = [primitiveDraft.x, primitiveDraft.y, primitiveDraft.z]
    .every((value) => Number.isFinite(value) && value >= -500 && value <= 500)
    && (primitiveShape === 'box'
      ? [primitiveDraft.length, primitiveDraft.width, primitiveDraft.height]
        .every((value) => Number.isFinite(value) && value > 0 && value <= 500)
      : [primitiveDraft.diameter].every((value) => Number.isFinite(value) && value > 0 && value <= 500)
        && (primitiveShape !== 'cylinder'
          || (Number.isFinite(primitiveDraft.height) && primitiveDraft.height > 0 && primitiveDraft.height <= 500)));

  const theme = {
    bg: darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900',
    headerBg: darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200',
    panelBg: darkMode ? 'bg-slate-900/40 border-slate-800/80' : 'bg-slate-100/70 border-slate-200',
    cardBg: darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
    innerInputBg: darkMode ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400',
    pillBg: darkMode ? 'bg-slate-800/80 hover:bg-cyan-950/60 hover:text-cyan-300 border-slate-700/60 text-slate-300' : 'bg-white hover:bg-cyan-50 hover:text-cyan-700 border-slate-300 text-slate-700 shadow-sm',
    chatAiMsg: darkMode ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm',
    chatUserMsg: darkMode ? 'bg-cyan-600/20 border-cyan-500/40 text-slate-100' : 'bg-cyan-500 text-white border-cyan-600',
    subText: darkMode ? 'text-slate-400' : 'text-slate-500',
    border: darkMode ? 'border-slate-800' : 'border-slate-200',
  };

  return (
    <div className={`h-screen flex flex-col font-sans transition-colors duration-300 ${theme.bg}`}>
      
      {/* TOP HEADER NAVBAR */}
      <header className={`h-14 border-b ${theme.headerBg} backdrop-blur-md px-4 flex items-center justify-between z-30 shrink-0 transition-colors duration-300`}>
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20">
            <Cpu className="w-5 h-5 font-bold" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-extrabold tracking-tight text-base bg-clip-text text-transparent bg-gradient-to-r ${darkMode ? 'from-cyan-400 via-teal-300 to-emerald-400' : 'from-cyan-600 via-teal-600 to-emerald-600'}`}>
              Text to Shape
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${darkMode ? 'bg-cyan-950 text-cyan-400 border-cyan-800/50' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
              B-Rep Kernel v3.2
            </span>
          </div>
        </div>

        {/* Top Controls & Light/Dark Switcher */}
        <div className="flex items-center space-x-3">
          <div className={`hidden md:flex items-center gap-2 text-xs font-mono px-3 py-1 rounded-full border ${darkMode ? 'bg-slate-800/50 text-slate-400 border-slate-700/50' : 'bg-slate-200/60 text-slate-600 border-slate-300'}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>GPU Mesh Engine Active</span>
          </div>

          {/* Projects button */}
          <button
            onClick={() => { setShowProjectsModal(true); setProjectImportError(null); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
            }`}
            title="Open saved projects"
          >
            <FolderOpen className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-[11px]">Projects</span>
            {projects.length > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-cyan-900 text-cyan-300' : 'bg-cyan-100 text-cyan-700'}`}>
                {projects.length}
              </span>
            )}
          </button>

          {/* Save button */}
          <button
            onClick={() => setShowSaveDialog(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              savedBadge
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
            }`}
            title="Save current project"
          >
            {savedBadge ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-[11px]">Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-cyan-400" />
                <span className="font-mono text-[11px]">Save</span>
              </>
            )}
          </button>

          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              darkMode 
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300' 
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
            }`}
            title="Toggle Light or Dark Mode"
          >
            {darkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                <span className="font-mono text-[11px] text-slate-200">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600 fill-indigo-600/20" />
                <span className="font-mono text-[11px] text-slate-700">Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE SPLIT LAYOUT */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* LEFT COLUMN: CHAT PANEL & REVISION HISTORY */}
        <div className={`w-full md:w-[420px] border-r ${theme.panelBg} flex flex-col h-full shrink-0 z-20 transition-colors duration-300`}>
          
          <div className={`p-3 border-b ${theme.border} ${darkMode ? 'bg-slate-900/60' : 'bg-white/60'} flex items-center justify-between`}>
            <div className={`flex items-center gap-2 text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <MessageSquare className="w-4 h-4 text-cyan-500" />
              <span>Design Assistant</span>
            </div>
            
            <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md border ${darkMode ? 'bg-slate-800 text-cyan-300 border-slate-700' : 'bg-slate-100 text-cyan-700 border-slate-300'}`}>
              <History className="w-3.5 h-3.5 text-cyan-500" />
              <span>Active: {activeVersion}</span>
            </div>
          </div>

          {/* Quick Modifier Pills */}
          <div className={`p-2.5 border-b ${theme.border} ${darkMode ? 'bg-slate-900/20' : 'bg-slate-100/40'}`}>
            <div className={`text-[11px] font-mono ${theme.subText} mb-1.5 flex items-center gap-1`}>
              <Sparkles className="w-3 h-3 text-cyan-500" /> Quick Modifiers:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPT_PILLS.map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(pill)}
                  disabled={isGenerating}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all font-mono disabled:opacity-50 text-left ${theme.pillBg}`}
                >
                  + {pill}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold shrink-0 shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className="max-w-[85%] space-y-2">
                  <div className={`p-3.5 rounded-2xl border ${msg.sender === 'user' ? `${theme.chatUserMsg} rounded-tr-none` : `${theme.chatAiMsg} rounded-tl-none`}`}>
                    <p className="leading-relaxed">{msg.text}</p>

                    {msg.changes && (
                      <div className={`mt-2.5 pt-2 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'} space-y-1`}>
                        <span className={`text-[10px] font-mono ${darkMode ? 'text-cyan-400' : 'text-cyan-700'} uppercase tracking-wider font-bold block`}>Applied B-Rep Operations:</span>
                        {msg.changes.map((change, cIdx) => (
                          <div key={cIdx} className={`flex items-center gap-1.5 text-[11px] font-mono ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            <Check className="w-3 h-3 shrink-0" />
                            <span>{change}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 text-[10px] font-mono ${theme.subText} px-1 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span>{msg.timestamp}</span>
                    {msg.version && (
                      <span className={`px-1.5 py-0.5 rounded border ${darkMode ? 'bg-cyan-950 text-cyan-400 border-cyan-800/50' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
                        {msg.version}
                      </span>
                    )}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold shrink-0 border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className={`p-3.5 rounded-2xl border ${theme.cardBg} space-y-2 animate-pulse`}>
                <div className="flex items-center gap-2 text-cyan-500 font-mono font-semibold text-[11px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Waiting for API response...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Timeline Drawer */}
          <div className={`px-4 py-2 border-t ${theme.border} ${darkMode ? 'bg-slate-900/90' : 'bg-white'}`}>
            <details className="group">
              <summary className={`flex items-center justify-between text-[11px] font-mono ${theme.subText} cursor-pointer list-none py-1`}>
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-cyan-500" /> Revision Timeline ({history.length})
                </span>
                <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
                {history.map((item) => (
                  <button
                    key={item.version}
                    onClick={() => {
                      setActiveVersion(item.version);
                      setCadParams(item.cadParams);
                      setFeatures(item.features);
                      setHoles(item.holes);
                      setImportedMesh(item.importedMesh ?? null);
                      setModelArtifacts(item.artifacts);
                    }}
                    className={`w-full p-1.5 rounded-lg text-left text-[11px] font-mono flex items-center justify-between border transition ${
                      activeVersion === item.version 
                        ? (darkMode ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300' : 'bg-cyan-50 border-cyan-300 text-cyan-800')
                        : (darkMode ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200')
                    }`}
                  >
                    <span className="font-bold">{item.version}</span>
                    <span className="truncate max-w-[150px]">{item.title}</span>
                    <span className="text-[10px] opacity-70">{item.time}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>

          {/* Chat Input */}
          <div className={`p-3 border-t ${theme.border} ${darkMode ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur-md`}>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Add a box, drill a hole, move a feature, or change its size..."
                  disabled={isGenerating}
                  className={`w-full py-2.5 px-3.5 rounded-xl border text-xs outline-none transition font-mono disabled:opacity-50 ${theme.innerInputBg}`}
                />
              </div>
              <button
                type="submit"
                disabled={isGenerating || !inputPrompt.trim()}
                className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:opacity-90 transition font-bold disabled:opacity-40 shadow-lg shadow-cyan-500/20 shrink-0"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN: 3D VIEWPORT & CAD WORKBENCH */}
        <div className={`flex-1 flex flex-col relative overflow-hidden min-h-[400px] transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
          
          <div className={`h-12 border-b ${theme.border} ${darkMode ? 'bg-slate-900/60' : 'bg-white/60'} px-4 flex items-center justify-between shrink-0 z-10`}>
            <div className={`flex space-x-1 p-1 rounded-lg border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-200/60 border-slate-300'}`}>
              <button
                onClick={() => setActiveTab('3d')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === '3d' 
                    ? (darkMode ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white text-cyan-700 border border-slate-300 shadow-sm')
                    : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Box className="w-3.5 h-3.5" /> 3D Canvas
              </button>
              <button
                onClick={() => setActiveTab('2d')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === '2d' 
                    ? (darkMode ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white text-cyan-700 border border-slate-300 shadow-sm')
                    : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> 2D Blueprint
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'code' 
                    ? (darkMode ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white text-cyan-700 border border-slate-300 shadow-sm')
                    : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Code & STEP Export
              </button>
            </div>

            {/* Material Picker */}
            {activeTab === '3d' && (
              <div className="flex items-center gap-2">
                <span className={`hidden sm:inline text-[11px] font-mono ${theme.subText}`}>Material:</span>
                {(Object.keys(MATERIALS) as MaterialKey[]).map((key) => {
                  const swatch = `#${(darkMode ? MATERIALS[key].colorDark : MATERIALS[key].colorLight)
                    .toString(16)
                    .padStart(6, '0')}`;
                  return (
                    <button
                      key={key}
                      onClick={() => setMaterialKey(key)}
                      title={MATERIALS[key].name}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border transition ${
                        materialKey === key
                          ? (darkMode ? 'bg-slate-700 border-cyan-400 text-cyan-300' : 'bg-white border-cyan-600 text-cyan-800 shadow-sm')
                          : (darkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800' : 'bg-slate-200/50 border-slate-300 text-slate-600 hover:bg-slate-200')
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: swatch }}
                      />
                      <span className="hidden md:inline">{MATERIALS[key].name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* VIEWPORT CONTENT */}
          <div className="flex-1 relative">
            
            {/* VIEWPORT TAB 1: 3D CANVAS */}
            {activeTab === '3d' && (
              <>
                <ThreeViewport 
                  cadParams={cadParams}
                  features={features}
                  holes={holes}
                  importedMesh={importedMesh}
                  stlUrl={modelArtifacts?.stlUrl ?? importedMesh?.source_url ?? null}
                  isGeneratedModel={modelArtifacts !== null}
                  materialKey={materialKey}
                  wireframe={wireframe}
                  xrayMode={xrayMode}
                  showGrid={showGrid}
                  showDimensions={showDimensions}
                  darkMode={darkMode}
                  onStlLoadError={handleStlLoadError}
                />

                {/* Stale model notice */}
                {importedMesh && !modelArtifacts && (
                  <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono shadow-xl backdrop-blur-md ${darkMode ? 'bg-amber-950/90 border-amber-700/60 text-amber-300' : 'bg-amber-50/90 border-amber-300 text-amber-700'}`}>
                    <Loader2 className="w-3.5 h-3.5 shrink-0" />
                    Live preview — send a chat message or click &ldquo;Generate current design&rdquo; to merge the imported mesh into an exportable model.
                  </div>
                )}

                {/* Viewport Controls */}
                <div className={`absolute top-4 left-4 p-1.5 rounded-xl border flex flex-wrap gap-1 shadow-2xl z-20 backdrop-blur-md ${theme.cardBg}`}>
                  <button 
                    onClick={() => setWireframe(!wireframe)}
                    className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition ${wireframe ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' : `${theme.subText} hover:bg-slate-500/10`}`}
                    title="Toggle Wireframe Overlay"
                  >
                    <Grid className="w-3.5 h-3.5" /> Wireframe
                  </button>
                  <button 
                    onClick={() => setXrayMode(!xrayMode)}
                    className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition ${xrayMode ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' : `${theme.subText} hover:bg-slate-500/10`}`}
                    title="X-Ray Opacity"
                  >
                    <Eye className="w-3.5 h-3.5" /> X-Ray
                  </button>
                  <button 
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition ${showGrid ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' : `${theme.subText} hover:bg-slate-500/10`}`}
                    title="Toggle Datum Grid"
                  >
                    <Compass className="w-3.5 h-3.5" /> Datum Grid
                  </button>
                  <button 
                    onClick={() => setShowDimensions(!showDimensions)}
                    className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition ${showDimensions ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' : `${theme.subText} hover:bg-slate-500/10`}`}
                    title="Toggle Annotations"
                  >
                    <Ruler className="w-3.5 h-3.5" /> Annotations
                  </button>
                </div>

                {/* Dynamic Parameter Inspector */}
                <div className={`absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-y-auto p-3.5 rounded-2xl border space-y-3 z-20 shadow-2xl backdrop-blur-md ${theme.cardBg}`}>
                  <div className={`flex items-center justify-between text-xs font-semibold ${darkMode ? 'text-cyan-400' : 'text-cyan-700'} uppercase tracking-wider border-b ${theme.border} pb-2`}>
                    <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5" /> Baseplate Parameters</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Length:</span>
                        <span className="font-bold text-cyan-500">{cadParams.length} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        value={cadParams.length}
                        disabled={isGenerating}
                        onChange={(e) => updateCadParam('length', Number(e.target.value))}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Width:</span>
                        <span className="font-bold text-cyan-500">{cadParams.width} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="120"
                        value={cadParams.width}
                        disabled={isGenerating}
                        onChange={(e) => updateCadParam('width', Number(e.target.value))}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Thickness:</span>
                        <span className="font-bold text-cyan-500">{cadParams.thickness} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="25"
                        value={cadParams.thickness}
                        disabled={isGenerating}
                        onChange={(e) => updateCadParam('thickness', Number(e.target.value))}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>
                    <div>
                      <div className={theme.subText}>Baseplate position (mm)</div>
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                          <label key={axis} className={theme.subText}>
                            {axis.toUpperCase()}
                            <input
                              type="number"
                              min="-500"
                              max="500"
                              step="1"
                              value={cadParams[axis]}
                              disabled={isGenerating}
                              onChange={(event) => updateCadParam(axis, Number(event.target.value))}
                              className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Hole Diameter:</span>
                        <span className="font-bold text-cyan-500">{cadParams.holeDiameter} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max={Math.min(20, cadParams.edgeOffset * 2)}
                        step="0.5"
                        value={cadParams.holeDiameter}
                        disabled={isGenerating}
                        onChange={(e) => updateCadParam('holeDiameter', Number(e.target.value))}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Edge Offset:</span>
                        <span className="font-bold text-cyan-500">{cadParams.edgeOffset} {units}</span>
                      </div>
                      <input
                        type="range"
                        min={Math.ceil(cadParams.holeDiameter / 2)}
                        max={Math.max(1, Math.floor(Math.min(cadParams.length, cadParams.width) / 2) - 1)}
                        step="0.5"
                        value={cadParams.edgeOffset}
                        disabled={isGenerating}
                        onChange={(e) => updateCadParam('edgeOffset', Number(e.target.value))}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>
                  </div>

                  <div className={`pt-2 border-t ${theme.border} space-y-2 font-mono text-xs`}>
                    <div className={`font-semibold uppercase tracking-wider ${darkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>
                      Continue from an STL mesh
                    </div>
                    <label className={`block ${theme.subText}`}>
                      Import STL (max 25 MB)
                      <input
                        type="file"
                        accept=".stl,model/stl"
                        disabled={isGenerating || isImporting}
                        onChange={(event) => {
                          void handleImportStl(event.currentTarget.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                        className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                      />
                    </label>
                    {isImporting && <p className={theme.subText}>Uploading and validating mesh…</p>}
                    {importError && <p role="alert" className="text-rose-400">{importError}</p>}
                    {importedMesh && (
                      <div className={`space-y-2 rounded border p-2 ${theme.border}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-bold" title={importedMesh.filename}>
                            {importedMesh.filename}
                          </span>
                          <button
                            type="button"
                            aria-label="Remove imported STL"
                            disabled={isGenerating}
                            onClick={() => {
                              setImportedMesh(null);
                              setModelArtifacts(null);
                              setImportError(null);
                            }}
                            className="shrink-0 text-rose-400 hover:text-rose-300 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className={theme.subText}>Faceted mesh; move or scale it, then add CAD features in chat.</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <label key={axis} className={theme.subText}>
                              {axis.toUpperCase()} (mm)
                              <input
                                type="number"
                                min="-5000"
                                max="5000"
                                step="1"
                                value={importedMesh[axis]}
                                disabled={isGenerating}
                                onChange={(event) => updateImportedMesh(axis, Number(event.target.value))}
                                className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                              />
                            </label>
                          ))}
                        </div>
                        <label className={`block ${theme.subText}`}>
                          Uniform scale
                          <input
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.1"
                            value={importedMesh.scale_factor}
                            disabled={isGenerating}
                            onChange={(event) => updateImportedMesh('scale_factor', Number(event.target.value))}
                            className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className={`pt-2 border-t ${theme.border} space-y-2 font-mono text-xs`}>
                    <div className={`font-semibold uppercase tracking-wider ${darkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>
                      Add a primitive
                    </div>
                    <label className={`block ${theme.subText}`}>
                      Shape
                      <select
                        value={primitiveShape}
                        disabled={isGenerating || features.length >= 20}
                        onChange={(event) => setPrimitiveShape(event.target.value as 'box' | 'cylinder' | 'sphere')}
                        className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                      >
                        <option value="box">Box</option>
                        <option value="cylinder">Cylinder</option>
                        <option value="sphere">Sphere</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      {(primitiveShape === 'box'
                        ? [['length', 'Length'], ['width', 'Width'], ['height', 'Height']]
                        : primitiveShape === 'cylinder'
                          ? [['diameter', 'Diameter'], ['height', 'Height']]
                          : [['diameter', 'Diameter']]
                      ).map(([key, label]) => (
                        <label key={key} className={theme.subText}>
                          {label} (mm)
                          <input
                            type="number"
                            min="1"
                            max="500"
                            step="1"
                            value={primitiveDraft[key as keyof typeof primitiveDraft]}
                            disabled={isGenerating || features.length >= 20}
                            onChange={(event) => setPrimitiveDraft((draft) => ({
                              ...draft,
                              [key]: Number(event.target.value),
                            }))}
                            className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                          />
                        </label>
                      ))}
                    </div>

                    <div>
                      <div className={theme.subText}>Center position (mm)</div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                          <label key={axis} className={theme.subText}>
                            {axis.toUpperCase()}
                            <input
                              type="number"
                              min="-500"
                              max="500"
                              step="1"
                              value={primitiveDraft[axis]}
                              disabled={isGenerating || features.length >= 20}
                              onChange={(event) => setPrimitiveDraft((draft) => ({
                                ...draft,
                                [axis]: Number(event.target.value),
                              }))}
                              className={`mt-1 w-full rounded border px-2 py-1.5 ${theme.innerInputBg}`}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addPrimitive}
                      disabled={isGenerating || features.length >= 20 || !primitiveDraftValid}
                      className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2 py-1.5 font-bold text-cyan-500 disabled:opacity-50"
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" /> Add {primitiveShape}
                    </button>

                    {features.length > 0 && (
                      <div className="space-y-1">
                        {features.map((feature, index) => (
                          <div key={feature.id} className={`space-y-2 rounded border p-2 ${theme.border}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold">
                                {index + 1}. {feature.shape}
                              </span>
                              <button
                                type="button"
                                aria-label={`Remove ${feature.shape} ${index + 1}`}
                                disabled={isGenerating}
                                onClick={() => removePrimitive(feature.id)}
                                className="shrink-0 text-rose-400 hover:text-rose-300 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {(['x', 'y', 'z'] as const).map((axis) => (
                                <label key={axis} className={theme.subText}>
                                  {axis.toUpperCase()} (mm)
                                  <input
                                    aria-label={`Feature ${index + 1} ${axis.toUpperCase()} (mm)`}
                                    type="number"
                                    min="-500"
                                    max="500"
                                    step="1"
                                    value={feature[axis]}
                                    disabled={isGenerating}
                                    onChange={(event) => updatePrimitive(feature.id, axis, Number(event.target.value))}
                                    className={`mt-1 w-full rounded border px-2 py-1 ${theme.innerInputBg}`}
                                  />
                                </label>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {(feature.shape === 'box'
                                ? ([
                                    ['length', 'Length', feature.length],
                                    ['width', 'Width', feature.width],
                                    ['height', 'Height', feature.height],
                                  ] as const)
                                : feature.shape === 'cylinder'
                                  ? ([
                                      ['diameter', 'Diameter', feature.diameter],
                                      ['height', 'Height', feature.height],
                                    ] as const)
                                  : ([['diameter', 'Diameter', feature.diameter]] as const)
                              ).map(([key, label, value]) => (
                                <label key={key} className={theme.subText}>
                                  {label} (mm)
                                  <input
                                    aria-label={`Feature ${index + 1} ${label} (mm)`}
                                    type="number"
                                    min="1"
                                    max="500"
                                    step="1"
                                    value={value}
                                    disabled={isGenerating}
                                    onChange={(event) => updatePrimitive(feature.id, key, Number(event.target.value))}
                                    className={`mt-1 w-full rounded border px-2 py-1 ${theme.innerInputBg}`}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {editorError && (
                      <p role="alert" className="text-rose-400">
                        {editorError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSendMessage(
                        `Create a ${cadParams.length} x ${cadParams.width} mm baseplate with ${cadParams.holeDiameter} mm holes`,
                      )}
                      disabled={isGenerating}
                      className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-2 py-2 font-bold text-slate-950 disabled:opacity-50"
                    >
                      {isGenerating ? 'Generating…' : 'Generate current design'}
                    </button>
                    <p className={theme.subText}>
                      Four corner holes are included. Add up to 20 box, cylinder, or sphere features.
                    </p>
                  </div>

                  {/* Physical Stats */}
                  <div className={`pt-2 border-t ${theme.border} space-y-1.5 font-mono text-[11px]`}>
                    <div className="flex justify-between">
                      <span className={theme.subText}>Approx. Volume:</span>
                      <span className="font-bold">{metrics.volume} cm³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme.subText}>Bounding Box:</span>
                      <span className="font-bold">{metrics.boundingBox}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme.subText}>Est. Weight:</span>
                      <span className="text-emerald-500 font-bold">{metrics.mass} g</span>
                    </div>
                    {features.length > 0 && (
                      <p className={`${theme.subText} text-[9px]`}>
                        Approximation adds feature volumes and may overcount overlaps.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === '3d' && modelArtifacts && (
              <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2">
                <div className="flex gap-2">
                  <a
                    href={modelArtifacts.stlUrl}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md ${
                      darkMode
                        ? 'bg-slate-900/90 border-cyan-700 text-cyan-300 hover:bg-slate-800'
                        : 'bg-white/90 border-cyan-300 text-cyan-700 hover:bg-cyan-50'
                    }`}
                  >
                    <Download className="w-4 h-4" /> Download STL
                  </a>
                  <a
                    href={modelArtifacts.stepUrl}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md ${
                      darkMode
                        ? 'bg-slate-900/90 border-emerald-700 text-emerald-300 hover:bg-slate-800'
                        : 'bg-white/90 border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <Download className="w-4 h-4" /> Download STEP
                  </a>
                </div>
                {importedMesh && (
                  <p className={`max-w-xs rounded-lg px-2.5 py-1.5 text-[10px] font-mono shadow-lg backdrop-blur-md ${
                    darkMode ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50' : 'bg-amber-50/90 text-amber-700 border border-amber-200'
                  }`}>
                    STEP contains the solid baseplate and primitives only. The imported mesh is included in the STL.
                  </p>
                )}
              </div>
            )}

            {/* VIEWPORT TAB 2: 2D BLUEPRINT */}
            {activeTab === '2d' && (
              <BlueprintView
                cadParams={cadParams}
                features={features}
                holes={holes}
                importedMesh={importedMesh}
                units={units}
                darkMode={darkMode}
                showDimensions={showDimensions}
              />
            )}

            {/* VIEWPORT TAB 3: CODE GENERATOR */}
            {activeTab === 'code' && (
              <div className={`w-full h-full p-6 overflow-auto font-mono text-xs transition-colors ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${theme.cardBg}`}>
                    <span className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-500" /> build123d Python B-Rep Script
                    </span>
                    <button
                      onClick={() => void handleCopyCode()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition flex items-center gap-1.5 font-bold"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copyError ? 'Copy failed' : copiedCode ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  {copyError && (
                    <p role="alert" className="text-rose-500">
                      Clipboard access failed. Check your browser permissions and try again.
                    </p>
                  )}

                  <pre className={`p-4 rounded-xl border leading-relaxed overflow-x-auto ${
                    darkMode ? 'bg-slate-900 border-slate-800 text-cyan-300' : 'bg-white border-slate-200 text-cyan-800 shadow-sm'
                  }`}>
{generatedScript}
                  </pre>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <SaveDialog
          darkMode={darkMode}
          defaultName={`Design – ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`}
          onSave={handleSaveProject}
          onClose={() => setShowSaveDialog(false)}
        />
      )}

      {/* Projects Modal */}
      {showProjectsModal && (
        <ProjectsModal
          projects={projects}
          darkMode={darkMode}
          onClose={() => setShowProjectsModal(false)}
          onLoad={handleLoadProject}
          onDelete={deleteProject}
          onExport={exportProject}
          onImportFile={(file) => void handleImportProjectFile(file)}
          importError={projectImportError}
        />
      )}

    </div>
  );
}