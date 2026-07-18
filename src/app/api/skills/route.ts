/**
 * /api/skills
 * ===========
 * GET  — قائمة كل الـ skills (المستخدمين يشفوا approved بس، الأدمن يشفوا الكل)
 * POST — approve/reject skill (أدمن بس)
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
    if (!user) {
      return NextResponse.json({ error: "مطلوب تسجيل الدخول" }, { status: 401 });
    }

    const isAdmin = user.role === "admin";
    const status = isAdmin ? undefined : "approved";

    const skills = await db.gitHubSkill.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        githubUrl: true,
        repoName: true,
        repoOwner: true,
        name: true,
        description: true,
        status: true,
        submittedBy: true,
        fileCount: true,
        aiReview: isAdmin ? true : false,
        skillMd: status === "approved" || isAdmin ? true : false,
        toolsNeeded: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json({ success: true, skills, isAdmin });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// ── POST: approve/reject (admin only) ──
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    const user = token ? await getUserFromToken(token) : null;
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "مطلوب صلاحيات أدمن" }, { status: 403 });
    }

    const body = await request.json();
    const { skillId, action } = body as { skillId: string; action: "approve" | "reject" };

    if (!skillId || !action) {
      return NextResponse.json({ error: "skillId و action مطلوبين" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const updated = await db.gitHubSkill.update({
      where: { id: skillId },
      data: {
        status: newStatus,
        reviewedBy: user.email,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      skill: updated,
      message: action === "approve" ? "تم نشر المهارة ✅" : "تم رفض المهارة ❌",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
