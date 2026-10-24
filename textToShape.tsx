import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { 
  Box, 
  Layers, 
  Cpu, 
  Wand2, 
  Download, 
  Code, 
  Eye, 
  Settings2, 
  Sparkles, 
  Maximize2, 
  RotateCcw, 
  Sun, 
  Moon, 
  Grid, 
  Sliders, 
  FileText, 
  Ruler, 
  CheckCircle2, 
  Loader2, 
  Play, 
  ChevronRight, 
  Compass,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  Terminal,
  Activity,
  Send,
  MessageSquare,
  History,
  Bot,
  User,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ArrowRight
} from 'lucide-react';

// Preset Prompts & Quick Actions
const QUICK_PROMPT_PILLS = [
  "Add 4 mounting holes M6",
  "Make baseplate thicker",
  "Add a 5mm fillet on all edges",
  "Fillet top edge and hollow out center"
];

const INITIAL_MESSAGES = [
  {
    id: 1,
    sender: 'ai',
    text: "Welcome to Text to Shape! I'm your assistant for generating parametric 3D CAD geometry. Switch between Light and Dark mode anytime above!",
    timestamp: '10:42 AM',
    version: null
  },
  {
    id: 2,
    sender: 'user',
    text: "Mechanical Spur Gear with 20 teeth, pitch diameter 80mm, bore diameter 15mm with standard keyway slot.",
    timestamp: '10:43 AM',
    version: null
  },
  {
    id: 3,
    sender: 'ai',
    text: "Generated parametric spur gear solid with keyway feature and 20 teeth. Mesh validated as manifold B-Rep.",
    timestamp: '10:43 AM',
    version: 'v1.0',
    changes: ['Created Spur Gear Base', 'Pitch Dia: 80mm', 'Bore Dia: 15mm']
  }
];

// Material Shaders Definitions
const MATERIALS = {
  steel: { name: 'Metallic Steel', colorLight: 0x64748b, colorDark: 0x94a3b8, metalness: 0.9, roughness: 0.2 },
  aluminum: { name: 'Anodized Blue', colorLight: 0x2563eb, colorDark: 0x3b82f6, metalness: 0.8, roughness: 0.3 },
  polymer: { name: 'Matte Polymer', colorLight: 0xe2e8f0, colorDark: 0x334155, metalness: 0.1, roughness: 0.8 },
  brass: { name: 'Polished Brass', colorLight: 0xd97706, colorDark: 0xf59e0b, metalness: 0.9, roughness: 0.3 },
  carbon: { name: 'Carbon Fiber', colorLight: 0x1e293b, colorDark: 0x0f172a, metalness: 0.5, roughness: 0.6 },
};

// --- THREE.JS 3D VIEWPORT COMPONENT ---
function ThreeViewport({ cadParams, materialKey, wireframe, xrayMode, showGrid, showDimensions, explodedView, darkMode }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Scene & Camera setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkMode ? 0x070a12 : 0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(60, 50, 70);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // Clear previous elements
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, darkMode ? 0.7 : 1.1);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, darkMode ? 1.2 : 1.0);
    dirLight1.position.set(50, 80, 50);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(darkMode ? 0x38bdf8 : 0x0284c7, 0.6);
    dirLight2.position.set(-50, -30, -50);
    scene.add(dirLight2);

    // Grid Floor
    let gridHelper;
    if (showGrid) {
      gridHelper = new THREE.GridHelper(160, 32, darkMode ? 0x334155 : 0xcbd5e1, darkMode ? 0x1e293b : 0xe2e8f0);
      gridHelper.position.y = -cadParams.extrusionDepth / 2 - 5;
      scene.add(gridHelper);
    }

    // Material definition
    const matConfig = MATERIALS[materialKey] || MATERIALS.steel;
    const materialColor = darkMode ? matConfig.colorDark : matConfig.colorLight;

    const meshMaterial = new THREE.MeshStandardMaterial({
      color: materialColor,
      metalness: matConfig.metalness,
      roughness: matConfig.roughness,
      wireframe: wireframe,
      transparent: xrayMode,
      opacity: xrayMode ? 0.45 : 1.0,
      side: THREE.DoubleSide
    });

    // Model Grouping
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Build Parametric Spur Gear Geometry Shape
    const shape = new THREE.Shape();
    const teeth = cadParams.teethCount;
    const outerR = cadParams.outerRadius;
    const innerR = outerR * 0.82;

    for (let i = 0; i < teeth; i++) {
      const angle1 = (i / teeth) * Math.PI * 2;
      const angle2 = ((i + 0.25) / teeth) * Math.PI * 2;
      const angle3 = ((i + 0.5) / teeth) * Math.PI * 2;
      const angle4 = ((i + 0.75) / teeth) * Math.PI * 2;

      const r1 = innerR;
      const r2 = outerR;

      if (i === 0) {
        shape.moveTo(Math.cos(angle1) * r1, Math.sin(angle1) * r1);
      } else {
        shape.lineTo(Math.cos(angle1) * r1, Math.sin(angle1) * r1);
      }
      shape.lineTo(Math.cos(angle2) * r2, Math.sin(angle2) * r2);
      shape.lineTo(Math.cos(angle3) * r2, Math.sin(angle3) * r2);
      shape.lineTo(Math.cos(angle4) * r1, Math.sin(angle4) * r1);
    }

    // Center Bore Hole
    const holePath = new THREE.Path();
    const holeR = cadParams.boreDiameter / 2;
    holePath.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(holePath);

    // Optional Mounting Holes
    if (cadParams.mountingHoles) {
      const offset = outerR * 0.5;
      const holePositions = [
        [-offset, -offset],
        [offset, -offset],
        [offset, offset],
        [-offset, offset]
      ];
      holePositions.forEach(([hx, hy]) => {
        const mHole = new THREE.Path();
        mHole.absarc(hx, hy, 3, 0, Math.PI * 2, true);
        shape.holes.push(mHole);
      });
    }

    const extrudeSettings = {
      steps: 1,
      depth: cadParams.extrusionDepth,
      bevelEnabled: cadParams.filletRadius > 0,
      bevelThickness: Math.min(cadParams.filletRadius, 3),
      bevelSize: Math.min(cadParams.filletRadius, 3),
      bevelOffset: 0,
      bevelSegments: 3
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();

    const gearMesh = new THREE.Mesh(geometry, meshMaterial);
    modelGroup.add(gearMesh);

    // Exploded Shaft Assembly (if enabled)
    if (explodedView) {
      const shaftGeo = new THREE.CylinderGeometry(holeR - 0.2, holeR - 0.2, cadParams.extrusionDepth * 1.8, 32);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: darkMode ? 0x38bdf8 : 0x0284c7,
        metalness: 0.9,
        roughness: 0.1
      });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.position.y = cadParams.extrusionDepth + 15;
      modelGroup.add(shaftMesh);
    }

    // Camera Look At Target
    camera.lookAt(0, 0, 0);

    // Simple Mouse Drag Orbit Navigation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const handleMouseDown = (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y
      };

      modelGroup.rotation.y += deltaMove.x * 0.01;
      modelGroup.rotation.x += deltaMove.y * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => { isDragging = false; };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isDragging) {
        modelGroup.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Window Resize handling
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      meshMaterial.dispose();
      renderer.dispose();
    };
  }, [cadParams, materialKey, wireframe, xrayMode, showGrid, explodedView, darkMode]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

// --- 2D BLUEPRINT VIEW COMPONENT ---
function BlueprintView({ cadParams, units, darkMode }) {
  const outerD = cadParams.outerRadius * 2;
  const depth = cadParams.extrusionDepth;
  const boreD = cadParams.boreDiameter;

  return (
    <div className={`w-full h-full p-6 flex flex-col justify-between font-mono select-none overflow-auto ${
      darkMode ? 'bg-slate-950 text-cyan-400' : 'bg-slate-50 text-cyan-800'
    }`}>
      {/* SVG Orthographic Blueprint */}
      <div className="flex-1 flex items-center justify-center p-4">
        <svg viewBox="0 0 600 320" className="w-full max-w-2xl h-auto stroke-current fill-none">
          {/* Grid lines in background */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={darkMode ? "rgba(56,189,248,0.08)" : "rgba(14,116,144,0.1)"} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" stroke="none" />

          {/* FRONT VIEW (CIRCULAR) */}
          <g transform="translate(180, 150)">
            <circle r={cadParams.outerRadius * 2.2} strokeDasharray="3,3" strokeWidth="1" className="opacity-40" />
            <circle r={cadParams.outerRadius * 2} strokeWidth="2" />
            <circle r={cadParams.outerRadius * 1.65} strokeDasharray="4,2" strokeWidth="1.2" className="opacity-70" />
            <circle r={boreD * 1.5} strokeWidth="1.8" />
            
            {/* Centerlines */}
            <line x1="-90" y1="0" x2="90" y2="0" strokeWidth="0.8" strokeDasharray="8,3,2,3" />
            <line x1="0" y1="-90" x2="0" y2="90" strokeWidth="0.8" strokeDasharray="8,3,2,3" />
            
            <text x="0" y="115" textAnchor="middle" className="text-[11px] fill-current font-bold">FRONT VIEW</text>
          </g>

          {/* SIDE SECTION VIEW */}
          <g transform="translate(420, 150)">
            <rect x="-35" y="-70" width="70" height="140" strokeWidth="2" />
            {/* Bore Cutout Hidden Lines */}
            <line x1="-35" y1={-boreD * 1.5} x2="35" y2={-boreD * 1.5} strokeWidth="1.2" strokeDasharray="4,3" />
            <line x1="-35" y1={boreD * 1.5} x2="35" y2={boreD * 1.5} strokeWidth="1.2" strokeDasharray="4,3" />
            
            {/* Section Hatch lines */}
            <line x1="-30" y1="-60" x2="-10" y2="-70" strokeWidth="0.8" className="opacity-50" />
            <line x1="-30" y1="-40" x2="10" y2="-70" strokeWidth="0.8" className="opacity-50" />
            <line x1="-30" y1="40" x2="10" y2="70" strokeWidth="0.8" className="opacity-50" />
            <line x1="-30" y1="60" x2="-10" y2="70" strokeWidth="0.8" className="opacity-50" />

            <text x="0" y="115" textAnchor="middle" className="text-[11px] fill-current font-bold">SECTION A-A</text>
          </g>

          {/* DIMENSION ANNOTATIONS */}
          {/* Outer Diameter Annotation */}
          <line x1="90" y1="60" x2="270" y2="60" strokeWidth="1" />
          <text x="180" y="52" textAnchor="middle" className="text-[10px] fill-current">Ø {outerD} {units}</text>
          
          {/* Extrusion Thickness Annotation */}
          <line x1="385" y1="230" x2="455" y2="230" strokeWidth="1" />
          <text x="420" y="245" textAnchor="middle" className="text-[10px] fill-current">THK {depth} {units}</text>
        </svg>
      </div>

      {/* ISO ENGINEERING TITLE BLOCK */}
      <div className={`border-2 p-3 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] z-10 ${
        darkMode ? 'border-cyan-500/40 bg-slate-900/80 text-slate-300' : 'border-cyan-600 bg-white text-slate-800 shadow-sm'
      }`}>
        <div><span className="opacity-60">AUTHOR:</span> Text to Shape Engine</div>
        <div><span className="opacity-60">TOLERANCE:</span> ±0.05mm</div>
        <div><span className="opacity-60">UNITS:</span> {units.toUpperCase()}</div>
        <div><span className="opacity-60">DATE:</span> {new Date().toISOString().slice(0, 10)}</div>
      </div>
    </div>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('3d');

  // Chat State
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [activeVersion, setActiveVersion] = useState('v1.0');
  const chatBottomRef = useRef(null);

  // Model Version History
  const [history, setHistory] = useState([
    { version: 'v1.0', title: 'Initial Spur Gear Solid', time: '10:43 AM', teeth: 20, radius: 40, depth: 18, bore: 15, fillet: 2.5, holes: false },
  ]);

  // Viewport Settings
  const [units, setUnits] = useState('mm');
  const [copiedCode, setCopiedCode] = useState(false);
  const [materialKey, setMaterialKey] = useState('steel');
  const [wireframe, setWireframe] = useState(false);
  const [xrayMode, setXrayMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [explodedView, setExplodedView] = useState(false);

  // Dynamic CAD Parameters
  const [cadParams, setCadParams] = useState({
    teethCount: 20,
    outerRadius: 40,
    boreDiameter: 15,
    extrusionDepth: 18,
    filletRadius: 2.5,
    mountingHoles: false
  });

  // Dynamic Metrics Calculation
  const metrics = useMemo(() => {
    const r = cadParams.outerRadius;
    const h = cadParams.extrusionDepth;
    const volume = (Math.PI * Math.pow(r, 2) * h / 1000).toFixed(2);
    const surfaceArea = (2 * Math.PI * r * h + 2 * Math.PI * Math.pow(r, 2)).toFixed(1);
    const mass = (volume * 7.85).toFixed(1);
    const boundingBox = `${(r * 2).toFixed(0)} x ${(r * 2).toFixed(0)} x ${h} ${units}`;
    return { volume, surfaceArea, mass, boundingBox };
  }, [cadParams, units]);

  // Auto-scroll Chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Handle Prompt Submission
  const handleSendMessage = (textToSend) => {
    const query = textToSend || inputPrompt;
    if (!query.trim() || isGenerating) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      version: null
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setIsGenerating(true);
    setGenerationStep(0);

    const stepsInterval = setInterval(() => {
      setGenerationStep((prev) => {
        if (prev >= 3) {
          clearInterval(stepsInterval);
          setIsGenerating(false);

          const lower = query.toLowerCase();
          let newParams = { ...cadParams };
          let changeLogs = [];

          if (lower.includes('thicker') || lower.includes('depth')) {
            newParams.extrusionDepth = Math.min(newParams.extrusionDepth + 10, 50);
            changeLogs.push(`Extrusion Depth increased to ${newParams.extrusionDepth}mm`);
          }
          if (lower.includes('hole') || lower.includes('mounting')) {
            newParams.mountingHoles = true;
            changeLogs.push('Added 4x M6 mounting hole pattern');
          }
          if (lower.includes('fillet') || lower.includes('edge')) {
            newParams.filletRadius = 5.0;
            changeLogs.push('Applied 5mm fillet on feature edges');
          }
          if (lower.includes('teeth') || lower.includes('gear')) {
            newParams.teethCount = 28;
            newParams.outerRadius = 50;
            changeLogs.push('Updated tooth profile count to 28');
          }
          if (changeLogs.length === 0) {
            newParams.extrusionDepth += 4;
            changeLogs.push('Modified parametric boundary dimensions');
          }

          setCadParams(newParams);

          const verString = `v1.${history.length}`;
          setHistory((prevHist) => [
            { version: verString, title: query.slice(0, 24) + '...', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), ...newParams },
            ...prevHist
          ]);
          setActiveVersion(verString);

          setMessages((prevMsgs) => [
            ...prevMsgs,
            {
              id: Date.now() + 1,
              sender: 'ai',
              text: `Updated 3D geometry model based on query: "${query}". Manifold topology re-calculated.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              version: verString,
              changes: changeLogs
            }
          ]);

          return 3;
        }
        return prev + 1;
      });
    }, 550);
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
                  <span>AI Modeling Kernel Reasoning...</span>
                </div>
                <div className={`space-y-1 text-[11px] font-mono ${theme.subText}`}>
                  <div className={generationStep >= 0 ? "text-emerald-500 font-semibold" : ""}>✓ Parsing natural language geometric constraints</div>
                  <div className={generationStep >= 1 ? "text-emerald-500 font-semibold" : ""}>✓ Re-calculating CSG boolean intersections</div>
                  <div className={generationStep >= 2 ? "text-emerald-500 font-semibold" : ""}>✓ Re-tessellating manifold mesh boundaries</div>
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
                      setCadParams({
                        teethCount: item.teeth,
                        outerRadius: item.radius,
                        boreDiameter: item.bore,
                        extrusionDepth: item.depth,
                        filletRadius: item.fillet,
                        mountingHoles: item.holes
                      });
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
                {Object.keys(MATERIALS).map((key) => (
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
                  materialKey={materialKey}
                  wireframe={wireframe}
                  xrayMode={xrayMode}
                  showGrid={showGrid}
                  showDimensions={showDimensions}
                  explodedView={explodedView}
                  darkMode={darkMode}
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
                  <button 
                    onClick={() => setExplodedView(!explodedView)}
                    className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1 transition ${explodedView ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' : `${theme.subText} hover:bg-slate-500/10`}`}
                    title="Explode Assembly"
                  >
                    <Layers className="w-3.5 h-3.5" /> Explode
                  </button>
                </div>

                {/* Dynamic Parameter Inspector */}
                <div className={`absolute top-4 right-4 w-64 p-3.5 rounded-2xl border space-y-3 z-20 shadow-2xl backdrop-blur-md ${theme.cardBg}`}>
                  <div className={`flex items-center justify-between text-xs font-semibold ${darkMode ? 'text-cyan-400' : 'text-cyan-700'} uppercase tracking-wider border-b ${theme.border} pb-2`}>
                    <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5" /> Parametric Controls</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Outer Dia:</span>
                        <span className="font-bold text-cyan-500">{(cadParams.outerRadius * 2)} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="60"
                        value={cadParams.outerRadius}
                        onChange={(e) => setCadParams({ ...cadParams, outerRadius: Number(e.target.value) })}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Thickness/Depth:</span>
                        <span className="font-bold text-cyan-500">{cadParams.extrusionDepth} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={cadParams.extrusionDepth}
                        onChange={(e) => setCadParams({ ...cadParams, extrusionDepth: Number(e.target.value) })}
                        className="w-full accent-cyan-500 bg-slate-700 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className={theme.subText}>Fillet Radius:</span>
                        <span className="font-bold text-cyan-500">{cadParams.filletRadius} {units}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="0.5"
                        value={cadParams.filletRadius}
                        onChange={(e) => setCadParams({ ...cadParams, filletRadius: Number(e.target.value) })}
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
                      <Terminal className="w-4 h-4 text-emerald-500" /> CadQuery Python B-Rep Script
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
{`import cadquery as cq

# Text to Shape Generated Script
# Active Model Version: ${activeVersion}

teeth_count = ${cadParams.teethCount}
outer_radius = ${cadParams.outerRadius}  # ${units}
bore_diameter = ${cadParams.boreDiameter}  # ${units}
extrusion_depth = ${cadParams.extrusionDepth}  # ${units}
fillet_radius = ${cadParams.filletRadius}  # ${units}

# Base Geometry Solid Extrusion
result = (
    cq.Workplane("XY")
    .circle(outer_radius)
    .extrude(extrusion_depth)
)

# Hole Cuts
result = (
    result.faces(">Z")
    .workplane()
    .hole(bore_diameter)
)

${cadParams.mountingHoles ? `# Mounting Holes Pattern
result = (
    result.faces(">Z").workplane()
    .pushPoints([(-25, -25), (25, -25), (25, 25), (-25, 25)])
    .hole(6.0)
)` : ''}

# Apply Edge Fillets
result = result.edges("|Z").fillet(fillet_radius)

# Export B-Rep Geometry
cq.exporters.export(result, "text_to_shape_${activeVersion}.step")
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