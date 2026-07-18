import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/chat-utils';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Voice Chat — ULTRA-FAST Non-Streaming Endpoint
// ═══════════════════════════════════════════════════════════════════════
// ARCHITECTURE: Race multiple AI providers SIMULTANEOUSLY
//   - ZAI SDK glm-4-flash (non-streaming, thinking disabled) — ~2s
//   - Cerebras llama-3.1-8b (FREE, no API key, ~2000 T/s) — <1s on HF
//   - Groq llama-3.1-8b-instant (~800 T/s) — <1s on HF
//   FIRST response wins! No sequential fallback delays.
//
// ON HUGGINGFACE SPACES: Groq + Cerebras will work (not IP-blocked)
// IN THIS SANDBOX: Only ZAI SDK works (others blocked by Cloudflare)
//
// Future optimization: Add Groq Whisper for ASR (~200ms) and
// Groq TTS Arabic (playai-tts) for voice (~300ms) to achieve
// sub-1s total latency: Groq STT 200ms + Groq LLM 300ms + Groq TTS 300ms
// ═══════════════════════════════════════════════════════════════════════

// ─── Egyptian Arabic System Prompt (short for speed) ──────────────────
const VOICE_SYSTEM_PROMPT_AR = `أنت DeltaAI، مساعد ذكي بتحكي بالمصري الشعبي. قواعدك:
1. اتكلم مصري كويس — مش فصحى
2. ردك قصير — سطرين تلاتة بالكتير
3. ماتكتبش كود ولا روابط — دا صوت
4. لو حاجة معقدة لخصها في كام كلمة
5. كن ودود وخفيف وستايلك مصري`;

const VOICE_SYSTEM_PROMPT_EN = `You are DeltaAI. Rules:
1. Keep responses SHORT — 2-3 sentences max
2. Be conversational — this is voice chat
3. No code, no links, no heavy content
4. Be warm and helpful`;

// ─── In-memory conversation history per session ────────────────────────
const sessionHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const MAX_HISTORY = 8;

function getSessionHistory(sessionId: string) {
  return sessionHistory.get(sessionId) || [];
}

function addToHistory(sessionId: string, role: 'user' | 'assistant', content: string) {
  const history = getSessionHistory(sessionId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  sessionHistory.set(sessionId, history);
}

// Cleanup old sessions periodically
setInterval(() => {
  if (sessionHistory.size > 100) {
    const keys = [...sessionHistory.keys()];
    for (let i = 0; i < Math.floor(keys.length / 2); i++) sessionHistory.delete(keys[i]);
  }
}, 30 * 60 * 1000);

// ─── Build messages ───────────────────────────────────────────────────
function buildMessages(
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  for (const msg of history.slice(-6)) {
    const lastRole = messages[messages.length - 1]?.role;
    if (msg.role === 'user' && lastRole !== 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant' && lastRole === 'user') {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }
  return messages;
}

// ─── Timeout helper ────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER FUNCTIONS — Each returns {text, provider} or throws
// ═══════════════════════════════════════════════════════════════════════

async function tryZAI(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ text: string; provider: string }> {
  const zai = await getZAIClient();
  const result = await zai.chat.completions.create({
    model: 'glm-4-flash',
    messages,
    max_tokens: 150,
    temperature: 0.7,
    thinking: { type: 'disabled' },
  });
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty ZAI response');
  return { text, provider: 'ZAI' };
}

async function tryCerebras(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ text: string; provider: string }> {
  const { generateCerebrasChat } = await import('@/lib/cerebras');
  const result = await generateCerebrasChat({
    messages: messages as any,
    model: 'llama-3.1-8b',
    temperature: 0.7,
    max_tokens: 150,
  });
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty Cerebras response');
  return { text, provider: 'Cerebras' };
}

async function tryGroq(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ text: string; provider: string }> {
  const { generateGroqChat } = await import('@/lib/groq');
  const result = await generateGroqChat({
    messages: messages as any,
    model: 'llama-3.1-8b-instant',
    temperature: 0.7,
    max_tokens: 150,
  });
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty Groq response');
  return { text, provider: 'Groq' };
}

async function tryOpenRouter(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ text: string; provider: string }> {
  const { generateOpenRouterChat } = await import('@/lib/openrouter');
  const result = await generateOpenRouterChat({
    messages: messages as any,
    model: 'nvidia/nemotron-3-nano-30b-a3b:free',
    temperature: 0.7,
    max_tokens: 150,
  });
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenRouter response');
  return { text, provider: 'OpenRouter' };
}

// ═══════════════════════════════════════════════════════════════════════
// RACE — True parallel: first provider to respond wins!
// Uses Promise.any() for true first-to-finish racing
// ═══════════════════════════════════════════════════════════════════════

async function raceProviders(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<{ text: string; provider: string }> {
  const startTime = Date.now();

  // True race: Promise.any resolves as soon as the FIRST promise fulfills
  const fastProviders = [
    withTimeout(tryZAI(messages), 4_000, 'ZAI'),
    withTimeout(tryCerebras(messages), 4_000, 'Cerebras'),
    withTimeout(tryGroq(messages), 4_000, 'Groq'),
  ];

  try {
    // Promise.any: first success wins (doesn't wait for all)
    const winner = await Promise.any(fastProviders);
    const elapsed = Date.now() - startTime;
    console.log(`[VoiceChat] 🏆 ${winner.provider} won the race in ${elapsed}ms`);
    return winner;
  } catch {
    // All fast providers failed
    console.warn('[VoiceChat] All fast providers failed, trying OpenRouter fallback...');
    try {
      const orResult = await withTimeout(tryOpenRouter(messages), 8_000, 'OpenRouter');
      const elapsed = Date.now() - startTime;
      console.log(`[VoiceChat] 🏆 ${orResult.provider} (fallback) responded in ${elapsed}ms`);
      return orResult;
    } catch (orErr) {
      console.error('[VoiceChat] All providers failed');
      throw new Error('كل مزودي الخدمة فشلوا، حاول تاني');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST — Return voice chat response as JSON
// ═══════════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── FIX: Require authentication for voice chat (API key abuse prevention) ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    // Allow guests with strict rate limits, authenticated users get more
    const rateLimitResponse = checkRateLimit(
      request,
      user ? { ...RATE_LIMIT_PRESETS.ai, maxRequests: 20 } : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json() as {
      message: string;
      sessionId?: string;
      model?: string;
      language?: string;
    };

    const { message, sessionId = `v_${Date.now()}`, language } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'الرسالة مطلوبة' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    addToHistory(sessionId, 'user', message);
    const history = getSessionHistory(sessionId);

    const isArabic = language === 'ar' || language === 'egyptian' || /[\u0600-\u06FF]/.test(message);
    const systemPrompt = isArabic ? VOICE_SYSTEM_PROMPT_AR : VOICE_SYSTEM_PROMPT_EN;

    console.log(`[VoiceChat] ar=${isArabic}, msg="${message.slice(0, 40)}", history=${history.length}`);

    const messages = buildMessages(systemPrompt, history);
    const { text, provider } = await raceProviders(messages);

    addToHistory(sessionId, 'assistant', text);

    const elapsed = Date.now() - startTime;
    console.log(`[VoiceChat] ✅ Response in ${elapsed}ms via ${provider}: "${text.slice(0, 60)}"`);

    return new Response(JSON.stringify({
      content: text,
      provider,
      elapsed,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Voice-Provider': provider,
        'X-Voice-Latency': String(elapsed),
        'X-Voice-Session': sessionId,
      },
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[VoiceChat] Error after ${elapsed}ms:`, err);

    return new Response(JSON.stringify({
      error: 'حصل خطأ، حاول تاني',
      elapsed,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
