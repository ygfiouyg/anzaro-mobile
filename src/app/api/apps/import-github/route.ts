/**
 * POST /api/apps/import-github
 * ============================
 * يسحب repo كامل من GitHub → AI يحلله → يولّد app كامل (frontend + backend).
 *
 * الـ AI بيـ:
 * 1. يقرا كل ملفات الـ repo
 * 2. يفهم الـ structure (frontend + backend)
 * 3. يولّد HTML كامل للـ frontend (vanilla HTML/CSS/JS)
 * 4. يولّد JavaScript functions للـ backend
 * 5. يحدد الـ API routes
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

async function fetchAllRepoFiles(owner: string, repo: string): Promise<{ files: GitHubFile[]; totalSize: number }> {
  const files: GitHubFile[] = [];
  let totalSize = 0;

  let treeData: any = null;
  for (const branch of ["main", "master"]) {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const resp = await fetch(treeUrl, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Anzaro-AI" },
    });
    if (resp.ok) { treeData = await resp.json(); break; }
  }

  if (!treeData?.tree) throw new Error("مش قادر أقرا الـ repo — تأكد إنه public");

  const importantExtensions = [".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".py", ".json", ".md", ".txt", ".yaml", ".yml", ".vue", ".svelte"];
  const skipPaths = ["node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".next", "coverage", ".vscode"];
  const maxFiles = 50;
  const maxFileSize = 100_000;

  for (const item of treeData.tree) {
    if (item.type !== "blob") continue;
    if (files.length >= maxFiles) break;
    if (skipPaths.some((p) => item.path.includes(p))) continue;
    const isImportant = importantExtensions.some((ext) => item.path.endsWith(ext));
    if (!isImportant) continue;

    try {
      const branch = treeData.sha || "main";
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
      const rawResp = await fetch(rawUrl, { headers: { "User-Agent": "Anzaro-AI" } });
      if (!rawResp.ok) continue;
      const content = await rawResp.text();
      if (content.length > maxFileSize) continue;
      files.push({ name: item.path.split("/").pop() || item.path, path: item.path, content: content.slice(0, maxFileSize), size: content.length });
      totalSize += content.length;
    } catch {}
  }

  return { files, totalSize };
}

async function generateApp(files: GitHubFile[], repoName: string, repoOwner: string) {
  const zai = await getZAIClient();

  const codeDump = files.map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 6000)}\n\`\`\``).join("\n\n");

  const systemPrompt = `أنت مهندس برمجيات في منصة Anzaro AI. مهمتك: تقرا كود من GitHub repo وتحوّله لـ "Anzaro App" كامل.

Anzaro App = تطبيق ويب كامل بـ:
1. Frontend: HTML + CSS + JavaScript (vanilla، بدون frameworks)
2. Backend: JavaScript functions تنفّذ في sandbox

قواعد الـ Frontend:
- HTML كامل مع CSS inline في <style>
- JavaScript inline في <script>
- استخدم window.anzaroCall(functionName, args) لاستدعاء الـ backend
- كل التفاعلات بـ vanilla JS (ممنوع React/Vue/Angular)
- الواجهة لازم تكون responsive و RTL
- استخدم dark theme (background: #0a0a0a، text: #e4e4e7)

قواعد الـ Backend:
- كل function بتبدأ بـ async function name(args) { ... return result; }
- متاح: fetch, JSON, Math, Date, URL, crypto, console
- ممنوع: import, require, process.env, fs
- لو محتاج API key → خليها param

حلل الكود وفهم الـ logic بتاع التطبيق. حوله لـ Anzaro App.

رجه JSON فقط:
{
  "appName": "kebab-case-slug",
  "displayName": "اسم عربي",
  "description": "وصف",
  "icon": "emoji",
  "category": "utility|productivity|entertainment|education|tools",
  "frontendHtml": "<!-- HTML content فقط (بدون <html> أو <body>) — الـ wrapper بيتحط تلقائياً -->",
  "backendCode": "{ \"search\": \"async function search(args) { ... return {results: []}; }\", \"book\": \"async function book(args) { ... return {success: true}; }\" }",
  "apiRoutes": "[{\"path\":\"/search\",\"method\":\"POST\",\"function\":\"search\"}]",
  "aiReview": "تقرير أمان وجودة"
}`;

  const completion = await zai.chat.completions.create({
    model: "glm-4-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Repo: ${repoOwner}/${repoName}\n\nالملفات (${files.length}):\n${codeDump.slice(0, 50000)}` },
    ],
    stream: false,
    temperature: 0.3,
    max_tokens: 8192,
  } as any);

  const content = (completion as any).choices?.[0]?.message?.content ?? "{}";

  let parsed: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? content);
  } catch {
    parsed = {
      appName: slugify(repoName),
      displayName: repoName,
      description: `تطبيق من ${repoOwner}/${repoName}`,
      icon: "📱",
      category: "utility",
      frontendHtml: `<div style="text-align:center;padding:40px"><h2>التطبيق غير متاح</h2><p>تعذّر توليد الواجهة</p></div>`,
      backendCode: "{}",
      apiRoutes: "[]",
      aiReview: "تعذّر التحليل",
    };
  }

  return {
    appName: slugify(parsed.appName || repoName),
    displayName: parsed.displayName || repoName,
    description: parsed.description || `تطبيق من ${repoOwner}/${repoName}`,
    icon: parsed.icon || "📱",
    category: parsed.category || "utility",
    frontendHtml: parsed.frontendHtml || "<div>محتوى غير متاح</div>",
    backendCode: typeof parsed.backendCode === "string" ? parsed.backendCode : JSON.stringify(parsed.backendCode || {}),
    apiRoutes: typeof parsed.apiRoutes === "string" ? parsed.apiRoutes : JSON.stringify(parsed.apiRoutes || []),
    aiReview: parsed.aiReview || "لم يتم المراجعة",
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user) return NextResponse.json({ error: "مطلوب تسجيل الدخول" }, { status: 401 });

    const body = await request.json();
    const { githubUrl } = body as { githubUrl: string };
    if (!githubUrl || !githubUrl.includes("github.com")) {
      return NextResponse.json({ error: "أدخل رابط GitHub صحيح" }, { status: 400 });
    }

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) return NextResponse.json({ error: "صيغة الرابط غلط" }, { status: 400 });

    const existing = await db.anzaroApp.findUnique({ where: { githubUrl } });
    if (existing) {
      return NextResponse.json({
        success: true,
        app: existing,
        message: existing.status === "approved" ? "التطبيق موجود ومنشور ✅" : "التطبيق قيد المراجعة ⏳",
      });
    }

    // 1. نزل الملفات
    const { files, totalSize } = await fetchAllRepoFiles(parsed.owner, parsed.repo);
    if (files.length === 0) return NextResponse.json({ error: "ملقتش ملفات" }, { status: 404 });

    // 2. AI يحلل ويولّد app
    const appData = await generateApp(files, parsed.repo, parsed.owner);

    // 3. احفظ في DB
    const dbApp = await db.anzaroApp.create({
      data: {
        githubUrl,
        repoName: parsed.repo,
        repoOwner: parsed.owner,
        appName: appData.appName,
        displayName: appData.displayName,
        description: appData.description,
        icon: appData.icon,
        category: appData.category,
        frontendHtml: appData.frontendHtml,
        backendCode: appData.backendCode,
        apiRoutes: appData.apiRoutes,
        sourceFiles: JSON.stringify(files.map((f) => ({ path: f.path, content: f.content.slice(0, 5000) }))),
        aiReview: appData.aiReview,
        fileCount: files.length,
        status: "pending",
        submittedBy: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      app: dbApp,
      message: `تم سحب ${files.length} ملف وتحويلها لتطبيق "${appData.displayName}" ✅ — الأدمن هيراجع وينشر، وبعدها تلاقيه على /app/${appData.appName}`,
    });
  } catch (error: any) {
    console.error("[GitHub App Import] Error:", error);
    return NextResponse.json({ error: error?.message || "حصل خطأ" }, { status: 500 });
  }
}
