/**
 * Skills Loader
 * =============
 * بيقرا الـ Skills (ملفات SKILL.md) من .agents/skills/ ويرجعها.
 *
 * الـ Skills هي ملفات Markdown فيها frontmatter (name + description)
 * ومحتوى تعليمي للـ AI agent.
 *
 * الـ Loader بيدعم:
 *   - listSkills(): قائمة بكل الـ skills المتاحة
 *   - getSkill(name): قرا skill معين بالكامل
 *   - findRelevantSkills(query): يجيب الـ skills المناسبة لسؤال معين
 */

import { promises as fs } from "fs";
import path from "path";

const SKILLS_DIR = path.resolve(process.cwd(), ".agents", "skills");

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  category?: string;
  path: string;
  size: number;
}

export interface Skill extends SkillMeta {
  content: string;
  fullContent: string;
}

/** Parse frontmatter من ملف Markdown */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const frontmatterText = match[1];
  const body = match[2];
  const meta: Record<string, any> = {};
  // simple YAML parser (name: value, description: "...")
  const lines = frontmatterText.split("\n");
  let currentKey = "";
  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      // strip quotes
      const cleanValue = value.replace(/^["']|["']$/g, "").trim();
      meta[key] = cleanValue;
      currentKey = key;
    } else if (line.startsWith("  ") && currentKey) {
      // nested (e.g., metadata.version)
      const nestedMatch = line.match(/^\s+(\w+):\s*(.*)$/);
      if (nestedMatch) {
        meta[currentKey] = meta[currentKey] || {};
        if (typeof meta[currentKey] === "string") meta[currentKey] = {};
        meta[currentKey][nestedMatch[1]] = nestedMatch[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  }
  return { meta, body };
}

/** قائمة بكل الـ skills المتاحة (metadata فقط) */
export async function listSkills(): Promise<SkillMeta[]> {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills: SkillMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      try {
        const content = await fs.readFile(skillPath, "utf-8");
        const { meta } = parseFrontmatter(content);
        const stat = await fs.stat(path.join(SKILLS_DIR, entry.name));
        skills.push({
          name: meta.name || entry.name,
          description: meta.description || "",
          version: meta.metadata?.version,
          path: `skills/${entry.name}`,
          size: stat.size,
        });
      } catch {
        // skip folders without SKILL.md
      }
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** قرا skill كامل بالاسم */
export async function getSkill(name: string): Promise<Skill | null> {
  const skillDir = path.join(SKILLS_DIR, path.basename(name));
  const skillFile = path.join(skillDir, "SKILL.md");
  try {
    const content = await fs.readFile(skillFile, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    const stat = await fs.stat(skillDir);
    return {
      name: meta.name || name,
      description: meta.description || "",
      version: meta.metadata?.version,
      path: `skills/${name}`,
      size: stat.size,
      content: body.trim(),
      fullContent: content,
    };
  } catch {
    return null;
  }
}

/**
 * إيجاد الـ skills المناسبة لسؤال معين.
 * بيبني index من الكلمات المفتاحية في الـ descriptions ويطابقها مع السؤال.
 */
export async function findRelevantSkills(query: string, limit = 3): Promise<SkillMeta[]> {
  const allSkills = await listSkills();
  if (allSkills.length === 0) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored = allSkills.map((skill) => {
    const descLower = (skill.name + " " + skill.description).toLowerCase();
    let score = 0;
    // exact name match
    if (queryLower.includes(skill.name.toLowerCase())) score += 10;
    // word matches in description
    for (const word of queryWords) {
      if (descLower.includes(word)) score += 1;
      // partial matches (e.g., "convert" matches "conversion")
      for (const descWord of descLower.split(/\s+/)) {
        if (descWord.startsWith(word.slice(0, 4)) && word.length >= 4) {
          score += 0.5;
          break;
        }
      }
    }
    return { skill, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.skill);
}

/** إحصائيات سريعة */
export async function getSkillsStats(): Promise<{
  total: number;
  categories: number;
  totalSizeKB: number;
}> {
  const skills = await listSkills();
  return {
    total: skills.length,
    categories: 1, // كل الـ skills في فئة واحدة حالياً
    totalSizeKB: Math.round(skills.reduce((sum, s) => sum + s.size, 0) / 1024),
  };
}
