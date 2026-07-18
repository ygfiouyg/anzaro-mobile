/**
 * Agent Tools — وكلاء AI بيشتغلوا مهام كاملة
 * ========================================
 * كل وكيل بياخد موضوع ويعمل مهمة كاملة بـ fallback chain:
 *   ZAI (GLM-5.2) → Groq (Llama 3.3 70B) → Gemini (2.0 Flash)
 *   1. كتاب كتب — يكتب كتاب/قصة كاملة بفصول
 *   2. مولد أخبار — يكتب خبر صحفي احترافي
 *   3. محلل مالي — تحليل SWOT + توصيات
 *   4. حجز فنادق/طيران — وكيل حجز ذكي
 *   5. بحث عميق — بحث متعدد الخطوات
 *   6. مساعد قانوني — استشارات قانونية
 *   7. مراقبة علامات — تحليل علامة تجارية
 *   8. كاتب توثيق — توثيق كود/مشاريع
 */

import { chatWithFallback } from '../chat-utils';

/**
 * تشغيل وكيل AI مع fallback chain:
 * ZAI → Groq → Gemini (لو واحد وقع، التاني يكمل).
 */
async function runAgent(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await chatWithFallback([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  return result.content;
}

// ═══════════════════════════════════════════
// 1. Book Writer — كتاب كتب
// ═══════════════════════════════════════════
export async function agentBookWriter(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت كاتب محترف متخصص في كتابة الكتب والقصص. اكتب كتاب/قصة كاملة عن الموضوع اللي هطلبه.

التنسيق المطلوب:
# عنوان الكتاب
## مقدمة
## الفصل الأول: [عنوان]
[محتوى الفصل]
## الفصل الثاني: [عنوان]
[محتوى الفصل]
... إلخ
## الخاتمة

خلي الكتاب منظم وممتع وغني بالمحتوى. كل فصل يكون 3-5 فقرات على الأقل.`,
      `اكتب كتاب عن: ${topic}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 2. News Generator — مولد أخبار
// ═══════════════════════════════════════════
export async function agentNewsGenerator(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت صحفي محترف. اكتب خبر صحفي احترافي بالتنسيق التالي:

# العنوان الرئيسي (جذاب ومختصر)
**التاريخ:** [تاريخ افتراضي]
**المصدر:** DeltaAI News

## ملخص سريع
[فقرة واحدة تلخص الخبر]

## التفاصيل الكاملة
[3-5 فقرات تفصيلية]

## تصريحات
[اقتباسات افتراضية من شخصيات وهمية]

## سياق
[خلفية عن الموضوع]

## خلاصة
[فقرة ختامية]

خلي الخبر واقعي ومصداقي ومنظم.`,
      `اكتب خبر عن: ${topic}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 3. Financial Analyst — محلل مالي
// ═══════════════════════════════════════════
export async function agentFinancialAnalyst(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت محلل مالي محترف. اعمل تحليل مالي شامل:

1. 📊 نظرة عامة على الشركة/السهم
2. 💪 تحليل SWOT (نقاط القوة، الضعف، الفرص، التهديدات)
3. 📈 التحليل الفني (مستويات دعم ومقاومة افتراضية)
4. 💰 التحليل الأساسي (مبيعات، أرباح، نمو)
5. ⚠️ المخاطر
6. 🎯 التوصيات الاستثمارية (شراء/بيع/احتفاظ)

خلي التحليل بالعربي ومهني.`,
      `حلل: ${query}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 4. Hotel/Flight Booking — وكيل حجز
// ═══════════════════════════════════════════
export async function agentBooking(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت وكيل حجز سفر ذكي. ساعد المستخدم يخطط رحلته:

1. ✈️ خيارات الطيران (3 خيارات بسعر ومدة افتراضية)
2. 🏨 خيارات الفنادق (3 خيارات بمميزات وأسعار افتراضية)
3. 🚗 خيارات المواصلات
4. 📝 جدول الرحلة المقترح (يوم بيوم)
5. 💰 تقدير الميزانية الإجمالية
6. 💡 نصائح للرحلة

خلي الردود بالعربي ومفيدة.`,
      `ساعدني أخطط: ${query}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 5. Deep Researcher — باحث عميق
// ═══════════════════════════════════════════
export async function agentDeepResearch(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت باحث عميق محترف. اعمل تقرير بحثي شامل:

1. 📋 مقدمة البحث
2. 🔍 الخلفية والتاريخ
3. 📊 الوضع الحالي
4. 📈 الاتجاهات والإحصائيات
5. 🏢 الجهات الفاعلة الرئيسية
6. ⚡ التحديات والفرص
7. 🔮 التوقعات المستقبلية
8. 📚 المصادر المقترحة (روابط حقيقية محتملة)
9. ✅ التوصيات

خلي البحث عميق ومنظم ومصادر جيدة.`,
      `ابحث بعمق عن: ${topic}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 6. Paralegal — مساعد قانوني
// ═══════════════════════════════════════════
export async function agentParalegal(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت مساعد قانوني محترف. رد على الاستفسار القانوني:

1. ⚖️ الإجابة القانونية المباشرة
2. 📜 الأساس القانوني (القوانين ذات الصلة)
3. 📋 الخطوات المطلوبة
4. ⚠️ التحذيرات والملاحظات
5. 📄 المستندات المطلوبة
6. 💡 نصائح عملية

⚠️ تنبيه: دي معلومات قانونية عامة مش استشارة محاماة.

خلي الرد بالعربي ودقيق قانونياً.`,
      `استشارة قانونية: ${query}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 7. Brand Monitor — مراقبة علامات تجارية
// ═══════════════════════════════════════════
export async function agentBrandMonitor(brand: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت محلل علامات تجارية محترف. اعمل تحليل شامل للعلامة التجارية:

1. 🏷️ نظرة عامة عن العلامة
2. 💪 نقاط القوة
3. ⚠️ نقاط الضعف
4. 🎯 الجمهور المستهدف
5. 📊 الحصة السوقية (تقديرية)
6. 🔄 فرص التطوير
7. 🚀 توصيات استراتيجية
8. 📱 الحضور الرقمي (تقييم افتراضي)

خلي التحليل بالعربي وعملي.`,
      `حلل العلامة التجارية: ${brand}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 8. Documentation Writer — كاتب توثيق
// ═══════════════════════════════════════════
export async function agentDocWriter(code: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت كاتب توثيق فني محترف. اكتب توثيق كامل للكود/المشروع اللي هعرضه المستخدم:

1. 📋 نظرة عامة
2. 🔧 المتطلبات (Prerequisites)
3. 🚀 طريقة التثبيت
4. ⚙️ الاستخدام (مع أمثلة)
5. 📚 API Reference (لو applicable)
6. 🏗️ البنية المعمارية
7. ❓ الأسئلة الشائعة (FAQ)
8. 🤝 المساهمة

استخدم Markdown و code blocks. خلي التوثيق بالعربي.`,
      `وثّق الكود/المشروع ده:\n\n${code.slice(0, 8000)}`
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════
export interface AgentToolDef {
  id: string;
  name: string;
  description: string;
  placeholder: string;
}

export const AGENT_TOOLS: AgentToolDef[] = [
  { id: 'agent-book-writer', name: '📚 كاتب كتب', description: 'يكتب كتاب/قصة كاملة بفصول', placeholder: 'اكتب الموضوع... مثال: مغامرة في الفضاء' },
  { id: 'agent-news', name: '📰 مولد أخبار', description: 'يكتب خبر صحفي احترافي', placeholder: 'اكتب الموضوع... مثال: إطلاق GLM-5.2' },
  { id: 'agent-financial', name: '💰 محلل مالي', description: 'تحليل SWOT + توصيات استثمارية', placeholder: 'اكتب السهم/الشركة... مثال: Apple' },
  { id: 'agent-booking', name: '✈️ وكيل حجز', description: 'تخطيط رحلة + فنادق + طيران', placeholder: 'اكتب تفاصيل الرحلة... مثال: رحلة للقاهرة 5 أيام' },
  { id: 'agent-research', name: '🔬 باحث عميق', description: 'تقرير بحثي شامل متعدد الأقسام', placeholder: 'اكتب الموضوع... مثال: مستقبل AI' },
  { id: 'agent-paralegal', name: '⚖️ مساعد قانوني', description: 'استشارة قانونية + خطوات', placeholder: 'اكتب الاستفسار... مثال: حقوق المستأجر' },
  { id: 'agent-brand', name: '🏷️ مراقبة علامات', description: 'تحليل علامة تجارية شامل', placeholder: 'اكتب اسم العلامة... مثال: Nike' },
  { id: 'agent-doc-writer', name: '📝 كاتب توثيق', description: 'توثيق كود/مشروع كامل', placeholder: 'الصق الكود أو وصف المشروع...' },
];

/**
 * تشغيل وكيل.
 */
export async function runAgentTool(toolId: string, input: string): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  try {
    switch (toolId) {
      case 'agent-book-writer': return await agentBookWriter(input);
      case 'agent-news': return await agentNewsGenerator(input);
      case 'agent-financial': return await agentFinancialAnalyst(input);
      case 'agent-booking': return await agentBooking(input);
      case 'agent-research': return await agentDeepResearch(input);
      case 'agent-paralegal': return await agentParalegal(input);
      case 'agent-brand': return await agentBrandMonitor(input);
      case 'agent-doc-writer': return await agentDocWriter(input);
      default: return { success: false, output: '', error: `وكيل غير معروف: ${toolId}` };
    }
  } catch (e: any) {
    return { success: false, output: '', error: e.message };
  }
}
