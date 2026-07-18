/**
 * PATCH /api/mcp/jobs/[id]/steps/[stepName]
 * ==========================================
 * Update a specific step in a job (n8n calls this after each workflow step).
 *
 * Body:
 *   {
 *     "status":    "pending" | "running" | "done" | "failed" | "skipped",
 *     "output"?:   any,        // result of this step (e.g. { script: "..." })
 *     "error"?:    string      // error message if failed
 *   }
 *
 * Headers:
 *   X-Job-Secret: <secret>   // required if JOB_WEBHOOK_SECRET is set
 *   Authorization: Bearer <token>  // OR auth token
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; stepName: string }>;
}

const VALID_STEP_STATUSES = new Set(["pending", "running", "done", "failed", "skipped"]);

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: jobId, stepName } = await params;

    // SECURITY FIX #29: Fail closed if JOB_WEBHOOK_SECRET not set
    const expectedSecret = process.env.JOB_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { success: false, error: "not_configured", message: "JOB_WEBHOOK_SECRET env var is not set — step updates disabled for security" },
        { status: 503 },
      );
    }

    const providedSecret = req.headers.get("x-job-secret") || "";
    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: "unauthorized", message: "X-Job-Secret header invalid" },
        { status: 401 },
      );
    }

    let body: { status?: string; output?: unknown; error?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "invalid_json" },
        { status: 400 },
      );
    }

    const status = String(body.status || "").toLowerCase().trim();
    if (!VALID_STEP_STATUSES.has(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "invalid_status",
          message: `status لازم يكون: ${[...VALID_STEP_STATUSES].join(" | ")}`,
        },
        { status: 400 },
      );
    }

    // Verify job exists
    const job = await db.mcpJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json(
        { success: false, error: "not_found", message: "الـ job غير موجود" },
        { status: 404 },
      );
    }

    // Upsert the step (create if doesn't exist, update if it does)
    const data: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (body.output !== undefined) {
      data.outputJson = JSON.stringify(body.output).slice(0, 100_000);
    }
    if (body.error !== undefined) {
      data.errorMessage = String(body.error).slice(0, 5000);
    }
    if (status === "running") {
      data.startedAt = new Date();
    }
    if (status === "done" || status === "failed" || status === "skipped") {
      data.completedAt = new Date();
    }

    // Find existing step
    const existing = await db.jobStep.findUnique({
      where: { jobId_stepName: { jobId, stepName } },
    });

    let step;
    if (existing) {
      // Update — only set startedAt if not already set
      if (status === "running" && existing.startedAt) {
        delete data.startedAt;
      }
      step = await db.jobStep.update({
        where: { id: existing.id },
        data,
      });
    } else {
      // Create new step
      step = await db.jobStep.create({
        data: {
          jobId,
          stepName,
          status,
          outputJson: data.outputJson as string | undefined,
          errorMessage: data.errorMessage as string | undefined,
          startedAt: data.startedAt as Date | undefined,
          completedAt: data.completedAt as Date | undefined,
        },
      });
    }

    // Update job progress based on step completion
    // Count completed steps vs total
    const allSteps = await db.jobStep.findMany({ where: { jobId } });
    const doneCount = allSteps.filter((s) => s.status === "done").length;
    const totalCount = allSteps.length;
    const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : job.progress;

    // If a step failed, mark the job as failed too
    if (status === "failed") {
      await db.mcpJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorMessage: `Step "${stepName}" failed: ${body.error || "unknown error"}`,
          progress,
        },
      });
    } else {
      await db.mcpJob.update({
        where: { id: jobId },
        data: { progress, status: progress > 0 ? "running" : job.status },
      });
    }

    return NextResponse.json({
      success: true,
      step: {
        id: step.id,
        stepName: step.stepName,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      },
      jobProgress: progress,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "update_failed", message: e.message },
      { status: 500 },
    );
  }
}
