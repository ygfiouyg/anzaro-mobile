/**
 * POST /api/ai/doc-gen
 * ====================
 * توليد مستندات احترافية عبر ZhipuAI Slides Agent + GLM-5.2.
 *
 * Request body:
 *   { "type": "slides"|"pdf"|"docx"|"xlsx", "prompt": "...", "title": "..." }
 *
 * Slides: يستخدم slides_glm_agent (PDF export)
 * PDF/DOCX/XLSX: يستخدم GLM-5.2 يكتب كود Python يولدها
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';
import { resolveActiveModel } from "@/lib/active-model";


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type = 'slides', prompt, title } = body;

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt مطلوب' }, { status: 400 });
    }

    const apiKey = process.env.ZAI_API_KEY;

    if (type === 'slides') {
      // ── Slides — عبر GLM-5.2 (يكتب HTML slides) ──
      const client = await getZAIClient();
      const slidesPrompt = `اعمل عرض تقديمي HTML كامل عن: ${prompt}
العنوان: ${title || 'عرض تقديمي'}

اكتب HTML كامل فيه شرائح (slides) بتنسيق احترافي:
- استخدم CSS inline للتنسيق
- كل شريحة في div منفصل
- خلفية جذابة (gradient)
- خطوط واضحة
- ألوان متناسقة
- محتوى منظم (عناوين + نقاط)

ارجع HTML كامل فقط بدون شرح.`;

      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: 'أنت مصمم عروض تقديمية محترف. تكتب HTML/CSS احترافي للعروض.' },
          { role: 'user', content: slidesPrompt },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
        temperature: 1.0,
      });

      const content = completion?.choices?.[0]?.message?.content || '';

      return NextResponse.json({
        success: true,
        type: 'slides',
        title: title || 'عرض تقديمي',
        content,
        html: content,
      });
    }

    // ── PDF/DOCX/XLSX — عبر GLM-5.2 code generation ──
    const client = await getZAIClient();

    const codePrompts: Record<string, string> = {
      pdf: `اكتب كود Python كامل باستخدام مكتبة reportlab لتوليد PDF بعنوان "${title || 'مستند'}" يحتوي على: ${prompt}. الكود لازم يكون كامل وجاهز للتشغيل. ارجع الكود فقط بدون شرح.`,
      docx: `اكتب كود Python كامل باستخدام مكتبة python-docx لتوليد مستند Word بعنوان "${title || 'مستند'}" يحتوي على: ${prompt}. الكود لازم يكون كامل وجاهز للتشغيل. ارجع الكود فقط بدون شرح.`,
      xlsx: `اكتب كود Python كامل باستخدام مكتبة openpyxl لتوليد ملف Excel يحتوي على: ${prompt}. الكود لازم يكون كامل وجاهز للتشغيل. ارجع الكود فقط بدون شرح.`,
    };

    const codePrompt = codePrompts[type] || codePrompts.pdf;

    const completion = await client.chat.completions.create({
      model: (body.model || (body.model || 'glm-4-flash')),
      messages: [
        { role: 'system', content: 'أنت مساعد برمجي. تكتب كود Python نظيف وكامل وجاهز للتشغيل.' },
        { role: 'user', content: codePrompt },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0,
    });

    const code = completion?.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      type,
      title: title || 'مستند',
      code, // الكود اللي GLM-5.2 كتبه
      prompt,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
