/**
 * MCP Tool — Text-to-Speech
 * =========================
 * تحويل نص إلى صوت (TTS) عبر Microsoft Edge Read Aloud (مجاني 100%).
 * بيدعم كل الأصوات العربية (مصري، سعودي، إماراتي، إلخ).
 *
 * NOTE: `generateSpeech` فعليًا اسمها `synthesizeSpeech` في `@/lib/edge-tts`.
 * لكن عشان نحافظ على الـ interface المطلوب (text + {voice}) عملنا wrapper هنا.
 */
import type { MCPTool } from "../types";
import { synthesizeSpeech, ARABIC_VOICES, EGYPTIAN_VOICES } from "@/lib/edge-tts";

/** واجهة موحّدة عشان الـ caller يستدعي generateSpeech(text, {voice}) */
async function generateSpeech(
  text: string,
  options: { voice?: string } = {},
): Promise<{ audioBuffer: Buffer; format: string }> {
  const audioBuffer = await synthesizeSpeech({ text, voice: options.voice });
  return { audioBuffer, format: "audio/mpeg" };
}

export const ttsGenerateTool: MCPTool = {
  name: "tts_generate",
  description:
    "Convert text to speech (audio MP3). Returns base64-encoded audio. Supports Arabic and English voices. Pass a voice id (e.g. 'ar-EG-ShakirNeural') or leave empty for default Egyptian male voice.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to synthesize into speech.",
      },
      voice: {
        type: "string",
        description:
          "Voice identifier. Examples: 'ar-EG-ShakirNeural' (Egyptian male), 'ar-EG-SalmaNeural' (Egyptian female), 'ar-SA-HamedNeural' (Saudi male). Optional.",
        default: "ar-EG-ShakirNeural",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const voice = String(params.voice || "ar-EG-ShakirNeural").trim();

    if (!text) {
      return { success: false, error: "text مطلوبة" };
    }

    try {
      const result = await generateSpeech(text, { voice });
      const base64 = `data:${result.format};base64,${result.audioBuffer.toString("base64")}`;

      return {
        success: true,
        data: {
          text,
          voice,
          format: result.format,
          sizeBytes: result.audioBuffer.length,
          audioBase64: base64,
        },
      };
    } catch (e: any) {
      return { success: false, error: `TTS فشل: ${e.message}` };
    }
  },
};

// Export voices metadata للاستخدام الخارجي
export { ARABIC_VOICES, EGYPTIAN_VOICES };
