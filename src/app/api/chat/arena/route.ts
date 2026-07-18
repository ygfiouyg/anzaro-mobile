import { NextRequest } from 'next/server';
import { getModelById, languageSuffixes } from '@/lib/models';
import { CHAT_MODEL_MAP, streamChatCompletion } from '@/lib/pollinations';
import type { PollinationsChatMessage } from '@/lib/pollinations';
import { getZAIClient } from '@/lib/chat-utils';

// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Model Arena API Route
// ═══════════════════════════════════════════════════════════════════════
// Accepts: { message: string, models: string[] (2-3), language: string }
// Streams SSE responses from ALL selected models simultaneously.
// Each SSE event is tagged with a modelId so the client can separate them.
// SSE format: { modelId: string, content: string, done: boolean }
// ═══════════════════════════════════════════════════════════════════════

interface ArenaModelStream {
  modelId: string;
  modelName: string;
  stream: AsyncIterable<string>;
}

async function* streamFromPollinations(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
): AsyncIterable<string> {
  const pollinationsEntry = CHAT_MODEL_MAP[modelId];
  if (!pollinationsEntry) {
    yield `[خطأ: لا يوجد تعيين لنموذج Pollinations للمعرف ${modelId}]`;
    return;
  }

  const messages: PollinationsChatMessage[] = [
    { role: 'system', content: systemPrompt + (pollinationsEntry.systemPromptSuffix ? '\n\n' + pollinationsEntry.systemPromptSuffix : '') },
    { role: 'user', content: userMessage },
  ];

  console.log(`[Arena] Streaming from Pollinations: ${pollinationsEntry.pollinationsModel} (${pollinationsEntry.label}) for model: ${modelId}`);

  try {
    const chunkStream = await streamChatCompletion({
      messages,
      model: pollinationsEntry.pollinationsModel as Parameters<typeof streamChatCompletion>[0]['model'],
      temperature: 0.7,
      max_tokens: 2048,
      systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
    });

    for await (const chunk of chunkStream) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error(`[Arena] Pollinations stream error for ${modelId}:`, error);
    yield `\n\n[خطأ في البث من ${pollinationsEntry.label}. جاري التبديل...]`;
    // Fallback to ZhipuAI
    try {
      const zai = await getZAIClient();
      const modelConfig = getModelById(modelId);
      const glmModel = modelConfig?.glmModel || 'glm-4-flash';
      const completion = await zai.chat.completions.create({
        model: glmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        thinking: { type: 'disabled' },
      });
      for await (const chunk of completion) {
        let chunkStr: string;
        if (typeof chunk === 'string') {
          chunkStr = chunk;
        } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
          chunkStr = new TextDecoder().decode(chunk);
        } else if (chunk && typeof chunk === 'object') {
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) yield content;
          continue;
        } else {
          continue;
        }
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;
          const dataStr = trimmedLine.slice(5).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const sseData = JSON.parse(dataStr);
            const content = sseData.choices?.[0]?.delta?.content || '';
            if (content) yield content;
          } catch { /* skip */ }
        }
      }
    } catch (fallbackError) {
      console.error(`[Arena] ZhipuAI fallback error for ${modelId}:`, fallbackError);
      yield `\n\n[فشل الاتصال بالنموذج. يرجى المحاولة لاحقاً.]`;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, models: selectedModels, language } = body as {
      message: string;
      models: string[];
      language: string;
    };

    // Validate
    if (!message || !selectedModels || !Array.isArray(selectedModels)) {
      return new Response(
        JSON.stringify({ error: 'الرسالة والنماذج مطلوبة' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (selectedModels.length < 2 || selectedModels.length > 3) {
      return new Response(
        JSON.stringify({ error: 'يجب اختيار 2-3 نماذج' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each model exists
    for (const modelId of selectedModels) {
      const modelConfig = getModelById(modelId);
      if (!modelConfig) {
        return new Response(
          JSON.stringify({ error: `النموذج ${modelId} غير موجود` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build system prompts for each model
    const langSuffix = languageSuffixes[language] || languageSuffixes.ar;

    const modelStreams: ArenaModelStream[] = selectedModels.map((modelId) => {
      const modelConfig = getModelById(modelId)!;
      const systemPrompt = `${modelConfig.systemPrompt}\n\nأجب ${langSuffix}.`;

      return {
        modelId,
        modelName: modelConfig.name,
        stream: streamFromPollinations(modelId, systemPrompt, message),
      };
    });

    // ── Create combined SSE stream ──
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Track completion state for each model
        const doneState: Record<string, boolean> = {};
        let allDoneSent = false;
        for (const ms of modelStreams) {
          doneState[ms.modelId] = false;
        }

        // Send initial status event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'status', models: selectedModels.map(id => ({ id, name: getModelById(id)?.name || id })) })}\n\n`)
        );

        // Stream each model in parallel
        const streamPromises = modelStreams.map(async (ms) => {
          try {
            for await (const content of ms.stream) {
              if (doneState[ms.modelId]) break;
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ modelId: ms.modelId, content, done: false })}\n\n`)
                );
              } catch {
                // Controller already closed — stop streaming
                break;
              }
            }
          } catch (error) {
            console.error(`[Arena] Stream error for model ${ms.modelId}:`, error);
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ modelId: ms.modelId, content: '\n\n[حدث خطأ أثناء البث]', done: false })}\n\n`)
              );
            } catch { /* controller closed */ }
          } finally {
            doneState[ms.modelId] = true;
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ modelId: ms.modelId, content: '', done: true })}\n\n`)
              );
            } catch { /* controller closed */ }

            // Check if all models are done — only send all_done once
            if (!allDoneSent && Object.values(doneState).every(Boolean)) {
              allDoneSent = true;
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'all_done' })}\n\n`)
                );
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } catch { /* controller closed */ }
              try { controller.close(); } catch { /* already closed */ }
            }
          }
        });

        // Wait for all streams to complete
        await Promise.all(streamPromises);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Arena] Error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ داخلي في الخادم' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
