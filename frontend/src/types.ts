export interface CadParams {
  length: number;
  width: number;
  thickness: number;
  holeDiameter: number;
  edgeOffset: number;
}

export interface GenerateResponse {
  message: string;
  cad_params: {
    length: number;
    width: number;
    thickness: number;
    hole_diameter: number;
    edge_offset: number;
  };
  stl_url: string;
  step_url: string;
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
}

export type MaterialKey = 'steel' | 'aluminum' | 'polymer' | 'brass' | 'carbon';
