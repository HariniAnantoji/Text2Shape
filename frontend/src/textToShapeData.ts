import type { ChatMessage } from './types';

// Preset Prompts & Quick Actions
export const QUICK_PROMPT_PILLS = [
  "Create a baseplate with four corner holes",
  "Make the baseplate thicker",
  "Make the baseplate longer",
  "Reduce the hole spacing from the edges"
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    sender: 'ai',
    text: "Welcome to Text to Shape! I'm your assistant for generating parametric baseplates. Set dimensions in the controls, then describe your design.",
    timestamp: '10:42 AM',
    version: null
  },
  {
    id: 2,
    sender: 'user',
    text: "Create a 100 x 60 mm baseplate with four 6 mm corner holes.",
    timestamp: '10:43 AM',
    version: null
  },
  {
    id: 3,
    sender: 'ai',
    text: "Initial baseplate parameters are ready. Send a prompt to generate and preview the STL.",
    timestamp: '10:43 AM',
    version: null
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
