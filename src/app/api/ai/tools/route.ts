/**
 * POST /api/ai/tools
 * ==================
 * API route موحد لكل أدوات AI Engineering Hub (108 أداة).
 *
 * Request body:
 *   {
 *     "tool": "ocr-general" | "rag-doc-chat" | "agent-book-writer" | ...
 *     "input": { "text": "..." } | { "image": "base64..." } | { "url": "..." } | { "file": "base64..." }
 *     "options": { ... }
 *   }
 *
 * Response:
 *   { "success": true, "tool": "...", "output": "...", "type": "text|image|audio|..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTool } from '@/lib/ai-tools/registry';
import { getZAIClient } from '@/lib/zai-client';
import { resolveActiveModel } from "@/lib/active-model";


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool: toolId, input = {}, options = {} } = body;

    if (!toolId) {
      return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    }

    const tool = getTool(toolId);
    if (!tool) {
      return NextResponse.json({ success: false, error: `أداة غير معروفة: ${toolId}` }, { status: 404 });
    }

    const client = await getZAIClient();
    const text = input.text || input.prompt || '';
    const image = input.image || '';
    const url = input.url || '';
    const file = input.file || '';
    const code = input.code || input.text || '';

    let output = '';
    let outputType = 'text';

    // ═══════════════════════════════════════════
    // OCR Tools
    // ═══════════════════════════════════════════
    if (tool.category === 'ocr') {
      if (!image) {
        return NextResponse.json({ success: false, error: 'image مطلوب للأدوات OCR' }, { status: 400 });
      }

      let prompt = 'استخرج كل النص من الصورة دي. حافظ على التنسيق.';
      if (toolId === 'ocr-latex') {
        prompt = 'حوّل المعادلة الرياضية في الصورة دي لـ LaTeX code. ارجع LaTeX فقط.';
        outputType = 'code';
      } else if (toolId === 'ocr-structured') {
        prompt = 'استخرج النص من الصورة دي في JSON format: {"title": "...", "content": "...", "metadata": {...}}';
        outputType = 'json';
      }

      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ZAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'glm-4v',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: image } },
            ],
          }],
        }),
      });

      const data = await response.json();
      output = data?.choices?.[0]?.message?.content || '';
    }

    // ═══════════════════════════════════════════
    // RAG Tools
    // ═══════════════════════════════════════════
    else if (tool.category === 'rag') {
      if (toolId === 'rag-github' && url) {
        // شات مع GitHub repo
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد ذكي. المستخدم بيسأل عن مستودع GitHub. حلل الـ URL واعرض ما تعرف عنه.' },
            { role: 'user', content: `حلل المستودع ده: ${url}\n\nالسؤال: ${text || 'اعرضلي ملخص عن المشروع'}` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
          temperature: 1.0,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else if (toolId === 'rag-website' && url) {
        // RAG على موقع
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد ذكي. حلل محتوى الموقع ورد على سؤال المستخدم.' },
            { role: 'user', content: `الموقع: ${url}\n\nالسؤال: ${text || 'اعرضلي ملخص عن الموقع'}` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else if (toolId === 'rag-code-chat' && code) {
        // شات مع كود
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد برمجي خبير. حلل الكود ورد على أسئلة المستخدم.' },
            { role: 'user', content: `الكود:\n\`\`\`\n${code}\n\`\`\`\n\nالسؤال: ${text || 'اشرح الكود ده'}` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else {
        // RAG عام
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد RAG ذكي. ابحث في المعرفة بتاعتك ورد بدقة.' },
            { role: 'user', content: text || 'مرحبا' },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      }
    }

    // ═══════════════════════════════════════════
    // Agents & Workflows
    // ═══════════════════════════════════════════
    else if (tool.category === 'agents') {
      const agentPrompts: Record<string, string> = {
        'agent-book-writer': `أنت كاتب محترف. اكتب كتاب/قصة عن: ${text}. قسمه لفصول وعناوين.`,
        'agent-content-planner': `أنت مخطط محتوى محترف. خطط محتوى سوشيال ميديا لمدة أسبوع عن: ${text}.`,
        'agent-brand-monitor': `أنت محلل علامات تجارية. حلل العلامة التجارية: ${text}. اعرض نقاط القوة والضعف.`,
        'agent-doc-writer': `أنت كاتب توثيق. اكتب توثيق شامل للكود/المشروع ده: ${code || text}.`,
        'agent-news': `أنت صحفي محترف. اكتب خبر عن: ${text}. بصيغة احترافية.`,
        'agent-stock-analyst': `أنت محلل أسهم محترف. حلل السهم ده: ${text}. اعرض التحليل الفني والأساسي.`,
        'agent-hotel-booking': `أنت وكيل حجز فنادق. ساعد المستخدم يجد فندق: ${text}.`,
        'agent-flight-booking': `أنت وكيل حجز طيران. ساعد المستخدم يجد رحلة: ${text}.`,
        'agent-paralegal': `أنت مساعد قانوني محترف. رد على الاستفسار القانوني: ${text}.`,
        'agent-web-browser': `أنت وكيل تصفح ويب. لخص محتوى: ${url || text}.`,
        'agent-deep-research': `أنت باحث عميق. ابحث بعمق عن: ${text}. اعرض نتائج مفصلة مع مصادر.`,
        'agent-portfolio': `أنت محلل محفظة استثمارية. حلل: ${text}.`,
        'agent-conversational': `أنت وكيل محادثة متقدم. رد على: ${text}.`,
      };

      const prompt = agentPrompts[toolId] || `أنت وكيل AI ذكي. نفّذ المهمة: ${text}`;

      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text || url || code || 'ابدأ' },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
        temperature: 1.0,
      });
      output = completion?.choices?.[0]?.message?.content || '';
    }

    // ═══════════════════════════════════════════
    // Audio Tools
    // ═══════════════════════════════════════════
    else if (tool.category === 'audio') {
      if (toolId === 'meeting-notes' && file) {
        // ملاحظات اجتماعات — ASR + تنظيم
        const asrResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.ZAI_API_KEY}` },
          body: JSON.stringify({ file_base64: file }),
        });
        const asrData = await asrResponse.json();
        const transcript = asrData?.text || '';

        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد اجتماعات. نظم النص ده لملاحظات اجتماع منظمة.' },
            { role: 'user', content: `نص الاجتماع:\n${transcript}\n\nاعمل ملاحظات منظمة.'` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else if (toolId === 'audio-chat' && file) {
        // شات مع صوت
        const asrResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.ZAI_API_KEY}` },
          body: JSON.stringify({ file_base64: file }),
        });
        const asrData = await asrResponse.json();
        const transcript = asrData?.text || '';

        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد ذكي. المستخدم رفع ملف صوتي.' },
            { role: 'user', content: `محتوى الصوت:\n${transcript}\n\nالسؤال: ${text || 'لخص الصوت'}` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else {
        output = 'أداة صوتية — ارفع ملف صوتي لاستخدامها.';
      }
    }

    // ═══════════════════════════════════════════
    // Media & Content
    // ═══════════════════════════════════════════
    else if (tool.category === 'media') {
      if (toolId === 'podcast-gen') {
        // توليد بودكاست
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت منتج بودكاست محترف. حوّل النص ده لمحادثة بودكاست بين مضيفين اتنين.' },
            { role: 'user', content: `حوّل ده لبودكاست:\n${text}\n\nاكتب حوار كامل بين مضيفين اتنين.` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else if (toolId === 'youtube-trends') {
        // تحليل اتجاهات يوتيوب
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت محلل يوتيوب محترف. حلل الاتجاهات واعطي توصيات.' },
            { role: 'user', content: `حلل اتجاهات يوتيوب عن: ${text}. اعرض المواضيع الرائجة والفرص.` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else if (toolId === 'notebook-lm') {
        // NotebookLM clone
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: 'أنت مساعد NotebookLM. حلل المستند واعمل ملخص + استشهادات + أسئلة.' },
            { role: 'user', content: `حلل المستند ده واعمل:\n1. ملخص شامل\n2. نقاط رئيسية\n3. استشهادات\n4. أسئلة للنقاش\n\nالمستند:\n${text}` },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      } else {
        const completion = await client.chat.completions.create({
          model: (body.model || (body.model || 'glm-4-flash')),
          messages: [
            { role: 'system', content: `أنت أداة ${tool.name}. نفّذ المهمة المطلوبة.` },
            { role: 'user', content: text || 'ابدأ' },
          ],
          thinking: { type: 'enabled' },
          max_tokens: 65536,
        });
        output = completion?.choices?.[0]?.message?.content || '';
      }
    }

    // ═══════════════════════════════════════════
    // Business & Finance
    // ═══════════════════════════════════════════
    else if (tool.category === 'business') {
      const businessPrompts: Record<string, string> = {
        'financial-analyst': `أنت محلل مالي محترف. حلل: ${text}. اعرض تحليل SWOT + توصيات استثمارية.`,
        'sales-analytics': `أنت محلل مبيعات. حلل بيانات المبيعات: ${text}. اعرض رؤى وتوصيات.`,
        'amazon-analysis': `أنت محلل منتجات. حلل منتج أمازون: ${url || text}. اعرض تحليل المنافسين والفرص.`,
        'website-to-api': `أنت مهندس API. صمم API للموقع: ${url}. اعرض endpoints + schema.`,
        'memory-agent': `أنت وكيل بذاكرة طويلة المدى. تذكر المحادثات السابقة ورد على: ${text}.`,
      };

      const prompt = businessPrompts[toolId] || `أنت أداة ${tool.name}. نفّذ: ${text}`;

      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text || url || 'ابدأ' },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
        temperature: 1.0,
      });
      output = completion?.choices?.[0]?.message?.content || '';
    }

    // ═══════════════════════════════════════════
    // MCP Tools
    // ═══════════════════════════════════════════
    else if (tool.category === 'mcp') {
      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: `أنت أداة MCP: ${tool.name}. ${tool.description}` },
          { role: 'user', content: text || 'ابدأ' },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
      });
      output = completion?.choices?.[0]?.message?.content || '';
    }

    // ═══════════════════════════════════════════
    // Comparison Tools
    // ═══════════════════════════════════════════
    else if (tool.category === 'compare') {
      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: `أنت أداة مقارنة: ${tool.name}. قارن وحلل واعرض النتائج في JSON.` },
          { role: 'user', content: `حلل وقارن: ${text || code}. اعرض نتائج مفصلة.` },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
      });
      output = completion?.choices?.[0]?.message?.content || '';
      outputType = 'json';
    }

    // ═══════════════════════════════════════════
    // Training & Research
    // ═══════════════════════════════════════════
    else if (tool.category === 'training') {
      const completion = await client.chat.completions.create({
        model: (body.model || (body.model || 'glm-4-flash')),
        messages: [
          { role: 'system', content: `أنت أداة: ${tool.name}. ${tool.description}` },
          { role: 'user', content: text || 'ابدأ' },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
      });
      output = completion?.choices?.[0]?.message?.content || '';
    }

    return NextResponse.json({
      success: true,
      tool: toolId,
      toolName: tool.name,
      output,
      type: outputType,
      source: tool.source,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/ai/tools — قائمة بكل الأدوات
 * GET /api/ai/tools?tool=xxx — تفاصيل أداة
 * GET /api/ai/tools?stats=true — إحصائيات
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const toolId = url.searchParams.get('tool');
  const stats = url.searchParams.get('stats');

  if (stats === 'true') {
    const { getToolStats } = await import('@/lib/ai-tools/registry');
    return NextResponse.json(getToolStats());
  }

  if (toolId) {
    const { getTool } = await import('@/lib/ai-tools/registry');
    const tool = getTool(toolId);
    if (!tool) return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    return NextResponse.json(tool);
  }

  const { AI_TOOLS, TOOL_CATEGORIES } = await import('@/lib/ai-tools/registry');
  return NextResponse.json({
    total: AI_TOOLS.length,
    categories: TOOL_CATEGORIES,
    tools: AI_TOOLS,
  });
}
