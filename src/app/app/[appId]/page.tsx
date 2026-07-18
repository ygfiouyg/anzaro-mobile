/**
 * /app/[appId]
 * ============
 * صفحة عامة بترender أي Anzaro App في iframe sandboxed.
 *
 * الـ app بيتبنى من الـ DB:
 * - frontendHtml → يتـ render جوه iframe
 * - backendCode → الـ iframe بيكلمه عبر postMessage → /api/apps/[appId]/execute
 */

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AppPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;

  let app: any = null;
  try {
    app = await db.anzaroApp.findFirst({
      where: {
        OR: [{ appName: appId }, { id: appId }],
        status: "approved",
      },
    });
  } catch {
    // DB مش متاح
  }

  if (!app) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm">التطبيق غير موجود أو مش منشور</p>
          <a href="/" className="text-blue-500 text-xs mt-2 inline-block">العودة للرئيسية</a>
        </div>
      </div>
    );
  }

  // بـني الـ HTML الكامل: الـ frontend + communication layer
  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.displayName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', 'Segoe UI', sans-serif; background: #0a0a0a; color: #e4e4e7; }
    .anzaro-app-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; background: #18181b; border-bottom: 1px solid #27272a;
    }
    .anzaro-app-header span { font-size: 14px; font-weight: 600; }
    .anzaro-app-content { padding: 16px; min-height: calc(100vh - 44px); }
  </style>
  ${app.frontendHtml?.includes("<style>") ? "" : "<style>" + (app.frontendHtml?.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || "") + "</style>"}
</head>
<body>
  <div class="anzaro-app-header">
    <span>${app.icon}</span>
    <span>${app.displayName}</span>
  </div>
  <div class="anzaro-app-content" id="anzaro-root">
    ${app.frontendHtml || "<p>محتوى التطبيق غير متاح</p>"}
  </div>

  <script>
    // ── Communication Layer: الـ iframe بيكلم الـ backend ──
    window.anzaroCall = async function(functionName, args) {
      try {
        const resp = await fetch('/api/apps/${app.id}/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: functionName, args: args || {} }),
        });
        const data = await resp.json();
        return data;
      } catch (e) {
        return { success: false, error: e.message };
      }
    };

    // نفّذ الـ JS الخاص بالـ app (لو موجود)
    ${app.frontendHtml?.match(/<script[^>]*>([\s\S]*?)<\/script>/g)?.map(s => s.replace(/<\/?script[^>]*>/g, "")).join("\n") || ""}
  </script>
</body>
</html>`;

  return (
    <div className="min-h-screen bg-zinc-950">
      <iframe
        srcDoc={fullHtml}
        className="w-full h-screen border-0"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
        title={app.displayName}
      />
    </div>
  );
}
