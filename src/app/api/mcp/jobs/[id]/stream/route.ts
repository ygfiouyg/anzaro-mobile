/**
 * GET /api/mcp/jobs/[id]/stream
 * =============================
 * SSE stream لتتبع job في الوقت الفعلي (بدل polling).
 *
 * بينبعث events كل 2 ثانية بـ:
 *   - status (pending | running | done | failed | cancelled)
 *   - progress (0-100)
 *   - steps (array of step statuses)
 *   - result (when done)
 *   - error (when failed)
 *
 * الـ stream بيقفل لما الـ job يخلص (done | failed | cancelled).
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const POLL_INTERVAL_MS = 2000;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

export const GET = withAuth(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;

  // Verify job exists first
  const job = await db.mcpJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json(
      { success: false, error: "not_found", message: "الـ job غير موجود" },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const startTime = Date.now();
      let lastStatus = "";
      let lastProgress = -1;
      let lastStepsHash = "";

      // Send initial state
      const initial = await db.mcpJob.findUnique({
        where: { id },
        include: { steps: { orderBy: { createdAt: "asc" } } },
      });
      if (initial) {
        send({
          type: "status",
          jobId: initial.id,
          status: initial.status,
          progress: initial.progress,
          steps: initial.steps.map((s) => ({
            stepName: s.stepName,
            status: s.status,
          })),
        });
        lastStatus = initial.status;
        lastProgress = initial.progress;
      }

      // Poll loop
      const poll = async () => {
        try {
          while (true) {
            // Check timeout
            if (Date.now() - startTime > MAX_STREAM_DURATION_MS) {
              send({ type: "timeout", message: "Stream timeout (5 min)" });
              break;
            }

            const current = await db.mcpJob.findUnique({
              where: { id },
              include: { steps: { orderBy: { createdAt: "asc" } } },
            });

            if (!current) {
              send({ type: "error", message: "Job not found" });
              break;
            }

            // Check if anything changed
            const stepsHash = current.steps
              .map((s) => `${s.stepName}:${s.status}`)
              .join("|");

            const changed =
              current.status !== lastStatus ||
              current.progress !== lastProgress ||
              stepsHash !== lastStepsHash;

            if (changed) {
              send({
                type: "update",
                jobId: current.id,
                status: current.status,
                progress: current.progress,
                steps: current.steps.map((s) => ({
                  stepName: s.stepName,
                  status: s.status,
                  output: s.outputJson ? JSON.parse(s.outputJson) : null,
                  errorMessage: s.errorMessage,
                  startedAt: s.startedAt,
                  completedAt: s.completedAt,
                })),
                result: current.resultJson ? JSON.parse(current.resultJson) : null,
                errorMessage: current.errorMessage,
              });
              lastStatus = current.status;
              lastProgress = current.progress;
              lastStepsHash = stepsHash;
            }

            // Check if job is in a terminal state
            if (["done", "failed", "cancelled"].includes(current.status)) {
              send({
                type: "done",
                status: current.status,
                progress: current.progress,
                result: current.resultJson ? JSON.parse(current.resultJson) : null,
                errorMessage: current.errorMessage,
              });
              break;
            }

            // Wait before next poll
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }
        } catch (e: any) {
          send({ type: "error", message: e.message });
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      };

      // Start polling (don't await — return immediately)
      poll();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
