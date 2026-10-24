import React from 'react';
import type { CadParams } from '../types';

interface BlueprintViewProps {
  cadParams: CadParams;
  units: string;
  darkMode: boolean;
}

export function BlueprintView({ cadParams, units, darkMode }: BlueprintViewProps) {
  const scale = 240 / Math.max(cadParams.length, cadParams.width);
  const plateLength = cadParams.length * scale;
  const plateWidth = cadParams.width * scale;
  const holeRadius = cadParams.holeDiameter * scale / 2;
  const holeX = plateLength / 2 - cadParams.edgeOffset * scale;
  const holeY = plateWidth / 2 - cadParams.edgeOffset * scale;
  const sideHeight = Math.max(8, cadParams.thickness * scale);

  return (
    <div className={`w-full h-full p-6 flex flex-col justify-between font-mono select-none overflow-auto ${
      darkMode ? 'bg-slate-950 text-cyan-400' : 'bg-slate-50 text-cyan-800'
    }`}>
      <div className="flex-1 flex items-center justify-center p-4">
        <svg viewBox="0 0 600 320" className="w-full max-w-2xl h-auto stroke-current fill-none">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={darkMode ? "rgba(56,189,248,0.08)" : "rgba(14,116,144,0.1)"} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" stroke="none" />

          <g transform="translate(180, 140)">
            <rect
              x={-plateLength / 2}
              y={-plateWidth / 2}
              width={plateLength}
              height={plateWidth}
              strokeWidth="2"
            />
            {[-holeX, holeX].flatMap((x) =>
              [-holeY, holeY].map((y) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r={holeRadius} strokeWidth="1.5" />
              )),
            )}
            <text x="0" y={plateWidth / 2 + 24} textAnchor="middle" className="text-[11px] fill-current font-bold">
              TOP VIEW
            </text>
          </g>

          <g transform="translate(430, 140)">
            <rect
              x={-plateLength / 2}
              y={-sideHeight / 2}
              width={plateLength}
              height={sideHeight}
              strokeWidth="2"
            />
            <line x1={-plateLength / 2} y1={0} x2={plateLength / 2} y2={0} strokeWidth="1" strokeDasharray="4,3" />
            <text x="0" y={sideHeight / 2 + 24} textAnchor="middle" className="text-[11px] fill-current font-bold">
              SIDE VIEW
            </text>
          </g>

          <text x="180" y="38" textAnchor="middle" className="text-[10px] fill-current">
            {`L ${cadParams.length} ${units}  ×  W ${cadParams.width} ${units}`}
          </text>
          <text x="430" y="235" textAnchor="middle" className="text-[10px] fill-current">
            {`THK ${cadParams.thickness} ${units}`}
          </text>
          <text x="180" y="290" textAnchor="middle" className="text-[10px] fill-current">
            {`4 × Ø ${cadParams.holeDiameter} ${units}  |  EDGE ${cadParams.edgeOffset} ${units}`}
          </text>
        </svg>
      </div>

      <div className={`border-2 p-3 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] z-10 ${
        darkMode ? 'border-cyan-500/40 bg-slate-900/80 text-slate-300' : 'border-cyan-600 bg-white text-slate-800 shadow-sm'
      }`}>
        <div><span className="opacity-60">AUTHOR:</span> Text to Shape Engine</div>
        <div><span className="opacity-60">HOLE PATTERN:</span> 4 × Ø{cadParams.holeDiameter}</div>
        <div><span className="opacity-60">UNITS:</span> {units.toUpperCase()}</div>
        <div><span className="opacity-60">DATE:</span> {new Date().toISOString().slice(0, 10)}</div>
      </div>
    </div>
  );
}
