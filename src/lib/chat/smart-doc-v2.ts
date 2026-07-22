// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI — Enhanced Smart Document Pipeline V2
// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENTRY POINT for all document operations in the chat.
//
// Flow:
//   1. Classify intent (regex, no LLM — FAST)
//   2. Extract text from attachments
//   3. Route to the appropriate processing function
//   4. Generate a beautiful PDF via the rendering pipeline
//   5. Save & return
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
//
// Task ID: 15
// ═══════════════════════════════════════════════════════════════════════════

import { classifyDocIntent, type DocIntentType, type DocIntent } from '@/lib/chat/doc-intent-classifier';
import {
  extractTopicFromFiles,
  summarizeFiles,
  compileFiles,
  compileFilesChunked,
  extractOutline,
  type ExtractedFile,
} from '@/lib/chat/multi-file-extractor';
import { extractTextFromPdfBase64 } from '@/lib/pdf-text-extractor';
import { renderToPDF, type RenderingRequest } from '@/lib/rendering-pipeline';
import { getZAIClient } from '@/lib/chat-utils';
import { basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ─── Database Import ────────────────────────────────────────────────────────

// Lazy import to avoid circular dependency issues
let _db: any = null;
async function getDb() {
  if (!_db) {
    const mod = await import('@/lib/db');
    _db = mod.db;
  }
  return _db;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SmartDocV2Input {
  message: string;
  attachments: Array<{
    name: string;
    content?: string;           // base64 for PDFs
    textContent?: string;       // extracted text
    type: 'pdf' | 'text' | 'image' | 'other';
    size: string;
  }>;
  language: 'ar' | 'en';
  channelName?: string;
  userId?: string;              // For saving to DB
  intent?: DocIntent;           // Pre-classified intent from doc-intent-classifier
}

export interface SmartDocV2Result {
  success: boolean;
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  docType?: string;
  durationMs?: number;
  intent?: DocIntentType;
  error?: string;
}

export type ProgressCallback = (
  stage: string,
  progress: number,
  message: string,
  detail?: string,
) => void;

// ─── Constants ──────────────────────────────────────────────────────────────

const PDF_MAX_LEN = 200 * 1024; // 200KB max per PDF extraction (was 80KB — too low for large lectures)
const OVERALL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max (was 5 min — too short for 8+ files)

// ─── Title Map ──────────────────────────────────────────────────────────────

const INTENT_TITLE_MAP: Record<DocIntentType, string> = {
  'extract-topic': 'استخراج',
  'summarize': 'ملخص المحاضرات',
  'compile': 'تجميعة المحاضرات',
  'outline': 'فهرس المحاضرات',
  'compare': 'مقارنة المحاضرات',
  'flashcards': 'كروت مراجعة',
  'quiz': 'كويز',
  'smart-doc': 'مستند ذكي',
  'generate-pptx': 'عرض تقديمي',
  'generate-docx': 'مستند Word',
  'generate-file': 'ملف',
  'chat-only': '',
};

// ─── LLM Streaming Helper ──────────────────────────────────────────────────

async function callLLMStreamed(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash',
): Promise<string> {
  const zai = await getZAIClient();

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ];

  const completion = await zai.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  let fullContent = '';

  try {
    for await (const chunk of completion) {
      let chunkStr: string;
      if (typeof chunk === 'string') {
        chunkStr = chunk;
      } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        chunkStr = new TextDecoder().decode(chunk);
      } else if (chunk && typeof chunk === 'object') {
        const content = (chunk as any).choices?.[0]?.delta?.content || '';
        if (content) fullContent += content;
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
          if (content) fullContent += content;
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } catch (error) {
    console.error('[SmartDocV2] Streaming error:', error);
  }

  return fullContent;
}

async function callLLMWithTimeout(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number = 60_000,
  model: string = 'glm-4-flash',
): Promise<string> {
  // V.49: Timeout removed — user explicitly requested removing ALL timeouts
  try {
    const result = await callLLMStreamed(systemPrompt, userMessage, model);
    return result;
  } catch (error) {
    console.error('[SmartDocV2] LLM call error:', error instanceof Error ? error.message : String(error));
    return '';
  }
}

// ─── Step 2: Extract Text from Attachments ──────────────────────────────────

async function extractTextFromAttachments(
  attachments: SmartDocV2Input['attachments'],
  onProgress?: ProgressCallback,
): Promise<ExtractedFile[]> {
  const files: ExtractedFile[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    let content = '';
    let extractionWarning = '';

    // V.37: Start a periodic heartbeat during PDF extraction.
    // PDF text extraction can take 10-30s. The HF proxy kills idle connections
    // after ~10s. This interval sends a progress event every 5s to keep the
    // connection alive.
    let heartbeatElapsed = 0;
    const heartbeatInterval = setInterval(() => {
      heartbeatElapsed += 5;
      onProgress?.(
        'extracting',
        8 + Math.min(heartbeatElapsed, 7), // 8-15%
        `جاري استخراج النص من ${att.name}... (${heartbeatElapsed}s)`,
        att.name,
      );
    }, 5_000);

    try {
      if (att.type === 'pdf' && att.content) {
        // PDF: use the extractor
        if (att.content.startsWith('data:application/pdf;base64,')) {
          content = await extractTextFromPdfBase64(att.content, PDF_MAX_LEN);
        } else if (att.content.startsWith('JVBERi0') || att.content.length > 500) {
          // Might be raw base64 PDF without the data URI prefix
          content = await extractTextFromPdfBase64(
            `data:application/pdf;base64,${att.content}`,
            PDF_MAX_LEN,
          );
        } else {
          // Content might already be extracted text
          content = att.content;
        }

        // Check if PDF extraction produced an error message (Arabic)
        // These messages start with '[' and contain error indicators
        if (content.startsWith('[') && (content.includes('لم يتم استخراج') || content.includes('خطأ'))) {
          extractionWarning = content;
          // Try using textContent if available from a previous extraction
          if (att.textContent && att.textContent.trim().length > 50) {
            content = att.textContent;
            extractionWarning = '';
          } else {
            // Mark as minimal content — still include in compilation with a note
            content = `[⚠️ هذا الملف يحتوي على محتوى بصري (صور/رسوم بيانية) لم يتم استخراج نص منه بشكل كامل. اسم الملف: ${att.name}]\n\nقد يحتوي الملف على معلومات مهمة في شكل صور أو رسوم بيانية. يرجى مراجعة الملف الأصلي.`;
          }
        }
      } else if (att.type === 'text') {
        // Text files: use textContent directly, fall back to content
        content = att.textContent || att.content || '';
      } else if (att.type === 'image') {
        // Images: we can't extract text, but note it
        content = `[صورة: ${att.name}]`;
      } else {
        // Other: try to use whatever text is available
        content = att.textContent || att.content || '';
      }
    } catch (error) {
      console.error(`[SmartDocV2] Failed to extract text from "${att.name}":`, error);
      content = att.textContent || `[فشل استخراج المحتوى من: ${att.name}]`;
    } finally {
      // V.37: Always clear the heartbeat interval when extraction is done
      clearInterval(heartbeatInterval);
    }

    const fileSize = parseInt(att.size) || content.length;

    files.push({
      name: att.name,
      content,
      type: att.type === 'pdf' ? 'pdf' : att.type === 'text' ? 'text' : 'text',
      size: fileSize,
    });

    onProgress?.(
      'extracting',
      Math.round(((i + 1) / attachments.length) * 15) + 5, // 5-20%
      'جاري استخراج النص من الملفات...',
      `${att.name} — ${content.length} حرف`,
    );
  }

  return files;
}

// ─── Step 3: Route based on intent type ─────────────────────────────────────

/**
 * extract-topic: Call extractTopicFromFiles and format results as markdown.
 */
async function routeExtractTopic(
  files: ExtractedFile[],
  intent: DocIntent,
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  const topic = intent.topic || intent.rawTopic || '';
  onProgress?.('processing', 25, `جاري استخراج ${topic ? topic + ' ' : ''}من الملفات...`, undefined);

  const result = await extractTopicFromFiles(files, topic, language);

  if (!result.matches || result.matches.length === 0) {
    return language === 'en'
      ? `## No results found for "${topic}"\n\nNo relevant content was found in the uploaded files.`
      : `## لم يتم العثور على نتائج لـ "${topic}"\n\nلم يتم العثور على محتوى ذي صلة في الملفات المرفقة.`;
  }

  // Format results as structured markdown
  let markdown = language === 'en'
    ? `## Extraction: ${topic}\n\n`
    : `## استخراج: ${topic}\n\n`;

  // Group by file
  const byFile = new Map<string, typeof result.matches>();
  for (const match of result.matches) {
    const existing = byFile.get(match.fileName) || [];
    existing.push(match);
    byFile.set(match.fileName, existing);
  }

  for (const [fileName, matches] of byFile) {
    markdown += `### ${fileName}\n\n`;
    for (const match of matches) {
      if (match.sectionTitle) {
        markdown += `**${match.sectionTitle}**\n\n`;
      }
      markdown += `${match.content}\n\n`;
    }
  }

  // Add summary if available
  if (result.summary) {
    markdown += language === 'en'
      ? `### Summary\n\n${result.summary}\n`
      : `### ملخص\n\n${result.summary}\n`;
  }

  onProgress?.('processing', 60, 'تم استخراج الموضوع', `${result.matches.length} نتائج`);
  return markdown;
}

/**
 * summarize: Call summarizeFiles and format as structured markdown.
 */
async function routeSummarize(
  files: ExtractedFile[],
  intent: DocIntent,
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  const depth = intent.depth || 'medium';
  onProgress?.('processing', 25, 'جاري تلخيص الملفات...', `العمق: ${depth}`);

  const result = await summarizeFiles(files, depth, language);

  let markdown = language === 'en'
    ? `## Lecture Summaries\n\n`
    : `## ملخص المحاضرات\n\n`;

  // Per-file sections
  for (const fileSummary of result.perFile) {
    markdown += `### ${fileSummary.fileName}\n\n`;
    markdown += `${fileSummary.summary}\n\n`;

    if (fileSummary.keyPoints.length > 0) {
      markdown += language === 'en'
        ? `**Key Points:**\n`
        : `**النقاط الرئيسية:**\n`;
      for (const point of fileSummary.keyPoints) {
        markdown += `- ${point}\n`;
      }
      markdown += '\n';
    }
  }

  // Cross-file summary
  if (result.crossSummary) {
    markdown += language === 'en'
      ? `### Cross-File Summary\n\n`
      : `### ملخص شامل\n\n`;
    markdown += `${result.crossSummary}\n\n`;
  }

  // Common themes
  if (result.commonThemes.length > 0) {
    markdown += language === 'en'
      ? `### Common Themes\n\n`
      : `### المواضيع المشتركة\n\n`;
    for (const theme of result.commonThemes) {
      markdown += `- ${theme}\n`;
    }
    markdown += '\n';
  }

  onProgress?.('processing', 60, 'تم تلخيص الملفات', `${result.perFile.length} ملفات`);
  return markdown;
}

/**
 * compile: Use ZERO-LOSS chunked compilation — each file is processed
 * individually to prevent information loss, then merged.
 * If the intent has a topic (e.g., "قوانين"), use topic-specific extraction.
 */
async function routeCompile(
  files: ExtractedFile[],
  intent: DocIntent,
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  const title = language === 'en' ? 'Compiled Lectures' : 'تجميعة المحاضرات';
  const topic = intent.topic || intent.rawTopic;
  onProgress?.('processing', 25, topic
    ? `جاري استخراج ${topic} من الملفات...`
    : 'جاري تجميع الملفات...',
    topic ? `الموضوع: ${topic}` : undefined
  );

  // Use chunked compilation — each file is processed individually
  // to prevent information loss. If a topic is provided, extract
  // only content related to that topic.
  const result = await compileFilesChunked(files, title, language, topic);

  let markdown = `## ${result.title}\n\n`;

  // Table of contents
  if (result.tableOfContents.length > 1) {
    markdown += language === 'en'
      ? `### Table of Contents\n\n`
      : `### فهرس المحتويات\n\n`;
    for (const entry of result.tableOfContents) {
      markdown += `${entry.page}. **${entry.title}** — ${entry.source}\n`;
    }
    markdown += '\n';
  }

  // Sections
  for (const section of result.sections) {
    markdown += `### ${section.title}\n\n`;
    markdown += `> ${language === 'en' ? 'Source' : 'المصدر'}: ${section.sourceFile}\n\n`;
    markdown += `${section.content}\n\n`;
  }

  onProgress?.('processing', 60, 'تم تجميع الملفات', `${result.sections.length} أقسام، ${result.totalWordCount} كلمة`);
  return markdown;
}

/**
 * outline: Call extractOutline and use the result directly.
 */
async function routeOutline(
  files: ExtractedFile[],
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  onProgress?.('processing', 25, 'جاري إنشاء الفهرس...', undefined);

  const outlineContent = await extractOutline(files, language);

  onProgress?.('processing', 60, 'تم إنشاء الفهرس', undefined);
  return outlineContent;
}

/**
 * compare: Use LLM to compare content across files.
 */
async function routeCompare(
  files: ExtractedFile[],
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  onProgress?.('processing', 25, 'جاري المقارنة بين الملفات...', undefined);

  const isAr = language === 'ar';

  // Build the combined content for comparison
  const filesContent = files
    .filter((f) => f.content && f.content.trim().length > 0)
    .map((f, i) => {
      const header = isAr
        ? `--- ملف ${i + 1}: ${f.name} ---`
        : `--- File ${i + 1}: ${f.name} ---`;
      const truncated = f.content.length > 30_000
        ? f.content.substring(0, 30_000) + '\n[... Content truncated]'
        : f.content;
      return `${header}\n${truncated}\n--- ${isAr ? 'نهاية الملف' : 'End of file'} ---`;
    })
    .join('\n\n');

  const systemPrompt = isAr
    ? `أنت كاتب أكاديمي محترف. مهمتك هي مقارنة المحتوى من عدة ملفات وإنشاء مستند مقارنة شامل.

قواعد المقارنة:
1. حدد أوجه التشابه والاختلاف بين الملفات
2. أنشئ جدول مقارنة حيثما يناسب
3. أشر للنقاط الفريدة في كل ملف
4. نظم المقارنة بشكل منطقي (حسب الموضوع أو المحور)
5. اختم بخلاصة شاملة للمقارنة

تنسيق المحتوى:
- استخدم ## للعناوين الرئيسية
- استخدم ### للعناوين الفرعية
- استخدم **bold** للتأكيد
- استخدم جداول markdown للمقارنات
- استخدم :::callout-hook للنقاط الجذابة
- استخدم :::callout-rule للقواعد المهمة
- اكتب باللغة العربية`
    : `You are a professional academic writer. Your task is to compare content from multiple files and create a comprehensive comparison document.

Comparison rules:
1. Identify similarities and differences between files
2. Create comparison tables where appropriate
3. Highlight unique points in each file
4. Organize the comparison logically (by topic or axis)
5. Conclude with a comprehensive comparison summary

Content formatting:
- Use ## for main headings
- Use ### for subheadings
- Use **bold** for emphasis
- Use markdown tables for comparisons
- Use :::callout-hook for attention-grabbing points
- Use :::callout-rule for important rules
- Write in English`;

  const userMessage = isAr
    ? `قارن بين المحتوى التالي من عدة ملفات:\n\n${filesContent}`
    : `Compare the following content from multiple files:\n\n${filesContent}`;

  const result = await callLLMWithTimeout(systemPrompt, userMessage, 90_000);

  if (!result || result.length < 50) {
    // Fallback: simple side-by-side listing
    let fallback = isAr
      ? `## مقارنة المحاضرات\n\n`
      : `## Lecture Comparison\n\n`;
    for (const file of files) {
      if (!file.content || file.content.trim().length === 0) continue;
      fallback += `### ${file.name}\n\n`;
      fallback += `${file.content.substring(0, 2000)}\n\n`;
    }
    onProgress?.('processing', 60, 'تم المقارنة (نسخة مبسطة)', undefined);
    return fallback;
  }

  onProgress?.('processing', 60, 'تم المقارنة بين الملفات', undefined);
  return result;
}

/**
 * flashcards: Use LLM to generate flashcard-style content.
 */
async function routeFlashcards(
  files: ExtractedFile[],
  language: 'ar' | 'en',
  onProgress?: ProgressCallback,
): Promise<string> {
  onProgress?.('processing', 25, 'جاري إنشاء كروت المراجعة...', undefined);

  const isAr = language === 'ar';

  // Build combined content
  const filesContent = files
    .filter((f) => f.content && f.content.trim().length > 0)
    .map((f, i) => {
      const header = isAr
        ? `--- ملف ${i + 1}: ${f.name} ---`
        : `--- File ${i + 1}: ${f.name} ---`;
      const truncated = f.content.length > 30_000
        ? f.content.substring(0, 30_000) + '\n[... Content truncated]'
        : f.content;
      return `${header}\n${truncated}\n--- ${isAr ? 'نهاية الملف' : 'End of file'} ---`;
    })
    .join('\n\n');

  const systemPrompt = isAr
    ? `أنت معلّم محترف متخصص في إنشاء كروت المراجعة. مهمتك هي تحويل المحتوى من عدة ملفات إلى كروت مراجعة فعّالة.

قواعد إنشاء الكروت:
1. كل كرت يجب أن يحتوي على سؤال في الأم وإجابة في الخلف
2. اجعل الأسئلة واضحة ومحددة
3. اجعل الإجابات موجزة ولكن كافية
4. غطِّ كل المواضيع المهمة من الملفات
5. رتّب الكروت حسب الموضوع

تنسيق كل كرت:
:::callout-hook
**السؤال:** [السؤال هنا]
:::

:::callout-rule
**الإجابة:** [الإجابة هنا]
:::

اكتب باللغة العربية. أنشئ على الأقل 10 كروت مراجعة.`
    : `You are a professional educator specialized in creating flashcards. Your task is to convert content from multiple files into effective review cards.

Flashcard rules:
1. Each card should have a question on the front and an answer on the back
2. Make questions clear and specific
3. Make answers concise but sufficient
4. Cover all important topics from the files
5. Organize cards by topic

Format for each card:
:::callout-hook
**Question:** [Question here]
:::

:::callout-rule
**Answer:** [Answer here]
:::

Write in English. Create at least 10 flashcards.`;

  const userMessage = isAr
    ? `أنشئ كروت مراجعة من المحتوى التالي:\n\n${filesContent}`
    : `Create flashcards from the following content:\n\n${filesContent}`;

  const result = await callLLMWithTimeout(systemPrompt, userMessage, 90_000);

  if (!result || result.length < 50) {
    // Fallback: simple Q&A from key points
    let fallback = isAr
      ? `## كروت مراجعة\n\n`
      : `## Review Flashcards\n\n`;
    for (const file of files) {
      if (!file.content || file.content.trim().length === 0) continue;
      fallback += `### ${file.name}\n\n`;
      // Create a few basic flashcards from the first lines
      const lines = file.content.split('\n').filter((l) => l.trim().length > 20).slice(0, 5);
      for (let idx = 0; idx < lines.length; idx++) {
        fallback += `:::callout-hook\n**${isAr ? 'السؤال' : 'Question'} ${idx + 1}:** ما هو ${lines[idx].substring(0, 80)}؟\n:::\n\n`;
        fallback += `:::callout-rule\n**${isAr ? 'الإجابة' : 'Answer'}:** ${lines[idx]}\n:::\n\n`;
      }
    }
    onProgress?.('processing', 60, 'تم إنشاء الكروت (نسخة مبسطة)', undefined);
    return fallback;
  }

  onProgress?.('processing', 60, 'تم إنشاء كروت المراجعة', undefined);
  return result;
}

/**
 * smart-doc: Unified fallback — use renderToPDF directly.
 * Replaces the old smart-document-pipeline with the same rendering engine.
 */
async function routeSmartDoc(
  input: SmartDocV2Input,
  onProgress?: ProgressCallback,
): Promise<SmartDocV2Result> {
  onProgress?.('processing', 25, 'جاري معالجة المستند الذكي...', undefined);

  // Step 1: Extract text from all attachments
  const fileTexts: string[] = [];
  for (const att of input.attachments) {
    const text = att.textContent || att.content || '';
    if (text) {
      fileTexts.push(`## ${att.name}\n${text}`);
    }
  }

  // Step 2: Ask LLM to compile the content based on user request
  onProgress?.('processing', 40, 'جاري تحليل المحتوى وتجميعه...', undefined);
  const isAr = input.language === 'ar';
  const compilePrompt = isAr
    ? `أنت مصمم محتوى احترافي. لديك المحتوى التالي من ملفات مرفقة، والمستخدم يطلب: "${input.message}"

قم بتنظيم وتجميع المحتوى في شكل Markdown منظم مع عناوين فرعية مبتكرة.
استخدم :::callout-hook للنقاط المهمة و:::note للملاحظات.
ابدأ مباشرة بالمحتوى بدون مقدمات إنشائية.

--- المحتوى ---
${fileTexts.join('\n\n')}`
    : `You are a professional content designer. You have the following content from attached files, and the user requests: "${input.message}"

Organize and compile the content into structured Markdown with creative subheadings.
Use :::callout-hook for key points and :::note for notes.
Start directly with content, no filler introductions.

--- Content ---
${fileTexts.join('\n\n')}`;

  let compiledContent: string;
  try {
    const zai = await getZAIClient();
    const llmResult = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: compilePrompt },
        { role: 'user', content: input.message },
      ],
      temperature: 0.7,
      max_tokens: 16000, // Was 4000 — too low for multi-file compilations
    });
    compiledContent = llmResult.choices?.[0]?.message?.content || fileTexts.join('\n\n');
  } catch {
    compiledContent = fileTexts.join('\n\n');
  }

  // Step 3: Generate PDF via the unified rendering pipeline
  onProgress?.('designing', 70, 'جاري تصميم المستند...', undefined);
  const title = isAr ? 'مستند ذكي' : 'Smart Document';
  const renderResult = await renderToPDF({
    content: compiledContent,
    title,
    language: input.language,
    useDesignReasoning: true,
    documentType: 'summary',
  });

  if (!renderResult.success || !renderResult.filePath) {
    throw new Error(renderResult.error || 'PDF generation failed');
  }

  const fileName = `${title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.pdf`;
  const pathFileName = basename(renderResult.filePath);
  const fileUrl = `/api/pdf/serve/${pathFileName}`;

  onProgress?.('rendering', 90, 'تم إنشاء ملف PDF', undefined);

  return {
    success: true,
    fileUrl,
    filePath: renderResult.filePath,
    fileName,
    docType: 'pdf',
    durationMs: 0,
    intent: 'smart-doc',
  };
}

// ─── Step 4: Generate PDF ───────────────────────────────────────────────────

async function generatePDFFromContent(
  content: string,
  title: string,
  language: 'ar' | 'en',
  channelName?: string,
  fileCount?: number,
  onProgress?: ProgressCallback,
): Promise<{ filePath: string; fileName: string; fileUrl: string }> {
  onProgress?.('designing', 70, 'جاري تصميم المستند...', 'Omni orchestrator');

  // V.46: Use the Anzaro Omni-Orchestrator for PDF generation
  // The user requested: "خلي الموديل يستخدمه ف انشاء الملفات"
  try {
    const { runAnzaroOrchestrator } = await import('@/lib/pdf-engine/anzaro-orchestrator');
    const { enhanceAnzaroHTML } = await import('@/lib/pdf-engine/anzaro-designer');
    const { renderHTMLToPDFAnzaro, isAnzaroPrinterAvailable } = await import('@/lib/pdf-engine/printer');

    const playwrightAvailable = await isAnzaroPrinterAvailable();
    if (playwrightAvailable) {
      onProgress?.('designing', 75, 'جاري تشغيل Omni Orchestrator...', 'Anzaro AI');

      const omniInput = {
        title,
        topic: title,
        description: content.slice(0, 5000),
        userDocuments: [{ name: title, content: content.slice(0, 50000) }],
        targetPages: 3,
        language,
        style: 'academic',
      };

      const orchestratorOutput = await runAnzaroOrchestrator(omniInput);
      const finalHTML = enhanceAnzaroHTML(orchestratorOutput, omniInput);

      onProgress?.('rendering', 85, 'جاري إنشاء ملف PDF...', 'Playwright (Omni)');

      const printResult = await renderHTMLToPDFAnzaro({
        html: finalHTML,
        title,
        language,
      });

      if (printResult.success && printResult.filePath) {
        const safeName = title
          .replace(/[^a-zA-Z0-9\u0600-\u06FF\s_-]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 60);
        const fileName = `${safeName || 'smart_document'}.pdf`;
        const pathFileName = basename(printResult.filePath);
        const fileUrl = `/api/pdf/serve/${pathFileName}`;

        onProgress?.('rendering', 90, 'تم إنشاء ملف PDF', printResult.filePath);

        return {
          filePath: printResult.filePath,
          fileName,
          fileUrl,
        };
      }
    }
  } catch (omniErr) {
    console.warn('[SmartDocV2] Omni orchestrator failed, falling back to renderToPDF:', omniErr instanceof Error ? omniErr.message : String(omniErr));
  }

  // Fallback: use the original rendering pipeline
  onProgress?.('designing', 75, 'جاري تصميم المستند...', 'rendering pipeline fallback');

  const renderRequest: RenderingRequest = {
    content,
    title,
    language,
    useDesignReasoning: true,
    documentType: 'summary',
    batchMeta: fileCount && fileCount > 1 ? {
      lectures: Array.from({ length: fileCount }, (_, i) => ({ title: `محاضرة ${i + 1}`, index: i })),
      channelName: channelName || 'بعقل هادي',
      totalLectures: fileCount,
    } : undefined,
  };

  const renderResult = await renderToPDF(renderRequest);

  onProgress?.('rendering', 85, 'جاري إنشاء ملف PDF...', 'Playwright rendering');

  if (!renderResult.success || !renderResult.filePath) {
    throw new Error(renderResult.error || 'PDF generation failed');
  }

  // Build the file name from the document title
  const safeName = title
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s_-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60);
  const fileName = `${safeName || 'smart_document'}.pdf`;

  // Extract just the filename from the path for the URL
  const pathFileName = basename(renderResult.filePath);
  const fileUrl = `/api/pdf/serve/${pathFileName}`;

  onProgress?.('rendering', 90, 'تم إنشاء ملف PDF', renderResult.filePath);

  return {
    filePath: renderResult.filePath,
    fileName,
    fileUrl,
  };
}

// ─── Step 5: Save to DB ─────────────────────────────────────────────────────

async function saveToDatabase(
  userId: string,
  filePath: string,
  title: string,
  docType: string,
  prompt: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.generativeAsset.create({
      data: {
        type: 'pdf',
        title,
        prompt: prompt.substring(0, 500),
        filePath,
        userId,
        model: 'smart-doc-v2',
      },
    });
    console.log(`[SmartDocV2] Saved GenerativeAsset for user ${userId}: ${title}`);
  } catch (error) {
    // Non-fatal — don't fail the whole operation if DB save fails
    console.error('[SmartDocV2] Failed to save GenerativeAsset:', error instanceof Error ? error.message : String(error));
  }
}

// ─── Main Pipeline Function ────────────────────────────────────────────────

/**
 * Process a smart document request — the UNIFIED ENTRY POINT for all
 * document operations in the chat.
 *
 * @param input - The user message, attachments, language, and optional userId
 * @param onProgress - Optional callback for progress updates
 * @returns SmartDocV2Result with file info or error
 */
export async function processSmartDocV2(
  input: SmartDocV2Input,
  onProgress?: ProgressCallback,
): Promise<SmartDocV2Result> {
  const startTime = Date.now();

  // V.39: Removed the overall timeout wrapper (OVERALL_TIMEOUT_MS).
  // The user explicitly requested removing all timeouts — "نشيل فكره التايم اوت دي خلاص".
  // The timeout was cutting off long operations (PDF summarization of 50+ page files)
  // before they could complete. Now the pipeline runs until it finishes or errors.
  // The user can manually cancel via the Stop button (stopStreaming action in chat-store).
  return executePipeline(input, onProgress, startTime);
}

/**
 * Inner pipeline implementation — separated from the timeout wrapper.
 */
async function executePipeline(
  input: SmartDocV2Input,
  onProgress?: ProgressCallback,
  startTime?: number,
): Promise<SmartDocV2Result> {
  const _startTime = startTime || Date.now();
  const language = input.language || 'ar';

  console.log(`[SmartDocV2] Starting pipeline with ${input.attachments.length} attachments, language=${language}`);

  // ── Step 1: Classify Intent ──────────────────────────────────────────────
  onProgress?.('classifying', 2, language === 'en' ? 'Classifying request...' : 'تحليل الطلب...', undefined);

  // Use pre-classified intent if provided, otherwise classify internally
  const hasAttachments = input.attachments.length > 0;
  const intent = input.intent || classifyDocIntent(input.message, hasAttachments);

  // If intent is null or 'chat-only', return early
  if (!intent || intent.type === 'chat-only') {
    console.log('[SmartDocV2] No document intent detected — returning early');
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: intent?.type || 'chat-only',
      error: language === 'en'
        ? 'No document request detected'
        : 'لم يتم اكتشاف طلب مستند',
    };
  }

  // If intent is 'quiz', delegate to existing quiz service
  if (intent.type === 'quiz') {
    console.log('[SmartDocV2] Quiz intent detected — delegating to quiz service');
    // Return a special result that the caller can use to route to quiz service
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: 'quiz',
      docType: 'quiz',
      error: language === 'en'
        ? 'Quiz intent — delegate to quiz service'
        : 'طلب كويز — يُحوّل لخدمة الكويز',
    };
  }

  console.log(`[SmartDocV2] Intent: ${intent.type}, confidence=${intent.confidence}, topic="${intent.topic || '-'}"`);

  onProgress?.('classifying', 5, language === 'en' ? 'Intent classified' : 'تم تحليل الطلب', `${intent.type} (${(intent.confidence * 100).toFixed(0)}%)`);

  // ── Step 2: Extract Text from Attachments ────────────────────────────────
  if (input.attachments.length === 0) {
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: intent.type,
      error: language === 'en'
        ? 'No attachments provided for document generation'
        : 'لم يتم توفير مرفقات لإنشاء المستند',
    };
  }

  // V.37: Send a heartbeat RIGHT BEFORE extraction starts.
  // PDF text extraction can take 10-30s for a 53-page file. During this time,
  // no progress events are sent. The HF proxy kills idle connections after
  // ~10s. This heartbeat ensures the proxy sees activity.
  onProgress?.('extracting', 8, language === 'en' ? 'Starting text extraction...' : 'جاري بدء استخراج النص...', undefined);

  const files = await extractTextFromAttachments(input.attachments, onProgress);

  // Check if any files had extractable content
  // Filter out only files with pure error messages (no ⚠️ warnings — those are still useful)
  const filesWithContent = files.filter((f) => {
    if (!f.content || f.content.trim().length === 0) return false;
    // Exclude pure error messages like "[لم يتم استخراج نص...]" or "[فشل استخراج...]"
    // But INCLUDE warning messages like "[⚠️ هذا الملف يحتوي على محتوى بصري...]"
    if (f.content.startsWith('[') && !f.content.startsWith('[⚠️') && f.content.length < 200) return false;
    return true;
  });
  if (filesWithContent.length === 0) {
    const error = language === 'en'
      ? 'No extractable content found in any of the uploaded files'
      : 'لم يتم العثور على محتوى قابل للاستخراج في أي من الملفات المرفقة';
    onProgress?.('error', 20, error, undefined);
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: intent.type,
      error,
    };
  }

  console.log(`[SmartDocV2] Extracted text from ${filesWithContent.length}/${files.length} files`);

  // ── Step 3: Route based on intent type ────────────────────────────────────
  let content: string;
  let docTitle: string;

  try {
    switch (intent.type) {
      case 'extract-topic': {
        content = await routeExtractTopic(filesWithContent, intent, language, onProgress);
        docTitle = `استخراج: ${intent.topic || intent.rawTopic || input.message.substring(0, 40)}`;
        break;
      }

      case 'summarize': {
        content = await routeSummarize(filesWithContent, intent, language, onProgress);
        docTitle = language === 'en' ? 'Lecture Summaries' : 'ملخص المحاضرات';
        break;
      }

      case 'compile': {
        content = await routeCompile(filesWithContent, intent, language, onProgress);
        docTitle = language === 'en' ? 'Compiled Lectures' : 'تجميعة المحاضرات';
        break;
      }

      case 'outline': {
        content = await routeOutline(filesWithContent, language, onProgress);
        docTitle = language === 'en' ? 'Lecture Outline' : 'فهرس المحاضرات';
        break;
      }

      case 'compare': {
        content = await routeCompare(filesWithContent, language, onProgress);
        docTitle = language === 'en' ? 'Lecture Comparison' : 'مقارنة المحاضرات';
        break;
      }

      case 'flashcards': {
        content = await routeFlashcards(filesWithContent, language, onProgress);
        docTitle = language === 'en' ? 'Review Flashcards' : 'كروت مراجعة';
        break;
      }

      case 'smart-doc': {
        // Fallback: use existing processSmartDocument
        const legacyResult = await routeSmartDoc(input, onProgress);
        return {
          ...legacyResult,
          intent: 'smart-doc',
        };
      }

      default: {
        // Unknown intent type — fallback to smart-doc
        console.warn(`[SmartDocV2] Unknown intent type "${intent.type}", falling back to smart-doc`);
        const legacyResult = await routeSmartDoc(input, onProgress);
        return {
          ...legacyResult,
          intent: intent.type,
        };
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SmartDocV2] Processing failed for intent "${intent.type}":`, errorMsg);
    onProgress?.('error', 40, `خطأ في المعالجة: ${errorMsg}`, undefined);
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: intent.type,
      error: errorMsg,
    };
  }

  // ── Step 4: Generate PDF ──────────────────────────────────────────────────
  let pdfResult: { filePath: string; fileName: string; fileUrl: string };

  try {
    pdfResult = await generatePDFFromContent(
      content,
      docTitle,
      language,
      input.channelName,
      filesWithContent.length,
      onProgress,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[SmartDocV2] PDF generation failed:', errorMsg);
    onProgress?.('error', 75, `خطأ في إنشاء PDF: ${errorMsg}`, undefined);
    return {
      success: false,
      durationMs: Date.now() - _startTime,
      intent: intent.type,
      error: errorMsg,
    };
  }

  // ── Step 5: Save & Return ────────────────────────────────────────────────
  // Save GenerativeAsset to database if userId is provided
  if (input.userId) {
    await saveToDatabase(
      input.userId,
      pdfResult.filePath,
      docTitle,
      intent.type,
      input.message,
    );
  }

  const durationMs = Date.now() - _startTime;
  onProgress?.('complete', 100, 'تم إنشاء المستند بنجاح!', pdfResult.fileName);

  console.log(`[SmartDocV2] Pipeline completed in ${durationMs}ms — ${pdfResult.filePath} (intent: ${intent.type})`);

  return {
    success: true,
    fileUrl: pdfResult.fileUrl,
    filePath: pdfResult.filePath,
    fileName: pdfResult.fileName,
    docType: intent.type,
    durationMs,
    intent: intent.type,
  };
}
