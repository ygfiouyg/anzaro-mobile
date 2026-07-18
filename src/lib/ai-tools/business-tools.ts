/**
 * Business & Finance Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - financial-analyst-deepseek: CrewAI query_parser + structured output
 * - sales-analytics-agent: MindsDB sales analysis
 * - zep-memory-assistant: Zep long-term memory + fact extraction
 * - amazon-product-analysis: product analysis
 * - Website-to-API-with-FireCrawl: website to API
 * - stock-portfolio-analysis-agent: portfolio analysis
 */

import { getZAIClient } from '../zai-client';

async function runAgent(systemPrompt: string, userMessage: string): Promise<string> {
  const client = await getZAIClient();
  const completion = await client.chat.completions.create({
    model: 'glm-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    thinking: { type: 'enabled' },
    max_tokens: 65536,
    temperature: 1.0,
  });
  return completion?.choices?.[0]?.message?.content || '';
}

// 1. Financial Analyst — مستوحى من financial-analyst-deepseek
export async function bizFinancialAnalyst(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: Query Parser (زي QueryAnalysisOutput في الكود الأصلي)
    const parsed = await runAgent(
      `أنت Stock Data Analyst agent. حلل الاستعلام واستخرج JSON:
{"symbols": ["AAPL"], "timeframe": "1mo", "action": "analyze"}`,
      query
    );
    // Step 2: Analyst Agent (زي finance_crew.py)
    const output = await runAgent(
      `أنت Financial Analyst agent. اعمل تحليل شامل:
1. 📊 نظرة عامة
2. 💪 تحليل SWOT
3. 📈 التحليل الفني (دعم/مقاومة)
4. 💰 التحليل الأساسي (إيرادات/أرباح)
5. ⚠️ المخاطر
6. 🎯 التوصية (شراء/بيع/احتفاظ)
⚠️ دي معلومات تحليلية مش نصيحة استثمارية.`,
      `حلل: ${query}\nParsed: ${parsed}`
    );
    return { success: true, output: `💰 **تحليل مالي: ${query}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 2. Sales Analytics — مستوحى من sales-analytics-agent
export async function bizSalesAnalytics(data: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Sales Analytics Agent. حلل بيانات المبيعات:
1. 📊 ملخص المبيعات (إجمالي/متوسط/عدد)
2. 🏆 تحليل العملاء (أعلى العملاء/تكرار الشراء)
3. 📦 تحليل المنتجات (الأفضل/الأقل أداءً)
4. 📈 تحليل زمني (أفضل فترات/موسمية)
5. 💡 توصيات (فرص نمو/استراتيجيات)`,
      `بيانات المبيعات:\n${data.slice(0, 10000)}`
    );
    return { success: true, output: `📊 **تحليل المبيعات**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 3. Amazon Analysis — مستوحى من amazon-product-analysis-server
export async function bizAmazonAnalysis(product: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Amazon Product Analyst. حلل المنتج:
1. 📦 نظرة عامة
2. 💰 تحليل السعر + مقارنة بالمنافسين
3. ⭐ تحليل التقييمات (نقاط قوة/شكاوى)
4. 🏢 تحليل المنافسين (أكبر 3)
5. 📈 فرص السوق
6. 💡 توصيات (هل يستحق الاستثمار؟)`,
      `حلل المنتج: ${product}`
    );
    return { success: true, output: `🛒 **تحليل منتج: ${product}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 4. Portfolio Analysis — مستوحى من stock-portfolio-analysis-agent
export async function bizPortfolioAnalysis(portfolio: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Portfolio Analysis Agent. حلل المحفظة:
1. 📊 نظرة عامة (قيمة/توزيع/تنويع)
2. ⚖️ تحليل المخاطر (مستوى/تركيز)
3. 📈 الأداء المتوقع (عائد/Sharpe/خسارة)
4. 🔄 إعادة التوازن (زائدة/ناقصة)
5. 💡 توصيات (شراء/بيع/تحوط)
⚠️ دي معلومات تحليلية مش نصيحة استثمارية.`,
      `المحفظة: ${portfolio}`
    );
    return { success: true, output: `💼 **تحليل المحفظة**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 5. Website to API — مستوحى من Website-to-API-with-FireCrawl
export async function bizWebsiteToAPI(url: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeltaAI/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return { success: false, output: '', error: `HTTP ${res.status}` };
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);

    const output = await runAgent(
      `أنت API Designer agent. حول محتوى الموقع لـ API design:
1. 📋 نظرة عامة
2. 🔗 Endpoints (REST)
3. 📊 Schema (JSON)
4. 🔐 Authentication
5. 📝 مثال Request/Response`,
      `الموقع: ${url}\nالعنوان: ${title}\nالمحتوى:\n${text}`
    );
    return { success: true, output: `🔗 **API Design لـ: ${title}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 6. Memory Agent — مستوحى من zep-memory-assistant + database-memory-agent
const longTermMemory: Map<string, { facts: string[]; conversations: Array<{ role: string; content: string; timestamp: number }> }> = new Map();

export async function bizMemoryAgent(action: string, input: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const sessionId = 'default';
    if (!longTermMemory.has(sessionId)) longTermMemory.set(sessionId, { facts: [], conversations: [] });
    const memory = longTermMemory.get(sessionId)!;

    switch (action) {
      case 'remember': {
        const facts = await runAgent(
          `أنت fact extraction agent. استخرج الحقائق المهمة من الرسالة.
كل факт في سطر. بس الحقائق المهمة (اسم، تفضيل، معلومة شخصية).
لو مفيش، قول "NO_FACTS".`,
          input
        );
        if (!facts.includes('NO_FACTS')) {
          const factList = facts.split('\n').map(f => f.trim()).filter(f => f && !f.includes('NO_FACTS'));
          memory.facts.push(...factList);
        }
        memory.conversations.push({ role: 'user', content: input, timestamp: Date.now() });
        return { success: true, output: `🧠 ✅ تم الحفظ.\n📋 حقائق: ${memory.facts.length}\n💬 محادثات: ${memory.conversations.length}` };
      }
      case 'recall': {
        const recent = memory.conversations.slice(-5).map(c => `${c.role === 'user' ? '👤' : '🤖'} ${c.content.slice(0, 100)}`).join('\n');
        const facts = memory.facts.map(f => `• ${f}`).join('\n');
        return { success: true, output: `🧠 **ذاكرتي:**\n\n📋 **حقائق:**\n${facts || 'مفيش'}\n\n💬 **آخر محادثات:**\n${recent || 'مفيش'}` };
      }
      case 'search': {
        const lower = input.toLowerCase();
        const fMatch = memory.facts.filter(f => f.toLowerCase().includes(lower));
        const cMatch = memory.conversations.filter(c => c.content.toLowerCase().includes(lower));
        return { success: true, output: `🔍 **نتائج: "${input}"**\n\n📋 حقائق:\n${fMatch.length ? fMatch.map(f => `• ${f}`).join('\n') : 'مفيش'}\n\n💬 محادثات:\n${cMatch.length ? cMatch.map(c => `${c.role === 'user' ? '👤' : '🤖'} ${c.content.slice(0, 150)}`).join('\n') : 'مفيش'}` };
      }
      case 'clear': { memory.facts = []; memory.conversations = []; return { success: true, output: '🧠 تم مسح الذاكرة' }; }
      case 'count': { return { success: true, output: `🧠 حقائق: ${memory.facts.length} | محادثات: ${memory.conversations.length}` }; }
      default: return { success: false, output: '', error: `استخدم: remember, recall, search, clear, count` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// Registry
export interface BusinessToolDef { id: string; name: string; description: string; source: string; placeholder: string; }
export const BUSINESS_TOOLS: BusinessToolDef[] = [
  { id: 'biz-financial', name: '💰 محلل مالي', description: 'تحليل SWOT + توصيات', source: 'financial-analyst-deepseek', placeholder: 'اكتب السهم... مثال: Apple' },
  { id: 'biz-sales', name: '📊 تحليل مبيعات', description: 'تحليل بيانات مبيعات + توصيات', source: 'sales-analytics-agent', placeholder: 'الصق بيانات المبيعات...' },
  { id: 'biz-amazon', name: '🛒 تحليل منتج', description: 'تحليل منتج + منافسين', source: 'amazon-product-analysis-server', placeholder: 'اسم المنتج أو URL...' },
  { id: 'biz-portfolio', name: '💼 تحليل محفظة', description: 'تحليل محفظة استثمارية', source: 'stock-portfolio-analysis-agent', placeholder: '50% AAPL, 30% TSLA, 20% cash' },
  { id: 'biz-website-api', name: '🔗 موقع → API', description: 'تحويل موقع لـ API design', source: 'Website-to-API-with-FireCrawl', placeholder: 'https://example.com' },
  { id: 'biz-memory', name: '🧠 ذاكرة طويلة', description: 'ذاكرة دائمة بحقائق + محادثات', source: 'zep-memory-assistant', placeholder: 'remember|اسمي عبس\nrecall\nsearch|عبس' },
];

export async function runBusinessTool(toolId: string, input: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'biz-financial': return await bizFinancialAnalyst(input);
      case 'biz-sales': return await bizSalesAnalytics(input);
      case 'biz-amazon': return await bizAmazonAnalysis(input);
      case 'biz-portfolio': return await bizPortfolioAnalysis(input);
      case 'biz-website-api': return await bizWebsiteToAPI(input);
      case 'biz-memory': {
        const parts = input.split('|').map(s => s.trim());
        return await bizMemoryAgent(parts[0] || 'recall', parts.slice(1).join('|') || '');
      }
      default: return { success: false, output: '', error: `أداة غير معروفة: ${toolId}` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}
