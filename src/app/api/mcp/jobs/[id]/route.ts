/**
 * GET  /api/mcp/jobs/[id]  — احصل على job واحد (status + result)
 * PATCH /api/mcp/jobs/[id] — تحديث progress (للـ n8n بيستخدمه أثناء الشغل)
 *
 * Headers:
 *   Authorization: Bearer <token>   // required for both
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// maxDuration = 300s — a single MCP job step may invoke a slow LLM tool.
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

// ── GET: fetch single job ────────────────────────────────────
export const GET = withAuth(async (request: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    const job = await db.mcpJob.findUnique({
      where: { id },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    if (!job) {
      return NextResponse.json(
        { success: false, error: "not_found", message: "الـ job غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        sourceTool: job.sourceTool,
        webhookUrl: job.webhookUrl,
        ownerId: job.ownerId,
        progress: job.progress,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        inputs: job.inputsJson ? JSON.parse(job.inputsJson) : null,
        result: job.resultJson ? JSON.parse(job.resultJson) : null,
        steps: job.steps.map((s) => ({
          id: s.id,
          stepName: s.stepName,
          status: s.status,
          output: s.outputJson ? JSON.parse(s.outputJson) : null,
          errorMessage: s.errorMessage,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
});

// ── PATCH: update progress (n8n can call this mid-workflow) ──
interface PatchBody {
  progress?: number;
  status?: "running";
  message?: string;
}

export const PATCH = withAuth(async (request: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "invalid_json" },
        { status: 400 },
      );
    }

    const existing = await db.mcpJob.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "not_found", message: "الـ job غير موجود" },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.progress === "number") {
      data.progress = Math.max(0, Math.min(100, body.progress));
    }
    if (body.status === "running") {
      data.status = "running";
      if (!existing.startedAt) data.startedAt = new Date();
    }

    const updated = await db.mcpJob.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      job: {
        id: updated.id,
        status: updated.status,
        progress: updated.progress,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "update_failed", message: e.message },
      { status: 500 },
    );
  }
});
