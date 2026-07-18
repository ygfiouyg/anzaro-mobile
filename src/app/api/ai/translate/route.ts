import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { traceTranslation, traceError } from '@/lib/trace-logger';
import { resolveActiveModel } from "@/lib/active-model";


// ─── ZAI SDK Singleton ───────────────────────────────────────────────
declare global {
  var _zaiClientTranslate: any;
}

async function getZAIClient() {
  if (!globalThis._zaiClientTranslate) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._zaiClientTranslate = await ZAI.create();
  }
  return globalThis._zaiClientTranslate;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check — translation requires authentication
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const body = await request.json();
    const { text, from, to } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال النص للترجمة' }, { status: 400 });
    }

    if (!from || !to) {
      return NextResponse.json({ error: 'يرجى تحديد لغة المصدر والهدف' }, { status: 400 });
    }

    traceTranslation(`ترجمة من ${from} إلى ${to}: ${text.slice(0, 40)}`);

    const zai = await getZAIClient();

    const languageNames: Record<string, string> = {
      ar: 'Arabic',
      en: 'English',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      tr: 'Turkish',
      ur: 'Urdu',
      ms: 'Malay',
      id: 'Indonesian',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      ru: 'Russian',
      pt: 'Portuguese',
      it: 'Italian',
      hi: 'Hindi',
      fa: 'Persian',
      egyptian: 'Egyptian Arabic dialect',
    };

    const fromName = languageNames[from] || from;
    const toName = languageNames[to] || to;

    const translationPrompt = `You are a professional translator. Translate the following text from ${fromName} to ${toName}. Only return the translated text, nothing else. Preserve the tone, meaning, and context of the original text. If the text contains idioms or cultural references, adapt them appropriately for the target language.

Text to translate:
${text}`;

    const response = await zai.chat.completions.create({
      model: (body.model || 'glm-4-flash'),
      messages: [
        { role: 'system', content: translationPrompt },
        { role: 'user', content: text },
      ],
      stream: false,
    });

    const translatedText = response.choices?.[0]?.message?.content || '';

    if (!translatedText) {
      traceError('لم يتم الحصول على ترجمة من النموذج');
      return NextResponse.json(
        { error: 'لم يتم الترجمة. يرجى المحاولة مرة أخرى.' },
        { status: 500 }
      );
    }

    traceTranslation('تمت الترجمة بنجاح');

    return NextResponse.json({
      translatedText,
      from,
      to,
    });
  } catch (error) {
    traceError(`خطأ في الترجمة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    globalThis._zaiClientTranslate = null;
    return NextResponse.json(
      { error: 'حدث خطأ أثناء الترجمة. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
