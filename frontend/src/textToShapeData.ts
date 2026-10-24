import type { ChatMessage } from './types';

// Preset Prompts & Quick Actions
export const QUICK_PROMPT_PILLS = [
  "Add 4 mounting holes M6",
  "Make baseplate thicker",
  "Add a 5mm fillet on all edges",
  "Fillet top edge and hollow out center"
];

export const INITIAL_MESSAGES: ChatMessage[] = [
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
export const MATERIALS = {
  steel: { name: 'Metallic Steel', colorLight: 0x64748b, colorDark: 0x94a3b8, metalness: 0.9, roughness: 0.2 },
  aluminum: { name: 'Anodized Blue', colorLight: 0x2563eb, colorDark: 0x3b82f6, metalness: 0.8, roughness: 0.3 },
  polymer: { name: 'Matte Polymer', colorLight: 0xe2e8f0, colorDark: 0x334155, metalness: 0.1, roughness: 0.8 },
  brass: { name: 'Polished Brass', colorLight: 0xd97706, colorDark: 0xf59e0b, metalness: 0.9, roughness: 0.3 },
  carbon: { name: 'Carbon Fiber', colorLight: 0x1e293b, colorDark: 0x0f172a, metalness: 0.5, roughness: 0.6 },
};
