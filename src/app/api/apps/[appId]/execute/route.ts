/**
 * POST /api/apps/[appId]/execute
 * ==============================
 * ينفّذ backend function من Anzaro App في sandbox.
 *
 * الـ frontend بيبعت: { function: "search", args: { query: "test" } }
 * والـ sandbox بينفّذ الـ function ويرجع النتيجة.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import vm from "vm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  try {
    const { appId } = await params;
    const body = await request.json();
    const { function: funcName, args } = body as { function: string; args: Record<string, unknown> };

    if (!funcName) {
      return NextResponse.json({ error: "function name مطلوب" }, { status: 400 });
    }

    // اقرا الـ app من DB
    const app = await db.anzaroApp.findFirst({
      where: { OR: [{ id: appId }, { appName: appId }], status: "approved" },
    });

    if (!app) {
      return NextResponse.json({ error: "التطبيق غير موجود أو مش منشور" }, { status: 404 });
    }

    // اقرا الـ backend functions
    let backendFns: Record<string, string> = {};
    try {
      backendFns = JSON.parse(app.backendCode);
    } catch {
      return NextResponse.json({ error: "مش قادر أقرا كود الـ backend" }, { status: 500 });
    }

    const fnCode = backendFns[funcName];
    if (!fnCode) {
      return NextResponse.json({ error: `Function "${funcName}" مش موجودة` }, { status: 404 });
    }

    // جهّز الـ sandbox
    const sandbox = {
      params: args || {},
      console: {
        log: (...msgs: any[]) => console.log(`[${app.appName}/${funcName}]`, ...msgs),
        error: (...msgs: any[]) => console.error(`[${app.appName}/${funcName}]`, ...msgs),
      },
      fetch: globalThis.fetch.bind(globalThis),
      JSON, Date, Math, Object, Array, String, Number, Boolean, Promise,
      setTimeout, clearTimeout, URL, URLSearchParams,
      Buffer, TextEncoder, TextDecoder, crypto: globalThis.crypto,
      result: null as any,
    };

    // نفّذ الـ function
    const wrappedCode = `
      (async () => {
        ${fnCode}
        result = await ${funcName}(params);
      })().catch(e => { result = { error: e.message }; });
    `;

    const context = vm.createContext(sandbox);
    vm.runInContext(wrappedCode, context, { timeout: 30_000, filename: `${app.appName}.${funcName}.js` });

    // انتظر النتيجة
    await new Promise((r) => setTimeout(r, 200));

    const result = sandbox.result;
    if (result && result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[App Execute] Error:", error);
    return NextResponse.json({ error: error?.message || "حصل خطأ" }, { status: 500 });
  }
}
