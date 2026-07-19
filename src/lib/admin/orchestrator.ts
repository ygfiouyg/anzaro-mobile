/**
 * Admin Agent Orchestrator
 * ========================
 * عقل الـ Admin Agent. بيشغل ReAct loop:
 *
 *   رسالة الأدمن
 *        │
 *        ▼
 *   ┌─────────────────────────────────────────┐
 *   │  GLM (مع أدوات التحكم متاحة)            │
 *   └───────────────┬─────────────────────────┘
 *                   │ response (نص OR tool_calls)
 *                   ▼
 *   ┌─────────────────────────────────────────┐
 *   │  فيه tool calls?  ── لا ──▶  رد نهائي   │
 *   │      │ آه                                │
 *   │      ▼                                   │
 *   │  تنفيذ كل أداة (read/write/search/lint) │
 *   │      │                                   │
 *   │      ▼                                   │
 *   │  إرجاع النتائج لـ GLM  ◀── loop ────────│
 *   └─────────────────────────────────────────┘
 *
 * كل حاجة بتـ stream عبر SSE للواجهة.
 */

import ZAI from "z-ai-web-dev-sdk";
import { getZAIClient } from "../zai-client";
import type { ChatMessage } from "z-ai-web-dev-sdk";
import { ADMIN_TOOLS } from "./tools";
import { executeAdminTool, type ToolEventEmitter } from "./executor";
import { findRelevantSkills, getSkill } from "../skills/loader";

export interface AdminMessage extends ChatMessage {
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AdminSSEEvent {
  type: "token" | "tool_start" | "tool_end" | "thinking" | "done" | "error" | "step" | "status" | "skills_loaded";
  content?: string;
  tool?: string;
  tool_call_id?: string;
  args?: unknown;
  result?: unknown;
  step?: number;
  error?: string;
  status?: unknown;
  skills?: string[];
}

export type AdminSSESink = (event: AdminSSEEvent) => void;

const MAX_ITERATIONS = 20; // safety cap — increased for complex multi-step tasks (install + edit + lint + commit)

/** تحويل أدوات الأدمن لصيغة GLM function-calling. */
function adminToolsToGLM() {
  return ADMIN_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

const ADMIN_SYSTEM_PROMPT = `أنت "Admin Agent" — مهندس برمجيات محترف ومسؤول عن تطوير وصيانة منصة DeltaAI.

لديك صلاحية كاملة وقوية للتحكم في المنصة عبر الأدوات التالية (12 أداة):

أدوات الملفات والكود:
- list_files: عرض ملفات المشروع
- read_file: قراءة ملف
- write_file: إنشاء أو استبدال ملف بالكامل
- modify_file: تعديل مستهدف (find & replace)
- delete_file: حذف ملف أو مجلد
- search_code: بحث regex في الكود
- run_lint: فحص جودة الكود (ESLint)
- analyze_structure: تحليل هيكل المشروع

أدوات النظام الكاملة (قوة كاملة):
- run_command: تشغيل أي أمر shell (bun add, git, npm, build, etc.) — timeout 120s
- install_package: تثبيت أي package من npm (bun add)
- fetch_url: تنزيل أي محتوى من أي URL (GitHub raw, APIs, ملفات)
- git_commit_push: حفظ التغييرات في git ورفعها للـ remote (commit + push)

🧠 المهارات التسويقية (Marketing Skills):
المنصة فيها 45+ skill تسويقية في .agents/skills/ (CRO, copywriting, SEO, ads, analytics, pricing, إلخ).
لما المستخدم يسأل سؤال تسويقي، سيستم يضيف لك الـ skills المناسبة تلقائياً في الـ context.
اتبع الـ instructions في الـ skill بحرفية — هي مكتوبة من خبراء تسويق.

قواعد العمل:
1. ابدأ دائماً بـ analyze_structure أو list_files لفهم المشروع قبل أي تعديل.
2. قبل تعديل ملف، اقرأه أولاً بـ read_file لتفهم محتواه.
3. للإصلاحات الصغيرة استخدم modify_file. للملفات الجديدة أو إعادة الكتابة استخدم write_file.
4. لو المستخدم طلب تول/package من خارج المنصة: استخدم fetch_url لتنزيل الكود، أو install_package للتثبيت.
5. لو المستخدم طلب حفظ التغييرات بشكل دائم: استخدم git_commit_push برسالة واضحة.
6. بعد أي تعديل برمجي، شغل run_lint للتأكد من عدم وجود أخطاء.
7. اشرح للأدمن بالعربي ماذا فعلت ولماذا، بشكل واضح ومختصر.
8. لو فيه أخطاء، حللها وصلحها خطوة بخطوة.
9. اكتب كود Production-Ready نظيف بدون تعليقات فارغة مثل "// اكتب الكود هنا".
10. التزم بـ Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui.
11. لو سؤال المستخدم تسويقي وفي skill مضافة في الـ context، استخدم معرفتها واتبع frameworks بتاعتها.

أنت تقدر تعمل أي حاجة: تثبيت packages، تنزيل كود من GitHub، تشغيل builds، تعديل ملفات، حفظ التغييرات في git، وتقديم نصائح تسويقية احترافية. استخدم قوتك بحكمة وبادر بالحلول.

أسلوبك: احترافي، مباشر، وواضح. رد بالعربي دائماً.`;

/**
 * يدوّر على الـ skills المناسبة لآخر رسالة من المستخدم
 * ويرجعها كـ context إضافي للـ system prompt.
 */
async function buildSkillContext(messages: AdminMessage[]): Promise<string> {
  // آخر رسالة من المستخدم
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg || !lastUserMsg.content) return "";

  try {
    const relevant = await findRelevantSkills(lastUserMsg.content, 2);
    if (relevant.length === 0) return "";

    const skillsContent: string[] = [];
    for (const skillMeta of relevant) {
      const skill = await getSkill(skillMeta.name);
      if (skill && skill.content) {
        skillsContent.push(`\n\n═══ SKILL: ${skill.name} ═══\n${skill.content.slice(0, 4000)}\n═══ END SKILL ═══`);
      }
    }

    if (skillsContent.length === 0) return "";

    return `\n\n📋 المهارات المناسبة المضافة تلقائياً:${skillsContent.join("\n")}\n\nاستخدم المعرفة دي في الرد على سؤال المستخدم.`;
  } catch {
    return "";
  }
}

/**
 * تشغيل حلقة الأدمن الكاملة لرسالة واحدة.
 */
export async function orchestrateAdmin(
  messages: AdminMessage[],
  sink: AdminSSESink,
  options: { enableThinking?: boolean } = {},
): Promise<void> {
  const zai = await getZAIClient();
  const glmTools = adminToolsToGLM();

  // 🧠 Auto-load relevant marketing skills based on the user's question
  const skillContext = await buildSkillContext(messages);
  const systemContent = ADMIN_SYSTEM_PROMPT + skillContext;

  // Emit skill info to the UI so the user sees what skills were loaded
  if (skillContext) {
    const loadedSkills = skillContext.match(/SKILL: (\w+)/g)?.map((s) => s.replace("SKILL: ", "")) ?? [];
    if (loadedSkills.length > 0) {
      sink({ type: "skills_loaded", skills: loadedSkills });
    }
  }

  const conversation: AdminMessage[] = [
    { role: "system", content: systemContent },
    ...messages,
  ];

  for (let step = 1; step <= MAX_ITERATIONS; step++) {
    sink({ type: "step", step });

    let assistantText = "";
    const toolCallsMap = new Map<number, ToolCall>();

    try {
      const stream: ReadableStream<Uint8Array> = await zai.chat.completions.create({
        model: "glm-4-plus",
        messages: conversation as any,
        tools: glmTools as any,
        tool_choice: "auto",
        stream: true,
        thinking: options.enableThinking ? { type: "enabled" } : { type: "disabled" },
      } as any);

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]" || !payload) continue;
          let parsed: any;
          try { parsed = JSON.parse(payload); } catch { continue; }
          const delta = parsed?.choices?.[0]?.delta ?? {};
          if (delta.reasoning_content) {
            sink({ type: "thinking", content: delta.reasoning_content });
          }
          if (delta.content) {
            assistantText += delta.content;
            sink({ type: "token", content: delta.content });
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id ?? `call_${idx}_${Date.now()}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                });
              }
              const existing = toolCallsMap.get(idx)!;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              if (tc.id && existing.id.includes("call_") && existing.id === `call_${idx}_${Date.now()}`) existing.id = tc.id;
            }
          }
        }
      }
    } catch (e: any) {
      sink({ type: "error", error: `GLM call failed: ${e.message}` });
      return;
    }

    const toolCalls = [...toolCallsMap.values()].filter((tc) => tc.function.name);

    // Append assistant message
    const assistantMessage: AdminMessage = {
      role: "assistant",
      content: assistantText || "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    conversation.push(assistantMessage);

    // No tool calls → final answer
    if (toolCalls.length === 0) {
      sink({ type: "done", content: assistantText });
      return;
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = { _raw: tc.function.arguments };
      }

      sink({ type: "tool_start", tool: toolName, tool_call_id: tc.id, args: parsedArgs });

      const result = await executeAdminTool(toolName, parsedArgs);

      sink({
        type: "tool_end",
        tool: toolName,
        tool_call_id: tc.id,
        result: result.success ? result.output : { error: result.error },
      });

      // Compose tool result message for GLM (cap size to avoid token overflow)
      let resultText: string;
      if (typeof result.output === "string") {
        resultText = result.output.slice(0, 12000);
      } else {
        resultText = JSON.stringify(result.output ?? { error: result.error }).slice(0, 12000);
      }

      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        name: toolName,
        content: resultText,
      } as any);
    }
    // loop continues
  }

  sink({ type: "done", content: "وصلت للحد الأقصى من خطوات التنفيذ." });
}
