import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/chat-utils';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── Types ────────────────────────────────────────────────────────────
interface PodcastRequest {
  title: string;
  content: string;
  voice?: 'male' | 'female';
  language?: string;
}

interface PodcastScript {
  intro: string;
  segments: string[];
  outro: string;
  fullScript: string;
}

// ─── Extract JSON with balanced brace matching ───────────────────────
function extractJSON(text: string): string {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {}

  // String-aware brace tracking
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.substring(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          start = -1;
        }
      }
    }
  }

  // Last resort
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth check and rate limiting to Podcast ──
    // Previously had no auth — anyone could generate podcast scripts
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    // Allow guests with strict rate limits, authenticated users get more
    const rateLimitResponse = checkRateLimit(
      request,
      user ? { ...RATE_LIMIT_PRESETS.ai, maxRequests: 15 } : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body: PodcastRequest = await request.json();
    const { title, content, voice = 'male', language = 'ar' } = body;

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال عنوان البودكاست' }, { status: 400 });
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال المحتوى' }, { status: 400 });
    }

    // ─── Generate Podcast Script ────────────────────────────────────
    const voiceLabel = voice === 'female' ? 'أنثى' : 'ذكر';
    const voiceStyle = voice === 'female'
      ? 'استخدم أسلوب أنثوي دافئ وجذاب، عبارات رقيقة وحماسية'
      : 'استخدم أسلوب ذكوري واثق ومؤثر، عبارات قوية ومباشرة';
    const languageLabel = language === 'ar' ? 'العربية' : language;

    const systemPrompt = `أنت كاتب محتوى بودكاست محترف باللغة العربية. قم بتحويل المحتوى المقدم إلى سكريبت بودكاست جذاب ومنظم.

صوت المقدم: ${voiceLabel}
اللغة: ${languageLabel}
أسلوب التقديم: ${voiceStyle}

يجب أن تكون الإجابة بتنسيق JSON فقط بدون أي نص إضافي.

التنسيق المطلوب:
{
  "intro": "مقدمة البودكاست — ترحيب بال مستمعين وتقديم الموضوع بشكل مشوق (3-5 جمل)",
  "segments": [
    "الفقرة الأولى — مناقشة جانب من الموضوع (5-8 جمل)",
    "الفقرة الثانية — مناقشة جانب آخر (5-8 جمل)",
    "الفقرة الثالثة — نقاط إضافية (5-8 جمل)"
  ],
  "outro": "خاتمة البودكاست — ملخص ودعوة للتفاعل (3-5 جمل)"
}

قواعد مهمة:
- اكتب بلغة عربية فصحى سلسة وجذابة
- استخدم أسلوب حواري كأنك تتحدث مع المستمع
- اجعل المقدمة مشوقة تجذب المستمع من أول جملة
- وزّع المحتوى على 3-5 فقرات متساوية تقريباً
- الخاتمة يجب أن تلخص النقاط الرئيسية وتدعو للمتابعة
- لا تزيد كل فقرة عن 8 جمل
- استخدم عبارات ربط بين الفقرات مثل "دعونا ننتقل إلى...", "والآن نأتي إلى..."
- استخدم تنغيم صوتي مناسب بعلامات الترقيم (؟ للأسئلة، ! للتعجب)
- لا تضع نص بالإنجليزي أبداً
- اجعل كل فقرة مناسبة للإلقاء الصوتي (جمل قصيرة ومتوسطة)`;

    const userPrompt = `عنوان البودكاست: ${title}\n\nالمحتوى:\n${content.slice(0, 3000)}`;

    const zai = await getZAIClient();

    const scriptResponse = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 4096,
    });

    const rawScript = scriptResponse.choices?.[0]?.message?.content || '';

    if (!rawScript) {
      return NextResponse.json(
        { error: 'لم يتم توليد سكريبت البودكاست. يرجى المحاولة مرة أخرى.' },
        { status: 500 }
      );
    }

    // Parse script
    let podcastScript: PodcastScript;
    try {
      const jsonStr = extractJSON(rawScript);
      const parsed = JSON.parse(jsonStr);

      const intro = String(parsed.intro || '');
      const segments = Array.isArray(parsed.segments)
        ? parsed.segments.map(String).filter((s: string) => s.trim())
        : [];
      const outro = String(parsed.outro || '');

      podcastScript = {
        intro,
        segments,
        outro,
        fullScript: [intro, ...segments, outro].filter(s => s.trim()).join('\n\n'),
      };
    } catch {
      // Fallback: use raw text as full script
      podcastScript = {
        intro: '',
        segments: [],
        outro: '',
        fullScript: rawScript,
      };
    }

    // ─── Return Script Only (no audio generation here) ───────────────
    // Audio will be generated on-demand via /api/ai/tts endpoint
    return NextResponse.json({
      title: title.trim(),
      script: podcastScript.fullScript,
      intro: podcastScript.intro,
      segments: podcastScript.segments,
      outro: podcastScript.outro,
    });
  } catch (error) {
    console.error('[Podcast] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء إنشاء البودكاست. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
