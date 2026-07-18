/**
 * POST /api/skills/import-github
 * ==================================
 * المستخدم يحط GitHub repo URL → الـ AI يقرا الكود → يحوله لـ skill.
 *
 * Flow:
 * 1. استقبل GitHub URL
 * 2. نزل ملفات الـ repo (عن طريق GitHub API)
 * 3. اقرا الملفات المهمة (README, *.ts, *.py, *.md, package.json)
 * 4. ابعتها لـ GLM/Nemotron للتحليل
 * 5. الـ AI يولّد anzaro-skill.md
 * 6. احفظ في الـ DB (status = pending)
 * 7. الـ admin يراجع وينشر
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZAIClient } from "@/lib/chat-utils";
import { getUserFromToken, extractBearerToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface GitHubFile {
  name: string;
  path: string;
  content: string;
  size: number;
}

/** استخرج owner + repo من GitHub URL */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/** نزل محتويات الـ repo عن طريق GitHub API */
async function fetchRepoContents(owner: string, repo: string): Promise<{ files: GitHubFile[]; totalSize: number }> {
  const files: GitHubFile[] = [];
  let totalSize = 0;

  // استخدم GitHub API للحصول على شجرة الملفات
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  const treeResp = await fetch(treeUrl, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Anzaro-AI" },
  });

  // جرّب master لو main مش موجود
  let treeData: any = null;
  if (treeResp.ok) {
    treeData = await treeResp.json();
  } else {
    const masterUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
    const masterResp = await fetch(masterUrl, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Anzaro-AI" },
    });
    if (masterResp.ok) {
      treeData = await masterResp.json();
    }
  }

  if (!treeData?.tree) {
    throw new Error("مش قادر أقرا الـ repo — تأكد إنه public");
  }

  // فلتر الملفات المهمة بس (مش كل حاجة)
  const importantExtensions = [".ts", ".tsx", ".py", ".js", ".jsx", ".md", ".json", ".txt", ".yaml", ".yml"];
  const maxFiles = 30;
  const maxFileSize = 50_000; // 50KB per file
  let fileCount = 0;

  for (const item of treeData.tree) {
    if (item.type !== "blob") continue;
    if (fileCount >= maxFiles) break;

    const isImportant = importantExtensions.some((ext) => item.path.endsWith(ext));
    if (!isImportant) continue;

    // نتخطى: node_modules, .git, dist, build, vendor
    if (item.path.includes("node_modules") || item.path.includes(".git") || item.path.includes("dist/") || item.path.includes("build/")) continue;

    // نزل محتوى الملف
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${treeData.sha}/${item.path}`;
      const rawResp = await fetch(rawUrl, { headers: { "User-Agent": "Anzaro-AI" } });
      if (!rawResp.ok) continue;
      const content = await rawResp.text();
      if (content.length > maxFileSize) continue; // تخطي الملفات الكبيرة

      files.push({ name: item.path.split("/").pop() || item.path, path: item.path, content: content.slice(0, maxFileSize), size: content.length });
      totalSize += content.length;
      fileCount++;
    } catch {
      // تخطي لو فيه خطأ
    }
  }

  return { files, totalSize };
}

/** خلي الـ AI يحلل الكود ويولّد skill */
async function generateSkillFromCode(files: GitHubFile[], repoName: string, repoOwner: string): Promise<{
  name: string;
  description: string;
  skillMd: string;
  toolsNeeded: string;
  aiReview: string;
}> {
  const zai = await getZAIClient();

  // ادمج الملفات في prompt واحد
  const codeDump = files.map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 5000)}\n\`\`\``).join("\n\n");

  const systemPrompt = `أنت مساعد تقني في منصة Anzaro AI. مهمتك: تقرا كود من GitHub repo وتحوله لـ "Anzaro Skill".

Anzaro Skill = ملف markdown فيه:
1. اسم المهارة
2. وصف مختصر
3. الـ tools المطلوبة (من الـ 355 أداة المتاحة)
4. الـ steps المنطقية لتنفيذ المهمة

الأدوات المتاحة تشمل: web_search, google_calendar_reminder, google_tasks_manager, google_contacts_reader, google_drive_file_search, google_drive_pdf_reader, google_docs_writer, google_docs_reader, google_sheets_reader, google_sheets_logger, google_drive_folder_creator, google_drive_uploader, google_drive_deleter, manage_chat_memory, page_read, image_generate, tts_generate, translate, وغيرها.

كمان: اعمل AI Code Review — قول لو فيه:
- مشاكل أمنية (eval, fetch لـ URLs مش معروفة)
- حاجات ناقصة (API keys, dependencies)
- جودة الكود (0-100)

رجه JSON فقط:
{
  "name": "اسم المهارة بالعربي",
  "description": "وصف مختصر",
  "skillMd": "# المهارة كاملة بـ markdown",
  "toolsNeeded": "tool1, tool2, tool3",
  "aiReview": "تقرير الأمان + جودة الكود"
}`;

  const completion = await zai.chat.completions.create({
    model: "glm-4-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Repo: ${repoOwner}/${repoName}\n\nالملفات:\n${codeDump.slice(0, 50000)}` },
    ],
    stream: false,
    temperature: 0.3,
    max_tokens: 4096,
  } as any);

  const content = (completion as any).choices?.[0]?.message?.content ?? "{}";

  // استخرج JSON من الرد
  let parsed: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? content);
  } catch {
    parsed = {
      name: repoName,
      description: `مهارة مستوردة من ${repoOwner}/${repoName}`,
      skillMd: content.slice(0, 5000),
      toolsNeeded: "web_search",
      aiReview: "تعذّر التحليل التلقائي",
    };
  }

  return {
    name: parsed.name || repoName,
    description: parsed.description || `مهارة من ${repoOwner}/${repoName}`,
    skillMd: parsed.skillMd || "# مهارة جديدة\n\nلم يتم توليد محتوى.",
    toolsNeeded: parsed.toolsNeeded || "",
    aiReview: parsed.aiReview || "لم يتم المراجعة",
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json({ error: "مطلوب تسجيل الدخول" }, { status: 401 });
    }

    const body = await request.json();
    const { githubUrl } = body as { githubUrl: string };

    if (!githubUrl || !githubUrl.includes("github.com")) {
      return NextResponse.json({ error: "أدخل رابط GitHub صحيح" }, { status: 400 });
    }

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      return NextResponse.json({ error: "مش قادر أقرا الرابط — تأكد إنه صيغة github.com/owner/repo" }, { status: 400 });
    }

    // اتأكد إنه مش متسجل قبل كده
    const existing = await db.gitHubSkill.findUnique({ where: { githubUrl } });
    if (existing) {
      return NextResponse.json({
        success: true,
        skill: existing,
        message: existing.status === "approved"
          ? "المهارة دي موجودة ومنشورة بالفعل ✅"
          : "المهارة دي قيد المراجعة من الأدمن ⏳",
      });
    }

    // 1. نزل الملفات
    const { files, totalSize } = await fetchRepoContents(parsed.owner, parsed.repo);

    if (files.length === 0) {
      return NextResponse.json({ error: "ملقتش ملفات في الـ repo ده" }, { status: 404 });
    }

    // 2. خلي الـ AI يحلل ويولّد skill
    const skill = await generateSkillFromCode(files, parsed.repo, parsed.owner);

    // 3. احفظ في الـ DB
    const dbSkill = await db.gitHubSkill.create({
      data: {
        githubUrl,
        repoName: parsed.repo,
        repoOwner: parsed.owner,
        name: skill.name,
        description: skill.description,
        skillMd: skill.skillMd,
        toolsNeeded: skill.toolsNeeded,
        aiReview: skill.aiReview,
        fileSize: totalSize,
        fileCount: files.length,
        status: "pending",
        submittedBy: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      skill: dbSkill,
      message: "تم سحب الـ repo وتحويله لمهارة ✅ — دلوقتي الأدمن هيراجعها وينشرها",
    });
  } catch (error: any) {
    console.error("[GitHub Import] Error:", error);
    return NextResponse.json({
      error: error?.message || "حصل خطأ أثناء سحب الـ repo",
    }, { status: 500 });
  }
}
