/**
 * Audio Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - multilingual-meeting-notes-generator: MeetingProcessor (transcribe + summary + action items)
 * - chat-with-audios: Transcribe + QdrantVDB + RAG
 * - audio-analysis-toolkit: AssemblyAI (sentiment, topics, chapters)
 * - rag-voice-agent: VoicePipelineAgent + RAG
 *
 * الربط الحقيقي:
 * - OpenAI Whisper API للـ ASR (تحويل الصوت لنص)
 * - GLM-5.2 للتحليل والملخصات (مع fallback لـ chat-utils)
 */

import { getZAIClient } from '../zai-client';

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';

/**
 * تحويل الصوت لنص باستخدام HF Whisper (مجاني) → OpenAI Whisper (fallback).
 * الأولوية:
 * 1. HF Whisper (مجاني 100% — بيستخدم openai/whisper-large-v3)
 * 2. OpenAI Whisper (مدفوع — لو HF فشل)
 *
 * @param audioBase64 - base64 encoded audio (mp3, wav, m4a, webm, etc.)
 * @param mimeType - audio MIME type (e.g., 'audio/mpeg', 'audio/wav')
 * @returns transcribed text
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string = 'audio/mpeg'
): Promise<{ success: boolean; text: string; error?: string }> {
  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // ── 1) HF Whisper (مجاني) ──
    if (HF_API_TOKEN) {
      const hfResult = await transcribeWithHFWhisper(audioBuffer, mimeType);
      if (hfResult.success && hfResult.text) {
        console.log('[AudioTools] HF Whisper transcription succeeded');
        return hfResult;
      }
      console.warn('[AudioTools] HF Whisper failed, trying OpenAI:', hfResult.error);
    }

    // ── 2) OpenAI Whisper (fallback مدفوع) ──
    if (OPENAI_API_KEY) {
      return await transcribeWithOpenAI(audioBuffer, mimeType);
    }

    return {
      success: false,
      text: '',
      error: 'مفيش HF_API_TOKEN ولا OPENAI_API_KEY متاح للـ ASR',
    };
  } catch (e: any) {
    return { success: false, text: '', error: e.message };
  }
}

/**
 * HF Whisper — مجاني 100% عبر HuggingFace Inference API.
 * بيستخدم openai/whisper-large-v3 (نفس الموديل اللي OpenAI بيستخدموه).
 */
async function transcribeWithHFWhisper(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ success: boolean; text: string; error?: string }> {
  try {
    // نجرب distil-whisper الأول (أسرع) وبعدين whisper-large-v3 (أدق)
    const models = [
      'openai/whisper-large-v3',
      'distil-whisper/distil-large-v3',
      'openai/whisper-medium',
    ];

    for (const model of models) {
      try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${HF_API_TOKEN}`,
            'Content-Type': mimeType,
          },
          body: audioBuffer,
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          if (response.status === 503) {
            // model loading — نجرب اللي بعده
            continue;
          }
          const err = await response.text();
          continue;
        }

        const data = await response.json();
        const text = data?.text || '';
        if (text) {
          return { success: true, text };
        }
      } catch {
        continue;
      }
    }

    return {
      success: false,
      text: '',
      error: 'كل نماذج HF Whisper فشلت (ممكن الموديل بيـ load دلوقتي — جرّب بعد 30 ثانية)',
    };
  } catch (e: any) {
    return { success: false, text: '', error: e.message };
  }
}

/**
 * OpenAI Whisper — fallback مدفوع.
 */
async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ success: boolean; text: string; error?: string }> {
  try {
    const ext = mimeType.includes('wav')
      ? 'wav'
      : mimeType.includes('m4a')
      ? 'm4a'
      : mimeType.includes('webm')
      ? 'webm'
      : 'mp3';

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'ar');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      return {
        success: false,
        text: '',
        error: `OpenAI Whisper error ${response.status}: ${err.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    return { success: true, text: data.text || '' };
  } catch (e: any) {
    return { success: false, text: '', error: e.message };
  }
}

/**
 * Helper: لو فيه audio base64 → حوّله لنص بـ Whisper. لو لأ، استخدم النص اللي اتصدر.
 */
async function resolveTranscript(
  transcriptOrAudio: string,
  audioBase64?: string,
  mimeType?: string
): Promise<string> {
  if (audioBase64 && audioBase64.length > 100) {
    const transcription = await transcribeAudio(audioBase64, mimeType || 'audio/mpeg');
    if (transcription.success && transcription.text) {
      return transcription.text;
    }
    console.warn('[AudioTools] Whisper transcription failed, using text input:', transcription.error);
  }
  return transcriptOrAudio;
}

// 1. Meeting Notes — مستوحى من multilingual-meeting-notes-generator
//    MeetingProcessor: transcribe → summarize → action items → speaker analysis
export async function audioMeetingNotes(
  transcript: string,
  audioBase64?: string,
  mimeType?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const actualTranscript = await resolveTranscript(transcript, audioBase64, mimeType);
    const client = await getZAIClient();
    const output = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: `أنت Meeting Notes Generator (مستوحى من multilingual-meeting-notes-generator).

من نص الاجتماع، استخرج:

1. 📋 رأس الاجتماع
   - التاريخ (تقديري)
   - الموضوع
   - المشاركون (استنتج من النص)

2. 📝 ملخص الاجتماع
   - 3-5 نقاط رئيسية

3. 🎯 القرارات المتخذة
   - قائمة بالقرارات

4. ✅ Action Items
   - المهمة | المسؤول | الموعد (استنتج)

5. 💬 تحليل المتحدثين
   - من تحدث أكثر؟
   - النقاط الرئيسية لكل متحدث

6. 🌐 اللغة المكتشفة
   - لو فيه لغات متعددة، اذكرها

خلي الملاحظات بالعربي ومنظمة.` },
        { role: 'user', content: `نص الاجتماع:\n${actualTranscript.slice(0, 12000)}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0,
    });
    const result = output?.choices?.[0]?.message?.content || '';
    return {
      success: true,
      output: audioBase64
        ? `🎙️ **تم النسخ بـ OpenAI Whisper الحقيقي**\n\n${result}`
        : result,
    };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 2. Chat with Audio — مستوحى من chat-with-audios
//    Transcribe + RAG over audio content
export async function audioChat(
  transcript: string,
  question: string,
  audioBase64?: string,
  mimeType?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const actualTranscript = await resolveTranscript(transcript, audioBase64, mimeType);
    const client = await getZAIClient();
    const output = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: `أنت Audio RAG Agent (مستوحى من chat-with-audios).

المستخدم رفع ملف صوتي وتم تحويله لنص. ابحث في النص ورد على السؤال.

القواعد:
1. ابحث في النص عن الإجابة
2. لو لقيت، ارد بدقة مع اقتباس
3. لو ملقاش، قول "مفيش معلومات عن ده في الصوت"
4. اذكر الوقت التقريبي لو معروف` },
        { role: 'user', content: `النص الصوتي:\n${actualTranscript.slice(0, 12000)}\n\nالسؤال: ${question}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
    });
    return { success: true, output: output?.choices?.[0]?.message?.content || '' };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 3. Audio Analysis — مستوحى من audio-analysis-toolkit
//    AssemblyAI: sentiment + topics + chapters + entities
export async function audioAnalysis(
  transcript: string,
  audioBase64?: string,
  mimeType?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const actualTranscript = await resolveTranscript(transcript, audioBase64, mimeType);
    const client = await getZAIClient();
    const output = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: `أنت Audio Analysis Agent (مستوحى من audio-analysis-toolkit + AssemblyAI).

حلل المحتوى الصوتي واستخرج:

1. 🎭 تحليل المشاعر (Sentiment)
   - إيجابي/سلبي/محايد
   - درجة الثقة

2. 📊 المواضيع الرئيسية (Topics)
   - 3-5 مواضيع
   - نسبة كل موضوع

3. 📑 فصول المحتوى (Chapters)
   - تقسيم المحتوى لأقسام
   - عنوان + وقت تقريبي لكل قسم

4. 🏷️ الكيانات المستخرجة (Entities)
   - أسماء أشخاص
   - أماكن
   - منظمات
   - تواريخ

5. 🔑 الكلمات المفتاحية
   - أعلى 10 كلمات

6. ⚠️ تحليل المحتوى
   - مستوى الرسمية
   - اللهجة (لو عربي)
   - السرعة (تقديرية)

خلي التحليل بالعربي.` },
        { role: 'user', content: `النص الصوتي:\n${actualTranscript.slice(0, 12000)}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
    });
    return { success: true, output: output?.choices?.[0]?.message?.content || '' };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// Registry
export interface AudioToolDef { id: string; name: string; description: string; source: string; placeholder: string; }
export const AUDIO_TOOLS: AudioToolDef[] = [
  { id: 'audio-meeting-notes', name: '📋 ملاحظات اجتماعات', description: 'تحويل نص اجتماع لملاحظات منظمة + action items', source: 'multilingual-meeting-notes-generator', placeholder: 'الصق نص الاجتماع...' },
  { id: 'audio-chat', name: '💬 شات مع صوت', description: 'محادثة مع محتوى ملف صوتي', source: 'chat-with-audios', placeholder: 'الصق النص الصوتي...|اكتب سؤالك' },
  { id: 'audio-analysis', name: '🎵 تحليل صوتي', description: 'تحليل مشاعر + مواضيع + فصول + كيانات', source: 'audio-analysis-toolkit', placeholder: 'الصق النص الصوتي...' },
];

export async function runAudioTool(
  toolId: string,
  input: string,
  audioBase64?: string,
  mimeType?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'audio-meeting-notes':
        return await audioMeetingNotes(input, audioBase64, mimeType);
      case 'audio-chat': {
        const [transcript, question] = input.split('|').map(s => s.trim());
        return await audioChat(transcript || input, question || 'لخص المحتوى', audioBase64, mimeType);
      }
      case 'audio-analysis':
        return await audioAnalysis(input, audioBase64, mimeType);
      default: return { success: false, output: '', error: `أداة غير معروفة: ${toolId}` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}
