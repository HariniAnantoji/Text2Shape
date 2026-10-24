"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BlueprintView } from '../components/BlueprintView';
import { ThreeViewport } from '../components/ThreeViewport';
import { INITIAL_MESSAGES, MATERIALS, QUICK_PROMPT_PILLS } from '../textToShapeData';
import type { CadParams, ChatMessage, GenerateResponse, MaterialKey, ModelArtifacts, ModelVersion } from '../types';
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
  ChevronDown
} from 'lucide-react';

// --- MAIN APP COMPONENT ---
export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('3d');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelArtifacts, setModelArtifacts] = useState<ModelArtifacts | null>(null);
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
      }
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
  });

  // Dynamic Metrics Calculation
  const metrics = useMemo(() => {
    const holeRadius = cadParams.holeDiameter / 2;
    const volume = ((cadParams.length * cadParams.width - 4 * Math.PI * holeRadius ** 2) * cadParams.thickness / 1000).toFixed(2);
    const mass = (Number(volume) * 7.85).toFixed(1);
    const boundingBox = `${cadParams.length} x ${cadParams.width} x ${cadParams.thickness} ${units}`;
    return { volume, mass, boundingBox };
  }, [cadParams, units]);

  // Auto-scroll Chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const updateCadParam = (key: keyof CadParams, value: number) => {
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
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed (${response.status})`);
      }

      const result: GenerateResponse = await response.json();
      const returnedParams: CadParams = {
        length: result.cad_params.length,
        width: result.cad_params.width,
        thickness: result.cad_params.thickness,
        holeDiameter: result.cad_params.hole_diameter,
        edgeOffset: result.cad_params.edge_offset,
      };
      const version = `v1.${history.length}`;
      setCadParams(returnedParams);
      setModelArtifacts({ stlUrl: result.stl_url, stepUrl: result.step_url });
      setHistory((previous) => [
        {
          version,
          title: query.slice(0, 24),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cadParams: returnedParams,
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

  const handleCopyCode = () => {
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

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
                      setModelArtifacts(null);
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
                  placeholder="Ask Text to Shape to modify geometry..."
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
              <div className="hidden sm:flex items-center gap-2">
                <span className={`text-[11px] font-mono ${theme.subText}`}>Material:</span>
                {(Object.keys(MATERIALS) as MaterialKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setMaterialKey(key)}
                    className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                      materialKey === key 
                        ? (darkMode ? 'bg-slate-700 border-cyan-400 text-cyan-300' : 'bg-white border-cyan-600 text-cyan-800 shadow-sm') 
                        : (darkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800' : 'bg-slate-200/50 border-slate-300 text-slate-600 hover:bg-slate-200')
                    }`}
                  >
                    {MATERIALS[key].name}
                  </button>
                ))}
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
                  stlUrl={modelArtifacts?.stlUrl ?? null}
                  materialKey={materialKey}
                  wireframe={wireframe}
                  xrayMode={xrayMode}
                  showGrid={showGrid}
                  darkMode={darkMode}
                  onStlLoadError={handleStlLoadError}
                />

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
                <div className={`absolute top-4 right-4 w-64 p-3.5 rounded-2xl border space-y-3 z-20 shadow-2xl backdrop-blur-md ${theme.cardBg}`}>
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

                  {/* Physical Stats */}
                  <div className={`pt-2 border-t ${theme.border} space-y-1.5 font-mono text-[11px]`}>
                    <div className="flex justify-between">
                      <span className={theme.subText}>Volume:</span>
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
                  </div>
                </div>
              </>
            )}

            {activeTab === '3d' && modelArtifacts?.stepUrl && (
              <a
                href={modelArtifacts.stepUrl}
                className={`absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md ${
                  darkMode
                    ? 'bg-slate-900/90 border-emerald-700 text-emerald-300 hover:bg-slate-800'
                    : 'bg-white/90 border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <Download className="w-4 h-4" /> Download STEP
              </a>
            )}

            {/* VIEWPORT TAB 2: 2D BLUEPRINT */}
            {activeTab === '2d' && (
              <BlueprintView cadParams={cadParams} units={units} darkMode={darkMode} />
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
                      onClick={handleCopyCode}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition flex items-center gap-1.5 font-bold"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <pre className={`p-4 rounded-xl border leading-relaxed overflow-x-auto ${
                    darkMode ? 'bg-slate-900 border-slate-800 text-cyan-300' : 'bg-white border-slate-200 text-cyan-800 shadow-sm'
                  }`}>
{`from build123d import Align, Box, Cylinder, Pos, export_step, export_stl

# Baseplate parameters for ${activeVersion}
length = ${cadParams.length}  # ${units}
width = ${cadParams.width}  # ${units}
thickness = ${cadParams.thickness}  # ${units}
hole_diameter = ${cadParams.holeDiameter}  # ${units}
edge_offset = ${cadParams.edgeOffset}  # ${units}

result = Box(length, width, thickness, align=(Align.CENTER, Align.CENTER, Align.CENTER))
hole_x = length / 2 - edge_offset
hole_y = width / 2 - edge_offset
for x in (-hole_x, hole_x):
    for y in (-hole_y, hole_y):
        cutter = Pos(x, y, 0) * Cylinder(
            hole_diameter / 2,
            thickness + 2,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        result -= cutter

export_step(result, "baseplate.step")
export_stl(result, "baseplate.stl")
`}
                  </pre>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}