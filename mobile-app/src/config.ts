/**
 * Anzaro Mobile — App Configuration
 * V.14: All config values use null-coalescing (??) with safe defaults.
 */
import Constants from 'expo-constants';

export const ANZARO_API_URL: string =
  Constants?.expoConfig?.extra?.ANZARO_API_URL ??
  'https://kopabdo-delta-ai-v2.hf.space';

export const HASS_URL: string | null =
  Constants?.expoConfig?.extra?.HASS_URL ?? null;

export const HASS_TOKEN: string | null =
  Constants?.expoConfig?.extra?.HASS_TOKEN ?? null;

export const isHassConfigured: boolean = !!(HASS_URL && HASS_TOKEN);

// ─── Identity Matrix Types ───
export interface IdentityMatrix {
  archetypes: string[];
  primaryArchetype: string;
  traits: Record<string, number>;
  darkTriad: { machiavellianism: number; narcissism: number; psychopathy: number };
  cognitiveStyle: 'analytical' | 'creative' | 'philosophical' | 'pragmatic';
  growthFrictionLevel: 'none' | 'gentle' | 'moderate' | 'aggressive';
  confidenceScore: number;
  personaVersion: string;
  systemPersona: string;
}

export const EMPTY_MATRIX: IdentityMatrix = {
  archetypes: [],
  primaryArchetype: 'unknown',
  traits: {},
  darkTriad: { machiavellianism: 50, narcissism: 50, psychopathy: 50 },
  cognitiveStyle: 'pragmatic',
  growthFrictionLevel: 'none',
  confidenceScore: 0,
  personaVersion: 'v0.0',
  systemPersona: '',
};

// ─── HASS Device Types ───
export interface HassDevice {
  entity_id: string;
  friendly_name: string;
  domain: string;
  state: string;
  attributes: Record<string, any>;
}

// ─── Theme ───
export const COLORS = {
  background: '#0f0f1e',
  card: '#1a1a2e',
  cardLight: '#1e1e32',
  primary: '#7c3aed',
  primaryLight: '#a78bfa',
  text: '#ffffff',
  textMuted: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  border: 'rgba(255,255,255,0.1)',
};
