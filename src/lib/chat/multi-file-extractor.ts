// ═══════════════════════════════════════════════════════════════════════════
// DELTA_AI Multi-File RAG Extractor
// ═══════════════════════════════════════════════════════════════════════════
// Intelligent extraction and processing of content from multiple uploaded
// files. Supports topic extraction, summarization, compilation, and
// outline generation across PDF, text, and DOCX files.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════════

import { getZAIClient } from '@/lib/chat-utils';

// ─── Core Types ─────────────────────────────────────────────────────────────

export interface ExtractedFile {
  name: string;
  content: string;           // Full extracted text
  type: 'pdf' | 'text' | 'docx';
  size: number;
  pageCount?: number;
}

export interface TopicExtraction {
  topic: string;             // The topic searched for
  matches: Array<{
    fileName: string;
    sectionTitle?: string;   // If we can detect a section heading
    content: string;         // The relevant extracted content
    relevance: number;       // 0-1 relevance score
    pageNumber?: number;
  }>;
  summary?: string;          // AI-generated summary of all matches
}

export interface MultiFileSummary {
  perFile: Array<{
    fileName: string;
    summary: string;
    keyPoints: string[];
    wordCount: number;
  }>;
  crossSummary: string;      // Overall summary across all files
  commonThemes: string[];    // Themes found across multiple files
}

export interface CompileResult {
  title: string;
  sections: Array<{
    sourceFile: string;
    title: string;
    content: string;
    order: number;
  }>;
  totalWordCount: number;
  tableOfContents: Array<{ title: string; page: number; source: string }>;
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface TopicMatchRaw {
  sectionTitle?: string;
  content: string;
  relevance: number;
  pageNumber?: number;
}

interface PerFileTopicResult {
  matches: TopicMatchRaw[];
}

interface PerFileSummaryRaw {
  summary: string;
  keyPoints: string[];
}

interface CrossSummaryRaw {
  crossSummary: string;
  commonThemes: string[];
}

interface CompileSectionRaw {
  title: string;
  content: string;
}

interface CompileResultRaw {
  sections: CompileSectionRaw[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
const EXTRACTION_TIMEOUT_MS = 60_000;
const SUMMARY_TIMEOUT_MS = 30_000;
const COMPILE_TIMEOUT_MS = 90_000;
const OUTLINE_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 60_000; // Truncate very long files for LLM

// ─── LLM Streaming Helper ───────────────────────────────────────────────────

async function callLLMStreamed(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash'
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
        const obj = chunk as any; // Type assertion needed for streaming chunk parsing
        const content: string = obj.choices?.[0]?.delta?.content || '';
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
    console.error('[MultiFileExtractor] Streaming error:', error);
  }

  return fullContent;
}

// ─── LLM Call with Timeout & Retry ─────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number = 60_000,
  model: string = 'glm-4-flash'
): Promise<string> {
  try {
    const result = await Promise.race([
      callLLMStreamed(systemPrompt, userMessage, model),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (result !== null) {
      return result;
    }

    // Timed out — retry once with simpler prompt
    console.warn(`[MultiFileExtractor] LLM call timed out after ${timeoutMs}ms, retrying with simpler prompt`);
    return retryWithSimplerPrompt(systemPrompt, userMessage, model);
  } catch (error) {
    console.error('[MultiFileExtractor] LLM call error:', error instanceof Error ? error.message : String(error));
    return retryWithSimplerPrompt(systemPrompt, userMessage, model);
  }
}

/**
 * Retry once with a simpler/shorter prompt when the original call fails.
 */
async function retryWithSimplerPrompt(
  systemPrompt: string,
  userMessage: string,
  model: string
): Promise<string> {
  try {
    // Use a truncated version of both system and user message
    const shortSystem = systemPrompt.length > 800
      ? systemPrompt.substring(0, 800) + '\n\nAnswer concisely.'
      : systemPrompt;
    const shortUser = userMessage.length > 6000
      ? userMessage.substring(0, 6000) + '\n\n[Content truncated]'
      : userMessage;

    const retryResult = await Promise.race([
      callLLMStreamed(shortSystem, shortUser, model),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
    ]);

    return retryResult ?? '';
  } catch (retryError) {
    console.error('[MultiFileExtractor] Retry also failed:', retryError instanceof Error ? retryError.message : String(retryError));
    return '';
  }
}

// ─── JSON Parser ────────────────────────────────────────────────────────────

function parseJSONResponse<T>(rawText: string, fallback: T): T {
  try {
    let jsonStr = rawText.trim();

    // Remove markdown code block wrappers if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON object in the text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

// ─── Content Truncation ─────────────────────────────────────────────────────

function truncateForLLM(content: string, maxLen: number = MAX_CONTENT_LENGTH): string {
  if (content.length <= maxLen) return content;
  return content.substring(0, maxLen) + '\n\n[... Content truncated for processing]';
}

// ─── Concurrency Limiter ────────────────────────────────────────────────────

async function parallelWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map((item, batchIdx) => fn(item, i + batchIdx))
    );
    results.push(...batchResults);
  }
  return results;
}

// ─── Word Count Utility ─────────────────────────────────────────────────────

function wordCount(text: string): number {
  // Handle Arabic and English text
  return text.split(/\s+/).filter(Boolean).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. extractTopicFromFiles
// ═══════════════════════════════════════════════════════════════════════════

const TOPIC_EXTRACTION_PROMPT_AR = `أنت باحث متخصص في استخراج المعلومات من المستندات. تم تحديد موضوع للبحث عنه:

الموضوع: {TOPIC}

من المحتوى المرفق، استخرج فقط الأقسام والفقرات المتعلقة بهذا الموضوع.

قواعد صارمة:
1. استخرج كل ما يخص الموضوع - لا تترك أي شيء ذي صلة
2. حدد عنوان القسم إن وُجد
3. قيّم مدى صلة كل قطعة بالموضوع (0 إلى 1)
4. أشر لرقم الصفحة إن أمكن
5. إذا لم تجد أي شيء متعلق، أعد مصفوفة فارغة

أجب بصيغة JSON فقط:
{
  "matches": [
    {
      "sectionTitle": "عنوان القسم إن وُجد",
      "content": "المحتوى المستخرج المتعلق بالموضوع",
      "relevance": 0.9,
      "pageNumber": 5
    }
  ]
}`;

const TOPIC_EXTRACTION_PROMPT_EN = `You are a researcher specialized in extracting information from documents. A topic has been identified for search:

Topic: {TOPIC}

From the attached content, extract only the sections and paragraphs related to this topic.

Strict rules:
1. Extract everything related to the topic — leave nothing relevant out
2. Identify the section heading if present
3. Rate the relevance of each piece to the topic (0 to 1)
4. Reference page number if possible
5. If nothing relevant is found, return an empty array

Answer in JSON format only:
{
  "matches": [
    {
      "sectionTitle": "Section heading if found",
      "content": "Extracted content related to the topic",
      "relevance": 0.9,
      "pageNumber": 5
    }
  ]
}`;

const TOPIC_SUMMARY_PROMPT_AR = `أنت كاتب محترف. لديك مجموعة من النتائج المستخرجة من عدة ملفات حول موضوع محدد. اكتب ملخصاً شاملاً يجمع كل المعلومات المستخرجة في فقرة واحدة متماسكة.

الموضوع: {TOPIC}

النتائج المستخرجة:
{MATCHES}

اكتب ملخصاً شاملاً باللغة العربية يجمع كل المعلومات المهمة من النتائج أعلاه.`;

const TOPIC_SUMMARY_PROMPT_EN = `You are a professional writer. You have a collection of results extracted from multiple files about a specific topic. Write a comprehensive summary that combines all extracted information into a single cohesive paragraph.

Topic: {TOPIC}

Extracted results:
{MATCHES}

Write a comprehensive summary in English that combines all important information from the results above.`;

export async function extractTopicFromFiles(
  files: ExtractedFile[],
  topic: string,
  language: 'ar' | 'en'
): Promise<TopicExtraction> {
  if (!files || files.length === 0) {
    throw new Error(
      language === 'en'
        ? 'No files provided for topic extraction'
        : 'لم يتم توفير ملفات لاستخراج الموضوع'
    );
  }

  const isAr = language === 'ar';
  const systemPromptTemplate = isAr ? TOPIC_EXTRACTION_PROMPT_AR : TOPIC_EXTRACTION_PROMPT_EN;
  const systemPrompt = systemPromptTemplate.replace('{TOPIC}', topic);

  // ── Parallel extraction from all files (up to 3 concurrent) ──
  const perFileResults = await parallelWithLimit(files, MAX_CONCURRENT, async (file) => {
    if (!file.content || file.content.trim().length === 0) {
      return { fileName: file.name, matches: [] as TopicMatchRaw[] };
    }

    const userMessage = isAr
      ? `اسم الملف: ${file.name}\nعدد الصفحات: ${file.pageCount || 'غير محدد'}\n\n--- محتوى الملف ---\n${truncateForLLM(file.content)}\n--- نهاية الملف ---`
      : `File name: ${file.name}\nPages: ${file.pageCount || 'unknown'}\n\n--- File Content ---\n${truncateForLLM(file.content)}\n--- End of File ---`;

    try {
      const rawResponse = await callLLM(systemPrompt, userMessage, EXTRACTION_TIMEOUT_MS);
      if (!rawResponse) {
        return { fileName: file.name, matches: [] as TopicMatchRaw[] };
      }

      const parsed = parseJSONResponse<PerFileTopicResult>(rawResponse, { matches: [] });

      // Validate and clamp relevance scores
      const matches = (parsed.matches || []).map((m) => ({
        sectionTitle: m.sectionTitle,
        content: m.content || '',
        relevance: Math.max(0, Math.min(1, typeof m.relevance === 'number' ? m.relevance : 0.5)),
        pageNumber: m.pageNumber,
      })).filter((m) => m.content.length > 0);

      return { fileName: file.name, matches };
    } catch (error) {
      console.error(`[MultiFileExtractor] Topic extraction failed for "${file.name}":`, error);
      return { fileName: file.name, matches: [] as TopicMatchRaw[] };
    }
  });

  // ── Assemble matches with file attribution ──
  const allMatches: TopicExtraction['matches'] = [];
  for (const result of perFileResults) {
    for (const match of result.matches) {
      allMatches.push({
        fileName: result.fileName,
        sectionTitle: match.sectionTitle,
        content: match.content,
        relevance: match.relevance,
        pageNumber: match.pageNumber,
      });
    }
  }

  // Sort by relevance descending
  allMatches.sort((a, b) => b.relevance - a.relevance);

  // ── Generate cross-file summary ──
  let summary: string | undefined;
  if (allMatches.length > 0) {
    try {
      const matchesText = allMatches
        .slice(0, 30) // Limit to top 30 matches to keep prompt manageable
        .map((m, i) => `${i + 1}. [${m.fileName}${m.sectionTitle ? ` / ${m.sectionTitle}` : ''}] (relevance: ${m.relevance.toFixed(2)}): ${m.content}`)
        .join('\n\n');

      const summarySystemPrompt = (isAr ? TOPIC_SUMMARY_PROMPT_AR : TOPIC_SUMMARY_PROMPT_EN)
        .replace('{TOPIC}', topic)
        .replace('{MATCHES}', matchesText);

      const summaryUserMessage = isAr
        ? 'اكتب الملخص الآن'
        : 'Write the summary now';

      const rawSummary = await callLLM(summarySystemPrompt, summaryUserMessage, SUMMARY_TIMEOUT_MS);
      if (rawSummary && rawSummary.trim().length > 0) {
        summary = rawSummary.trim();
      }
    } catch (error) {
      console.error('[MultiFileExtractor] Cross-file summary generation failed:', error);
      // Continue without summary
    }
  }

  return {
    topic,
    matches: allMatches,
    summary,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. summarizeFiles
// ═══════════════════════════════════════════════════════════════════════════

const PER_FILE_SUMMARY_PROMPT_AR: Record<string, string> = {
  brief: `أنت كاتب محترف. اكتب ملخصاً مختصراً (2-3 جمل فقط) للملف التالي. ركز على النقاط الأهم فقط.

أجب بصيغة JSON فقط:
{
  "summary": "الملخص المختصر",
  "keyPoints": ["النقطة 1", "النقطة 2", "النقطة 3"]
}`,

  medium: `أنت كاتب محترف. اكتب ملخصاً متوسط الطول (فقرة كاملة) للملف التالي. اذكر الأفكار الرئيسية والتفاصيل المهمة.

أجب بصيغة JSON فقط:
{
  "summary": "الملخص المتوسط",
  "keyPoints": ["النقطة 1", "النقطة 2", "النقطة 3", "النقطة 4", "النقطة 5"]
}`,

  detailed: `أنت كاتب محترف. اكتب ملخصاً تفصيلياً شاملاً للملف التالي. غطِّ كل الأفكار والتفاصيل المهمة بشكل موسع.

أجب بصيغة JSON فقط:
{
  "summary": "الملخص التفصيلي الشامل",
  "keyPoints": ["النقطة 1", "النقطة 2", "النقطة 3", "النقطة 4", "النقطة 5", "النقطة 6", "النقطة 7", "النقطة 8"]
}`,
};

const PER_FILE_SUMMARY_PROMPT_EN: Record<string, string> = {
  brief: `You are a professional writer. Write a brief summary (2-3 sentences only) of the following file. Focus on the most important points only.

Answer in JSON format only:
{
  "summary": "The brief summary",
  "keyPoints": ["Point 1", "Point 2", "Point 3"]
}`,

  medium: `You are a professional writer. Write a medium-length summary (a full paragraph) of the following file. Cover the main ideas and important details.

Answer in JSON format only:
{
  "summary": "The medium-length summary",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"]
}`,

  detailed: `You are a professional writer. Write a detailed comprehensive summary of the following file. Cover all important ideas and details thoroughly.

Answer in JSON format only:
{
  "summary": "The detailed comprehensive summary",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5", "Point 6", "Point 7", "Point 8"]
}`,
};

const CROSS_SUMMARY_PROMPT_AR = `أنت كاتب محترف. لديك ملخصات لعدة ملفات. مهمتك هي:

1. كتابة ملخص شامل يجمع المعلومات من جميع الملفات
2. تحديد المواضيع المشتركة التي تظهر في أكثر من ملف

الملخصات:
{PER_FILE_SUMMARIES}

أجب بصيغة JSON فقط:
{
  "crossSummary": "ملخص شامل يجمع كل المعلومات من جميع الملفات",
  "commonThemes": ["الموضوع المشترك 1", "الموضوع المشترك 2", "الموضوع المشترك 3"]
}`;

const CROSS_SUMMARY_PROMPT_EN = `You are a professional writer. You have summaries of multiple files. Your task is to:

1. Write a comprehensive summary combining information from all files
2. Identify common themes that appear in more than one file

Summaries:
{PER_FILE_SUMMARIES}

Answer in JSON format only:
{
  "crossSummary": "A comprehensive summary combining all information from all files",
  "commonThemes": ["Common theme 1", "Common theme 2", "Common theme 3"]
}`;

export async function summarizeFiles(
  files: ExtractedFile[],
  depth: 'brief' | 'medium' | 'detailed',
  language: 'ar' | 'en'
): Promise<MultiFileSummary> {
  if (!files || files.length === 0) {
    throw new Error(
      language === 'en'
        ? 'No files provided for summarization'
        : 'لم يتم توفير ملفات للتلخيص'
    );
  }

  const isAr = language === 'ar';
  const promptMap = isAr ? PER_FILE_SUMMARY_PROMPT_AR : PER_FILE_SUMMARY_PROMPT_EN;
  const systemPrompt = promptMap[depth] || promptMap.medium;

  // ── Per-file summarization (parallel, up to 3 concurrent) ──
  const perFileResults = await parallelWithLimit(files, MAX_CONCURRENT, async (file) => {
    const defaultResult: PerFileSummaryRaw = {
      summary: isAr ? 'لم يتم تلخيص هذا الملف.' : 'This file was not summarized.',
      keyPoints: [],
    };

    if (!file.content || file.content.trim().length === 0) {
      return {
        fileName: file.name,
        summary: isAr ? 'الملف فارغ أو لا يحتوي على محتوى قابل للقراءة.' : 'The file is empty or contains no readable content.',
        keyPoints: [],
        wordCount: 0,
      };
    }

    const userMessage = isAr
      ? `اسم الملف: ${file.name}\n\n--- محتوى الملف ---\n${truncateForLLM(file.content)}\n--- نهاية الملف ---`
      : `File name: ${file.name}\n\n--- File Content ---\n${truncateForLLM(file.content)}\n--- End of File ---`;

    try {
      const rawResponse = await callLLM(systemPrompt, userMessage, SUMMARY_TIMEOUT_MS);
      if (!rawResponse) {
        return {
          fileName: file.name,
          summary: defaultResult.summary,
          keyPoints: [],
          wordCount: wordCount(file.content),
        };
      }

      const parsed = parseJSONResponse<PerFileSummaryRaw>(rawResponse, defaultResult);

      return {
        fileName: file.name,
        summary: parsed.summary || defaultResult.summary,
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter(Boolean) : [],
        wordCount: wordCount(file.content),
      };
    } catch (error) {
      console.error(`[MultiFileExtractor] Summarization failed for "${file.name}":`, error);
      return {
        fileName: file.name,
        summary: defaultResult.summary,
        keyPoints: [],
        wordCount: wordCount(file.content),
      };
    }
  });

  // ── Cross-file summary ──
  let crossSummary = '';
  let commonThemes: string[] = [];

  const perFileSummaries = perFileResults
    .map((r, i) => `${i + 1}. [${r.fileName}]: ${r.summary}`)
    .join('\n\n');

  try {
    const crossPrompt = (isAr ? CROSS_SUMMARY_PROMPT_AR : CROSS_SUMMARY_PROMPT_EN)
      .replace('{PER_FILE_SUMMARIES}', perFileSummaries);

    const crossUserMessage = isAr ? 'اكتب الملخص الشامل والمواضيع المشتركة' : 'Write the cross-file summary and common themes';

    const rawCross = await callLLM(crossPrompt, crossUserMessage, SUMMARY_TIMEOUT_MS);
    if (rawCross) {
      const parsed = parseJSONResponse<CrossSummaryRaw>(rawCross, {
        crossSummary: '',
        commonThemes: [],
      });
      crossSummary = parsed.crossSummary || perFileSummaries;
      commonThemes = Array.isArray(parsed.commonThemes) ? parsed.commonThemes.filter(Boolean) : [];
    }
  } catch (error) {
    console.error('[MultiFileExtractor] Cross-file summary failed:', error);
    crossSummary = perFileSummaries;
  }

  return {
    perFile: perFileResults,
    crossSummary,
    commonThemes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. compileFiles
// ═══════════════════════════════════════════════════════════════════════════

const COMPILE_PROMPT_AR = `أنت كاتب أكاديمي محترف. مهمتك هي تجميع محتوى عدة ملفات في مستند واحد منظم.

قواعد التجميع:
1. نظم المحتوى في أقسام واضحة بعناوين واضحة
2. أضف عزو المصدر لكل قسم (اسم الملف الأصلي)
3. لا تحذف أي معلومات مهمة
4. رتب الأقسام بشكل منطقي

أجب بصيغة JSON فقط:
{
  "sections": [
    {
      "title": "عنوان القسم",
      "content": "محتوى القسم الكامل"
    }
  ]
}`;

const COMPILE_PROMPT_EN = `You are a professional academic writer. Your task is to compile content from multiple files into a single organized document.

Compilation rules:
1. Organize content into clear sections with descriptive titles
2. Add source attribution for each section (original file name)
3. Do not remove any important information
4. Arrange sections logically

Answer in JSON format only:
{
  "sections": [
    {
      "title": "Section title",
      "content": "Full section content"
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════
// 3b. compileFilesChunked — ZERO-LOSS multi-pass compilation
// ═══════════════════════════════════════════════════════════════════════════
// Instead of sending ALL files in a single LLM call (which causes massive
// information loss due to context window limits), this function:
//
//   Pass 1: Process each file INDIVIDUALLY to extract structured content
//   Pass 2: Merge all extractions into a single CompileResult
//
// This ensures ZERO information loss because each file gets the LLM's
// full attention. The merge step is deterministic (no LLM needed).
// ═══════════════════════════════════════════════════════════════════════════

const PER_FILE_COMPILE_PROMPT_AR = `أنت كاتب أكاديمي محترف. مهمتك هي تنظيم محتوى ملف واحد في أقسام منظمه.

قواعد صارمة:
1. استخرج كل المحتوى المهم من الملف — لا تحذف أي معلومة
2. نظم المحتوى في أقسام واضحة بعناوين واضحة
3. احتفظ بكل التفاصيل والأمثلة والمعادلات والتعريفات
4. إذا كان الملف يحتوي على قوانين أو قواعد، اذكرها كاملة بالنص
5. لا تختصر أو تلخص — احتفظ بالمحتوى الكامل

أجب بصيغة JSON فقط:
{
  "sections": [
    {
      "title": "عنوان القسم",
      "content": "محتوى القسم الكامل مع كل التفاصيل"
    }
  ]
}`;

const PER_FILE_COMPILE_PROMPT_EN = `You are a professional academic writer. Your task is to organize the content of a single file into structured sections.

Strict rules:
1. Extract ALL important content from the file — do NOT delete any information
2. Organize content into clear sections with descriptive titles
3. Keep all details, examples, equations, and definitions
4. If the file contains laws or rules, include them in full text
5. Do NOT summarize or abbreviate — keep the full content

Answer in JSON format only:
{
  "sections": [
    {
      "title": "Section title",
      "content": "Full section content with all details"
    }
  ]
}`;

// Topic-specific extraction prompts (e.g., "قوانين" / laws)
const PER_FILE_TOPIC_COMPILE_PROMPT_AR = `أنت كاتب أكاديمي محترف متخصص في استخراج القوانين والقواعد العلمية.

مطلوب منك: استخراج كل ما يتعلق بـ "{TOPIC}" من الملف التالي.

قواعد صارمة:
1. استخرج كل القوانين والقواعد والمعادلات والتعريفات المتعلقة بـ "{TOPIC}"
2. لا تحذف أي قانون أو قاعدة — اذكرها كاملة بالنص الأصلي
3. اذكر المعادلات والأمثلة التوضيحية كاملة
4. نظم المحتوى في أقسام واضحة
5. إذا كان هناك شرح أو توضيح للقانون، اذكره كاملاً

أجب بصيغة JSON فقط:
{
  "sections": [
    {
      "title": "عنوان القسم أو القانون",
      "content": "نص القانون أو القاعدة كاملاً مع الشرح"
    }
  ]
}`;

const PER_FILE_TOPIC_COMPILE_PROMPT_EN = `You are a professional academic writer specialized in extracting laws, rules, and scientific principles.

Your task: Extract everything related to "{TOPIC}" from the following file.

Strict rules:
1. Extract ALL laws, rules, equations, and definitions related to "{TOPIC}"
2. Do NOT delete any law or rule — include the full original text
3. Include all equations and illustrative examples in full
4. Organize content into clear sections
5. If there is an explanation or clarification for a law, include it in full

Answer in JSON format only:
{
  "sections": [
    {
      "title": "Section or law title",
      "content": "Full text of the law or rule with explanation"
    }
  ]
}`;

export async function compileFiles(
  files: ExtractedFile[],
  title: string,
  language: 'ar' | 'en'
): Promise<CompileResult> {
  if (!files || files.length === 0) {
    throw new Error(
      language === 'en'
        ? 'No files provided for compilation'
        : 'لم يتم توفير ملفات للتجميع'
    );
  }

  const isAr = language === 'en' ? false : language === 'ar';

  // Filter out empty files
  const filesWithContent = files.filter((f) => f.content && f.content.trim().length > 0);

  if (filesWithContent.length === 0) {
    throw new Error(
      language === 'en'
        ? 'All files are empty or contain no readable content'
        : 'جميع الملفات فارغة أو لا تحتوي على محتوى قابل للقراءة'
    );
  }

  const systemPrompt = isAr ? COMPILE_PROMPT_AR : COMPILE_PROMPT_EN;

  // Build user message with all file contents
  const filesContent = filesWithContent
    .map((f, i) => {
      const header = isAr
        ? `--- ملف ${i + 1}: ${f.name} (${f.type}, ${f.size} bytes${f.pageCount ? `, ${f.pageCount} صفحات` : ''}) ---`
        : `--- File ${i + 1}: ${f.name} (${f.type}, ${f.size} bytes${f.pageCount ? `, ${f.pageCount} pages` : ''}) ---`;
      return `${header}\n${truncateForLLM(f.content)}\n--- ${isAr ? 'نهاية الملف' : 'End of file'} ---`;
    })
    .join('\n\n');

  const userMessage = isAr
    ? `عنوان المستند المطلوب: "${title}"\n\nالملفات:\n${filesContent}`
    : `Desired document title: "${title}"\n\nFiles:\n${filesContent}`;

  const defaultCompileResult: CompileResult = {
    title,
    sections: filesWithContent.map((f, i) => ({
      sourceFile: f.name,
      title: f.name,
      content: truncateForLLM(f.content, 2000),
      order: i,
    })),
    totalWordCount: 0,
    tableOfContents: [],
  };

  try {
    const rawResponse = await callLLM(systemPrompt, userMessage, COMPILE_TIMEOUT_MS);

    if (!rawResponse) {
      console.warn('[MultiFileExtractor] Compile produced empty response, using fallback');
      return buildFallbackCompile(filesWithContent, title, language);
    }

    const parsed = parseJSONResponse<CompileResultRaw>(rawResponse, { sections: [] });

    if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      console.warn('[MultiFileExtractor] Compile produced no sections, using fallback');
      return buildFallbackCompile(filesWithContent, title, language);
    }

    // Map compiled sections to source files
    const sections: CompileResult['sections'] = parsed.sections.map((section, idx) => {
      // Try to match the section to a source file based on content overlap
      const sourceFile = findBestSourceFile(section.content, filesWithContent);

      return {
        sourceFile,
        title: section.title || `${isAr ? 'قسم' : 'Section'} ${idx + 1}`,
        content: section.content,
        order: idx,
      };
    });

    // Calculate total word count
    const totalWC = sections.reduce((sum, s) => sum + wordCount(s.content), 0);

    // Build table of contents
    const tableOfContents = sections.map((s, idx) => ({
      title: s.title,
      page: idx + 1,
      source: s.sourceFile,
    }));

    return {
      title,
      sections,
      totalWordCount: totalWC,
      tableOfContents,
    };
  } catch (error) {
    console.error('[MultiFileExtractor] Compilation failed:', error);
    return buildFallbackCompile(filesWithContent, title, language);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3c. compileFilesChunked — ZERO-LOSS multi-pass compilation
// ═══════════════════════════════════════════════════════════════════════════

const CHUNKED_COMPILE_PER_FILE_TIMEOUT_MS = 120_000; // 2 min per file
const CHUNKED_MAX_CONTENT_LENGTH = 150_000; // Much higher limit per file (was 60K)

/**
 * ZERO-LOSS multi-pass compilation.
 *
 * Pass 1: Process each file INDIVIDUALLY to extract structured content.
 *         Each file gets the LLM's full attention, so no information is lost.
 *         If a topic is provided (e.g., "قوانين"), uses topic-specific extraction.
 *
 * Pass 2: Merge all per-file extractions into a single CompileResult.
 *         This step is deterministic (no LLM needed) — just concatenation.
 *
 * @param files - Array of extracted files
 * @param title - Document title
 * @param language - 'ar' or 'en'
 * @param topic - Optional topic to extract (e.g., "قوانين", "laws")
 */
export async function compileFilesChunked(
  files: ExtractedFile[],
  title: string,
  language: 'ar' | 'en',
  topic?: string,
): Promise<CompileResult> {
  if (!files || files.length === 0) {
    throw new Error(
      language === 'en'
        ? 'No files provided for compilation'
        : 'لم يتم توفير ملفات للتجميع'
    );
  }

  const isAr = language === 'ar';

  // Filter out empty files
  const filesWithContent = files.filter((f) => f.content && f.content.trim().length > 0);

  if (filesWithContent.length === 0) {
    throw new Error(
      language === 'en'
        ? 'All files are empty or contain no readable content'
        : 'جميع الملفات فارغة أو لا تحتوي على محتوى قابل للقراءة'
    );
  }

  console.log(`[ChunkedCompile] Starting ZERO-LOSS compilation of ${filesWithContent.length} files${topic ? ` (topic: "${topic}")` : ''}`);

  // ── Pass 1: Per-file extraction ──
  // Each file gets its own LLM call with full attention.
  // If a topic is provided, use topic-specific extraction prompts.
  const perFileResults = await parallelWithLimit(filesWithContent, MAX_CONCURRENT, async (file) => {
    const fileDefaultResult: CompileResultRaw = {
      sections: [{
        title: file.name.replace(/\.[^.]+$/, ''),
        content: truncateForLLM(file.content, CHUNKED_MAX_CONTENT_LENGTH),
      }],
    };

    if (!file.content || file.content.trim().length === 0) {
      return { fileName: file.name, sections: [] as CompileSectionRaw[] };
    }

    // Choose prompt based on whether a topic is specified
    const systemPrompt = topic
      ? (isAr ? PER_FILE_TOPIC_COMPILE_PROMPT_AR : PER_FILE_TOPIC_COMPILE_PROMPT_EN)
          .replace(/\{TOPIC\}/g, topic)
      : (isAr ? PER_FILE_COMPILE_PROMPT_AR : PER_FILE_COMPILE_PROMPT_EN);

    const userMessage = isAr
      ? `اسم الملف: ${file.name}\n\n--- محتوى الملف ---\n${truncateForLLM(file.content, CHUNKED_MAX_CONTENT_LENGTH)}\n--- نهاية الملف ---`
      : `File name: ${file.name}\n\n--- File Content ---\n${truncateForLLM(file.content, CHUNKED_MAX_CONTENT_LENGTH)}\n--- End of File ---`;

    try {
      const rawResponse = await callLLM(systemPrompt, userMessage, CHUNKED_COMPILE_PER_FILE_TIMEOUT_MS);

      if (!rawResponse || rawResponse.trim().length < 20) {
        console.warn(`[ChunkedCompile] Empty LLM response for "${file.name}", using raw content`);
        return { fileName: file.name, sections: fileDefaultResult.sections };
      }

      const parsed = parseJSONResponse<CompileResultRaw>(rawResponse, fileDefaultResult);

      if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
        console.warn(`[ChunkedCompile] No sections parsed for "${file.name}", using raw content`);
        return { fileName: file.name, sections: fileDefaultResult.sections };
      }

      console.log(`[ChunkedCompile] Extracted ${parsed.sections.length} sections from "${file.name}" (${parsed.sections.reduce((sum, s) => sum + s.content.length, 0)} chars total)`);
      return { fileName: file.name, sections: parsed.sections };
    } catch (error) {
      console.error(`[ChunkedCompile] Per-file extraction failed for "${file.name}":`, error instanceof Error ? error.message : String(error));
      return { fileName: file.name, sections: fileDefaultResult.sections };
    }
  });

  // ── Pass 2: Merge all per-file results into a single CompileResult ──
  // This is deterministic — no LLM call needed.
  const allSections: CompileResult['sections'] = [];
  let globalOrder = 0;

  for (const result of perFileResults) {
    for (const section of result.sections) {
      allSections.push({
        sourceFile: result.fileName,
        title: section.title || `${isAr ? 'قسم من' : 'Section from'} ${result.fileName}`,
        content: section.content,
        order: globalOrder++,
      });
    }
  }

  // Calculate total word count
  const totalWC = allSections.reduce((sum, s) => sum + wordCount(s.content), 0);

  // Build table of contents
  const tableOfContents = allSections.map((s, idx) => ({
    title: s.title,
    page: idx + 1,
    source: s.sourceFile,
  }));

  console.log(`[ChunkedCompile] ZERO-LOSS compilation complete: ${allSections.length} sections, ${totalWC} words, ${allSections.reduce((sum, s) => sum + s.content.length, 0)} total chars`);

  return {
    title,
    sections: allSections,
    totalWordCount: totalWC,
    tableOfContents,
  };
}

/**
 * Find the best matching source file for a section based on content overlap.
 */
function findBestSourceFile(
  sectionContent: string,
  files: ExtractedFile[]
): string {
  let bestMatch = files[0]?.name || 'unknown';
  let bestOverlap = 0;

  // Use first 200 chars of section for matching
  const sampleContent = sectionContent.substring(0, 200).toLowerCase();

  for (const file of files) {
    const fileSample = file.content.substring(0, 2000).toLowerCase();
    // Simple word overlap heuristic
    const sectionWords = new Set(sampleContent.split(/\s+/).filter(Boolean));
    const fileWords = new Set(fileSample.split(/\s+/).filter(Boolean));

    let overlap = 0;
    for (const word of sectionWords) {
      if (fileWords.has(word)) overlap++;
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = file.name;
    }
  }

  return bestMatch;
}

/**
 * Fallback compilation when LLM fails — creates sections from raw file content.
 */
function buildFallbackCompile(
  files: ExtractedFile[],
  title: string,
  language: 'ar' | 'en'
): CompileResult {
  const isAr = language === 'ar';

  const sections = files.map((file, idx) => ({
    sourceFile: file.name,
    title: file.name.replace(/\.[^.]+$/, ''), // Remove extension
    content: file.content,
    order: idx,
  }));

  const totalWC = sections.reduce((sum, s) => sum + wordCount(s.content), 0);

  const tableOfContents = sections.map((s, idx) => ({
    title: s.title,
    page: idx + 1,
    source: s.sourceFile,
  }));

  return {
    title,
    sections,
    totalWordCount: totalWC,
    tableOfContents,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. extractOutline
// ═══════════════════════════════════════════════════════════════════════════

const OUTLINE_PROMPT_AR = `أنت منظم محتوى محترف. مهمتك هي إنشاء مخطط هرمي من محتوى عدة ملفات.

قواعد:
1. أنشئ مخططاً هرمياً يغطي كل المحتوى المهم
2. جمّع المحتوى المرتبط معاً تحت عناوين مشتركة
3. استخدم مستويات الترقيم (# للعناوين الرئيسية، ## للفرعية، ### للتفصيلية)
4. أضف اسم الملف المصدر بين أقواس معقوفة بعد كل عنوان فرعي
5. كن موجزاً في العناوين ولكن شاملاً في التغطية

أجب بصيغة Markdown فقط (بدون JSON):`;

const OUTLINE_PROMPT_EN = `You are a professional content organizer. Your task is to create a hierarchical outline from the content of multiple files.

Rules:
1. Create a hierarchical outline covering all important content
2. Group related content together under shared headings
3. Use heading levels (# for main, ## for sub, ### for detail)
4. Add the source file name in brackets after each sub-heading
5. Be concise in headings but comprehensive in coverage

Answer in Markdown format only (no JSON):`;

export async function extractOutline(
  files: ExtractedFile[],
  language: 'ar' | 'en'
): Promise<string> {
  if (!files || files.length === 0) {
    throw new Error(
      language === 'en'
        ? 'No files provided for outline extraction'
        : 'لم يتم توفير ملفات لاستخراج المخطط'
    );
  }

  const isAr = language === 'ar';

  // Filter out empty files
  const filesWithContent = files.filter((f) => f.content && f.content.trim().length > 0);

  if (filesWithContent.length === 0) {
    return isAr
      ? '# مخطط فارغ\n\nلا يوجد محتوى قابل للتحليل في الملفات المرفقة.'
      : '# Empty Outline\n\nNo readable content found in the attached files.';
  }

  const systemPrompt = isAr ? OUTLINE_PROMPT_AR : OUTLINE_PROMPT_EN;

  const filesContent = filesWithContent
    .map((f, i) => {
      const header = isAr
        ? `--- ملف ${i + 1}: ${f.name} ---`
        : `--- File ${i + 1}: ${f.name} ---`;
      return `${header}\n${truncateForLLM(f.content)}\n--- ${isAr ? 'نهاية الملف' : 'End of file'} ---`;
    })
    .join('\n\n');

  const userMessage = isAr
    ? `أنشئ مخططاً هرمياً من المحتوى التالي:\n\n${filesContent}`
    : `Create a hierarchical outline from the following content:\n\n${filesContent}`;

  try {
    const rawResponse = await callLLM(systemPrompt, userMessage, OUTLINE_TIMEOUT_MS);

    if (rawResponse && rawResponse.trim().length > 0) {
      return rawResponse.trim();
    }

    // Fallback: build a simple outline from file names and first lines
    console.warn('[MultiFileExtractor] Outline extraction produced empty result, using fallback');
    return buildFallbackOutline(filesWithContent, language);
  } catch (error) {
    console.error('[MultiFileExtractor] Outline extraction failed:', error);
    return buildFallbackOutline(filesWithContent, language);
  }
}

/**
 * Fallback outline generation when LLM fails — creates a simple file-based outline.
 */
function buildFallbackOutline(
  files: ExtractedFile[],
  language: 'ar' | 'en'
): string {
  const isAr = language === 'ar';

  let outline = isAr
    ? '# مخطط المحتوى\n\n'
    : '# Content Outline\n\n';

  for (const file of files) {
    const fileName = file.name.replace(/\.[^.]+$/, '');
    outline += `## ${fileName}\n\n`;

    // Extract first line of each paragraph as a sub-item
    const paragraphs = file.content.split(/\n\n+/).filter(Boolean);
    const subItems = paragraphs.slice(0, 10); // Limit to 10 items

    for (const para of subItems) {
      const firstLine = para.split('\n')[0]?.trim();
      if (firstLine && firstLine.length > 3 && firstLine.length < 200) {
        // Clean up common heading markers
        const cleaned = firstLine
          .replace(/^#+\s*/, '')
          .replace(/^\d+[\.\)]\s*/, '')
          .replace(/^[-*]\s*/, '')
          .trim();
        if (cleaned) {
          outline += `- ${cleaned}\n`;
        }
      }
    }
    outline += '\n';
  }

  return outline;
}
