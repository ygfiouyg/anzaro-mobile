// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Gradio Voice-to-Voice Service
// ═══════════════════════════════════════════════════════════════════════
// Direct voice-to-voice via HuggingFace Spaces using @gradio/client.
// Connects to spaces like Ultravox that accept audio in and return audio.
//
// This replaces the full ASR → Chat → TTS pipeline with a single model call!
// ═══════════════════════════════════════════════════════════════════════

import { Client } from '@gradio/client';

// ─── Available Voice-to-Voice Spaces ──────────────────────────────────
export interface VoiceSpace {
  id: string;
  name: string;
  nameAr: string;
  spaceId: string;
  description: string;
  descriptionAr: string;
  apiName: string;
  badgeColor: string;
  // Whether this space is likely to support Arabic
  arabicSupport: 'full' | 'partial' | 'unknown';
}

export const VOICE_SPACES: VoiceSpace[] = [
  {
    id: 'ultravox-v0_4',
    name: 'Ultravox v0.4',
    nameAr: 'ألترافوكس',
    spaceId: 'fixie-ai/ultravox-v0_4',
    description: 'Fast voice-to-voice model',
    descriptionAr: 'نموذج صوت-لصوت سريع',
    apiName: '/respond',
    badgeColor: 'bg-violet-500',
    arabicSupport: 'unknown',
  },
];

// ─── Gradio Voice Client ─────────────────────────────────────────────
let gradioClients: Map<string, any> = new Map();

async function getGradioClient(spaceId: string): Promise<any> {
  if (gradioClients.has(spaceId)) {
    return gradioClients.get(spaceId);
  }

  console.log(`[GradioVoice] Connecting to ${spaceId}...`);
  try {
    const client = await Client.connect(spaceId);
    gradioClients.set(spaceId, client);
    console.log(`[GradioVoice] Connected to ${spaceId}`);
    return client;
  } catch (error) {
    console.error(`[GradioVoice] Failed to connect to ${spaceId}:`, error);
    throw new Error(`فشل الاتصال بالمساحة ${spaceId}`);
  }
}

// ─── Send Audio and Get Response ──────────────────────────────────────
export interface GradioVoiceRequest {
  audioBlob: Blob;
  spaceId?: string;
  apiName?: string;
}

export interface GradioVoiceResponse {
  audioBuffer: ArrayBuffer | null;
  text: string;
  spaceId: string;
  success: boolean;
}

/**
 * Send audio to a Gradio voice-to-voice space and get back audio response.
 * Falls back gracefully if the space is unavailable or doesn't support Arabic.
 */
export async function sendToVoiceSpace(
  request: GradioVoiceRequest
): Promise<GradioVoiceResponse> {
  const {
    audioBlob,
    spaceId = 'fixie-ai/ultravox-v0_4',
    apiName = '/respond',
  } = request;

  console.log(`[GradioVoice] Sending audio to ${spaceId}...`);

  try {
    const client = await getGradioClient(spaceId);

    // Convert blob to a format Gradio can accept
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

    // Call the space's API
    const result = await client.predict(apiName, [audioFile]);

    console.log(`[GradioVoice] Got response from ${spaceId}`);

    // Parse the result - different spaces return different formats
    let audioBuffer: ArrayBuffer | null = null;
    let text = '';

    if (result?.data) {
      for (const item of result.data) {
        if (item instanceof Blob || item?.url) {
          // Audio response
          try {
            const url = item.url || URL.createObjectURL(item);
            const response = await fetch(url);
            audioBuffer = await response.arrayBuffer();
          } catch {
            // Skip failed audio fetch
          }
        } else if (typeof item === 'string') {
          text = item;
        } else if (item?.text) {
          text = item.text;
        }
      }
    }

    return {
      audioBuffer,
      text,
      spaceId,
      success: true,
    };
  } catch (error) {
    console.error(`[GradioVoice] Error with ${spaceId}:`, error);
    return {
      audioBuffer: null,
      text: '',
      spaceId,
      success: false,
    };
  }
}

/**
 * Check if a Gradio voice space is available.
 */
export async function isVoiceSpaceAvailable(spaceId: string): Promise<boolean> {
  try {
    const client = await getGradioClient(spaceId);
    return !!client;
  } catch {
    return false;
  }
}
