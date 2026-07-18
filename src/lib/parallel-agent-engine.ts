/**
 * DeltaAI Parallel Agent Engine
 *
 * Processes multiple files in parallel using specialized AI agents.
 * Each file is assigned to an agent with a specific role based on file type,
 * and agents run concurrently with configurable concurrency limits.
 *
 * The engine then produces a coordinated cross-file analysis that synthesizes
 * insights from all individual agent results.
 */

import { getZAIClient } from '@/lib/chat-utils';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { extractTextFromPdfBase64, isPdfFile } from '@/lib/pdf-text-extractor';
import { generateOpenRouterChat } from '@/lib/openrouter';

// ─── Types ────────────────────────────────────────────────────────────

export interface AgentFileInput {
  /** File name */
  name: string;
  /** File MIME type */
  mimeType: string;
  /** File content as base64 data URL or raw text */
  content: string;
  /** Optional file size string for display */
  size?: string;
  /** Optional file type hint */
  type?: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'data';
}

export interface ParallelAgentProgress {
  /** Current processing stage */
  stage: 'initializing' | 'preprocessing' | 'analyzing' | 'coordinating' | 'completed' | 'failed';
  /** Human-readable detail about current progress */
  detail: string;
  /** Number of agents currently active */
  agentsActive: number;
  /** Number of agents that have completed */
  agentsCompleted: number;
  /** Total number of agents */
  agentsTotal: number;
  /** Optional: individual agent result when an agent completes */
  agentResult?: AgentResult;
  /** Optional: agent name for progress tracking */
  agentName?: string;
  /** Optional: percentage complete (0-100) */
  percentComplete?: number;
}

export type ParallelAgentProgressCallback = (progress: ParallelAgentProgress) => void;

export interface AgentResult {
  /** Agent name/role */
  agentName: string;
  /** The file this agent analyzed */
  fileName: string;
  /** The agent's analysis of the file */
  analysis: string;
  /** Whether the agent succeeded */
  success: boolean;
  /** Error message if the agent failed */
  error?: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** The specialized role of the agent */
  role: string;
}

export interface ParallelAgentResult {
  /** Individual agent results */
  results: AgentResult[];
  /** Coordinated cross-file analysis */
  coordinatedAnalysis: string;
  /** Total processing time in ms */
  totalProcessingTimeMs: number;
  /** Number of agents used */
  agentsUsed: number;
  /** Model used */
  model: string;
}

export interface ParallelAgentOptions {
  /** Model to use for analysis */
  model?: string;
  /** Language for responses */
  language?: string;
  /** Maximum number of concurrent agents (1-3) */
  maxConcurrent?: number;
  /** Optional user prompt providing context */
  userPrompt?: string;
  /** Progress callback for SSE streaming */
  onProgress?: ParallelAgentProgressCallback;
}

// ─── Agent Role Definitions ───────────────────────────────────────────

interface AgentRole {
  id: string;
  nameAr: string;
  nameEn: string;
  systemPrompt: (language: string) => string;
  /** File types this agent specializes in */
  specialties: string[];
}

const AGENT_ROLES: AgentRole[] = [
  {
    id: 'code-analyst',
    nameAr: 'محلل الكود',
    nameEn: 'Code Analyst',
    specialties: ['code', 'text'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في تحليل الكود البرمجي والملفات النصية. حلل المحتوى بدقة وقدم تقريراً شاملاً يتضمن: البنية المنطقية، النقاط الرئيسية، المشاكل المحتملة، والاقتراحات للتحسين.'
        : 'You are an intelligent agent specialized in analyzing code and text files. Analyze the content precisely and provide a comprehensive report including: logical structure, key points, potential issues, and improvement suggestions.',
  },
  {
    id: 'document-analyst',
    nameAr: 'محلل المستندات',
    nameEn: 'Document Analyst',
    specialties: ['pdf', 'text'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في تحليل المستندات والملفات النصية. استخرج المعلومات الرئيسية، لخص المحتوى، حدد النقاط المهمة، وقدم تحليلاً شاملاً للنص.'
        : 'You are an intelligent agent specialized in analyzing documents and text files. Extract key information, summarize content, identify important points, and provide a comprehensive analysis.',
  },
  {
    id: 'visual-analyst',
    nameAr: 'محلل الوسائط',
    nameEn: 'Visual & Media Analyst',
    specialties: ['image', 'video'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في تحليل الصور والفيديوهات. صف المحتوى البصري بالتفصيل، حدد العناصر الرئيسية، حلل الألوان والتكوين، وقدم تفسيراً شاملاً لما تراه.'
        : 'You are an intelligent agent specialized in analyzing images and videos. Describe visual content in detail, identify key elements, analyze colors and composition, and provide a comprehensive interpretation.',
  },
  {
    id: 'audio-analyst',
    nameAr: 'محلل الصوتيات',
    nameEn: 'Audio Analyst',
    specialties: ['audio'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في تحليل المحتوى الصوتي. حلل النص المفرغ، حدد المواضيع الرئيسية، لخص المحتوى، وقدم رؤى مهمة عما قيل.'
        : 'You are an intelligent agent specialized in analyzing audio content. Analyze the transcript, identify main topics, summarize content, and provide important insights from what was said.',
  },
  {
    id: 'data-analyst',
    nameAr: 'محلل البيانات',
    nameEn: 'Data Analyst',
    specialties: ['data', 'text'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في تحليل البيانات. حلل البيانات المقدمة، استخرج الأنماط والاتجاهات، قدم إحصائيات ملخصة، وقدم رؤى قابلة للتنفيذ.'
        : 'You are an intelligent agent specialized in data analysis. Analyze the provided data, extract patterns and trends, provide summary statistics, and offer actionable insights.',
  },
  {
    id: 'general-analyst',
    nameAr: 'المحلل العام',
    nameEn: 'General Analyst',
    specialties: ['text', 'pdf', 'code', 'data'],
    systemPrompt: (lang) =>
      lang === 'ar'
        ? 'أنت وكيل ذكي متخصص في التحليل العام. حلل المحتوى المقدم بشكل شامل ومفصل، وقدم تقريراً يتضمن النقاط الرئيسية والاستنتاجات والتوصيات.'
        : 'You are an intelligent agent specialized in general analysis. Analyze the provided content comprehensively and in detail, providing a report with key points, conclusions, and recommendations.',
  },
];

// ─── Helper: Determine File Type ──────────────────────────────────────

function detectFileType(file: AgentFileInput): string {
  if (file.type) return file.type;

  const mime = file.mimeType.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Image types
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  // Video types
  if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'].includes(ext)) {
    return 'video';
  }
  // Audio types
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'].includes(ext)) {
    return 'audio';
  }
  // PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  // Code files
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'sh', 'bash', 'sql', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'xml', 'toml'];
  if (codeExts.includes(ext)) {
    return 'code';
  }
  // Data files
  const dataExts = ['csv', 'tsv', 'xlsx', 'xls'];
  if (dataExts.includes(ext) || mime.includes('spreadsheet') || mime.includes('csv')) {
    return 'data';
  }

  return 'text';
}

// ─── Helper: Select Best Agent Role ───────────────────────────────────

function selectAgentRole(fileType: string): AgentRole {
  // Find the best matching role based on file type
  const sortedRoles = [...AGENT_ROLES].sort((a, b) => {
    const aScore = a.specialties.includes(fileType) ? 1 : 0;
    const bScore = b.specialties.includes(fileType) ? 1 : 0;
    return bScore - aScore;
  });

  // Pick the best matching role (with some randomization to avoid all agents having the same role)
  const matchingRoles = sortedRoles.filter((r) => r.specialties.includes(fileType));
  if (matchingRoles.length > 0) {
    return matchingRoles[Math.floor(Math.random() * Math.min(2, matchingRoles.length))];
  }

  // Fallback to general analyst
  return AGENT_ROLES[AGENT_ROLES.length - 1]; // general-analyst
}

// ─── Helper: Extract Text Content from File ───────────────────────────

async function extractFileContent(file: AgentFileInput): Promise<string> {
  const content = file.content;

  // If it's a base64 data URL, extract the text portion or handle by type
  if (content.startsWith('data:')) {
    const mimeMatch = content.match(/^data:([^;]+);base64,/);
    if (mimeMatch) {
      const mimeType = mimeMatch[1];

      // ── PDF: extract text using shared utility ──
      if (isPdfFile(mimeType, file.name)) {
        try {
          const pdfText = await extractTextFromPdfBase64(content);
          if (pdfText && !pdfText.startsWith('[')) {
            traceAPI(`[ParallelAgent] PDF text extracted from ${file.name}: ${pdfText.length} chars`);
            return pdfText;
          }
          // PDF extraction returned an error message (starts with '[')
          // Do NOT send the raw error message to the AI — it confuses the model
          // Instead, return a clear indicator so the agent can work with available context
          traceAPI(`[ParallelAgent] PDF extraction limited for ${file.name}: returning context-only marker`);
          return `[ملف PDF: ${file.name} — تعذر استخراج النص آلياً. حلل الملف بناءً على اسمه ونوعه وأي سياق متاح.]`;
        } catch (pdfError) {
          traceError(`[ParallelAgent] PDF extraction failed for ${file.name}: ${pdfError instanceof Error ? pdfError.message : 'خطأ'}`);
          return `[ملف PDF: ${file.name} — فشل استخراج النص. حلل الملف بناءً على اسمه ونوعه وأي سياق متاح.]`;
        }
      }

      // For text-based formats, try to decode
      if (
        mimeType.startsWith('text/') ||
        mimeType.includes('json') ||
        mimeType.includes('xml') ||
        mimeType.includes('javascript') ||
        mimeType.includes('yaml')
      ) {
        try {
          const base64Part = content.split(',')[1];
          if (base64Part) {
            return Buffer.from(base64Part, 'base64').toString('utf-8');
          }
        } catch {
          // Fall through
        }
      }

      // For other binary formats, note the file type
      return `[ملف ثنائي: ${file.name} (${mimeType}, ${file.size || 'حجم غير معروف'})]`;
    }
  }

  // If it looks like raw text content, return it directly
  if (content.length > 0 && !content.startsWith('data:')) {
    return content;
  }

  return `[ملف: ${file.name} (${file.mimeType})]`;
}

// ─── Helper: Build Analysis Prompt for a Single Agent ─────────────────

async function buildAgentPrompt(file: AgentFileInput, fileType: string, userPrompt: string, language: string): Promise<string> {
  const langPrefix = language === 'ar' ? 'أجب بالعربية.' : 'Answer in English.';
  let fileContent: string;

  try {
    fileContent = await extractFileContent(file);
  } catch (error) {
    traceError(`[ParallelAgent] Content extraction failed for ${file.name}: ${error instanceof Error ? error.message : 'خطأ'}`);
    fileContent = `[تعذر استخراج محتوى الملف: ${file.name}]`;
  }

  let prompt = '';

  if (userPrompt) {
    prompt += `المستخدم يطلب: "${userPrompt}"\n\n`;
  }

  prompt += `تحليل الملف: ${file.name}\n`;
  prompt += `نوع الملف: ${fileType}\n`;
  if (file.size) {
    prompt += `حجم الملف: ${file.size}\n`;
  }
  prompt += `\n--- محتوى الملف ---\n${fileContent.slice(0, 15000)}\n--- نهاية المحتوى ---\n\n`;
  prompt += `${langPrefix} قم بتحليل هذا الملف بشكل شامل ومفصل.`;

  return prompt;
}

// ─── Process Single File with Agent ───────────────────────────────────

async function processFileWithAgent(
  file: AgentFileInput,
  role: AgentRole,
  model: string,
  language: string,
  userPrompt: string
): Promise<AgentResult> {
  const startTime = Date.now();
  const fileType = detectFileType(file);
  const agentName = `${role.nameAr} (${role.nameEn})`;

  try {
    traceAPI(`[ParallelAgent] ${agentName}: تحليل ${file.name}...`);

    const prompt = await buildAgentPrompt(file, fileType, userPrompt, language);
    const systemPrompt = role.systemPrompt(language) + '\n\n⚠️ قاعدة صارمة: استخدم Markdown فقط لتنسيق ردك. ممنوع تماماً استخدام HTML أو CSS أو <style> أو <div> أو أي وسوم HTML. ردك سيُعرض في فقاعة محادثة وليس مستند PDF.';

    let analysis = '';

    // Try OpenRouter first with the primary model (GPT OSS 120B — better quality for PDF analysis)
    try {
      const completion = await generateOpenRouterChat({
        model: 'openai/gpt-oss-120b:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      });
      analysis = completion.choices?.[0]?.message?.content || '';
    } catch (openRouterError) {
      const errMsg = openRouterError instanceof Error ? openRouterError.message : 'خطأ';
      const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('rate');

      if (isRateLimit) {
        // Rate limited — wait 3s and retry once before falling back
        traceError(`[ParallelAgent] OpenRouter rate limited for ${file.name}, retrying in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const retryCompletion = await generateOpenRouterChat({
            model: 'openai/gpt-oss-120b:free',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 2048,
          });
          analysis = retryCompletion.choices?.[0]?.message?.content || '';
        } catch (retryError) {
          traceError(`[ParallelAgent] OpenRouter retry also failed for ${file.name}, falling back to ZAI: ${retryError instanceof Error ? retryError.message : 'خطأ'}`);
        }
      } else {
        traceError(`[ParallelAgent] OpenRouter failed for ${file.name}, falling back to ZAI: ${errMsg}`);
      }

      // If OpenRouter didn't produce analysis, fall back to ZAI client
      if (!analysis) {
        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        });
        analysis = completion.choices?.[0]?.message?.content || '';
      }
    }

    if (!analysis) {
      analysis = 'لم يتم الحصول على نتيجة التحليل.';
    }

    traceAPI(`[ParallelAgent] ${agentName}: أكمل تحليل ${file.name} (${Date.now() - startTime}ms)`);

    return {
      agentName,
      fileName: file.name,
      analysis,
      success: true,
      processingTimeMs: Date.now() - startTime,
      role: role.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
    traceError(`[ParallelAgent] ${agentName}: فشل تحليل ${file.name} - ${errorMsg}`);

    return {
      agentName,
      fileName: file.name,
      analysis: '',
      success: false,
      error: errorMsg,
      processingTimeMs: Date.now() - startTime,
      role: role.id,
    };
  }
}

// ─── Coordinate Analysis from All Agents ──────────────────────────────

async function coordinateAnalysis(
  results: AgentResult[],
  files: AgentFileInput[],
  model: string,
  language: string,
  userPrompt: string
): Promise<string> {
  const langPrefix = language === 'ar' ? 'أجب بالعربية.' : 'Answer in English.';

  const successfulResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  let coordinationPrompt = '';

  if (userPrompt) {
    coordinationPrompt += `طلب المستخدم: "${userPrompt}"\n\n`;
  }

  coordinationPrompt += `تم تحليل ${files.length} ملفات بواسطة ${results.length} وكلاء متخصصين.\n\n`;

  coordinationPrompt += '--- نتائج الوكلاء ---\n\n';
  for (const result of successfulResults) {
    coordinationPrompt += `## ${result.agentName} — ${result.fileName}\n`;
    coordinationPrompt += `${result.analysis.slice(0, 2000)}\n\n`;
  }

  if (failedResults.length > 0) {
    coordinationPrompt += '--- وكلاء فشلوا ---\n';
    for (const result of failedResults) {
      coordinationPrompt += `- ${result.agentName} (${result.fileName}): ${result.error}\n`;
    }
    coordinationPrompt += '\n';
  }

  coordinationPrompt += `---\n${langPrefix} بناءً على نتائج جميع الوكلاء، قدم تحليلاً منسقاً وشاملاً يجمع بين جميع الرؤى والاستنتاجات. حدد الأنماط المشتركة والروابط بين الملفات المختلفة. قدم توصيات عملية ومفيدة.`;

  const systemPrompt = language === 'ar'
    ? 'أنت منسق تحليل ذكي. تجمع بين نتائج عدة وكلاء متخصصين وتقدم تحليلاً شاملاً ومنسقاً يجمع أفضل الرؤى من كل وكيل. تُبرز الأنماط المشتركة والروابط وتقدم استنتاجات وتوصيات عملية. ⚠️ استخدم Markdown فقط. ممنوع استخدام HTML أو CSS.'
    : 'You are an intelligent analysis coordinator. You combine results from multiple specialized agents and provide a comprehensive, coordinated analysis that brings together the best insights from each agent. You highlight common patterns, connections, and provide practical conclusions and recommendations. IMPORTANT: Use Markdown only. No HTML or CSS allowed.';

  try {
    // Try OpenRouter first for coordination (using the primary model)
    const completion = await generateOpenRouterChat({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: coordinationPrompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });
    return completion.choices?.[0]?.message?.content || 'لم يتم إنشاء التحليل المنسق.';
  } catch (openRouterError) {
    const errMsg = openRouterError instanceof Error ? openRouterError.message : 'خطأ';
    const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('rate');

    if (isRateLimit) {
      // Rate limited — wait 3s and retry once
      traceError(`[ParallelAgent] OpenRouter rate limited for coordination, retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const retryCompletion = await generateOpenRouterChat({
          model: 'openai/gpt-oss-120b:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: coordinationPrompt },
          ],
          temperature: 0.3,
          max_tokens: 3000,
        });
        return retryCompletion.choices?.[0]?.message?.content || 'لم يتم إنشاء التحليل المنسق.';
      } catch (retryError) {
        traceError(`[ParallelAgent] OpenRouter retry also failed for coordination: ${retryError instanceof Error ? retryError.message : 'خطأ'}`);
      }
    } else {
      traceError(`[ParallelAgent] OpenRouter coordination failed, falling back to ZAI: ${errMsg}`);
    }

    try {
      const zai = await getZAIClient();
      const completion = await zai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: coordinationPrompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });
      return completion.choices?.[0]?.message?.content || 'لم يتم إنشاء التحليل المنسق.';
    } catch (zaiError) {
      traceError(`[ParallelAgent] ZAI coordination also failed: ${zaiError instanceof Error ? zaiError.message : 'خطأ'}`);

      // Fallback: concatenate successful results
      return successfulResults
        .map((r) => `### ${r.agentName} — ${r.fileName}\n${r.analysis}`)
        .join('\n\n---\n\n');
    }
  }
}

// ─── Main: Process Files with Parallel Agents ─────────────────────────

export async function processFilesWithParallelAgents(
  files: AgentFileInput[],
  options: ParallelAgentOptions
): Promise<ParallelAgentResult> {
  const {
    model = 'glm-4-flash', // Fallback model — OpenRouter is used preferentially now
    language = 'ar',
    maxConcurrent = 3,
    userPrompt = '',
    onProgress,
  } = options;

  const startTime = Date.now();
  const resolvedMaxConcurrent = Math.min(Math.max(maxConcurrent, 1), 3);

  // ── Stage 1: Initialize ──
  onProgress?.({
    stage: 'initializing',
    detail: language === 'ar'
      ? `جاري تجهيز ${files.length} وكلاء متخصصين...`
      : `Preparing ${files.length} specialized agents...`,
    agentsActive: 0,
    agentsCompleted: 0,
    agentsTotal: files.length,
    percentComplete: 0,
  });

  // Assign roles to each file
  const assignments = files.map((file) => {
    const fileType = detectFileType(file);
    const role = selectAgentRole(fileType);
    return { file, fileType, role };
  });

  // ── Stage 2: Preprocessing ──
  onProgress?.({
    stage: 'preprocessing',
    detail: language === 'ar'
      ? 'جاري تحليل أنواع الملفات وتوزيع الأدوار على الوكلاء...'
      : 'Analyzing file types and assigning roles to agents...',
    agentsActive: 0,
    agentsCompleted: 0,
    agentsTotal: files.length,
    percentComplete: 5,
  });

  // ── Stage 3: Analyze in Parallel with Concurrency Control ──
  const results: AgentResult[] = [];
  let agentsCompleted = 0;

  // Process in batches to respect maxConcurrent
  for (let i = 0; i < assignments.length; i += resolvedMaxConcurrent) {
    const batch = assignments.slice(i, i + resolvedMaxConcurrent);

    onProgress?.({
      stage: 'analyzing',
      detail: language === 'ar'
        ? `جاري تحليل الدفعة ${Math.floor(i / resolvedMaxConcurrent) + 1} من ${Math.ceil(assignments.length / resolvedMaxConcurrent)}...`
        : `Analyzing batch ${Math.floor(i / resolvedMaxConcurrent) + 1} of ${Math.ceil(assignments.length / resolvedMaxConcurrent)}...`,
      agentsActive: batch.length,
      agentsCompleted,
      agentsTotal: files.length,
      percentComplete: Math.round((agentsCompleted / files.length) * 80) + 10,
    });

    // Run batch in parallel with 30s timeout per agent
    const AGENT_TIMEOUT_MS = 30_000;
    const batchPromises = batch.map(({ file, fileType, role }) => {
      const agentPromise = processFileWithAgent(file, role, model, language, userPrompt);
      const timeoutPromise = new Promise<AgentResult>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`Agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`)), AGENT_TIMEOUT_MS)
      );
      return Promise.race([agentPromise, timeoutPromise]);
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const settledResult of batchResults) {
      if (settledResult.status === 'fulfilled') {
        results.push(settledResult.value);
        agentsCompleted++;

        // Report individual agent completion
        onProgress?.({
          stage: 'analyzing',
          detail: language === 'ar'
            ? `أكمل ${settledResult.value.agentName} تحليل ${settledResult.value.fileName}`
            : `${settledResult.value.agentName} completed analysis of ${settledResult.value.fileName}`,
          agentsActive: batch.length - (agentsCompleted - (results.length - batchResults.length)),
          agentsCompleted,
          agentsTotal: files.length,
          percentComplete: Math.round((agentsCompleted / files.length) * 80) + 10,
          agentResult: settledResult.value,
          agentName: settledResult.value.agentName,
        });
      } else {
        // Agent failed completely
        const failedFile = batch[batchResults.indexOf(settledResult)]?.file;
        const failedResult: AgentResult = {
          agentName: 'وكيل فاشل',
          fileName: failedFile?.name || 'غير معروف',
          analysis: '',
          success: false,
          error: settledResult.reason?.message || 'فشل غير معروف',
          processingTimeMs: 0,
          role: 'unknown',
        };
        results.push(failedResult);
        agentsCompleted++;
      }
    }
  }

  // ── Stage 4: Coordinate Analysis ──
  onProgress?.({
    stage: 'coordinating',
    detail: language === 'ar'
      ? 'جاري تنسيق نتائج جميع الوكلاء وإنشاء التحليل الشامل...'
      : 'Coordinating results from all agents and creating comprehensive analysis...',
    agentsActive: 0,
    agentsCompleted: results.length,
    agentsTotal: files.length,
    percentComplete: 90,
  });

  const coordinatedAnalysis = await coordinateAnalysis(
    results,
    files,
    model,
    language,
    userPrompt
  );

  // ── Done ──
  const totalProcessingTimeMs = Date.now() - startTime;

  onProgress?.({
    stage: 'completed',
    detail: language === 'ar'
      ? `تم التحليل الشامل لـ ${files.length} ملفات بـ ${results.length} وكلاء بالتوازي`
      : `Comprehensive analysis of ${files.length} files with ${results.length} parallel agents completed`,
    agentsActive: 0,
    agentsCompleted: results.length,
    agentsTotal: files.length,
    percentComplete: 100,
  });

  return {
    results,
    coordinatedAnalysis,
    totalProcessingTimeMs,
    agentsUsed: results.length,
    model,
  };
}
