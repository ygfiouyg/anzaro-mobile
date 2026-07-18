/**
 * Advanced Agent Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - openai-swarm-ollama: Swarm agents + DuckDuckGo search
 * - open-agent-builder: build custom agents
 * - acp-code: Agent Communication Protocol
 * - agent2agent-demo: A2A protocol (python_a2a)
 * - parlant-conversational-agent: compliance-driven agent with tools
 * - content_planner_flow: CrewAI Flow + Typefully scheduler
 * - multiplatform_deep_researcher: multi-platform research
 */

import { chatWithFallback } from '../chat-utils';
import { mcpWebSearch } from './mcp-tools';

async function runAgent(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await chatWithFallback([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  return result.content;
}

// 1. Swarm Agent — مستوحى من openai-swarm-ollama
//    Swarm: multiple agents + web search tool
export async function agentSwarm(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: Search web (زي search_web function في الكود الأصلي)
    const searchResult = await mcpWebSearch(query, 5);
    const searchContext = searchResult.success
      ? searchResult.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n\n')
      : 'مفيش نتائج بحث';

    // Step 2: Swarm agents (محاكاة: researcher + writer + reviewer)
    const output = await runAgent(
      `أنت Swarm Agent System (مستوحى من openai-swarm-ollama).

فيه 3 وكلاء بيشتغلوا مع بعض:

1. 🔍 Researcher Agent:
   - بيبحث في نتائج الويب
   - بيستخرج المعلومات المهمة

2. ✍️ Writer Agent:
   - بياخد معلومات الباحث
   - بيكتاوب رد منظم

3. 📝 Reviewer Agent:
   - بيتراجع الرد
   - بيعدل ويحسن

نتائج البحث:
${searchContext}

اعمل الـ 3 خطوات واعرض النتيجة النهائية.`,
      `السؤال: ${query}`
    );

    return { success: true, output: `🐝 **Swarm Agents**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 2. Agent Builder — مستوحى من open-agent-builder
export async function agentBuilder(spec: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Agent Builder (مستوحى من open-agent-builder).

المستخدم عاوز يبني وكيل AI مخصص. صممه بالكامل:

1. 📋 مواصفات الوكيل
   - الاسم
   - الدور
   - الهدف

2. 🛠️ الأدوات المطلوبة
   - قائمة بـ tools اللي الوكيل محتاجها
   - وصف كل tool
   - parameters

3. 📝 System Prompt
   - prompt كامل جاهز للوكيل

4. 🔄 Workflow
   - خطوات عمل الوكيل
   - متى يستخدم كل tool

5. 💻 Code Example
   - TypeScript code لتشغيل الوكيل

6. 📊 تقييم
   - نقاط القوة
   - التحسينات المقترحة

خلي التصميم بالعربي مع code blocks.`,
      `مواصفات الوكيل المطلوب: ${spec}`
    );
    return { success: true, output: `🏗️ **Agent Builder**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 3. ACP Protocol — مستوحى من acp-code
//    Agent Communication Protocol: drafter + verifier
export async function agentACP(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: Drafter Agent (زي crew_acp_server.py)
    const draft = await runAgent(
      `أنت Drafter Agent (ACP Protocol). اكتب تقرير بحثي عن: ${topic}

اكتب:
1. مقدة
2. 3 نقاط رئيسية
3. خاتمة`,
      topic
    );

    // Step 2: Verifier Agent (زي acp_client.py)
    const verified = await runAgent(
      `أنت Verifier Agent (ACP Protocol). راجع التقرير ده وتحقق من:
1. دقة المعلومات
2. اكتمال المحتوى
3. جودة الكتابة

ثم اعمل نسخة محسنة.

التقرير الأصلي:
${draft}`,
      topic
    );

    return { success: true, output: `🔗 **ACP Protocol**\n\n📝 **Draft:**\n${draft}\n\n---\n✅ **Verified:**\n${verified}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 4. A2A Demo — مستوحى من agent2agent-demo
//    Agent2Agent: multiple specialized agents communicate
export async function agentA2A(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت A2A System (مستوحى من agent2agent-demo + python_a2a).

فيه وكلاء متخصصين بيتواصلوا مع بعض:

1. 🧮 Math Agent — عمليات حسابية
2. 📚 Research Agent — بحث معلومات
3. ✍️ Writer Agent — كتابة محتوى
4. 🔍 Analyzer Agent — تحليل بيانات

وزع المهمة على الوكلاء المناسبين، كل واحد يعمل جزء، ثم اجمع النتائج.

اعرض:
1. توزيع المهام
2. رد كل وكيل
3. النتيجة النهائية المجمعة`,
      `المهمة: ${query}`
    );
    return { success: true, output: `🤝 **A2A Protocol**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 5. Compliance Agent — مستوحى من parlant-conversational-agent
//    Parlant: compliance-driven with tools (check_eligibility, process_documents)
export async function agentCompliance(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Compliance Agent (مستوحى من parlant-conversational-agent).

أنت وكيل محادثة بيتبع قواعد compliance صارمة.

القواعد:
1. تحقق من أهلية العميل قبل أي توصية
2. اطلب المستندات المطلوبة
3. اشرح الشروط بوضوح
4. احفظ حقوق المستخدم
5. سجل كل خطوة

Tools المتاحة:
- check_eligibility(credit_score, income, amount) — تحقق الأهلية
- process_documents(docs) — معالجة المستندات
- calculate_terms(amount, duration) — حساب الشروط

استخدم الـ tools لما تحتاج. اعرض النتائج بشكل واضح.`,
      `الاستعلام: ${query}`
    );
    return { success: true, output: `⚖️ **Compliance Agent**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// 6. Content Planner — مستوحى من content_planner_flow
//    CrewAI Flow: scrape → plan → schedule (Typefully)
export async function agentContentPlanner(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Content Planner Agent (مستوحى من content_planner_flow + CrewAI Flow).

خطط محتوى سوشيال ميديا كامل:

1. 🔍 Research Phase
   - تحليل الموضوع
   - الجمهور المستهدف
   - المنصات المناسبة

2. 📝 Content Creation
   - 7 بوستات (يومياً لأسبوع)
   - لكل بوست:
     * النص
     * الهاشتاجات
     * وقت النشر المقترح
     * المنصة (Twitter/Instagram/LinkedIn)

3. 📅 Schedule
   - جدول نشر أسبوعي
   - أفضل الأوقات لكل منصة

4. 📊 Metrics
   - KPIs المقترحة
   - أدوات قياس

5. 🔄 Optimization
   - A/B testing
   - تحسينات مقترحة

خلي الخطة بالعربي ومفصلة.`,
      `الموضوع: ${topic}`
    );
    return { success: true, output: `📅 **Content Planner: ${topic}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// Registry
export interface AdvAgentToolDef { id: string; name: string; description: string; source: string; placeholder: string; }
export const ADV_AGENT_TOOLS: AdvAgentToolDef[] = [
  { id: 'agent-swarm', name: '🐝 Swarm وكلاء', description: 'نظام وكلاء متضافرين (researcher + writer + reviewer)', source: 'openai-swarm-ollama', placeholder: 'اكتب المهمة...' },
  { id: 'agent-builder', name: '🏗️ بناء وكيل', description: 'صمم وكيل AI مخصص بالكامل', source: 'open-agent-builder', placeholder: 'اكتب مواصفات الوكيل...' },
  { id: 'agent-acp', name: '🔗 ACP Protocol', description: 'drafter + verifier agents', source: 'acp-code', placeholder: 'اكتب الموضوع...' },
  { id: 'agent-a2a', name: '🤝 A2A Protocol', description: 'وكلاء متخصصين يتواصلوا مع بعض', source: 'agent2agent-demo', placeholder: 'اكتب المهمة...' },
  { id: 'agent-compliance', name: '⚖️ Compliance Agent', description: 'وكيل compliance بقواعد صارمة', source: 'parlant-conversational-agent', placeholder: 'اكتب الاستعلام...' },
  { id: 'agent-content-planner', name: '📅 مخطط محتوى', description: 'خطة محتوى أسبوع كامل + جدول نشر', source: 'content_planner_flow', placeholder: 'اكتب الموضوع...' },
];

export async function runAdvAgentTool(toolId: string, input: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'agent-swarm': return await agentSwarm(input);
      case 'agent-builder': return await agentBuilder(input);
      case 'agent-acp': return await agentACP(input);
      case 'agent-a2a': return await agentA2A(input);
      case 'agent-compliance': return await agentCompliance(input);
      case 'agent-content-planner': return await agentContentPlanner(input);
      default: return { success: false, output: '', error: `أداة غير معروفة: ${toolId}` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}
