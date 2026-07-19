// ═══════════════════════════════════════════════════════════════════
// DeltaAI Batch Processing Engine — Deep Academic Analysis
// Task ID: arch-3
// ═══════════════════════════════════════════════════════════════════

import { extractTextFromPdfBase64 } from '@/lib/pdf-text-extractor';
import { chatWithFallback, type HFChatMessage } from '@/lib/hf-chat.service';

// ─── ZAI SDK Singleton (fallback when HF chat is unavailable) ──────────
declare global {
  var _batchZaiClient: any;
}

async function getZAI() {
  if (!globalThis._batchZaiClient) {
    const { getZAIClient } = await import('./zai-client');
    globalThis._batchZaiClient = await getZAIClient();
  }
  return globalThis._batchZaiClient;
}

// ─── Types ───────────────────────────────────────────────────────────
export interface BatchFileInput {
  name: string;
  content: string; // text content for text files, base64 data URL for PDFs/images
  type: string; // 'text' | 'pdf' | 'image' | 'other'
}

export interface BatchFileResult {
  fileName: string;
  summary: string; // NOT a shallow summary — deep academic analysis
  keyConcepts: string[];
  diagrams: Array<{
    description: string;
    data: Record<string, unknown>;
    type: 'chart' | 'diagram' | 'table';
  }>;
  questions: string[]; // Generated study questions
  connections: string[]; // How this relates to other files in the batch
}

export interface BatchJob {
  id: string;
  files: BatchFileInput[];
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    stage: string;
  };
  results: BatchFileResult[];
  crossAnalysis: string; // Final cross-file analysis
  createdAt: number;
  error?: string;
}

export type BatchProgressCallback = (
  stage: string,
  detail: string,
  current: number,
  total: number,
  partialResult?: BatchFileResult
) => void;

// ─── Deep Analysis System Prompts ────────────────────────────────────

const ACADEMIC_DEEP_ANALYSIS_AR = `أنت باحث أكاديمي متقدم ومحلل محتوى خبير. مهمتك هي تحليل المحتوى المرفق بعمق أكاديمي شامل.

قواعد صارمة:
1. يُمنع التلخيص السطحي - يجب تقديم تحليل عميق ومفصل
2. كل مفهوم يجب شرحه بسياقه الأكاديمي الكامل
3. استخرج الرسومات والمخططات البيانية واشرحها تحليلياً
4. ربط المفاهيم ببعضها وبيّن العلاقات
5. اقترح أسئلة بحثية متقدمة
6. حدد النقاط الخلافية في المجال إن وُجدت

تنسيق الإجابة المطلوب (JSON فقط، بدون أي نص إضافي):
{
  "summary": "تحليل أكاديمي عميق ومفصل للمحتوى - لا يقل عن 300 كلمة",
  "keyConcepts": ["مفهوم1", "مفهوم2", "..."],
  "diagrams": [
    {
      "description": "وصف المخطط أو الرسم البياني",
      "data": {"type": "bar|line|pie|table", "title": "...", "labels": [...], "values": [...], "headers": [...], "rows": [[...]]},
      "type": "chart"
    }
  ],
  "questions": ["سؤال بحثي متقدم 1", "سؤال بحثي متقدم 2", "..."],
  "connections": ["كيف يرتبط هذا المحتوى بمواضيع أخرى"]
}

ملاحظات مهمة:
- إذا وجدت بيانات رقمية أو إحصائية، استخرجها واقترح مخططاً بيانياً مناسباً
- إذا وجدت جداول، أعد بناءها في حقل diagrams من نوع table
- الأسئلة يجب أن تكون أسئلة بحثية تحفيزية وليست أسئلة حفظ
- الـ summary يجب أن يكون تحليلاً نقدياً عميقاً وليس إعادة صياغة
- أجب باللغة العربية`;

const ACADEMIC_DEEP_ANALYSIS_EN = `You are an advanced academic researcher and expert content analyst. Your task is to deeply analyze the attached content with comprehensive academic rigor.

Strict rules:
1. Shallow summaries are FORBIDDEN — you must provide deep, detailed analysis
2. Every concept must be explained in its full academic context
3. Extract charts and diagrams and explain them analytically
4. Connect concepts to each other and explain relationships
5. Suggest advanced research questions
6. Identify controversies in the field if any exist

Required response format (JSON only, no additional text):
{
  "summary": "Deep, detailed academic analysis of the content - at least 300 words",
  "keyConcepts": ["concept1", "concept2", "..."],
  "diagrams": [
    {
      "description": "Description of the chart or diagram",
      "data": {"type": "bar|line|pie|table", "title": "...", "labels": [...], "values": [...], "headers": [...], "rows": [[...]]},
      "type": "chart"
    }
  ],
  "questions": ["Advanced research question 1", "Advanced research question 2", "..."],
  "connections": ["How this content relates to other topics"]
}

Important notes:
- If you find numerical or statistical data, extract it and suggest an appropriate chart
- If you find tables, reconstruct them in the diagrams field with type "table"
- Questions must be stimulating research questions, not memorization questions
- The summary must be a deep critical analysis, not a rephrasing`;

const CROSS_FILE_ANALYSIS_AR = `أنت باحث أكاديمي متقدم. تم تحليل مجموعة ملفات/محاضرات وتم استخراج المفاهيم الرئيسية من كل ملف.

مهمتك الآن هي:
1. إيجاد الروابط والصلات بين الملفات المختلفة
2. تحديد المفاهيم المشتركة والمتقاطعة
3. بناء خريطة معرفية شاملة تربط بين الموضوعات
4. اقتراح مسارات بحثية تربط بين المحاور المختلفة
5. تحديد الفجوات المعرفية بين الملفات

قدم تحليلاً شاملاً ومفصلاً باللغة العربية يربط بين جميع الملفات. يجب أن يكون التحليل عميقاً وأكاديمياً - وليس مجرد سرد للعناوين.`;

// ─── PDF Text Extraction ─────────────────────────────────────────────
// Now uses shared utility from @/lib/pdf-text-extractor
// The batch processor uses 80KB max length (vs default 50KB) for deeper analysis
const BATCH_PDF_MAX_LEN = 80 * 1024;

// ─── Text Extraction Dispatcher ──────────────────────────────────────
async function extractTextFromFile(file: BatchFileInput): Promise<string> {
  if (file.type === 'pdf') {
    if (file.content.startsWith('data:application/pdf;base64,')) {
      return extractTextFromPdfBase64(file.content, BATCH_PDF_MAX_LEN);
    }
    // If content is already extracted text
    return file.content;
  }

  if (file.type === 'text') {
    return file.content;
  }

  if (file.type === 'image') {
    return '[صورة مرفقة — لا يمكن استخراج نص مباشر]';
  }

  return file.content || '[محتوى غير مدعوم]';
}

// ─── Parse LLM JSON Response ─────────────────────────────────────────
function parseAnalysisResponse(rawText: string): BatchFileResult {
  try {
    // Try to extract JSON from the response
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

    const parsed = JSON.parse(jsonStr);

    return {
      fileName: '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : rawText,
      keyConcepts: Array.isArray(parsed.keyConcepts)
        ? parsed.keyConcepts.filter((c: unknown) => typeof c === 'string')
        : [],
      diagrams: Array.isArray(parsed.diagrams)
        ? parsed.diagrams
            .filter((d: any) => d && d.description)
            .map((d: any) => ({
              description: String(d.description || ''),
              data: d.data || {},
              type: ['chart', 'diagram', 'table'].includes(d.type) ? d.type : 'diagram',
            }))
        : [],
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.filter((q: unknown) => typeof q === 'string')
        : [],
      connections: Array.isArray(parsed.connections)
        ? parsed.connections.filter((c: unknown) => typeof c === 'string')
        : [],
    };
  } catch {
    // If parsing fails, create a basic result from the raw text
    return {
      fileName: '',
      summary: rawText,
      keyConcepts: [],
      diagrams: [],
      questions: [],
      connections: [],
    };
  }
}

// ─── LLM Call Helper ─────────────────────────────────────────────────
// Uses HF Chat Service with fallback chain for reliability on HuggingFace Spaces.
// Falls back to ZAI SDK if HF chat is unavailable.
async function callLLM(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash'
): Promise<string> {
  const messages: HFChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // ── Strategy 1: Use HF Chat Service with fallback chain ──
  try {
    const result = await chatWithFallback(
      messages,
      [
        'Qwen/Qwen2.5-72B-Instruct',
        'meta-llama/Llama-3.1-8B-Instruct',
        'Qwen/Qwen2.5-7B-Instruct',
        'mistralai/Mistral-Small-24B-Instruct-2501',
        'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      ],
      { temperature: 0.7, max_tokens: 4096 }
    );
    if (result.content) {
      console.log(`[BatchLLM] HF chat succeeded: model=${result.modelUsed}, fallback=${result.wasFallback}, ${result.content.length} chars`);
      return result.content;
    }
  } catch (hfError) {
    console.warn('[BatchLLM] HF chat failed, falling back to ZAI SDK:', hfError instanceof Error ? hfError.message : String(hfError));
  }

  // ── Strategy 2: Fallback to ZAI SDK ──
  try {
    const zai = await getZAIClient();
    const completion = await zai.chat.completions.create({
      model,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage },
      ],
      stream: false,
    });

    if (completion && typeof completion === 'object') {
      const choices = (completion as any).choices;
      if (choices && choices.length > 0) {
        const content = choices[0].message?.content || choices[0].text || '';
        if (content) return content;
      }
      if ((completion as any).content) return (completion as any).content;
    }
  } catch (zaiError) {
    console.error('[BatchLLM] ZAI SDK also failed:', zaiError instanceof Error ? zaiError.message : String(zaiError));
  }

  return '';
}

async function callLLMStreamed(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash'
): Promise<string> {
  // Use the non-streaming callLLM which has HF fallback chain
  // This is more reliable than streaming on HuggingFace Spaces
  return callLLM(systemPrompt, userMessage, model);
}

// ─── LLM Call with Timeout ──────────────────────────────────────────
/**
 * Wraps callLLMStreamed with a 60-second timeout.
 * If the call times out and the original model was NOT glm-4-flash,
 * retries with glm-4-flash for reliability.
 */
async function callLLMWithTimeout(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash',
  timeoutMs: number = 90_000 // FIX #3: Increased from 60s to 90s for large lectures
): Promise<string> {
  const fallbackModel = 'glm-4-flash';

  try {
    const result = await Promise.race([
      callLLMStreamed(systemPrompt, userMessage, model),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (result !== null && result.trim().length > 0) {
      return result;
    }

    // Timed out or got empty result
    console.warn(`[BatchProcessor] LLM call timed out or returned empty after ${timeoutMs}ms with model=${model}`);

    // FIX #3: If we got an empty result (not timeout), try non-streaming as fallback
    if (result !== null && result.trim().length === 0) {
      console.log(`[BatchProcessor] Got empty streaming result, trying non-streaming call...`);
      try {
        const nonStreamResult = await callLLM(systemPrompt, userMessage, model);
        if (nonStreamResult && nonStreamResult.trim().length > 0) {
          return nonStreamResult;
        }
      } catch (nsErr) {
        console.warn('[BatchProcessor] Non-streaming fallback also failed:', nsErr instanceof Error ? nsErr.message : String(nsErr));
      }
    }

    if (model !== fallbackModel) {
      console.log(`[BatchProcessor] Retrying with ${fallbackModel}...`);
      try {
        const retryResult = await callLLMStreamed(systemPrompt, userMessage, fallbackModel);
        return retryResult;
      } catch (retryError) {
        console.error('[BatchProcessor] Retry with fallback model also failed:', retryError instanceof Error ? retryError.message : String(retryError));
        return '';
      }
    }

    return '';
  } catch (error) {
    console.error('[BatchProcessor] LLM call error:', error instanceof Error ? error.message : String(error));

    // FIX #3: Try non-streaming call as first fallback before switching model
    try {
      console.log('[BatchProcessor] Trying non-streaming fallback...');
      const nsResult = await callLLM(systemPrompt, userMessage, model);
      if (nsResult && nsResult.trim().length > 0) return nsResult;
    } catch (nsErr) {
      console.warn('[BatchProcessor] Non-streaming fallback failed:', nsErr instanceof Error ? nsErr.message : String(nsErr));
    }

    // Try fallback model if original wasn't already the fallback
    if (model !== fallbackModel) {
      console.log(`[BatchProcessor] Retrying with ${fallbackModel} after error...`);
      try {
        const retryResult = await callLLMStreamed(systemPrompt, userMessage, fallbackModel);
        return retryResult;
      } catch (retryError) {
        console.error('[BatchProcessor] Retry with fallback model also failed:', retryError instanceof Error ? retryError.message : String(retryError));
      }
    }

    return '';
  }
}

// ─── Process Single File ─────────────────────────────────────────────
async function processSingleFile(
  file: BatchFileInput,
  language: string,
  sharedContext: string[],
  onProgress?: BatchProgressCallback
): Promise<BatchFileResult> {
  // Extract text content
  const textContent = await extractTextFromFile(file);

  if (!textContent || textContent.startsWith('[')) {
    // Could not extract text
    return {
      fileName: file.name,
      summary: `لم يتم استخراج محتوى من الملف "${file.name}". ${textContent}`,
      keyConcepts: [],
      diagrams: [],
      questions: [],
      connections: [],
    };
  }

  // Build context-aware prompt
  const contextNote = sharedContext.length > 0
    ? `\n\nسياق من الملفات السابقة في المجموعة:\n${sharedContext.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nاستخدم هذا السياق لإيجاد الروابط والصلات مع المحتوى الحالي.`
    : '';

  const systemPrompt = language === 'en' ? ACADEMIC_DEEP_ANALYSIS_EN : ACADEMIC_DEEP_ANALYSIS_AR;

  const userMessage = `اسم الملف: ${file.name}\nنوع الملف: ${file.type}\n\n--- محتوى الملف ---\n${textContent}\n--- نهاية الملف ---${contextNote}`;

  // Call LLM for deep analysis
  onProgress?.('analyzing', `تحليل عميق: ${file.name}`, 0, 0);

  const rawResponse = await callLLMWithTimeout(systemPrompt, userMessage, 'glm-4-flash');

  const result = parseAnalysisResponse(rawResponse);
  result.fileName = file.name;

  return result;
}

// ─── Cross-File Analysis ─────────────────────────────────────────────
async function performCrossFileAnalysis(
  results: BatchFileResult[],
  language: string,
  onProgress?: BatchProgressCallback
): Promise<string> {
  if (results.length < 2) {
    return results.length === 1
      ? 'تحليل ملف واحد — لا توجد ملفات أخرى للربط.'
      : '';
  }

  onProgress?.('cross-analyzing', 'تحليل شامل للروابط بين الملفات', 0, 0);

  const filesSummary = results.map((r, i) => {
    const concepts = r.keyConcepts.slice(0, 8).join('، ');
    return `ملف ${i + 1}: ${r.fileName}\nالمفاهيم الرئيسية: ${concepts}\nملخص: ${r.summary.slice(0, 500)}...`;
  }).join('\n\n---\n\n');

  const systemPrompt = CROSS_FILE_ANALYSIS_AR;

  const userMessage = `فيما يلي تحليلات ${results.length} ملفات/محاضرات:\n\n${filesSummary}\n\nقم بإجراء تحليل شامل للروابط بين هذه الملفات.`;

  const analysis = await callLLMWithTimeout(systemPrompt, userMessage, 'glm-4-flash');

  return analysis || 'لم يتم إنتاج تحليل شامل.';
}

// ─── In-Memory Batch Job Store ───────────────────────────────────────
const activeJobs = new Map<string, BatchJob>();

// ─── Main Batch Processor ────────────────────────────────────────────
export async function processBatch(
  files: BatchFileInput[],
  options: {
    model?: string;
    language?: string;
    maxConcurrent?: number;
    onProgress?: BatchProgressCallback;
  } = {}
): Promise<BatchJob> {
  const {
    language = 'ar',
    maxConcurrent = 4,
    onProgress,
  } = options;

  const jobId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const job: BatchJob = {
    id: jobId,
    files,
    status: 'processing',
    progress: { current: 0, total: files.length, stage: 'initializing' },
    results: [],
    crossAnalysis: '',
    createdAt: Date.now(),
  };

  activeJobs.set(jobId, job);

  try {
    // ── Phase 1: Extract text from all files ──
    onProgress?.('extracting', 'استخراج المحتوى من الملفات...', 0, files.length);

    const extractedTexts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      onProgress?.('extracting', `استخراج النص: ${files[i].name}`, i, files.length);
      const text = await extractTextFromFile(files[i]);
      extractedTexts.push(text);
    }

    // ── Phase 2: Process files in parallel with concurrency limit ──
    onProgress?.('analyzing', 'بدء التحليل الأكاديمي العميق...', 0, files.length);

    const sharedContext: string[] = [];
    const results: BatchFileResult[] = [];

    // FIX #3: Process in smaller batches of 2 (was maxConcurrent=4) to reduce memory/timeout pressure
    // This is especially important for large PDF files like histology lectures
    const effectiveConcurrency = Math.min(maxConcurrent, 2); // Cap at 2 for reliability

    // Process in batches of effectiveConcurrency
    for (let i = 0; i < files.length; i += effectiveConcurrency) {
      const batch = files.slice(i, i + effectiveConcurrency);
      const batchPromises = batch.map(async (file, batchIdx) => {
        const globalIdx = i + batchIdx;
        onProgress?.('analyzing', `تحليل: ${file.name} (${globalIdx + 1}/${files.length})`, globalIdx + 1, files.length);

        const result = await processSingleFile(
          file,
          language,
          sharedContext,
          onProgress
        );

        // Update progress with partial result
        onProgress?.('analyzing', `تم تحليل: ${file.name} (${globalIdx + 1}/${files.length})`, globalIdx + 1, files.length, result);

        return result;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // After each batch, add key concepts to shared context
      for (const result of batchResults) {
        if (result.keyConcepts.length > 0) {
          sharedContext.push(`[${result.fileName}]: ${result.keyConcepts.slice(0, 5).join('، ')}`);
        }
        // Memory management: Clear large text content from original file references
        // The results only keep the analysis, not the raw text
      }

      job.progress.current = Math.min(i + maxConcurrent, files.length);
      job.results = [...results];
    }

    // ── Phase 3: Cross-file analysis ──
    onProgress?.('cross-analyzing', 'تحليل الروابط بين الملفات...', files.length, files.length);

    const crossAnalysis = await performCrossFileAnalysis(results, language, onProgress);

    // ── Phase 4: Update connections in each result based on cross analysis ──
    for (const result of results) {
      if (result.connections.length === 0) {
        // If the per-file analysis didn't find connections, add from cross analysis
        const otherFiles = results
          .filter((r) => r.fileName !== result.fileName)
          .map((r) => r.fileName);
        if (otherFiles.length > 0) {
          result.connections.push(`يرتبط هذا المحتوى بالملفات: ${otherFiles.join('، ')}`);
        }
      }
    }

    // ── Finalize ──
    job.status = 'completed';
    job.progress = { current: files.length, total: files.length, stage: 'completed' };
    job.results = results;
    job.crossAnalysis = crossAnalysis;

    onProgress?.('completed', `تم التحليل الشامل لـ ${files.length} ملفات`, files.length, files.length);

  } catch (error) {
    console.error('[BatchProcessor] Batch processing error:', error);
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء المعالجة';
    job.progress.stage = 'failed';

    onProgress?.('failed', job.error, job.progress.current, job.progress.total);
  } finally {
    // Clean up from active jobs after 5 minutes
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, 5 * 60 * 1000);
  }

  return job;
}

// ─── Get Job Status ──────────────────────────────────────────────────
export function getBatchJob(jobId: string): BatchJob | undefined {
  return activeJobs.get(jobId);
}

// ─── Cancel Job ──────────────────────────────────────────────────────
export function cancelBatchJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (job && (job.status === 'queued' || job.status === 'processing')) {
    job.status = 'failed';
    job.error = 'تم إلغاء المعالجة';
    return true;
  }
  return false;
}
