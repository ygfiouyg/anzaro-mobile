/**
 * MCP Tool: Audio Transcribe & Summarize
 * القسم 2 #6: "Transcribe Audio Files, Summarize with GPT-4, and Store in Notion"
 * 
 * الخطوات:
 * 1. اقبل صوت (base64) → حوله لنص (ZAI ASR)
 * 2. لخّص النص بالـ AI
 * 3. استخرج نقاط رئيسية + قرارات
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";
import { callGLMForJSON } from "../json-helper";

export const audioTranscribeTool: MCPTool = {
  name: "audio_transcribe_summarize",
  description: "تحويل صوت لنص + تلخيص + نقاط رئيسية (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل صوت' أو 'transcribe' أو 'اجتماع صوتي'.",
  parameters: {
    type: "object",
    properties: {
      audioBase64: { type: "string", description: "صوت بصيغة base64 (مع أو بدون data:prefix)" },
      language: { type: "string", description: "اللغة (افتراضي: ar)", default: "ar" },
    },
    required: ["audioBase64"],
  },
  async execute(params) {
    let audioBase64 = String(params.audioBase64 || "").trim();
    const language = String(params.language || "ar");
    if (!audioBase64) return { success: false, error: "audioBase64 مطلوب" };

    // شيل data: prefix لو موجود
    if (audioBase64.startsWith("data:")) {
      audioBase64 = audioBase64.split(",")[1] || audioBase64;
    }

    try {
      // 1) ASR — صوت → نص
      const zai = await getZAIClient();
      let transcript = "";
      try {
        const asrResult = await zai.audio.asr.create({ file_base64: audioBase64 });
        transcript = asrResult?.text || "";
      } catch (e: any) {
        return { success: false, error: `فشل ASR: ${e.message}` };
      }

      if (!transcript || transcript.length < 5) {
        return { success: false, error: "الـ ASR رجّع نص فاضي — تأكد من جودة الصوت" };
      }

      // 2) تلخيص + نقاط رئيسية
      const summary = await callGLMForJSON({
        systemPrompt: `أنت ملخّص محترف. لخّص النص ده (مدخل صوتي محوّل لنص).
اللغة: ${language}

رجّع JSON:
{
  "summary": "ملخص 3-5 أسطر",
  "key_points": ["نقطة 1","نقطة 2","نقطة 3"],
  "decisions": ["قرار 1","قرار 2"],
  "action_items": ["مهمة 1","مهمة 2"],
  "participants": ["اسم 1"],
  "topics": ["موضوع 1"]
}`,
        userMessage: transcript.slice(0, 4000),
        maxTokens: 800,
        temperature: 0.3,
      });

      const r = summary.data || {};

      return {
        success: true,
        data: {
          scenario: "audio_transcribe_summarize",
          transcript_length: transcript.length,
          steps: { transcribe: true, summarize: !!r.summary },
          transcript: transcript.slice(0, 2000),
          summary: r.summary || "",
          key_points: r.key_points || [],
          decisions: r.decisions || [],
          action_items: r.action_items || [],
          participants: r.participants || [],
          topics: r.topics || [],
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
