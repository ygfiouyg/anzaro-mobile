import { NextResponse } from 'next/server';
import { isGradioTTSAvailable } from '@/lib/gradio-tts.service';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro AI — TTS Status Check
// ═══════════════════════════════════════════════════════════════════════
// Returns the current TTS configuration and provider availability.
// Priority: HF Inference API → Gradio Space → Google TTS → ZAI SDK
// ═══════════════════════════════════════════════════════════════════════

export async function GET() {
  // Check for HF token
  const hfToken = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN || '';
  const hasHFToken = hfToken.length > 0;
  const tokenPreview = hasHFToken ? `${hfToken.substring(0, 5)}...${hfToken.substring(hfToken.length - 4)}` : 'NOT_SET';

  // Check if Gradio Space is available (quick check)
  let gradioAvailable = false;
  try {
    gradioAvailable = await isGradioTTSAvailable();
  } catch {
    gradioAvailable = false;
  }

  // Available providers
  const providers: Record<string, { available: boolean; voices: string[]; note?: string }> = {
    'hf-inference-mms': {
      available: hasHFToken,
      voices: ['شاكر (عربي مصري 🇪🇬🏆)', 'فصحى (عربي فصحى 📖)'],
      note: hasHFToken
        ? 'facebook/mms-tts-arz — HF Inference API شغال ✅'
        : 'يحتاج HUGGINGFACE_API_TOKEN',
    },
    'gradio-mms': {
      available: gradioAvailable,
      voices: ['شاكر (عربي مصري 🇪🇬)'],
      note: gradioAvailable
        ? 'kopabdo/mms-tts-arabic — المساحة شغالة ✅'
        : 'المساحة مش شغالة أو بتبني — هيشتغل أوتي',
    },
    'google-tts': {
      available: true,
      voices: ['Google Arabic (فصحى)', 'Google English'],
      note: 'مجاني — لا يحتاج توكن، لكن فصحى فقط (مش مصري)',
    },
    'zai-sdk': {
      available: true,
      voices: ['Kazi', 'Tongtong', 'Jam'],
      note: 'إنجليزي/صيني فقط — لا يتكلم عربي',
    },
  };

  const overallStatus = hasHFToken ? 'ready' : gradioAvailable ? 'ready' : 'limited';

  return NextResponse.json({
    status: overallStatus,
    message: hasHFToken
      ? 'الصوت المصري (MMS Inference) متاح! 🇪🇬🏆'
      : gradioAvailable
        ? 'الصوت المصري (MMS Gradio) متاح! 🇪🇬'
        : 'بيستخدم Google TTS (فصحى) — MMS Inference لسه بيشتغل',
    token: {
      present: hasHFToken,
      preview: tokenPreview,
      envVars: {
        HUGGINGFACE_API_TOKEN: !!process.env.HUGGINGFACE_API_TOKEN,
        HF_TOKEN: !!process.env.HF_TOKEN,
      },
    },
    providers,
    priority: hasHFToken
      ? ['hf-inference-mms (عربي مصري 🇪🇬🏆)', 'gradio-mms (fallback)', 'google-tts (fallback)', 'zai-sdk (English)']
      : gradioAvailable
        ? ['gradio-mms (عربي مصري 🇪🇬)', 'google-tts (fallback)', 'zai-sdk (English)']
        : ['google-tts (فصحى فقط!)', 'gradio-mms (يشتغل أوتي)', 'zai-sdk (English only)'],
    models: {
      egyptianArabic: 'facebook/mms-tts-arz',
      standardArabic: 'facebook/mms-tts-ara',
      gradioSpace: 'kopabdo/mms-tts-arabic',
    },
  });
}
