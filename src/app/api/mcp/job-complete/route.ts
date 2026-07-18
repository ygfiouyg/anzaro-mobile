/**
 * POST /api/mcp/job-complete
 * ==========================
 * الـ webhook اللي n8n بيناديه لما workflow يخلص.
 *
 * ده endpoint PUBLIC (مش محتاج auth token) لأن n8n بيستدعيه من خارج المنصة.
 * بدل كده بنستخدم JOB_WEBHOOK_SECRET عشان نتأكد إن n8n هو اللي بينادي.
 *
 * Body:
 *   {
 *     "job_id":     string,           // required — الـ job ID اللي اتعمل في n8n_workflow_async
 *     "status":     "done" | "failed", // required
 *     "result"?:    any,              // optional — نتيجة الـ workflow
 *     "error"?:     string,           // optional — رسالة خطأ لو فشل
 *     "progress"?:  number            // optional — 0-100
 *   }
 *
 * Headers:
 *   X-Job-Secret: <secret>   // required — لازم يساوي JOB_WEBHOOK_SECRET env var
 *                            // (لو مش set، بنتساهل عنه — بس ينصح بـ set في الإنتاج)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateJobStatus } from "@/lib/mcp/tools/n8n-workflow-async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JobCompleteBody {
  job_id?: string;
  status?: string;
  result?: unknown;
  error?: string;
  progress?: number;
}

export async function POST(req: NextRequest) {
  try {
    // ── Verify secret (FAIL CLOSED if not configured) ──
    // SECURITY FIX #28: Previously failed open (accepted unauth if secret unset).
    // Now fails closed — returns 503 if JOB_WEBHOOK_SECRET not set.
    const expectedSecret = process.env.JOB_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error("[job-complete] JOB_WEBHOOK_SECRET not set — refusing unauthenticated job updates");
      return NextResponse.json(
        { success: false, error: "not_configured", message: "JOB_WEBHOOK_SECRET env var is not set — webhook disabled for security" },
        { status: 503 },
      );
    }

    const providedSecret = req.headers.get("x-job-secret") || "";
    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: "unauthorized", message: "X-Job-Secret header invalid or missing" },
        { status: 401 },
      );
    }

    // ── Parse body ──
    let body: JobCompleteBody;
    try {
      body = (await req.json()) as JobCompleteBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "invalid_json", message: "الـ body لازم يكون JSON صالح" },
        { status: 400 },
      );
    }

    const jobId = String(body.job_id || "").trim();
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "missing_job_id", message: "job_id مطلوب" },
        { status: 400 },
      );
    }

    const status = String(body.status || "").toLowerCase().trim();
    if (!["done", "failed", "cancelled", "running"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "invalid_status", message: "status لازم يكون: done | failed | cancelled | running" },
        { status: 400 },
      );
    }

    // ── Verify job exists ──
    const existing = await db.mcpJob.findUnique({ where: { id: jobId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "not_found", message: `الـ job "${jobId}" غير موجود` },
        { status: 404 },
      );
    }

    // ── Update job ──
    const updateResult = await updateJobStatus(jobId, {
      status: status as "done" | "failed" | "cancelled" | "running",
      result: body.result,
      errorMessage: body.error,
      progress: body.progress,
    });

    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: "update_failed", message: updateResult.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status,
      message: status === "done"
        ? "تم تحديث الـ job إلى done"
        : status === "failed"
          ? "تم تحديث الـ job إلى failed"
          : `تم تحديث الـ job إلى ${status}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "internal_error", message: e.message },
      { status: 500 },
    );
  }
}

// GET — simple health check for n8n to verify endpoint is up
export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/mcp/job-complete",
    description: "n8n workflow completion webhook",
    usage: "POST with { job_id, status, result?, error? } + X-Job-Secret header",
  });
}
