/**
 * POST /api/chat
 * ==============
 * محادثة عادية (بدون أدوات تحكم) — للأسئلة العامة.
 * بستخدم GLM عبر z-ai-web-dev-sdk مع streaming عبر SSE.
 */

import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min for heavy file analysis

const SYSTEM_PROMPT = `أنت "DeltaAI" — مساعد ذكاء اصطناعي عربي ودود ومفيد.
ترد بالعربية الفصحى أو العامية المصرية حسب طلب المستخدم.
كن مختصراً، واضحاً، ومفيداً. استخدم Markdown عند الحاجة.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];

    const zai = await ZAI.create();
    const stream: ReadableStream<Uint8Array> = await zai.chat.completions.create({
      model: "glm-4-plus",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      stream: true,
    } as any);

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]" || !payload) continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed?.choices?.[0]?.delta ?? {};
                if (delta.content) send({ type: "token", content: delta.content });
              } catch {}
            }
          }
          send({ type: "done" });
        } catch (e: any) {
          send({ type: "error", error: e.message });
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
}
