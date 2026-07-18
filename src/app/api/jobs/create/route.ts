/**
 * POST /api/jobs/create
 * =====================
 * إنشاء job جديد مباشرة (مش شرط يكون من MCP tool).
 *
 * ده مفيد لما الـ Frontend عايز يبدأ workflow من غير ما يمر على الـ Agent.
 * مثلاً: زر "إنشاء فيديو" في الـ UI بيـ create job + POST لـ n8n.
 *
 * Body:
 *   {
 *     "type":        string,        // required — workflow type
 *     "inputs":      object,        // optional — workflow inputs
 *     "webhookUrl"?: string,        // optional — override N8N_WEBHOOK_URL
 *     "ownerId"?:    string,        // optional
 *     "steps"?:      string[],      // optional — predefine steps (e.g. ["script", "image", "upload"])
 *     "triggerN8n"?: boolean        // optional — default true. If false, just creates the job without calling n8n
 *   }
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateJobBody {
  type?: string;
  inputs?: Record<string, unknown>;
  webhookUrl?: string;
  ownerId?: string;
  steps?: string[];
  triggerN8n?: boolean;
}

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  try {
    const body = (await request.json()) as CreateJobBody;
    const type = String(body.type || "").trim();
    if (!type) {
      return NextResponse.json(
        { success: false, error: "missing_type", message: "type مطلوب" },
        { status: 400 },
      );
    }

    const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : {};
    const ownerId = body.ownerId ? String(body.ownerId).trim() : null;
    const triggerN8n = body.triggerN8n !== false; // default true

    // Resolve webhook URL
    let webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim() : "";
    if (triggerN8n && !webhookUrl) {
      webhookUrl = process.env.N8N_WEBHOOK_URL || "";
    }
    if (triggerN8n && !webhookUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "missing_webhook_url",
          message: "webhookUrl مطلوبة (أو ضع N8N_WEBHOOK_URL env var) أو اضبط triggerN8n=false",
        },
        { status: 400 },
      );
    }
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      return NextResponse.json(
        { success: false, error: "invalid_webhook_url", message: "webhookUrl لازم تبدأ بـ http:// أو https://" },
        { status: 400 },
      );
    }

    // Create job
    const job = await db.mcpJob.create({
      data: {
        type,
        status: triggerN8n ? "pending" : "pending",
        sourceTool: "api_direct",
        inputsJson: JSON.stringify(inputs),
        webhookUrl: webhookUrl || null,
        ownerId,
      },
    });

    // Predefine steps if provided
    if (Array.isArray(body.steps) && body.steps.length > 0) {
      await db.jobStep.createMany({
        data: body.steps.map((stepName) => ({
          jobId: job.id,
          stepName: String(stepName),
          status: "pending",
        })),
      });
    }

    // Trigger n8n if requested
    let triggered = false;
    let triggerError: string | null = null;

    if (triggerN8n && webhookUrl) {
      const callbackUrl = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL
        ? `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL.replace(/\/$/, "")}/api/mcp/job-complete`
        : null;

      const payload: Record<string, unknown> = {
        job_id: job.id,
        type,
        inputs,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      };

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          // Mark as running
          await db.mcpJob.update({
            where: { id: job.id },
            data: { status: "running", startedAt: new Date() },
          });
          triggered = true;
        } else {
          const errBody = await res.text().catch(() => "");
          triggerError = `n8n returned HTTP ${res.status}: ${errBody.slice(0, 200)}`;
          await db.mcpJob.update({
            where: { id: job.id },
            data: { status: "failed", errorMessage: triggerError },
          });
        }
      } catch (e: any) {
        triggerError = `Failed to reach n8n: ${e.message}`;
        await db.mcpJob.update({
          where: { id: job.id },
          data: { status: "failed", errorMessage: triggerError },
        });
      }
    }

    // Fetch final state with steps
    const finalJob = await db.mcpJob.findUnique({
      where: { id: job.id },
      include: { steps: true },
    });

    return NextResponse.json({
      success: true,
      job: {
        id: finalJob!.id,
        type: finalJob!.type,
        status: finalJob!.status,
        progress: finalJob!.progress,
        ownerId: finalJob!.ownerId,
        webhookUrl: finalJob!.webhookUrl,
        errorMessage: finalJob!.errorMessage,
        startedAt: finalJob!.startedAt,
        createdAt: finalJob!.createdAt,
        steps: finalJob!.steps.map((s) => ({
          id: s.id,
          stepName: s.stepName,
          status: s.status,
        })),
      },
      triggered,
      triggerError,
      message: triggered
        ? `تم إنشاء الـ job وبدء الـ workflow. تتبع الحالة عبر /api/mcp/jobs/${job.id}/stream`
        : triggerError
          ? `تم إنشاء الـ job لكن فشل trigger n8n: ${triggerError}`
          : `تم إنشاء الـ job بدون trigger n8n.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: "create_failed", message: e.message },
      { status: 500 },
    );
  }
});
