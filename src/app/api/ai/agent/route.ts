import { NextRequest } from 'next/server';
import { performWebSearch, type WebSearchResult } from '@/lib/chat-utils';
import { generateOpenRouterChat } from '@/lib/openrouter';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── Agent Mode API ──────────────────────────────────────────────────
// An autonomous AI agent that breaks down complex tasks into steps
// and executes them sequentially with tool use, streaming results via SSE.
//
// Optimized: Uses OpenRouter fast models instead of slow ZAI SDK.
//   - GPT-4o (openai/gpt-oss-120b:free) for plan, summary, and most tools
//   - Nemotron Reasoning for deep analysis (analyze tool only)
//   - ZAI SDK retained only for web search (performWebSearch)

// ─── Types ────────────────────────────────────────────────────────────
interface AgentStep {
  id: number;
  title: string;
  tool: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  errorDetail?: string;
}

interface AgentPlan {
  steps: AgentStep[];
  summary: string;
}

type SSEEvent =
  | { type: 'plan'; steps: AgentStep[]; summary: string }
  | { type: 'step_start'; step: AgentStep }
  | { type: 'step_progress'; stepId: number; detail: string }
  | { type: 'step_result'; stepId: number; result: string; tool: string }
  | { type: 'step_error'; stepId: number; message: string }
  | { type: 'complete'; summary: string; steps: AgentStep[] }
  | { type: 'error'; message: string };

// ─── Model Constants ──────────────────────────────────────────────────
const GPT4O_MODEL = 'openai/gpt-oss-120b:free';
const NEMOTRON_REASONING_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

// ─── Token Limits ─────────────────────────────────────────────────────
const TOOL_MAX_TOKENS = 1500;
const SUMMARY_MAX_TOKENS = 1000;

// ─── Timeout ──────────────────────────────────────────────────────────
const TOOL_TIMEOUT_MS = 30_000; // 30 seconds per tool execution

// ─── Tool Definitions ─────────────────────────────────────────────────
const TOOL_DEFINITIONS = `
Available tools:
1. search - بحث على الإنترنت للحصول على معلومات محدثة. المدخل: استعلام البحث.
2. analyze - تحليل البيانات أو النصوص بعمق. المدخل: النص أو البيانات للتحليل.
3. generate_text - توليد محتوى نصي إبداعي أو تقني. المدخل: وصف المحتوى المطلوب.
4. generate_image - وصف مفصل لتوليد صورة. المدخل: وصف الصورة المطلوبة.
5. translate - ترجمة محتوى من لغة إلى أخرى. المدخل: النص ولغة الهدف.
6. summarize - تلخيص محتوى طويل بشكل مختصر. المدخل: النص المراد تلخيصه.
7. code - كتابة كود برمجي. المدخل: وصف الكود المطلوب.
8. calculate - إجراء حسابات رياضية. المدخل: المعادلة أو الحساب.
`;

// ─── Helper: OpenRouter call with timeout ─────────────────────────────
async function callOpenRouterWithTimeout(args: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  temperature: number;
  max_tokens: number;
  timeoutMs?: number;
}): Promise<string> {
  const { messages, model, temperature, max_tokens, timeoutMs = TOOL_TIMEOUT_MS } = args;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await generateOpenRouterChat({
      messages,
      model: model as 'openai/gpt-oss-120b:free',
      temperature,
      max_tokens,
    });

    clearTimeout(timeoutId);
    return result.choices?.[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if it was a timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('انتهت مهلة تنفيذ الأداة. يرجى المحاولة مرة أخرى.');
    }
    throw error;
  }
}

// ─── Helper: Execute a Tool ───────────────────────────────────────────
async function executeTool(
  tool: string,
  input: string,
  searchResults: WebSearchResult[]
): Promise<string> {
  switch (tool) {
    case 'search': {
      // Keep ZAI SDK for web search (performWebSearch)
      const results = await performWebSearch(input, 5);
      if (results.length === 0) {
        return 'لم يتم العثور على نتائج بحث.';
      }
      return results
        .map((r, i) => `${i + 1}. ${r.name}: ${r.snippet}`)
        .join('\n');
    }

    case 'analyze': {
      // Use Nemotron Reasoning for deep analysis
      const contextInfo = searchResults.length > 0
        ? `\n\nمعلومات من البحث:\n${searchResults.map((r, i) => `${i + 1}. ${r.name}: ${r.snippet}`).join('\n')}`
        : '';

      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: `أنت محلل بيانات خبير. قم بتحليل المحتوى التالي بشكل عميق ومفصل باللغة العربية. قدّم رؤى واستنتاجات واضحة.${contextInfo}`,
          },
          { role: 'user', content: input },
        ],
        model: NEMOTRON_REASONING_MODEL,
        temperature: 0.3,
        max_tokens: TOOL_MAX_TOKENS,
      });
      return result || 'لم يتم الحصول على نتيجة التحليل.';
    }

    case 'generate_text': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت كاتب محتوى محترف. قم بتوليد المحتوى المطلوب باللغة العربية بشكل احترافي ومفصل.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0.7,
        max_tokens: TOOL_MAX_TOKENS,
      });
      return result || 'لم يتم توليد المحتوى.';
    }

    case 'generate_image': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت فنان وصفي. قم بوصف الصورة المطلوبة بالتفصيل الكامل باللغة العربية، مع وصف المشهد والألوان والإضاءة والتفاصيل البصرية.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0.7,
        max_tokens: 1024,
      });
      return `🎨 وصف الصورة:\n${result || 'لم يتم توليد وصف الصورة.'}`;
    }

    case 'translate': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت مترجم محترف. قم بترجمة النص التالي بدقة مع الحفاظ على المعنى والسياق. أجب بالترجمة فقط.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0.2,
        max_tokens: TOOL_MAX_TOKENS,
      });
      return result || 'لم تتم الترجمة.';
    }

    case 'summarize': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت خبير في التلخيص. قم بتلخيص المحتوى التالي بشكل مختصر وشامل باللغة العربية، مع الحفاظ على النقاط الرئيسية.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0.3,
        max_tokens: TOOL_MAX_TOKENS,
      });
      return result || 'لم يتم التلخيص.';
    }

    case 'code': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت مبرمج محترف. اكتب الكود المطلوب مع التعليقات التوضيحية. استخدم أفضل الممارسات.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0.2,
        max_tokens: TOOL_MAX_TOKENS,
      });
      return result || 'لم يتم كتابة الكود.';
    }

    case 'calculate': {
      const result = await callOpenRouterWithTimeout({
        messages: [
          {
            role: 'system',
            content: 'أنت حاسبة ذكية. قم بإجراء الحساب التالي واعرض النتيجة مع خطوات الحل باللغة العربية.',
          },
          { role: 'user', content: input },
        ],
        model: GPT4O_MODEL,
        temperature: 0,
        max_tokens: 1024,
      });
      return result || 'لم يتم إجراء الحساب.';
    }

    default:
      return 'أداة غير معروفة.';
  }
}

// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth + rate limiting to agent endpoint ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'يجب تسجيل الدخول لاستخدام الوكيل الذكي' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await getUserFromToken(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'يجب تسجيل الدخول لاستخدام الوكيل الذكي' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.ai, maxRequests: 10 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { task, model, maxSteps: rawMaxSteps } = body as {
      task: string;
      model?: string;
      maxSteps?: number;
    };

    // Validate
    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'يرجى إدخال وصف المهمة' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const maxSteps = Math.min(Math.max(rawMaxSteps || 5, 1), 10);

    // ── SSE Streaming ──
    const encoder = new TextEncoder();
    let streamClosed = false;

    function sendEvent(event: SSEEvent) {
      if (streamClosed) return;
      return `data: ${JSON.stringify(event)}\n\n`;
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // ── Step 1: Plan Generation (GPT-4o) ──
          const planPrompt = `أنت وكيل ذكي يقوم بتحليل المهام وتقسيمها إلى خطوات تنفيذية.

المهمة: ${task}

${TOOL_DEFINITIONS}

قم بإنشاء خطة تنفيذية مفصلة تتضمن ${maxSteps} خطوات كحد أقصى.

أجب بصيغة JSON فقط بالشكل التالي (بدون أي نص إضافي):
{
  "steps": [
    {
      "title": "عنوان الخطوة",
      "tool": "اسم الأداة",
      "input": "المدخل للأداة"
    }
  ],
  "summary": "ملخص الخطة"
}

الأدوات المتاحة: search, analyze, generate_text, generate_image, translate, summarize, code, calculate

قواعد مهمة:
- كل خطوة يجب أن تستخدم أداة واحدة فقط
- الخطوات يجب أن تكون متسلسلة ومنطقية
- ابدأ دائماً بالبحث إذا كانت المهمة تتطلب معلومات محدثة
- استخدم analyze للتحليل العميق
- استخدم generate_text لكتابة المحتوى
- استخدم translate للترجمة
- استخدم summarize للتلخيص
- استخدم code لكتابة الأكواد
- استخدم calculate للحسابات
- استخدم generate_image لوصف الصور
- لا تتجاوز ${maxSteps} خطوات`;

          controller.enqueue(encoder.encode(sendEvent({
            type: 'step_progress',
            stepId: 0,
            detail: 'جاري تحليل المهمة وإنشاء الخطة...',
          })!));

          let planData: AgentPlan;
          try {
            // Use GPT-4o via OpenRouter for plan generation
            const planText = await callOpenRouterWithTimeout({
              messages: [
                { role: 'system', content: planPrompt },
                { role: 'user', content: task },
              ],
              model: GPT4O_MODEL,
              temperature: 0.3,
              max_tokens: TOOL_MAX_TOKENS,
              timeoutMs: TOOL_TIMEOUT_MS,
            });

            // Parse JSON from the response
            let parsed: any;
            try {
              // Try to extract JSON from the response
              const jsonMatch = planText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              }
            } catch {
              // If parsing fails, create a default plan
            }

            if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
              planData = {
                steps: parsed.steps.slice(0, maxSteps).map((s: any, i: number) => ({
                  id: i + 1,
                  title: String(s.title || `الخطوة ${i + 1}`),
                  tool: String(s.tool || 'analyze'),
                  input: String(s.input || task),
                  status: 'pending' as const,
                })),
                summary: String(parsed.summary || 'خطة تنفيذية'),
              };
            } else {
              // Fallback: create a simple plan
              planData = {
                steps: [
                  { id: 1, title: 'تحليل المهمة', tool: 'analyze', input: task, status: 'pending' as const },
                  { id: 2, title: 'توليد النتيجة', tool: 'generate_text', input: task, status: 'pending' as const },
                ],
                summary: 'خطة تنفيذية تلقائية',
              };
            }
          } catch (planError) {
            console.error('[Agent] Plan generation error:', planError);
            planData = {
              steps: [
                { id: 1, title: 'تحليل المهمة وتوليد الرد', tool: 'analyze', input: task, status: 'pending' as const },
              ],
              summary: 'خطة مبسطة بسبب خطأ في التخطيط',
            };
          }

          // Send the plan event
          controller.enqueue(encoder.encode(sendEvent({
            type: 'plan',
            steps: planData.steps,
            summary: planData.summary,
          })!));

          // ── Step 2: Execute each step ──
          let allSearchResults: WebSearchResult[] = [];

          for (let i = 0; i < planData.steps.length; i++) {
            if (streamClosed) break;

            const step = planData.steps[i];
            step.status = 'running';

            // Send step_start event
            controller.enqueue(encoder.encode(sendEvent({
              type: 'step_start',
              step,
            })!));

            // Send progress
            controller.enqueue(encoder.encode(sendEvent({
              type: 'step_progress',
              stepId: step.id,
              detail: `جاري تنفيذ: ${step.title} (${step.tool})...`,
            })!));

            try {
              // Execute the tool with a 30-second timeout race
              const resultPromise = executeTool(step.tool, step.input, allSearchResults);

              const timeoutController = new AbortController();
              const timeoutId = setTimeout(() => timeoutController.abort(), TOOL_TIMEOUT_MS);

              let result: string;
              try {
                // Race between tool execution and timeout
                result = await Promise.race([
                  resultPromise,
                  new Promise<never>((_, reject) => {
                    timeoutController.signal.addEventListener('abort', () => {
                      reject(new Error('انتهت مهلة تنفيذ الخطوة (30 ثانية).'));
                    });
                  }),
                ]);
              } finally {
                clearTimeout(timeoutId);
              }

              // If this was a search step, save results for context
              if (step.tool === 'search') {
                try {
                  allSearchResults = await performWebSearch(step.input, 5);
                } catch {
                  // Ignore search caching errors
                }
              }

              step.status = 'completed';
              step.result = result;

              // Send step_result event
              controller.enqueue(encoder.encode(sendEvent({
                type: 'step_result',
                stepId: step.id,
                result,
                tool: step.tool,
              })!));
            } catch (stepError) {
              console.error(`[Agent] Step ${step.id} error:`, stepError);
              const errorMessage = stepError instanceof Error ? stepError.message : 'حدث خطأ أثناء تنفيذ هذه الخطوة.';
              step.status = 'error';
              step.result = errorMessage;
              step.errorDetail = errorMessage;

              controller.enqueue(encoder.encode(sendEvent({
                type: 'step_error',
                stepId: step.id,
                message: errorMessage,
              })!));
            }
          }

          // ── Step 3: Generate final summary (GPT-4o) ──
          if (!streamClosed) {
            const completedSteps = planData.steps.filter((s) => s.status === 'completed');
            const resultsText = completedSteps
              .map((s) => `الخطوة ${s.id} (${s.tool}): ${s.title}\nالنتيجة: ${s.result?.slice(0, 500) || 'لا توجد نتيجة'}`)
              .join('\n\n');

            let finalSummary: string;
            try {
              finalSummary = await callOpenRouterWithTimeout({
                messages: [
                  {
                    role: 'system',
                    content: 'أنت وكيل ذكي. قم بتلخيص نتائج تنفيذ المهمة التالية بشكل شامل ومفيد باللغة العربية. اعرض النتائج بشكل منظم مع النقاط الرئيسية.',
                  },
                  {
                    role: 'user',
                    content: `المهمة: ${task}\n\nنتائج التنفيذ:\n${resultsText}`,
                  },
                ],
                model: GPT4O_MODEL,
                temperature: 0.3,
                max_tokens: SUMMARY_MAX_TOKENS,
                timeoutMs: TOOL_TIMEOUT_MS,
              });
              finalSummary = finalSummary || 'تم تنفيذ المهمة بنجاح.';
            } catch (summaryError) {
              console.error('[Agent] Summary generation error:', summaryError);
              finalSummary = 'تم تنفيذ المهمة.';
            }

            controller.enqueue(encoder.encode(sendEvent({
              type: 'complete',
              summary: finalSummary,
              steps: planData.steps,
            })!));
          }

          // Close stream
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[Agent] Stream error:', error);
          if (!streamClosed) {
            try {
              controller.enqueue(encoder.encode(sendEvent({
                type: 'error',
                message: 'حدث خطأ أثناء تنفيذ الوكيل الذكي. يرجى المحاولة مرة أخرى.',
              })!));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {
              // Controller already closed
            }
          }
        }
      },
      cancel() {
        streamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Agent] POST error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ في الخادم' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
