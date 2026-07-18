/**
 * POST /api/script-writer
 * =======================
 * أداة كتابة السكريبت — SSE streaming.
 * بتستخدم المهارات النفسية (script-writing, retention-hooks, persuasion-triggers, إلخ)
 * عشان تولّد سكريبت كامل بـ hook + open loops + CTA.
 *
 * Request body:
 *   { topic, contentType, audience?, tone?, language?, cta?, enableThinking?, messages? }
 *
 * Response: SSE stream بنفس بروتوكول /api/chat + script_done event في الآخر
 */

import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { generateScript } from "@/lib/scriptwriter/engine";
import type { ScriptWriterRequest, ScriptSSEEvent, ContentType } from "@/lib/scriptwriter/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_CONTENT_TYPES: ContentType[] = ["youtube", "reel", "tiktok", "podcast", "blog"];

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();

    // validation
    if (!body.topic || typeof body.topic !== "string" || body.topic.trim().length < 2) {
      return Response.json({ error: "topic مطلوب (حرفين على الأقل)" }, { status: 400 });
    }

    const contentType = (body.contentType as ContentType) ?? "reel";
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      return Response.json(
        { error: `contentType لازم يكون واحد من: ${VALID_CONTENT_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const scriptReq: ScriptWriterRequest = {
      topic: body.topic.trim(),
      contentType,
      audience: body.audience?.trim() || undefined,
      tone: body.tone || "energetic",
      language: body.language || "ar",
      durationSeconds: body.durationSeconds ? Number(body.durationSeconds) : undefined,
      cta: body.cta?.trim() || undefined,
      enableThinking: body.enableThinking === true,
      messages: Array.isArray(body.messages) ? body.messages : undefined,
    };

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const sink = (event: ScriptSSEEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          await generateScript(scriptReq, sink);
        } catch (e: any) {
          sink({ type: "error", error: e.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
