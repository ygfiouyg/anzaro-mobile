/**
 * MCP Tool — n8n Workflow Async Trigger
 * ======================================
 * إطلاق n8n workflow بشكل غير متزامن (async) مع job tracking.
 *
 * الفرق بين ده و n8n_trigger:
 *   - n8n_trigger: synchronous — بيستنى الـ workflow يخلص (timeout بعد 30s)
 *   - n8n_workflow_async: async — بيـ create job، يـ POST لـ n8n، يرجّع job_id فوراً
 *
 * n8n بيشتغل لوحده، ولما يخلص بينادي على /api/mcp/job-complete.
 * الـ Frontend بـ poll /api/mcp/jobs/[id] عشان يشوف الـ status.
 *
 * متطلبات:
 *   - N8N_WEBHOOK_URL env var (أو webhookUrl param)
 *   - DELTAAI_CALLBACK_URL env var (URL الـ /api/mcp/job-complete endpoint)
 *     عشان n8n يقدر ينادي لما يخلص. لو مش موجود، بنبعت URL افتراضي.
 */
import type { MCPTool } from "../types";
import { db } from "@/lib/db";

export const n8nWorkflowAsyncTool: MCPTool = {
  name: "n8n_workflow_async",
  description:
    "إطلاق n8n workflow بشكل غير متزامن. بيـ create job في الـ DB، يـ POST لـ n8n webhook، ويرجّع job_id فوراً (مش بيستنى). استخدمها للـ workflows الطويلة زي إنشاء فيديو، رفع يوتيوب، حملات إيميل. الـ status بيتـ update لما n8n يخلص.",
  parameters: {
    type: "object",
    properties: {
      workflowType: {
        type: "string",
        description:
          "نوع الـ workflow (e.g. 'video_creation', 'youtube_upload', 'email_campaign', 'data_pipeline').",
      },
      webhookUrl: {
        type: "string",
        description:
          "n8n webhook URL. If omitted, uses N8N_WEBHOOK_URL env var.",
      },
      inputs: {
        type: "string",
        description:
          "JSON-encoded inputs to send to n8n (e.g. '{\"topic\":\"AI\",\"duration\":60}').",
      },
      ownerId: {
        type: "string",
        description: "Optional owner ID for tracking who started the job.",
      },
    },
    required: ["workflowType"],
  },
  async execute(params) {
    const workflowType = String(params.workflowType || "").trim();
    if (!workflowType) {
      return { success: false, error: "workflowType مطلوب" };
    }

    // Resolve webhook URL
    let webhookUrl = params.webhookUrl ? String(params.webhookUrl).trim() : "";
    if (!webhookUrl) {
      webhookUrl = process.env.N8N_WEBHOOK_URL || "";
    }
    if (!webhookUrl) {
      return {
        success: false,
        error: "webhookUrl مطلوبة (أو ضع N8N_WEBHOOK_URL env var)",
      };
    }
    if (!/^https?:\/\//i.test(webhookUrl)) {
      return { success: false, error: "webhookUrl لازم تبدأ بـ http:// أو https://" };
    }

    // Parse inputs
    let inputsObj: unknown = {};
    if (params.inputs) {
      try {
        inputsObj = JSON.parse(String(params.inputs));
      } catch {
        return { success: false, error: "inputs لازم يكون JSON صالح" };
      }
    }

    const ownerId = params.ownerId ? String(params.ownerId).trim() : null;

    // The callback URL that n8n will call when done
    const callbackUrl = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL
      ? `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL.replace(/\/$/, "")}/api/mcp/job-complete`
      : null;

    try {
      // 1) Create job in DB
      const job = await db.mcpJob.create({
        data: {
          type: workflowType,
          status: "pending",
          sourceTool: "n8n_workflow_async",
          inputsJson: JSON.stringify(inputsObj),
          webhookUrl,
          ownerId,
        },
      });

      // 2) POST to n8n webhook (async — don't wait for workflow to finish)
      const payload: Record<string, unknown> = {
        job_id: job.id,
        type: workflowType,
        inputs: inputsObj,
        // Tell n8n where to call back when done
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      };

      // Use a short timeout — we just want n8n to ACK the webhook
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          // Mark job as failed
          const errBody = await res.text().catch(() => "");
          await db.mcpJob.update({
            where: { id: job.id },
            data: {
              status: "failed",
              errorMessage: `n8n webhook returned HTTP ${res.status}: ${errBody.slice(0, 500)}`,
            },
          });
          return {
            success: false,
            error: `n8n webhook error HTTP ${res.status}`,
            data: { jobId: job.id, statusCode: res.status },
          };
        }

        // n8n accepted — update job status to running
        let ackBody: unknown = null;
        try {
          ackBody = await res.json();
        } catch {
          ackBody = await res.text().catch(() => "");
        }

        await db.mcpJob.update({
          where: { id: job.id },
          data: {
            status: "running",
            startedAt: new Date(),
          },
        });

        return {
          success: true,
          data: {
            jobId: job.id,
            type: workflowType,
            status: "running",
            message: `تم بدء الـ workflow. n8n هينادي لما يخلص. استخدم job_id "${job.id}" لتتبع الحالة عبر /api/mcp/jobs/${job.id}`,
            ack: ackBody,
            webhookUrl,
            triggeredAt: new Date().toISOString(),
          },
        };
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        // Network error or timeout — n8n might be sleeping
        await db.mcpJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorMessage: `Failed to reach n8n webhook: ${fetchErr.message}`,
          },
        });
        return {
          success: false,
          error: `فشل الوصول لـ n8n: ${fetchErr.message}. تأكد إن الـ n8n Space شغال وإن الـ webhook URL صحيح.`,
          data: { jobId: job.id, webhookUrl },
        };
      }
    } catch (e: any) {
      return { success: false, error: `Job creation failed: ${e.message}` };
    }
  },
};

/** Helper: update job status (used by /api/mcp/job-complete endpoint) */
export async function updateJobStatus(
  jobId: string,
  update: {
    status: "pending" | "running" | "done" | "failed" | "cancelled";
    result?: unknown;
    errorMessage?: string;
    progress?: number;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const data: Record<string, unknown> = {
      status: update.status,
      updatedAt: new Date(),
    };
    if (update.result !== undefined) {
      data.resultJson = JSON.stringify(update.result).slice(0, 100_000);
    }
    if (update.errorMessage !== undefined) {
      data.errorMessage = update.errorMessage.slice(0, 5000);
    }
    if (update.progress !== undefined) {
      data.progress = Math.max(0, Math.min(100, update.progress));
    }
    if (update.status === "running" || update.status === "done") {
      if (update.status === "running" && !data.startedAt) {
        data.startedAt = new Date();
      }
      if (update.status === "done") {
        data.completedAt = new Date();
        data.progress = 100;
      }
    }

    await db.mcpJob.update({
      where: { id: jobId },
      data,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
