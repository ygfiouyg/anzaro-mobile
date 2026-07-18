// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Voice Chat API Route
// ═══════════════════════════════════════════════════════════════════════
// Full voice chat pipeline: Audio → ASR → Chat → TTS → Audio
// Uses multiple providers with fallback for reliability
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/hf-asr.service';
import { generateMMSAudio, generateMMSAudioAuto, VOICES } from '@/lib/hf-tts.service';
import { getZAIClient } from '@/lib/chat-utils';
import { streamChatCompletion } from '@/lib/pollinations';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { resolveActiveModel } from "@/lib/active-model";


// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth check and rate limiting to Voice Chat ──
    // Previously had no auth at all — anyone could use the full pipeline
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    // Allow guests with strict rate limits, authenticated users get more
    const rateLimitResponse = checkRateLimit(
      request,
      user ? { ...RATE_LIMIT_PRESETS.media, maxRequests: 20 } : { ...RATE_LIMIT_PRESETS.media, maxRequests: 5 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const voiceId = (formData.get('voice') as string) || 'hf-mms-shakir';
    const language = (formData.get('language') as string) || 'ar';
    const mode = (formData.get('mode') as string) || 'pipeline';

    if (!audioFile) {
      return NextResponse.json({ error: 'ملف الصوت مطلوب' }, { status: 400 });
    }

    console.log(`[VoiceChat] New request: voice=${voiceId}, language=${language}, mode=${mode}, audioSize=${(audioFile.size / 1024).toFixed(1)}KB`);

    // ── Step 1: ASR (Audio → Text) ────────────────────────────────────
    console.log('[VoiceChat] Step 1: ASR...');
    const audioBuffer = await audioFile.arrayBuffer();

    let transcribedText = '';
    let asrProvider = '';

    try {
      const asrResult = await transcribeAudio({
        audioData: audioBuffer,
        language,
        provider: 'hf-distil-whisper',
      });
      transcribedText = asrResult.text;
      asrProvider = asrResult.provider;
    } catch (asrError) {
      console.error('[VoiceChat] ASR failed:', asrError instanceof Error ? asrError.message : String(asrError));
      return NextResponse.json(
        { error: 'فشل في تحويل الصوت إلى نص. حاول مرة أخرى.' },
        { status: 500 }
      );
    }

    if (!transcribedText || transcribedText.trim().length === 0) {
      return NextResponse.json(
        { error: 'لم أسمع شيئاً. حاول تاني.' },
        { status: 400 }
      );
    }

    console.log(`[VoiceChat] ASR result: "${transcribedText}" (provider: ${asrProvider})`);

    // ── Step 2: Chat (Text → Response) with fallback providers ────────
    console.log('[VoiceChat] Step 2: Chat...');
    const chatStartTime = Date.now();

    let responseText = '';
    let chatProvider = 'zai';

    // Try Z-AI SDK first, then Pollinations as fallback
    try {
      const zai = await getZAIClient();
      const result = await zai.chat.completions.create({
        model: (body.model || 'glm-4-flash'),
        messages: [
          {
            role: 'system',
            content: 'أنت مساعد ذكي اسمه بعقل. أجب بإيجاز ووضوح بالعربية. ردك هيتم تحويله لصوت فخليه قصير ومفيد. لا تستخدم رموز أو تنسيق معقد.',
          },
          { role: 'user', content: transcribedText },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      responseText = result.choices?.[0]?.message?.content || '';
      chatProvider = 'zai';
    } catch (zaiError) {
      console.warn('[VoiceChat] Z-AI SDK failed, trying Pollinations fallback:', zaiError instanceof Error ? zaiError.message : String(zaiError));

      // Fallback: Use Pollinations (free, no API key needed)
      try {
        const chunks: string[] = [];
        for await (const chunk of await streamChatCompletion({
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant called Ba3qal (بعقل). Answer briefly and clearly in Arabic. Your response will be converted to audio so keep it short and useful. Do not use symbols or complex formatting.',
            },
            { role: 'user', content: transcribedText },
          ],
          model: 'openai',
          temperature: 0.7,
          max_tokens: 300,
        })) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) chunks.push(content);
        }
        responseText = chunks.join('');
        chatProvider = 'pollinations';
      } catch (pollinationsError) {
        console.error('[VoiceChat] Pollinations fallback also failed:', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
        return NextResponse.json(
          { error: 'فشل في توليد الرد. حاول مرة أخرى.' },
          { status: 500 }
        );
      }
    }

    const chatTime = Date.now() - chatStartTime;

    if (!responseText) {
      return NextResponse.json(
        { error: 'لم أتمكن من توليد رد. حاول مرة أخرى.' },
        { status: 500 }
      );
    }

    console.log(`[VoiceChat] Chat result: "${responseText.slice(0, 80)}" (${chatTime}ms, provider: ${chatProvider})`);

    // ── Step 3: TTS (Response → Audio) — respect voiceId choice ──────
    // Voice selection flow: voiceId → VOICES lookup → language → MMS model
    //   'hf-mms-shakir' → arz → facebook/mms-tts-arz (Egyptian)
    //   'hf-mms-fusha'  → ara → facebook/mms-tts-ara  (MSA/Fusha)
    //   unknown/default  → auto-detect from text content (defaults to MSA)
    const selectedVoiceForLog = VOICES.find(v => v.id === voiceId);
    console.log(`[VoiceChat] Step 3: TTS with voice=${voiceId} → language=${selectedVoiceForLog?.language || 'auto-detect'} (${selectedVoiceForLog?.nameAr || 'تلقائي'})`);
    const ttsStartTime = Date.now();

    let audioBufferResult: Buffer;
    let ttsProvider = '';
    let duration = 0;

    try {
      // Pass voiceId to generateMMSAudioAuto so it respects user's voice selection
      audioBufferResult = await generateMMSAudioAuto(responseText, voiceId);
      ttsProvider = 'hf-mms';

      // Determine which language model was used based on voiceId
      const selectedVoice = VOICES.find(v => v.id === voiceId);
      const usedLangLabel = selectedVoice ? selectedVoice.nameAr : 'تلقائي';

      // Estimate duration: ~150 chars/sec for Arabic TTS
      duration = Math.ceil(responseText.length / 150);
      console.log(`[VoiceChat] TTS voice: ${usedLangLabel} (${voiceId})`);
    } catch (ttsError) {
      console.error('[VoiceChat] TTS failed:', ttsError instanceof Error ? ttsError.message : String(ttsError));
      // Return text-only response if TTS fails
      return NextResponse.json({
        text: transcribedText,
        response: responseText,
        audio: null,
        duration: 0,
        asrProvider,
        ttsProvider: 'none',
        chatProvider,
        chatTime,
        ttsTime: 0,
      });
    }

    const ttsTime = Date.now() - ttsStartTime;
    console.log(`[VoiceChat] TTS done: ${duration}s, ${(audioBufferResult.length / 1024).toFixed(1)}KB (${ttsTime}ms)`);

    // Return audio as base64 in JSON
    const audioBase64 = audioBufferResult.toString('base64');

    return NextResponse.json({
      text: transcribedText,
      response: responseText,
      audio: `data:audio/wav;base64,${audioBase64}`,
      duration,
      asrProvider,
      ttsProvider,
      chatProvider,
      chatTime,
      ttsTime,
    });
  } catch (error) {
    console.error('[VoiceChat] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في المحادثة الصوتية. حاول مرة أخرى.' },
      { status: 500 }
    );
  }
}
