export interface CadParams {
  teethCount: number;
  outerRadius: number;
  boreDiameter: number;
  extrusionDepth: number;
  filletRadius: number;
  mountingHoles: boolean;
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
