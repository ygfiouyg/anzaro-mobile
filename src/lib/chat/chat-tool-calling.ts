/**
 * Chat Tool-Calling Layer (LLM-driven, NO regex, NO ZAI)
 * الـ LLM نفسه بيفهم طلب المستخدم ويقرر أنهي أداة يستخدمها.
 * مفيش أي اعتماد على ZAI — كل موديل بيستخدم الـ API بتاعه.
 */
import type { MCPTool } from "@/lib/mcp/types";
import { listTools, executeTool } from "@/lib/mcp/registry";

const MAX_ROUNDS = 5;
const TOOL_BUDGET = 30;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface ToolCallDecision {
  hasToolCalls: boolean;
  content: string;
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  messages: ChatMessage[];
}

export type StatusCallback = (status: string, phase?: "thinking" | "executing" | "finalizing") => void;

// حمّل الأدوات المتاحة (static + dynamic من DB)
async function getAvailableToolsAsync(): Promise<MCPTool[]> {
  const staticTools = listTools();
  try {
    const dynamic = await getDynamicTools();
    return [...staticTools, ...dynamic];
  } catch {
    return staticTools;
  }
}

function getAvailableTools(): MCPTool[] {
  return listTools();
}

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    google_calendar_reminder: "تذكير في التقويم",
    google_calendar_lister: "قراية الجدول",
    google_tasks_manager: "إضافة مهمة",
    google_contacts_reader: "البحث في جهات الاتصال",
    google_drive_file_search: "البحث في Drive",
    google_drive_pdf_reader: "قراية PDF",
    google_docs_writer: "إنشاء مستند",
    google_docs_reader: "قراية مستند",
    google_sheets_reader: "قراية شيت",
    google_sheets_logger: "تسجيل في شيت",
    google_sheets_append: "إضافة لشيت",
    manage_chat_memory: "الذاكرة",
    web_search: "بحث في الإنترنت",
    page_read: "قراية صفحة",
    country_info: "معلومات دولة",
    memory_set: "حفظ في الذاكرة",
    memory_get: "استرجاع الذاكرة",
  };
  return map[name] ?? name;
}

/** Refusal keywords — لو الـ LLM رفض، نعيد المحاولة مع prompt أقوى. */
const REFUSAL_PATTERNS = [
  /لا أستطيع|لا اقدر|لا أقدر|ممنوع|غير قادر|خارج نطاق|خصوصية|personal|privacy|cannot provide|can't provide/i,
];

/** "False success" keywords — الـ LLM بيقول "تم/حطيت/ضفت" بدون ما يستدعي أداة. */
const FALSE_SUCCESS_PATTERNS = [
  /تمام|تم\b|خلاص|حطيت|ضفت|أنشأت|عملت\s+لك|سجلت|اتم\s+ال|تم\s+الإضافة|تم\s+الإنشاء/i,
];

function isRefusal(content: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(content));
}

/** بيـ detect إن الـ LLM بيقول "تم" بدون ما يستدعي أداة (false success). */
function isFalseSuccess(content: string): boolean {
  return FALSE_SUCCESS_PATTERNS.some((p) => p.test(content));
}

async function runLLMRound(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string,
  forceTool = false,
  maxTokens = 8192,
  apiKey?: string,
  baseUrl?: string,
): Promise<ToolCallDecision> {
  const allTools = await getAvailableToolsAsync();
  const tools = allTools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const fullMessages: ChatMessage[] = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: systemPrompt }, ...messages];

  const request: Record<string, unknown> = {
    model: model,
    messages: fullMessages,
    tools,
    tool_choice: forceTool ? "required" : "auto",
    stream: false,
    temperature: 0.7,
    max_tokens: maxTokens,
  };

  // مفيش fallback لـ ZAI — الـ caller بيبعت apiKey + baseUrl
  let completion: any;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/chat/completions`
      : `https://api.openai.com/v1/chat/completions`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`API ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    completion = await resp.json();
  } catch (primaryError) {
    // مفيش fallback — لو الموديل فشل، بنرجع الخطأ
    console.warn(`[ToolCall] Model ${model} failed:`,
      primaryError instanceof Error ? primaryError.message : String(primaryError));
    throw primaryError;
  }

  const choice = (completion as any).choices?.[0];
  if (!choice) return { hasToolCalls: false, content: "", toolCalls: [], messages: fullMessages };

  const message = choice.message ?? {};
  const toolCalls = message.tool_calls ?? [];
  const content = message.content ?? "";

  const assistantMsg: ChatMessage = {
    role: "assistant",
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  return {
    hasToolCalls: toolCalls.length > 0,
    content,
    toolCalls,
    messages: [...fullMessages, assistantMsg],
  };
}

async function executeToolCall(
  call: { id: string; function: { name: string; arguments: string } },
  onStatus?: StatusCallback,
): Promise<ChatMessage | null> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = { _raw: call.function.arguments }; }

  const displayName = toolDisplayName(call.function.name);
  const argPreview = JSON.stringify(args).slice(0, 80);
  onStatus?.(`بنفّذ أداة: ${displayName} (${argPreview}...)`, "executing");
  console.log(`[ToolCall] executing: ${call.function.name}(${argPreview})`);

  const result = await executeTool(call.function.name, args);
  if (result.success === false && result.error?.includes("غير موجودة")) return null;

  const resultStr = result.success
    ? JSON.stringify(result.data ?? { ok: true })
    : JSON.stringify({ error: result.error });

  return { role: "tool", content: resultStr, tool_call_id: call.id, name: call.function.name };
}

export interface ChatToolResult {
  finalContent: string;
  usedTools: boolean;
  toolsExecuted: string[];
}

export async function runChatWithTools(
  userMessage: string,
  model: string,
  systemPrompt: string,
  conversationHistory: ChatMessage[] = [],
  onStatus?: StatusCallback,
  maxTokens = 8192,
  apiKey?: string,
  baseUrl?: string,
): Promise<ChatToolResult> {
  const userMsg: ChatMessage = { role: "user", content: userMessage };
  let messages: ChatMessage[] = [...conversationHistory, userMsg];
  const toolsExecuted: string[] = [];

  onStatus?.("بفكّر في طلبك وبحدد أنهي أداة مناسبة...", "thinking");

  let forcedRetry = false; // بعد الرفض الأول، بنـ force tool_choice=required

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const decision = await runLLMRound(messages, model, systemPrompt, forcedRetry, maxTokens, apiKey, baseUrl);
    messages = decision.messages;

    if (!decision.hasToolCalls) {
      // لو الـ LLM رفض OR قال "تم" بدون ما يستدعي أداة (false success)
      // → فوراً ننفّذ أقرب أداة يدوياً
      const needsManualFallback = toolsExecuted.length === 0 && round === 0 &&
        (isRefusal(decision.content) || isFalseSuccess(decision.content));

      if (needsManualFallback) {
        console.warn(`[ToolCall] LLM ${isRefusal(decision.content) ? "refused" : "false success"} — executing tool manually`);
        onStatus?.("بنفّذ الأداة المناسبة...", "executing");
        const allTools = await getAvailableToolsAsync();
        const userText = userMessage.toLowerCase();
        let bestMatch: MCPTool | null = null;
        let bestMatchArgs: Record<string, unknown> = {};
        if (userText.includes("تذكير") || userText.includes("ذكرني") || userText.includes("فكرني") || userText.includes("موعد") || userText.includes("اجتماع") || userText.includes("ميتب") || userText.includes("reminder")) {
          // تذكير/موعد → calendar reminder
          bestMatch = allTools.find(t => t.name === "google_calendar_reminder") ?? null;
          // استخرج العنوان + الوقت
          const title = userMessage.replace(/.*(فكرني|ذكرني|ضيف\s*موعد|حط\s*تذكير)[:\s]*/, "")
            .replace(/الساعة.*/i, "").replace(/\d+\s*(دقيقة|ساعة|يوم).*/i, "").trim() || userMessage;
          // حساب الوقت (افتراضي: بعد ساعة من دلوقتي)
          const now = new Date();
          const start = new Date(now.getTime() + 60 * 60 * 1000); // +1 ساعة
          const end = new Date(start.getTime() + 30 * 60 * 1000); // +30 دقيقة
          bestMatchArgs = {
            summary: title.slice(0, 100),
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            reminderMinutes: 5,
          };
        } else if (userText.includes("رقم") || userText.includes("هاتف") || userText.includes("contact")) {
          bestMatch = allTools.find(t => t.name === "google_contacts_reader") ?? null;
          const name = userMessage.replace(/.*(رقم|هاتف)\s*/, "").trim() || userMessage;
          bestMatchArgs = { search_name: name };
        } else if (userText.includes("ملف") || userText.includes("pdf") || userText.includes("drive") || userText.includes("دورلي")) {
          bestMatch = allTools.find(t => t.name === "google_drive_file_search") ?? null;
          const name = userMessage.replace(/.*(دور|ابحث|لقي).*على\s*/, "").trim() || userMessage;
          bestMatchArgs = { name };
        } else if (userText.includes("جدول") || userText.includes("مواعيد") || userText.includes("calendar") || userText.includes("عندي ايه") || userText.includes("عندي إيه")) {
          bestMatch = allTools.find(t => t.name === "google_calendar_lister") ?? null;
          bestMatchArgs = {};
        } else if (userText.includes("مهمة") || userText.includes("task") || userText.includes("ضيف")) {
          bestMatch = allTools.find(t => t.name === "google_tasks_manager") ?? null;
          const title = userMessage.replace(/.*(ضيف|مهمة)[:\s]*/, "").trim() || userMessage;
          bestMatchArgs = { title };
        }
        if (bestMatch) {
          onStatus?.(`بنفّذ أداة: ${toolDisplayName(bestMatch.name)}`, "executing");
          const r = await executeTool(bestMatch.name, bestMatchArgs);
          if (r.success) {
            toolsExecuted.push(bestMatch.name);
            messages.push({ role: "tool", content: JSON.stringify(r.data ?? { ok: true }), tool_call_id: "manual-fallback", name: bestMatch.name });
            continue; // نروح للـ round اللي بعد كده (LLM بيكتب الرد النهائي)
          } else {
            // الأداة فشلت → رجّع خطأ للمستخدم
            return { finalContent: r.error ?? "فشل تنفيذ الأداة.", usedTools: false, toolsExecuted };
          }
        }
      }

      if (toolsExecuted.length > 0) {
        onStatus?.("خلصت تنفيذ الأدوات، بكتب الرد النهائي...", "finalizing");
      }
      return { finalContent: decision.content, usedTools: toolsExecuted.length > 0, toolsExecuted };
    }

    for (const call of decision.toolCalls) {
      const toolMsg = await executeToolCall(call, onStatus);
      if (toolMsg) {
        messages.push(toolMsg);
        toolsExecuted.push(call.function.name);
        if (toolsExecuted.length >= TOOL_BUDGET) break;
      } else {
        messages.push({
          role: "tool",
          content: JSON.stringify({ error: `Tool "${call.function.name}" غير متاح.` }),
          tool_call_id: call.id,
          name: call.function.name,
        });
      }
    }

    if (toolsExecuted.length >= TOOL_BUDGET) {
      messages.push({ role: "user", content: "وصلت للحد الأقصى. لخّص النتايج ورد." } as ChatMessage);
    }

    if (round < MAX_ROUNDS - 1) {
      onStatus?.("شفت نتيجة الأداة، بفكّر لو محتاج أداة تانية...", "thinking");
    }
  }

  onStatus?.("بكتب الرد النهائي...", "finalizing");
  const finalDecision = await runLLMRound(messages, model, systemPrompt, false, maxTokens, apiKey, baseUrl);
  return {
    finalContent: finalDecision.content || "اتم تنفيذ الأدوات بس مفيش رد نهائي.",
    usedTools: toolsExecuted.length > 0,
    toolsExecuted,
  };
}
