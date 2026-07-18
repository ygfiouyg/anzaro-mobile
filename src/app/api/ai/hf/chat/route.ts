// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Chat Completions API
// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/hf/chat
// Supports both streaming (SSE) and non-streaming chat completions
// using the HuggingFace Serverless Inference API with 190+ models.
//
// Auth is optional — guest access is allowed, but auth is required
// for saving conversations to the database.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import {
  streamHFChatCompletion,
  generateHFChatCompletion,
  chatWithFallback,
  getChatModelById,
  getAllChatModelIds,
  HF_CHAT_CATEGORIES,
  getModelsByCategory,
  HF_DEFAULT_CHAT_MODEL,
  type HFChatMessage,
  type HFChatCategory,
} from '@/lib/hf-chat.service';
import { getHFLoadBalancer } from '@/lib/hf-load-balancer';
import { fetchDriveContentForMessage, buildDriveContextPrompt } from '@/lib/drive-rag';
import { isModelDisabled } from '@/lib/disabled-models';

/** Request body schema */
interface ChatRequestBody {
  messages: HFChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  fallbackModels?: string[];
  category?: string;
}

export async function POST(request: NextRequest) {
  try {
    // ─── Parse Request Body ───────────────────────────────────────
    let body: ChatRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'طلب غير صالح. يرجى التحقق من تنسيق البيانات.' },
        { status: 400 }
      );
    }

    const {
      messages,
      model,
      temperature,
      max_tokens,
      stream = false,
      fallbackModels,
      category,
    } = body;

    // ─── Validate Messages ────────────────────────────────────────
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'الرسائل مطلوبة ويجب أن تكون مصفوفة غير فارغة.' },
        { status: 400 }
      );
    }

    // Validate each message has required fields
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return NextResponse.json(
          { error: 'كل رسالة يجب أن تحتوي على دور (role) ومحتوى (content).' },
          { status: 400 }
        );
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        return NextResponse.json(
          { error: `دور غير صالح: "${msg.role}". الأدوار المسموحة: system, user, assistant.` },
          { status: 400 }
        );
      }
    }

    // ─── Optional Auth (guest access allowed) ─────────────────────
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    // ─── Resolve Model ────────────────────────────────────────────
    let resolvedModel = model || HF_DEFAULT_CHAT_MODEL;
    let modelEntry = getChatModelById(resolvedModel);

    // Check if the requested model is disabled by admin
    if (resolvedModel && await isModelDisabled(resolvedModel)) {
      return NextResponse.json(
        { error: `النموذج "${resolvedModel}" معطل من قبل الآدمن` },
        { status: 403 }
      );
    }

    // If category is specified and model is not, pick best from category
    if (!model && category) {
      const validCategories = HF_CHAT_CATEGORIES as readonly string[];
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: `فئة غير صالحة: "${category}". الفئات المتاحة: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }

      // Get models from the requested category
      const categoryModels = getModelsByCategory(category as HFChatCategory);
      if (categoryModels.length > 0) {
        // Use load balancer to pick the best available model from this category
        const lb = getHFLoadBalancer();
        const modelIds = categoryModels.map((m) => m.id);
        const selection = lb.selectBestModel(modelIds);
        if (selection) {
          resolvedModel = selection.modelId;
        } else {
          // Fallback to first model in category
          resolvedModel = categoryModels[0].id;
        }
      }
    }

    // Validate the resolved model exists
    if (!getChatModelById(resolvedModel)) {
      return NextResponse.json(
        { error: `النموذج "${resolvedModel}" غير موجود. استخدم /api/ai/hf/models لعرض النماذج المتاحة.` },
        { status: 400 }
      );
    }

    // ─── Drive RAG: Detect file references and inject context ────
    try {
      const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
      if (lastUserMessage?.content) {
        const driveContext = await fetchDriveContentForMessage(lastUserMessage.content);
        if (driveContext && driveContext.hasContent) {
          const drivePrompt = buildDriveContextPrompt(driveContext);
          // Inject Drive context into the system message
          const systemMsg = messages.find((m) => m.role === 'system');
          if (systemMsg) {
            systemMsg.content += drivePrompt;
          } else {
            messages.unshift({ role: 'system', content: `أنت مساعد ذكي من DeltaAI (بعقل هادي). أجب بالعربية إذا سأل المستخدم بالعربية.${drivePrompt}` });
          }
          console.log('[HF-Chat] Drive RAG context injected into system prompt');
        }
      }
    } catch (driveError) {
      // Drive RAG is optional — don't fail the chat if it errors
      console.warn('[HF-Chat] Drive RAG failed (non-fatal):', driveError instanceof Error ? driveError.message : String(driveError));
    }

    // ─── Build Fallback Model List ────────────────────────────────
    let fallbackList: string[] | undefined;

    if (fallbackModels && Array.isArray(fallbackModels) && fallbackModels.length > 0) {
      // Validate fallback model IDs
      const validFallbacks = fallbackModels.filter((id) => getChatModelById(id) !== undefined);
      if (validFallbacks.length > 0) {
        fallbackList = validFallbacks;
      }
    }

    // If category is specified, add same-category models as fallback
    if (category && !fallbackList) {
      const categoryModels = getModelsByCategory(category as HFChatCategory)
        .map((m) => m.id)
        .filter((id) => id !== resolvedModel);
      if (categoryModels.length > 0) {
        fallbackList = categoryModels.slice(0, 5); // Limit to 5 fallback models
      }
    }

    // ─── Streaming Response ───────────────────────────────────────
    if (stream) {
      return handleStreamingChat(
        messages,
        resolvedModel,
        { temperature, max_tokens },
        fallbackList,
        user
      );
    }

    // ─── Non-Streaming Response ───────────────────────────────────
    return handleNonStreamingChat(
      messages,
      resolvedModel,
      { temperature, max_tokens },
      fallbackList,
      user
    );
  } catch (error) {
    console.error('[HF-Chat] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة طلب المحادثة. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Streaming Handler — returns SSE (Server-Sent Events)
// ═══════════════════════════════════════════════════════════════════════

async function handleStreamingChat(
  messages: HFChatMessage[],
  model: string,
  options: { temperature?: number; max_tokens?: number },
  fallbackModels?: string[],
  _user?: Awaited<ReturnType<typeof getUserFromToken>> | null
): Promise<Response> {
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Try with fallback chain if fallback models are provided ──
        if (fallbackModels && fallbackModels.length > 0) {
          const modelsToTry = [model, ...fallbackModels];
          let succeeded = false;

          for (const tryModel of modelsToTry) {
            if (streamClosed || succeeded) break;

            try {
              const chatStream = streamHFChatCompletion(
                messages,
                tryModel,
                {
                  temperature: options.temperature ?? 0.7,
                  max_tokens: options.max_tokens ?? 2048,
                  stream: true,
                }
              );

              for await (const chunk of chatStream) {
                if (streamClosed) break;

                // streamHFChatCompletion yields plain strings
                let content: string;
                if (typeof chunk === 'string') {
                  content = chunk;
                } else {
                  const choices = (chunk as Record<string, unknown>)?.choices;
                  const deltaContent = Array.isArray(choices) && choices[0]?.delta?.content;
                  content = typeof deltaContent === 'string' ? deltaContent : String(chunk);
                }
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              }

              succeeded = true;

              // Send model used info before done
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ modelUsed: tryModel, wasFallback: tryModel !== model })}\n\n`
                )
              );
            } catch (modelError) {
              console.warn(
                `[HF-Chat] Model ${tryModel} failed in stream, trying next: ${
                  modelError instanceof Error ? modelError.message.slice(0, 100) : 'خطأ'
                }`
              );
              // Send error info but continue to next model
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    fallback: { from: tryModel, reason: 'فشل النموذج، جاري التجربة مع نموذج بديل' },
                  })}\n\n`
                )
              );
              continue;
            }
          }

          if (!succeeded && !streamClosed) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: 'فشلت جميع النماذج المتاحة. يرجى المحاولة مرة أخرى.' })}\n\n`
              )
            );
          }
        } else {
          // ── Single model streaming (no fallback) ──
          try {
            const chatStream = streamHFChatCompletion(
              messages,
              model,
              {
                temperature: options.temperature ?? 0.7,
                max_tokens: options.max_tokens ?? 2048,
                stream: true,
              }
            );

            for await (const chunk of chatStream) {
              if (streamClosed) break;

              // streamHFChatCompletion yields plain strings
              const content = typeof chunk === 'string' ? chunk : String(chunk);
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            }
          } catch (streamError) {
            console.error('[HF-Chat] Stream error:', streamError);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: 'حدث خطأ أثناء البث. يرجى المحاولة مرة أخرى.',
                })}\n\n`
              )
            );
          }
        }

        // ── Send done signal ──
        if (!streamClosed) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
        controller.close();
      } catch (outerError) {
        console.error('[HF-Chat] Stream outer error:', outerError);
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'حدث خطأ غير متوقع في البث.' })}\n\n`
            )
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // Controller already closed
        }
      }
    },
    cancel() {
      streamClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Non-Streaming Handler — returns JSON
// ═══════════════════════════════════════════════════════════════════════

async function handleNonStreamingChat(
  messages: HFChatMessage[],
  model: string,
  options: { temperature?: number; max_tokens?: number },
  fallbackModels?: string[],
  _user?: Awaited<ReturnType<typeof getUserFromToken>> | null
): Promise<NextResponse> {
  try {
    // ── Use chatWithFallback for automatic model fallback ──
    const result = await chatWithFallback(messages, fallbackModels, {
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2048,
    });

    return NextResponse.json({
      content: result.content,
      modelUsed: result.modelUsed,
      wasFallback: result.wasFallback,
      attempts: result.attempts,
      responseTimeMs: result.responseTimeMs,
    });
  } catch (error) {
    console.error('[HF-Chat] Non-stream error:', error);

    return NextResponse.json(
      {
        error: 'فشل إنشاء الاستجابة من جميع النماذج المتاحة. يرجى المحاولة مرة أخرى.',
      },
      { status: 500 }
    );
  }
}
