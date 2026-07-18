/**
 * POST /api/content-studio
 * =========================
 * استوديو إنشاء المحتوى المتكامل — SSE streaming.
 * بيوّلد: أفكار + سكريبت + thumbnail + captions + hashtags + جدول نشر + استراتيجية
 */

import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { generateContentPackage } from "@/lib/content-studio/engine";
import type {
  ContentStudioRequest,
  ContentStudioSSEEvent,
  ContentType,
  Platform,
} from "@/lib/content-studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_CONTENT_TYPES: ContentType[] = [
  "youtube",
  "reel",
  "tiktok",
  "podcast",
  "blog",
  "twitter-thread",
];
const VALID_PLATFORMS: Platform[] = [
  "youtube",
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "linkedin",
];

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();

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

    let platforms: Platform[] | undefined;
    if (Array.isArray(body.platforms)) {
      platforms = body.platforms.filter((p: string) => VALID_PLATFORMS.includes(p as Platform));
    }

    const studioReq: ContentStudioRequest = {
      topic: body.topic.trim(),
      contentType,
      platforms: platforms && platforms.length > 0 ? platforms : undefined,
      tone: body.tone || "energetic",
      language: body.language || "ar",
      audience: body.audience?.trim() || undefined,
      enableThinking: body.enableThinking === true,
      generateCalendar: body.generateCalendar === true,
    };

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const sink = (event: ContentStudioSSEEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          await generateContentPackage(studioReq, sink);
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
