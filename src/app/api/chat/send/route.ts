import { NextRequest, NextResponse } from 'next/server';

// maxDuration = 300s — non-streaming chat may run tool chains / long generations.
export const maxDuration = 600; // 10 min for heavy file analysis
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { getModelById } from '@/lib/models';
import { CHAT_MODEL_MAP, generateChatCompletion } from '@/lib/pollinations';
import type { PollinationsChatMessage } from '@/lib/pollinations';
import { isGroqChatModel, generateGroqChat, getGroqChatModelMapping } from '@/lib/groq';
import { isGeminiChatModel, generateGeminiChat, getGeminiChatModelMapping } from '@/lib/gemini';
import { isGitHubChatModel, generateGitHubChat, getGitHubChatModelMapping } from '@/lib/github-models';
import { isOpenAIChatModel, generateOpenAIChat, getOpenAIChatModelMapping, OPENAI_API_KEY } from '@/lib/openai';
import { getZAIClient } from '@/lib/chat-utils';
import { buildSystemPrompt, FALLBACK_RESPONSE } from '@/lib/chat/system-prompt-builder';
import { parseFileAttachments, type ParsedAttachment } from '@/lib/chat/attachment-parser';
import { extractTextFromPdfBase64 } from '@/lib/pdf-text-extractor';
import { preprocessMediaAttachments, type ParsedMediaAttachment } from '@/lib/media-preprocessor';
import { classifyContentQuality } from '@/lib/drive-rag';
import { classifyDocIntent } from '@/lib/chat/doc-intent-classifier';
import { getChatModelById, chatWithFallback } from '@/lib/hf-chat.service';

// ─── Fallback Helpers ────────────────────────────────────────────────

type FallbackStep = 'openrouter' | 'pollinations' | 'zhipuai';

interface FallbackContext {
  messages: Array<{ role: string; content: string }>;
  model: string;
  pollinationsEntry: { pollinationsModel: string; label: string } | undefined;
  glmModel: string;
}

/**
 * Executes a primary generation function, falling back through an ordered
 * chain of alternative providers if the primary fails.
 */
async function generateWithFallback(
  primaryFn: () => Promise<string>,
  fallbackChain: FallbackStep[],
  ctx: FallbackContext,
): Promise<string> {
  let content = '';

  try {
    content = await primaryFn();
  } catch (primaryError) {
    console.warn(
      '[ChatSend] Primary provider failed:',
      primaryError instanceof Error ? primaryError.message : String(primaryError),
    );

    for (const step of fallbackChain) {
      if (content) break;

      if (step === 'openrouter') {
        try {
          const { generateOpenRouterChat, getOpenRouterChatModelMapping, OPENROUTER_API_KEY } =
            await import('@/lib/openrouter');
          if (OPENROUTER_API_KEY) {
            const orMapping = getOpenRouterChatModelMapping(ctx.model);
            if (orMapping) {
              const orMessages = ctx.messages.map((m) => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              }));
              const orResult = await generateOpenRouterChat({
                messages: orMessages as any,
                model: orMapping.openrouterModel as any,
                temperature: 0.7,
                max_tokens: 8192,
              });
              content = orResult.choices?.[0]?.message?.content || '';
            }
          }
        } catch (orError) {
          console.warn(
            '[ChatSend] OpenRouter fallback also failed:',
            orError instanceof Error ? orError.message : String(orError),
          );
        }
      } else if (step === 'pollinations') {
        if (ctx.pollinationsEntry) {
          try {
            const pollinationsMessages: PollinationsChatMessage[] = ctx.messages.map((m) => ({
              role: m.role as 'system' | 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
            const result = await generateChatCompletion({
              messages: pollinationsMessages,
              model: ctx.pollinationsEntry.pollinationsModel as any,
              temperature: 0.7,
              max_tokens: 4096,
            });
            content = result.choices?.[0]?.message?.content || '';
          } catch (pollinationsError) {
            console.warn(
              '[ChatSend] Pollinations also failed, falling back to ZhipuAI:',
              pollinationsError instanceof Error ? pollinationsError.message : String(pollinationsError),
            );
          }
        }
      } else if (step === 'zhipuai') {
        try {
          const zai = await getZAIClient();
          const completion = await zai.chat.completions.create({
            model: ctx.glmModel,
            messages: ctx.messages,
            stream: false,
            thinking: { type: 'disabled' },
          });
          content = completion.choices?.[0]?.message?.content || '';
        } catch (sdkError) {
          console.error('SDK non-streaming error (ZhipuAI fallback):', sdkError);
          content = 'أعتذر، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى. 🔄';
        }
      }
    }
  }

  return content;
}

/**
 * Build the messages array for the LLM, handling multimodal content for images.
 * (Consistent with the stream route's buildLLMMessages)
 */
async function buildLLMMessages(
  systemPrompt: string,
  conversationMessages: { role: string; content: string }[],
  userMessage: string,
  parsed: { cleanedMessage: string; attachments: ParsedAttachment[]; hasAttachments: boolean },
  glmModel: string,
  modelConfig: { provider: string; capabilities: { vision: boolean } }
): Promise<Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>> {
  const isVisionModel = glmModel === 'glm-4v' || (modelConfig.provider === 'gemini' && modelConfig.capabilities.vision);
  const imageAttachments = parsed.attachments.filter((a) => a.type === 'image');
  const pdfAttachments = parsed.attachments.filter((a) => a.type === 'pdf');

  let finalUserMessage = parsed.cleanedMessage;

  // For PDFs, extract text and append it
  if (pdfAttachments.length > 0) {
    const pdfTexts = await Promise.all(
      pdfAttachments.map(async (pdf) => {
        const extractedText = await extractTextFromPdfBase64(pdf.content!);
        const contentQuality = classifyContentQuality(extractedText);
        if (contentQuality === 'failed') {
          return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n⚠️ ${extractedText}\n⚠️ مهم: لا تخترع أي محتوى عن هذا الملف — لم يتم قراءته بنجاح. أخبر المستخدم بذلك بصراحة.`;
        }
        if (contentQuality === 'partial') {
          const firstBracketEnd = extractedText.indexOf(']\n');
          const usableText = firstBracketEnd > 0 ? extractedText.slice(firstBracketEnd + 2).trim() : extractedText;
          return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n⚠️ محتوى جزئي — بعض الصفحات لم يتم قراءتها بشكل صحيح\n--- محتوى PDF ---\n${usableText}\n--- نهاية المحتوى ---`;
        }
        return `📄 ملف PDF مرفق: ${pdf.name} (${pdf.size})\n--- محتوى PDF ---\n${extractedText}\n--- نهاية المحتوى ---`;
      })
    );
    finalUserMessage = pdfTexts.join('\n\n') + (finalUserMessage ? '\n\n' + finalUserMessage : '');
  }

  // Vision model with images → multimodal content
  if (imageAttachments.length > 0 && isVisionModel) {
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (finalUserMessage) {
      contentParts.push({ type: 'text', text: finalUserMessage });
    }
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

  // Non-vision model with images → media preprocessing fallback
  if (imageAttachments.length > 0 && !isVisionModel) {
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
        false,
        'ar'
      );
      if (preprocessed.combinedText.trim()) {
        finalUserMessage = preprocessed.combinedText + (finalUserMessage ? '\n\n' + finalUserMessage : '');
      }
    } catch (mediaPreprocessErr) {
      console.warn('[ChatSend] Media preprocessor failed, using fallback note:', mediaPreprocessErr instanceof Error ? mediaPreprocessErr.message : String(mediaPreprocessErr));
      const imageNote = imageAttachments
        .map((img) => `📷 صورة مرفقة: ${img.name} (${img.size}) - تم إرفاق صورة لكن النموذج الحالي لا يدعم تحليل الصور. يرجى التبديل لنموذج Delta Vision لتحليل الصور.`)
        .join('\n');
      finalUserMessage = imageNote + (finalUserMessage ? '\n\n' + finalUserMessage : '');
    }
  }

  return [
    { role: 'system', content: systemPrompt },
    ...conversationMessages,
    { role: 'user', content: finalUserMessage },
  ];
}

// ─── POST Handler ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: 'الرسالة والنموذج مطلوبان' },
        { status: 400 }
      );
    }

    // ── HuggingFace Chat Model Bridge ──
    // When user selects an HF chat model (hf-chat:Model/ID), route directly
    // to the HuggingFace chat service instead of rejecting as "model not found"
    let modelConfig = getModelById(model);
    let isHFDirectModel = false;
    let hfDirectModelId: string | null = null;

    if (!modelConfig && model.startsWith('hf-chat:')) {
      hfDirectModelId = model.slice(8); // Strip 'hf-chat:' prefix
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
        console.log(`[ChatSend] HF direct model detected: ${hfDirectModelId} — routing to HuggingFace chat service`);
      }
    }

    // ── Custom Model Bridge (from Aggregator) ──
    let customModelConfig: {
      baseUrl: string;
      apiKey: string | null;
      authType: string;
      authHeader: string | null;
      apiFormat: string;
      modelId: string | null;
    } | null = null;

    if (!modelConfig && model.startsWith('custom:chat:')) {
      const customModelId = model.split(':').slice(2).join(':');
      try {
        const customModel = await db.customModel.findUnique({ where: { id: customModelId } });
        if (customModel && customModel.isActive) {
          modelConfig = {
            id: model,
            name: customModel.name,
            nameEn: customModel.nameEn,
            icon: customModel.icon || '⚡',
            category: 'hf-chat' as any,
            glmModel: 'glm-4-flash',
            provider: 'huggingface',
            realChatModel: customModel.modelId || customModel.nameEn,
            realImageModel: '',
            realVideoModel: '',
            rank: 'standard',
            description: customModel.description || customModel.name,
            descriptionEn: customModel.descriptionEn || customModel.nameEn,
            systemPrompt: '',
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
          hfDirectModelId = customModel.modelId || customModel.nameEn;
          customModelConfig = {
            baseUrl: customModel.baseUrl,
            apiKey: customModel.apiKey,
            authType: customModel.authType,
            authHeader: customModel.authHeader,
            apiFormat: customModel.apiFormat,
            modelId: customModel.modelId,
          };
          console.log(`[ChatSend] Custom model detected: ${customModel.name} (${customModel.provider})`);
        }
      } catch (err) {
        console.warn('[ChatSend] Failed to load custom model:', err);
      }
    }

    if (!modelConfig) {
      return NextResponse.json(
        { error: 'النموذج غير موجود' },
        { status: 400 }
      );
    }

    // Parse file attachments from the message
    const parsed = parseFileAttachments(message);

    // Optional auth — guest mode if no token
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    // ── Enhanced Document Intent Detection ──
    const docIntent = parsed.hasAttachments ? classifyDocIntent(message, true) : classifyDocIntent(message, false);

    // ── Build system prompt using extracted module ──
    // Now uses the same buildSystemPrompt() as the stream route for feature parity:
    // - DB overrides, language suffix, capabilities, time context
    // - Content strategy, design prefs, attachments, emotion
    // - Memory, Drive awareness + RAG, web search
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
    const systemPrompt = promptResult.systemPrompt;
    const emotion = promptResult.emotion;

    // ── Ensure we have a valid DB conversation ──
    let dbConversationId: string | null = null;
    let conversationMessages: { role: string; content: string }[] = [];

    if (conversationId && user) {
      try {
        // PERF: Use DB-level pagination instead of loading all messages then truncating
        const existingConv = await db.conversation.findUnique({
          where: { id: conversationId },
          include: {
            messages: {
              where: { role: { not: 'system' } },
              orderBy: { createdAt: 'asc' },
              take: 12,
              // Get the LAST 12 messages by using cursor-based approach
            },
          },
        });

        if (existingConv && existingConv.userId === user.id) {
          dbConversationId = existingConv.id;
          // Apply truncation to prevent context bloat
          conversationMessages = existingConv.messages
            .map((m) => ({ role: m.role, content: m.content.length > 2000 ? m.content.slice(0, 2000) + '...' : m.content }))
            .slice(-12);
        } else {
          console.warn(`[ChatSend] Conversation ${conversationId} not found or not owned by user.`);
        }
      } catch (convError) {
        console.error('[ChatSend] Error loading conversation:', convError);
      }
    }

    // Create conversation in DB if we don't have one yet
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
        console.error('[ChatSend] Error creating conversation:', createError);
      }
    }

    // Build messages array for LLM with multimodal support
    const messages = await buildLLMMessages(
      systemPrompt,
      conversationMessages,
      message,
      parsed,
      modelConfig.glmModel,
      modelConfig
    );

    // Get GLM model
    const glmModel = modelConfig.glmModel;

    // ── Save user message to DB (with P2003 retry) ──
    const userMessageForDb = (parsed.cleanedMessage || message).length > 10000
      ? (parsed.cleanedMessage || message).slice(0, 10000) + '...'
      : (parsed.cleanedMessage || message);

    if (dbConversationId && user) {
      try {
        await db.message.create({
          data: {
            content: userMessageForDb,
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
          // FIX: Use user message as title (not assistant content which could be HTML gibberish)
          console.warn('[ChatSend] FK constraint on user message save, creating new conversation');
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
                content: userMessageForDb,
                role: 'user',
                model,
                emotion,
                language: language || 'ar',
                conversationId: dbConversationId,
                userId: user.id,
              },
            });
          } catch (retryError) {
            console.error('[ChatSend] Retry user message save failed:', retryError);
          }
        } else {
          console.error('[ChatSend] Error saving user message:', msgError);
        }
      }
    }

    // Call LLM — route based on modelConfig.provider
    let assistantContent = '';

    const primaryProvider = modelConfig.provider;
    const groqMapping = isGroqChatModel(model) ? getGroqChatModelMapping(model) : null;
    const pollinationsEntry = CHAT_MODEL_MAP[model];

    console.log(`[ChatSend] Routing model=${model}, provider=${primaryProvider}`);

    // Build shared fallback context
    const fallbackCtx: FallbackContext = {
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      model,
      pollinationsEntry,
      glmModel,
    };

    if (primaryProvider === 'openai' && isOpenAIChatModel(model)) {
      assistantContent = await generateWithFallback(
        async () => {
          if (!OPENAI_API_KEY) {
            throw new Error('No OPENAI_API_KEY, falling back to OpenRouter/Pollinations');
          }
          const openaiMapping = getOpenAIChatModelMapping(model);
          const openaiModel = openaiMapping!.openaiModel;
          const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          console.log(`[ChatSend] Using OpenAI model: ${openaiModel} (${openaiMapping!.label}) for frontend model: ${model}`);
          const result = await generateOpenAIChat({
            messages: openaiMessages,
            model: openaiModel as any,
            temperature: 0.7,
            max_tokens: 8192,
          });
          return result.choices?.[0]?.message?.content || '';
        },
        ['openrouter', 'pollinations', 'zhipuai'],
        fallbackCtx,
      );
    } else if (primaryProvider === 'github') {
      assistantContent = await generateWithFallback(
        async () => {
          const githubMapping = getGitHubChatModelMapping(model);
          const githubModel = githubMapping.githubModel;
          const githubMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          console.log(`[ChatSend] Using GitHub Models: ${githubModel} (${githubMapping.label}) for frontend model: ${model}`);
          const result = await generateGitHubChat({
            messages: githubMessages,
            model: githubModel as any,
            temperature: 0.7,
            max_tokens: 8192,
          });
          return result.choices?.[0]?.message?.content || '';
        },
        ['pollinations', 'zhipuai'],
        fallbackCtx,
      );
    } else if (primaryProvider === 'groq' && groqMapping) {
      assistantContent = await generateWithFallback(
        async () => {
          const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          console.log(`[ChatSend] Using Groq model: ${groqMapping.groqModel} (${groqMapping.label}) for frontend model: ${model}`);
          const result = await generateGroqChat({
            messages: groqMessages,
            model: groqMapping.groqModel as any,
            temperature: 0.7,
            max_tokens: 8192,
          });
          return result.choices?.[0]?.message?.content || '';
        },
        ['pollinations', 'zhipuai'],
        fallbackCtx,
      );
    } else if (primaryProvider === 'gemini') {
      assistantContent = await generateWithFallback(
        async () => {
          const geminiMapping = getGeminiChatModelMapping(model);
          const geminiModel = geminiMapping.geminiModel;
          const geminiMessages = messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          const systemMessage = geminiMessages.find((m) => m.role === 'system');
          const systemInstruction = systemMessage?.content;
          const nonSystemMessages = geminiMessages.filter((m) => m.role !== 'system');
          console.log(`[ChatSend] Using Gemini model: ${geminiModel} (${geminiMapping.label}) for frontend model: ${model}`);
          const result = await generateGeminiChat({
            messages: nonSystemMessages,
            model: geminiModel as any,
            temperature: 0.7,
            maxOutputTokens: 8192,
            systemInstruction,
          });
          return result.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
        },
        ['zhipuai'],
        fallbackCtx,
      );
    } else if (primaryProvider === 'pollinations' && pollinationsEntry) {
      assistantContent = await generateWithFallback(
        async () => {
          const pollinationsMessages: PollinationsChatMessage[] = messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          console.log(`[ChatSend] Using Pollinations model: ${pollinationsEntry.pollinationsModel} (${pollinationsEntry.label}) for frontend model: ${model}`);
          const result = await generateChatCompletion({
            messages: pollinationsMessages,
            model: pollinationsEntry.pollinationsModel as any,
            temperature: 0.7,
            max_tokens: 4096,
          });
          return result.choices?.[0]?.message?.content || '';
        },
        ['zhipuai'],
        fallbackCtx,
      );
    } else if (primaryProvider === 'huggingface' && customModelConfig) {
      // ── Custom Endpoint Non-Streaming Path (from Aggregator) ──
      try {
        const customMessages = messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

        const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customModelConfig.apiKey) {
          if (customModelConfig.authType === 'bearer') customHeaders['Authorization'] = `Bearer ${customModelConfig.apiKey}`;
          else if (customModelConfig.authType === 'x-api-key') customHeaders[customModelConfig.authHeader || 'x-api-key'] = customModelConfig.apiKey;
          else if (customModelConfig.authType === 'custom' && customModelConfig.authHeader) customHeaders[customModelConfig.authHeader] = customModelConfig.apiKey;
        }

        // Build the full URL — append /chat/completions for OpenAI-compatible endpoints only
        let customUrl = customModelConfig.baseUrl;
        // Note: hf-inference format should NOT get /chat/completions appended
        if (customModelConfig.apiFormat === 'openai' && !customUrl.includes('/chat/completions')) {
          customUrl = customUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        const response = await fetch(customUrl, {
          method: 'POST',
          headers: customHeaders,
          body: JSON.stringify({
            model: customModelConfig.modelId || hfDirectModelId || 'default',
            messages: customMessages,
            stream: false,
            temperature: 0.7,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Custom endpoint returned ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        assistantContent = data.choices?.[0]?.message?.content || '';
        console.log(`[ChatSend] Custom endpoint succeeded: ${customModelConfig.modelId}`);
      } catch (customErr) {
        console.warn('[ChatSend] Custom endpoint failed, falling back to ZhipuAI:', customErr instanceof Error ? customErr.message : String(customErr));
        try {
          const zai = await getZAIClient();
          const completion = await zai.chat.completions.create({
            model: glmModel,
            messages: fallbackCtx.messages,
            stream: false,
            thinking: { type: 'disabled' },
          });
          assistantContent = completion.choices?.[0]?.message?.content || '';
        } catch (sdkError) {
          console.error('SDK non-streaming error:', sdkError);
          assistantContent = FALLBACK_RESPONSE;
        }
      }
    } else if (primaryProvider === 'huggingface' && isHFDirectModel && hfDirectModelId) {
      // ── HuggingFace Non-Streaming Path (for direct HF models) ──
      try {
        const hfMessages = messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
        const result = await chatWithFallback(hfMessages, [hfDirectModelId], {
          temperature: 0.7,
          max_tokens: 8192,
        });
        assistantContent = result.content;
        console.log(`[ChatSend] HF direct model succeeded: ${result.modelUsed} (fallback: ${result.wasFallback}, attempts: ${result.attempts})`);
      } catch (hfError) {
        console.warn('[ChatSend] HF direct model failed, falling back to ZhipuAI:', hfError instanceof Error ? hfError.message : String(hfError));
        // Fall back to ZhipuAI
        try {
          const zai = await getZAIClient();
          const completion = await zai.chat.completions.create({
            model: glmModel,
            messages: fallbackCtx.messages,
            stream: false,
            thinking: { type: 'disabled' },
          });
          assistantContent = completion.choices?.[0]?.message?.content || '';
        } catch (sdkError) {
          console.error('SDK non-streaming error:', sdkError);
          assistantContent = FALLBACK_RESPONSE;
        }
      }
    } else {
      // ── ZhipuAI Path (original) ──
      try {
        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: glmModel,
          messages: fallbackCtx.messages,
          stream: false,
          thinking: { type: 'disabled' },
        });

        assistantContent = completion.choices?.[0]?.message?.content || '';
      } catch (sdkError) {
        console.error('SDK non-streaming error:', sdkError);
        assistantContent = FALLBACK_RESPONSE;
      }
    }

    // If no content was returned, use fallback
    if (!assistantContent) {
      assistantContent = FALLBACK_RESPONSE;
    }

    // ── Save assistant message to DB (with P2003 retry) ──
    // FIX: Truncate assistant content to prevent DB issues with large HTML/PDF content
    const assistantContentForDb = assistantContent.length > 50000
      ? assistantContent.slice(0, 50000) + '...'
      : assistantContent;

    if (dbConversationId && user) {
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
          console.warn('[ChatSend] FK constraint on assistant message save, creating new conversation');
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
            console.error('[ChatSend] Retry assistant message save failed:', retryError);
          }
        } else {
          console.error('Failed to save assistant message:', dbError);
        }
      }
    }

    return NextResponse.json({
      content: assistantContent,
      model,
      emotion,
      language: language || 'ar',
      conversationId: dbConversationId,
    });
  } catch (error) {
    console.error('Chat send error:', error);

    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' },
      { status: 500 }
    );
  }
}
