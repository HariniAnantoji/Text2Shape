import React from 'react';
import type { CadParams } from '../types';

// --- 2D BLUEPRINT VIEW COMPONENT ---
interface BlueprintViewProps {
  cadParams: CadParams;
  units: string;
  darkMode: boolean;
}

export function BlueprintView({ cadParams, units, darkMode }: BlueprintViewProps) {
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
