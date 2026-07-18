/**
 * Compare & Training Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - code-model-comparison: parallel responses + Opik evaluation
 * - gpt-oss-vs-qwen3: reasoning comparison
 * - eval-and-observability: RAG evaluation pipeline
 * - guidelines-vs-traditional-prompt: structured guidelines vs prompts
 * - DeepSeek-finetuning: fine-tuning guide
 * - Build-reasoning-model: build reasoning models
 */

import { chatWithFallback } from '../chat-utils';

async function runAgent(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await chatWithFallback([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  return result.content;
}

// ═══════════════════════════════════════════
// 1. Model Comparison — مستوحى من code-model-comparison
//    model_service.py: get_parallel_responses + evaluate_code
// ═══════════════════════════════════════════
export async function compareModels(query: string, models?: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // محاكاة parallel responses — GLM-5.2 بيحلل ويقارن
    const output = await runAgent(
      `أنت Model Comparison Agent. قارن بين نماذج AI مختلفة بناء على الاستعلام.

اعمل مقارنة شاملة في JSON format:
{
  "query": "الاستعلام",
  "comparison": {
    "model_a": {
      "name": "GPT-4",
      "strengths": ["..."],
      "weaknesses": ["..."],
      "score": 8.5,
      "best_for": "..."
    },
    "model_b": {
      "name": "Claude 3.5",
      "strengths": ["..."],
      "weaknesses": ["..."],
      "score": 8.0,
      "best_for": "..."
    }
  },
  "evaluation": {
    "correctness": {"model_a": 8, "model_b": 7, "winner": "model_a"},
    "readability": {"model_a": 9, "model_b": 9, "winner": "tie"},
    "best_practices": {"model_a": 8, "model_b": 8, "winner": "tie"}
  },
  "overall_winner": "model_a",
  "recommendation": "..."
}

استخدم معايير Opik GEval:
1. Correctness — الصحة الوظيفية
2. Readability — القراءة والتنظيم
3. Best Practices — أفضل الممارسات

خلي المقارنة بالعربي مع JSON.`,
      `قارن بين النماذج دي على الاستعلام: "${query}"\nالنماذج: ${models?.join(', ') || 'GPT-4, Claude 3.5, GLM-5.2'}`
    );
    return { success: true, output: `📊 **مقارنة النماذج**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 2. Code Comparison — مستوحى من code-model-comparison
//    code_evaluation_opik.py: evaluate_code (correctness, readability, best_practices)
// ═══════════════════════════════════════════
export async function compareCode(code: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Code Evaluation Agent. قيّم الكود ده باستخدام معايير Opik GEval:

1. 🎯 Correctness (الصحة الوظيفية)
   - هل الكود صحيح وظيفياً؟
   - بيغطى الـ edge cases؟
   - فيه bugs؟

2. 📖 Readability (القراءة)
   -命名 conventions صح؟
   - فيه comments/docstrings؟
   - الكود منظم؟

3. 🏆 Best Practices (أفضل الممارسات)
   - error handling؟
   - security؟
   - efficiency؟
   - modularity؟

لكل معيار: درجة (0-10) + سبب
إجمالي: متوسط الدرجات
passed: >= 7.0

استخدم JSON format:
{
  "overall_score": 8.0,
  "detailed_metrics": {
    "correctness": {"score": 8, "reason": "..."},
    "readability": {"score": 9, "reason": "..."},
    "best_practices": {"score": 7, "reason": "..."}
  },
  "passed": true,
  "suggestions": ["...", "..."]
}`,
      `قيّم الكود ده:\n\n${code.slice(0, 8000)}`
    );
    return { success: true, output: `🏆 **تقييم الكود**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 3. Reasoning Comparison — مستوحى من gpt-oss-vs-qwen3
//    evaluate_reasoning: GEval metrics for reasoning
// ═══════════════════════════════════════════
export async function compareReasoning(question: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Reasoning Comparison Agent. حلل قدرة الاستدلال في نماذج AI مختلفة.

اعمل تحليل شامل:
1. 📋 السؤال الأصلي
2. 🧠 تحليل قدرة الاستدلال المطلوبة:
   - logical reasoning (استدلال منطقي)
   - mathematical reasoning (استدلال رياضي)
   - causal reasoning (استدلال سببي)
   - analogical reasoning (استدلال قياسي)
3. 📊 مقارنة النماذج:
   - GPT-4: قدرة استدلال...
   - Claude 3.5: قدرة استدلال...
   - GLM-5.2: قدرة استدلال...
4. 🎯 النموذج الأفضل لهذا النوع من الاستدلال
5. 💡 توصيات

خلي التحليل بالعربي ومفصل.`,
      `حلل قدرة الاستدلال المطلوبة للسؤال ده: "${question}"`
    );
    return { success: true, output: `🧠 **مقارنة الاستدلال**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 4. RAG Evaluation — مستوحى من eval-and-observability
//    Opik: evaluate RAG pipeline (retrieval + generation)
// ═══════════════════════════════════════════
export async function evaluateRAG(query: string, response: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت RAG Evaluation Agent. قيّم جودة نظام RAG بناء على الاستعلام والرد.

قيّم باستخدام المعايير دي:

1. 📊 Context Relevance
   - هل الرد متعلق بالاستعلام؟ (0-10)

2. 🎯 Answer Relevance
   - هل الرد بيجاوب السؤال فعلاً؟ (0-10)

3. ✅ Factual Accuracy
   - هل المعلومات صحيحة؟ (0-10)

4. 📝 Completeness
   - هل الرد مكتمل؟ (0-10)

5. 🚫 Hallucination Detection
   - فيه معلومات مختلقة؟ (0 = مفيش، 10 = كتير)

6. 📏 Groundedness
   - الرد مبني على الـ context؟ (0-10)

JSON format:
{
  "overall_score": 8.0,
  "metrics": {
    "context_relevance": 8,
    "answer_relevance": 9,
    "factual_accuracy": 7,
    "completeness": 8,
    "hallucination": 2,
    "groundedness": 9
  },
  "issues": ["...", "..."],
  "recommendations": ["...", "..."]
}`,
      `الاستعلام: ${query}\n\nالرد: ${response.slice(0, 5000)}`
    );
    return { success: true, output: `📊 **تقييم RAG**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 5. Guidelines vs Prompts — مستوحى من guidelines-vs-traditional-prompt
//    Compare structured guidelines vs traditional prompts
// ═══════════════════════════════════════════
export async function compareGuidelines(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت Prompt Engineering Agent. قارن بين:

1. Traditional Prompt — prompt طويل فيه كل التعليمات
2. Structured Guidelines — إرشادات منظمة + قواعد

اعمل مقارنة عملية:
1. 📝 Traditional Prompt example (للموضوع ده)
2. 📋 Structured Guidelines example (للموضوع ده)
3. 📊 مقارنة:
   - الوضوح
   - المرونة
   - القابلية لإعادة الاستخدام
   - جودة النتائج
4. 🎯 متى تستخدم كل منهما
5. 💡 توصيات

خلي المقارنة بالعربي مع أمثلة عملية.`,
      `الموضوع: ${topic}`
    );
    return { success: true, output: `📋 **إرشادات vs Prompts: ${topic}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 6. Fine-tuning Guide — مستوحى من DeepSeek-finetuning + Build-reasoning-model
// ═══════════════════════════════════════════
export async function finetuningGuide(topic: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runAgent(
      `أنت AI Training Agent. دليل شامل لـ fine-tuning وبناء النماذج.

1. 📋 نظرة عامة على fine-tuning
2. 🔧 المتطلبات:
   - Hardware (GPU/TPU)
   - Libraries (Unsloth, PEFT, LoRA)
   - Data format
3. 📊 تحضير البيانات:
   - Format (JSONL, chat format)
   - Cleaning
   - Split (train/val/test)
4. ⚙️ إعداد التدريب:
   - Hyperparameters
   - LoRA config
   - Training arguments
5. 🚀 خطوات التدريب (code examples)
6. 📈 التقييم:
   - Metrics (loss, perplexity)
   - Human evaluation
7. 🏗️ بناء reasoning model (من Build-reasoning-model):
   - GRPO training
   - Reward model
   - RL pipeline
8. 💡 أفضل الممارسات

خلي الدليل بالعربي مع code examples.`,
      `الموضوع: ${topic}`
    );
    return { success: true, output: `🔬 **دليل Fine-tuning: ${topic}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════
export interface CompareToolDef { id: string; name: string; description: string; source: string; placeholder: string; }
export const COMPARE_TOOLS: CompareToolDef[] = [
  { id: 'compare-models', name: '📊 مقارنة نماذج', description: 'مقارنة بين نماذج AI مختلفة', source: 'code-model-comparison', placeholder: 'اكتب الاستعلام... مثال: اكتب دالة sort' },
  { id: 'compare-code', name: '🏆 تقييم كود', description: 'تقييم كود بمعايير Opik (correctness, readability, best practices)', source: 'code-model-comparison', placeholder: 'الصق الكود هنا...' },
  { id: 'compare-reasoning', name: '🧠 مقارنة استدلال', description: 'تحليل قدرة الاستدلال في النماذج', source: 'gpt-oss-vs-qwen3', placeholder: 'اكتب السؤال... مثال: ليه السماء زرقا؟' },
  { id: 'eval-rag', name: '📊 تقييم RAG', description: 'تقييم جودة نظام RAG (relevance, accuracy, hallucination)', source: 'eval-and-observability', placeholder: 'اكتب الاستعلام والرد...' },
  { id: 'compare-guidelines', name: '📋 إرشادات vs Prompts', description: 'مقارنة structured guidelines vs traditional prompts', source: 'guidelines-vs-traditional-prompt', placeholder: 'اكتب الموضوع...' },
  { id: 'finetune-guide', name: '🔬 دليل Fine-tuning', description: 'دليل شامل لـ fine-tuning + بناء reasoning models', source: 'DeepSeek-finetuning', placeholder: 'اكتب الموضوع...' },
];

export async function runCompareTool(toolId: string, input: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'compare-models': return await compareModels(input);
      case 'compare-code': return await compareCode(input);
      case 'compare-reasoning': return await compareReasoning(input);
      case 'eval-rag': {
        // input = "query|response"
        const [query, response] = input.split('|').map(s => s.trim());
        return await evaluateRAG(query || input, response || '');
      }
      case 'compare-guidelines': return await compareGuidelines(input);
      case 'finetune-guide': return await finetuningGuide(input);
      default: return { success: false, output: '', error: `أداة غير معروفة: ${toolId}` };
    }
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}
