/**
 * POST /api/telegram/webhook
 * SYNCHRONOUS — processes message and sends reply before returning 200.
 * All errors are sent to the user as messages (for debugging).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';

  try {
    const update = await req.json();

    if (!token) {
      return NextResponse.json({ ok: true, error: 'no token' });
    }

    const msg = update.message;
    if (!msg || !msg.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat.id;
    const text = msg.text || '';

    // Handle /start
    if (text === '/start') {
      await sendMsg(token, chatId, '👋 أهلاً بك في DeltaAI Bot! ابعث أي سؤال وأنا هرد عليك.');
      return NextResponse.json({ ok: true });
    }

    // Handle /help
    if (text === '/help') {
      await sendMsg(token, chatId, '📋 اسأل أي سؤال بـ GLM-5.2');
      return NextResponse.json({ ok: true });
    }

    // Skip commands and non-text
    if (!text || text.startsWith('/')) {
      return NextResponse.json({ ok: true });
    }

    // Send typing
    await sendAction(token, chatId, 'typing');

    // Get AI response
    let reply: string;
    try {
      const zai = await getZAIClient();
      const completion = await zai.chat.completions.create({
        model: 'glm-5.2',
        messages: [
          { role: 'system', content: 'أنت DeltaAI Bot على Telegram. رد بالعربية. كن مختصراً ومفيداً.' },
          { role: 'user', content: text },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      });
      reply = completion?.choices?.[0]?.message?.content || 'عذراً، لم أتمكن من الرد.';
    } catch (aiErr: any) {
      // Send the actual error to the user so we can see what's wrong
      reply = '❌ خطأ في AI: ' + aiErr.message;
    }

    // Send reply
    await sendMsg(token, chatId, reply);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // If anything fails, try to send the error to the chat
    try {
      const update = await req.clone().json();
      const chatId = update?.message?.chat?.id;
      if (chatId && token) {
        await sendMsg(token, chatId, '❌ خطأ: ' + e.message);
      }
    } catch {}
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ endpoint: 'telegram-webhook', status: 'ready' });
}

async function sendMsg(token: string, chatId: number, text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[TG] sendMessage failed ${res.status}: ${errBody.slice(0, 200)}`);
    throw new Error(`sendMessage ${res.status}: ${errBody.slice(0, 100)}`);
  }
}

async function sendAction(token: string, chatId: number, action: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}
