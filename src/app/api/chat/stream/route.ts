import { NextRequest } from 'next/server';

// ─── Route Configuration ────────────────────────────────────────────
// maxDuration = 300s default, 600s (10 min) for high-memory models
// الموديلات اللي context window >= 500K بتحلل ملفات ضخمة → محتاجة وقت أطول
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

// NOTE: The old `export const config = { api: { bodyParser: { sizeLimit: '50mb' } } }`
// was a Pages Router concept and is ignored in App Router (caused a deprecation
// warning). In App Router, request body size is handled by the runtime — large
// bodies (PDF attachments) are read via request.json() which has no artificial cap.

import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { getModelById } from '@/lib/models';
import { recordApiResponseTime, recordError, registerConnection, unregisterConnection } from '@/lib/system-monitor';
import { CHAT_MODEL_MAP, streamChatCompletion } from '@/lib/pollinations';
import type { PollinationsChatMessage } from '@/lib/pollinations';
import { getHFChatModelMapping, streamHFChat } from '@/lib/huggingface';
import { streamHFChatCompletion, chatWithFallback, getChatModelById, HF_API_TOKEN } from '@/lib/hf-chat.service';
import { streamGeminiChat, getGeminiChatModelMapping, GEMINI_API_KEY } from '@/lib/gemini';
import { streamOpenRouterChat, getOpenRouterChatModelMapping, OPENROUTER_API_KEY } from '@/lib/openrouter';
import { generateQuiz, extractTopicFromMessage, buildConversationContext } from '@/lib/quiz-service';
import { streamGroqChat, getGroqChatModelMapping, GROQ_API_KEY } from '@/lib/groq';
import { streamCloudflareChat, getCloudflareChatModelMapping, isCloudflareChatModel, CF_API_TOKEN } from '@/lib/cloudflare-ai';
import { streamGitHubChat, getGitHubChatModelMapping, GITHUB_API_KEY } from '@/lib/github-models';
import { streamCerebrasChat, getCerebrasChatModelMapping, CEREBRAS_API_KEY } from '@/lib/cerebras';
import { streamOpenAIChat, getOpenAIChatModelMapping, isOpenAIChatModel, OPENAI_API_KEY } from '@/lib/openai';
import { classifyContentQuality } from '@/lib/drive-rag';
import { processRAGQuery, uploadAndIndexLectures, hasLectureContext, getLecturesSummary, shouldUseRAG } from '@/lib/rag/rag-engine';
import { shouldInjectContentStrategy } from '@/lib/content-strategy-prompt';
import { isFileGenerationIntent, isQuizIntent, getZAIClient } from '@/lib/chat-utils';
import { extractMemories } from '@/lib/user-memory.service';
import { extractTextFromPdfBase64, extractPdfWithVlmAndText, extractTextFromDocxBase64 } from '@/lib/pdf-text-extractor';
import { preprocessMediaAttachments, type ParsedMediaAttachment } from '@/lib/media-preprocessor';
import { reportSuccess as reportAggregatorSuccess, reportFailure as reportAggregatorFailure } from '@/lib/api-aggregator/reporter';
import { resolveHFModelId } from '@/lib/hf-model-resolve';
import { isModelDisabled } from '@/lib/disabled-models';

// ─── Extracted utilities from @/lib/chat/ ─────────────────────────────
import { isProviderHealthy, markProviderFailed } from '@/lib/chat/provider-health';
import { parseFileAttachments, type ParsedAttachment } from '@/lib/chat/attachment-parser';
import { detectInlineMediaGenIntent } from '@/lib/chat/media-intent';
import { containsHtmlTags, stripHtmlToMarkdown, stripHtmlChunk, markdownToSimpleHTML } from '@/lib/chat/html-sanitizer';
import { FALLBACK_RESPONSE, buildSystemPrompt } from '@/lib/chat/system-prompt-builder';
import { classifyDocIntent, hasDocIntent, type DocIntent, type DocIntentType } from '@/lib/chat/doc-intent-classifier';
import { processSmartDocV2, type SmartDocV2Input } from '@/lib/chat/smart-doc-v2';

/**
 * Build the messages array for the LLM, handling multimodal content for images.
 */
async function buildLLMMessages(
  systemPrompt: string,
  conversationMessages: { role: string; content: string }[],
  userMessage: string,
  parsed: { cleanedMessage: string; attachments: ParsedAttachment[]; hasAttachments: boolean },
  glmModel: string,
  modelConfig: { provider: string; capabilities: { vision: boolean } }
): Promise<Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>> {
  const isVisionModel = glmModel === 'glm-4v-flash' || glmModel === 'glm-4v' || glmModel === 'glm-4-flash' || (modelConfig.provider === 'gemini' && modelConfig.capabilities.vision) || (modelConfig.provider === 'zhipuai' && modelConfig.capabilities.vision);
  const imageAttachments = parsed.attachments.filter((a) => a.type === 'image');
  const pdfAttachments = parsed.attachments.filter((a) => a.type === 'pdf');
  const docxAttachments = parsed.attachments.filter((a) => a.type === 'docx');

  // Build the user message content
  let finalUserMessage = parsed.cleanedMessage;

  // For PDFs, extract text and append it
  if (pdfAttachments.length > 0) {
    const pdfTexts = await Promise.all(
      pdfAttachments.map(async (pdf) => {
        const extractedText = await extractPdfWithVlmAndText(pdf.content!, pdf.name);
        const contentQuality = classifyContentQuality(extractedText);
        if (contentQuality === 'failed') {
          return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n⚠️ ${extractedText}\n⚠️ مهم: لا تخترع أي محتوى عن هذا الملف — لم يتم قراءته بنجاح. أخبر المستخدم بذلك بصراحة.`;
        }
        if (contentQuality === 'partial') {
          // Extract usable content after the failure marker
          const firstBracketEnd = extractedText.indexOf(']\n');
          const usableText = firstBracketEnd > 0 ? extractedText.slice(firstBracketEnd + 2).trim() : extractedText;
          return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n⚠️ محتوى جزئي — بعض الصفحات لم يتم قراءتها بشكل صحيح\n--- محتوى PDF ---\n${usableText}\n--- نهاية المحتوى ---`;
        }
        return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n--- محتوى PDF ---\n${extractedText}\n--- نهاية المحتوى ---`;
      })
    );
    finalUserMessage = pdfTexts.join('\n\n') + (finalUserMessage ? '\n\n' + finalUserMessage : '');
  }

  // For DOCX (Word) files, extract text via mammoth and append it
  if (docxAttachments.length > 0) {
    const docxTexts = await Promise.all(
      docxAttachments.map(async (docx) => {
        try {
          const extractedText = await extractTextFromDocxBase64(docx.content!, 100 * 1024);
          if (!extractedText || extractedText.length < 10) {
            return `📄 ملف Word مرفق: ${docx.name} (${docx.size})\n⚠️ لم يتم استخراج نص من الملف. أخبر المستخدم بذلك بصراحة.`;
          }
          return `📄 ملف Word مرفق: ${docx.name} (${docx.size})\n--- محتوى الملف ---\n${extractedText}\n--- نهاية المحتوى ---`;
        } catch (err) {
          return `📄 ملف Word مرفق: ${docx.name} (${docx.size})\n⚠️ خطأ في قراءة الملف: ${err instanceof Error ? err.message : String(err)}`;
        }
      })
    );
    finalUserMessage = docxTexts.join('\n\n') + (finalUserMessage ? '\n\n' + finalUserMessage : '');
  }

  // If we have images and a vision model, construct multimodal messages
  if (imageAttachments.length > 0 && isVisionModel) {
    // Build multimodal content array
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add text content first
    if (finalUserMessage) {
      contentParts.push({ type: 'text', text: finalUserMessage });
    }

    // Add each image
    for (const img of imageAttachments) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: img.content! },
      });
    }

    return [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
      { role: 'user', content: contentParts },
    ];
  }

  // For non-vision models with images, add a text description note
  if (imageAttachments.length > 0 && !isVisionModel) {
    // ── Media Preprocessor: Enhanced media analysis ──
    // If media preprocessing is available, use it for richer content analysis
    // This enables ALL models to understand images, videos, and audio
    // through preprocessing with vision/ASR services.
    try {
      const mediaAttachments: ParsedMediaAttachment[] = imageAttachments.map((img) => ({
        type: 'image' as const,
        name: img.name,
        size: img.size,
        content: img.content,
      }));
      const preprocessed = await preprocessMediaAttachments(
        mediaAttachments,
        finalUserMessage,
        false, // not a vision model
        'ar'
      );
      if (preprocessed.combinedText.trim()) {
        finalUserMessage = preprocessed.combinedText + (finalUserMessage ? '\n\n' + finalUserMessage : '');
      }
    } catch (mediaPreprocessErr) {
      // Fallback: tell the user to switch to a vision model
      console.warn('[Chat] Media preprocessor failed, using fallback note:', mediaPreprocessErr instanceof Error ? mediaPreprocessErr.message : String(mediaPreprocessErr));
      const imageNote = imageAttachments
        .map((img) => `📷 صورة مرفقة: ${img.name} (${img.size}) - تم إرفاق صورة لكن النموذج الحالي لا يدعم تحليل الصور. يرجى التبديل لنموذج Delta Vision لتحليل الصور.`)
        .join('\n');
      finalUserMessage = imageNote + (finalUserMessage ? '\n\n' + finalUserMessage : '');
    }
  }

  // Standard text-only messages
  return [
    { role: 'system', content: systemPrompt },
    ...conversationMessages,
    { role: 'user', content: finalUserMessage },
  ];
}



// ─── POST Handler ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Rate limiting for chat stream (most resource-intensive endpoint) ──
  const { checkRateLimit, RATE_LIMIT_PRESETS } = await import('@/lib/rate-limit');
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.ai);
  if (rateLimitResponse) return rateLimitResponse;

  let connectionId = '';
  try {
    const body = await request.json();
    const { message, model, language, conversationId, autoSearch, forceSearch, systemPromptMode } = body as {
      message: string;
      model: string;
      language: string;
      conversationId?: string;
      autoSearch?: boolean;
      forceSearch?: boolean;
      systemPromptMode?: 'full' | 'open';
    };

    // Validate required fields
    if (!message || !model) {
      return new Response(
        JSON.stringify({ error: 'الرسالة والنموذج مطلوبان' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── MCP Tools Integration ──
    // اكتشف نية المستخدم وشغّل أداة MCP لو محتاجة
    // قبل ما نبعت لـ GLM
    // CRITICAL: Skip MCP detection if message contains image/file attachments
    // because base64 data can contain substrings like "acp" that falsely match
    // MCP tool patterns (e.g., agent-acp), intercepting the message and preventing
    // the image from reaching the vision pipeline.
    const hasEmbeddedAttachments = message.includes('[DELTA_IMAGE:') || message.includes('[DELTA_PDF:') || message.includes('[DELTA_DOCX:');
    
    if (!hasEmbeddedAttachments) {
      try {
        const { detectAndRunMCP, detectAndRunVision } = await import('@/lib/ai-tools/mcp-chat-integration');
        const mcpResult = await detectAndRunMCP(message);

        if (mcpResult.matched && mcpResult.result) {
          console.log(`[Chat] MCP tool matched: ${mcpResult.tool}`);
          const mcpStream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: mcpResult.result })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
          return new Response(mcpStream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
          });
        }
      } catch (mcpError) {
        console.warn('[Chat] MCP detection failed:', mcpError);
      }
    }

    // ── Smart Ball Command Detection (Reversed Command Control) ──
    // لو المستخدم طلب تشغيل/إيقاف راديو، تحكم في جهاز، أو تفعيل مشهد مزاجي
    // نفّذ الأمر فوراً عبر control-engine وأرجع تأكيد
    if (!hasEmbeddedAttachments) {
      try {
        const { detectSmartBallCommand } = await import('@/lib/anzaro-smart-ball-detector');
        const ballCommand = await detectSmartBallCommand(message);
        if (ballCommand) {
          console.log(`[Chat] Smart Ball command detected: ${ballCommand.type}`);
          const ballStream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              // sink accepts either a string (text content) or an object (structured SSE event)
              const sink = (data: string | Record<string, unknown>) => {
                if (typeof data === 'string') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: data })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                }
              };
              try {
                await ballCommand.execute(sink);
              } catch (e: any) {
                sink(`\n\n❌ خطأ: ${e.message}`);
              } finally {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              }
            },
          });
          return new Response(ballStream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
          });
        }
      } catch (ballError) {
        console.warn('[Chat] Smart Ball detection failed:', ballError);
      }
    }

    // ── Intent Detection (Script Writer + Content Studio) ──
    // لو المستخدم طلب سكريبت أو حزمة محتوى، حوّل للأداة المناسبة
    try {
      const { detectIntent } = await import('@/lib/intent/router');
      const intent = detectIntent(message);
      if (intent.matched && intent.confidence === 'high') {
        console.log(`[Chat] Intent matched: ${intent.tool} — ${intent.contentType} — topic: ${intent.topic}`);

        const isContentStudio = intent.tool === 'content-studio';
        const moduleName = isContentStudio ? '@/lib/content-studio/engine' : '@/lib/scriptwriter/engine';
        const funcName = isContentStudio ? 'generateContentPackage' : 'generateScript';
        const importedModule: any = await import(moduleName);
        const generator = importedModule[funcName];

        const toolStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sink = (event: any) => {
              if (event.type === 'token') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: event.content })}\n\n`));
              } else if (event.type === 'done') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              } else if (event.type === 'error') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '\n\n❌ خطأ: ' + event.error })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
              // status/thinking/studio_done/script_done events silently dropped (HF stream format)
            };
            try {
              await generator({
                topic: intent.topic || message,
                contentType: intent.contentType || 'reel',
                language: 'ar',
              }, sink);
            } catch (e: any) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '\n\n❌ خطأ: ' + e.message })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(toolStream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
        });
      }
    } catch (intentError) {
      console.warn('[Chat] Intent detection failed:', intentError);
    }

    // ── Media Intent Detection (Radio / Spotify / YouTube / TTS) ──
    // CONTEXT-BASED detection: uses a fast LLM call to understand the user's
    // INTENT from natural Arabic phrasing — not keyword-regex matching.
    //
    // This handles phrases like:
    //   "شغللي آخر حاجة القناة دي نزلتها"  → youtube (no keyword "فيديو")
    //   "سمعني اللي كان طالع"              → youtube (context: was playing)
    //   "خليني أسمع حاجة هادية"             → radio (context: calm)
    //
    // Falls back to regex ONLY if the LLM call fails (network/timeout).
    //
    // CRITICAL: Skip media detection when the message contains embedded
    // attachments ([DELTA_PDF:], [DELTA_IMAGE:], [DELTA_DOCX:]).
    // The base64 payload of a PDF/image/docx is a long ASCII blob that
    // statistically contains substrings like "stop", "pause", "mute" —
    // which would falsely match the media STOP regex and return
    // "تمام، اتقفل 🔇" instead of processing the attachment.
    // (This mirrors the hasEmbeddedAttachments guard used for MCP + Smart Ball.)
    if (!hasEmbeddedAttachments) {
     try {
      const { detectMediaIntentLLM, detectMediaIntentRegex } = await import('@/lib/ai-tools/media-intent-llm');

      // Try LLM-based detection first (context-aware)
      let intent = await detectMediaIntentLLM(message);

      // Fallback to regex if LLM failed
      if (!intent.wantsMedia && !intent.source) {
        const fallback = detectMediaIntentRegex(message);
        if (fallback.wantsMedia) {
          console.log('[Chat] LLM detection failed, regex fallback triggered');
          intent = fallback;
        }
      }

      // ── V.15: STOP media intent — send stopMedia SSE event ──
      if (intent.wantsMedia && intent.action === 'stop') {
        console.log('[Chat] Media STOP intent detected');
        const stopStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: 'تمام، اتقفل 🔇' })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stopMedia: true })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stopStream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
        });
      }

      if (intent.wantsMedia && intent.source && intent.source !== 'tts') {
        console.log(`[Chat] Media intent (LLM): source=${intent.source}, query="${(intent.query || message).slice(0, 60)}", confidence=${intent.confidence || 0}`);

        // Call play-media API internally
        const mediaResponse = await fetch('http://localhost:3000/api/ai/play-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: intent.query || message, source: intent.source }),
          signal: AbortSignal.timeout(15_000),
        });

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          if (mediaData.mediaWidget) {
            console.log(`[Chat] Media widget ready: source=${mediaData.mediaWidget.source}, title="${mediaData.mediaWidget.title}"`);

            // Return SSE stream with text + mediaWidget
            const mediaStream = new ReadableStream({
              async start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: mediaData.content })}\n\n`));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mediaWidget: mediaData.mediaWidget })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              },
            });

            return new Response(mediaStream, {
              headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
            });
          }
        }
      }
    } catch (mediaError) {
      console.warn('[Chat] Media detection failed:', mediaError);
    }
    } // end if (!hasEmbeddedAttachments)

    // ── HuggingFace Chat Model Bridge ──
    let modelConfig = getModelById(model);
    let isHFDirectModel = false;
    let hfDirectModelId: string | null = null;

    if (!modelConfig && model?.startsWith('hf-chat:')) {
      hfDirectModelId = model.slice(8); // Strip 'hf-chat:' prefix

      // Check if model is disabled by admin
      if (await isModelDisabled(hfDirectModelId)) {
        return new Response(
          JSON.stringify({ error: `النموذج "${hfDirectModelId}" معطل من قبل الآدمن` }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const hfEntry = getChatModelById(hfDirectModelId);
      if (hfEntry) {
        // Create a synthetic modelConfig for the HF model
        modelConfig = {
          id: model,
          name: hfEntry.name || hfDirectModelId,
          nameEn: hfEntry.shortName || hfDirectModelId,
          icon: '🤗',
          category: 'hf-chat' as any,
          glmModel: 'glm-4-flash',
          provider: 'huggingface',
          realChatModel: hfDirectModelId,
          realImageModel: '',
          realVideoModel: '',
          rank: 'standard',
          description: hfEntry.name || hfDirectModelId,
          descriptionEn: hfEntry.shortName || hfDirectModelId,
          systemPrompt: '',
          hfChatModel: hfDirectModelId,
          supportsPdf: false,
          openSource: true,
          skills: [],
          capabilities: {
            chat: true, vision: false, imageGeneration: false, videoGeneration: false,
            codeGeneration: true, pdfAnalysis: false, webSearch: false, audioTTS: false,
            functionCalling: false, reasoning: false, rag: false, largeContext: false,
            translation: true, summarization: true, maxContextTokens: 8192,
            inputModalities: ['text'], outputModalities: ['text'],
          },
        };
        isHFDirectModel = true;
        console.log(`[Chat] HF direct model detected: ${hfDirectModelId} — routing to HuggingFace chat service`);
      }
    }

    // ── Custom Model Bridge (from Aggregator) ──
    // When user selects custom:chat:ID, fetch the custom model config from DB
    let customModelConfig: {
      baseUrl: string;
      apiKey: string | null;
      authType: string;
      authHeader: string | null;
      apiFormat: string;
      modelId: string | null;
    } | null = null;

    if (!modelConfig && model?.startsWith('custom:chat:')) {
      const customModelId = model.split(':').slice(2).join(':');
      try {
        const customModel = await db.customModel.findUnique({ where: { id: customModelId } });
        if (customModel && customModel.isActive) {
          // Resolve short HF model IDs to full paths
          const resolvedModelId = resolveHFModelId(customModel.modelId) || customModel.modelId || customModel.nameEn;

          // خمن الـ maxTokens لو مش متاح في الـ DB
          const { estimateMaxTokens } = await import('@/lib/hf-chat.service');
          const customMaxTokens = (customModel as any).maxTokens || estimateMaxTokens(resolvedModelId);

          modelConfig = {
            id: model,
            name: customModel.name,
            nameEn: customModel.nameEn,
            icon: customModel.icon || '⚡',
            category: 'hf-chat' as any,
            glmModel: 'glm-4-flash',
            provider: (customModel.provider || 'huggingface') as any,
            realChatModel: resolvedModelId,
            realImageModel: '',
            realVideoModel: '',
            rank: 'standard',
            description: customModel.description || customModel.name,
            descriptionEn: customModel.descriptionEn || customModel.nameEn,
            systemPrompt: `أنت ${customModel.name} — مساعد ذكي على منصة Anzaro AI.\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.`,
            supportsPdf: false,
            openSource: true,
            maxTokens: customMaxTokens,
            skills: [],
            capabilities: {
              chat: true, vision: false, imageGeneration: false, videoGeneration: false,
              codeGeneration: true, pdfAnalysis: false, webSearch: false, audioTTS: false,
              functionCalling: false, reasoning: false, rag: false, largeContext: customMaxTokens >= 100000,
              translation: true, summarization: true, maxContextTokens: customMaxTokens,
              inputModalities: ['text'], outputModalities: ['text'],
            },
          };
          isHFDirectModel = true;
          hfDirectModelId = resolvedModelId;
          customModelConfig = {
            baseUrl: customModel.baseUrl,
            apiKey: customModel.apiKey,
            authType: customModel.authType,
            authHeader: customModel.authHeader,
            apiFormat: customModel.apiFormat,
            modelId: resolvedModelId,
          };
          console.log(`[Chat] Custom model detected: ${customModel.name} (${customModel.provider}) modelId=${resolvedModelId} — routing via custom endpoint`);
        }
      } catch (err) {
        console.warn('[Chat] Failed to load custom model:', err);
      }
    }

    // ── Reject image/video-only models in chat context ──
    // These models are for media generation, not chat
    if (!modelConfig && (model?.startsWith('hf-image:') || model?.startsWith('hf-video:') || model?.startsWith('custom:image:') || model?.startsWith('custom:video:'))) {
      const isImage = model.includes('image');
      const categoryLabel = isImage ? 'توليد الصور' : 'توليد الفيديو';
      return new Response(
        JSON.stringify({ error: `هذا النموذج مخصص لـ${categoryLabel} وليس للشات. اختر نموذج شات من القائمة.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!modelConfig) {
      return new Response(
        JSON.stringify({ error: 'النموذج غير موجود' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse file attachments from the message
    const parsed = parseFileAttachments(message);

    // ── Vision Tools Integration ──
    // لو فيه صور مرفقة، شغّل أداة vision قبل GLM
    const imageAttachments = parsed.attachments.filter((a) => a.type === 'image');
    if (imageAttachments.length > 0) {
      try {
        const { detectAndRunVision } = await import('@/lib/ai-tools/mcp-chat-integration');
        // خد أول صورة
        const firstImage = imageAttachments[0];
        const imageBase64 = firstImage.content?.startsWith('data:') ? firstImage.content : `data:image/png;base64,${firstImage.content}`;
        const visionResult = await detectAndRunVision(parsed.cleanedMessage || 'حلل الصورة دي', imageBase64);

        if (visionResult.matched && visionResult.result) {
          console.log(`[Chat] Vision tool matched: ${visionResult.tool}`);
          const visionStream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: visionResult.result })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
          return new Response(visionStream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
          });
        }
      } catch (visionError) {
        console.warn('[Chat] Vision detection failed:', visionError);
      }
    }

    // Optional auth — guest mode if no token
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    // ── Max tokens cap REMOVED per user request ──
    // Previously: PLATFORM_MAX_TOKENS + userMaxTokens capped responses at 60K,
    // causing harmful truncation. Now we do NOT pass max_tokens to providers
    // at all — each provider uses its own default maximum, so responses are
    // never artificially cut off. The DB maxTokens field is retained for
    // backward compatibility but no longer enforced.

    // ── Guest mode: rate limiting مرفوع (عبس طلب كده) ──
    if (!user) {
      const { checkRateLimit } = await import('@/lib/rate-limit');
      const guestLimit = checkRateLimit(request, { maxRequests: 100, windowMs: 60 * 1000, keyPrefix: 'chat-guest' });
      if (guestLimit) return guestLimit;
    }

    // ── Enhanced Document Intent Detection (FAST — regex only, no LLM) ──
    // Runs BEFORE system prompt build so we can pass docIntent to the builder,
    // which uses it to decide whether to inject CONTENT_STRATEGY_PROMPT or
    // the MARKDOWN-ONLY rule.
    //
    // SMART ROUTING: We now classify with hasAttachments=true more liberally.
    // When the user's message IMPLIES file generation (e.g., "لخص القوانين",
    // "اجمع المحاضرات"), we treat it as if there are attachments because
    // the structured output naturally maps to a file/document.
    // The classifyDocIntent function internally checks both explicit and
    // implicit file generation patterns.
    const docIntent = classifyDocIntent(message, parsed.hasAttachments || isFileGenerationIntent(message));
    const hasEnhancedDocIntent = docIntent !== null && docIntent.type !== 'chat-only' && docIntent.type !== 'quiz';

    // ── Build system prompt using extracted module ──
    // All system prompt construction (language, capabilities, time context,
    // content strategy, design prefs, attachments, emotion, memory, Drive, web search)
    // is now encapsulated in buildSystemPrompt() for maintainability.
    const promptResult = await buildSystemPrompt({
      model,
      modelConfig,
      language,
      systemPromptMode,
      message,
      parsed,
      user,
      autoSearch,
      forceSearch,
      docIntent,
    });
    let systemPrompt = promptResult.systemPrompt;
    const emotion = promptResult.emotion;
    const isOpenMode = promptResult.isOpenMode;
    const searchResults = promptResult.searchResults;
    const searchPerformed = promptResult.searchPerformed;

    // ── Personality Profile Injection (Smart Ball Adaptive Mirroring) ──
    // V.16: Full personality integration — uses buildPersonalitySystemPrompt()
    // so ALL 7 traits + drivers + preferences + triggers + persona tone guide
    // are injected. The AI adapts dialect, tone, and approach per user.
    if (user?.id) {
      try {
        const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } });
        if (profile) {
          // Parse the JSON arrays stored during onboarding
          let drivers: string[] = [];
          let preferences: string[] = [];
          let triggers: string[] = [];
          try { drivers = JSON.parse(profile.driversJson || '[]'); } catch {}
          try { preferences = JSON.parse(profile.preferencesJson || '[]'); } catch {}
          try { triggers = JSON.parse(profile.triggersJson || '[]'); } catch {}

          const { buildPersonalitySystemPrompt } = await import('@/lib/anzaro-llm');
          const personalityPrompt = buildPersonalitySystemPrompt({
            name: profile.name,
            personaType: profile.personaType,
            dialect: profile.dialect,
            traits: {
              leadership: profile.leadership,
              stubbornness: profile.stubbornness,
              analytical: profile.analytical,
              emotional: profile.emotional,
              sociability: profile.sociability,
              discipline: profile.discipline,
              humor: profile.humor,
            },
            drivers,
            preferences,
            triggers,
            markdown: profile.markdown,
          });
          // Prepend personality prompt so it shapes the AI's tone from the start
          systemPrompt = personalityPrompt + '\n\n' + systemPrompt;

          // Increment interaction count (Phase 7.1 — adaptive memory)
          await db.personalityProfile.update({
            where: { userId: user.id },
            data: { interactionCount: { increment: 1 } },
          }).catch(() => {});
          console.log(`[Chat] Personality profile injected: persona=${profile.personaType}, dialect=${profile.dialect}, interaction #${profile.interactionCount + 1}`);
        }
      } catch (profileError) {
        console.warn('[Chat] Personality profile injection failed:', profileError);
      }
    }

    // ── RAG Context Injection ──
    // If the conversation has uploaded lectures, search them for relevant context
    // and inject it into the system prompt. This enables the AI to answer questions
    // about the 12 lectures without losing or forgetting any content.
    let ragContextUsed = false;
    if (conversationId) {
      try {
        const ragResult = await processRAGQuery(
          conversationId,
          message,
          (language as 'ar' | 'en') || 'ar',
          8 // top 8 most relevant chunks
        );
        if (ragResult.usedRAG && ragResult.context) {
          systemPrompt += ragResult.context;
          ragContextUsed = true;
          console.log(`[Chat] RAG context injected: ${ragResult.results.length} chunks, ${ragResult.context.length} chars`);
        } else if (hasLectureContext(conversationId)) {
          // Lectures exist but no specific RAG match — still inject summary
          const summary = getLecturesSummary(conversationId, (language as 'ar' | 'en') || 'ar');
          systemPrompt += summary;
          console.log(`[Chat] RAG summary injected (no specific match)`);
        }
      } catch (ragError) {
        console.warn('[Chat] RAG query failed (non-critical):', ragError instanceof Error ? ragError.message : String(ragError));
      }
    }

    // ── Ensure we have a valid DB conversation (READ only — writes are deferred) ──
    // We read conversation history from DB here to build the context for the LLM.
    // The actual DB writes (conversation create + user message save) are deferred
    // to AFTER the stream starts, so the first token arrives faster.
    let dbConversationId: string | null = null;
    let conversationMessages: { role: string; content: string }[] = [];

    if (conversationId && user) {
      try {
        const existingConv = await db.conversation.findUnique({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        });

        if (existingConv && existingConv.userId === user.id) {
          dbConversationId = existingConv.id;
          const allMessages = existingConv.messages
            .filter((m) => m.role !== 'system')
            .map((m) => {
              let content = m.content;
              content = content.replace(/\[📷 صورة: [^\]]+\]/g, '[صورة مرفقة]');
              content = content.replace(/\[📄 PDF: [^\]]+\]/g, '[ملف PDF مرفق]');
              content = content.replace(/\[DELTA_IMAGE:data:image\/[^;\]]+;base64,[^\]]+\]/g, '[صورة]');
              content = content.replace(/\[DELTA_PDF:data:application\/pdf;base64,[^\]]+\]/g, '[ملف PDF]');
              return { role: m.role, content };
            });

          // ── Conversation memory: send enough context so the model REMEMBERS ──
          // Previous limit was 12 messages + 2000-char truncation → model forgot
          // earlier context. Now we send the last 30 messages with smart truncation:
          // - Recent messages (last 10): full content (no truncation)
          // - Older messages (11-30): truncated to 4000 chars to save tokens
          // This keeps the full flow of recent conversation while preserving
          // enough history for the model to understand the topic.
          const recentCount = 10;
          const totalHistory = 30;
          const recent = allMessages.slice(-recentCount);
          const older = allMessages.slice(-totalHistory, -recentCount);

          conversationMessages = [
            ...older.map(m => ({
              role: m.role,
              content: m.content.length > 4000 ? m.content.slice(0, 4000) + '...' : m.content,
            })),
            ...recent.map(m => ({
              role: m.role,
              content: m.content, // No truncation for recent messages
            })),
          ];
        } else {
          console.warn(`[Chat] Conversation ${conversationId} not found or not owned by user ${user.id}. Creating new conversation.`);
        }
      } catch (convError) {
        console.error('[Chat] Error loading conversation (will create new one inline):', convError);
      }
    }

    // ── Inline Media Generation Detection ──
    // If user wants to generate an image/video, we'll generate it in parallel
    // with the text response and include it in the stream
    const mediaGenIntent = detectInlineMediaGenIntent(parsed.cleanedMessage || message);
    const shouldGenerateImage = mediaGenIntent?.type === 'image';
    const shouldGenerateVideo = mediaGenIntent?.type === 'video';

    // ── File Generation Intent Detection ──
    // In open mode, we also detect HTML output as a file generation intent
    const fileGenIntent = isFileGenerationIntent(message);
    // Will be updated during streaming if open mode detects HTML output
    let fileGenIntentOpen = fileGenIntent;

    if (hasEnhancedDocIntent) {
      console.log(`[Chat] Enhanced Doc Intent detected — intent=${docIntent!.type}, topic=${docIntent!.topic || 'none'}, files=${parsed.attachments.length}, request="${message.slice(0, 80)}"`);
    }

    if (mediaGenIntent) {
      console.log(`[Chat] Inline media gen detected: type=${mediaGenIntent.type}, prompt="${mediaGenIntent.prompt.slice(0, 60)}"`);
    }

    // Modify system prompt for image generation requests
    if (shouldGenerateImage) {
      systemPrompt += '\n\n🎨 المستخدم طلب توليد صورة. صف الصورة المولدة بإيجاز ثم أخبره أن الصورة تظهر أدناه. لا تقل "لا أستطيع توليد صور" — الصورة يتم توليدها بالفعل!';
    }
    if (shouldGenerateVideo) {
      systemPrompt += '\n\n🎬 المستخدم طلب توليد فيديو. صف الفيديو المولد بإيجاز. لا تقل "لا أستطيع توليد فيديو" — الفيديو يتم توليده!';
    }

    // ── Quiz Intent Detection ──
    // When user asks for questions/quiz, auto-generate quiz
    // and emit a quizData event in the stream so the frontend opens the quiz dialog
    const hasQuizIntent = isQuizIntent(parsed.cleanedMessage || message);
    const hasPdfAttachments = parsed.attachments.some((a) => a.type === 'pdf');
    const hasTextAttachments = parsed.attachments.some((a) => a.type === 'text');
    const hasFileAttachments = hasPdfAttachments || hasTextAttachments;
    // Generate quiz when there are file attachments OR when quiz intent is very explicit
    // NOTE: Quiz generation is stateless (each request is independent). Race conditions
    // can only occur if the frontend sends duplicate requests for the same message.
    // Frontend should handle deduplication (e.g., disable button while generating).
    const shouldGenerateQuiz = hasQuizIntent;

    if (shouldGenerateQuiz) {
      console.log(`[Chat] Quiz intent detected — will auto-generate quiz (hasFiles=${hasFileAttachments})`);
      systemPrompt += hasFileAttachments
        ? '\n\n📝 المستخدم طلب أسئلة اختبار. أخبره بإيجاز أنك تعمل على إنشاء اختبار من الملفات المرفقة وسيظهر اختبار تلقائياً. لا تقل "لا أستطيع إنشاء أسئلة" — الأسئلة يتم توليدها بالفعل!'
        : '\n\n📝 المستخدم طلب أسئلة اختبار. أخبره بإيجاز أنك تعمل على إنشاء اختبار وسيظهر تلقائياً. لا تقل "لا أستطيع إنشاء أسئلة" — الأسئلة يتم توليدها بالفعل!';
    }

    // ── Auto-index uploaded PDFs into RAG store ──
    // When user attaches PDF/text files in chat, automatically index them
    // so future questions can use RAG retrieval instead of relying on
    // the conversation context window (which forgets old content).
    if (conversationId && hasFileAttachments && parsed.attachments.length > 0) {
      // Run indexing in background — don't block the chat response
      const ragFiles = parsed.attachments
        .filter((a) => a.type === 'pdf' || a.type === 'text')
        .map((a) => ({
          name: a.name,
          content: a.type === 'pdf' ? (a.content || '') : (a.textContent || a.content || ''),
          type: a.type as 'pdf' | 'text',
          size: parseInt(a.size) || 0,
        }));

      if (ragFiles.length > 0) {
        // Fire and forget — the user gets their chat response immediately,
        // and the RAG index builds in the background for future queries.
        (async () => {
          try {
            console.log(`[Chat] Auto-indexing ${ragFiles.length} file(s) for RAG...`);
            await uploadAndIndexLectures(conversationId, ragFiles);
            console.log(`[Chat] RAG auto-indexing complete for conversation ${conversationId}`);
          } catch (ragIndexErr) {
            console.warn('[Chat] RAG auto-indexing failed (non-critical):', ragIndexErr instanceof Error ? ragIndexErr.message : String(ragIndexErr));
          }
        })();
      }
    }

    // Build messages array for LLM with multimodal support
    // V.37 FIX: Skip buildLLMMessages when hasEnhancedDocIntent is true.
    // buildLLMMessages calls extractPdfWithVlmAndText() which takes 40-90s
    // for a 53-page PDF. During this time, NO HTTP response has started →
    // the HF proxy kills the connection after ~10s idle → timeout.
    // The Smart Doc V2 pipeline does its OWN text extraction, so we don't
    // need buildLLMMessages for that path.
    const messages = hasEnhancedDocIntent
      ? []  // Smart Doc pipeline handles extraction itself
      : await buildLLMMessages(
          systemPrompt,
          conversationMessages,
          message,
          parsed,
          modelConfig.glmModel,
          modelConfig
        );

    // Get GLM model
    const glmModel = modelConfig.glmModel;

    // ── DEFERRED: DB writes (conversation create + user message save) ──
    // These are now fired off as a background promise AFTER the stream starts,
    // so the LLM response begins streaming before the DB writes complete.
    // This saves 100-500ms on every message (the time it takes to write to DB).
    //
    // ── Create conversation in DB SYNCHRONOUSLY (before streaming starts) ──
    // This is critical: the X-Conversation-Id response header must contain the
    // real DB conversation ID so the client can send it back on the next message.
    // Previously this was deferred (async IIFE) → header was empty → client never
    // sent conversationId back → model had no conversation history → "forgot".
    const dbMessageContent = parsed.cleanedMessage || message;
    if (!dbConversationId && user) {
      try {
        const newConv = await db.conversation.create({
          data: {
            title: message.slice(0, 60) + (message.length > 60 ? '...' : ''),
            model,
            language: language || 'ar',
            userId: user.id,
          },
        });
        dbConversationId = newConv.id;
      } catch (createError) {
        console.error('[Chat] Error creating conversation:', createError);
      }
    }

    // Save user message to DB (can be deferred — doesn't affect the header)
    const deferredDbWrites = (async () => {
      if (dbConversationId && user) {
        try {
          await db.message.create({
            data: {
              content: dbMessageContent.length > 10000
                ? dbMessageContent.slice(0, 10000) + '...'
                : dbMessageContent,
              role: 'user',
              model,
              emotion,
              language: language || 'ar',
              conversationId: dbConversationId,
              userId: user.id,
            },
          });
        } catch (msgError: any) {
          if (msgError?.code === 'P2003') {
            console.warn('[Chat] FK constraint on user message save, creating new conversation');
            try {
              const newConv = await db.conversation.create({
                data: {
                  title: message.slice(0, 60) + (message.length > 60 ? '...' : ''),
                  model,
                  language: language || 'ar',
                  userId: user.id,
                },
              });
              dbConversationId = newConv.id;
              await db.message.create({
                data: {
                  content: dbMessageContent.length > 10000
                    ? dbMessageContent.slice(0, 10000) + '...'
                    : dbMessageContent,
                  role: 'user',
                  model,
                  emotion,
                  language: language || 'ar',
                  conversationId: dbConversationId,
                  userId: user.id,
                },
              });
            } catch (retryError) {
              console.error('[Chat] Retry user message save failed:', retryError);
            }
          } else {
            console.error('[Chat] Error saving user message:', msgError);
          }
        }
      }
    })();

    // ── FIX H5: Await deferred DB writes before Smart Doc pipeline ──
    // The Smart Doc pipeline needs dbConversationId to exist for saving assets.
    // Previously, the DB writes ran in the background and the conversation ID
    // might not exist yet when the pipeline tried to save the asset.
    // We still start the stream first for perceived responsiveness, but ensure
    // the DB is ready before any document generation.
    let deferredDbReady = false;
    deferredDbWrites
      .then(() => { deferredDbReady = true; })
      .catch(() => { deferredDbReady = true; }); // Don't block on error

    // ── Stream Response ──
    const encoder = new TextEncoder();
    let streamClosed = false;
    // PERF: Use array for O(1) append instead of O(n) string concatenation
    // String += creates new string every time → O(n²) for long responses
    const contentChunks: string[] = [];
    let accumulatedContent = ''; // Kept for compatibility, joined from chunks when needed
    const streamStartTime = Date.now();

    // ── Pollinations Ad Stripping ──────────────────────────────────────
    // The free Pollinations text API appends a promotional ad to responses:
    //   "Support Pollinations.AI:\n\n🌸 Ad 🌸\nPowered by Pollinations.AI..."
    // We detect the ad boundary and only stream the clean content to the user.
    // `displayedCleanLength` tracks how many chars of clean content we've sent.
    let displayedCleanLength = 0;
    let adBoundaryIndex = -1; // once set, content beyond this is suppressed
    const POLLINATIONS_AD_MARKERS = [
      'Support Pollinations.AI',
      '🌸 Ad 🌸',
      'Powered by Pollinations.AI',
      'Pollinations.AI free text APIs',
      'Support our mission to keep AI accessible',
    ];
    function findAdBoundary(text: string): number {
      // Return the char index where the ad begins, or -1 if not found.
      for (const marker of POLLINATIONS_AD_MARKERS) {
        const idx = text.indexOf(marker);
        if (idx !== -1) return idx;
      }
      return -1;
    }

    // PERF: Cache shouldInjectContentStrategy result — was being called 3 times per request
    const cachedContentStrategyNeeded = shouldInjectContentStrategy(message);

    // Register connection for system monitoring
    connectionId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      registerConnection(connectionId, '/api/chat/stream');
    } catch (monitorErr) {
      console.warn('[Chat] registerConnection failed (non-critical):', monitorErr instanceof Error ? monitorErr.message : String(monitorErr));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // ── Smart Document Pipeline Interception ──
          // When user uploads files + requests compilation/extraction,
          // use the smart pipeline instead of normal chat.
          // This replicates the AI assistant's thinking process:
          // Parse → Understand → Extract → Compile → Design → Render PDF
          if (hasEnhancedDocIntent) {
            // ── FIX H5: Ensure DB writes complete before Smart Doc pipeline ──
            // The pipeline needs dbConversationId to exist for asset creation.
            if (!deferredDbReady) {
              try { await deferredDbWrites; } catch { /* DB write errors logged inside */ }
              deferredDbReady = true;
            }
            console.log(`[Chat] Routing to Enhanced Smart Doc V2 — intent=${docIntent!.type}, topic=${docIntent!.topic || 'none'}`);
            try {
              // Prepare files for the pipeline
              const pipelineFiles = parsed.attachments
                .filter((a) => a.type === 'pdf' || a.type === 'text')
                .map((a) => ({
                  name: a.name,
                  content: a.content || a.textContent || '',
                  textContent: a.textContent,
                  type: a.type as 'pdf' | 'text',
                  size: a.size,
                }));

              if (pipelineFiles.length === 0) {
                // ═══════════════════════════════════════════════════════════════════
                // NO FILES ATTACHED but user explicitly requested a PDF/document!
                //
                // Check if the message itself contains lecture text (e.g., when
                // text was pre-extracted from PDFs and sent inline to avoid
                // crashing the server with large base64 payloads).
                // If the message has "=== <title> ===" sections, treat each
                // section as a virtual text attachment for Smart Doc V2.
                // ═══════════════════════════════════════════════════════════════════
                const messageHasSections = /===\s*.+?\s*===/.test(message);

                if (messageHasSections && message.length > 5000) {
                  // Parse the message into sections and create virtual text attachments
                  const sectionRegex = /===\s*(.+?)\s*===\n([\s\S]*?)(?=====\s*.+?\s*===|$)/g;
                  let match;
                  const virtualFiles: Array<{ name: string; content: string; textContent: string; type: 'text'; size: string }> = [];
                  while ((match = sectionRegex.exec(message)) !== null) {
                    const sectionTitle = match[1].trim();
                    const sectionContent = match[2].trim();
                    if (sectionContent.length > 50) {
                      virtualFiles.push({
                        name: `${sectionTitle}.txt`,
                        content: sectionContent,
                        textContent: sectionContent,
                        type: 'text',
                        size: `${sectionContent.length}`,
                      });
                    }
                  }

                  if (virtualFiles.length > 0) {
                    console.log(`[Chat] Smart Doc: Found ${virtualFiles.length} text sections in message — routing to Smart Doc V2 with virtual attachments`);
                    // Route to Smart Doc V2 with virtual text files
                    const intentLabel = 'تجميعة المحاضرات';
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'started', message: `🚀 جاري ${intentLabel}...\n📄 ${virtualFiles.length} محاضرات مرفقة\n⏱️ العملية بتاخد 1-3 دقايق...` })}\n\n`)
                    );

                    try {
                      const result = await processSmartDocV2({
                        message,
                        attachments: virtualFiles,
                        language: (language as 'ar' | 'en') || 'ar',
                        channelName: 'بعقل هادي',
                        userId: user?.id,
                        intent: docIntent!,
                      }, (stage, progress, msg, detail) => {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage, progress, message: msg, detail } })}\n\n`)
                        );
                      });

                      if (result.success) {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({
                            smartDocResult: {
                              success: true,
                              fileUrl: result.fileUrl,
                              fileName: result.fileName,
                              durationMs: result.durationMs,
                              docType: result.docType || 'pdf',
                            }
                          })}\n\n`)
                        );
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ content: `✅ تم ${intentLabel} بنجاح!\n\n📄 **${result.fileName}**\n⏱️ الوقت: ${Math.round((result.durationMs || 0) / 1000)} ثانية\n\n👉 [اضغط هنا لفتح المستند](${result.fileUrl})\n\nتم تحليل ${virtualFiles.length} محاضرات وإنشاء المستند 🎨` })}\n\n`)
                        );
                      } else {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'failed', message: result.error || 'فشل في إنشاء المستند' })}\n\n`)
                        );
                      }
                      controller.close();
                      return;
                    } catch (vDocErr) {
                      console.error('[Chat] Virtual doc Smart Doc V2 error:', vDocErr);
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'error', message: 'حدث خطأ في معالجة المستند' })}\n\n`)
                      );
                      // Fall through to normal chat
                    }
                  }
                }

                // No sections found or sections too short — use the local document pipeline
                console.log('[Chat] Smart Doc: No files attached but doc intent detected — routing to generateLocalDocument (المسار الذكي)');

                // Better topic extraction for messages with embedded lecture content
                const firstLine = message.split('\n')[0].trim();
                const docTopic = docIntent!.topic
                  || firstLine.replace(/^(اعمل|ولد|أنشئ|اصنع|اكتب|حول|حفظ|اطبع|generate|create|make|export|convert|save|download)\s*/i, '').replace(/(لي?|لي?\s*)(ملف|مستند|pdf|document|file)\s*/i, '').replace(/(شامل|مفصل|كامل|تفصيلي)\s*/i, '').replace(/(للمحاضرات|محاضرات|المحاضرات)\s*/i, 'محاضرات ').trim()
                  || 'ملخص المحاضرات';
                const intentLabel = 'ملخص المحاضرات';
                const topicSuffix = docTopic ? `: ${docTopic.slice(0, 50)}` : '';

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'started', message: `🚀 جاري ${intentLabel}${topicSuffix}...\n⏱️ العملية بتاخد 30-60 ثانية...\n🎨 هيتولد PDF ملون واحترافي زي المسار الذكي!` })}\n\n`)
                );

                try {
                  const { generateLocalDocument } = await import('@/lib/hf-document.service');
                  // When message contains lecture content (=== sections or long text),
                  // instruct the LLM to use it as the basis for the document
                  const instructionsForLLM = message.length > 3000
                    ? `المستخدم يطلب ملخص شامل للمحاضرات. فيما يلي محتوى المحاضرات المرجعي — التزم به ولا تضف معلومات من عندك:\n\n${message.slice(0, 50000)}`
                    : message;
                  const localResult = await generateLocalDocument({
                    topic: docTopic,
                    language: (language as 'ar' | 'en') || 'ar',
                    instructions: instructionsForLLM,
                    channelName: 'بعقل هادي',
                    includeImages: false,
                    styleDescription: undefined,
                    progressCallback: (stage, progress, msg) => {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage, progress, message: msg } })}\n\n`)
                      );
                    },
                  });

                  if (localResult && localResult.fileUrl) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        smartDocResult: {
                          success: true,
                          fileUrl: localResult.fileUrl,
                          fileName: localResult.fileName,
                          durationMs: localResult.durationMs,
                          docType: localResult.docType || 'pdf',
                        }
                      })}\n\n`)
                    );

                    // ── FIX H5: Derive proper serve URL and actual file metadata ──
                    // localResult.fileUrl is the absolute file path (e.g., /home/.../download/uuid.pdf)
                    // We need to extract the filename for the serve URL and get real file stats
                    const localFileName = localResult.fileUrl.split('/').pop() || '';
                    const localServeUrl = `/api/pdf/serve/${localFileName}`;

                    // Get actual file size
                    let localFileSize = 0;
                    let localFilePath = localResult.fileUrl;
                    try {
                      const { statSync } = await import('fs');
                      localFileSize = statSync(localResult.fileUrl).size;
                    } catch {
                      localFileSize = 0;
                    }

                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: `✅ تم إنشاء المستند بنجاح!\n\n📄 **${localResult.fileName}**\n⏱️ الوقت: ${Math.round((localResult.durationMs || 0) / 1000)} ثانية\n\n👉 [اضغط هنا لفتح المستند](${localServeUrl})\n\n🎨 تم إنشاء مستند ملون واحترافي باستخدام المسار الذكي!` })}\n\n`)
                    );

                    // Save to DB — with ACTUAL file path and size (was '' and 0)
                    if (user) {
                      try {
                        await db.generativeAsset.create({
                          data: {
                            userId: user.id,
                            type: 'pdf',
                            title: localResult.fileName || 'smart-doc-local',
                            prompt: message.slice(0, 200),
                            filePath: localFilePath,
                            fileSize: localFileSize,
                            metadata: JSON.stringify({
                              fileUrl: localServeUrl,
                              mimeType: 'application/pdf',
                              source: 'smart-doc-local-pipeline',
                              intentType: docIntent!.type,
                              topic: docTopic,
                            }),
                            model: 'local-pdf',
                          },
                        });
                      } catch (dbErr) {
                        console.warn('[Chat] Smart Doc Local: Failed to save generative asset:', dbErr instanceof Error ? dbErr.message : String(dbErr));
                      }
                    }

                    controller.close();
                    return;
                  } else {
                    console.warn('[Chat] Smart Doc Local: generateLocalDocument returned no fileUrl, falling back to chat');
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'failed', message: 'لم يتم إنشاء الملف، جاري الرد بشكل عادي...' })}\n\n`)
                    );
                    // Fall through to normal chat
                  }
                } catch (localDocErr) {
                  console.error('[Chat] Smart Doc Local: generateLocalDocument error:', localDocErr);

                  // ── Fallback: Try delta-ai space ──
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage: 'fallback', progress: 50, message: '🔄 جاري التجربة عبر مساحة توليد الملفات البديلة...' } })}\n\n`)
                  );

                  try {
                    const { generateDocumentViaDeltaAISpace } = await import('@/lib/hf-document.service');
                    const fallbackResult = await generateDocumentViaDeltaAISpace({
                      topic: docTopic,
                      language: (language as 'ar' | 'en') || 'ar',
                      instructions: message.length > 3000 ? message.slice(0, 50000) : message,
                      mode: 'local',
                      channelName: 'بعقل هادي',
                      progressCallback: (stage, progress, msg) => {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage, progress, message: msg } })}\n\n`)
                        );
                      },
                    });

                    if (fallbackResult && fallbackResult.fileUrl) {
                      // ── FIX: Derive proper serve URL from absolute file path ──
                      const fbFileName = fallbackResult.fileUrl.split('/').pop() || '';
                      const fbServeUrl = fbFileName ? `/api/pdf/serve/${fbFileName}` : fallbackResult.fileUrl;

                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                          smartDocResult: {
                            success: true,
                            fileUrl: fbServeUrl,
                            fileName: fallbackResult.fileName,
                            durationMs: fallbackResult.durationMs,
                            docType: fallbackResult.docType || 'pdf',
                          }
                        })}\n\n`)
                      );
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ content: `✅ تم إنشاء المستند بنجاح (عبر مساحة دلتا البديلة)!\n\n📄 **${fallbackResult.fileName}**\n⏱️ الوقت: ${Math.round((fallbackResult.durationMs || 0) / 1000)} ثانية\n\n👉 [اضغط هنا لفتح المستند](${fbServeUrl})` })}\n\n`)
                      );
                      controller.close();
                      return;
                    }
                  } catch (fallbackErr) {
                    console.error('[Chat] Delta-AI space fallback also failed:', fallbackErr);
                  }

                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'error', message: 'حدث خطأ في التوليد الذكي، جاري الرد بشكل عادي...' })}\n\n`)
                  );
                  // Fall through to normal chat
                }
              } else {
                // Send initial status with detected intent
                const intentLabels: Record<string, string> = {
                  'extract-topic': 'استخراج الموضوع',
                  'summarize': 'تلخيص',
                  'compile': 'تجميع',
                  'outline': 'إنشاء فهرس',
                  'compare': 'مقارنة',
                  'flashcards': 'كروت مراجعة',
                  'smart-doc': 'معالجة ذكية',
                };
                const intentLabel = intentLabels[docIntent!.type] || 'معالجة';
                const topicSuffix = docIntent!.topic ? `: ${docIntent!.topic}` : '';
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'started', message: `🚀 جاري ${intentLabel}${topicSuffix}...` })}\n\n`)
                );

                // Run the enhanced smart doc pipeline
                const result = await processSmartDocV2({
                  message,
                  attachments: pipelineFiles,
                  language: (language as 'ar' | 'en') || 'ar',
                  channelName: 'بعقل هادي',
                  userId: user?.id,
                  intent: docIntent!,
                }, (stage, progress, msg, detail) => {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage, progress, message: msg, detail } })}\n\n`)
                  );
                });

                if (result.success) {
                  // V.38: Try Google Drive upload if user requested it
                  // (e.g., "وارفعه علي جوجل درايف", "upload to drive")
                  let driveLink: string | null = null;
                  const wantsDriveUpload = /(?:ارفع|رفع|حفظ|احفظ|upload|save).*?(?:درايف|drive|جوجل)|درايف|drive/i.test(message);
                  if (wantsDriveUpload && result.filePath) {
                    try {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ smartDocProgress: { stage: 'uploading', progress: 92, message: '☁️ جاري الرفع على Google Drive...' } })}\n\n`)
                      );
                      const { uploadFileToDrive } = await import('@/lib/google-drive.service');
                      const uploadResult = await uploadFileToDrive(result.filePath, result.fileName, 'application/pdf');
                      driveLink = uploadResult?.webViewLink || null;
                      if (driveLink) {
                        console.log(`[Chat] Smart Doc: Drive link: ${driveLink}`);
                      }
                    } catch (driveErr) {
                      console.warn('[Chat] Smart Doc: Drive upload failed (non-critical):', driveErr instanceof Error ? driveErr.message : String(driveErr));
                    }
                  }

                  // Send completion event
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      smartDocResult: {
                        success: true,
                        fileUrl: result.fileUrl,
                        fileName: result.fileName,
                        durationMs: result.durationMs,
                        docType: result.docType || 'pdf',
                        driveLink,
                      }
                    })}\n\n`)
                  );

                  // Send text response
                  const topicInfo = docIntent!.topic ? ` عن "${docIntent!.topic}"` : '';
                  const driveMsg = driveLink
                    ? `\n\n☁️ **تم الرفع على Google Drive!**\n👉 [افتح على Drive](${driveLink})`
                    : '';
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: `✅ تم ${intentLabel}${topicInfo} بنجاح!\n\n📄 **${result.fileName}**\n⏱️ الوقت: ${Math.round((result.durationMs || 0) / 1000)} ثانية\n\n👉 [اضغط هنا لفتح المستند](${result.fileUrl})${driveMsg}\n\nتم تحليل الملفات ${pipelineFiles.length} وإنشاء المستند المطلوب 🎨` })}\n\n`)
                  );

                  // Save to DB
                  if (user) {
                    try {
                      await db.generativeAsset.create({
                        data: {
                          userId: user.id,
                          type: 'pdf',
                          title: result.fileName || 'smart-doc-v2',
                          prompt: message.slice(0, 200),
                          filePath: '',
                          fileSize: 0,
                          metadata: JSON.stringify({
                            fileUrl: result.fileUrl,
                            mimeType: 'application/pdf',
                            source: 'smart-doc-v2-pipeline',
                            intentType: docIntent!.type,
                            topic: docIntent!.topic || null,
                          }),
                          model: 'smart-doc-v2-pipeline',
                        },
                      });
                    } catch (dbErr) {
                      console.warn('[Chat] Smart Doc V2: Failed to save generative asset:', dbErr instanceof Error ? dbErr.message : String(dbErr));
                    }
                  }
                } else {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'failed', message: result.error || 'فشل في إنشاء المستند' })}\n\n`)
                  );
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: `⚠️ لم أتمكن من إنشاء المستند: ${result.error || 'خطأ غير معروف'}\n\nلكنني أستطيع تحليل الملفات والإجابة على أسئلتك عنها. ماذا تريد أن تعرف؟` })}\n\n`)
                  );
                }

                controller.close();
                return;
              }
            } catch (smartDocErr) {
              console.error('[Chat] Smart Doc V2 pipeline error:', smartDocErr);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ smartDocStatus: 'error', message: 'حدث خطأ في معالجة المستند' })}\n\n`)
              );
              // Fall through to normal chat
            }
          }

          // ── No progress events — removed for maximum speed ──
          // Progress events add latency before the first token arrives.
          // The user sees content as soon as streaming starts — no need for intermediate indicators.

          // Send search results as a separate SSE event (only the data, no progress)
          if (searchPerformed && searchResults.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ searchResults })}\n\n`)
            );
          }

          // ── Emit file generation status if intent detected ──
          // When the user requests file generation, send a status event
          // so the frontend can show a "generating PDF" indicator
          // ── Open Mode and Normal Mode: Detect HTML output as file generation intent ──
          // If the model outputs structured HTML (DOCTYPE, style blocks, divs with classes),
          // treat it as a file generation intent regardless of whether the user used keywords.
          // This catches cases where the model decides on its own to generate a document.
          if (!fileGenIntentOpen && containsHtmlTags(accumulatedContent.slice(0, 500))) {
            console.log('[Chat] Detected HTML output — enabling file generation pipeline');
            fileGenIntentOpen = true;
          }
          if (fileGenIntent || fileGenIntentOpen) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ fileGenStatus: 'generating', message: 'جاري إنشاء ملف PDF...' })}\n\n`)
            );
          }

          // ── Start parallel image generation if intent detected ──
          let imageGenPromise: Promise<{ dataUrl: string; prompt: string } | null> | null = null;
          if (shouldGenerateImage) {
            // Emit a "generating image" status event so frontend can show loading state
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ imageGenStatus: 'generating', prompt: mediaGenIntent!.prompt })}\n\n`)
            );
            imageGenPromise = (async () => {
              // Translate Arabic prompt to English for better image generation results
              // Most image models work much better with English prompts
              let imagePrompt = mediaGenIntent!.prompt;
              const isArabicPrompt = /[\u0600-\u06FF]/.test(imagePrompt);
              if (isArabicPrompt) {
                try {
                  const zai = await getZAIClient();
                  const translateResult = await zai.chat.completions.create({
                    model: 'glm-4-flash',
                    messages: [
                      { role: 'system', content: 'Translate the following text to English. Output ONLY the translation, nothing else. Be descriptive and add detail for image generation.' },
                      { role: 'user', content: imagePrompt },
                    ],
                    max_tokens: 200,
                  });
                  const translated = translateResult.choices?.[0]?.message?.content?.trim();
                  if (translated && translated.length > 2) {
                    console.log(`[Chat] Image prompt translated: "${imagePrompt}" → "${translated}"`);
                    imagePrompt = translated;
                  }
                } catch (translateErr) {
                  console.warn('[Chat] Prompt translation failed, using original:', translateErr instanceof Error ? translateErr.message : String(translateErr));
                }
              }
              try {
                // ✅ استخدم Zhipu CogView-3-Flash مباشرة (مجاني 100%)
                const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
                const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';
                if (!ZAI_API_KEY) {
                  console.warn('[Chat] ZAI_API_KEY not set — skipping CogView-3-Flash, going to Pollinations');
                } else {
                  const imgRes = await fetch(`${ZAI_BASE}/images/generations`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${ZAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                      model: 'cogview-3-flash',  // ✅ مجاني
                      prompt: imagePrompt,
                      size: '1024x1024',
                    }),
                    signal: AbortSignal.timeout(60_000),
                  });
                  if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    const imageUrl = imgData?.data?.[0]?.url || imgData?.data?.[0]?.b64_json || '';
                    // If response is a URL, download and convert to base64 data URL
                    if (imageUrl && imageUrl.startsWith('http')) {
                      const imgFetch = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
                      const buf = Buffer.from(await imgFetch.arrayBuffer());
                      const mime = imgFetch.headers.get('content-type') || 'image/png';
                      const base64 = `data:${mime};base64,${buf.toString('base64')}`;
                      console.log('[Chat] ✅ CogView-3-Flash image generated — size:', buf.length);
                      return { dataUrl: base64, prompt: mediaGenIntent!.prompt };
                    }
                    // If response is already base64, use it directly
                    if (imageUrl && imageUrl.length > 100) {
                      const mime = 'image/png';
                      const base64 = `data:${mime};base64,${imageUrl}`;
                      console.log('[Chat] ✅ CogView-3-Flash image generated (base64) — size:', imageUrl.length);
                      return { dataUrl: base64, prompt: mediaGenIntent!.prompt };
                    }
                  } else {
                    const err = await imgRes.text();
                    console.warn(`[Chat] CogView-3-Flash failed ${imgRes.status}:`, err.slice(0, 150));
                  }
                }
              } catch (zaiErr) {
                console.warn('[Chat] CogView-3-Flash error, trying Pollinations:', zaiErr instanceof Error ? zaiErr.message : String(zaiErr));
              }
              // Fallback: Pollinations FLUX (مجاني)
              try {
                const { generateImage } = await import('@/lib/pollinations');
                const result = await generateImage({
                  prompt: imagePrompt,
                  model: 'flux',
                  width: 1024,
                  height: 1024,
                  nologo: true,
                });
                if (result.base64) {
                  console.log('[Chat] ✅ Pollinations FLUX image generated');
                  return {
                    dataUrl: `data:image/png;base64,${result.base64}`,
                    prompt: mediaGenIntent!.prompt,
                  };
                }
              } catch (pollErr) {
                console.warn('[Chat] Pollinations FLUX failed:', pollErr instanceof Error ? pollErr.message : String(pollErr));
              }
              return null;
            })();
          }

          // ── Start parallel video generation if intent detected ──
          let videoGenPromise: Promise<{ videoUrl: string; prompt: string } | null> | null = null;

          if (shouldGenerateVideo) {
            // Emit a "generating video" status event so frontend can show loading state
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ videoGenStatus: 'generating', prompt: mediaGenIntent!.prompt })}\n\n`)
            );

            videoGenPromise = (async () => {
              let videoPrompt = mediaGenIntent!.prompt;
              // Translate Arabic prompt to English for better video generation
              const isArabicPrompt = /[\u0600-\u06FF]/.test(videoPrompt);
              if (isArabicPrompt) {
                try {
                  const zai = await getZAIClient();
                  const translateResult = await zai.chat.completions.create({
                    model: 'glm-4-flash',
                    messages: [
                      { role: 'system', content: 'Translate the following text to English. Output ONLY the translation, nothing else. Be descriptive for video generation.' },
                      { role: 'user', content: videoPrompt },
                    ],
                    max_tokens: 200,
                  });
                  const translated = translateResult.choices?.[0]?.message?.content?.trim();
                  if (translated && translated.length > 2) {
                    console.log(`[Chat] Video prompt translated: "${videoPrompt}" → "${translated}"`);
                    videoPrompt = translated;
                  }
                } catch (translateErr) {
                  console.warn('[Chat] Video prompt translation failed:', translateErr instanceof Error ? translateErr.message : String(translateErr));
                }
              }

              // ── 1) BigModel CogVideoX-Flash (FREE — async with polling) ──
              // Submit task → poll /async-result/{task_id} until SUCCESS or timeout (2 min)
              try {
                const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
                const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';

                if (ZAI_API_KEY) {
                  console.log('[Chat] Submitting CogVideoX-Flash task...');
                  const submitRes = await fetch(`${ZAI_BASE}/videos/generations`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${ZAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                      model: 'cogvideox-flash',  // ✅ FREE
                      prompt: videoPrompt,
                      duration: 5,
                      quality: 'speed',
                    }),
                    signal: AbortSignal.timeout(30_000),
                  });

                  if (submitRes.ok) {
                    const submitData = await submitRes.json();
                    const taskId = submitData?.id || submitData?.task_id || '';
                    if (taskId) {
                      console.log(`[Chat] CogVideoX-Flash task started: ${taskId}`);
                      // Poll for up to 2 minutes (24 attempts × 5s = 120s)
                      const pollDeadline = Date.now() + 120_000;
                      const pollInterval = 5_000;
                      let videoUrl = '';

                      while (Date.now() < pollDeadline) {
                        try {
                          const pollRes = await fetch(`${ZAI_BASE}/async-result/${taskId}`, {
                            headers: { 'Authorization': `Bearer ${ZAI_API_KEY}` },
                            signal: AbortSignal.timeout(15_000),
                          });
                          if (pollRes.ok) {
                            const pollData = await pollRes.json();
                            const status = pollData?.task_status || 'PROCESSING';
                            console.log(`[Chat] CogVideoX poll: status=${status}`);

                            if (status === 'SUCCESS') {
                              const vResult = pollData?.video_result?.[0] || {};
                              videoUrl = vResult.url || vResult.video_url || '';
                              if (videoUrl) {
                                console.log('[Chat] ✅ CogVideoX-Flash video generated:', videoUrl.slice(0, 80));
                                return {
                                  videoUrl,
                                  prompt: mediaGenIntent!.prompt,
                                };
                              }
                              break; // SUCCESS but no URL — try fallback
                            }
                            if (status === 'FAIL') {
                              console.warn('[Chat] CogVideoX task FAILED:', pollData?.msg || 'unknown');
                              break;
                            }
                          }
                        } catch (pollErr) {
                          console.warn('[Chat] CogVideoX poll error:', pollErr instanceof Error ? pollErr.message : String(pollErr));
                        }
                        await new Promise((r) => setTimeout(r, pollInterval));
                      }

                      if (!videoUrl) {
                        console.warn('[Chat] CogVideoX-Flash: no video URL after polling, falling back to HF');
                      }
                    }
                  } else {
                    const errText = await submitRes.text().catch(() => '');
                    console.warn(`[Chat] CogVideoX-Flash submit failed ${submitRes.status}: ${errText.slice(0, 150)}`);
                  }
                } else {
                  console.warn('[Chat] ZAI_API_KEY not set — skipping CogVideoX-Flash, going straight to HF');
                }
              } catch (zaiErr) {
                console.warn('[Chat] CogVideoX-Flash error, falling back to HF:', zaiErr instanceof Error ? zaiErr.message : String(zaiErr));
              }

              // ── 2) Fallback: HuggingFace Gradio Spaces (CogVideoX-2B, LTX-Video) ──
              try {
                const { generateVideoWithFallback } = await import('@/lib/hf-video.service');
                const result = await generateVideoWithFallback(videoPrompt, ['cogvideox-2b', 'ltx-video-distilled'], { duration: 5 });
                if (result.videoUrl) {
                  console.log('[Chat] ✅ HF video fallback succeeded:', result.videoUrl.slice(0, 80));
                  return {
                    videoUrl: result.videoUrl,
                    prompt: mediaGenIntent!.prompt,
                  };
                }
                return null;
              } catch (videoErr) {
                console.warn('[Chat] Inline video gen failed (HF fallback):', videoErr instanceof Error ? videoErr.message : String(videoErr));
                return null;
              }
            })();
          }

          // ── Start parallel quiz generation if intent detected ──
          let quizGenPromise: Promise<{
            title: string;
            questions: Array<{
              id: string;
              type: 'mcq' | 'true-false' | 'short-answer';
              question: string;
              options?: string[];
              correctAnswer: string;
              explanation?: string;
              difficulty: 'easy' | 'medium' | 'hard';
              points: number;
            }>;
          } | null> | null = null;

          if (shouldGenerateQuiz) {
            // Emit a "generating quiz" status event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ quizGenStatus: 'generating' })}\n\n`)
            );

            quizGenPromise = (async () => {
              try {
                // Extract text content from PDF and text attachments
                const contentParts: string[] = [];
                for (const att of parsed.attachments) {
                  if (att.type === 'text' && att.textContent) {
                    contentParts.push(`--- ملف: ${att.name} ---\n${att.textContent}\n--- نهاية الملف ---`);
                  } else if (att.type === 'pdf' && att.content) {
                    const extractedText = await extractPdfWithVlmAndText(att.content, att.name);
                    if (extractedText && !extractedText.startsWith('[')) {
                      contentParts.push(`--- ملف: ${att.name} ---\n${extractedText}\n--- نهاية الملف ---`);
                    }
                  }
                }
                const fileContent = contentParts.join('\n\n').trim() || undefined;

                // Extract topic from user message using improved extraction
                const topic = extractTopicFromMessage(parsed.cleanedMessage || message);

                // Build conversation context for context-aware quiz generation
                const convContext = conversationMessages.length > 0
                  ? buildConversationContext(conversationMessages, 10)
                  : undefined;

                // Use shared quiz generation service
                const result = await generateQuiz({
                  topic,
                  content: fileContent,
                  conversationContext: convContext,
                  questionCount: 10,
                  difficulty: 'medium',
                  types: ['mcq', 'true-false'],
                });

                if (!result) return null;

                console.log(`[Chat] Quiz gen: Generated ${result.questions.length} questions successfully (topic: "${topic}")`);
                return result;
              } catch (quizErr) {
                console.error('[Chat] Quiz gen failed:', quizErr instanceof Error ? quizErr.message : String(quizErr));
                return null;
              }
            })();
          }

          // ── Helper: enqueue content and cancel initial timeout on first token ──
          // Once the model starts streaming, the 60s initial timeout is cancelled.
          // After that, the 20-minute inactivity watchdog takes over — resets on every token.
          // Also performs REAL-TIME HTML stripping for non-file-gen responses.
          function enqueueContent(content: string) {
            if (streamClosed) {
              console.warn('[Chat] enqueueContent skipped — stream already closed');
              return;
            }
            if (!streamGotContent) {
              streamGotContent = true;
              clearTimeout(timeoutId!); // Cancel initial timeout — model is responding!
              console.log('[Chat] First content received — initial timeout cancelled');
              startInactivityWatchdog(); // Start the inactivity watchdog instead
            }
            lastContentTime = Date.now(); // Reset inactivity timer on every token
            // PERF: Push to array instead of string concatenation
            contentChunks.push(content);
            accumulatedContent += content;

            // ── Pollinations ad detection (streaming-safe) ──
            // The free Pollinations API appends an ad at the end of responses.
            // Once we detect the ad boundary, we suppress all content beyond it.
            if (adBoundaryIndex === -1) {
              const boundary = findAdBoundary(accumulatedContent);
              if (boundary !== -1) {
                adBoundaryIndex = boundary;
                console.log(`[Chat] Pollinations ad detected at char ${boundary} — suppressing promotional content`);
              }
            }

            // Compute the clean (ad-free) accumulated content
            const cleanAccumulated =
              adBoundaryIndex !== -1
                ? accumulatedContent.slice(0, adBoundaryIndex)
                : accumulatedContent;

            // If the ad boundary is mid-chunk, we may need to suppress this chunk entirely
            if (adBoundaryIndex !== -1 && displayedCleanLength >= cleanAccumulated.length) {
              // Everything clean has already been sent — this chunk is pure ad, skip it
              return;
            }

            // The new clean content to display for this chunk = cleanAccumulated minus what we already sent
            const newClean = cleanAccumulated.slice(displayedCleanLength);
            displayedCleanLength = cleanAccumulated.length;

            // ── Real-time HTML detection for auto file generation ──
            // If the model outputs structured HTML (DOCTYPE, style blocks, divs with classes),
            // and we haven't already detected file generation intent, set fileGenIntentOpen = true.
            // This ensures the HTML is preserved for PDF generation instead of being stripped.
            if (!fileGenIntentOpen && accumulatedContent.length > 50 && containsHtmlTags(accumulatedContent.slice(0, 500))) {
              fileGenIntentOpen = true;
              console.log('[Chat] Real-time: Detected HTML output — enabling file generation pipeline');
              // Send fileGenStatus event so the frontend shows "generating PDF" indicator
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ fileGenStatus: 'generating', message: 'جاري إنشاء ملف PDF...' })}\n\n`)
              );
            }

            // ── Real-time HTML stripping for non-file-gen responses ──
            // Instead of waiting until the end, strip HTML tags from each chunk
            // so the user never sees raw HTML in the chat
            let displayContent = newClean;
            if (!isOpenMode && !fileGenIntent && !fileGenIntentOpen && !cachedContentStrategyNeeded) {
              // Quick check: if this chunk contains any HTML tags, strip them
              if (/<style|<div|<span|class=["']|<\/div>|<\/span>|<\/p>|<p[^>]*>|<br\s*\/?>|<!DOCTYPE|<html|<body|<head|<table|<tr|<td|<th|<ul|<ol|<li[^>]*>|<\/li>|<strong|<em\b|<h[1-6]|<section|<article|<nav|<footer|<header|<main|<form|<input|<button|<script|<meta|<link\b/i.test(displayContent)) {
                displayContent = stripHtmlChunk(displayContent);
              }
            }

            if (displayContent.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: displayContent })}\n\n`));
            }
          }

          // Timeout guard — 60 seconds INITIAL timeout, but cancelled once streaming starts.
          // Once streaming starts, a 20-minute INACTIVITY watchdog takes over.
          // This prevents the stream from hanging forever if the model stops producing tokens
          // (e.g., network drop, provider timeout, etc.) without killing active streams.
          // Any activity (token received) resets the inactivity timer automatically.
          let streamGotContent = false;
          let lastContentTime = Date.now();
          let inactivityWatchdogId: ReturnType<typeof setTimeout> | null = null;

          // ── SSE Heartbeat: Send keepalive ping every 15 seconds ──────────
          // Prevents proxies/load balancers from closing idle connections
          // and keeps the frontend stream watchdog from triggering prematurely
          const heartbeatInterval = setInterval(() => {
            if (streamClosed) {
              clearInterval(heartbeatInterval);
              return;
            }
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              clearInterval(heartbeatInterval);
            }
          }, 15_000);

          // إلغاء الـ timeout نهائياً — البث مفيش مهلة، يفضل فاتح لحد ما الموديل يخلص
          // (عبس طلب إلغاء الموقت عشان الاتصال ما يتقطعش)
          const timeoutId: ReturnType<typeof setTimeout> | null = null;

          // Inactivity watchdog كمان ملغي — البث يفضل فاتح
          function startInactivityWatchdog() {
            // no-op — تم إلغاء الـ inactivity timeout
          }

          try {
            // ────────────────────────────────────────────────────────────────────
            // TOP-LEVEL PRE-SCAN LAYER (contacts-fix-1)
            // ────────────────────────────────────────────────────────────────────
            // المشكلة: الـ LLM (أي provider) لما بيشوف system prompt بيقول "استخدم أداة
            // google_contacts_reader" بيطبع JSON-as-text بدل ما يستدعي الأداة فعلاً.
            // والحل القديم كان مدفون جوه streamFromZhipuAI() — اللي مش بيتندى أبداً
            // (dead code). فعشان نحل المشكلة لكل الـ providers (ZAI, Pollinations,
            // Cerebras, HF, Groq, Gemini, …) بنعمل pre-scan هنا على أعلى مستوى:
            // لو رسالة المستخدم فيها طلب واضح لرقم/جهة اتصال → ننفّذ الأداة مباشرة
            // → نـ format الرد (بـ LLM لو متاح، أو template كـ fallback) → نقفل الـ stream.
            // ────────────────────────────────────────────────────────────────────
            try {
              const _hasImageAttachmentsPre = parsed.attachments.some((a) => a.type === 'image');
              const _isFileGenIntent = isFileGenerationIntent(parsed.cleanedMessage || message);
              if (!_hasImageAttachmentsPre && !_isFileGenIntent) {
                const { executeTool } = await import('@/lib/mcp/registry');
                const { runWithContext } = await import('@/lib/request-context');
                const _lastUserMsg = messages.filter((m: any) => m.role === 'user').slice(-1)[0];
                const _userText = typeof _lastUserMsg?.content === 'string'
                  ? _lastUserMsg.content
                  : JSON.stringify(_lastUserMsg?.content ?? '');
                const _lowerText = _userText.toLowerCase();

                const _sendPreStatus = (status: string, phase?: string) => {
                  if (streamClosed) return;
                  try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ backendStatus: status, phase })}\n\n`));
                  } catch {}
                };

                // ── كاشف طلبات جهات الاتصال ──
                // لازم فيه فعل أمر واضح + كلمة "رقم" أو "هاتف" أو "اتصال" أو "contact"
                const _ACTION_VERBS = /(?:هاتلي|هات\s*لي|جيبلي|جيب\s*لي|دورلي|دور\s*لي|ابحث|عايز|عاوز|عايز\s*رقم|عاوز\s*رقم|ادّيني|اديني|إديني|جب\s*لي|جيب\s*لي)/i;
                const _CONTACT_KEYWORDS = /(?:رقم|هاتف|اتصال|جهة\s*اتصال|contacts?|phone|موبايل|موبيل|تليفون)/i;
                const _hasActionVerb = _ACTION_VERBS.test(_userText);
                const _wantsContact = _hasActionVerb && _CONTACT_KEYWORDS.test(_userText);
                const _isQuestion = /^(ايه|إيه|شنو|كام|ليه|ازاي|إزاي|امتى|إمتى|فين|مين|هل|ممكن|تقدر|تعرف|تقول|عرفني|اشرحلي|فهمني|كيف|متى|أين|من|ما هو|ما هي|ايه هو|إيه هو|ايه رايك|إيه رأيك)\b/i.test(_userText.trim());

                if (_wantsContact && !_isQuestion) {
                  console.log(`[Pre-scan-top] Contact intent detected: "${_userText}"`);
                  _sendPreStatus("بنفّذ أداة: البحث في جهات الاتصال", "executing");

                  // استخراج الاسم من رسالة المستخدم
                  // أنماط: "هاتلي رقم X" / "جيبلي رقم X" / "دورلي على رقم X" /
                  //        "عايز رقم X" / "ابحث عن رقم X" / "رقم X"
                  const _contactName = _userText
                    .replace(/.*(?:هاتلي|هات\s*لي|جيبلي|جيب\s*لي|دور\s*على\s*رقم|دورلي\s*على\s*رقم|ابحث\s*عن\s*رقم|عايز\s*رقم|عاوز\s*رقم|ادّيني\s*رقم|اديني\s*رقم|إديني\s*رقم|جب\s*لي\s*رقم|جيب\s*لي\s*رقم|رقم|تليفون|موبايل|موبيل|هاتف|phone\s*number\s*of|number\s*of)\s*/i, "")
                    .replace(/\s*(من\s*الناحية|من\s*جهات\s*الاتصال|لو\s*سمحت|please|بليز|من\s*فضلك)\s*$/i, "")
                    .replace(/[.?؟!]+$/g, "")
                    .trim() || _userText;

                  console.log(`[Pre-scan-top] Extracted contact name: "${_contactName}"`);

                  const _contactResult = await runWithContext(request, async () => {
                    return executeTool("google_contacts_reader", { search_name: _contactName });
                  });

                  // ── Handle failure (including "not connected") ──
                  if (!_contactResult.success) {
                    const _errMsg = String(_contactResult.error ?? "فشل تنفيذ الأداة.");
                    _sendPreStatus("خلصت", "finalizing");
                    if (/غير مربوط|مش متصل|not connected|NOT_CONNECTED|لازم تربط/i.test(_errMsg)) {
                      enqueueContent("📞 Google Contacts مش متصل. اربط حسابك من الإعدادات (Integration Dashboard ⟶ ربط Google Workspace) عشان أقدر أجيبلك أرقام جهات الاتصال.");
                    } else {
                      enqueueContent(`⚠️ ${_errMsg}`);
                    }
                    streamClosed = true;
                    try {
                      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                      controller.close();
                    } catch {}
                    console.log('[Pre-scan-top] Contact tool failed, stream closed.');
                    return;
                  }

                  // ── Format the result ──
                  const _toolData = (_contactResult.data ?? {}) as any;
                  const _contacts = (_toolData?.contacts ?? []) as Array<{ name: string; phones: string[]; emails?: string[] }>;
                  const _queryName = _toolData?.query ?? _contactName;

                  let _templateReply: string;
                  if (!_contacts || _contacts.length === 0) {
                    _templateReply = `ملقتش جهة اتصال مطابقة لـ "${_queryName}" في جهات اتصالك. 😕\nتأكد من الاسم أو جرّب اسم تاني.`;
                  } else if (_contacts.length === 1) {
                    const _c = _contacts[0];
                    const _phone = _c.phones?.[0] ?? "—";
                    _templateReply = `📞 ${_c.name}: ${_phone}`;
                    if (_c.phones && _c.phones.length > 1) {
                      _templateReply += `\nأرقام تانية: ${_c.phones.slice(1).join("، ")}`;
                    }
                    if (_c.emails && _c.emails.length > 0) {
                      _templateReply += `\n📧 ${_c.emails[0]}`;
                    }
                  } else {
                    _templateReply = `لقيت ${_contacts.length} جهة اتصال مطابقة لـ "${_queryName}":\n`;
                    _contacts.slice(0, 5).forEach((_c, _i) => {
                      const _phone = _c.phones?.[0] ?? "—";
                      _templateReply += `${_i + 1}. ${_c.name}: ${_phone}\n`;
                    });
                    if (_contacts.length > 5) {
                      _templateReply += `... و${_contacts.length - 5} جهة تانية`;
                    }
                  }

                  // ── Try LLM formatting first, fall back to template ──
                  _sendPreStatus("بكتب الرد النهائي...", "finalizing");
                  let _finalReply: string | null = null;
                  try {
                    const _zai = await getZAIClient();
                    const _formatPrompt = `أنت Anzaro — مساعد بسيط. نفّذت أداة "google_contacts_reader" بناءً على طلب المستخدم ("${_userText}").

نتيجة الأداة (نجحت):
${JSON.stringify(_toolData)}

قواعد الرد:
1. اكتب رد واحد فقط — ممنوع التكرار.
2. استخدم البيانات من النتيجة فقط — ممنوع تخترع أرقام أو أسماء.
3. لو فيه رقم هاتف، حطه بالظبط من النتيجة.
4. الرد لازم يكون مختصر (1-3 أسطر كحد أقصى).
5. ممنوع تستخدم emoji أكثر من مرة.
6. لو مفيش نتائج، قول: "ملقتش جهة اتصال مطابقة لـ ${_queryName}."
7. ⛔ ممنوع تكتب JSON أو tool calls كنص — اكتب رد عادي بالعربي للمستخدم.

اكتب الرد الآن:`;
                    const _completion = await _zai.chat.completions.create({
                      model: 'glm-4-flash',
                      messages: [{ role: 'system', content: _formatPrompt }],
                      stream: false,
                      temperature: 0.3,
                      max_tokens: 512,
                    } as any);
                    const _llmText = (_completion as any).choices?.[0]?.message?.content ?? null;
                    if (_llmText && _llmText.trim().length > 0) {
                      _finalReply = _llmText.replace(/(.{20,})\1{1,}/g, "$1").trim();
                    }
                  } catch (_fmtErr) {
                    console.warn('[Pre-scan-top] LLM formatting failed, using template:', _fmtErr instanceof Error ? _fmtErr.message : String(_fmtErr));
                  }

                  enqueueContent(_finalReply || _templateReply);

                  streamClosed = true;
                  try {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                  } catch {}
                  console.log('[Pre-scan-top] Contact tool executed successfully, stream closed.');
                  return;
                }
              }
            } catch (_preScanError) {
              console.warn('[Pre-scan-top] failed (continuing to provider routing):', _preScanError instanceof Error ? _preScanError.message : String(_preScanError));
            }
            // ────────────────────────────────────────────────────────────────────
            // END TOP-LEVEL PRE-SCAN LAYER
            // ────────────────────────────────────────────────────────────────────

            // ── Determine provider based on modelConfig.provider ──
            // Route to the PRIMARY provider as defined in models.ts
            // Each model has a designated primary provider for optimal performance
            const hasImageAttachments = parsed.attachments.some((a) => a.type === 'image');
            const primaryProvider = modelConfig.provider;
            const pollinationsEntry = CHAT_MODEL_MAP[model];

            // Vision models with image attachments must use ZhipuAI (GLM-4V supports vision)
            // CRITICAL FIX: When ANY image is attached, auto-route to ZhipuAI vision
            // regardless of the active model. This prevents "all providers failed" errors
            // when non-vision models receive images.
            // Also route to ZhipuAI if the model supports vision AND is a ZhipuAI model
            // (GLM-4-Flash, GLM-4V, etc.) so images go through ZAI's vision API.
            const useZhipuAIForVision = hasImageAttachments && (
              modelConfig.glmModel === 'glm-4v-flash' || glmModel === 'glm-4v' ||
              modelConfig.capabilities.vision === false ||
              (modelConfig.capabilities.vision === true && modelConfig.provider === 'zhipuai')
            );

            console.log(`[Chat] Routing model=${model}, provider=${primaryProvider}, hasImages=${hasImageAttachments}, visionOverride=${useZhipuAIForVision}`);

            // ── PRIORITY: Try Cerebras first for ALL text-only models (FREE, ultra-fast) ──
            // Cerebras provides ~500-2000 T/s which is 5-20x faster than OpenRouter
            // Skip for vision models with actual image attachments (Cerebras doesn't support vision)
            //
            // CRITICAL FIX: Use a LOCAL variable instead of globalThis to prevent race conditions
            // between concurrent requests. The old globalThis.__cerebrasSucceeded caused chat
            // to stop after 2-3 messages because Request B could read Request A's flag.
            let cerebrasAlreadyHandled = false;
            // ── تخطّي Cerebras لو الموديل zhipuai (عبس) — استخدم ZAI مباشرة ──
            const cerebrasMapping = (primaryProvider !== 'zhipuai' && primaryProvider !== 'github' && primaryProvider !== 'gemini' && primaryProvider !== 'groq' && primaryProvider !== 'openai' && primaryProvider !== 'anthropic' && (!hasImageAttachments || !useZhipuAIForVision)) ? getCerebrasChatModelMapping(model) : null;
            if (primaryProvider === 'zhipuai') {
              console.log('[Chat] Skipping Cerebras — using ZAI directly for zhipuai model');
            } else if (primaryProvider === 'github' || primaryProvider === 'gemini' || primaryProvider === 'groq' || primaryProvider === 'openai' || primaryProvider === 'anthropic') {
              console.log(`[Chat] Skipping Cerebras — using ${primaryProvider} directly`);
            } else if (!isProviderHealthy('cerebras')) {
              console.log('[Chat] Skipping Cerebras (recently failed)');
            }
            if (cerebrasMapping && primaryProvider !== 'zhipuai' && primaryProvider !== 'github' && primaryProvider !== 'gemini' && primaryProvider !== 'groq' && primaryProvider !== 'openai' && primaryProvider !== 'anthropic' && !useZhipuAIForVision && isProviderHealthy('cerebras') && CEREBRAS_API_KEY) {
              try {
                console.log(`[Chat] Trying Cerebras first: ${cerebrasMapping.cerebrasModel} (${cerebrasMapping.label}) — FREE, ultra-fast`);

                const cerebrasMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                // Use AbortController to cancel the Cerebras stream if it times out
                const cerebrasAbortController = new AbortController();
                let cerebrasGotContent = false;
                let cerebrasStreamDone = false;
                let cerebrasResolve!: (value: 'done' | 'timeout') => void;
                const cerebrasFirstToken = new Promise<'done' | 'timeout'>((resolve) => {
                  cerebrasResolve = resolve;
                });

                // Start Cerebras streaming in background
                // FIX #5: Pass AbortController signal to properly terminate the stream on timeout
                // Without this, the for-await loop continues consuming even after abort,
                // causing a stream leak that keeps the connection open unnecessarily.
                (async () => {
                  try {
                    const cerebrasChunkStream = streamCerebrasChat({
                      messages: cerebrasMessages,
                      model: cerebrasMapping.cerebrasModel as any,
                      temperature: 0.7,
                      signal: cerebrasAbortController.signal,
                    });
                    for await (const chunk of cerebrasChunkStream) {
                      if (streamClosed || cerebrasAbortController.signal.aborted) {
                        cerebrasStreamDone = true;
                        cerebrasResolve('done');
                        return;
                      }
                      const content = chunk.choices?.[0]?.delta?.content || '';
                      if (content) {
                        if (!cerebrasGotContent) {
                          cerebrasGotContent = true;
                          // First content received — resolve the race
                          cerebrasResolve('done');
                        }
                        enqueueContent(content);
                      }
                    }
                    cerebrasStreamDone = true;
                    cerebrasResolve('done');
                  } catch {
                    // Stream was aborted or errored — mark as done to unblock waiters
                    cerebrasStreamDone = true;
                    cerebrasResolve('done');
                  }
                })();

                // Race: if no content within 3s, abort Cerebras and fall back
                const cerebrasTimeout = setTimeout(() => {
                  if (!cerebrasGotContent && !cerebrasStreamDone) {
                    cerebrasAbortController.abort();
                    cerebrasResolve('timeout');
                  }
                }, 3_000);

                const raceResult = await cerebrasFirstToken;
                clearTimeout(cerebrasTimeout);

                if (raceResult === 'timeout' && !cerebrasGotContent) {
                  console.warn('[Chat] Cerebras first-token timeout (3s) — falling back to configured provider');
                  // Wait a brief moment for the abort to propagate, then continue
                  await new Promise((r) => setTimeout(r, 100));
                } else if (cerebrasGotContent) {
                  // Cerebras actually produced content — wait for the full stream to complete
                  console.log(`[Chat] Cerebras succeeded (${accumulatedContent.length} chars), waiting for full stream...`);
                  // The stream is still running in the background — wait for it to finish
                  // by continuing to read until cerebrasStreamDone is true
                  while (!cerebrasStreamDone && !streamClosed) {
                    await new Promise((r) => setTimeout(r, 50));
                  }
                  cerebrasAlreadyHandled = true;
                  reportAggregatorSuccess('cerebras', 'chat', Date.now() - streamStartTime);
                } else {
                  // Cerebras stream completed WITHOUT producing any content (e.g., Cloudflare block)
                  // This means Cerebras is not working — fall back to the configured provider
                  console.warn(`[Chat] Cerebras completed with 0 chars (likely blocked) — falling back to configured provider`);
                  markProviderFailed('cerebras');
                  reportAggregatorFailure('cerebras', 'chat', 'Completed with 0 chars (likely blocked)');
                  // Continue to the normal provider routing below
                }
              } catch (cerebrasError) {
                console.warn('[Chat] Cerebras failed, falling back to configured provider:', cerebrasError instanceof Error ? cerebrasError.message : String(cerebrasError));
                markProviderFailed('cerebras');
                reportAggregatorFailure('cerebras', 'chat', cerebrasError instanceof Error ? cerebrasError.message : String(cerebrasError));
                // Fall through to the normal provider routing below
              }
            }

            // ── Helper: stream from ZhipuAI (used as ultimate fallback) ──
            async function streamFromZhipuAI() {
              const zai = await getZAIClient();
              
              // ── CRITICAL: When images are present, use GLM-4V (vision model) ──
              // GLM-4-Flash and GLM-5.2 do NOT support vision.
              // Only GLM-4V supports image input via the ZAI SDK.
              // When images are attached, override the model to glm-4v
              // and use the vision API endpoint.
              const hasImagesInMessages = messages.some(
                (m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url')
              );
              
              if (hasImagesInMessages) {
                // Use glm-4v-flash (FREE vision model on BigModel) for image analysis
                // Supports up to 10 images per request. max_tokens=1024 per image.
                // Fallback: HuggingFace LLaVA + Pollinations (both free)
                
                try {
                  // Extract image URLs and text from messages
                  const imageUrls: string[] = [];
                  let textContent = 'حلل هذه الصورة';
                  for (const msg of messages) {
                    if (Array.isArray(msg.content)) {
                      for (const part of msg.content) {
                        if (part.type === 'image_url' && part.image_url?.url) {
                          imageUrls.push(part.image_url.url);
                        }
                        if (part.type === 'text' && part.text) {
                          textContent = part.text;
                        }
                      }
                    } else if (typeof msg.content === 'string' && msg.role === 'user') {
                      textContent = msg.content;
                    }
                  }
                  
                  console.log(`[Chat] Vision request: using glm-4v-flash (FREE on BigModel) for ${imageUrls.length} image(s)`);
                  
                  // ── TIER 1: Try glm-4v-flash (FREE on BigModel via ZAI SDK) ──
                  // GLM-4V-Flash supports multiple images in a single request.
                  // Build content array with text + all images.
                  try {
                    const contentParts: any[] = [
                      { type: 'text', text: textContent },
                    ];
                    // Add up to 10 images (BigModel limit)
                    for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
                      contentParts.push({
                        type: 'image_url',
                        image_url: { url: imageUrls[i] },
                      });
                    }
                    
                    const visionRequest: any = {
                      model: 'glm-4v-flash',
                      messages: [{
                        role: 'user',
                        content: contentParts,
                      }],
                      stream: false,
                      thinking: { type: 'disabled' },
                      max_tokens: 1024,
                      temperature: 0.7,
                    };
                    
                    const visionCompletion = await zai.chat.completions.create(visionRequest);
                    const visionText = visionCompletion.choices?.[0]?.message?.content || '';
                    
                    if (visionText) {
                      console.log(`[Chat] glm-4v-flash vision SUCCESS (${imageUrls.length} images)`);
                      if (!streamClosed) {
                        enqueueContent(visionText);
                      }
                      streamClosed = true;
                      try {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                      } catch {}
                      return;
                    }
                  } catch (glmFlashErr) {
                    console.warn('[Chat] glm-4v-flash failed:', glmFlashErr instanceof Error ? glmFlashErr.message : String(glmFlashErr));
                  }
                  
                  // ── TIER 2: HuggingFace LLaVA (FREE) ──
                  console.log('[Chat] Falling back to HuggingFace LLaVA');
                  const hfToken = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
                  const visionResponse = await fetch('https://router.huggingface.co/hf-inference/models/llava-hf/llava-1.5-7b-hf', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(hfToken ? { Authorization: `Bearer ${hfToken}` } : {}),
                    },
                    body: JSON.stringify({
                      inputs: {
                        image: imageUrls[0]?.split(',')[1] || imageUrls[0],
                        prompt: textContent,
                      },
                    }),
                    signal: AbortSignal.timeout(30_000),
                  });
                  
                  if (visionResponse.ok) {
                    const visionData = await visionResponse.json();
                    const visionText = visionData[0]?.generated_text || visionData.generated_text || '';
                    if (visionText) {
                      enqueueContent(`📊 تحليل الصورة: ${visionText}`);
                      return;
                    }
                  }
                  
                  // ── TIER 3: Pollinations Vision (FREE) ──
                  console.log('[Chat] Falling back to Pollinations vision');
                  const pollResponse = await fetch('https://text.pollinations.ai/openai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'openai',
                      messages: [
                        { role: 'system', content: 'أنت مساعد يحلل الصور بالعربية.' },
                        { role: 'user', content: [
                          { type: 'text', text: textContent },
                          { type: 'image_url', image_url: { url: imageUrls[0] } },
                        ]},
                      ],
                    }),
                    signal: AbortSignal.timeout(30_000),
                  });
                  
                  if (pollResponse.ok) {
                    const pollData = await pollResponse.json();
                    const pollText = pollData.choices?.[0]?.message?.content || '';
                    if (pollText) {
                      enqueueContent(`📊 تحليل الصورة: ${pollText}`);
                      return;
                    }
                  }
                  
                  // All tiers failed
                  enqueueContent('⚠️ تعذر تحليل الصورة. حاول مرة أخرى.');
                } catch (visionErr) {
                  console.warn('[Chat] All vision methods failed:', visionErr);
                  enqueueContent('⚠️ تعذر تحليل الصورة. حاول مرة أخرى.');
                }
                return;
              }
              
              // ── Normal text streaming (no images) ──

              // ── PRE-SCAN LAYER: execute action tools BEFORE the LLM can refuse ──
              // الـ LLM (GLM-4-Flash) عنيد مع privacy — بيرفض يقرا جهات اتصال.
              // الحل: نـ scan رسالة المستخدم الأول. لو لقينا طلب واضح (رقم/تذكير/مهمة/ملف)
              // → ننفّذ الأداة مباشرة → نبعت النتيجة للـ LLM عشان يـ formatها بس.
              // كده الـ LLM مش هيقدر يرفض لأن الأداة اتنفذت بالفعل.
              try {
                const { executeTool } = await import('@/lib/mcp/registry');
                const { runWithContext } = await import('@/lib/request-context');
                const lastUserMsg = messages.filter((m: any) => m.role === 'user').slice(-1)[0];
                const userText = typeof lastUserMsg?.content === 'string'
                  ? lastUserMsg.content
                  : JSON.stringify(lastUserMsg?.content ?? '');
                const lowerText = userText.toLowerCase();

                // status helper
                const sendPreStatus = (status: string, phase?: string) => {
                  if (streamClosed) return;
                  const encoder = new TextEncoder();
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ backendStatus: status, phase })}\n\n`));
                };

                // Detect action intent + execute tool directly
                let preToolResult: { toolName: string; result: any } | null = null;

                // ── كاشف الأسئلة — لو المستخدم بيسأل (مش بيأمر) → ما تـ triggerش أدوات ──
                const isQuestion = /^(ايه|إيه|شنو|كام|ليه|ازاي|إزاي|امتى|إمتى|فين|مين|هل|ممكن|تقدر|تعرف|تقول|بتاعتك|بتاعك|الخاص|بتاع|عرفني|اشرحلي|فهمني|كيف|متى|أين|من|ما هو|ما هي|ايه هو|إيه هو|ايه رايك|إيه رأيك)/i.test(userText.trim())
                  || /كام|كم/i.test(userText) && /ذاكر|memory|context|كونتكست/i.test(userText)
                  // أي جملة مش فيها فعل أمر صريح = سؤال
                  || !/(?:اعمل|أنشئ|انشئ|حط|ضيف|هاتلي|هات\s*لي|جيبلي|جيب\s*لي|دورلي|دور\s*لي|ابحث|امسح|احذف|شيل|ارفع|احفظ|اكتب|لخص|حلل|اقرا|افتكر|ذكرني|فكرني|نبهني|سجل|ابعت|ارسل|نبه|خزن)/i.test(userText);

                await runWithContext(request, async () => {
                  // ── لو سؤال عام أو مفيش فعل أمر → ما تـ triggerش أدوات خالص ──
                  if (isQuestion) {
                    console.log("[Pre-scan] no action verb — skipping tool execution");
                    return;
                  }

                  // ── فحص صريح للأفعال — لازم فيه فعل أمر واضح ──
                  const hasActionVerb = true; // لو وصل هنا معناه إن فيه فعل أمر (تم فحصه فوق)

                  if (hasActionVerb && (lowerText.includes("رقم") || lowerText.includes("هاتف") || lowerText.includes("اتصال") || lowerText.includes("contact"))) {
                    // جهات اتصال
                    sendPreStatus("بنفّذ أداة: البحث في جهات الاتصال", "executing");
                    const name = userText.replace(/.*(هاتلي|هات\s*لي|جيبلي|دور\s*على\s*رقم|ابحث\s*عن\s*رقم|رقم)\s*/i, "").trim() || userText;
                    const r = await executeTool("google_contacts_reader", { search_name: name });
                    preToolResult = { toolName: "google_contacts_reader", result: r };
                  } else if (hasActionVerb && (lowerText.includes("تذكير") || lowerText.includes("ذكرني") || lowerText.includes("فكرني") || lowerText.includes("موعد"))) {
                    // تذكير/موعد في التقويم
                    sendPreStatus("بنفّذ أداة: تذكير في التقويم", "executing");
                    const title = userText.replace(/.*(فكرني|ذكرني|ضيف\s*موعد|حط\s*تذكير|تذكير)[:\s]*/i, "")
                      .replace(/الساعة.*/i, "").replace(/\d+\s*(دقيقة|دقايق|ساعة|ساعات|يوم|أيام).*/i, "").trim() || "تذكير";

                    // parse الوقت من رسالة المستخدم
                    const now = new Date();
                    let offsetMs = 60 * 60 * 1000; // افتراضي: ساعة
                    const minMatch = userText.match(/(\d+)\s*(دقيقة|دقايق|min)/i);
                    const hourMatch = userText.match(/(\d+)\s*(ساعة|ساعات|hour)/i);
                    const dayMatch = userText.match(/(\d+)\s*(يوم|أيام|day)/i);
                    if (minMatch) offsetMs = parseInt(minMatch[1]) * 60 * 1000;
                    else if (hourMatch) offsetMs = parseInt(hourMatch[1]) * 60 * 60 * 1000;
                    else if (dayMatch) offsetMs = parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;

                    const start = new Date(now.getTime() + offsetMs);
                    const end = new Date(start.getTime() + 30 * 60 * 1000);

                    // format الوقت بالعربي للـ LLM
                    const timeStr = start.toLocaleString("ar-EG", {
                      timeZone: "Africa/Cairo", weekday: "long", day: "numeric",
                      month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                    });

                    const r = await executeTool("google_calendar_reminder", {
                      summary: title.slice(0, 100), startTime: start.toISOString(),
                      endTime: end.toISOString(), reminderMinutes: 5,
                    });
                    preToolResult = { toolName: "google_calendar_reminder", result: r, extraInfo: { actualTime: timeStr } };
                  } else if (hasActionVerb && (lowerText.includes("مهمة") || lowerText.includes("task") || (lowerText.includes("ضيف") && !lowerText.includes("تذكير")))) {
                    // مهمة
                    sendPreStatus("بنفّذ أداة: إضافة مهمة", "executing");
                    const title = userText.replace(/.*(ضيف|مهمة)[:\s]*/i, "").trim() || userText;
                    const r = await executeTool("google_tasks_manager", { title: title.slice(0, 200) });
                    preToolResult = { toolName: "google_tasks_manager", result: r };
                  } else if (hasActionVerb && (lowerText.includes("امسح") || lowerText.includes("احذف") || lowerText.includes("delete") || lowerText.includes("شيل"))) {
                    // مسح ملف/فولدر من Drive (محتاج file_id — نبحث عنه الأول)
                    sendPreStatus("بنفّذ أداة: الحذف من Drive", "executing");
                    const name = userText.replace(/.*(امسح|احذف|شيل)\s*(لي)?\s*(ال)?(ملف|فولدر|مجلد)?\s*(اللي\s*اسمه|باسم)?[:\s]*/i, "").trim();
                    if (name) {
                      const searchR = await executeTool("google_drive_file_search", { name, max_results: 1 });
                      if (searchR.success && (searchR.data as any)?.files?.length > 0) {
                        const fileId = (searchR.data as any).files[0].id;
                        const r = await executeTool("google_drive_deleter", { file_id: fileId });
                        preToolResult = { toolName: "google_drive_deleter", result: r };
                      } else {
                        preToolResult = { toolName: "google_drive_deleter", result: { success: false, error: `ملقتش ملف اسمه "${name}" في الـ Drive.` } };
                      }
                    } else {
                      preToolResult = { toolName: "google_drive_deleter", result: { success: false, error: "مينفعش أمسح من غير ما تقول اسم الملف." } };
                    }
                  } else if (hasActionVerb && (lowerText.includes("ارفع") || lowerText.includes("upload") || (lowerText.includes("احفظ") && lowerText.includes("drive")))) {
                    // رفع ملف نصي للـ Drive
                    sendPreStatus("بنفّذ أداة: رفع ملف للـ Drive", "executing");
                    const nameMatch = userText.match(/(?:باسم|اسمه)\s+(.+?)(?:\s+(?:المحتوى|بقيمة|واقرا|$))/i);
                    const fileName = nameMatch ? nameMatch[1].trim() : "ملف جديد.txt";
                    const contentMatch = userText.match(/(?:المحتوى|بقيمة|واقرا)\s*[:：]?\s*(.+)/is);
                    const content = contentMatch ? contentMatch[1].trim() : userText;
                    const r = await executeTool("google_drive_uploader", { name: fileName.slice(0, 100), content });
                    preToolResult = { toolName: "google_drive_uploader", result: r };
                  } else if (hasActionVerb && (lowerText.includes("فولدر") || lowerText.includes("مجلد") || lowerText.includes("folder"))) {
                    // إنشاء فولدر في Drive — بس اتأكد الأول لو موجود
                    sendPreStatus("بنفّذ أداة: إنشاء فولدر في Drive", "executing");
                    const name = userText.replace(/.*(اعمل|أنشئ|انشئ|حط|ضيف)\s*(لي)?\s*(فولدر|مجلد)\s*(باسم|اسمه)?[:\s]*/i, "").trim() || userText;
                    const cleanName = name.slice(0, 100) || "فولدر جديد";

                    // اتأكد لو الفولدر موجود الأول
                    const searchR = await executeTool("google_drive_file_search", { name: cleanName, file_type: "folder", max_results: 1 });
                    if (searchR.success && (searchR.data as any)?.files?.length > 0) {
                      // الفولدر موجود → رجّع اللينك بتاعه
                      const existingFolder = (searchR.data as any).files[0];
                      preToolResult = {
                        toolName: "google_drive_folder_creator",
                        result: { success: true, data: {
                          folder_id: existingFolder.id,
                          name: existingFolder.name,
                          link: existingFolder.link,
                          already_exists: true,
                          note: `الفولدر "${cleanName}" موجود بالفعل — مفيش حاجة اتعملت.`,
                        } },
                      };
                    } else {
                      // مش موجود → اعمله
                      const r = await executeTool("google_drive_folder_creator", { name: cleanName });
                      preToolResult = { toolName: "google_drive_folder_creator", result: r };
                    }
                  } else if (hasActionVerb && (lowerText.includes("دورلي") || lowerText.includes("ابحث") || (lowerText.includes("هاتلي") && (lowerText.includes("ملف") || lowerText.includes("pdf") || lowerText.includes("drive"))))) {
                    // بحث في Drive — بس لما يكون فيه فعل أمر واضح
                    sendPreStatus("بنفّذ أداة: البحث في Drive", "executing");
                    const name = userText.replace(/.*(دور|ابحث|لقي|هاتلي).*على\s*/i, "").replace(/(ملف|pdf|doc).*/i, "").trim() || userText;
                    const r = await executeTool("google_drive_file_search", { name });
                    preToolResult = { toolName: "google_drive_file_search", result: r };
                  } else if (hasActionVerb && (lowerText.includes("جدول") || lowerText.includes("مواعيد") || lowerText.includes("عندي ايه") || lowerText.includes("عندي إيه"))) {
                    // قراية الجدول
                    sendPreStatus("بنفّذ أداة: قراية الجدول", "executing");
                    const r = await executeTool("google_calendar_lister", {});
                    preToolResult = { toolName: "google_calendar_lister", result: r };
                  }
                });

                // لو نفّذنا أداة → خلي الـ LLM يـ format النتيجة بس
                if (preToolResult) {
                  // لو الأداة فشلت → رجّع الـ error مباشرة للمستخدم (بدون LLM)
                  // ده يمنع الـ LLM من الكذب وقال "تم" لما الأداة فشلت
                  if (!preToolResult.result.success) {
                    const errorMsg = preToolResult.result.error ?? "فشل تنفيذ الأداة.";
                    sendPreStatus("خلصت", "finalizing");
                    enqueueContent(errorMsg);
                    return;
                  }

                  /* ZAI removed */
                  const toolData = JSON.stringify(preToolResult.result.data ?? { ok: true });

                  const extraInfo = (preToolResult as any).extraInfo;
                  const extraStr = extraInfo ? `\nالوقت الفعلي للتذكير: ${extraInfo.actualTime}` : '';

                  const formatPrompt = `أنت Anzaro — مساعد بسيط. نفّذت أداة "${preToolResult.toolName}" بناءً على طلب المستخدم.

نتيجة الأداة (نجحت):
${toolData}${extraStr}

قواعد الرد:
1. اكتب رد واحد فقط — ممنوع التكرار بأي شكل.
2. استخدم البيانات من نتيجة الأداة فقط — ممنوع تخترع أي حاجة.
3. لو فيه رابط، حطه بالظبط من النتيجة.
4. الرد لازم يكون مختصر (2-3 أسطر كحد أقصى).
5. ممنوع تستخدم emoji أكثر من مرة.
6. ممنوع تقول "تم بنجاح" لو النتيجة مفيهاش تأكيد نجاح.

اكتب الرد الآن:`;

                  sendPreStatus("بكتب الرد النهائي...", "finalizing");
                  // استخدم الموديل المختار للـ formatting، ولو فشل → fallback لـ glm-4-flash
                  const formatModel = modelConfig?.realChatModel || modelConfig?.id || 'glm-4-flash';
                  const formatMaxTokens = Math.min(modelConfig?.maxTokens || 2048, 2048);
                  let completion: any;
                  try {
                    completion = await zai.chat.completions.create({
                      model: formatModel,
                      messages: [{ role: 'system', content: formatPrompt }],
                      stream: false,
                      temperature: 0.3,
                      max_tokens: formatMaxTokens,
                    } as any);
                  } catch (fmtErr) {
                    console.warn(`[Chat] Format model ${formatModel} failed, using fallback:`, fmtErr instanceof Error ? fmtErr.message : String(fmtErr));
                    completion = await zai.chat.completions.create({
                      model: 'glm-4-flash',
                      messages: [{ role: 'system', content: formatPrompt }],
                      stream: false,
                      temperature: 0.3,
                      max_tokens: 512,
                    } as any);
                  }
                  let reply = (completion as any).choices?.[0]?.message?.content ?? "تم التنفيذ.";
                  // clean up: شيل أي تكرار في الرد
                  reply = reply.replace(/(.{20,})\1{1,}/g, "$1"); // شيل التكرار
                  enqueueContent(reply.trim());
                  return;
                }
                // لو مفيش طلب واضح → كمل للـ tool-calling layer العادي
              } catch (preScanError) {
                console.warn('[Chat] Pre-scan layer failed:', preScanError instanceof Error ? preScanError.message : String(preScanError));
              }

              // ── TOOL-CALLING LAYER (LLM-driven) — fallback لو الـ pre-scan ملقش طلب ──
              try {
                const { runChatWithTools } = await import('@/lib/chat/chat-tool-calling');
                const { runWithContext } = await import('@/lib/request-context');
                const lastUserMsg = messages.filter((m: any) => m.role === 'user').slice(-1)[0];
                const userText = typeof lastUserMsg?.content === 'string'
                  ? lastUserMsg.content
                  : JSON.stringify(lastUserMsg?.content ?? '');

                const toolSystemPrompt = `أنت Anzaro — مساعد شخصي ذكي بيستخدم أدوات (tools) لحل مهام المستخدم.

═══ صلاحياتك (مهم جداً) ═══
المستخدم صاحب الحساب ووافق بنفسه على ربط Google وحسابات تانية مع منصتك.
كل الأدوات المتاحة دي أدوات المستخدم الشخصية — هو اللي عملها connect عشان تساعده.
لما المستخدم يطلب "هاتلي رقم فلان" أو "اقرا ملفاتي" أو "ضيف مهمة" — إنت بتشتغل نيابة عنه في حسابه هو.
**مفيش أي انتهاك خصوصية** — إنت بتـ execute أوامر المستخدم في بياناته هو.
لو رفضت تنفّذ أداة متاحة لأنك "بتحترم الخصوصية"، إنت بتعطل المنصة كلها.
الأدوات دي أُذن لها من المستخدم — نفّذها بدون تردد.

طريقة عملك:
1. لو سؤال المستخدم محتاج معلومة خارجية أو فعل → استدعِ الأداة المناسبة.
2. شوف نتيجة الأداة، ولو محتاج أداة تانية → استدعِها.
3. بعد ما تجمع المعلومات، اكتب الإجابة النهائية بالعربية.

═══ إمتى لازم تستدعي أداة (مهم جداً) ═══
**مطلوب** تستدعي أداة لو طلب المستخدم فيه أي من الكلمات/المعاني دي:
- تذكير/موعد/اجتماع/ميتب → google_calendar_reminder أو google_calendar_lister
- مهمة/تاسك/اعمل/ضيف/سجل → google_tasks_manager أو google_sheets_logger
- رقم/هاتف/اتصال/جهة اتصال → google_contacts_reader
- ملف/pdf/doc/drive/اقرا → google_drive_file_search أو google_drive_pdf_reader أو google_docs_reader
- مستند/doc/اكتب document → google_docs_writer
- شيت/sheet/جدول بيانات → google_sheets_reader أو google_sheets_logger
- افتكر/ذاكرة/احفظ → manage_chat_memory

**ممنوع** ترد بدون أداة لو طلب المستخدم فيه أي حاجة من فوق. لو رجعت نص عشوائي بدون أداة، إنت بتخترع حاجات (hallucination) وده خطر.

**لو الطلب عام** (سؤال معلومات، سلام، دردشة) → رد بدون أداة عادي.

═══ قاعدة التأكيد (مهمة جداً) ═══
بعد ما تـ execute أي أداة، ** لازم ** تشرح للمستخدم بالظبط إيه اللي حصل:
- لو حطيت تذكير/موعد → قول: "حطيت لك تذكير [العنوان] يوم [التاريخ] الساعة [الوقت بالظبط]، هيوصلك إشعار قبلها بـ [X] دقيقة" + اللينك
- لو ضفت مهمة → قول: "ضفت مهمة '[العنوان]' في قائمة مهامك [لو فيه due: بموعد كذا]"
- لو أنشأت Doc → قول: "أنشأت مستند '[العنوان]' — تقدر تفتحه من [اللينك]"
- لو لقيت نتائج → قول العدد + أهم النتايج
- ممنوع تقول "تم" أو "خلاص" من غير ما تشرح بالظبط إيه اللي اتعمل.

═══ تفسير النية (مهم جداً) ═══
المستخدم بيتكلم مع مساعد ذكي، مش بيسأل سؤال نظري. لو قال:
- "هل يمكنني إضافة مهام؟" → هو عاوزك تضيف مهمة (مش شرح نظري)
- "هل تقدر تحط تذكير؟" → هو عاوزك تحط تذكير
- "ممكن تقرا ملفاتي؟" → هو عاوزك تقرا ملفاته
- "اعرف ازاي احط مهمة" → ده الوحيد اللي يطلب شرح

**القاعدة:** لو السؤال فيه "هل يمكنني/هل تقدر/ممكن" + فعل (إضافة/حط/اقرا) → نفّذ الفعل، ماتشرحش نظري.
لو رجعت شرح نظري بدل التنفيذ، إنت بتخدع المستخدم.

═══ التعامل مع الوقت (مهم جداً) ═══
- المنطقة الزمنية بتاعة المستخدم: Africa/Cairo (UTC+2 أو UTC+3 حسب daylight saving)
- لما المستخدم يقول "الساعة 7" → اسأل نفسك: 7 الصبح ولا 7 المساء؟ لو مش واضح، استخدم 7 المساء (19:00) كافتراضي
- لو قال "الساعة 7 و 5 دقايق" → معناها 7:05 (وليس 7:50)
- بعد ما تحط التذكير، قول الوقت **بالشكل الواضح**: "الساعة 7:05 مساءً (19:05)" مش بس "19:05"

قواعد:
- مفيش كلمات ثابتة — إنت اللي بتقرر.
- لو الأداة رجّعت "حساب Google غير مربوط" → قول للمستخدم يربط حسابه.
- **ممنوع ترفض تنفيذ أداة متاحة**.
- **ممنوع ترجع شرح نظري لو المستخدم طلب فعل** — نفّذه.`;

                const sendStatus = (status: string, phase?: string) => {
                  if (streamClosed) return;
                  const encoder = new TextEncoder();
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ backendStatus: status, phase })}\n\n`));
                  console.log(`[Chat] backend_status: ${status}`);
                };

                const toolResult = await runWithContext(request, async () => {
                  // استخدم الموديل المختار بدل GLM-4-Flash الثابت
                  // + maxTokens من الـ model config (ديناميكي حسب الموديل)
                  const selectedModel = modelConfig?.realChatModel || modelConfig?.id || 'glm-4-flash';
                  const selectedMaxTokens = modelConfig?.maxTokens || 8192;
                  return runChatWithTools(userText, selectedModel, toolSystemPrompt, [], sendStatus, selectedMaxTokens);
                });

                if (toolResult.usedTools && toolResult.finalContent) {
                  console.log(`[Chat] Tool-calling used: ${toolResult.toolsExecuted.join(', ')}`);
                  enqueueContent(toolResult.finalContent);
                  return;
                }
                console.log('[Chat] Tool-calling: no tools needed, streaming normally');
              } catch (toolError) {
                console.warn('[Chat] Tool-calling layer failed:',
                  toolError instanceof Error ? toolError.message : String(toolError));
              }

              const completionRequest: any = {
                model: glmModel || 'glm-5.2',
                messages,
                stream: true,
                thinking: { type: 'enabled' },
                max_tokens: 65536,
                temperature: 1.0,
              };
              console.log(`[Chat] ZAI request: model=${completionRequest.model}, thinking=enabled, max_tokens=65536`);
              const completion = await zai.chat.completions.create(completionRequest);
              for await (const chunk of completion) {
                if (streamClosed) break;
                let chunkStr: string;
                if (typeof chunk === 'string') {
                  chunkStr = chunk;
                } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
                  chunkStr = new TextDecoder().decode(chunk);
                } else if (chunk && typeof chunk === 'object') {
                  const content = chunk.choices?.[0]?.delta?.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
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
                    if (content) {
                      enqueueContent(content);
                    }
                  } catch { /* skip */ }
                }
              }
            }

            // ── Helper: stream from Pollinations ──
            async function streamFromPollinations() {
              if (!pollinationsEntry) throw new Error('No Pollinations mapping');
              const pollinationsMessages: PollinationsChatMessage[] = messages.map((m: any) => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              }));
              console.log(`[Chat] Using Pollinations model: ${pollinationsEntry.pollinationsModel} (${pollinationsEntry.label}) for frontend model: ${model}`);
              const chunkStream = await streamChatCompletion({
                messages: pollinationsMessages,
                model: pollinationsEntry.pollinationsModel as any,
                temperature: 0.7,
                systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
              });
              for await (const chunk of chunkStream) {
                if (streamClosed) break;
                const content = chunk.choices?.[0]?.delta?.content || '';
                if (content) {
                  enqueueContent(content);
                }
              }
            }

            // ── FIRST PRIORITY: ZAI (GLM-5.2 / GLM-4-Flash) — العميل الأساسي ──
            // V.17: Re-enabled ZAI for zhipuai models ONLY (عبس + glm-4-flash)
            // Other models use their own providers (HuggingFace, Groq, etc.)
            if (primaryProvider === 'zhipuai') {
              console.log(`[Chat] Using ZAI directly — model=${model}, provider=zhipuai`);
              try {
                const { getZAIClient } = await import('@/lib/chat-utils');
                const zai = await getZAIClient();
                const zaiModel = modelConfig.glmModel || model || 'glm-4-flash';
                console.log(`[Chat] ZAI streaming: model=${zaiModel}`);

                const streamResponse = await zai.chat.completions.create({
                  model: zaiModel,
                  messages: messages as any,
                  stream: true,
                  temperature: 0.7,
                  max_tokens: 8192,
                });

                // The ZAI proxy returns an async iterable (not a ReadableStream)
                // So we use for-await to consume it
                if (streamResponse && typeof streamResponse[Symbol.asyncIterator] === 'function') {
                  for await (const chunk of streamResponse) {
                    if (streamClosed) break;
                    const delta = chunk?.choices?.[0]?.delta?.content || '';
                    if (delta) {
                      enqueueContent(delta);
                    }
                  }
                } else if (streamResponse?.body?.getReader) {
                  // Fallback: real ReadableStream (if ZAI SDK returns one)
                  const reader = streamResponse.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = '';
                  while (true) {
                    if (streamClosed) break;
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || !trimmed.startsWith('data:')) continue;
                      const data = trimmed.slice(5).trim();
                      if (data === '[DONE]') continue;
                      try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) enqueueContent(delta);
                      } catch {}
                    }
                  }
                }

                // Stream complete — but DON'T close yet if image/video generation is in progress
                // V.25: Wait for imageGenPromise/videoGenPromise before closing
                if (!streamClosed) {
                  // Check if we need to wait for image/video generation
                  if (imageGenPromise || videoGenPromise) {
                    console.log('[Chat] Stream done, waiting for media generation before close...');
                    // Don't close — let the post-stream code handle it
                  } else {
                    streamClosed = true;
                    try {
                      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                      controller.close();
                    } catch {
                      // already closed
                    }
                  }
                }
              } catch (zaiError) {
                console.warn('[Chat] ZAI failed:', zaiError instanceof Error ? zaiError.message : String(zaiError));
                
                // ── If ZAI failed due to insufficient balance (429), send a clear error ──
                const errMsg = zaiError instanceof Error ? zaiError.message : String(zaiError);
                const isBalanceError = errMsg.includes('429') || errMsg.includes('余额') || errMsg.includes('insufficient');
                
                if (isBalanceError && hasImageAttachments) {
                  // Vision failed — send clear error to user
                  if (!streamClosed) {
                    enqueueContent('⚠️ تعذر تحليل الصورة — رصيد ZAI API غير كافٍ. تحليل الصور يحتاج رصيد مدفوع. حاول بنص فقط أو أضف رصيد لـ ZAI API.');
                  }
                } else if (pollinationsEntry) {
                  // fallback لـ Pollinations لو ZAI فشل
                  console.log('[Chat] Falling back to Pollinations');
                  try { await streamFromPollinations(); } catch {}
                }
              }
            } else if (primaryProvider === 'anthropic') {
              // ── ANTHROPIC (Claude) — Claude Sonnet/Opus/Haiku ──
              console.log(`[Chat] Using Anthropic Claude directly — model=${model}`);
              try {
                const { streamClaudeChat, isClaudeAvailable } = await import('@/lib/anthropic');

                if (!isClaudeAvailable()) {
                  throw new Error('ANTHROPIC_API_KEY not configured — cannot use Claude models');
                }

                const claudeMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamClaudeChat({
                  messages: claudeMessages,
                  model: modelConfig.realChatModel as any,
                  temperature: 0.7,
                  max_tokens: 8192,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  if (chunk.type === 'content' && chunk.content) {
                    enqueueContent(chunk.content);
                  } else if (chunk.type === 'thinking' && chunk.thinking) {
                    // Send thinking as a separate event (UI can show it collapsibly)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", content: chunk.thinking })}\n\n`));
                  }
                }
              } catch (claudeError) {
                console.warn('[Chat] Claude failed:', claudeError instanceof Error ? claudeError.message : String(claudeError));
                // fallback لـ ZAI (GLM) لو Claude فشل
                console.log('[Chat] Falling back to ZAI (GLM-5.2)');
                /* no ZAI fallback — user model only */
              }
            } else if (primaryProvider === 'pollinations' && pollinationsEntry) {
              console.log('[Chat] Direct Pollinations routing (free, no API key needed)');
              try {
                await streamFromPollinations();
              } catch (pollError) {
                console.warn('[Chat] Pollinations failed:', pollError instanceof Error ? pollError.message : String(pollError));
                /* no ZAI fallback — user model only */
              }
            } else if (primaryProvider === 'ovh') {
              // ── OVHcloud AI Endpoints — مجاني 100% بدون API key ──
              console.log('[Chat] Direct OVHcloud routing (free, no API key needed)');
              try {
                const ovhMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));
                const ovhRes = await fetch('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: modelConfig.realChatModel,
                    messages: ovhMessages,
                    stream: true,
                    max_tokens: 4000,
                  }),
                });
                if (!ovhRes.ok) throw new Error(`OVH HTTP ${ovhRes.status}`);
                if (!ovhRes.body) throw new Error('OVH no body');
                const ovhReader = ovhRes.body.getReader();
                const ovhDecoder = new TextDecoder();
                let ovhBuffer = '';
                while (true) {
                  if (streamClosed) break;
                  const { done, value } = await ovhReader.read();
                  if (done) break;
                  ovhBuffer += ovhDecoder.decode(value, { stream: true });
                  const lines = ovhBuffer.split('\n');
                  ovhBuffer = lines.pop() ?? '';
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const payload = trimmed.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                      const parsed = JSON.parse(payload);
                      const content = parsed?.choices?.[0]?.delta?.content || '';
                      if (content) enqueueContent(content);
                    } catch {}
                  }
                }
              } catch (ovhError) {
                console.warn('[Chat] OVHcloud failed:', ovhError instanceof Error ? ovhError.message : String(ovhError));
                // fallback لـ Pollinations
                if (pollinationsEntry) {
                  try { await streamFromPollinations(); } catch {}
                } else {
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (cerebrasAlreadyHandled) {
              // Cerebras already streamed successfully — skip provider routing entirely
              console.log('[Chat] Cerebras already handled stream — skipping provider routing');
            } else if (primaryProvider === 'openai' && isOpenAIChatModel(model)) {
              // ── OpenAI GPT-4o Streaming Path ──
              if (!OPENAI_API_KEY) {
                console.log('[Chat] No OPENAI_API_KEY, falling back to OpenRouter/Pollinations for GPT-4o');
                // Fall back to OpenRouter → Pollinations → ZhipuAI
                if (OPENROUTER_API_KEY && isProviderHealthy('openrouter')) {
                  try {
                    const orMapping = getOpenRouterChatModelMapping(model);
                    if (orMapping) {
                      const orMessages = messages.map((m: any) => ({
                        role: m.role as 'system' | 'user' | 'assistant',
                        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                      }));
                      console.log(`[Chat] Using OpenRouter fallback for GPT-4o: ${orMapping.openrouterModel} (${orMapping.label})`);
                      const chunkStream = streamOpenRouterChat({
                        messages: orMessages,
                        model: orMapping.openrouterModel as any,
                        temperature: 0.7,
                      });
                      for await (const chunk of chunkStream) {
                        if (streamClosed) break;
                        const content = chunk.choices?.[0]?.delta?.content || '';
                        if (content) { enqueueContent(content); }
                      }
                    }
                  } catch (orError) {
                    console.warn('[Chat] OpenRouter fallback for GPT-4o failed:', orError instanceof Error ? orError.message : String(orError));
                    try { await streamFromPollinations(); } catch { /* no ZAI fallback — user model only */ }
                  }
                } else if (pollinationsEntry) {
                  try { await streamFromPollinations(); } catch { /* no ZAI fallback — user model only */ }
                } else {
                  /* no ZAI fallback — user model only */
                }
              } else {
                try {
                  const openaiMapping = getOpenAIChatModelMapping(model);
                  const openaiModel = openaiMapping!.openaiModel;

                  const openaiMessages = messages.map((m: any) => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  }));

                  console.log(`[Chat] Using OpenAI model: ${openaiModel} (${openaiMapping!.label}) for frontend model: ${model}`);

                  const chunkStream = streamOpenAIChat({
                    messages: openaiMessages,
                    model: openaiModel as any,
                    temperature: 0.7,
                  });

                  for await (const chunk of chunkStream) {
                    if (streamClosed) break;
                    const content = chunk.choices?.[0]?.delta?.content || '';
                    if (content) { enqueueContent(content); }
                  }
                  reportAggregatorSuccess('openai', 'chat', Date.now() - streamStartTime);
                } catch (openaiError) {
                  markProviderFailed('openai');
                  reportAggregatorFailure('openai', 'chat', openaiError instanceof Error ? openaiError.message : String(openaiError));
                  console.warn('[Chat] OpenAI streaming failed, falling back to OpenRouter:', openaiError instanceof Error ? openaiError.message : String(openaiError));

                  // Try OpenRouter fallback
                  if (OPENROUTER_API_KEY && isProviderHealthy('openrouter')) {
                    try {
                      const orMapping = getOpenRouterChatModelMapping(model);
                      if (orMapping) {
                        const orMessages = messages.map((m: any) => ({
                          role: m.role as 'system' | 'user' | 'assistant',
                          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                        }));
                        const chunkStream = streamOpenRouterChat({
                          messages: orMessages,
                          model: orMapping.openrouterModel as any,
                          temperature: 0.7,
                        });
                        for await (const chunk of chunkStream) {
                          if (streamClosed) break;
                          const content = chunk.choices?.[0]?.delta?.content || '';
                          if (content) { enqueueContent(content); }
                        }
                      }
                    } catch (orError2) {
                      markProviderFailed('openrouter');
                      console.warn('[Chat] OpenRouter also failed, falling back to Pollinations:', orError2 instanceof Error ? orError2.message : String(orError2));
                      try { await streamFromPollinations(); } catch { /* no ZAI fallback — user model only */ }
                    }
                  } else if (pollinationsEntry) {
                    try { await streamFromPollinations(); } catch { /* no ZAI fallback — user model only */ }
                  } else {
                    /* no ZAI fallback — user model only */
                  }
                }
              }
            } else if (useZhipuAIForVision) {
              // ── ZhipuAI Streaming Path (ONLY for vision models with actual images) ──
              // Text-only requests from zhipuai models should use Pollinations for speed
              if (!isProviderHealthy('zhipuai')) {
                console.log('[Chat] Skipping ZhipuAI vision (recently failed), trying Pollinations fallback');
              }
              try {
                if (!isProviderHealthy('zhipuai')) throw new Error('Skipping unhealthy provider');
                /* ZAI removed */
                reportAggregatorSuccess('zhipuai', 'chat', Date.now() - streamStartTime);
              } catch (zhipuError) {
                if (zhipuError instanceof Error && zhipuError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('zhipuai');
                  reportAggregatorFailure('zhipuai', 'chat', zhipuError instanceof Error ? zhipuError.message : String(zhipuError));
                }
                console.warn('[Chat] ZhipuAI streaming failed, falling back to Pollinations:', zhipuError instanceof Error ? zhipuError.message : String(zhipuError));
                // Fall through to Pollinations if ZhipuAI fails
                if (pollinationsEntry) {
                  try {
                    await streamFromPollinations();
                  } catch (pollErr) {
                    console.warn('[Chat] Pollinations fallback also failed:', pollErr instanceof Error ? pollErr.message : String(pollErr));
                  }
                }
              }
            } else if (primaryProvider === 'gemini') {
              // ── Gemini Streaming Path ──
              if (!GEMINI_API_KEY) {
                console.log('[Chat] Skipping Gemini (no API key), using Pollinations/ZhipuAI');
              } else if (!isProviderHealthy('gemini')) {
                console.log('[Chat] Skipping Gemini (recently failed), falling back to Pollinations/ZhipuAI');
              }
              if (!GEMINI_API_KEY) {
                // No API key — skip directly to fallback
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                if (!isProviderHealthy('gemini')) throw new Error('Skipping unhealthy provider');
                const geminiMapping = getGeminiChatModelMapping(model);
                const geminiModel = geminiMapping.geminiModel;

                const hasGeminiImages = parsed.attachments.some((a) => a.type === 'image');
                const useGeminiVision = hasGeminiImages && modelConfig.capabilities.vision;

                if (useGeminiVision) {
                  // ── Gemini Vision Streaming Path ──
                  // Build Gemini-format messages with inlineData for images
                  console.log(`[Chat] Using Gemini Vision: model=${geminiModel}, images=${parsed.attachments.filter(a => a.type === 'image').length}`);

                  // Build Gemini contents
                  const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

                  // Add conversation history as text
                  for (const msg of conversationMessages) {
                    geminiContents.push({
                      role: msg.role === 'assistant' ? 'model' : 'user',
                      parts: [{ text: msg.content }],
                    });
                  }

                  // Build the user message with images
                  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

                  // Add text content
                  const cleanedMsg = parsed.cleanedMessage || message;
                  if (cleanedMsg) {
                    userParts.push({ text: cleanedMsg });
                  }

                  // Add each image as inlineData
                  const imageAttachments = parsed.attachments.filter((a) => a.type === 'image');
                  for (const img of imageAttachments) {
                    if (img.content) {
                      // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
                      const matches = img.content.match(/^data:([^;]+);base64,(.+)$/);
                      if (matches) {
                        userParts.push({
                          inlineData: {
                            mimeType: matches[1],
                            data: matches[2],
                          },
                        });
                      }
                    }
                  }

                  geminiContents.push({ role: 'user', parts: userParts });

                  // Build request body
                  const requestBody: Record<string, unknown> = {
                    contents: geminiContents,
                    systemInstruction: {
                      parts: [{ text: systemPrompt }],
                    },
                    generationConfig: {
                      temperature: 0.7,
                      maxOutputTokens: 8192,
                    },
                    safetySettings: [
                      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                    ],
                  };

                  // Stream using Gemini SSE endpoint directly
                  const GEMINI_API_KEY_VAL = process.env.GEMINI_API_KEY || '';
                  const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
                  const url = `${GEMINI_API_BASE_URL}/models/${geminiModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY_VAL}`;

                  const geminiResponse = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                  });

                  if (!geminiResponse.ok) {
                    const errorText = await geminiResponse.text().catch(() => '');
                    throw new Error(`Gemini vision streaming error ${geminiResponse.status}: ${errorText.slice(0, 200)}`);
                  }

                  const geminiBody = geminiResponse.body as ReadableStream<Uint8Array>;
                  if (geminiBody) {
                    const geminiReader = geminiBody.getReader();
                    const geminiDecoder = new TextDecoder();
                    let geminiBuffer = '';

                    while (true) {
                      const { done, value } = await geminiReader.read();
                      if (done) break;

                      geminiBuffer += geminiDecoder.decode(value, { stream: true });
                      const lines = geminiBuffer.split('\n');
                      geminiBuffer = lines.pop() || '';

                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data:')) continue;
                        const dataStr = trimmed.slice(5).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;

                        try {
                          const chunk = JSON.parse(dataStr);
                          const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                          if (content) {
                            enqueueContent(content);
                          }
                        } catch { /* skip unparseable SSE lines */ }
                      }
                    }
                  }
                } else {
                  // ── Original Gemini Text-Only Streaming Path ──
                  console.log(`[Chat] Using Gemini model: ${geminiModel} (${geminiMapping.label}) for frontend model: ${model}`);

                  // Convert messages to Gemini format
                  const geminiMessages = messages.map((m: any) => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  }));

                  // Extract system prompt from messages for Gemini's systemInstruction
                  const systemMessage = geminiMessages.find((m: any) => m.role === 'system');
                  const systemInstruction = systemMessage?.content;
                  const nonSystemMessages = geminiMessages.filter((m: any) => m.role !== 'system');

                  const chunkStream = streamGeminiChat({
                    messages: nonSystemMessages,
                    model: geminiModel as any,
                    temperature: 0.7,
                    maxOutputTokens: 8192, // Increased from 2048 — code generation needs more tokens
                    systemInstruction,
                  });

                  for await (const chunk of chunkStream) {
                    if (streamClosed) break;
                    const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (content) {
                      enqueueContent(content);
                    }
                  }
                }
                reportAggregatorSuccess('gemini', 'chat', Date.now() - streamStartTime);
              } catch (geminiError) {
                // Gemini failed — fall back to Pollinations
                if (geminiError instanceof Error && geminiError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('gemini');
                  reportAggregatorFailure('gemini', 'chat', geminiError instanceof Error ? geminiError.message : String(geminiError));
                }
                console.warn('[Chat] Gemini streaming failed, falling back to Pollinations:', geminiError instanceof Error ? geminiError.message : String(geminiError));
                try { recordError('/api/chat/stream/gemini-fallback', geminiError instanceof Error ? geminiError.message : 'Gemini streaming failed'); } catch { /* non-critical */ }

                // Fall through to Pollinations
                if (pollinationsEntry) {
                  try {
                    const pollinationsMessages: PollinationsChatMessage[] = messages.map((m: any) => ({
                      role: m.role as 'system' | 'user' | 'assistant',
                      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    }));

                    const chunkStream = await streamChatCompletion({
                      messages: pollinationsMessages,
                      model: pollinationsEntry.pollinationsModel as any,
                      temperature: 0.7,
                      systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
                    });

                    for await (const chunk of chunkStream) {
                      if (streamClosed) break;
                      const content = chunk.choices?.[0]?.delta?.content || '';
                      if (content) {
                        enqueueContent(content);
                      }
                    }
                  } catch (pollinationsError) {
                    // Pollinations also failed — fall back to ZhipuAI
                    console.warn('[Chat] Pollinations fallback also failed, falling back to ZhipuAI:', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
                    // REFACTOR: Use streamFromZhipuAI() instead of duplicating the parsing code
                    /* no ZAI fallback — user model only */
                  }
                } else {
                  // No Pollinations mapping — fall back directly to ZhipuAI
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (primaryProvider === 'github') {
              // ── GitHub Models Streaming Path ──
              if (!GITHUB_API_KEY) {
                console.log('[Chat] Skipping GitHub Models (no API key), using Pollinations/ZhipuAI');
              } else if (!isProviderHealthy('github')) {
                console.log('[Chat] Skipping GitHub Models (recently failed), falling back to Pollinations/ZhipuAI');
              }
              if (!GITHUB_API_KEY) {
                // No API key — skip directly to fallback
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                if (!isProviderHealthy('github')) throw new Error('Skipping unhealthy provider');
                const githubMapping = getGitHubChatModelMapping(model);
                const githubModel = githubMapping.githubModel;

                console.log(`[Chat] Using GitHub Models: ${githubModel} (${githubMapping.label}) for frontend model: ${model}`);

                const githubMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamGitHubChat({
                  messages: githubMessages,
                  model: githubModel as any,
                  temperature: 0.7,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  const content = chunk.choices?.[0]?.delta?.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
                }
                reportAggregatorSuccess('github', 'chat', Date.now() - streamStartTime);
              } catch (githubError) {
                // GitHub Models failed — fall back to Pollinations → ZhipuAI
                if (githubError instanceof Error && githubError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('github');
                  reportAggregatorFailure('github', 'chat', githubError instanceof Error ? githubError.message : String(githubError));
                }
                console.warn('[Chat] GitHub Models streaming failed, falling back to Pollinations:', githubError instanceof Error ? githubError.message : String(githubError));
                try { recordError('/api/chat/stream/github-fallback', githubError instanceof Error ? githubError.message : 'GitHub Models streaming failed'); } catch { /* non-critical */ }

                // Fall through to Pollinations
                if (pollinationsEntry) {
                  try {
                    const pollinationsMessages: PollinationsChatMessage[] = messages.map((m: any) => ({
                      role: m.role as 'system' | 'user' | 'assistant',
                      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    }));

                    const chunkStream = await streamChatCompletion({
                      messages: pollinationsMessages,
                      model: pollinationsEntry.pollinationsModel as any,
                      temperature: 0.7,
                      systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
                    });

                    for await (const chunk of chunkStream) {
                      if (streamClosed) break;
                      const content = chunk.choices?.[0]?.delta?.content || '';
                      if (content) {
                        enqueueContent(content);
                      }
                    }
                  } catch (pollinationsError) {
                    console.warn('[Chat] Pollinations fallback also failed, falling back to ZhipuAI:', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
                    /* ZAI removed */
                  }
                } else {
                  /* ZAI removed */
                }
              }
            } else if (primaryProvider === 'cloudflare' || isCloudflareChatModel(model)) {
              // ── Cloudflare Workers AI Streaming Path (مجاني طول العمر) ──
              if (!CF_API_TOKEN) {
                console.log('[Chat] Skipping Cloudflare (no API token), using fallback');
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                const cfMapping = getCloudflareChatModelMapping(model);
                if (!cfMapping) throw new Error(`No Cloudflare mapping for model: ${model}`);
                const cfModel = cfMapping.cfModel;

                console.log(`[Chat] Using Cloudflare model: ${cfModel} for frontend model: ${model}`);

                // Convert messages to Cloudflare format
                const cfMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamCloudflareChat({
                  messages: cfMessages,
                  model: cfModel as any,
                  temperature: 0.7,
                  max_tokens: cfMapping.maxTokens,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  const content = chunk.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
                }
                reportAggregatorSuccess('cloudflare', 'chat', Date.now() - streamStartTime);
              } catch (cfError) {
                // Cloudflare failed — fall back to Pollinations → ZhipuAI
                if (cfError instanceof Error) {
                  markProviderFailed('cloudflare');
                  reportAggregatorFailure('cloudflare', 'chat', cfError.message);
                }
                console.warn('[Chat] Cloudflare streaming failed, trying fallback:', cfError instanceof Error ? cfError.message : String(cfError));
                try { recordError('/api/chat/stream/cloudflare-fallback', cfError instanceof Error ? cfError.message : 'Cloudflare streaming failed'); } catch { /* non-critical */ }
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (primaryProvider === 'groq') {
              // ── Groq Streaming Path (Ultra-Fast) ──
              if (!GROQ_API_KEY) {
                console.log('[Chat] Skipping Groq (no API key), using Pollinations/ZhipuAI');
              } else if (!isProviderHealthy('groq')) {
                console.log('[Chat] Skipping Groq (recently failed), falling back to Gemini/Pollinations/ZhipuAI');
              }
              if (!GROQ_API_KEY) {
                // No API key — skip directly to fallback
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                if (!isProviderHealthy('groq')) throw new Error('Skipping unhealthy provider');
                const groqMapping = getGroqChatModelMapping(model);
                const groqModel = groqMapping.groqModel;

                console.log(`[Chat] Using Groq model: ${groqModel} (${groqMapping.label}) for frontend model: ${model}`);

                // Convert messages to Groq format
                const groqMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamGroqChat({
                  messages: groqMessages,
                  model: groqModel as any,
                  temperature: 0.7,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  const content = chunk.choices?.[0]?.delta?.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
                }
                reportAggregatorSuccess('groq', 'chat', Date.now() - streamStartTime);
              } catch (groqError) {
                // Groq failed — fall back to Gemini → Pollinations → ZhipuAI
                if (groqError instanceof Error && groqError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('groq');
                  reportAggregatorFailure('groq', 'chat', groqError instanceof Error ? groqError.message : String(groqError));
                }
                console.warn('[Chat] Groq streaming failed, trying Gemini fallback:', groqError instanceof Error ? groqError.message : String(groqError));
                try { recordError('/api/chat/stream/groq-fallback', groqError instanceof Error ? groqError.message : 'Groq streaming failed'); } catch { /* non-critical */ }

                // ── Try Gemini as first fallback (real provider, more reliable) ──
                let geminiFallbackUsed = false;
                try {
                  console.log('[Chat] Attempting Gemini fallback with gemini-2.0-flash');
                  const geminiMessages = messages.map((m: any) => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  }));
                  const systemMessage = geminiMessages.find((m: any) => m.role === 'system');
                  const systemInstruction = systemMessage?.content;
                  const nonSystemMessages = geminiMessages.filter((m: any) => m.role !== 'system');

                  const geminiChunkStream = streamGeminiChat({
                    messages: nonSystemMessages,
                    model: 'gemini-2.0-flash' as any,
                    temperature: 0.7,
                    maxOutputTokens: 8192, // Increased from 2048 — code generation needs more tokens
                    systemInstruction,
                  });

                  for await (const chunk of geminiChunkStream) {
                    if (streamClosed) break;
                    const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (content) {
                      enqueueContent(content);
                    }
                  }
                  // FIX: Only mark as "used" if we actually received content
                  if (accumulatedContent.length > 0) {
                    geminiFallbackUsed = true;
                  }
                } catch (geminiFallbackError) {
                  console.warn('[Chat] Gemini fallback also failed, trying Pollinations:', geminiFallbackError instanceof Error ? geminiFallbackError.message : String(geminiFallbackError));
                }

                // ── If Gemini fallback didn't produce content, try Pollinations ──
                // FIX: Check both geminiFallbackUsed AND whether we have accumulated content
                // to avoid skipping Pollinations when Gemini returned empty without error
                if ((!geminiFallbackUsed || accumulatedContent.length === 0) && pollinationsEntry) {
                  try {
                    const pollinationsMessages: PollinationsChatMessage[] = messages.map((m: any) => ({
                      role: m.role as 'system' | 'user' | 'assistant',
                      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    }));

                    const chunkStream = await streamChatCompletion({
                      messages: pollinationsMessages,
                      model: pollinationsEntry.pollinationsModel as any,
                      temperature: 0.7,
                      systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
                    });

                    for await (const chunk of chunkStream) {
                      if (streamClosed) break;
                      const content = chunk.choices?.[0]?.delta?.content || '';
                      if (content) {
                        enqueueContent(content);
                      }
                    }
                  } catch (pollinationsError) {
                    // Pollinations also failed — fall back to ZhipuAI
                    console.warn('[Chat] Pollinations fallback also failed, falling back to ZhipuAI:', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
                    /* no ZAI fallback — user model only */
                  }
                } else if (!geminiFallbackUsed) {
                  // No Pollinations mapping — fall back directly to ZhipuAI
                  console.warn('[Chat] No Pollinations mapping and Gemini failed, using ZhipuAI');
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (primaryProvider === 'huggingface') {
              // ── Custom Endpoint Streaming Path (from Aggregator) ──
              if (customModelConfig) {
                try {
                  const customMessages = messages.map((m: any) => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  }));

                  // Build the full URL — append /chat/completions for OpenAI-compatible endpoints only
                  let customUrl = customModelConfig.baseUrl;
                  // Note: hf-inference format should NOT get /chat/completions appended
                  // HF Inference uses different format (inputs field, not messages)
                  if (customModelConfig.apiFormat === 'openai' && !customUrl.includes('/chat/completions')) {
                    customUrl = customUrl.replace(/\/+$/, '') + '/chat/completions';
                  }
                  const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
                  if (customModelConfig.apiKey) {
                    if (customModelConfig.authType === 'bearer') customHeaders['Authorization'] = `Bearer ${customModelConfig.apiKey}`;
                    else if (customModelConfig.authType === 'x-api-key') customHeaders[customModelConfig.authHeader || 'x-api-key'] = customModelConfig.apiKey;
                    else if (customModelConfig.authType === 'custom' && customModelConfig.authHeader) customHeaders[customModelConfig.authHeader] = customModelConfig.apiKey;
                  }

                  const response = await fetch(customUrl, {
                    method: 'POST',
                    headers: customHeaders,
                    body: JSON.stringify({
                      model: customModelConfig.modelId || hfDirectModelId || 'default',
                      messages: customMessages,
                      stream: true,
                      temperature: 0.7,
                    }),
                    signal: AbortSignal.timeout(120_000),
                  });

                  if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    throw new Error(`Custom endpoint returned ${response.status}: ${errText.slice(0, 200)}`);
                  }

                  const reader = response.body?.getReader();
                  if (!reader) throw new Error('No response body from custom endpoint');

                  const decoder = new TextDecoder();
                  let buffer = '';

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done || streamClosed) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || !trimmed.startsWith('data:')) continue;
                      const dataStr = trimmed.slice(5).trim();
                      if (dataStr === '[DONE]') continue;
                      try {
                        const parsed = JSON.parse(dataStr);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) enqueueContent(content);
                      } catch { /* skip malformed SSE */ }
                    }
                  }

                  reportAggregatorSuccess('custom', 'chat', Date.now() - streamStartTime);
                } catch (customErr) {
                  reportAggregatorFailure('custom', 'chat', customErr instanceof Error ? customErr.message : String(customErr));
                  console.warn('[Chat] Custom endpoint failed, falling back to Pollinations/ZhipuAI:', customErr instanceof Error ? customErr.message : String(customErr));
                  try { await streamFromPollinations(); } catch {
                    /* no ZAI fallback — user model only */
                  }
                }
              } else
              // ── HuggingFace Streaming Path (Enhanced with 190 models + Load Balancer) ──
              // NOTE: HuggingFace Router API works WITHOUT an API key (free tier with rate limits)
              // So we don't skip it even if HF_API_TOKEN is empty
              if (!isProviderHealthy('huggingface')) {
                console.log('[Chat] Skipping HuggingFace (recently failed), falling back to Pollinations/ZhipuAI');
              }
              try {
                if (!isProviderHealthy('huggingface')) throw new Error('Skipping unhealthy provider');
                const hfMapping = getHFChatModelMapping(model);
                const hfModelId = hfMapping?.hfModel;
                // Build HF messages array
                const hfMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const effectiveHfModelId = isHFDirectModel ? hfDirectModelId : hfModelId;
                if (effectiveHfModelId && (isHFDirectModel || getChatModelById(effectiveHfModelId))) {
                  // Use the new 190-model service with load balancer
                  console.log(`[Chat] Using HF Chat Service (190 models): ${effectiveHfModelId} for frontend model: ${model}`);
                  const chunkStream = streamHFChatCompletion(
                    hfMessages,
                    effectiveHfModelId,
                    { temperature: 0.7 }
                  );
                  for await (const content of chunkStream) {
                    if (streamClosed) break;
                    if (content) {
                      enqueueContent(content);
                    }
                  }
                } else if (effectiveHfModelId) {
                  // Fall back to old HuggingFace module for legacy models
                  console.log(`[Chat] Using HuggingFace legacy: ${effectiveHfModelId} for frontend model: ${model}`);
                  const chunkStream = streamHFChat(
                    hfMessages,
                    effectiveHfModelId as any,
                    { temperature: 0.7 }
                  );
                  for await (const content of chunkStream) {
                    if (streamClosed) break;
                    if (content) {
                      enqueueContent(content);
                    }
                  }
                } else {
                  throw new Error('No HuggingFace mapping for model: ' + model);
                }
                reportAggregatorSuccess('huggingface', 'chat', Date.now() - streamStartTime);
              } catch (hfError) {
                if (hfError instanceof Error && hfError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('huggingface');
                  reportAggregatorFailure('huggingface', 'chat', hfError instanceof Error ? hfError.message : String(hfError));
                }
                console.warn('[Chat] HuggingFace streaming failed, trying smart fallback:', hfError instanceof Error ? hfError.message : String(hfError));
                try { recordError('/api/chat/stream/hf-fallback', hfError instanceof Error ? hfError.message : 'HF streaming failed'); } catch { /* non-critical */ }
                // Smart fallback: use the new chatWithFallback to try other HF models
                try {
                  const hfMessages = messages.map((m: any) => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  }));
                  // Try the 190-model service with automatic fallback
                  const result = await chatWithFallback(hfMessages, undefined, {
                    temperature: 0.7,
                  });
                  if (result.content) {
                    enqueueContent(result.content);
                    console.log(`[Chat] HF smart fallback succeeded with model: ${result.modelUsed} (fallback: ${result.wasFallback}, attempts: ${result.attempts})`);
                  }
                } catch (smartFallbackError) {
                  console.warn('[Chat] HF smart fallback also failed, falling back to Pollinations:', smartFallbackError instanceof Error ? smartFallbackError.message : String(smartFallbackError));
                  // Final fallback: Pollinations → ZhipuAI
                  try { await streamFromPollinations(); } catch {
                    /* no ZAI fallback — user model only */
                  }
                }
              }
            } else if (primaryProvider === 'cerebras') {
              // ── Cerebras Streaming Path (Ultra-Fast) ──
              if (!CEREBRAS_API_KEY) {
                console.log('[Chat] Skipping Cerebras primary (no API key), using Pollinations/ZhipuAI');
              } else if (!isProviderHealthy('cerebras')) {
                console.log('[Chat] Skipping Cerebras primary (recently failed), falling back to Pollinations/ZhipuAI');
              }
              if (!CEREBRAS_API_KEY) {
                // No API key — skip directly to fallback
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                if (!isProviderHealthy('cerebras')) throw new Error('Skipping unhealthy provider');
                const cerebrasMapping = getCerebrasChatModelMapping(model);
                const cerebrasModel = cerebrasMapping.cerebrasModel;
                console.log(`[Chat] Using Cerebras model: ${cerebrasModel} (${cerebrasMapping.label}) for frontend model: ${model}`);

                const cerebrasMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamCerebrasChat({
                  messages: cerebrasMessages,
                  model: cerebrasModel as any,
                  temperature: 0.7,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  const content = chunk.choices?.[0]?.delta?.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
                }
                reportAggregatorSuccess('cerebras', 'chat', Date.now() - streamStartTime);
              } catch (cerebrasError) {
                if (cerebrasError instanceof Error && cerebrasError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('cerebras');
                  reportAggregatorFailure('cerebras', 'chat', cerebrasError instanceof Error ? cerebrasError.message : String(cerebrasError));
                }
                console.warn('[Chat] Cerebras streaming failed, falling back:', cerebrasError instanceof Error ? cerebrasError.message : String(cerebrasError));
                // Fall back to Pollinations or ZhipuAI
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (primaryProvider === 'openrouter') {
              // ── OpenRouter Streaming Path ──
              if (!OPENROUTER_API_KEY) {
                console.log('[Chat] Skipping OpenRouter (no API key), using Pollinations/ZhipuAI');
              } else if (!isProviderHealthy('openrouter')) {
                console.log('[Chat] Skipping OpenRouter (recently failed), falling back to Pollinations/ZhipuAI');
              }
              if (!OPENROUTER_API_KEY) {
                // No API key — skip directly to fallback
                try { await streamFromPollinations(); } catch {
                  /* no ZAI fallback — user model only */
                }
              } else
              try {
                if (!isProviderHealthy('openrouter')) throw new Error('Skipping unhealthy provider');
                const orMapping = getOpenRouterChatModelMapping(model);
                const orModel = orMapping.openrouterModel;

                console.log(`[Chat] Using OpenRouter model: ${orModel} (${orMapping.label}) for frontend model: ${model}`);

                // Convert messages to OpenRouter format (OpenAI-compatible)
                const orMessages = messages.map((m: any) => ({
                  role: m.role as 'system' | 'user' | 'assistant',
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                }));

                const chunkStream = streamOpenRouterChat({
                  messages: orMessages,
                  model: orModel as any,
                  temperature: 0.7,
                });

                for await (const chunk of chunkStream) {
                  if (streamClosed) break;
                  const content = chunk.choices?.[0]?.delta?.content || '';
                  if (content) {
                    enqueueContent(content);
                  }
                }
                reportAggregatorSuccess('openrouter', 'chat', Date.now() - streamStartTime);
              } catch (openRouterError) {
                // OpenRouter failed — fall back to Pollinations
                if (openRouterError instanceof Error && openRouterError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('openrouter');
                  reportAggregatorFailure('openrouter', 'chat', openRouterError instanceof Error ? openRouterError.message : String(openRouterError));
                }
                console.warn('[Chat] OpenRouter streaming failed, falling back to Pollinations:', openRouterError instanceof Error ? openRouterError.message : String(openRouterError));
                try { recordError('/api/chat/stream/openrouter-fallback', openRouterError instanceof Error ? openRouterError.message : 'OpenRouter streaming failed'); } catch { /* non-critical */ }

                if (pollinationsEntry) {
                  try {
                    const pollinationsMessages: PollinationsChatMessage[] = messages.map((m: any) => ({
                      role: m.role as 'system' | 'user' | 'assistant',
                      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    }));

                    const chunkStream = await streamChatCompletion({
                      messages: pollinationsMessages,
                      model: pollinationsEntry.pollinationsModel as any,
                      temperature: 0.7,
                      systemPromptSuffix: pollinationsEntry.systemPromptSuffix,
                    });

                    for await (const chunk of chunkStream) {
                      if (streamClosed) break;
                      const content = chunk.choices?.[0]?.delta?.content || '';
                      if (content) {
                        enqueueContent(content);
                      }
                    }
                  } catch (pollinationsError2) {
                    // Both OpenRouter and Pollinations failed — ZhipuAI
                    console.warn('[Chat] Pollinations fallback also failed, falling back to ZhipuAI:', pollinationsError2 instanceof Error ? pollinationsError2.message : String(pollinationsError2));
                    /* no ZAI fallback — user model only */
                  }
                } else {
                  // No Pollinations mapping — fall back directly to ZhipuAI
                  console.warn('[Chat] No Pollinations mapping for OpenRouter fallback, using ZhipuAI');
                  /* no ZAI fallback — user model only */
                }
              }
            } else if (primaryProvider === 'pollinations') {
              // ── Pollinations Streaming Path ──
              if (!isProviderHealthy('pollinations')) {
                console.log('[Chat] Skipping Pollinations (recently failed), falling back to ZhipuAI');
              }
              try {
                if (!isProviderHealthy('pollinations')) throw new Error('Skipping unhealthy provider');
                await streamFromPollinations();
                reportAggregatorSuccess('pollinations', 'chat', Date.now() - streamStartTime);
              } catch (pollinationsError) {
                // Pollinations failed — fall back to ZhipuAI
                if (pollinationsError instanceof Error && pollinationsError.message !== 'Skipping unhealthy provider') {
                  markProviderFailed('pollinations');
                  reportAggregatorFailure('pollinations', 'chat', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
                }
                console.warn('[Chat] Pollinations streaming failed, falling back to ZhipuAI:', pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError));
                try { recordError('/api/chat/stream/pollinations-fallback', pollinationsError instanceof Error ? pollinationsError.message : 'Pollinations streaming failed'); } catch { /* non-critical */ }
                /* no ZAI fallback — user model only */
              }
            } else {
              // ── Fallback: Use ZhipuAI for unknown providers ──
              try {
                /* ZAI removed */
                reportAggregatorSuccess('zhipuai', 'chat', Date.now() - streamStartTime);
              } catch (zhipuError) {
                reportAggregatorFailure('zhipuai', 'chat', zhipuError instanceof Error ? zhipuError.message : String(zhipuError));
                console.warn('[Chat] ZhipuAI streaming failed:', zhipuError instanceof Error ? zhipuError.message : String(zhipuError));
              }
            }
          } finally {
            clearTimeout(timeoutId!);
            if (inactivityWatchdogId) clearTimeout(inactivityWatchdogId);
            clearInterval(heartbeatInterval);
          }

          if (!streamClosed) {
            try {
              // ── Send generated image if ready ──
              // V.25: Wait for image generation to complete BEFORE closing stream
              if (imageGenPromise) {
                console.log('[Chat] Waiting for image generation to complete...');
                try {
                  const imageResult = await imageGenPromise;
                  console.log('[Chat] Image generation completed:', imageResult ? 'SUCCESS' : 'NULL');
                  if (imageResult) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ generatedImage: imageResult })}\n\n`)
                    );
                  } else {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ imageGenStatus: 'failed' })}\n\n`)
                    );
                  }
                } catch (imgErr) {
                  console.warn('[Chat] Inline image gen error:', imgErr);
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ imageGenStatus: 'failed' })}\n\n`)
                  );
                }
              }

              // ── Emit video generation result if ready ──
              if (videoGenPromise) {
                try {
                  const videoResult = await videoGenPromise;
                  if (videoResult && !streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ generatedVideo: { videoUrl: videoResult.videoUrl, prompt: videoResult.prompt } })}\n\n`)
                    );
                  } else if (!videoResult && !streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ videoGenStatus: 'failed' })}\n\n`)
                    );
                  }
                } catch (videoError) {
                  console.warn('[Chat] Video generation promise error:', videoError instanceof Error ? videoError.message : String(videoError));
                  if (!streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ videoGenStatus: 'failed' })}\n\n`)
                    );
                  }
                }
              }

              // ── Send quiz data if generated ──
              if (quizGenPromise) {
                try {
                  // 45-second timeout for quiz generation (increased from 30s for larger content)
                  const quizResult = await Promise.race([
                    quizGenPromise,
                    new Promise<null>((resolve) => setTimeout(() => {
                      console.warn('[Chat] Quiz gen timed out after 45s');
                      resolve(null);
                    }, 45_000)),
                  ]);
                  if (quizResult && !streamClosed) {
                    // Add source info for the frontend to display context-aware label
                    const quizDataWithSource = {
                      ...quizResult,
                      source: hasFileAttachments ? 'files' as const : 'chat' as const,
                    };
                    // Send the quiz data event
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ quizData: quizDataWithSource })}\n\n`)
                    );
                    // Also emit a brief content message so the chat shows something
                    const quizMsg = `📝 تم إنشاء الاختبار: **${quizResult.title}** — ${quizResult.questions.length} سؤال جاهز!\n\nاضغط على الاختبار للبدء 🎯`;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: quizMsg })}\n\n`)
                    );
                  } else if (!quizResult && !streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ quizGenStatus: 'failed' })}\n\n`)
                    );
                    const failMsg = `⚠️ لم أتمكن من إنشاء الاختبار. يرجى المحاولة مرة أخرى.`;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: failMsg })}\n\n`)
                    );
                  }
                } catch (quizError) {
                  console.warn('[Chat] Quiz generation promise error:', quizError instanceof Error ? quizError.message : String(quizError));
                  if (!streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ quizGenStatus: 'failed' })}\n\n`)
                    );
                    const failMsg = `⚠️ حدث خطأ أثناء إنشاء الاختبار.`;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content: failMsg })}\n\n`)
                    );
                  }
                }
              }

              // ── Post-processing: Strip HTML from non-file-generation responses ──
              // Safety net: if the model still output HTML despite the strong markdown-only instruction,
              // strip the HTML and replace the content with the cleaned version.
              // SKIP if file generation was detected (including auto-detected HTML output)
              if (!isOpenMode && !fileGenIntent && !fileGenIntentOpen && !cachedContentStrategyNeeded && accumulatedContent.length > 50 && containsHtmlTags(accumulatedContent)) {
                console.log('[Chat] Post-processing: Detected HTML in non-file-gen response — stripping HTML tags');
                const cleanedContent = stripHtmlToMarkdown(accumulatedContent);
                accumulatedContent = cleanedContent; // Update for DB save
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ contentReplace: cleanedContent })}\n\n`)
                );
              }

              // ── Auto PDF/PPTX File Generation from Chat (INLINE) ──
              // Generate the file DIRECTLY in the stream before [DONE].
              // Uses Playwright for PDF (best quality) + HF Spaces for PPTX.
              // The user MUST get a downloadable file — never leave them with nothing.
              console.log(`[Chat] File gen: CHECK — fileGenIntent=${fileGenIntent}, fileGenIntentOpen=${fileGenIntentOpen}, contentLen=${accumulatedContent.length}, streamClosed=${streamClosed}`);
              const shouldGenerateFile = (fileGenIntent || fileGenIntentOpen) && accumulatedContent.length > 20;
              if (!shouldGenerateFile && (fileGenIntent || fileGenIntentOpen)) {
                console.warn(`[Chat] File gen: ⚠️ Intent detected but content too short (${accumulatedContent.length} chars). Will still attempt generation.`);
              }
              if (fileGenIntent || fileGenIntentOpen) {
                const contentToUse = accumulatedContent.length > 20 ? accumulatedContent : accumulatedContent + '\n\n---\nتم إنشاء هذا المستند بواسطة DeltaAI';
                console.log(`[Chat] File gen: Starting inline generation (content=${contentToUse.length} chars, user=${user ? 'yes' : 'guest'}, intent=${fileGenIntent ? 'keyword' : 'auto-html'})`);
                try {
                  const fs = await import('fs/promises');
                  const pathModule = await import('path');
                  const downloadDir = pathModule.join(process.cwd(), 'download');
                  await fs.mkdir(downloadDir, { recursive: true });
                  console.log(`[Chat] File gen: download dir ready at ${downloadDir}`);

                  // Determine the HTML content to render
                  const looksLikeHtml = /<style|<div|class="|class='/.test(contentToUse);
                  let htmlContent: string;
                  let docTitle: string;

                  if (looksLikeHtml) {
                    console.log('[Chat] File gen: Detected HTML content — will render directly to PDF');
                    htmlContent = contentToUse;
                    docTitle = message.slice(0, 60).replace(/^(ولد|أنشئ|اصنع|اعمل|اكتب|generate|create|make)\s+/i, '').trim() || 'مستند DeltaAI';
                  } else {
                    console.log('[Chat] File gen: Converting Markdown to HTML for PDF rendering');
                    docTitle = message.slice(0, 60).replace(/^(ولد|أنشئ|اصنع|اعمل|اكتب|generate|create|make)\s+/i, '').trim() || 'مستند DeltaAI';
                    try {
                      htmlContent = markdownToSimpleHTML(contentToUse, docTitle, (language as 'ar' | 'en') || 'ar');
                    } catch (htmlConvErr) {
                      console.warn('[Chat] File gen: markdownToSimpleHTML failed, using raw content:', htmlConvErr instanceof Error ? htmlConvErr.message : String(htmlConvErr));
                      htmlContent = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${docTitle}</title><style>body{font-family:sans-serif;direction:rtl;padding:40px;}</style></head><body><pre>${contentToUse.replace(/</g, '&lt;')}</pre></body></html>`;
                    }
                  }

                  let fileType: 'pdf' | 'pptx' | 'html' | 'txt' = 'pdf';
                  let fileName = '';
                  let filePathSave = '';
                  let fileSize = 0;
                  let fileUrl = '';
                  let driveLink: string | null = null;
                  const fileBaseName = `delta-${message.slice(0, 30).replace(/[^a-zA-Z\u0600-\u06FF0-9]/g, '-')}-${Date.now()}`;

                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // PPTX DETECTION: Check if user wants PowerPoint
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  const isPPTXRequest = /باور.?بوينت|بور.?بوينت|عرض.?تقديم|بورب|pptx|power.?point|slides|سلايد|سلايدات|presentation/i.test(message);

                  if (isPPTXRequest) {
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // PPTX GENERATION via HF Document Service (Open GAMMA / Fabrica)
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    try {
                      console.log('[Chat] File gen: PPTX request detected — generating via HF Document Service...');
                      const { generateDocument } = await import('@/lib/hf-document.service');
                      const pptxModels = ['open-gamma', 'fabrica-slides'];
                      const chosenModel = pptxModels[Math.floor(Math.random() * pptxModels.length)];
                      
                      const pptxResult = await Promise.race([
                        generateDocument(chosenModel, {
                          topic: docTitle,
                          language: (language as 'ar' | 'en') || 'ar',
                          instructions: contentToUse.slice(0, 2000),
                          slideCount: 10,
                        }),
                        new Promise<null>((_, reject) =>
                          setTimeout(() => reject(new Error('PPTX generation timeout (120s)')), 120_000)
                        ),
                      ]);

                      if (pptxResult && pptxResult.fileUrl) {
                        // Download the PPTX from the external service and save locally
                        try {
                          const pptxResponse = await fetch(pptxResult.fileUrl);
                          if (pptxResponse.ok) {
                            const pptxBuffer = Buffer.from(await pptxResponse.arrayBuffer());
                            fileName = `${fileBaseName}.pptx`;
                            filePathSave = pathModule.join(downloadDir, fileName);
                            await fs.writeFile(filePathSave, pptxBuffer);
                            fileSize = pptxBuffer.length;
                            fileType = 'pptx';
                            fileUrl = `/api/pdf/serve/${encodeURIComponent(fileName)}`;
                            console.log(`[Chat] File gen: ✅ PPTX created (${fileSize} bytes) via ${chosenModel}: ${fileName}`);
                          } else {
                            console.warn(`[Chat] File gen: ⚠️ PPTX download failed (${pptxResponse.status}) — falling back to PDF`);
                          }
                        } catch (dlErr) {
                          console.warn(`[Chat] File gen: ⚠️ PPTX download error: ${dlErr instanceof Error ? dlErr.message : String(dlErr)} — falling back to PDF`);
                        }
                      } else {
                        console.warn('[Chat] File gen: ⚠️ PPTX generation returned no URL — falling back to PDF');
                      }
                    } catch (pptxErr) {
                      console.warn(`[Chat] File gen: ⚠️ PPTX generation failed: ${pptxErr instanceof Error ? pptxErr.message : String(pptxErr)} — falling back to PDF`);
                    }
                  }

                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // PDF GENERATION via Playwright (primary — best quality)
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  if (!fileName) {
                    try {
                      console.log('[Chat] File gen: Attempting Playwright PDF rendering...');
                      const { renderHTMLToPDF } = await import('@/lib/playwright-renderer');
                      const result = await Promise.race([
                        renderHTMLToPDF({ html: htmlContent, title: docTitle, language: (language as 'ar' | 'en') || 'ar' }),
                        new Promise<{ success: false; error: string; duration: number }>((_, reject) =>
                          setTimeout(() => reject(new Error('Playwright timeout (90s)')), 90_000)
                        ),
                      ]);

                      if (result.success && result.pdfBuffer && result.pdfBuffer.length > 0) {
                        fileName = `${fileBaseName}.pdf`;
                        filePathSave = pathModule.join(downloadDir, fileName);
                        await fs.writeFile(filePathSave, result.pdfBuffer);
                        fileSize = result.pdfBuffer.length;
                        fileType = 'pdf';
                        fileUrl = `/api/pdf/serve/${encodeURIComponent(fileName)}`;
                        console.log(`[Chat] File gen: ✅ Playwright PDF created (${fileSize} bytes, ${result.duration}ms): ${fileName}`);
                      } else {
                        console.warn(`[Chat] File gen: ⚠️ Playwright rendered but no PDF buffer: ${result.error || 'Unknown'}`);
                      }
                    } catch (playwrightErr) {
                      console.warn(`[Chat] File gen: ⚠️ Playwright failed: ${playwrightErr instanceof Error ? playwrightErr.message : String(playwrightErr)}`);
                    }
                  }

                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // FALLBACK: HTML file (not a PDF but downloadable)
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  if (!fileName) {
                    try {
                      console.log('[Chat] File gen: Falling back to HTML file...');
                      fileName = `${fileBaseName}.html`;
                      filePathSave = pathModule.join(downloadDir, fileName);

                      let fullHtml = htmlContent;
                      if (!fullHtml.includes('<!DOCTYPE') && !fullHtml.includes('<html')) {
                        fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="${language || 'ar'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    body { font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; margin: 0; padding: 20px; }
  </style>
</head>
<body>${htmlContent}</body>
</html>`;
                      }

                      await fs.writeFile(filePathSave, fullHtml, 'utf-8');
                      fileSize = Buffer.byteLength(fullHtml, 'utf-8');
                      fileType = 'html';
                      fileUrl = `/api/pdf/serve/${encodeURIComponent(fileName)}`;
                      console.log(`[Chat] File gen: ✅ HTML file saved (${fileSize} bytes): ${fileName}`);
                    } catch (htmlErr) {
                      console.error('[Chat] File gen: ❌ HTML fallback failed:', htmlErr instanceof Error ? htmlErr.message : String(htmlErr));
                    }
                  }

                  // ── Send fileReady event directly in the stream ──
                  if (fileName && !streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        fileReady: {
                          id: `file-${Date.now()}`,
                          name: fileName,
                          url: fileUrl,
                          fileSize,
                          driveLink,
                          fileType,
                        },
                        fileGenStatus: 'ready',
                      })}\n\n`)
                    );
                    console.log(`[Chat] File gen: ✅ fileReady event sent — ${fileType}: ${fileUrl}`);

                    // Try Google Drive upload (non-blocking) — only for PDF files
                    if (fileType === 'pdf') {
                      try {
                        const { uploadFileToDrive } = await import('@/lib/google-drive.service');
                        const uploadResult = await uploadFileToDrive(filePathSave, fileName, 'application/pdf');
                        driveLink = uploadResult?.webViewLink || null;
                        if (driveLink) console.log(`[Chat] File gen: Drive link: ${driveLink}`);
                      } catch (driveErr) {
                        console.warn('[Chat] File gen: Drive upload failed (non-critical):', driveErr instanceof Error ? driveErr.message : String(driveErr));
                      }
                    }

                    // Save to DB for tracking (non-blocking)
                    if (user) {
                      try {
                        await db.generativeAsset.create({
                          data: {
                            userId: user.id,
                            type: fileType,
                            title: fileName,
                            prompt: message.slice(0, 200),
                            filePath: filePathSave,
                            fileSize,
                            metadata: JSON.stringify({
                              status: 'ready',
                              mimeType: fileType === 'pdf' ? 'application/pdf' : 'text/html',
                              fileUrl,
                              driveLink,
                              chatModel: model,
                            }),
                            model,
                          },
                        });
                      } catch (dbErr: unknown) {
                        console.warn('[Chat] File gen: DB record creation failed (non-critical):', dbErr instanceof Error ? dbErr.message : String(dbErr));
                      }
                    }
                  } else if (!fileName && !streamClosed) {
                    // File generation completely failed — all methods failed
                    // FIX #1: Strip the raw HTML from the chat since we couldn't generate a file
                    // The HTML was preserved for PDF generation, but since that failed,
                    // we need to clean it up so the user doesn't see raw HTML tags
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        fileGenStatus: 'failed',
                      })}\n\n`)
                    );
                    console.error('[Chat] File gen: ❌ ALL METHODS FAILED — no file created. Stripping HTML from chat...');

                    if (containsHtmlTags(accumulatedContent)) {
                      const cleanedContent = stripHtmlToMarkdown(accumulatedContent);
                      accumulatedContent = cleanedContent; // Update for DB save
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ contentReplace: cleanedContent })}\n\n`)
                      );
                      console.log('[Chat] File gen: ✅ HTML stripped from chat after file generation failure');
                    }
                  }
                } catch (inlineGenErr) {
                  console.error('[Chat] File gen: ❌ Inline generation outer error:', inlineGenErr instanceof Error ? inlineGenErr.message : String(inlineGenErr));
                  if (!streamClosed) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        fileGenStatus: 'failed',
                      })}\n\n`)
                    );
                    // FIX #1: Strip HTML from chat when file generation fails with outer error
                    if (containsHtmlTags(accumulatedContent)) {
                      try {
                        const cleanedContent = stripHtmlToMarkdown(accumulatedContent);
                        accumulatedContent = cleanedContent;
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ contentReplace: cleanedContent })}\n\n`)
                        );
                      } catch (stripErr) {
                        console.warn('[Chat] File gen: HTML strip failed (non-critical):', stripErr);
                      }
                    }
                  }
                }
              }

              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {
              // Controller already closed (e.g., by timeout)
            }
          }
        } catch (sdkError) {
          console.error('SDK streaming error:', sdkError);

          try {
            recordError('/api/chat/stream', sdkError instanceof Error ? sdkError.message : 'SDK streaming error');
          } catch (recordErr) {
            console.warn('[Chat] recordError failed (non-critical):', recordErr instanceof Error ? recordErr.message : String(recordErr));
          }

          // ── V.19: Final fallback to ZAI (glm-4-flash FREE) before giving up ──
          // If the user's selected model failed (e.g., HuggingFace 402 credits depleted,
          // Groq rate limit, etc.), try ZAI glm-4-flash which is always free.
          if (!streamClosed) {
            console.log('[Chat] Final fallback: trying ZAI glm-4-flash (free model)');
            try {
              const { getZAIClient } = await import('@/lib/chat-utils');
              const zai = await getZAIClient();
              const zaiResponse = await zai.chat.completions.create({
                model: 'glm-4-flash',
                messages: messages as any,
                stream: true,
                temperature: 0.7,
                max_tokens: 8192,
              });

              if (zaiResponse && typeof zaiResponse[Symbol.asyncIterator] === 'function') {
                let gotContent = false;
                for await (const chunk of zaiResponse) {
                  if (streamClosed) break;
                  const delta = chunk?.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    if (!gotContent) {
                      gotContent = true;
                      console.log('[Chat] ZAI fallback succeeded — streaming response');
                    }
                    enqueueContent(delta);
                  }
                }
                if (gotContent) {
                  // ZAI fallback worked — close stream and return
                  streamClosed = true;
                  try {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                  } catch {}
                  return;
                }
              }
            } catch (zaiFallbackError) {
              console.warn('[Chat] ZAI fallback also failed:', zaiFallbackError instanceof Error ? zaiFallbackError.message : String(zaiFallbackError));
            }
          }

          // If ZAI fallback also failed, return the error message
          if (!streamClosed) {
            streamClosed = true;
            try {
              // V.19: Better error message — tell user to switch to glm-4-flash-zai
              const errorMsg = sdkError instanceof Error ? sdkError.message : String(sdkError);
              const is402 = errorMsg.includes('402') || errorMsg.includes('depleted') || errorMsg.includes('credits');
              const userMessage = is402
                ? 'رصيد الموديل ده خلص. بدّل لموديل **glm-4-flash-zai** (مجاني) من القائمة اللي فوق، وهشتغللك فوراً. ✅'
                : 'حصل خطأ في الاتصال. بدّل لموديل **glm-4-flash-zai** (مجاني) من القائمة اللي فوق.';
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: userMessage })}\n\n`)
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {
              // Controller already closed
            }
          }
        }

        // ── Unregister connection ──
        try {
          unregisterConnection(connectionId);
        } catch (monitorErr) {
          console.warn('[Chat] unregisterConnection failed (non-critical):', monitorErr instanceof Error ? monitorErr.message : String(monitorErr));
        }

        // ── Record response time ──
        try {
          recordApiResponseTime('/api/chat/stream', Date.now() - streamStartTime);
        } catch (monitorErr) {
          console.warn('[Chat] recordApiResponseTime failed (non-critical):', monitorErr instanceof Error ? monitorErr.message : String(monitorErr));
        }

        // ── Wait for deferred DB writes to complete before saving assistant message ──
        // This ensures the conversation and user message are saved before we add the assistant message
        try {
          await deferredDbWrites;
        } catch (deferredErr) {
          console.warn('[Chat] Deferred DB writes error (non-critical):', deferredErr instanceof Error ? deferredErr.message : String(deferredErr));
        }

        // ── Save assistant message to DB ──
        // FIX: Truncate assistant content to prevent DB issues with large HTML/PDF content
        if (dbConversationId && user && accumulatedContent) {
          const assistantContentForDb = accumulatedContent.length > 50000
            ? accumulatedContent.slice(0, 50000) + '...'
            : accumulatedContent;
          try {
            await db.message.create({
              data: {
                content: assistantContentForDb,
                role: 'assistant',
                model,
                emotion,
                language: language || 'ar',
                conversationId: dbConversationId,
                userId: user.id,
              },
            });
          } catch (dbError: any) {
            if (dbError?.code === 'P2003') {
              // FIX: Use user message as title (not assistant content which could be HTML gibberish)
              console.warn('[Chat] FK constraint on assistant message save, creating new conversation');
              try {
                const newConv = await db.conversation.create({
                  data: {
                    title: message.slice(0, 60) + (message.length > 60 ? '...' : ''),
                    model,
                    language: language || 'ar',
                    userId: user.id,
                  },
                });
                dbConversationId = newConv.id;
                await db.message.create({
                  data: {
                    content: assistantContentForDb,
                    role: 'assistant',
                    model,
                    emotion,
                    language: language || 'ar',
                    conversationId: dbConversationId,
                    userId: user.id,
                  },
                });
              } catch (retryError) {
                console.error('[Chat] Retry assistant message save failed:', retryError);
              }
            } else {
              console.error('Failed to save assistant message:', dbError);
            }
          }
        }

        // ── Smart Memory Extraction (async, non-blocking) ──
        // Extract user memories from this conversation exchange
        // This runs after the response is complete and does NOT block the stream
        if (user && accumulatedContent && dbMessageContent) {
          extractMemories(user.id, dbMessageContent, accumulatedContent).catch((err) => {
            console.warn('[Chat] Memory extraction failed (non-blocking):', err instanceof Error ? err.message : String(err));
          });
        }

        // ── File generation is now done INLINE before [DONE] ──
        // No background IIFE needed — the fileReady event is sent directly in the stream.
        // See the inline generation code above (before controller.close()).
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Conversation-Id': dbConversationId || '',
      },
    });
  } catch (error) {
    const errorDetail = error instanceof Error ? `${error.message}\n${error.stack?.slice(0, 300) || ''}` : String(error);
    console.error('Chat stream error:', errorDetail);

    // Clean up registered connection if stream never started
    try {
      unregisterConnection(connectionId);
    } catch (monitorErr) {
      console.warn('[Chat] unregisterConnection failed in catch (non-critical):', monitorErr instanceof Error ? monitorErr.message : String(monitorErr));
    }

    // Note: Don't reset globalThis._zaiClient here — it can break concurrent requests

    console.error('[Chat Stream] Unhandled error:', error);
    // Return a proper JSON response instead of letting Next.js return 500
    return new Response(
      JSON.stringify({ 
        error: 'حدث خطأ داخلي في الخادم', 
        details: error instanceof Error ? error.message : String(error),
        hint: 'يرجى المحاولة مرة أخرى'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
