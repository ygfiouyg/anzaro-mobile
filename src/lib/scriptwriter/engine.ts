/**
 * Script Writer Engine
 * =====================
 * المحرك الأساسي لأداة كتابة السكريبت.
 *
 * Flow:
 *   Request → load skills → build prompt → GLM stream → parse → ScriptResult
 */

import { getZAIClient } from "@/lib/zai-client";
import { buildSkillContextFromNames } from "../skills/context-builder";
import { findRelevantSkills } from "../skills/loader";
import { buildScriptWriterSystemPrompt, buildUserMessage, REQUIRED_SCRIPT_SKILLS } from "./prompt-builder";
import type { ScriptWriterRequest, ScriptResult, ScriptSegment, ScriptSSEEvent } from "./types";

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export type ScriptSSESink = (event: ScriptSSEEvent) => void;

/**
 * تحميل الـ skills المناسبة للسكريبت.
 * - 3 skills أساسية (script-writing, retention-hooks, persuasion-triggers)
 * - 1-2 skills ديناميكية حسب الموضوع والـ contentType
 */
async function loadRelevantScriptSkills(req: ScriptWriterRequest): Promise<{
  context: string;
  loadedSkills: string[];
}> {
  // الـ skills الأساسية دايماً موجودة
  const requiredNames = [...REQUIRED_SCRIPT_SKILLS];

  // skills ديناميكية حسب الموضوع
  // مثلاً لو السكريبت عن manipulation أو تأثير، نضيف dark-psychology
  // لو عن audience، نضيف audience-psychology
  // لو عن emotions، نضيف emotional-manipulation
  const topicQuery = `${req.topic} ${req.contentType} ${req.audience ?? ""} ${req.tone ?? ""}`;
  const dynamicSkills = await findRelevantSkills(topicQuery, 3);

  // فلترة الـ skills الأساسية عشان نتجنب التكرار
  const dynamicNames = dynamicSkills
    .map((s) => s.name)
    .filter((name) => !requiredNames.includes(name))
    // بس الـ psychology skills الجديدة (مش الـ marketing skills العادية)
    .filter((name) =>
      ["dark-psychology", "emotional-manipulation", "audience-psychology"].includes(name),
    )
    .slice(0, 2); // max 2 ديناميكية

  const allNames = [...requiredNames, ...dynamicNames];
  return buildSkillContextFromNames(allNames);
}

/**
 * تحويل الـ markdown المولّد لـ ScriptResult.
 * بيستخرج الـ JSON block من الآخر.
 */
function parseScriptResult(
  markdown: string,
  req: ScriptWriterRequest,
  loadedSkills: string[],
): ScriptResult {
  let segments: ScriptSegment[] = [];
  let openLoops: { openedAt: string; resolvedAt: string }[] = [];
  let emotionalArc: string[] = [];

  // محاولة استخراج الـ JSON block
  const jsonMatch = markdown.match(/```script-metadata\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const metadata = JSON.parse(jsonMatch[1]);
      if (Array.isArray(metadata.segments)) segments = metadata.segments;
      if (Array.isArray(metadata.openLoops)) openLoops = metadata.openLoops;
      if (Array.isArray(metadata.emotionalArc)) emotionalArc = metadata.emotionalArc;
    } catch {
      // لو JSON parse فشل، نكمل بالـ markdown بس
    }
  }

  // لو مفيش segments مستخرجة، نعمل segments افتراضية من الـ markdown
  if (segments.length === 0) {
    const sectionRegex = /^##\s+(.+?)$/gm;
    const matches: { label: string; start: number }[] = [];
    let match;
    while ((match = sectionRegex.exec(markdown)) !== null) {
      matches.push({ label: match[1].trim(), start: match.index + match[0].length });
    }
    for (let i = 0; i < matches.length; i++) {
      const label = matches[i].label;
      const content = markdown
        .slice(matches[i].start, i + 1 < matches.length ? matches[i + 1].start - matches[i].label.length - 3 : undefined)
        .trim();
      let section: ScriptSegment["section"] = "body";
      if (/hook|خطاف|hook/i.test(label)) section = "hook";
      else if (/intro|مقدمة/i.test(label)) section = "intro";
      else if (/cta|دعوة/i.test(label)) section = "cta";
      else if (/open.?loop|resolution|قفل/i.test(label)) section = "open_loop_resolution";
      else if (/outro|خاتمة/i.test(label)) section = "outro";
      segments.push({ section, label, content, techniques: [] });
    }
  }

  return {
    contentType: req.contentType,
    topic: req.topic,
    language: req.language ?? "ar",
    segments,
    openLoops,
    emotionalArc,
    skillsUsed: loadedSkills,
    markdown,
  };
}

/**
 * توليد سكريبت كامل بـ streaming.
 *
 * @param req - طلب كتابة السكريبت
 * @param sink - callback لاستقبال الـ SSE events
 */
export async function generateScript(
  req: ScriptWriterRequest,
  sink: ScriptSSESink,
): Promise<void> {
  // 1. تحميل الـ skills
  sink({ type: "status", message: "بيحمّل المهارات النفسية المناسبة..." });
  const { context: skillContext, loadedSkills } = await loadRelevantScriptSkills(req);

  if (loadedSkills.length > 0) {
    sink({
      type: "status",
      message: `اتحمّلت ${loadedSkills.length} skill: ${loadedSkills.join("، ")}`,
    });
  }

  // 2. بناء الـ system prompt
  const systemPrompt = buildScriptWriterSystemPrompt(req, loadedSkills) + skillContext;
  const userMessage = buildUserMessage(req);

  // 3. بناء الـ conversation
  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    // رسائل سابقة (لو refinement)
    ...(req.messages ?? []).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: userMessage },
  ];

  // 4. استدعاء GLM بـ streaming
  sink({ type: "status", message: "بيكتب السكريبت..." });

  let zai;
  try {
    zai = await getZAIClient();
  } catch (e: any) {
    sink({ type: "error", error: `فشل تهيئة GLM: ${e.message}` });
    return;
  }

  let fullText = "";

  try {
    // HF ZAI proxy بيرجع async iterable من parsed JSON objects (مش ReadableStream)
    const stream: any = await zai.chat.completions.create({
      model: "glm-5.2",
      messages: conversation,
      stream: true,
      thinking: req.enableThinking ? { type: "enabled" } : { type: "disabled" },
    });

    // async iterable: for await (const chunk of stream)
    for await (const parsed of stream) {
      const delta = parsed?.choices?.[0]?.delta ?? {};
      if (delta.reasoning_content) {
        sink({ type: "thinking", content: delta.reasoning_content });
      }
      if (delta.content) {
        fullText += delta.content;
        sink({ type: "token", content: delta.content });
      }
    }
  } catch (e: any) {
    sink({ type: "error", error: `فشل توليد السكريبت: ${e.message}` });
    return;
  }

  // 5. تحويل النص لـ ScriptResult
  const result = parseScriptResult(fullText, req, loadedSkills);
  sink({ type: "script_done", script: result });
  sink({ type: "done" });
}
