/**
 * Skill Context Builder (مشترك بين chat و admin)
 * =================================================
 * بيبني context إضافي للـ system prompt من الـ skills المناسبة.
 *
 * - buildSkillContext(messages): يلاقي الـ skills المناسبة لآخر رسالة مستخدم
 * - buildSkillContextFromNames(names): بيحمّل skills محددة بالاسم (للأدوات المتخصصة)
 */

import { findRelevantSkills, getSkill } from "./loader";

const MAX_SKILL_CONTENT_CHARS = 4000;
const CACHE_TTL_MS = 60_000; // 60 ثانية

// In-memory cache عشان نتجنب قراءة الملفات في كل request
const skillCache = new Map<string, { content: string; ts: number }>();

async function getCachedSkill(name: string): Promise<string | null> {
  const cached = skillCache.get(name);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.content;
  }
  const skill = await getSkill(name);
  if (!skill || !skill.content) return null;
  const content = skill.content.slice(0, MAX_SKILL_CONTENT_CHARS);
  skillCache.set(name, { content, ts: Date.now() });
  return content;
}

/**
 * يدوّر على الـ skills المناسبة لآخر رسالة من المستخدم
 * ويرجعها كـ context إضافي للـ system prompt.
 */
export async function buildSkillContext(
  messages: { role: string; content?: string }[],
  limit = 3,
): Promise<{ context: string; loadedSkills: string[] }> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg || !lastUserMsg.content) return { context: "", loadedSkills: [] };

  try {
    const relevant = await findRelevantSkills(lastUserMsg.content, limit);
    if (relevant.length === 0) return { context: "", loadedSkills: [] };

    const skillsContent: string[] = [];
    const loadedNames: string[] = [];
    for (const skillMeta of relevant) {
      const content = await getCachedSkill(skillMeta.name);
      if (content) {
        skillsContent.push(`\n\n═══ SKILL: ${skillMeta.name} ═══\n${content}\n═══ END SKILL ═══`);
        loadedNames.push(skillMeta.name);
      }
    }

    if (skillsContent.length === 0) return { context: "", loadedSkills: [] };

    const context = `\n\n📋 المهارات المناسبة المضافة تلقائياً:${skillsContent.join("\n")}\n\nاستخدم المعرفة دي بحرفية في الرد على سؤال المستخدم. اتبع الـ frameworks والـ techniques اللي في الـ skills.`;
    return { context, loadedSkills: loadedNames };
  } catch {
    return { context: "", loadedSkills: [] };
  }
}

/**
 * بيحمّل skills محددة بالاسم (للأدوات المتخصصة زي Script Writer).
 * بيرجع context جاهز للإضافة للـ system prompt.
 */
export async function buildSkillContextFromNames(
  names: string[],
): Promise<{ context: string; loadedSkills: string[] }> {
  const skillsContent: string[] = [];
  const loadedNames: string[] = [];
  for (const name of names) {
    const content = await getCachedSkill(name);
    if (content) {
      skillsContent.push(`\n\n═══ SKILL: ${name} ═══\n${content}\n═══ END SKILL ═══`);
      loadedNames.push(name);
    }
  }
  if (skillsContent.length === 0) return { context: "", loadedSkills: [] };
  const context = `\n\n📋 المهارات المضافة للـ context:${skillsContent.join("\n")}\n\nاستخدم المعرفة دي بحرفية. اتبع الـ frameworks والـ techniques اللي في الـ skills.`;
  return { context, loadedSkills: loadedNames };
}

/** مسح الـ cache (للاستخدام لو skills اتعدلت وقت الـ runtime) */
export function clearSkillCache(): void {
  skillCache.clear();
}
