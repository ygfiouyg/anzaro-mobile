/**
 * Skills API
 * ==========
 * GET  /api/admin/skills              — قائمة بكل الـ skills
 * GET  /api/admin/skills?name=cro     — قرا skill كامل
 * GET  /api/admin/skills?q=query      — بحث عن skills مناسبة
 * GET  /api/admin/skills?stats=true   — إحصائيات
 * POST /api/admin/skills              — تثبيت skill من URL
 *   body: { action: "install", url: "https://...", name?: "..." }
 *   body: { action: "delete", name: "skill-name" }
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import AdmZip from "adm-zip";
import { listSkills, getSkill, findRelevantSkills, getSkillsStats } from "@/lib/skills/loader";

const execAsync = promisify(exec);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SKILLS_DIR = path.resolve(process.cwd(), ".agents", "skills");

/**
 * تنزيل repo كـ zip وفكه بـ JS (بدون git).
 * GitHub بيوفر: https://github.com/user/repo/archive/refs/heads/BRANCH.zip
 */
async function downloadRepoAsZip(repoUrl: string, targetDir: string): Promise<string> {
  // Parse the URL to extract user/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("URL مش GitHub صالح");
  const [, user, repoRaw] = match;
  const repo = repoRaw.replace(/\.git$/, "").replace(/\/$/, "");

  // Try main branch first, then master
  const branches = ["main", "master"];
  let lastError: any = null;
  for (const branch of branches) {
    const zipUrl = `https://github.com/${user}/${repo}/archive/refs/heads/${branch}.zip`;
    try {
      const res = await fetch(zipUrl, { redirect: "follow" });
      if (!res.ok) { lastError = new Error(`HTTP ${res.status} for ${branch}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // Extract to targetDir
      const zip = new AdmZip(buf);
      zip.extractAllTo(targetDir, true); // overwrite
      // GitHub zip creates a folder like user-repo-branch/
      const entries = await fs.readdir(targetDir);
      const extractedFolder = entries.find((e) => e.startsWith(`${repo}-`) || e.startsWith(`${user}-${repo}-`));
      if (extractedFolder) {
        return path.join(targetDir, extractedFolder);
      }
      return targetDir;
    } catch (e: any) {
      lastError = e;
      continue;
    }
  }
  throw lastError ?? new Error("فشل تنزيل الريpo");
}

/**
 * نسخ مجلد بشكل recursive باستخدام fs (بدون cp command).
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function ensureSkillsDir() {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  } catch {}
}

/** استخراج اسم skill من URL */
function extractSkillName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // raw.githubusercontent.com/user/repo/branch/path/SKILL.md → repo
    // github.com/user/repo → repo
    // github.com/user/repo/tree/main/skills/cro → cro
    if (parts.length >= 1) {
      // If URL ends with SKILL.md, use the parent folder name
      const last = parts[parts.length - 1];
      if (last.toLowerCase() === "skill.md" || last.toLowerCase().endsWith(".md")) {
        return parts[parts.length - 2] ?? `skill-${Date.now()}`;
      }
      return last.replace(/\.git$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    }
  } catch {}
  return `skill-${Date.now()}`;
}

/** كشف نوع source الـ skill من URL */
function detectSkillSource(url: string): {
  type: "github-repo" | "github-skills-folder" | "github-skill-folder" | "raw-file" | "raw-skill-md";
  cloneUrl?: string;
  skillPath?: string;
} {
  const lower = url.toLowerCase();

  // raw.githubusercontent.com/.../SKILL.md
  if (lower.includes("raw.githubusercontent.com") && lower.endsWith("skill.md")) {
    return { type: "raw-skill-md" };
  }
  // raw.githubusercontent.com/.../file.md
  if (lower.includes("raw.githubusercontent.com") && lower.endsWith(".md")) {
    return { type: "raw-file" };
  }
  // github.com/user/repo/tree/main/skills/cro
  if (lower.includes("github.com") && lower.includes("/tree/") && lower.includes("skill")) {
    // Extract the skill folder path
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
    if (match) {
      const [, user, repo, branch, skillPath] = match;
      return {
        type: "github-skill-folder",
        cloneUrl: `https://github.com/${user}/${repo}.git`,
        skillPath,
      };
    }
  }
  // github.com/user/repo (with skills/ folder inside)
  if (lower.includes("github.com")) {
    return { type: "github-skills-folder" };
  }
  // any other URL ending with .md
  if (lower.endsWith(".md")) {
    return { type: "raw-file" };
  }
  // default: try git clone
  return { type: "github-skills-folder" };
}

/** تثبيت skill من URL */
async function installSkillFromUrl(args: {
  url: string;
  name?: string;
}): Promise<{ success: boolean; name?: string; installed?: string[]; error?: string; log?: string }> {
  await ensureSkillsDir();
  const detected = detectSkillSource(args.url);
  const baseName = (args.name ?? extractSkillName(args.url)).slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const log: string[] = [];

  try {
    if (detected.type === "raw-skill-md" || detected.type === "raw-file") {
      // Download single SKILL.md file
      const skillDir = path.join(SKILLS_DIR, baseName);
      log.push(`$ fetch ${args.url}`);
      const res = await fetch(args.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      if (!content.includes("---") || !content.includes("name:")) {
        throw new Error("الملف مش skill صالح (لازم فيه frontmatter بـ name:)");
      }
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
      log.push(`✓ Saved to .agents/skills/${baseName}/SKILL.md`);
      return { success: true, name: baseName, installed: [baseName], log: log.join("\n") };
    }

    if (detected.type === "github-skill-folder") {
      // Download repo as zip (no git needed), copy specific skill folder
      const tmpDir = path.join("/tmp", `skill-clone-${Date.now()}`);
      log.push(`$ download zip ${detected.cloneUrl}`);
      const extractedDir = await downloadRepoAsZip(detected.cloneUrl!, tmpDir);
      const skillSourcePath = path.join(extractedDir, detected.skillPath ?? "");
      try {
        await fs.access(skillSourcePath);
      } catch {
        throw new Error(`المسار ${detected.skillPath} مش موجود في الريpo`);
      }
      const skillDir = path.join(SKILLS_DIR, baseName);
      await fs.mkdir(skillDir, { recursive: true });
      await copyDirRecursive(skillSourcePath, skillDir);
      log.push(`✓ Copied skill files to .agents/skills/${baseName}/`);
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
      return { success: true, name: baseName, installed: [baseName], log: log.join("\n") };
    }

    if (detected.type === "github-skills-folder") {
      // Download repo as zip (no git needed), copy all skills from skills/ folder
      const tmpDir = path.join("/tmp", `skills-clone-${Date.now()}`);
      log.push(`$ download zip ${args.url}`);
      const extractedDir = await downloadRepoAsZip(args.url, tmpDir);
      // Check for skills/ folder
      const skillsFolder = path.join(extractedDir, "skills");
      let sourceFolder = skillsFolder;
      try {
        await fs.access(skillsFolder);
      } catch {
        // Maybe the repo itself has SKILL.md at root (single skill)
        try {
          await fs.access(path.join(extractedDir, "SKILL.md"));
          sourceFolder = extractedDir;
        } catch {
          throw new Error("الريpo مفيهوش مجلد skills/ ولا SKILL.md في الجذر");
        }
      }
      // If single skill at root, copy as one skill
      if (sourceFolder === extractedDir) {
        const skillDir = path.join(SKILLS_DIR, baseName);
        await fs.mkdir(skillDir, { recursive: true });
        await fs.copyFile(path.join(sourceFolder, "SKILL.md"), path.join(skillDir, "SKILL.md"));
        log.push(`✓ Installed single skill: ${baseName}`);
        await fs.rm(tmpDir, { recursive: true, force: true });
        return { success: true, name: baseName, installed: [baseName], log: log.join("\n") };
      }
      // Multiple skills — copy each
      const entries = await fs.readdir(sourceFolder, { withFileTypes: true });
      const installed: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = path.join(sourceFolder, entry.name, "SKILL.md");
        try {
          await fs.access(skillMdPath);
        } catch {
          continue; // not a skill folder
        }
        const destDir = path.join(SKILLS_DIR, entry.name);
        // Remove existing
        try { await fs.rm(destDir, { recursive: true, force: true }); } catch {}
        await copyDirRecursive(path.join(sourceFolder, entry.name), destDir);
        installed.push(entry.name);
        log.push(`✓ Installed: ${entry.name}`);
      }
      await fs.rm(tmpDir, { recursive: true, force: true });
      if (installed.length === 0) {
        throw new Error("ما قدرتش ألاقي أي skills صالحة في الريpo");
      }
      return { success: true, installed, log: log.join("\n") };
    }

    return { success: false, error: "نوع URL مش مدعوم" };
  } catch (e: any) {
    return { success: false, error: e.message, log: log.join("\n") };
  }
}

/** حذف skill */
async function deleteSkill(name: string): Promise<{ success: boolean; error?: string }> {
  const skillDir = path.join(SKILLS_DIR, path.basename(name));
  if (!skillDir.startsWith(SKILLS_DIR)) {
    return { success: false, error: "مسار غير صالح" };
  }
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const query = url.searchParams.get("q");
  const stats = url.searchParams.get("stats");

  try {
    if (stats === "true") {
      const s = await getSkillsStats();
      return NextResponse.json(s);
    }
    if (name) {
      const skill = await getSkill(name);
      if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      return NextResponse.json(skill);
    }
    if (query) {
      const skills = await findRelevantSkills(query, 5);
      return NextResponse.json({ skills, query });
    }
    const skills = await listSkills();
    return NextResponse.json({ skills, total: skills.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action ?? "install";

    if (action === "install") {
      if (!body.url) {
        return NextResponse.json({ error: "URL مطلوب" }, { status: 400 });
      }
      const result = await installSkillFromUrl({ url: body.url, name: body.name });
      return NextResponse.json(result);
    }

    if (action === "delete") {
      if (!body.name) {
        return NextResponse.json({ error: "اسم الـ skill مطلوب" }, { status: 400 });
      }
      const result = await deleteSkill(body.name);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
