/**
 * /api/tools/list-installed
 * =========================
 * GET — قائمة الأدوات المثبتة (approved للناس، الكل للأدمن)
 * POST — approve/reject (أدمن)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromToken, extractBearerToken } from "@/lib/auth";
import { clearDynamicToolsCache } from "@/lib/mcp/dynamic-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user) return NextResponse.json({ error: "مطلوب تسجيل الدخول" }, { status: 401 });

    const isAdmin = user.role === "admin";
    const where = isAdmin ? {} : { status: "approved" };

    const tools = await db.installedTool.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        githubUrl: true,
        repoName: true,
        repoOwner: true,
        toolName: true,
        displayName: true,
        description: true,
        status: true,
        submittedBy: true,
        fileCount: true,
        aiReview: isAdmin ? true : false,
        parameters: true,
        dependencies: isAdmin ? true : false,
        executeCode: isAdmin ? true : false,
        createdAt: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json({ success: true, tools, isAdmin });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "مطلوب صلاحيات أدمن" }, { status: 403 });
    }

    const body = await request.json();
    const { toolId, action } = body as { toolId: string; action: "approve" | "reject" };

    if (!toolId || !action) {
      return NextResponse.json({ error: "toolId و action مطلوبين" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const updated = await db.installedTool.update({
      where: { id: toolId },
      data: {
        status: newStatus,
        reviewedBy: user.email,
        reviewedAt: new Date(),
      },
    });

    // امسح الـ cache عشان الـ tool تظهر/تختفي فوراً
    clearDynamicToolsCache();

    return NextResponse.json({
      success: true,
      tool: updated,
      message: action === "approve" ? "تم نشر الأداة ✅ — دلوقتي الـ AI يقدر يستخدمها" : "تم رفض الأداة ❌",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
