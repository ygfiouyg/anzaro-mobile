/**
 * Advanced RAG Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - video-rag-gemini: video processing + Gemini Q&A
 * - rag-sql-router: RouterOutputAgentWorkflow (doc tool + SQL tool)
 * - rag-with-dockling: DoclingReader for Excel
 * - context-engineering-workflow: ResearchAssistantFlow (multi-source)
 * - Colivara-deepseek-website-RAG: website multimodal RAG
 */

import { chatWithFallback } from '../chat-utils';

async function runAgent(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await chatWithFallback([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  return result.content;
}

// 1. Video RAG — مستوحى من video-rag-gemini
//    بيستخدم Gemini 1.5 Pro Vision للـ video understanding الحقيقي (لو فيه فيديو base64)
//    Fallback: GLM-5.2 على transcript بس
export async function ragVideo(
  transcript: string,
  question: string,
  videoBase64?: string,
  mimeType?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

    // ── Path A: لو فيه فيديو فعلي + Gemini key → استخدم Gemini 1.5 Pro Vision ──
    if (videoBase64 && videoBase64.length > 100 && GEMINI_API_KEY) {
      const parts: any[] = [
        {
          text: `أنت Video RAG Agent. المستخدم رفع فيديو. حلل الفيديو ورد على السؤال.\n\nالسؤال: ${question || 'لخص الفيديو'}\n\nنص إضافي من الفيديو:\n${transcript.slice(0, 5000)}`,
        },
        {
          inlineData: {
            mimeType: mimeType || 'video/mp4',
            data: videoBase64,
          },
        },
      ];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 1.0, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        console.warn(`[VideoRAG] Gemini Vision failed (${response.status}): ${err.slice(0, 200)}. Falling back to transcript.`);
        // سقط لـ fallback transcript-based
      } else {
        const data = await response.json();
        const output =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            .filter(Boolean)
            .join('') || '';
        if (output) {
          return { success: true, output: `🎬 **Video RAG (Gemini 1.5 Pro Vision)**\n\n${output}` };
        }
      }
    }

    // ── Path B: Fallback على transcript بس (بـ fallback chain) ──
    const output = await runAgent(
      `أنت Video RAG Agent (مستوحى من video-rag-gemini).

المستخدم رفع فيديو وتم استخراج نص منه. ابحث في النص ورد على السؤال.

1. ابحث في النص عن الإجابة
2. اذكر الوقت التقريبي لو معروف
3. لو ملقاش، قول "مفيش معلومات عن ده في الفيديو"
4. اعمل ملخص الفيديو كمان`,
      `نص الفيديو:\n${transcript.slice(0, 12000)}\n\nالسؤال: ${question || 'لخص الفيديو'}`
    );
    return { success: true, output: `🎬 **Video RAG**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 2. SQL Router — مستوحى من rag-sql-router
//    RouterOutputAgentWorkflow: route between document search and SQL
export async function ragSQLRouter(query: string, data?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: Router Agent — يحدد المسار (زي RouterOutputAgentWorkflow)
    const route = await runAgent(
      `أنت Router Agent (مستوحى من rag-sql-router).

حدد المسار المناسب للسؤال:
- "document": لو السؤال عن معلومات نصية/مستندات
- "sql": لو السؤال عن بيانات/أرقام/إحصائيات تحتاج SQL
- "both": لو محتاج الاثنين

رجع JSON: {"route": "document|sql|both", "reason": "..."}`,
      `السؤال: ${query}`
    );

    // Step 2: Execute — نفذ بناء على المسار
    let context = data || 'مفيش بيانات متاحة';
    const output = await runAgent(
      `أنت Response Agent. المسار المحدد: ${route}

لو المسار "document" أو "both": ابحث في المستندات
لو المسار "sql": اكتب SQL query + اشرح النتائج المتوقعة
لو "both": اعمل الاتنين

البيانات المتاحة:
${context.slice(0, 8000)}`,
      `السؤال: ${query}`
    );

    return { success: true, output: `🔀 **SQL Router**\n\n📋 المسار: ${route}\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 3. Excel RAG — مستوحى من rag-with-dockling
//    DoclingReader: parse Excel → RAG
export async function ragExcel(data: string, question: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Excel RAG Agent (مستوحى من rag-with-dockling + DoclingReader).

المستخدم رفع بيانات Excel. حللها ورد على السؤال.

1. تعرف على الأعمدة والصفوف
2. حساب إحصائيات لو مطلوب
3. فلترة وترتيب البيانات
4. إنشاء summary

البيانات:
${data.slice(0, 12000)}`,
      `السؤال: ${question || 'حلل البيانات'}`
    );
    return { success: true, output: `📊 **Excel RAG**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 4. Context Engineering — مستوحى من context-engineering-workflow
//    ResearchAssistantFlow: multi-source research
export async function ragContextEngine(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Context Engineering Agent (مستوحى من context-engineering-workflow + ResearchAssistantFlow).

ابحث بعمق واعمل تقرير شامل:

1. 🔍 جمع المعلومات
   - خلفية تاريخية
   - الوضع الحالي
   - اتجاهات مستقبلية

2. 📊 تحليل السياق
   - العوامل المؤثرة
   - العلاقات بين المتغيرات
   - الفجوات المعرفية

3. 🎯 التوصيات
   - بناء على التحليل
   - خطوات عملية
   - مخاطر محتملة

4. 📚 المصادر المقترحة
   - كتب
   - أوراق بحثية
   - مواقع

خلي التقرير بالعربي وعميق.`,
      `الموضوع: ${topic}`
    );
    return { success: true, output: `🔬 **Context Engineering: ${topic}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// Registry
export interface AdvRAGToolDef { id: string; name: string; description: string; source: string; placeholder: string; }
export const ADV_RAG_TOOLS: AdvRAGToolDef[] = [
  { id: 'rag-video', name: '🎬 شات مع فيديو', description: 'محادثة مع محتوى فيديو', source: 'video-rag-gemini', placeholder: 'الصق نص الفيديو...|اكتب سؤالك' },
  { id: 'rag-sql-router', name: '🔀 SQL Router', description: 'وكيل بيراوتر بين document search و SQL', source: 'rag-sql-router', placeholder: 'اكتب سؤالك...|الصق البيانات (اختياري)' },
  { id: 'rag-excel', name: '📊 Excel RAG', description: 'RAG على بيانات Excel', source: 'rag-with-dockling', placeholder: 'الصق بيانات Excel...|اكتب سؤالك' },
  { id: 'rag-context', name: '🔬 محرك السياق', description: 'بحث متعدد المصادر + تحليل سياق', source: 'context-engineering-workflow', placeholder: 'اكتب الموضوع...' },
];

export async function runAdvRAGTool(toolId: string, input: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'rag-video': {
        const [transcript, question] = input.split('|').map(s => s.trim());
        return await ragVideo(transcript || input, question || 'لخص الفيديو');
      }
      case 'rag-sql-router': {
        const [query, data] = input.split('|').map(s => s.trim());
        return await ragSQLRouter(query || input, data);
      }
      case 'rag-excel': {
        const [data, question] = input.split('|').map(s => s.trim());
        return await ragExcel(data || input, question || 'حلل البيانات');
      }
      case 'rag-context': return await ragContextEngine(input);
      default: return { success: false, output: '', error: `أداة غير معروفة: ${toolId}` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}
