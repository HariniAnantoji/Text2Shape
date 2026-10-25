import React from 'react';
import type { CadParams, HoleFeature, ImportedMesh, PrimitiveFeature } from '../types';

interface BlueprintViewProps {
  cadParams: CadParams;
  features: PrimitiveFeature[];
  holes: HoleFeature[];
  importedMesh: ImportedMesh | null;
  units: string;
  darkMode: boolean;
  showDimensions: boolean;
}

export function BlueprintView({ cadParams, features, holes, importedMesh, units, darkMode, showDimensions }: BlueprintViewProps) {
  const bounds = {
    minX: cadParams.x - cadParams.length / 2,
    maxX: cadParams.x + cadParams.length / 2,
    minY: cadParams.y - cadParams.width / 2,
    maxY: cadParams.y + cadParams.width / 2,
  };
  for (const feature of features) {
    const halfX = feature.shape === 'box' ? feature.length / 2 : feature.diameter / 2;
    const halfY = feature.shape === 'box' ? feature.width / 2 : feature.diameter / 2;
    bounds.minX = Math.min(bounds.minX, feature.x - halfX);
    bounds.maxX = Math.max(bounds.maxX, feature.x + halfX);
    bounds.minY = Math.min(bounds.minY, feature.y - halfY);
    bounds.maxY = Math.max(bounds.maxY, feature.y + halfY);
  }
  if (importedMesh) {
    const halfLength = importedMesh.length * importedMesh.scale_factor / 2;
    const halfWidth = importedMesh.width * importedMesh.scale_factor / 2;
    bounds.minX = Math.min(bounds.minX, importedMesh.x - halfLength);
    bounds.maxX = Math.max(bounds.maxX, importedMesh.x + halfLength);
    bounds.minY = Math.min(bounds.minY, importedMesh.y - halfWidth);
    bounds.maxY = Math.max(bounds.maxY, importedMesh.y + halfWidth);
  }
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = 240 / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const plateLength = cadParams.length * scale;
  const plateWidth = cadParams.width * scale;
  const plateX = (cadParams.x - centerX) * scale;
  const plateY = -(cadParams.y - centerY) * scale;
  const holeRadius = cadParams.holeDiameter * scale / 2;
  const holeX = plateLength / 2 - cadParams.edgeOffset * scale;
  const holeY = plateWidth / 2 - cadParams.edgeOffset * scale;
  const sideHeight = Math.max(8, cadParams.thickness * scale);
  const sideCenterX = (cadParams.x - centerX) * scale;
  const sideCenterY = -cadParams.z * scale;

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
              x={plateX - plateLength / 2}
              y={plateY - plateWidth / 2}
              width={plateLength}
              height={plateWidth}
              strokeWidth="2"
            />
            {[-holeX, holeX].flatMap((x) =>
              [-holeY, holeY].map((y) => (
                <circle key={`${x}-${y}`} cx={plateX + x} cy={plateY + y} r={holeRadius} strokeWidth="1.5" />
              )),
            )}
            {holes.map((hole, index) => (
              <circle
                key={hole.id}
                cx={(hole.x - centerX) * scale}
                cy={-(hole.y - centerY) * scale}
                r={hole.diameter * scale / 2}
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <title>{`Extra hole ${index + 1}: Ø${hole.diameter} mm`}</title>
              </circle>
            ))}
            {importedMesh && (
              <rect
                x={(importedMesh.x - centerX - importedMesh.length * importedMesh.scale_factor / 2) * scale}
                y={-(importedMesh.y - centerY + importedMesh.width * importedMesh.scale_factor / 2) * scale}
                width={importedMesh.length * importedMesh.scale_factor * scale}
                height={importedMesh.width * importedMesh.scale_factor * scale}
                stroke="currentColor"
                strokeDasharray="2,2"
                strokeWidth="1.5"
              >
                <title>{`Imported mesh: ${importedMesh.filename} (bounding outline)`}</title>
              </rect>
            )}
            {features.map((feature, index) => {
              if (feature.shape === 'box') {
                return (
                  <rect
                    key={feature.id}
                    x={(feature.x - centerX - feature.length / 2) * scale}
                    y={-(feature.y - centerY + feature.width / 2) * scale}
                    width={feature.length * scale}
                    height={feature.width * scale}
                    stroke="currentColor"
                    strokeDasharray="4,2"
                    strokeWidth="1.5"
                  >
                    <title>{`Box ${index + 1}: ${feature.length} × ${feature.width} × ${feature.height} mm`}</title>
                  </rect>
                );
              }
              return (
                <circle
                  key={feature.id}
                  cx={(feature.x - centerX) * scale}
                  cy={-(feature.y - centerY) * scale}
                  r={feature.diameter * scale / 2}
                  stroke="currentColor"
                  strokeDasharray="4,2"
                  strokeWidth="1.5"
                >
                  <title>{`${feature.shape} ${index + 1}: Ø${feature.diameter} mm`}</title>
                </circle>
              );
            })}
            {showDimensions && features.map((feature, index) => (
              <text
                key={`dimension-${feature.id}`}
                x={(feature.x - centerX) * scale}
                y={-(feature.y - centerY) * scale}
                textAnchor="middle"
                className="text-[7px] fill-current font-bold"
              >
                {`F${index + 1} ${feature.shape === 'box'
                  ? `${feature.length}×${feature.width}×${feature.height}`
                  : `Ø${feature.diameter}`}`}
              </text>
            ))}
            <text x={plateX} y={plateY + plateWidth / 2 + 24} textAnchor="middle" className="text-[11px] fill-current font-bold">
              TOP VIEW
            </text>
          </g>

          <g transform="translate(430, 140)">
            <rect
              x={sideCenterX - plateLength / 2}
              y={sideCenterY - sideHeight / 2}
              width={plateLength}
              height={sideHeight}
              strokeWidth="2"
            />
            <line x1={sideCenterX - plateLength / 2} y1={sideCenterY} x2={sideCenterX + plateLength / 2} y2={sideCenterY} strokeWidth="1" strokeDasharray="4,3" />
            <text x={sideCenterX} y={sideCenterY + sideHeight / 2 + 24} textAnchor="middle" className="text-[11px] fill-current font-bold">
              SIDE VIEW
            </text>
          </g>

          {showDimensions && (
            <>
              <text x="180" y="38" textAnchor="middle" className="text-[10px] fill-current">
                {`L ${cadParams.length} ${units}  ×  W ${cadParams.width} ${units}  |  X ${cadParams.x} Y ${cadParams.y} Z ${cadParams.z}`}
              </text>
              <text x="430" y="235" textAnchor="middle" className="text-[10px] fill-current">
                {`THK ${cadParams.thickness} ${units}`}
              </text>
              <text x="180" y="290" textAnchor="middle" className="text-[10px] fill-current">
                {`4 × Ø ${cadParams.holeDiameter} ${units}  |  EDGE ${cadParams.edgeOffset} ${units}`}
              </text>
            </>
          )}
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
