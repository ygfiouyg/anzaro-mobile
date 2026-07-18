/**
 * POST /api/tools/import-github
 * =============================
 * يسحب repo كامل من GitHub → AI يحلل → يسجّل كـ tool حقيقي.
 *
 * Flow:
 * 1. اقرا GitHub URL
 * 2. نزل كل الملفات (مش 30 بس — كلها)
 * 3. AI يحلل: entry file, function signature, parameters, description
 * 4. AI يوّلد executeCode (JavaScript قابل للتنفيذ)
 * 5. احفظ في DB (status = pending)
 * 6. الأدمن يراجع → ينشر → الـ tool تظهر في الـ registry
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

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/** نزل كل ملفات الـ repo */
async function fetchAllRepoFiles(owner: string, repo: string): Promise<{ files: GitHubFile[]; totalSize: number }> {
  const files: GitHubFile[] = [];
  let totalSize = 0;

  // احصل على شجرة الملفات
  const branches = ["main", "master"];
  let treeData: any = null;

  for (const branch of branches) {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const resp = await fetch(treeUrl, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Anzaro-AI" },
    });
    if (resp.ok) {
      treeData = await resp.json();
      break;
    }
  }

  if (!treeData?.tree) {
    throw new Error("مش قادر أقرا الـ repo — تأكد إنه public");
  }

  // اقرا كل الملفات (حد أقصى 50 ملف × 100KB)
  const importantExtensions = [".ts", ".tsx", ".py", ".js", ".jsx", ".md", ".json", ".txt", ".yaml", ".yml", ".sh"];
  const skipPaths = ["node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".next", "coverage"];
  const maxFiles = 50;
  const maxFileSize = 100_000;

  for (const item of treeData.tree) {
    if (item.type !== "blob") continue;
    if (files.length >= maxFiles) break;

    // skip غير المهم
    if (skipPaths.some((p) => item.path.includes(p))) continue;

    const isImportant = importantExtensions.some((ext) => item.path.endsWith(ext));
    if (!isImportant) continue;

    try {
      const branch = treeData.sha ? treeData.sha : "main";
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
      const rawResp = await fetch(rawUrl, { headers: { "User-Agent": "Anzaro-AI" } });
      if (!rawResp.ok) continue;
      const content = await rawResp.text();
      if (content.length > maxFileSize) continue;

      files.push({
        name: item.path.split("/").pop() || item.path,
        path: item.path,
        content: content.slice(0, maxFileSize),
        size: content.length,
      });
      totalSize += content.length;
    } catch {}
  }

  return { files, totalSize };
}

/** خلي الـ AI يحلل الكود ويولّد tool */
async function analyzeAndGenerateTool(
  files: GitHubFile[],
  repoName: string,
  repoOwner: string,
): Promise<{
  toolName: string;
  displayName: string;
  description: string;
  parameters: string;
  executeCode: string;
  dependencies: string;
  aiReview: string;
}> {
  const zai = await getZAIClient();

  // ادمج الملفات
  const codeDump = files.map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``).join("\n\n");

  const systemPrompt = `أنت مهندس برمجيات في منصة Anzaro AI. مهمتك: تقرا كود من GitHub repo وتحدد إزاي نشغّله.

المنصة بتدعم تشغيل كود حقيقي بـ:
- Python (python3)
- Node.js (node)
- Java (java + javac)
- C/C++ (gcc)

ممنوع: Go, Rust, Ruby (مش مثبتة)

المطلوب: حلل الكود وحدد:

1. toolName: اسم الأداة بالإنجليزي (snake_case)
2. displayName: اسم عربي للعرض
3. description: وصف بالعربي
4. parameters: JSON schema للـ params
5. language: اللغة الأساسية (python/javascript/typescript/java/c/cpp)
6. entryFile: الملف الرئيسي اللي بيبدأ منه التنفيذ (زي main.py, index.js)
7. dependencies: قائمة الـ packages المطلوبة (من requirements.txt أو package.json)
8. aiReview: تقرير أمان

مهم جداً:
- language لازم تكون اللغة الحقيقية اللي الكود مكتوب بيها
- entryFile لازم يكون ملف موجود فعلاً في الـ repo
- dependencies لازم تكون الـ packages الحقيقية المطلوبة
- لو الكود بيقرا arguments من command line → قول في الـ description
- لو الكود بيقرا من stdin → قول
- الكود هيتشغل بـ: ANZARO_ARGS='{json}' python3 main.py (أو node index.js)
- فالكود لازم يقرا الـ args من environment variable ANZARO_ARGS كـ JSON

رجه JSON فقط:
{
  "toolName": "snake_case_name",
  "displayName": "اسم عربي",
  "description": "وصف",
  "parameters": {"type":"object","properties":{...},"required":[...]},
  "executeCode": "{\\"language\\":\\"python\\",\\"entryFile\\":\\"main.py\\",\\"dependencies\\":[\\"requests\\",\\"pillow\\"]}",
  "dependencies": "requests, pillow",
  "aiReview": "تقرير الأمان"
}`;

  const completion = await zai.chat.completions.create({
    model: "glm-4-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Repo: ${repoOwner}/${repoName}\n\nالملفات (${files.length}):\n${codeDump.slice(0, 60000)}` },
    ],
    stream: false,
    temperature: 0.3,
    max_tokens: 4096,
  } as any);

  const content = (completion as any).choices?.[0]?.message?.content ?? "{}";

  let parsed: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? content);
  } catch {
    parsed = {
      toolName: repoName.replace(/[^a-z0-9]/gi, "_").toLowerCase(),
      displayName: repoName,
      description: `أداة من ${repoOwner}/${repoName}`,
      parameters: '{"type":"object","properties":{},"required":[]}',
      executeCode: "return { error: 'لم يتم توليد كود التنفيذ' };",
      dependencies: "غير محدد",
      aiReview: "تعذّر التحليل التلقائي",
    };
  }

  return {
    toolName: parsed.toolName || repoName.replace(/[^a-z0-9]/gi, "_").toLowerCase(),
    displayName: parsed.displayName || repoName,
    description: parsed.description || `أداة من ${repoOwner}/${repoName}`,
    parameters: typeof parsed.parameters === "string" ? parsed.parameters : JSON.stringify(parsed.parameters || { type: "object", properties: {}, required: [] }),
    executeCode: parsed.executeCode || "return { error: 'no code generated' };",
    dependencies: parsed.dependencies || "",
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
      return NextResponse.json({ error: "صيغة الرابط غلط — استخدم github.com/owner/repo" }, { status: 400 });
    }

    // اتأكد مش متسجل قبل كده
    const existing = await db.installedTool.findUnique({ where: { githubUrl } });
    if (existing) {
      return NextResponse.json({
        success: true,
        tool: existing,
        message: existing.status === "approved"
          ? "الأداة دي موجودة ومنشورة ✅"
          : "الأداة دي قيد المراجعة ⏳",
      });
    }

    // 1. نزل كل الملفات
    const { files, totalSize } = await fetchAllRepoFiles(parsed.owner, parsed.repo);

    if (files.length === 0) {
      return NextResponse.json({ error: "ملقتش ملفات في الـ repo" }, { status: 404 });
    }

    // 2. AI يحلل ويولّد tool
    const toolData = await analyzeAndGenerateTool(files, parsed.repo, parsed.owner);

    // 3. احفظ في DB
    const dbTool = await db.installedTool.create({
      data: {
        githubUrl,
        repoName: parsed.repo,
        repoOwner: parsed.owner,
        toolName: toolData.toolName,
        displayName: toolData.displayName,
        description: toolData.description,
        parameters: toolData.parameters,
        executeCode: toolData.executeCode,
        codeFiles: JSON.stringify(files.map((f) => ({ path: f.path, content: f.content.slice(0, 10000) }))),
        dependencies: toolData.dependencies,
        aiReview: toolData.aiReview,
        fileCount: files.length,
        status: "pending",
        submittedBy: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      tool: dbTool,
      message: `تم سحب ${files.length} ملف وتحويلها لأداة "${toolData.displayName}" ✅ — الأدمن هيراجعها وينشرها`,
    });
  } catch (error: any) {
    console.error("[GitHub Tool Import] Error:", error);
    return NextResponse.json({
      error: error?.message || "حصل خطأ أثناء سحب الـ repo",
    }, { status: 500 });
  }
}
