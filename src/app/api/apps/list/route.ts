/**
 * /api/apps/list
 * ===============
 * GET — قائمة التطبيقات (approved للناس، الكل للأدمن)
 * POST — approve/reject (أدمن)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromToken, extractBearerToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user) return NextResponse.json({ error: "مطلوب تسجيل الدخول" }, { status: 401 });

    const isAdmin = user.role === "admin";
    const where = isAdmin ? {} : { status: "approved" };

    const apps = await db.anzaroApp.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        appName: true,
        displayName: true,
        description: true,
        icon: true,
        category: true,
        status: true,
        repoName: true,
        repoOwner: true,
        submittedBy: true,
        fileCount: true,
        aiReview: isAdmin ? true : false,
        createdAt: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json({ success: true, apps, isAdmin });
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
    const { appId, action } = body as { appId: string; action: "approve" | "reject" };
    if (!appId || !action) return NextResponse.json({ error: "appId و action مطلوبين" }, { status: 400 });

    const newStatus = action === "approve" ? "approved" : "rejected";
    const updated = await db.anzaroApp.update({
      where: { id: appId },
      data: { status: newStatus, reviewedBy: user.email, reviewedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      app: updated,
      message: action === "approve" ? `تم نشر التطبيق ✅ — متاح على /app/${updated.appName}` : "تم رفض التطبيق ❌",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
