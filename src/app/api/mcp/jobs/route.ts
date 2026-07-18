/**
 * GET /api/mcp/jobs
 * =================
 * قائمة كل الـ jobs (أو فلتر بـ status / type / ownerId).
 *
 * Query params:
 *   ?status=pending|running|done|failed
 *   ?type=video_creation
 *   ?ownerId=xxx
 *   ?limit=50        (default 50, max 200)
 *   ?offset=0
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// maxDuration = 300s — MCP job orchestration may run multi-step LLM tool chains.
export const maxDuration = 300;

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const ownerId = url.searchParams.get("ownerId");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (ownerId) where.ownerId = ownerId;

    const jobs = await db.mcpJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await db.mcpJob.count({ where });

    return NextResponse.json({
      success: true,
      count: jobs.length,
      total,
      jobs: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        sourceTool: j.sourceTool,
        webhookUrl: j.webhookUrl,
        ownerId: j.ownerId,
        progress: j.progress,
        errorMessage: j.errorMessage,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        // Don't return full inputs/result in list view (could be huge)
        inputs: j.inputsJson ? JSON.parse(j.inputsJson) : null,
        result: j.resultJson ? JSON.parse(j.resultJson) : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
});
