export interface CadParams {
  length: number;
  width: number;
  thickness: number;
  holeDiameter: number;
  edgeOffset: number;
  x: number;
  y: number;
  z: number;
}

interface PrimitivePlacement {
  id: string;
  x: number;
  y: number;
  z: number;
}

export type PrimitiveFeature =
  | (PrimitivePlacement & {
      shape: 'box';
      length: number;
      width: number;
      height: number;
    })
  | (PrimitivePlacement & {
      shape: 'cylinder';
      diameter: number;
      height: number;
    })
  | (PrimitivePlacement & {
      shape: 'sphere';
      diameter: number;
    });

export interface HoleFeature {
  id: string;
  x: number;
  y: number;
  diameter: number;
}

export interface ImportedMesh {
  id: string;
  filename: string;
  length: number;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  scale_factor: number;
  source_url: string;
}

export interface GenerateResponse {
  status: 'generated' | 'clarification' | 'unsupported';
  message: string;
  cad_params: {
    length: number;
    width: number;
    thickness: number;
    hole_diameter: number;
    edge_offset: number;
    x?: number;
    y?: number;
    z?: number;
  };
  features?: PrimitiveFeature[];
  holes?: HoleFeature[];
  imported_mesh?: ImportedMesh | null;
  files?: {
    stl_url: string;
    step_url: string;
  } | null;
}

export interface ModelArtifacts {
  stlUrl: string;
  stepUrl: string;
}

export interface ChatMessage {
  id: number;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  version: string | null;
  changes?: string[];
}

export interface ModelVersion {
  version: string;
  title: string;
  time: string;
  cadParams: CadParams;
  features: PrimitiveFeature[];
  holes: HoleFeature[];
  importedMesh: ImportedMesh | null;
  artifacts: ModelArtifacts | null;
}

export type MaterialKey = 'steel' | 'aluminum' | 'polymer' | 'brass' | 'carbon' | 'copper' | 'titanium' | 'gold';

export interface SavedProject {
  /** Unique ID — hex timestamp + random suffix */
  id: string;
  name: string;
  savedAt: string; // ISO date string
  activeVersion: string;
  cadParams: CadParams;
  features: PrimitiveFeature[];
  holes: HoleFeature[];
  importedMesh: ImportedMesh | null;
  modelArtifacts: ModelArtifacts | null;
  history: ModelVersion[];
  messages: ChatMessage[];
  materialKey: MaterialKey;
  wireframe: boolean;
  xrayMode: boolean;
  showGrid: boolean;
  showDimensions: boolean;
}
