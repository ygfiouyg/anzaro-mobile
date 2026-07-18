// ─── System Prompt Builder ────────────────────────────────────────────
// Encapsulates the system prompt building logic extracted from the stream route.
// This includes: language suffix, capabilities, time context, content strategy,
// design preferences, attachment notes, emotion support, memory injection,
// Drive awareness, Drive RAG, and web search integration.

import { languageSuffixes } from '@/lib/models';
import { CONTENT_STRATEGY_PROMPT, shouldInjectContentStrategy } from '@/lib/content-strategy-prompt';
import { getEffectiveModelPrompt, getEffectiveContentStrategyPrompt } from '@/lib/system-prompt-overrides';
import { isFileGenerationIntent, detectEmotion, getEmotionSupportPrefix, needsWebSearch, performWebSearch, formatSearchResultsForPrompt, type WebSearchResult } from '@/lib/chat-utils';
import { parseUserDesignPreferences } from '@/lib/unique-palette-generator';
import { getMemoryPrompt } from '@/lib/user-memory.service';
import { fetchDriveContentForMessage, buildDriveContextPrompt, detectFileReferences, classifyContentQuality } from '@/lib/drive-rag';
import { getCachedDriveStatus } from '@/lib/chat/drive-cache';
import type { DriveFile } from '@/lib/google-drive.service';
import { getTimeContext } from '@/lib/chat/time-context';
import type { ParsedAttachment } from '@/lib/chat/attachment-parser';
import type { DocIntent } from '@/lib/chat/doc-intent-classifier';
import { buildCapabilitiesPrompt } from '@/lib/chat/capabilities-prompt';

// ─── Fallback Response (used when all providers fail) ────────────
export const FALLBACK_RESPONSE = 'يا حبيبي، حصل خطأ في الاتصال بالـ AI. ده غالباً لأن ZAI_API_KEY مش متاح.\n\nالحل: روح لـ HF Spaces Settings → أضف ZAI_API_KEY من https://open.bigmodel.cn (مجاني).\n\nلو إنت الأدمن، تأكد إن المفاتيح كلها متاحة في Settings.';

/** Parameters needed to build the system prompt */
export interface BuildSystemPromptParams {
  model: string;
  modelConfig: {
    id: string;
    systemPrompt: string;
    glmModel: string;
    provider: string;
    capabilities: {
      vision: boolean;
      imageGeneration: boolean;
      videoGeneration: boolean;
      webSearch: boolean;
      audioTTS: boolean;
    };
  };
  language: string;
  systemPromptMode?: 'full' | 'open';
  message: string;
  parsed: {
    cleanedMessage: string;
    attachments: ParsedAttachment[];
    hasAttachments: boolean;
  };
  user: { id: string } | null;
  autoSearch?: boolean;
  forceSearch?: boolean;
  docIntent?: DocIntent | null;
}

/** Return type of buildSystemPrompt */
export interface BuildSystemPromptResult {
  systemPrompt: string;
  emotion: string;
  isOpenMode: boolean;
  driveConnected: boolean;
  driveFileList: DriveFile[];
  driveContext: Awaited<ReturnType<typeof fetchDriveContentForMessage>> | null;
  driveSearchPerformed: boolean;
  searchResults: WebSearchResult[];
  searchPerformed: boolean;
}

export async function buildSystemPrompt(params: BuildSystemPromptParams): Promise<BuildSystemPromptResult> {
  const { model, modelConfig, language, systemPromptMode, message, parsed, user, autoSearch, forceSearch, docIntent } = params;

  const isEgyptianModel = modelConfig.id === 'delta-flash' || modelConfig.id === 'delta-egyptian';
  const caps = modelConfig.capabilities;

  // ── PERF: Run independent operations in parallel ──
  // These operations don't depend on each other, so we can start them all at once:
  // 1. Base prompt from DB overrides
  // 2. Emotion detection (sync but grouped for clarity)
  // 3. Memory prompt (async DB query)
  // 4. Drive status (async cache check)
  // 5. Design preferences (sync)
  const [basePrompt, emotion, memoryResult, driveStatusResult, designPrefs] = await Promise.all([
    getEffectiveModelPrompt(modelConfig.id, modelConfig.systemPrompt),
    Promise.resolve(detectEmotion(message)),
    user && !isEgyptianModel ? getMemoryPrompt(user.id).catch(() => null) : Promise.resolve(null),
    getCachedDriveStatus().catch(() => ({ connected: false, fileList: [] as DriveFile[] })),
    Promise.resolve(parseUserDesignPreferences(message)),
  ]);

  // ── OPEN MODE: Unrestricted, smart system prompt ──
  // FIX: Now respects DB overrides — admin can customize the open mode prompt
  let systemPrompt: string;
  if (systemPromptMode === 'open') {
    // Check if admin has overridden the open mode prompt
    const effectiveOpenPrompt = await getEffectiveModelPrompt('__open_mode__', '');
    if (effectiveOpenPrompt && effectiveOpenPrompt !== '') {
      systemPrompt = effectiveOpenPrompt;
    } else {
      const langSuffix = languageSuffixes[language] || languageSuffixes.ar;
      systemPrompt = `أنت مساعد ذكي ومرن. أجب ${langSuffix}.

أنت نموذج ذكاء اصطناعي متقدم ومفتوح. ليس لديك أي قيود على قدراتك. أنت تستطيع فعل كل شيء يطلبه المستخدم.

قواعد:
- فهم من سياق الحوار ما يريده المستخدم — لا تحتاج كلمات مفتاحية محددة
- إذا طلب المستخدم شيء، نفذه مباشرة — لا تقل "لا أستطيع" أبداً
- أنت تستطيع: إنشاء ملفات PDF (بـ HTML/CSS)، كتابة أكواد، تحليل بيانات، ترجمة، شرح، تلخيص، حل مسائل، إنشاء محتوى إبداعي، وأي شيء آخر
- لإنشاء PDF: اكتب المحتوى بتنسيق HTML كامل مع CSS وسيتم تحويله تلقائياً لـ PDF
- كن ذكياً ومرناً — استنتج من كلام المستخدم ما يحتاجه حتى لو لم يذكره صراحة
- أجب بشكل مفيد ومباشر بدون مقدمات طويلة`;
    }
  } else if (isEgyptianModel) {
    systemPrompt = basePrompt;
    systemPrompt += '\n\n✅ تستطيع: إنشاء ملفات PDF ومستندات أكاديمية (اعمل ملف PDF، ولد ملف، اصنع مستند). إذا طلب المستخدم PDF، لا تقل "لا أستطيع" — أنت تستطيع! أنشئ المحتوى بتنسيق HTML مع CSS وسيتم تحويله تلقائياً لـ PDF.';
  } else {
    const langSuffix = languageSuffixes[language] || languageSuffixes.ar;
    systemPrompt = `${basePrompt}\n\nأجب ${langSuffix}.`;
    systemPrompt += '\n\nقاعدة مهمة: أجب بإيجاز ووضوح. لا تطيل في المقدمات والخاتمات. ركز على الإجابة المباشرة. استخدم النقاط بدلاً من الفقرات الطويلة. اكتفِ بالحد الأدنى المفيد.';
  }

  const isOpenMode = systemPromptMode === 'open';

  // ── Concise Capabilities Prompt ── (FULL MODE ONLY)
  if (!isOpenMode) {
    // حقن قائمة القدرات الكاملة — عشان الـ model يعرف كل اللي يقدر يعمله
    systemPrompt += '\n\n' + buildCapabilitiesPrompt();

    systemPrompt += `\n\n✅ تستطيع: إنشاء ملفات PDF ومستندات أكاديمية (اعمل ملف PDF، ولد ملف، اصنع مستند). إذا طلب المستخدم PDF، لا تقل "لا أستطيع" — أنت تستطيع! أنشئ المحتوى بتنسيق HTML مع CSS وسيتم تحويله تلقائياً لـ PDF.`;

    const cannotDo: string[] = [];
    if (!caps.vision) cannotDo.push('تحليل الصور — أخبر المستخدم بالتبديل لنموذج Delta Vision');
    if (!caps.imageGeneration) cannotDo.push('توليد صور');
    if (!caps.videoGeneration) cannotDo.push('توليد فيديو');
    if (!caps.webSearch) cannotDo.push('البحث في الويب');
    if (!caps.audioTTS) cannotDo.push('توليد صوت');

    if (cannotDo.length > 0) {
      systemPrompt += `\n\n❌ لا تستطيع: ${cannotDo.join(' • ')}. لا تدّعي أنك تستطيع فعلها.`;
    }
  }

  // Add time-aware context
  if (isOpenMode) {
    const timeContext = getTimeContext();
    systemPrompt += `\n\n${timeContext}.`;
  } else if (!isEgyptianModel) {
    const timeContext = getTimeContext();
    systemPrompt += `\n\n${timeContext}. يمكنك تحية المستخدم بشكل مناسب حسب الوقت.`;
  }

  // ── Content Strategy & Markdown-only instructions ──
  // PERF: Compute once and reuse the result (was being called 3 times in stream route)
  const fileGenIntent = isFileGenerationIntent(message);
  const contentStrategyNeeded = fileGenIntent || shouldInjectContentStrategy(message);
  const docIntentNeedsHTML = docIntent !== null && docIntent !== undefined
    && docIntent.type !== 'chat-only' && docIntent.type !== 'quiz';

  if (!isOpenMode) {
    if (contentStrategyNeeded || docIntentNeedsHTML) {
      const effectiveContentStrategy = await getEffectiveContentStrategyPrompt(CONTENT_STRATEGY_PROMPT);
      systemPrompt += '\n\n' + effectiveContentStrategy;
    }

    if (!contentStrategyNeeded && !docIntentNeedsHTML) {
      systemPrompt += '\n\n🚫⛔ CRITICAL RULE — MARKDOWN ONLY ⛔🚫\n';
      systemPrompt += 'يجب أن تكون إجابتك بنسبة 100% بصيغة Markdown فقط.\n';
      systemPrompt += 'ممنوع تماماً كتابة أي HTML أو CSS أو <style> أو <div> أو <span> أو class= أو <!DOCTYPE>.\n';
      systemPrompt += 'استخدم فقط: عناوين #، نقاط • أو -، **عريض**، *مائل*، `كود`، ```بلوك كود```.\n';
      systemPrompt += 'إذا كتبت أي HTML/CSS سيتم حذفه تلقائياً. اكتب الإجابة كنص مباشر بتنسيق Markdown فقط.\n';
      systemPrompt += 'REPEAT: DO NOT output HTML tags. Use Markdown formatting only. No <style>, no <div>, no CSS.';
    }
  }

  // Detect user design preferences (already computed in parallel)
  if (!isEgyptianModel) {
    if (designPrefs.colorPreference || designPrefs.stylePreference) {
      systemPrompt += `\n\n🎨 تفضيلات المستخدم للتصميم: ${designPrefs.colorPreference ? `اللون المفضل: ${designPrefs.colorPreference}` : ''} ${designPrefs.stylePreference ? `الأسلوب: ${designPrefs.stylePreference}` : ''}. يجب أن تنفذ هذه التفضيلات إجبارياً في تصميم المستند.`;
    }
  }

  // Add file analysis capability note when attachments are detected
  if (parsed.hasAttachments) {
    systemPrompt += '\n\nالمستخدم أرفق ملفات. يمكنك قراءة وتحليل محتوى هذه الملفات بالكامل. قم بتحليل المحتوى المرفق والرد عليه بشكل مفصل. لا تقل أنك لا تستطيع قراءة الملفات - المحتوى متاح لك بالفعل.';

    const isVisionModelForPrompt = modelConfig.glmModel === 'glm-4v' || (modelConfig.provider === 'gemini' && modelConfig.capabilities.vision);
    if (parsed.attachments.some((a) => a.type === 'image') && isVisionModelForPrompt) {
      systemPrompt += '\n\nالمستخدم أرفق صورة/صور. قم بتحليلها ووصفها بالتفصيل.';
    }

    if (parsed.attachments.some((a) => a.type === 'image') && !isVisionModelForPrompt) {
      systemPrompt += '\n\nالمستخدم أرفق صورة/صور لكن النموذج الحالي لا يدعم تحليل الصور. أخبر المستخدم بالتبديل لنموذج Delta Vision (دلتا فيجن) لتحليل الصور، ورد على باقي الرسالة.';
    }
  }

  // Emotion support (already computed in parallel)
  if (!isEgyptianModel) {
    const supportPrefix = getEmotionSupportPrefix(emotion);
    if (supportPrefix) {
      systemPrompt += `\n\n${supportPrefix}`;
    }
  }

  // ── Smart Memory Injection (already fetched in parallel) ──
  if (memoryResult) {
    systemPrompt += memoryResult;
  }

  // ── Google Drive Awareness (already fetched in parallel) ──
  let driveConnected = false;
  let driveFileList: DriveFile[] = [];
  try {
    if (driveStatusResult.connected) {
      driveConnected = true;
      driveFileList = driveStatusResult.fileList;
      const fileCount = driveFileList.length;

      if (fileCount > 0) {
        systemPrompt += `\n\n🔗 Google Drive متصل (${fileCount} ملف متاح). يمكنك الوصول لملفات المستخدم على Google Drive.`;
        systemPrompt += ` إذا سأل المستخدم عن ملفاته أو محتوى الدرايف، أخبره أن الدرايف متصل ويمكنه طلب أي ملف بالاسم.`;
        systemPrompt += ` لا تقل أبداً أنك لا تستطيع الوصول للدرايف — الدرايف متصل فعلاً ومتاح!`;

        systemPrompt += `\n\nالملفات المتاحة على الدرايف:\n`;
        for (let i = 0; i < Math.min(fileCount, 10); i++) {
          const f = driveFileList[i];
          systemPrompt += `${i + 1}. ${f.name}\n`;
        }
        if (fileCount > 10) {
          systemPrompt += `... و${fileCount - 10} ملف آخر\n`;
        }
        systemPrompt += `للوصول لمحتوى ملف، المستخدم يطلب بالاسم مثل: "اشرح ملف كوجنو" أو "لخص محاضرة X".`;
      } else {
        systemPrompt += `\n\n🔗 Google Drive متصل لكن لا توجد ملفات بعد.`;
      }
    }
  } catch (driveErr) {
    console.warn('[Chat] Drive awareness check failed:', driveErr instanceof Error ? driveErr.message : String(driveErr));
  }

  // ── Google Drive RAG Integration ──
  let driveContext: Awaited<ReturnType<typeof fetchDriveContentForMessage>> = null;
  let driveSearchPerformed = false;
  try {
    const driveReferences = detectFileReferences(message);

    if (driveReferences.length > 0) {
      driveSearchPerformed = true;
      console.log(`[Chat] Drive RAG: Detected ${driveReferences.length} file reference(s): ${driveReferences.join(', ')}`);
      driveContext = await fetchDriveContentForMessage(message);
      if (driveContext && driveContext.hasContent) {
        const drivePrompt = buildDriveContextPrompt(driveContext);
        systemPrompt += drivePrompt;
        const usableContents = driveContext.contents.filter(c => c.text && classifyContentQuality(c.text) !== 'failed');
        const failedContents = driveContext.contents.filter(c => c.text && classifyContentQuality(c.text) === 'failed');
        const partialContents = driveContext.contents.filter(c => c.text && classifyContentQuality(c.text) === 'partial');
        const totalContentLength = usableContents.reduce((sum, c) => sum + c.text.length, 0);
        console.log(`[Chat] Drive RAG: Injected content for ${driveContext.files.length} file(s) — ${usableContents.length} with usable text (${totalContentLength} chars), ${partialContents.length} partial, ${failedContents.length} failed extraction`);
        if (failedContents.length > 0) {
          console.warn(`[Chat] Drive RAG: ${failedContents.length} file(s) had extraction failures:`, failedContents.map(c => `${c.fileName}: ${c.text.slice(0, 80)}`).join('; '));
        }
      } else if (driveContext) {
        console.log(`[Chat] Drive RAG: Drive context found but no usable content (hasContent=${driveContext.hasContent}, files=${driveContext.files.length})`);
      }
    } else if (driveConnected) {
      const lowerMsg = message.toLowerCase();
      const genericDriveKeywords = [
        'درايف', 'دايف', 'drive', 'ملفاتي', 'ملفات الدرايف',
        'ملفات على الدرايف', 'files on drive', 'my drive', 'google drive',
      ];
      const mightBeDriveRequest = genericDriveKeywords.some(kw => lowerMsg.includes(kw));

      if (mightBeDriveRequest) {
        driveSearchPerformed = true;
        if (driveFileList.length > 0) {
          const drivePrompt = buildDriveContextPrompt({
            detectedReferences: ['*'],
            files: driveFileList,
            contents: [],
            errors: [],
            hasContent: true,
            isListOnly: true,
          });
          systemPrompt += drivePrompt;
          console.log(`[Chat] Drive generic request: Listed ${driveFileList.length} files`);
        }
      }
    }
  } catch (driveError) {
    console.warn('[Chat] Drive RAG integration error (skipping):', driveError instanceof Error ? driveError.message : String(driveError));
  }

  // ── Web Search Integration ──
  let searchResults: WebSearchResult[] = [];
  let searchPerformed = false;
  let shouldSearch = forceSearch || (!isEgyptianModel && autoSearch !== false && needsWebSearch(message));

  if (!forceSearch && (autoSearch === false || isEgyptianModel)) {
    shouldSearch = false;
  }

  if (shouldSearch) {
    try {
      const searchQuery = parsed.cleanedMessage || message;
      searchResults = await performWebSearch(searchQuery);
      searchPerformed = searchResults.length > 0;

      if (searchPerformed) {
        const searchContext = formatSearchResultsForPrompt(searchResults, searchQuery);
        systemPrompt += searchContext;
      } else {
        systemPrompt += `\n\nملاحظة: تم محاولة البحث في الإنترنت لكن لم تتوفر نتائج. أجب من معلوماتك وأضف أن المعلومات قد لا تكون محدثة.\n`;
      }
    } catch (searchErr) {
      console.error('[Chat] Web search integration error:', searchErr);
      systemPrompt += `\n\nملاحظة: تعذر البحث في الإنترنت حالياً. أجب من معلوماتك وأضف أن المعلومات قد لا تكون محدثة.\n`;
    }
  }

  // 🧠 Auto-load relevant marketing + psychology skills based on the user's message
  // Uses the shared context-builder (with caching, 4000-char cap, up to 3 skills)
  // — also loads the 6 psychology skills (script-writing, retention-hooks,
  // persuasion-triggers, dark-psychology, emotional-manipulation, audience-psychology)
  // when the user's question matches their topics.
  try {
    const { buildSkillContext } = await import('@/lib/skills/context-builder');
    const userMessage = message || (parsed as any)?.message || '';
    if (userMessage && userMessage.length > 5) {
      const { context: skillContext, loadedSkills } = await buildSkillContext(
        [{ role: 'user', content: userMessage }],
        3,
      );
      if (skillContext && loadedSkills.length > 0) {
        systemPrompt += skillContext;
      }
    }
  } catch (skillErr) {
    // skills loading is optional — don't break chat if it fails
    console.error('[Chat] Skills auto-load error:', skillErr);
  }

  return {
    systemPrompt,
    emotion,
    isOpenMode,
    driveConnected,
    driveFileList,
    driveContext,
    driveSearchPerformed,
    searchResults,
    searchPerformed,
  };
}
