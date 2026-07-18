/**
 * Content Studio Engine
 * ======================
 * المحرك الأساسي لاستوديو إنشاء المحتوى المتكامل.
 *
 * Flow:
 *   Request → load skills → build prompt → GLM stream → parse → ContentStudioResult
 *
 * بيدمج 4-6 skills (script-writing, retention-hooks, persuasion-triggers, audience-psychology, + dynamic)
 */

import { getZAIClient } from "@/lib/zai-client";
import { buildSkillContextFromNames } from "../skills/context-builder";
import { findRelevantSkills } from "../skills/loader";
import { buildStudioSystemPrompt, buildStudioUserMessage, REQUIRED_STUDIO_SKILLS } from "./prompt-builder";

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };
import type {
  ContentStudioRequest,
  ContentStudioResult,
  ContentIdea,
  ThumbnailConcept,
  CaptionSet,
  ContentStudioSSEEvent,
  Platform,
} from "./types";

export type ContentStudioSSESink = (event: ContentStudioSSEEvent) => void;

/**
 * تحميل الـ skills المناسبة للاستوديو.
 */
async function loadStudioSkills(req: ContentStudioRequest): Promise<{
  context: string;
  loadedSkills: string[];
}> {
  const requiredNames = [...REQUIRED_STUDIO_SKILLS];

  // skills ديناميكية حسب الموضوع
  const topicQuery = `${req.topic} ${req.contentType} ${req.audience ?? ""} ${req.tone ?? ""}`;
  const dynamicSkills = await findRelevantSkills(topicQuery, 3);

  const dynamicNames = dynamicSkills
    .map((s) => s.name)
    .filter((name) => !requiredNames.includes(name))
    .filter((name) =>
      ["dark-psychology", "emotional-manipulation", "script-writing", "copywriting", "social", "content-strategy"].includes(
        name,
      ),
    )
    .slice(0, 2);

  const allNames = [...requiredNames, ...dynamicNames];
  return buildSkillContextFromNames(allNames);
}

/**
 * تحويل الـ markdown لـ ContentStudioResult.
 */
function parseStudioResult(
  markdown: string,
  req: ContentStudioRequest,
  loadedSkills: string[],
): ContentStudioResult {
  let ideas: ContentIdea[] = [];
  let thumbnailConcept: ThumbnailConcept | undefined;
  let captions: CaptionSet[] = [];
  let strategyNotes = "";

  const jsonMatch = markdown.match(/```studio-metadata\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const metadata = JSON.parse(jsonMatch[1]);
      if (Array.isArray(metadata.ideas)) ideas = metadata.ideas;
      if (metadata.thumbnailConcept) thumbnailConcept = metadata.thumbnailConcept;
      if (Array.isArray(metadata.captions)) captions = metadata.captions;
      if (typeof metadata.strategyNotes === "string") strategyNotes = metadata.strategyNotes;
    } catch {
      // fallback للـ markdown بس
    }
  }

  // لو مفيش ideas، نعمل placeholders من الـ markdown headings
  if (ideas.length === 0) {
    const ideaMatches = markdown.matchAll(/\*\*العنوان[^:]*:\*\*\s*(.+)/g);
    for (const m of ideaMatches) {
      ideas.push({
        title: m[1].trim(),
        angle: "",
        hook: "",
        reasonWhy: "",
      });
    }
  }

  return {
    topic: req.topic,
    contentType: req.contentType,
    language: req.language ?? "ar",
    ideas,
    thumbnailConcept,
    captions,
    strategyNotes,
    skillsUsed: loadedSkills,
    markdown,
  };
}

/**
 * توليد حزمة محتوى كاملة بـ streaming.
 */
export async function generateContentPackage(
  req: ContentStudioRequest,
  sink: ContentStudioSSESink,
): Promise<void> {
  // 1. تحميل الـ skills
  sink({ type: "status", message: "بيحمّل مهارات المحتوى..." });
  const { context: skillContext, loadedSkills } = await loadStudioSkills(req);

  if (loadedSkills.length > 0) {
    sink({
      type: "status",
      message: `اتحمّلت ${loadedSkills.length} skill: ${loadedSkills.join("، ")}`,
    });
  }

  // 2. بناء الـ system prompt
  const systemPrompt = buildStudioSystemPrompt(req, loadedSkills) + skillContext;
  const userMessage = buildStudioUserMessage(req);

  // 3. بناء الـ conversation
  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // 4. استدعاء GLM بـ streaming
  sink({ type: "status", message: "بيولّد حزمة المحتوى..." });

  let zai;
  try {
    zai = await getZAIClient();
  } catch (e: any) {
    sink({ type: "error", error: `فشل تهيئة GLM: ${e.message}` });
    return;
  }

  let fullText = "";

  try {
    // HF ZAI proxy بيرجع async iterable من parsed JSON objects
    const stream: any = await zai.chat.completions.create({
      model: "glm-5.2",
      messages: conversation,
      stream: true,
      thinking: req.enableThinking ? { type: "enabled" } : { type: "disabled" },
    });

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
    sink({ type: "error", error: `فشل توليد المحتوى: ${e.message}` });
    return;
  }

  // 5. تحويل النص لـ result
  const result = parseStudioResult(fullText, req, loadedSkills);
  sink({ type: "studio_done", result });
  sink({ type: "done" });
}
