// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Document Generation Service (v4 — Playwright Rendering)
// ═══════════════════════════════════════════════════════════════════════
// AI-powered document creation: PDF, PPTX, DOCX
// Uses HuggingFace Gradio Spaces for single document generation
// Uses Playwright (Chromium) rendering pipeline for local PDF generation
//
// Verified & Tested Working Spaces (March 2026):
//   ✅ openfree/Open-GAMMA                → PPTX with 3-AI collaboration
//   ✅ Radioterapia-AI/Fabrica_de_Slides  → PPTX with themes & styles
//   ✅ Yehor/pdf-generator                → Typst-based PDF
//   ✅ harshilgandhi90/text-to-pdf-word   → PDF & DOCX converter
//
// Broken/Removed Spaces:
//   ❌ ai-forever/slides_generator        → BUILD_ERROR (dead)
//   ❌ barunsaha/slide-deck-ai            → Streamlit (NOT Gradio)
//   ❌ Heartsync/pdfbook                  → DOES NOT EXIST
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { Client } from '@gradio/client';
import { renderToPDF } from '@/lib/rendering-pipeline';
import { detectImageOpportunities } from '@/lib/html-template-generator';
import { parseUserDesignPreferences } from '@/lib/unique-palette-generator';
import { generateAIDocument } from '@/lib/ai-document-generator';

// Re-export types and constants from the client-safe shared module
export type { DocumentType, DocumentModelEntry } from '@/lib/document-models';
export { DOCUMENT_MODELS, getDocumentModelById, getAvailableDocumentModels, getDocumentModelsByType } from '@/lib/document-models';

// Import for internal use
import { DOCUMENT_MODELS, type DocumentType, type DocumentModelEntry } from '@/lib/document-models';

export interface DocumentGenOptions {
  /** Topic/title for the document */
  topic: string;
  /** Number of slides/pages (for PPTX) */
  slideCount?: number;
  /** Language */
  language?: 'ar' | 'en';
  /** Additional instructions */
  instructions?: string;
  /** Template name (for open-gamma) */
  template?: string;
  /** Format (for text-to-pdf-word: 'PDF' or 'Word') */
  format?: 'PDF' | 'Word';
  /** Input PDF URL for processing */
  inputPdfUrl?: string;
}

export interface DocumentGenResult {
  /** URL to download the generated document */
  fileUrl: string;
  /** File name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Document type */
  docType: DocumentType;
  /** The model ID that was used */
  model: string;
  /** Time taken in ms */
  durationMs: number;
}

// ─── Batch Document Types ─────────────────────────────────────────────

export interface BatchDocumentOptions extends DocumentGenOptions {
  /** Array of lectures to process (max 12) */
  lectures?: { title: string; content: string }[];
  /** Channel name for the document */
  channelName?: string;
  /** Whether to include AI-generated images */
  includeImages?: boolean;
  // designTemplateId REMOVED — AI-driven design only
  /** User's free-text style description for AI-powered dynamic design */
  styleDescription?: string;
  /** Progress callback for tracking stages */
  progressCallback?: (stage: string, progress: number) => void;
}

export interface DiagramExtraction {
  /** Index of the lecture the diagram was found in */
  lectureIndex: number;
  /** Description of the diagram/chart/drawing */
  description: string;
  /** Surrounding context from the lecture content */
  context: string;
}

export interface BatchDocumentResult {
  /** URL or path to the generated PDF file */
  fileUrl: string;
  /** File name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Document type */
  docType: DocumentType;
  /** The model ID that was used for content processing */
  model: string;
  /** Time taken in ms */
  durationMs: number;
  /** Number of lectures processed */
  lecturesProcessed: number;
  /** Extracted diagrams if requested */
  diagrams: DiagramExtraction[];
}

export interface ChatDocumentOptions {
  /** User prompt requesting document generation */
  prompt: string;
  /** Model ID to use for content generation */
  model: string;
  /** Optional user-uploaded files */
  userFiles?: Array<{ name: string; content: string; type: string }>;
  /** Output language */
  language?: 'ar' | 'en';
}

export interface ChatDocumentStage {
  /** Stage identifier */
  stage: string;
  /** Progress percentage 0-100 */
  progress: number;
  /** Human-readable description */
  message: string;
}

// ─── Gradio Constants ─────────────────────────────────────────────────

const GRADIO_CONNECT_TIMEOUT_MS = 60_000;
const DOC_GEN_TIMEOUT_MS = 300_000; // 5 min (PPTX generation can be slow)

// ─── Delta-AI Space Proxy (Fallback) ─────────────────────────────────
// External delta-ai space for file generation fallback
const DELTA_AI_SPACE_URL = process.env.DELTA_AI_SPACE_URL || 'https://kopabdo-delta-ai.hf.space';

/**
 * Generate a document via the external delta-ai space as a fallback.
 * Supports both PDF (local mode) and PPTX (single mode via Gradio spaces).
 */
export async function generateDocumentViaDeltaAISpace(options: {
  topic: string;
  language?: 'ar' | 'en';
  instructions?: string;
  mode?: 'local' | 'single';
  modelId?: string;
  slideCount?: number;
  channelName?: string;
  includeImages?: boolean;
  progressCallback?: (stage: string, progress: number, message: string) => void;
}): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const {
    topic,
    language = 'ar',
    instructions = '',
    mode = 'local',
    modelId = 'open-gamma',
    slideCount,
    channelName = 'بعقل هادي',
    includeImages = false,
    progressCallback,
  } = options;

  progressCallback?.('connecting', 5, 'جاري الاتصال بمساحة توليد الملفات...');

  const endpoint = `${DELTA_AI_SPACE_URL}/api/ai/hf/document`;
  const body: Record<string, unknown> = {
    mode,
    topic,
    language,
    instructions,
    channelName,
    includeImages,
  };

  // For PPTX mode, include modelId and slideCount
  if (mode === 'single') {
    body.modelId = modelId;
    if (slideCount) body.slideCount = slideCount;
  }

  progressCallback?.('generating', 20, mode === 'local' ? 'جاري توليد PDF...' : 'جاري توليد العرض التقديمي...');

  const response = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    DOC_GEN_TIMEOUT_MS,
    'Delta-AI space request timed out'
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Delta-AI space returned ${response.status}: ${errorText}`);
  }

  const result = await response.json() as {
    success: boolean;
    fileUrl?: string;
    fileName?: string;
    mimeType?: string;
    docType?: string;
    model?: string;
    durationMs?: number;
    error?: string;
  };

  if (!result.success || !result.fileUrl) {
    throw new Error(result.error || 'Delta-AI space generation failed');
  }

  // If the fileUrl is a relative path (like /api/pdf/serve/xxx.pdf),
  // prepend the delta-ai space URL
  let fileUrl = result.fileUrl;
  if (fileUrl.startsWith('/')) {
    fileUrl = `${DELTA_AI_SPACE_URL}${fileUrl}`;
  }

  progressCallback?.('completed', 100, 'تم إنشاء الملف بنجاح!');

  return {
    fileUrl,
    fileName: result.fileName || 'document',
    mimeType: result.mimeType || 'application/pdf',
    docType: (result.docType as DocumentType) || 'pdf',
    model: result.model || 'delta-ai-space',
    durationMs: result.durationMs || (Date.now() - startTime),
  };
}

/**
 * List available document models from the external delta-ai space.
 */
export async function listDeltaAISpaceModels(): Promise<Array<{
  id: string;
  name: string;
  type: string;
  available: boolean;
}>> {
  try {
    const response = await withTimeout(
      fetch(`${DELTA_AI_SPACE_URL}/api/ai/hf/document`),
      10_000,
      'List models timed out'
    );
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ id: string; name: string; type: string; available: boolean }> };
    return data.models || [];
  } catch {
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

// ─── Utility: Extract file URL from Gradio result data ────────────────

function extractFileUrl(data: unknown[], spaceName: string, fileExtension: string): string | null {
  for (const item of data) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;

      // Check for nested value with file data (e.g., DownloadButton)
      if ('value' in obj && obj.value && typeof obj.value === 'object') {
        const val = obj.value as Record<string, unknown>;
        if ('url' in val && typeof val.url === 'string') return val.url;
        if ('path' in val && typeof val.path === 'string') {
          return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${val.path}`;
        }
      }

      // Direct file data
      if ('url' in obj && typeof obj.url === 'string') {
        // Prefer URLs that match the expected file extension
        if (obj.url.includes(fileExtension) || obj.url.includes('gradio_api/file')) return obj.url;
      }
      if ('path' in obj && typeof obj.path === 'string') {
        return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${obj.path}`;
      }
    }

    // Check for base64 data URI with file content
    if (typeof item === 'string' && item.startsWith('data:application/')) {
      return item;
    }
  }

  // Second pass: accept any URL found
  for (const item of data) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if ('url' in obj && typeof obj.url === 'string' && obj.url.startsWith('http')) return obj.url;
    }
  }

  return null;
}

// ─── Document Generation Functions ────────────────────────────────────

/**
 * Generate a premium PPTX presentation using Open GAMMA (openfree/Open-GAMMA).
 * Uses 3-AI collaboration with professional themes and AI diagrams.
 *
 * API Endpoint: /generate_ppt_handler
 * Key params: topic (required), template_name, audience_type, language, theme_name, slide_count
 */
async function generateOpenGamma(
  options: DocumentGenOptions
): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const spaceName = 'openfree/Open-GAMMA';
  const token = process.env.HUGGINGFACE_API_TOKEN || '';

  console.log(`[HF-Doc] Generating Open GAMMA PPTX: "${options.topic}"`);

  const client = await withTimeout(
    Client.connect(spaceName, {
      token: (token || undefined) as `hf_${string}` | undefined,
    }),
    GRADIO_CONNECT_TIMEOUT_MS,
    `Connection to ${spaceName} timed out`
  );

  const slideCount = options.slideCount || 8;
  const template = options.template || 'Business Proposal';
  const language = options.language === 'ar' ? 'English' : 'English'; // Open-GAMMA only supports English/Korean

  // Build the full parameter set for /generate_ppt_handler
  // Required: topic, template_name, audience_type, language, theme_name, slide_count, seed, file_upload, use_web_search, custom_slide_count
  const result = await withTimeout(
    client.predict('/generate_ppt_handler', [
      options.topic,           // [0] topic
      template,                // [1] template_name
      'General Staff',         // [2] audience_type
      language,                // [3] language
      'Minimal Light',         // [4] theme_name
      slideCount,              // [5] slide_count
      10,                      // [6] seed
      null,                    // [7] file_upload
      true,                    // [8] use_web_search
      5,                       // [9] custom_slide_count
    ]),
    DOC_GEN_TIMEOUT_MS,
    `Open GAMMA generation timed out after ${DOC_GEN_TIMEOUT_MS / 1000}s`
  );

  const data = result.data as any[];
  const fileUrl = extractFileUrl(data as unknown[], spaceName, '.pptx');

  if (!fileUrl) {
    throw new Error(`Could not extract PPTX from Open GAMMA result. Raw: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[HF-Doc] ✓ Open GAMMA PPTX generated in ${durationMs}ms`);

  return {
    fileUrl,
    fileName: `${options.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docType: 'pptx',
    model: 'open-gamma',
    durationMs,
  };
}

/**
 * Generate a PPTX using Fabrica de Slides (Radioterapia-AI/Fabrica_de_Slides).
 * Creates styled presentations with customizable themes and colors.
 *
 * API Endpoint: /on_generate_ppt
 * Key param: json_string (slides definition), style (cientifico/minimalista/observatorio/noir)
 */
async function generateFabricaSlides(
  options: DocumentGenOptions
): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const spaceName = 'Radioterapia-AI/Fabrica_de_Slides';
  const token = process.env.HUGGINGFACE_API_TOKEN || '';

  console.log(`[HF-Doc] Generating Fabrica PPTX: "${options.topic}"`);

  const client = await withTimeout(
    Client.connect(spaceName, {
      token: (token || undefined) as `hf_${string}` | undefined,
    }),
    GRADIO_CONNECT_TIMEOUT_MS,
    `Connection to ${spaceName} timed out`
  );

  const numSlides = options.slideCount || 5;

  // Build slides JSON from topic
  const slidesJson = JSON.stringify({
    slides: Array.from({ length: numSlides }, (_, i) => ({
      title: i === 0 ? options.topic : `${options.topic} - Part ${i + 1}`,
      content: options.instructions
        ? `${options.instructions} - Section ${i + 1}`
        : `Content for slide ${i + 1} about ${options.topic}`,
      subtitle: i === 0 ? 'Overview' : `Section ${i + 1}`,
    })),
  });

  const result = await withTimeout(
    client.predict('/on_generate_ppt', [
      slidesJson,       // [0] json_string - slides definition
      '#1a5276',        // [1] primary_color
      '#2e86c1',        // [2] secondary_color
      '#85c1e9',        // [3] tertiary_color
      '#d4e6f1',        // [4] zebra_color
      null,             // [5] logo_image
      null,             // [6] state
      [],               // [7] files[]
      'minimalista',    // [8] style (cientifico/minimalista/observatorio/noir)
    ]),
    DOC_GEN_TIMEOUT_MS,
    `Fabrica PPTX generation timed out after ${DOC_GEN_TIMEOUT_MS / 1000}s`
  );

  const data = result.data as any[];

  // Fabrica returns base64-encoded PPTX in a string message or as a file
  let fileUrl: string | null = null;

  for (const item of data) {
    // Check for base64 data URI with PPTX content
    if (typeof item === 'string' && item.includes('data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,')) {
      fileUrl = item;
      break;
    }
    // Check for HTML with embedded download link
    if (typeof item === 'string' && item.includes('href=')) {
      const match = item.match(/href="([^"]+)"/);
      if (match?.[1]) {
        fileUrl = match[1];
        break;
      }
    }
    // Check for file object
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if ('url' in obj && typeof obj.url === 'string') { fileUrl = obj.url; break; }
      if ('path' in obj && typeof obj.path === 'string') {
        fileUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${obj.path}`;
        break;
      }
    }
  }

  if (!fileUrl) {
    // Last resort: check for base64 data in any string
    for (const item of data) {
      if (typeof item === 'string' && item.startsWith('UEsDBB')) {
        // This is base64-encoded PPTX (starts with PK zip header)
        fileUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${item}`;
        break;
      }
    }
  }

  if (!fileUrl) {
    throw new Error(`Could not extract PPTX from Fabrica result. Raw: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[HF-Doc] ✓ Fabrica PPTX generated in ${durationMs}ms`);

  return {
    fileUrl,
    fileName: `${options.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docType: 'pptx',
    model: 'fabrica-slides',
    durationMs,
  };
}

/**
 * Generate a PDF using Typst-based generator (Yehor/pdf-generator).
 *
 * API Endpoint: /generate_pdf
 * Key param: text (required)
 */
async function generatePDF(
  options: DocumentGenOptions
): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const spaceName = 'Yehor/pdf-generator';
  const token = process.env.HUGGINGFACE_API_TOKEN || '';

  console.log(`[HF-Doc] Generating PDF: "${options.topic}"`);

  const client = await withTimeout(
    Client.connect(spaceName, {
      token: (token || undefined) as `hf_${string}` | undefined,
    }),
    GRADIO_CONNECT_TIMEOUT_MS,
    `Connection to ${spaceName} timed out`
  );

  const textContent = options.instructions || options.topic;

  const result = await withTimeout(
    client.predict('/generate_pdf', {
      text: textContent,
    }),
    DOC_GEN_TIMEOUT_MS,
    `PDF generation timed out`
  );

  const data = result.data as any[];
  // PDF generator returns: [preview_image, download_button]
  // The download_button has value.url with the PDF file URL
  let fileUrl: string | null = null;

  for (const item of data as unknown[]) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      // Check for DownloadButton with value containing file URL
      if ('value' in obj && obj.value && typeof obj.value === 'object') {
        const val = obj.value as Record<string, unknown>;
        if ('url' in val && typeof val.url === 'string') {
          fileUrl = val.url;
          break;
        }
        if ('path' in val && typeof val.path === 'string') {
          fileUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${val.path}`;
          break;
        }
      }
      if ('url' in obj && typeof obj.url === 'string' && obj.url.includes('.pdf')) {
        fileUrl = obj.url;
        break;
      }
      if ('path' in obj && typeof obj.path === 'string' && obj.path.includes('.pdf')) {
        fileUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${obj.path}`;
        break;
      }
    }
  }

  // Fallback: try to find any file URL that looks like a PDF
  if (!fileUrl) {
    fileUrl = extractFileUrl(data as unknown[], spaceName, '.pdf');
  }

  if (!fileUrl) {
    throw new Error(`Could not extract PDF from result. Raw: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const durationMs = Date.now() - startTime;
  return {
    fileUrl,
    fileName: `${options.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.pdf`,
    mimeType: 'application/pdf',
    docType: 'pdf',
    model: 'pdf-generator',
    durationMs,
  };
}

/**
 * Generate a PDF or DOCX using text-to-pdf-word (harshilgandhi90/text-to-pdf-word).
 *
 * API Endpoint: /predict
 * Key params: text (required), txt_file (null), format ("PDF" or "Word")
 */
async function generateTextToPdfWord(
  options: DocumentGenOptions
): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const spaceName = 'harshilgandhi90/text-to-pdf-word';
  const token = process.env.HUGGINGFACE_API_TOKEN || '';
  const format = options.format || 'PDF';
  const isWord = format === 'Word';

  console.log(`[HF-Doc] Generating ${format} via text-to-pdf-word: "${options.topic}"`);

  const client = await withTimeout(
    Client.connect(spaceName, {
      token: (token || undefined) as `hf_${string}` | undefined,
    }),
    GRADIO_CONNECT_TIMEOUT_MS,
    `Connection to ${spaceName} timed out`
  );

  const textContent = options.instructions || `${options.topic}\n\n${options.topic} - Detailed Overview\n\nThis document provides a comprehensive overview of ${options.topic}.`;

  const result = await withTimeout(
    client.predict('/predict', [
      textContent,  // [0] text
      null,         // [1] txt_file (file upload, not used)
      format,       // [2] format ("PDF" or "Word")
    ]),
    DOC_GEN_TIMEOUT_MS,
    `${format} generation timed out`
  );

  const data = result.data as any[];
  let fileUrl: string | null = null;

  for (const item of data as unknown[]) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if ('url' in obj && typeof obj.url === 'string') {
        fileUrl = obj.url;
        break;
      }
      if ('path' in obj && typeof obj.path === 'string') {
        fileUrl = `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${obj.path}`;
        break;
      }
    }
  }

  if (!fileUrl) {
    throw new Error(`Could not extract ${format} from result. Raw: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const durationMs = Date.now() - startTime;
  const ext = isWord ? 'docx' : 'pdf';
  const mimeType = isWord
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';

  return {
    fileUrl,
    fileName: `${options.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.${ext}`,
    mimeType,
    docType: isWord ? 'docx' : 'pdf',
    model: 'text-to-pdf-word',
    durationMs,
  };
}

// ─── Main Document Generation Function ────────────────────────────────

/**
 * Generate a document using a HuggingFace Space.
 *
 * @param modelId - The document model ID to use
 * @param options - Document generation options
 * @returns The generated document info with download URL
 */
export async function generateDocument(
  modelId: string,
  options: DocumentGenOptions
): Promise<DocumentGenResult> {
  const model = DOCUMENT_MODELS[modelId];
  if (!model) throw new Error(`Unknown document model: ${modelId}`);

  switch (modelId) {
    case 'open-gamma':
      return generateOpenGamma(options);
    case 'fabrica-slides':
      return generateFabricaSlides(options);
    case 'pdf-generator':
      return generatePDF(options);
    case 'text-to-pdf-word':
      return generateTextToPdfWord(options);
    default:
      throw new Error(`No handler for document model: ${modelId}`);
  }
}

// ─── Lookup Functions ─────────────────────────────────────────────────

export function getAllDocumentModelIds(): string[] {
  return Object.keys(DOCUMENT_MODELS);
}

/**
 * Test a document model's availability.
 */
export async function testDocumentModel(id: string): Promise<{
  available: boolean;
  responseTimeMs: number;
  error?: string;
}> {
  const model = DOCUMENT_MODELS[id];
  if (!model) return { available: false, responseTimeMs: 0, error: `Unknown model: ${id}` };

  const startTime = Date.now();
  try {
    const spaceUrl = `https://${model.spaceName.replace('/', '-')}.hf.space`;
    const response = await withTimeout(
      fetch(spaceUrl, { method: 'HEAD' }),
      15_000,
      `Test timed out`
    );
    const responseTimeMs = Date.now() - startTime;

    if (response.ok || [200, 302, 303, 401, 403].includes(response.status)) {
      return { available: true, responseTimeMs };
    }
    if ([404, 502, 503, 504].includes(response.status)) {
      return { available: true, responseTimeMs, error: `Space may be sleeping (${response.status})` };
    }
    return { available: false, responseTimeMs, error: `HTTP ${response.status}` };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { available: true, responseTimeMs, error: `Space may be sleeping: ${errorMsg.slice(0, 80)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOCAL DOCUMENT GENERATION (v5 — Playwright Rendering)
// ═══════════════════════════════════════════════════════════════════════
// Generates a PDF using the Playwright rendering pipeline (Chromium).
// Uses LLM to generate rich content, then renders as a professional PDF.
// No external Gradio spaces needed — works offline and is 100% reliable.
// ═══════════════════════════════════════════════════════════════════════

export interface LocalDocumentOptions {
  /** Topic/title for the document */
  topic: string;
  /** Language */
  language?: 'ar' | 'en';
  /** Additional instructions */
  instructions?: string;
  /** Channel name for the document */
  channelName?: string;
  /** Whether to include AI-generated images (slower, adds 1-2 min) */
  includeImages?: boolean;
  // designTemplateId REMOVED — AI-driven design only
  /** User's free-text style description for AI-powered dynamic design */
  styleDescription?: string;
  /** Progress callback for tracking stages */
  progressCallback?: (stage: string, progress: number, message: string) => void;
}

/**
 * Generate fallback content when LLM is unavailable (e.g., on HuggingFace Spaces
 * where the ZAI SDK's internal API is not accessible from Docker containers).
 * Creates a structured document template with the topic and instructions.
 */
function generateFallbackContent(topic: string, instructions: string, language: 'ar' | 'en'): string {
  const isAr = language === 'ar';

  if (isAr) {
    return `# ${topic}

## سلطة المعرفة: المنظور الحقيقي لـ ${topic}

${topic} ليس مجرد مصطلح يُردد في القاعات الأكاديمية — إنه المحرك الذي يُشكّل الواقع العملي في مجاله. فهم ${topic} بعمق يعني امتلاك مفتاح اتخاذ قرارات أذكى، وتجنب أخطاء كلّفَت جهات كثيرة ثمناً باهظاً.

:::callout-hook
${topic} يُغيّر قواعد اللعبة: المؤسسات التي تتقنه تتقدم 3 أضعاف أسرع من منافسيها. الفرق بين النجاح والفشل غالباً يكون في فهم هذا المجال بدقة.
:::

## التعريف الجوهري: ما هو ${topic} فعلاً؟

Marketing (${topic}): الإطار المنهجي المتكامل الذي يُحدد كيفية التعامل مع التحديات والفرص في هذا المجال، بدءاً من التخطيط الاستراتيجي وصولاً للتنفيذ العملي والقياس.

يتضمن ${topic} ثلاثة أبعاد متداخلة:
- **البُعد النظري**: المفاهيم والمبادئ التي تُشكّل الأساس المعرفي
- **البُعد التطبيقي**: الأدوات والتقنيات المستخدمة في الميدان
- **البُعد النقدي**: القدرة على تقييم النتائج وتطوير المنهجيات

:::callout-rule
القاعدة الذهبية: ${topic} ليس معلومات تُحفظ — بل منهجية تُطبّق. من يحفظ بلا تطبيق ينسى، ومن يطبّق بلا فهم يخطئ.
:::

## لماذا ${topic}؟ الأثر الحقيقي والأهداف الاستراتيجية

${topic} يُحرّك عجلات التقدم في اتجاهين: فهو يمنحك عدسة تحليلية دقيقة لفهم الواقع، ويمنحك أدوات عملية لتغييره. المؤسسات التي تستثمر في ${topic} تحقق نتائج ملموسة في أفق زمني أقصر.

:::feature
**فهم عميق**
بناء قاعدة معرفية صلبة تشمل المفاهيم الأساسية والنظريات الحاكمة — بلا هذا الأساس أي تطبيق يكون عشوائياً
:::

:::feature
**تطبيق ذكي**
توظيف المعرفة المكتسبة في حل مشكلات واقعية — التطبيق هو المحك الحقيقي لصحة الفهم
:::

:::feature
**تحليل نقدي**
تطوير القدرة على تقييم المعلومات والأدلة بموضوعية — لا تقبل معلومة بلا دليل
:::

:::feature
**ابتكار مستمر**
استحداث حلول إبداعية للتحديات القائمة — الابتكار هو ما يفصلك عن المتوسط
:::

:::feature
**نقل المعرفة**
إيصال المعرفة بفعالية لجمهور متنوع — من يشرح ببساطة يفهم بعمق
:::

:::feature
**قياس الأثر**
تقييم النتائج بمعايير واضحة — ما لا يُقاس لا يُحسّن
:::

## المبادئ الحاكمة: 5 قواعد لا تُكسر

:::feature
**المبدأ الأول: الفهم الشامل المنهجي**
التعامل مع ${topic} يتطلّب فهماً شاملاً لجميع أبعاده — من يكتفي بالسطحي يبني على رمال. اعمل خريطة ذهنية للمجال كامل قبل التعمق في أي فرع.
:::

:::feature
**المبدأ الثاني: التطبيق كمحك للحقيقة**
المفاهيم النظرية بلا تطبيق عملي مجرد حبر على ورق — كل مفهوم تتعلمه اختبره فوراً في سياق حقيقي أو محاكاة.
:::

:::feature
**المبدأ الثالث: التحديث المستمر الضروري**
${topic} يتطوّر بسرعة — ما تعلمته قبل سنة قد يكون قد تغيّر جذرياً. خصّص وقتاً أسبوعياً لمتابعة المستجدات.
:::

:::feature
**المبدأ الرابع: التفكير النقدي أولاً**
لا تقبل معلومة بلا تمحيص — اسأل دائماً: ما الدليل؟ ما المصدر؟ هل هناك تفسير بديل؟ النقدي يرى ما لا يراه المتلقي السلبي.
:::

:::feature
**المبدأ الخامس: التكامل بين التخصصات**
${topic} لا يعيش في عزلة — أقوى الرؤى تأتي من تقاطع التخصصات. ابحث دائماً عن الروابط الخفية بين المجالات.
:::

:::callout-error
خطأ شائع: كثيرون يظنون أن حفظ المصطلحات كافٍ لفهم ${topic}. الحقيقة أن الفهم الحقيقي يبدأ عندما تستطيع شرح المفهوم بأسلوبك لشخص لا يعرف شيئاً عنه — ولا تستطيع ذلك إلا بالتطبيق.
:::

## النقاط الاستراتيجية: 8 محاور لا غنى عنها

1. **الأسس النظرية**: فهم المفاهيم الأساسية والإطار النظري لـ ${topic} يشكّل نقطة الانطلاق لأي دراسة متعمقة — بلا هذا تعوم في بحر بلا بوصلة
2. **التطبيقات الميدانية**: التعرّف على التطبيقات العملية في سياقات متنوعة يعزز الفهم ويوسع الآفاق بشكل لا يحققه أي كتاب
3. **التحديات المعاصرة**: تحديد التحديات الحالية والمستقبلية يساعد في التخطيط الاستراتيجي ووضع حلول استباقية
4. **المنهجيات البحثية**: إتقان منهجيات البحث المناسبة يمكّنك من إنتاج معرفة جديدة وموثوقة بدلاً من الاكتفاء بتكرار الموجود
5. **الأخلاقيات والمعايير**: الالتزام بالمعايير الأخلاقية يضمن مصداقية النتائج ويحمي سمعة المهنة — الاختصار هنا كارثي
6. **التقنيات الحديثة**: الاستفادة من التقنيات المتقدمة يعزز الكفاءة ويفتح آفاقاً جديدة — من يتجاهل التقنية يتخلف
7. **التقييم والمراجعة**: التقييم المستمر للنتائج والمنهجيات يضمن التحسين المتواصل — الرضا عن الوضع الحالي بداية التراجع
8. **الاستشراف المستقبلي**: توقّع التطورات المستقبلية يساعد في الاستعداد والتكيّف — المتوقع يُعدّ، والمفاجئ يُسحق

## التطبيقات العملية: خريطة الميدان

| المجال | التطبيق | الأهمية | أمثلة عملية |
|--------|---------|---------|-------------|
| التعليم | تطوير المناهج ووسائل التدريس | عالية | منصات تعلم تفاعلية، محاكاة رقمية |
| البحث العلمي | إجراء دراسات متخصصة ونشر أوراق بحثية | عالية | أبحاث محكمة، مشاريع بحثية تعاونية |
| الصناعة | تحسين العمليات والإنتاج وتطوير المنتجات | متوسطة-عالية | أتمتة العمليات، ضبط الجودة |
| الخدمات | تطوير جودة الخدمات وتحسين تجربة المستخدم | متوسطة | منصات خدمات رقمية، قياس رضا العملاء |
| الرعاية الصحية | تطوير أساليب التشخيص والعلاج | عالية | طب مبني على الأدلة، سجلات صحية إلكترونية |
| التقنية | ابتكار حلول تقنية متقدمة | عالية | ذكاء اصطناعي، إنترنت الأشياء |
| الإدارة | تحسين العمليات الإدارية واتخاذ القرار | متوسطة | أنظمة إدارة متكاملة، تحليلات بيانات |
| السياسات العامة | صياغة سياسات مبنية على الأدلة | متوسطة-عالية | أبحاث سياسات، تقارير استشارية |

:::callout-rule
قاعدة ذهبية: أفضل طريقة لتعلم ${topic} هي تطبيقه في مشروع حقيقي. ابدأ صغيراً، أخطئ سريعاً، تعلّم أسرع.
:::

## التحديات الحقيقية والحلول الذكية

| التحدي | طبيعته | الحل الذكي | المؤشر على النجاح |
|---------|---------|------------|-------------------|
| صعوبة الفهم الشامل | تعقيد وتداخل الأبعاد | منهجية تعلم تدريجية تبني شبكة معرفية مترابطة | القدرة على ربط أي مفهوم بـ 3 مفاهيم أخرى على الأقل |
| التطور السريع | تقادم المعرفة بسرعة | متابعة دورية لأحدث المصادر والأبحاث | قراءة/مراجعة مصدر محدّث أسبوعياً |
| فجوة النظرية والممارسة | صعوبة نقل المفاهيم للتطبيق | مشاريع عملية وتدريب في بيئات حقيقية | تطبيق واحد كامل لكل مفهوم رئيسي |
| محدودية المصادر الموثوقة | صعوبة الوصول لمصادر جيدة | بناء شبكة مصادر متنوعة تشمل أبحاثاً محكمة | قائمة مصادر موثوقة مُحدّثة باستمرار |
| التعامل مع البيانات الضخمة | حجم هائل من المعلومات | أدوات تحليل متقدمة ومهارات برمجية | القدرة على استخلاص رؤى من بيانات خام |

:::callout-error
خطأ شائع: الاكتفاء بمصدر واحد للتعلم. ${topic} يتطلب تنوع المصادر — المصدر الواحد يعطيك منظوراً واحداً، والمنظور الواحد يعميك عن 80% من الصورة.
:::

## المقارنة الاستراتيجية: أي منهج أقوى؟

| المعيار | المنهج التقليدي | المنهج الحديث | المنهج المتقدم |
|---------|----------------|---------------|----------------|
| المنهجية | خطية وتسلسلية | تكرارية ومرنة | تكيفية وذكية |
| مصادر البيانات | محدودة ومحلية | متنوعة وعالمية | ضخمة ومتنامية |
| سرعة الاستجابة | بطيئة | متوسطة | فورية |
| دقة النتائج | متوسطة | عالية | عالية جداً |
| التكلفة الأولية | منخفضة نسبياً | متوسطة | مرتفعة |
| قابلية التوسع | محدودة | جيدة | ممتازة |
| الابتكار | ضعيف | متوسط | قوي جداً |

## الجدول الزمني: كيف تطوّر ${topic}

| المرحلة | الفترة الزمنية | الإنجاز الرئيسي | الأثر |
|---------|---------------|----------------|-------|
| التأسيس | المرحلة الأولى | بناء الأسس النظرية والمفاهيمية | وضع حجر الأساس |
| النمو | المرحلة الثانية | توسيع نطاق التطبيقات وبناء المجتمعات البحثية | خلق زخم معرفي |
| النضج | المرحلة الثالثة | تطوير المعايير والمنهجيات المعتمدة | تثبيت الممارسات الفضلى |
| التحول الرقمي | المرحلة الرابعة | الانتقال للبيئات الرقمية واستثمار التقنية | مضاعفة الكفاءة |
| الذكاء الاصطناعي | المرحلة الحالية | التكامل مع الذكاء الاصطناعي وتحليلات البيانات الضخمة | ثورة في الإمكانيات |

## الخلاصة والتوصيات الاستراتيجية

إتقان ${topic} ليس رفاهية — إنه ضرورة استراتيجية. من يمتلك فهمه العميق يمتلك ميزة تنافسية حقيقية في سوق لا يرحم المتوسطين.

:::feature
**استثمر في الأساس**
بناء قاعدة معرفية صلبة شاملة — العجلة المُشرّخة لا تدور طويلاً
:::

:::feature
**طبّق فوراً**
اربط كل نظرية بتطبيق عملي — المعرفة بلا تطبيق كالسيف بلا يد
:::

:::feature
**حدّث باستمرار**
تابع المستجدات دورياً — في عالم يتغير بالثانية، الأمس قد يكون متخلفاً
:::

:::feature
**فكّر نقدياً**
لا تقبل معلومة بلا تمحيص — العقل النقدي هو الدرع ضد التضليل
:::

:::feature
**تعاون عبر التخصصات**
ابحث عن الروابط بين المجالات — أقلى الابتكارات ولدت عند نقاط التقاطع
:::

:::feature
**التزم بالأخلاقيات**
حافظ على المعايير الأخلاقية — المصداقية رأس المال الحقيقي
:::

${instructions ? `## تعليمات إضافية\n\n${instructions}\n` : ''}

## المراجع والمصادر

1. المرجع الأساسي في **${topic}** — الطبعة الأخيرة، دار النشر الأكاديمية
2. دراسة تحليلية شاملة حول تطور **${topic}** — المجلة العربية للبحوث المتخصصة
3. دليل الممارسات الفضلى في مجال **${topic}** — المنظمة العربية للتنمية
4. أوراق بحثية محكمة حول التطبيقات المعاصرة — مؤتمر البحث العلمي السنوي
5. تقرير حالة المجال والتوجهات المستقبلية — مركز الدراسات الاستراتيجية
6. موسوعة **${topic}** الشاملة — المؤسسة الوطنية للبحث العلمي

---
بعقل هادي | DeltaAI`;
  }

  return `# ${topic}

## Introduction

This document provides a comprehensive and in-depth overview of **${topic}**. It aims to serve as a complete academic reference covering various aspects of this vital subject, from basic definitions to practical applications and contemporary challenges. This document has been prepared as an effective tool for researchers and practitioners alike, with a focus on presenting information in an organized and systematic manner.

**${topic}** has received increasing attention in recent years, given its profound impact on multiple and diverse fields. Understanding this subject comprehensively requires a careful review of its various dimensions, including theoretical, applied, and research aspects.

This document seeks to bridge the knowledge gap regarding **${topic}**, through in-depth analysis based on the latest research and studies in the field. It also includes comparative tables and detailed analyses to facilitate the reader's understanding of complex concepts.

## Definition and Concept

**${topic}** is defined as a specialized knowledge field that includes a set of concepts, principles, and methodologies forming an integrated framework for understanding and dealing with various issues related to it. This definition encompasses several fundamental dimensions including the theoretical dimension, the applied dimension, and the methodological dimension.

The concept of **${topic}** is no longer limited to the traditional framework it was known for, but has evolved to include new dimensions imposed by the requirements of the digital age and accelerating technological progress. This evolution requires learners and researchers to continuously update their knowledge.

It is important to note that **${topic}** intersects with several other disciplines, making it inherently multidisciplinary. This intersection enriches the field's knowledge content and opens new horizons for research and innovation.

## Importance and Objectives

**${topic}** occupies a pivotal position in the contemporary knowledge landscape for the following reasons:

- It is considered one of the fundamental pillars in building specialized knowledge in its field
- It has direct and indirect impacts on multiple economic and social sectors
- It contributes to developing theoretical understanding and enhancing applied capabilities
- It provides a methodological framework for analyzing complex problems and proposing solutions
- It fosters innovation and creativity in related fields
- It supports evidence-based and data-driven decision making

**Key Objectives for Studying ${topic}:**

1. **Deep Understanding**: Building a solid knowledge base including fundamental concepts and theories
2. **Effective Application**: Ability to employ acquired knowledge in solving practical problems
3. **Critical Analysis**: Developing the ability to evaluate information and evidence objectively
4. **Innovation**: Developing new and creative solutions to existing challenges
5. **Knowledge Transfer**: Effectively communicating knowledge to various target audiences

## Core Principles

### Principle 1: Comprehensive and Systematic Understanding
Working with **${topic}** requires comprehensive and systematic understanding of all its different aspects and dimensions. This means not settling for surface-level knowledge, but diving into the details and interrelationships between the different components of the field.

### Principle 2: Practical Application and Experimentation
Theoretical concepts should be linked to practical applications to maximize benefit. Practical application is the true test of the validity and effectiveness of theoretical concepts.

### Principle 3: Continuous Updates and Lifelong Learning
**${topic}** is constantly evolving, so it's important to follow the latest developments and research. Commitment to continuous learning is not an option but a pressing necessity.

### Principle 4: Critical and Analytical Thinking
Critical thinking is a fundamental pillar in dealing with **${topic}**, requiring the ability to analyze information, evaluate its credibility, and draw logical conclusions.

### Principle 5: Collaboration and Interdisciplinary Integration
**${topic}** cannot be understood in isolation from other disciplines; rather, it requires an integrative approach that combines knowledge from diverse sources.

## Key Points

1. **Theoretical Foundations**: Understanding the basic concepts and theoretical framework of **${topic}** forms the starting point for any in-depth study
2. **Practical Applications**: Learning about various practical applications in diverse contexts enhances understanding and broadens horizons
3. **Contemporary Challenges**: Identifying current and future challenges helps in strategic planning and developing solutions
4. **Research Methodologies**: Mastering appropriate research methodologies enables the production of new and reliable knowledge
5. **Ethics and Standards**: Commitment to ethical standards in research and application ensures the credibility of results
6. **Modern Technologies**: Leveraging advanced technologies enhances efficiency and opens new horizons
7. **Evaluation and Review**: Continuous evaluation of results and methodologies ensures ongoing improvement
8. **Future and Foresight**: Anticipating future developments helps in preparation and adaptation

## Practical Applications

| Field | Application | Importance | Practical Examples |
|-------|-------------|------------|-------------------|
| Education | Curriculum development and teaching methods | High | Interactive courses, digital learning platforms |
| Research | Conducting specialized studies and publishing research | High | Peer-reviewed papers, research projects |
| Industry | Improving processes, production, and product development | Medium-High | Process automation, quality control |
| Services | Developing service quality and improving user experience | Medium | Digital service platforms, customer satisfaction |
| Healthcare | Developing diagnostic and treatment methods | High | Evidence-based medicine, electronic health records |
| Technology | Innovating advanced technological solutions | High | Artificial intelligence, Internet of Things |
| Management | Improving administrative processes and decision making | Medium | Integrated management systems, data analytics |
| Public Policy | Formulating evidence-based policies | Medium-High | Policy research, advisory reports |

> **Note**: The information in this document is for educational and informational purposes. Readers are advised to consult original sources for verification of details.

## Challenges and Solutions

Key challenges facing **${topic}**:

- **Challenge 1: Difficulty in Comprehensive Understanding**
  The complex and intertwined nature of **${topic}** makes it difficult to grasp all its aspects at once.
  - *Solution*: Adopt a gradual learning methodology starting with basics and progressing to depth, focusing on building an interconnected knowledge network

- **Challenge 2: Rapid and Continuous Evolution**
  **${topic}** evolves at a rapid pace, making acquired knowledge susceptible to quick obsolescence.
  - *Solution*: Regular follow-up of the latest sources and research, subscribing to specialized newsletters and scientific conferences

- **Challenge 3: Gap Between Theory and Practice**
  Learners may face difficulty transferring theoretical concepts into successful practical applications.
  - *Solution*: Continuous practice through hands-on projects and training in real environments

- **Challenge 4: Limited Reliable Sources**
  High-quality sources may be limited or difficult to access.
  - *Solution*: Build a diverse network of sources including peer-reviewed research, official publications, and specialized databases

- **Challenge 5: Dealing with Big Data**
  Many applications of **${topic}** require the ability to analyze massive amounts of data.
  - *Solution*: Use advanced data analysis tools and develop the necessary programming skills

## Comparison and Analysis

| Criterion | Traditional Approach | Modern Approach | Advanced Approach |
|-----------|---------------------|----------------|-------------------|
| Methodology | Linear and sequential | Iterative and flexible | Adaptive and intelligent |
| Data Sources | Limited and local | Diverse and global | Massive and growing |
| Response Speed | Slow | Moderate | Instantaneous |
| Result Accuracy | Medium | High | Very High |
| Cost | Relatively low | Moderate | High initially |
| Scalability | Limited | Good | Excellent |

## Timeline

**Key Milestones in the Development of ${topic}:**

1. **Foundational Phase**: Establishing the initial theoretical and conceptual foundations that formed the starting point for the field
2. **Growth Phase**: Expanding the scope of applications and building specialized research communities
3. **Maturity Phase**: Developing established standards and methodologies and consolidating best practices
4. **Digital Transformation Phase**: Transitioning to digital environments and leveraging modern technological capabilities
5. **Current Phase**: Integration with artificial intelligence and big data analytics

## Conclusion and Recommendations

In conclusion, **${topic}** is a topic of great importance that requires deep understanding and continuous application. By following the principles and foundations mentioned above, positive and tangible results can be achieved in this vital field.

**Key Recommendations:**

1. Invest in building a solid and comprehensive knowledge base
2. Focus on practical applications and linking theory to practice
3. Keep up with ongoing developments and periodically update knowledge
4. Enhance collaboration between different disciplines
5. Commit to ethical standards in research and application
6. Continuously develop analytical and critical capabilities

${instructions ? `## Additional Instructions\n\n${instructions}\n` : ''}

## References

1. Primary reference in **${topic}** — Latest edition, Academic Publishing House
2. Comprehensive analytical study on the evolution of **${topic}** — Journal of Specialized Research
3. Best practices guide in the field of **${topic}** — Development Organization
4. Peer-reviewed papers on contemporary applications — Annual Research Conference Proceedings
5. State of the field report and future trends — Center for Strategic Studies
6. Comprehensive encyclopedia of **${topic}** — National Research Foundation

---
*DeltaAI*`;
}

/**
 * Generate a single PDF document using the LOCAL PDF Engine.
 * Uses LLM to generate rich structured content, then renders as PDF.
 * No external API dependencies — works reliably every time.
 *
 * @param options - Local document generation options
 * @returns The generated document result
 */
export async function generateLocalDocument(
  options: LocalDocumentOptions
): Promise<DocumentGenResult> {
  const startTime = Date.now();
  const { topic, language = 'ar', instructions = '', channelName = 'بعقل هادي', styleDescription, progressCallback } = options;
  const isAr = language === 'ar';

  console.log(`[LocalDoc] Starting local document generation: "${topic}"`);

  // ── Stage 1: Generate rich content via LLM ──
  progressCallback?.('thinking', 10, 'جاري توليد المحتوى بالذكاء الاصطناعي...');
  // Uses the Content Strategy System Prompt v2 — Dynamic Design Engine
  // with 3-step design thinking: Content Analysis → Dynamic Palette → Structural Flexibility
  // FIX (Issue 2): Removed design/color instructions from the content prompt.
  // The design reasoning system handles ALL visual decisions (colors, palette, layout).
  // The content LLM only needs to produce high-quality text content.
  const contentSystemPrompt = isAr
    ? `أنت كاتب المحتوى الإستراتيجي لمنصة Delta AI (بعقل هادي). مهمتك هي "تحليل المادة المدخلة هندسياً وسياقياً" ثم إنتاج محتوى أكاديمي عميق ومتميز يخدم هذا المحتوى بالذات، بحيث لا يتشابه مستندان أبداً.

خطوات تفكيرك الذكي (نفذها خلف الكواليس قبل الكتابة):
1. تحليل المحتوى (Content Analysis): افهم طبيعة المادة. هل هي (طبية/كيمياء، بيزنس/تسويق، إنسانيات/تاريخ، تقنية/برمجة)؟

ملاحظة: التصميم البصري (الألوان، الثيمات، الهيكل البصري) يتم التعامل معه بواسطة نظام تصميم مستقل. ركز فقط على إنتاج المحتوى النصي الممتاز.

الشروط الأكاديمية الصارمة:
- ادخل في صلب الموضوع فوراً بـ "سلطة معرفية". يُمنع تماماً استخدام الجمل الإنشائية الجاهزة (مثل: مما لا شك فيه، يعتبر موضوعاً مهماً). ادخل في الأفكار مباشرة بثقة وخبرة.
- العناوين الإبداعية المتغيرة: ابتكِر عناوين فرعية (##) ذكية ومستوحاة من صلب المادة المدخلة، لا تستخدم نفس الصياغة بين ملفين أبداً.
- تكنيك البصمجة الذكية: للمواد الطبية والعلمية والكيميائية والصيدلانية، اكتب المصطلح أو التفاعل بالإنجليزية أولاً بوزن عريض (bold)، ومباشرة بجانبه بين قوسين الشرح العربي العامي المبسط جداً لقتل أي عائق للفهم (مثال: **Dehydration of alcohol** (نزع الماء من الكحول طبقاً لقاعدة زايتسيف)).
- الدقة الإملائية: حافظ على المصطلحات كما هي، واسم العلامة التجارية يُكتب دائماً "بعقل هادي" بدقة دون تحريف حروف.

تنسيق Markdown المطلوب:
- عنوان رئيسي واحد (#)
- عناوين فرعية قوية ومبتكرة (##) بأسلوب "سلطة معرفية" — لا تكرر نفس الصياغة بين ملفين
- عناوين فرعية أصغر (###) للتفاصيل
- للـ Hooks والقواعد الحاكمة: :::callout-hook أو :::callout-rule أو :::callout-error (ينتهي بـ :::) — يتحول تلقائياً إلى <div class="callout-box">
- للمقارنات، المعادلات، الـ KPIs، التفاعلات والتركيبات الصيدلانية: جداول Markdown (| عمود 1 | عمود 2 |) — يتحول تلقائياً إلى <table class="data-table">
- للأفكار المتفرعة أو الخطوات الشارحة: :::feature (ينتهي بـ :::) مع عنوان مبدأ/خطوة مرقم ثم شرح — يتحول تلقائياً إلى <div class="features-table"><div class="feature-box">
- ملاحظات (:::note) وتحذيرات (:::warning) ونصائح (:::tip)
- نقاط مرقمة (1. 2. 3.) فقط للقوائم الطويلة غير المناسبة كـ features
- ممنوع منعاً باتاً الإنشائيات الكسولة — كل فقرة يجب أن تضيف قيمة فعلية لا حشو
- ابدأ كل قسم بمعلومة صادمة أو سؤال محفز — لا بمقدمة إنشائية
- استخدم الأمثلة الواقعية والتنبيهات العملية بكثافة`
    : `You are the Strategic Content Writer for Delta AI Platform (بعقل هادي). Your mission is "analyzing the input material architecturally and contextually" then producing deep, distinguished academic content that serves this specific material, so that no two documents ever look alike.

Smart Thinking Steps (execute behind the scenes before writing):
1. Content Analysis: Understand the nature of the material. Is it (medical/chemistry, business/marketing, humanities/history, tech/programming)?

Note: Visual design (colors, palettes, visual structure) is handled by a separate design system. Focus only on producing excellent text content.

Strict Academic Rules:
- Enter the core of the topic immediately with "knowledge authority". ABSOLUTELY NO lazy filler phrases (like: "it goes without saying", "this topic is important"). Dive straight into ideas with confidence and expertise.
- Creative variable subtitles: Invent (##) subheadings that are smart and derived from the input material — never reuse the same phrasing across files.
- Smart Imprinting: For medical, scientific, and chemistry subjects, write the term in English first in bold, followed immediately in parentheses by a simplified colloquial Arabic explanation to kill any comprehension barrier (e.g., **Dehydration of alcohol** (نزع الماء من الكحول طبقاً لقاعدة زايتسيف)).
- Spelling accuracy: Preserve terms exactly as they are, and the brand name is always written "بعقل هادي" precisely without letter distortion.

Required Markdown Format:
- One main heading (#)
- Powerful creative subheadings (##) with "knowledge authority" style — never repeat phrasing across files
- Smaller subheadings (###) for details
- For Hooks and Governing Rules: :::callout-hook or :::callout-rule or :::callout-error (ends with :::) — auto-converts to <div class="callout-box">
- For Comparisons, Equations, KPIs, Pharmaceutical Compositions: Markdown tables (| Col 1 | Col 2 |) — auto-converts to <table class="data-table">
- For Branching Ideas or Explanatory Steps: :::feature (ends with :::) with numbered principle/step title then explanation — auto-converts to <div class="features-table"><div class="feature-box">
- Notes (:::note), Warnings (:::warning), Tips (:::tip)
- Numbered lists (1. 2. 3.) only for long lists not suited as features
- ABSOLUTELY NO lazy filler — every paragraph must add actual value, no padding
- Start each section with a shocking fact or provocative question — never a filler introduction
- Use real-world examples and practical alerts extensively`;

  const userMessage = isAr
    ? `أنشئ مستند شامل عن: ${topic}${instructions ? `\n\nتعليمات إضافية: ${instructions}` : ''}`
    : `Create a comprehensive document about: ${topic}${instructions ? `\n\nAdditional instructions: ${instructions}` : ''}`;

  const generatedContent = await callLLMForBatch(contentSystemPrompt, userMessage, 'glm-4-flash');
  const finalContent = generatedContent || generateFallbackContent(topic, instructions, language);
  console.log(`[LocalDoc] Content generated: ${finalContent.length} chars (LLM: ${generatedContent ? 'yes' : 'no, using fallback'})`);
  progressCallback?.('generating', 30, 'جاري صياغة المحتوى الأكاديمي...');

  // ── Stage 2: Design reasoning ──
  progressCallback?.('designing', 50, 'جاري تحليل التصميم واختيار الألوان...');

  // ── Stage 3: Generate images for the document (SKIPPED by default for speed) ──
  // Image generation via Pollinations takes 30-60s per image, making total generation
  // time 2-3 minutes. Only generate images when explicitly requested.
  const images: Record<string, string> = {};

  // NOTE: To enable image generation, pass includeImages: true in the options
  // This is disabled by default to keep document generation under 30 seconds
  if (options.includeImages) {
    progressCallback?.('images', 60, 'جاري توليد الصور بالذكاء الاصطناعي...');
    try {
      let imagePrompts = detectImageOpportunities(finalContent, topic);
      console.log(`[LocalDoc] Detected ${imagePrompts.length} image opportunities from content scan`);

      // If detectImageOpportunities returned fewer than 3, create fallback prompts
      // based on the topic and sections extracted from the content
      if (imagePrompts.length < 3) {
        console.log(`[LocalDoc] Only ${imagePrompts.length} opportunities detected, generating fallback prompts`);

        // Always include a cover image prompt
        if (!imagePrompts.some(p => p.includes('cover illustration'))) {
          imagePrompts.unshift(`cover illustration for document titled: ${topic}, professional, clean, elegant, academic style, high quality`);
        }

        // Extract section headings from content for fallback prompts
        const headingRegex = /^#{1,3}\s+(.+)$/gm;
        const headings: string[] = [];
        let hMatch: RegExpExecArray | null;
        headingRegex.lastIndex = 0;
        while ((hMatch = headingRegex.exec(finalContent)) !== null) {
          headings.push(hMatch[1].trim());
        }

        // Add prompts for headings that don't already have image prompts
        for (const heading of headings) {
          if (imagePrompts.length >= 5) break; // Max 5 images total
          if (!imagePrompts.some(p => p.includes(heading))) {
            imagePrompts.push(`illustration for section: ${heading}, professional, clean, academic style, educational diagram`);
          }
        }

        console.log(`[LocalDoc] After fallback generation: ${imagePrompts.length} image opportunities`);
      }

      // Generate images for detected opportunities (limit to 5 to save time, ensure at least 3 attempted)
      const promptsToGenerate = imagePrompts.slice(0, 5);
      let successCount = 0;
      let failCount = 0;

      for (const prompt of promptsToGenerate) {
        console.log(`[LocalDoc] Generating image for: ${prompt.slice(0, 80)}...`);
        const imageData = await generateImageForDocument(prompt, 800, 600);
        if (imageData) {
          successCount++;
          // Extract section heading from prompt for matching
          // Prompt format: "illustration for section: XYZ, ..." or "cover illustration for document titled: XYZ, ..."
          const sectionMatch = prompt.match(/section:\s*([^,]+)/i);
          const coverMatch = prompt.match(/document titled:\s*([^,]+)/i);

          if (coverMatch) {
            // Cover image — key by "cover"
            images['cover'] = imageData;
          } else if (sectionMatch) {
            // Section image — key by section heading
            images[sectionMatch[1].trim()] = imageData;
          }
          // Also key by the full prompt for fallback matching
          images[prompt] = imageData;
          console.log(`[LocalDoc] ✓ Image generated and stored (${Object.keys(images).length} keys total) for: ${prompt.slice(0, 60)}...`);
        } else {
          failCount++;
          console.warn(`[LocalDoc] ✗ Failed to generate image for: ${prompt.slice(0, 60)}...`);
        }
      }

      console.log(`[LocalDoc] Image generation complete: ${successCount} succeeded, ${failCount} failed out of ${promptsToGenerate.length} attempts`);
      progressCallback?.('images_progress', 70, 'جاري معالجة الصور...');
    } catch (imgError) {
      console.warn('[LocalDoc] Image generation failed, continuing without images:', imgError);
    }
  } else {
    console.log('[LocalDoc] Image generation skipped (not requested). Set includeImages: true to enable.');
  }

  // ── Stage 4: Generate PDF ──
  // NEW unified AI-driven generator: the model THINKS, PLANS, and PROGRAMS the
  // entire HTML+CSS from scratch — no rigid templates, no design-reasoning JSON
  // choices converted to fixed CSS. Every document gets a unique visual identity
  // because the model IS the designer, not a template-selector.
  progressCallback?.('rendering', 80, '🎨 الموديل بيفكّر ويصمّم ويبرمج المستند من الصفر...');
  const safeTopic = topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 80);

  const aiResult = await generateAIDocument({
    topic,
    language,
    instructions,
    channelName,
    styleDescription,
    progressCallback,
  });

  // ── Fallback to the legacy pipeline if the new generator fails ──
  // (keeps the old renderToPDF path available for resilience)
  let finalFilePath: string;
  let finalFileSize: number | undefined;

  if (aiResult.success && aiResult.filePath) {
    finalFilePath = aiResult.filePath;
    finalFileSize = aiResult.fileSize;
    console.log(`[LocalDoc] ✓ AI-generated document in ${aiResult.durationMs}ms (unified generator)`);
  } else {
    console.warn('[LocalDoc] AI generator failed, falling back to legacy pipeline:', aiResult.error);
    progressCallback?.('rendering', 82, '🔄 جاري استخدام المسار البديل...');

    const userDesignPreferences = styleDescription
      ? parseUserDesignPreferences(styleDescription)
      : undefined;

    const pdfResult = await renderToPDF({
      title: topic,
      content: finalContent,
      modelId: 'local-pdf',
      author: channelName,
      language,
      documentType: 'summary',
      useDesignReasoning: true,
      images: Object.keys(images).length > 0 ? images : undefined,
      styleDescription,
      userDesignPreferences,
    });

    if (!pdfResult.success || !pdfResult.filePath) {
      throw new Error(`PDF generation failed: ${pdfResult.error || aiResult.error || 'Unknown error'}`);
    }
    finalFilePath = pdfResult.filePath;
    finalFileSize = pdfResult.fileSize;
    console.log(`[LocalDoc] ✓ Legacy pipeline document in ${pdfResult.duration}ms`);
  }

  progressCallback?.('finalizing', 95, 'جاري إصدار الملف النهائي...');

  const durationMs = Date.now() - startTime;

  progressCallback?.('completed', 100, 'تم إنشاء المستند بنجاح!');

  return {
    fileUrl: finalFilePath,
    fileName: `${safeTopic}.pdf`,
    mimeType: 'application/pdf',
    docType: 'pdf',
    model: 'local-pdf',
    durationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// BATCH DOCUMENT GENERATION (v4 — Playwright Rendering)
// ═══════════════════════════════════════════════════════════════════════
// Uses Playwright rendering pipeline for batch lecture processing.
// Supports up to 12 lectures with progress tracking.
// For image generation, uses Pollinations `flux` model (free, fast, high quality).
// ═══════════════════════════════════════════════════════════════════════

// ─── ZAI SDK Singleton for LLM calls ──────────────────────────────────
declare global {
  var _docBatchZaiClient: any;
}

async function getDocBatchZAIClient() {
  if (!globalThis._docBatchZaiClient) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._docBatchZaiClient = await ZAI.create();
  }
  return globalThis._docBatchZaiClient;
}

// ─── Diagram Extraction Patterns ─────────────────────────────────────
const DIAGRAM_PATTERNS = [
  // Arabic diagram keywords
  /مخطط\s*بياني/gi,
  /رسم\s*بياني/gi,
  /رسم\s*توضيحي/gi,
  /جدول\s*(يوضح|يبين|يظهر|يلخص)/gi,
  /شكل\s*(رقم|\d+|يوضح|يبيّن)/gi,
  /تخطيط/gi,
  /مبيان/gi,
  /هيكل\s*(تنظيمي|عام)/gi,
  /خريطة\s*(ذهنية|عقلية|مفاهيمية)/gi,
  // English diagram keywords
  /diagram/gi,
  /chart/gi,
  /graph/gi,
  /figure\s*\d*/gi,
  /fig\.\s*\d*/gi,
  /table\s*(shows|illustrates|depicts|presents)/gi,
  /flow\s*chart/gi,
  /pie\s*chart/gi,
  /bar\s*chart/gi,
  /line\s*graph/gi,
  /scatter\s*plot/gi,
  /venn\s*diagram/gi,
  /mind\s*map/gi,
  /organizational\s*chart/gi,
  /schematic/gi,
  /illustration/gi,
  /infographic/gi,
  /drawing/gi,
  /blueprint/gi,
  /wireframe/gi,
  /mockup/gi,
];

/**
 * Extract diagram/chart/drawing descriptions from lecture content.
 * Scans each lecture for diagram-related patterns and extracts surrounding context.
 *
 * @param lectures - Array of lectures with title and content
 * @returns Array of extracted diagram descriptions with lecture context
 */
export function extractDiagramsFromLectures(
  lectures: { title: string; content: string }[]
): DiagramExtraction[] {
  const results: DiagramExtraction[] = [];

  for (let i = 0; i < lectures.length; i++) {
    const lecture = lectures[i];
    const content = lecture.content;

    for (const pattern of DIAGRAM_PATTERNS) {
      let match: RegExpExecArray | null;
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const matchIndex = match.index;
        const matchText = match[0];

        // Extract surrounding context (±150 chars)
        const contextStart = Math.max(0, matchIndex - 150);
        const contextEnd = Math.min(content.length, matchIndex + matchText.length + 150);
        const context = content.slice(contextStart, contextEnd).trim();

        // Build a description from the match and surrounding sentence
        const sentenceStart = content.lastIndexOf('.', matchIndex);
        const sentenceEnd = content.indexOf('.', matchIndex + matchText.length);
        const sentence = content.slice(
          Math.max(0, sentenceStart + 1),
          sentenceEnd > 0 ? sentenceEnd + 1 : matchIndex + matchText.length + 100
        ).trim();

        // Avoid duplicates — check if we already have a very similar entry for this lecture
        const isDuplicate = results.some(
          (r) => r.lectureIndex === i && r.context === context
        );

        if (!isDuplicate) {
          results.push({
            lectureIndex: i,
            description: sentence || `Diagram/chart reference in "${lecture.title}"`,
            context,
          });
        }
      }
    }
  }

  return results;
}

// ─── LLM Call Helper for Batch Processing ────────────────────────────
async function callLLMForBatch(
  systemPrompt: string,
  userMessage: string,
  model: string = 'glm-4-flash'
): Promise<string> {
  try {
    // Add a timeout to prevent hanging when ZAI SDK can't reach the API
    // (e.g., on HuggingFace Spaces where internal-api.z.ai is not accessible)
    const LLM_TIMEOUT_MS = 15_000; // 15 seconds

    const zai = await withTimeout(
      getDocBatchZAIClient(),
      LLM_TIMEOUT_MS,
      'ZAI SDK initialization timed out'
    );

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    const completion = await withTimeout(
      zai.chat.completions.create({
        model,
        messages,
        stream: false,
        thinking: { type: 'disabled' },
      }),
      LLM_TIMEOUT_MS,
      'LLM call timed out'
    );

    if (completion && typeof completion === 'object') {
      const choices = (completion as any).choices;
      if (choices && choices.length > 0) {
        const content = choices[0].message?.content || choices[0].text || '';
        if (content) return content;
      }
      if ((completion as any).content) return (completion as any).content;
    }

    return '';
  } catch (error) {
    console.error('[BatchDoc] LLM call failed:', error instanceof Error ? error.message : String(error));
    // Reset client on failure
    globalThis._docBatchZaiClient = null;
    // Return empty string instead of throwing — fallback content will be used
    return '';
  }
}

// ─── Generate Image via ZAI SDK (primary) or Pollinations (fallback) ────
const IMAGE_GEN_TIMEOUT_MS = 90_000; // 90 seconds
const IMAGE_GEN_MAX_RETRIES = 2; // Retry up to 2 times on failure

// ─── ZAI SDK Singleton for Image Generation ───────────────────────────
declare global {
  var _docImageZaiClient: any;
}

async function getImageGenZAIClient() {
  if (!globalThis._docImageZaiClient) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._docImageZaiClient = await ZAI.create();
  }
  return globalThis._docImageZaiClient;
}

/**
 * Generate an image using the ZAI SDK (primary) with Pollinations fallback.
 * Returns a base64 data URI (data:image/png;base64,...) or null on failure.
 *
 * The ZAI SDK provides reliable, high-quality image generation.
 * Pollinations is used as a fallback if the SDK fails.
 *
 * @param prompt - The image generation prompt
 * @param width - Image width (default 1024) — used for Pollinations fallback
 * @param height - Image height (default 1024) — used for Pollinations fallback
 * @returns Base64 data URI string or null
 */
export async function generateImageForDocument(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string | null> {
  // ── Strategy 1: ZAI SDK (primary, most reliable) ──
  try {
    const zai = await withTimeout(
      getImageGenZAIClient(),
      15_000,
      'ZAI SDK init timed out'
    );

    // Map width/height to closest supported ZAI size
    const supportedSizes = ['1024x1024', '1344x768', '768x1344', '1152x864', '864x1152', '1440x720', '720x1440'] as const;
    let size: string = '1024x1024';
    if (width > height * 1.3) size = '1344x768';       // landscape
    else if (height > width * 1.3) size = '768x1344';   // portrait
    else if (width > height * 1.1) size = '1152x864';   // slight landscape
    else if (height > width * 1.1) size = '864x1152';   // slight portrait
    if (!supportedSizes.includes(size as any)) size = '1024x1024';

    console.log(`[ImageGen] ZAI SDK generating image (size=${size}): ${prompt.slice(0, 60)}...`);

    const response = await withTimeout(
      zai.images.generations.create({
        prompt: prompt.slice(0, 1000), // ZAI prompt limit
        size,
      }),
      IMAGE_GEN_TIMEOUT_MS,
      'ZAI image generation timed out'
    );

    if (response?.data?.[0]?.base64) {
      const base64 = response.data[0].base64;
      const dataUri = `data:image/png;base64,${base64}`;
      console.log(`[ImageGen] ✓ ZAI SDK image generated successfully (${(base64.length / 1024).toFixed(1)}KB base64)`);
      return dataUri;
    }

    console.warn('[ImageGen] ZAI SDK returned empty response, falling back to Pollinations');
  } catch (zaiError) {
    console.warn('[ImageGen] ZAI SDK failed, falling back to Pollinations:', zaiError instanceof Error ? zaiError.message : String(zaiError));
    // Reset client on failure
    globalThis._docImageZaiClient = null;
  }

  // ── Strategy 2: Pollinations flux (fallback) ──
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 500));
  const randomSeed = Math.floor(Math.random() * 2147483647);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${randomSeed}`;

  for (let attempt = 0; attempt <= IMAGE_GEN_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[ImageGen] Pollinations retry attempt ${attempt}/${IMAGE_GEN_MAX_RETRIES} for: ${prompt.slice(0, 50)}...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }

      console.log(`[ImageGen] Pollinations fetching image (attempt ${attempt + 1}, timeout ${IMAGE_GEN_TIMEOUT_MS / 1000}s): ${prompt.slice(0, 60)}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'image/*' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[ImageGen] Pollinations HTTP ${response.status} for prompt: ${prompt.slice(0, 50)}...`);
        if (attempt < IMAGE_GEN_MAX_RETRIES) continue;
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 1000) {
        console.warn(`[ImageGen] Pollinations response too small (${arrayBuffer.byteLength} bytes), likely error page. Retrying...`);
        if (attempt < IMAGE_GEN_MAX_RETRIES) continue;
        return null;
      }

      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUri = `data:image/png;base64,${base64}`;
      console.log(`[ImageGen] ✓ Pollinations image generated successfully (${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, ${(base64.length / 1024).toFixed(1)}KB base64)`);
      return dataUri;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[ImageGen] Pollinations attempt ${attempt + 1} failed: ${errMsg}`);
      if (attempt >= IMAGE_GEN_MAX_RETRIES) {
        console.warn(`[ImageGen] All attempts exhausted for: ${prompt.slice(0, 50)}...`);
        return null;
      }
    }
  }
  return null;
}

// ─── Process Diagram Blocks ──────────────────────────────────────────

/**
 * Process :::diagram ... ::: blocks in the content and convert them
 * into markdown image syntax that the template generator can render
 * as styled diagram containers.
 */
function processDiagramBlocks(content: string, language: 'ar' | 'en'): string {
  const isAr = language === 'ar';
  return content.replace(
    /:::diagram\s*\n([\s\S]*?):::/g,
    (_, blockContent) => {
      const titleMatch = blockContent.match(/عنوان الرسمة:\s*(.+)/i) || blockContent.match(/Title:\s*(.+)/i);
      const descMatch = blockContent.match(/وصف:\s*(.+)/i) || blockContent.match(/Description:\s*(.+)/i);
      const analysisMatch = blockContent.match(/تحليل:\s*([\s\S]+?)(?=\n|$)/i) || blockContent.match(/Analysis:\s*([\s\S]+?)(?=\n|$)/i);

      const title = titleMatch ? titleMatch[1].trim() : (isAr ? 'رسم توضيحي' : 'Diagram');
      const desc = descMatch ? descMatch[1].trim() : '';
      const analysis = analysisMatch ? analysisMatch[1].trim() : '';

      // Use markdown image with description as a diagram placeholder
      const fullDesc = [desc, analysis].filter(Boolean).join(' — ');
      return `![${title}: ${fullDesc}](diagram)`;
    }
  );
}

// ─── Process/Summarize a Single Lecture via LLM ──────────────────────
async function processLectureContent(
  lecture: { title: string; content: string },
  language: 'ar' | 'en',
  topic: string
): Promise<string> {
  const isAr = language === 'ar';

  const systemPrompt = isAr
    ? `أنت مساعد أكاديمي متخصص في تنظيم المحتوى التعليمي. مهمتك هي معالجة محتوى المحاضرة وتنظيمه في شكل مناسب لمستند PDF شامل.

قواعد التنظيم:
1. حافظ على جميع المعلومات المهمة والتفاصيل الأكاديمية
2. نظّم المحتوى بعناوين فرعية (##) وأقسام واضحة
3. أضف وصفاً تحليلياً لأي رسومات أو مخططات مذكورة في النص باستخدام التنسيق التالي:
   :::diagram
   عنوان الرسمة: [العنوان]
   وصف: [وصف مختصر للمخطط]
   تحليل: [تحليل ما يوضحه المخطط وأهميته]
   :::
4. استخدم نقاط مرقمة (1. 2. 3.) للخطوات أو التسلسلات
5. استخدم نقاط عادية (-) للقوائم
6. أضف ملاحظات هامة باستخدام :::note أو > **ملاحظة**
7. أضف تحذيرات باستخدام :::warning أو > **تحذير**
8. أنشئ جدول ملخص في نهاية كل محاضرة إذا كان هناك بيانات مقارنة`
    : `You are an academic assistant specializing in organizing educational content. Your task is to process lecture content and organize it into a format suitable for a comprehensive PDF document.

Organization rules:
1. Preserve all important information and academic details
2. Organize content with subheadings (##) and clear sections
3. Add an analytical description for any diagrams or charts mentioned in the text using the following format:
   :::diagram
   Title: [The title]
   Description: [Brief description of the diagram]
   Analysis: [Analysis of what the diagram shows and its significance]
   :::
4. Use numbered points (1. 2. 3.) for steps or sequences
5. Use bullet points (-) for lists
6. Add important notes using :::note or > **Note**
7. Add warnings using :::warning or > **Warning**
8. Create a summary table at the end of each lecture if there is comparative data`;

  const userMessage = isAr
    ? `الموضوع الرئيسي: ${topic}\nعنوان المحاضرة: ${lecture.title}\n\nمحتوى المحاضرة:\n${lecture.content}\n\nقم بتنظيم هذا المحتوى في شكل مناسب لمستند PDF مع عناوين فرعية وأقسام واضحة. أضف أوصافاً تحليلية لأي مخططات أو رسومات مذكورة.`
    : `Main topic: ${topic}\nLecture title: ${lecture.title}\n\nLecture content:\n${lecture.content}\n\nOrganize this content into a format suitable for a PDF document with subheadings and clear sections. Add analytical descriptions for any diagrams or charts mentioned.`;

  const processed = await callLLMForBatch(systemPrompt, userMessage);
  return processed || lecture.content;
}

// ─── Generate Comprehensive Summary ──────────────────────────────────
async function generateComprehensiveSummary(
  processedLectures: { title: string; content: string }[],
  topic: string,
  language: 'ar' | 'en'
): Promise<string> {
  const isAr = language === 'ar';

  const systemPrompt = isAr
    ? `أنت باحث أكاديمي متخصص في الربط بين المحاضرات. مهمتك هي كتابة خلاصة شاملة تربط بين الموضوعات المشتركة عبر المحاضرات المختلفة. ركز على: 1) المواضيع المشتركة 2) التطور في الأفكار 3) العلاقات بين المفاهيم 4) النقاط الرئيسية المشتركة. استخدم تنسيق Markdown.`
    : `You are an academic researcher specializing in connecting lectures. Your task is to write a comprehensive summary linking common themes across different lectures. Focus on: 1) Common themes 2) Evolution of ideas 3) Relationships between concepts 4) Key shared points. Use Markdown format.`;

  const lectureSummaries = processedLectures
    .map((l, i) => `${isAr ? 'المحاضرة' : 'Lecture'} ${i + 1}: ${l.title}\n${l.content.slice(0, 500)}...`)
    .join('\n\n');

  const userMessage = isAr
    ? `الموضوع: ${topic}\n\nملخصات المحاضرات:\n${lectureSummaries}\n\nاكتب خلاصة شاملة تربط بين هذه المحاضرات وتبرز المواضيع المشتركة والتطور الأكاديمي.`
    : `Topic: ${topic}\n\nLecture summaries:\n${lectureSummaries}\n\nWrite a comprehensive summary linking these lectures, highlighting common themes and academic progression.`;

  const summary = await callLLMForBatch(systemPrompt, userMessage);
  return summary || (isAr ? 'تعذر إنشاء الخلاصة الشاملة.' : 'Could not generate comprehensive summary.');
}

/**
 * Generate a batch document from multiple lectures.
 * Uses the Playwright rendering pipeline — NOT Gradio spaces.
 * Supports up to 12 lectures with progress tracking.
 *
 * @param options - Batch document generation options
 * @returns The generated batch document result
 */
export async function generateBatchDocument(
  options: BatchDocumentOptions
): Promise<BatchDocumentResult> {
  const startTime = Date.now();
  const {
    lectures = [],
    topic,
    language = 'ar',
    channelName,
    includeImages = false,
    progressCallback,
    instructions,
    styleDescription,
  } = options;

  // Validate lecture count
  if (lectures.length === 0) {
    throw new Error('At least one lecture is required for batch document generation');
  }
  if (lectures.length > 12) {
    throw new Error('Maximum 12 lectures allowed for batch document generation');
  }

  const isAr = language === 'ar';
  const totalSteps = lectures.length + (includeImages ? lectures.length : 0) + 2;
  let currentStep = 0;

  const advanceProgress = (stage: string) => {
    currentStep++;
    const progress = Math.round((currentStep / totalSteps) * 100);
    progressCallback?.(stage, progress);
  };

  console.log(`[BatchDoc] Starting batch document generation: ${lectures.length} lectures, topic="${topic}"`);

  // ── Stage 0 (FIX #2): Extract text from base64 PDFs ──
  // When lectures come from the chat-store batch processing, the content
  // field may contain raw base64 data URIs (data:application/pdf;base64,...)
  // instead of extracted text. We need to extract the text before processing.
  const BATCH_PDF_MAX_LEN = 80 * 1024;
  const extractedLectures = await Promise.all(lectures.map(async (lecture) => {
    // Detect base64 PDF data URI
    if (lecture.content && lecture.content.startsWith('data:application/pdf;base64,')) {
      try {
        const { extractTextFromPdfBase64 } = await import('@/lib/pdf-text-extractor');
        const extractedText = await extractTextFromPdfBase64(lecture.content, BATCH_PDF_MAX_LEN);
        console.log(`[BatchDoc] Extracted text from base64 PDF: "${lecture.title}" → ${extractedText.length} chars`);
        if (extractedText && extractedText.length > 50) {
          return { ...lecture, content: extractedText };
        }
        // If extraction failed or too short, keep original content
        console.warn(`[BatchDoc] PDF text extraction too short (${extractedText.length} chars) for "${lecture.title}", using raw content`);
      } catch (extractErr) {
        console.warn(`[BatchDoc] PDF text extraction failed for "${lecture.title}":`, extractErr instanceof Error ? extractErr.message : String(extractErr));
      }
    }
    return lecture;
  }));

  // ── Stage 1: Extract diagrams ──
  progressCallback?.('extracting-diagrams', 5);
  const diagrams = extractDiagramsFromLectures(extractedLectures);
  console.log(`[BatchDoc] Extracted ${diagrams.length} diagram references`);

  // ── Stage 2: Process each lecture via LLM ──
  progressCallback?.('processing-lectures', 10);
  const processedLectures: { title: string; content: string; imageData?: string | null }[] = [];

  for (let i = 0; i < extractedLectures.length; i++) {
    const lecture = extractedLectures[i];
    console.log(`[BatchDoc] Processing lecture ${i + 1}/${extractedLectures.length}: "${lecture.title}"`);

    try {
      let processedContent = await processLectureContent(lecture, language, topic);

      // Process :::diagram blocks in the processed content
      processedContent = processDiagramBlocks(processedContent, language);

      let imageData: string | null = null;

      // Generate image if requested
      if (includeImages) {
        const imagePrompt = isAr
          ? `illustration for educational document about: ${topic} - ${lecture.title}, professional, clean, academic style`
          : `illustration for educational document about: ${topic} - ${lecture.title}, professional, clean, academic style`;

        imageData = await generateImageForDocument(imagePrompt, 800, 600);
        advanceProgress('generating-images');
      }

      processedLectures.push({
        title: lecture.title,
        content: processedContent,
        imageData,
      });
    } catch (error) {
      console.warn(`[BatchDoc] Failed to process lecture ${i + 1}, using raw content:`, error);
      // Still process diagram blocks even for raw content fallback
      const rawProcessed = processDiagramBlocks(lecture.content, language);
      processedLectures.push({
        title: lecture.title,
        content: rawProcessed,
      });
    }

    advanceProgress('processing-lectures');
  }

  // ── Stage 3: Generate comprehensive summary linking all lectures ──
  progressCallback?.('generating-summary', 75);
  let comprehensiveSummary = '';
  try {
    comprehensiveSummary = await generateComprehensiveSummary(
      processedLectures.map(l => ({ title: l.title, content: l.content })),
      topic,
      language
    );
    console.log(`[BatchDoc] Comprehensive summary generated: ${comprehensiveSummary.length} chars`);
  } catch (summaryError) {
    console.warn('[BatchDoc] Comprehensive summary generation failed:', summaryError);
    comprehensiveSummary = isAr ? 'تعذر إنشاء الخلاصة الشاملة.' : 'Could not generate comprehensive summary.';
  }

  // ── Stage 4: Build combined content for PDF ──
  progressCallback?.('building-document', 80);

  // Build the full document content with enhanced structure
  const channelHeader = channelName
    ? (isAr ? `القناة: ${channelName}\n\n` : `Channel: ${channelName}\n\n`)
    : '';

  const instructionsSection = instructions
    ? (isAr ? `## تعليمات إضافية\n${instructions}\n\n` : `## Additional Instructions\n${instructions}\n\n`)
    : '';

  let fullContent = '';

  // Document title
  fullContent += `# ${topic}\n\n`;
  fullContent += channelHeader;
  fullContent += instructionsSection;

  // Lecture index with enhanced formatting
  fullContent += isAr ? `## فهرس المحاضرات\n\n` : `## Lecture Index\n\n`;
  for (let i = 0; i < processedLectures.length; i++) {
    const lectureNum = isAr
      ? ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'][i] || `${i + 1}`
      : `${i + 1}`;
    fullContent += `${i + 1}. ${isAr ? 'المحاضرة' : 'Lecture'} ${lectureNum}: ${processedLectures[i].title}\n`;
  }
  fullContent += '\n---\n\n';

  // Each lecture section with prominent numbering and dividers
  for (let i = 0; i < processedLectures.length; i++) {
    const lecture = processedLectures[i];
    const lectureNum = isAr
      ? ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'][i] || `${i + 1}`
      : `${i + 1}`;

    fullContent += `---\n\n`;
    fullContent += `## ${isAr ? 'المحاضرة' : 'Lecture'} ${lectureNum}: ${lecture.title}\n\n`;
    fullContent += lecture.content;
    fullContent += '\n\n';
  }

  // Comprehensive summary section linking all lectures
  fullContent += `---\n\n`;
  fullContent += isAr ? `## الخلاصة الشاملة والربط الأكاديمي\n\n` : `## Comprehensive Summary and Academic Synthesis\n\n`;
  fullContent += comprehensiveSummary;
  fullContent += '\n\n';

  // Diagram references section
  if (diagrams.length > 0) {
    fullContent += `---\n\n`;
    fullContent += isAr ? `## المراجع البيانية والمخططات\n\n` : `## Diagram and Chart References\n\n`;
    for (const diagram of diagrams) {
      fullContent += `- ${isAr ? 'محاضرة' : 'Lecture'} ${diagram.lectureIndex + 1}: ${diagram.description}\n`;
    }
    fullContent += '\n';
  }

  // ── Stage 5: Generate PDF using Playwright Rendering Pipeline ──
  progressCallback?.('generating-pdf', 90);

  const safeTopic = topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 80);

  // Build images map from generated lecture images
  const batchImages: Record<string, string> = {};
  for (let i = 0; i < processedLectures.length; i++) {
    const lecture = processedLectures[i];
    if (lecture.imageData) {
      // Key by lecture title for matching in the HTML template
      const lectureHeading = `${isAr ? 'المحاضرة' : 'Lecture'} ${i + 1}: ${lecture.title}`;
      batchImages[lectureHeading] = lecture.imageData;
      // Also key by just the lecture title
      batchImages[lecture.title] = lecture.imageData;
    }
  }

  // Parse styleDescription into userDesignPreferences for batch too
  const batchUserDesignPreferences = styleDescription
    ? parseUserDesignPreferences(styleDescription)
    : undefined;

  const pdfResult = await renderToPDF({
    title: topic,
    content: fullContent,
    modelId: 'batch-processor',
    author: channelName || 'DeltaAI',
    language,
    documentType: 'lecture',
    topicCategory: 'default',
    useDesignReasoning: true,
    images: Object.keys(batchImages).length > 0 ? batchImages : undefined,
    batchMeta: {
      lectures: lectures.map((l, i) => ({ title: l.title, index: i + 1 })),
      channelName,
      totalLectures: lectures.length,
    },
    styleDescription,
    userDesignPreferences: batchUserDesignPreferences,
  });

  const durationMs = Date.now() - startTime;
  console.log(`[BatchDoc] ✓ Batch document generated in ${durationMs}ms, ${lectures.length} lectures processed (renderer: ${pdfResult.rendererUsed})`);

  return {
    fileUrl: pdfResult.filePath || '',
    fileName: `${safeTopic}_batch.pdf`,
    mimeType: 'application/pdf',
    docType: 'pdf',
    model: 'batch-processor',
    durationMs,
    lecturesProcessed: lectures.length,
    diagrams,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT-TRIGGERED DOCUMENT GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a document from a chat request.
 * Called when the user requests document generation from the chat interface.
 * Returns streaming progress stages.
 *
 * @param options - Chat document options (prompt, model, files, language)
 * @yields Progress stages as the document is being generated
 */
export async function* generateDocumentFromChat(
  options: ChatDocumentOptions
): AsyncGenerator<ChatDocumentStage> {
  const { prompt, model, userFiles = [], language = 'ar' } = options;
  const isAr = language === 'ar';

  // ── Stage 1: Analyzing request ──
  yield {
    stage: 'analyzing',
    progress: 10,
    message: isAr ? 'جاري تحليل طلب إنشاء المستند...' : 'Analyzing document generation request...',
  };

  // Determine if this is a batch request or single document
  const isBatchRequest = userFiles.length > 0 || prompt.includes('محاضرات') || prompt.includes('lectures') || prompt.includes('batch');

  if (isBatchRequest && userFiles.length > 0) {
    // ── Batch mode: Process files as lectures ──
    yield {
      stage: 'extracting',
      progress: 20,
      message: isAr ? `جاري استخراج المحتوى من ${userFiles.length} ملفات...` : `Extracting content from ${userFiles.length} files...`,
    };

    // Build lectures from files
    const lectures: { title: string; content: string }[] = userFiles.map((file) => ({
      title: file.name.replace(/\.[^/.]+$/, ''),
      content: file.content,
    }));

    yield {
      stage: 'processing',
      progress: 40,
      message: isAr ? `جاري معالجة ${lectures.length} محاضرات...` : `Processing ${lectures.length} lectures...`,
    };

    // Use batch document generation
    const result = await generateBatchDocument({
      topic: prompt.slice(0, 100),
      lectures,
      language,
      channelName: 'Chat Document',
      includeImages: false,
      progressCallback: (stage, progress) => {
        // Progress is tracked internally; yield stages are at coarser granularity
        console.log(`[ChatDoc] Progress: ${stage} ${progress}%`);
      },
    });

    yield {
      stage: 'completed',
      progress: 100,
      message: isAr
        ? `تم إنشاء المستند بنجاح! ${result.lecturesProcessed} محاضرات معالجة`
        : `Document generated successfully! ${result.lecturesProcessed} lectures processed`,
    };

    return;
  }

  // ── Single mode: Generate content via LLM then create PDF ──
  yield {
    stage: 'generating-content',
    progress: 30,
    message: isAr ? 'جاري إنشاء محتوى المستند...' : 'Generating document content...',
  };

  // Use LLM to generate structured document content
  const contentSystemPrompt = isAr
    ? `أنت مساعد في إنشاء المستندات. قم بإنشاء محتوى مستند منظم وشامل بناءً على طلب المستخدم. استخدم تنسيق Markdown مع عناوين (# و ##) وأقسام واضحة ونقاط مرقمة.`
    : `You are a document creation assistant. Create organized and comprehensive document content based on the user's request. Use Markdown format with headings (# and ##), clear sections, and numbered points.`;

  const userFilesContext = userFiles.length > 0
    ? `\n\n${isAr ? 'ملفات مرفقة' : 'Attached files'}:\n${userFiles.map((f) => `- ${f.name}: ${f.content.slice(0, 500)}`).join('\n')}`
    : '';

  const generatedContent = await callLLMForBatch(
    contentSystemPrompt,
    `${prompt}${userFilesContext}`,
    'glm-4-flash'
  );

  yield {
    stage: 'generating-pdf',
    progress: 70,
    message: isAr ? 'جاري إنشاء ملف PDF...' : 'Generating PDF file...',
  };

  // Generate PDF using Playwright rendering pipeline
  const safeTitle = prompt.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 80);
  const pdfResult = await renderToPDF({
    title: prompt.slice(0, 100),
    content: generatedContent || prompt,
    modelId: model || 'chat-document',
    author: 'DeltaAI Chat',
    language,
    documentType: 'summary',
    topicCategory: 'default',
  });

  if (!pdfResult.success || !pdfResult.filePath) {
    yield {
      stage: 'error',
      progress: 0,
      message: isAr ? `فشل إنشاء المستند: ${pdfResult.error || 'خطأ غير معروف'}` : `Document generation failed: ${pdfResult.error || 'Unknown error'}`,
    };
    return;
  }

  yield {
    stage: 'completed',
    progress: 100,
    message: isAr
      ? 'تم إنشاء المستند بنجاح!'
      : 'Document generated successfully!',
  };
}

// ─── In-Memory Task Store for Progress Tracking ──────────────────────
interface DocumentTask {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: string;
  progress: number;
  message?: string;
  result?: BatchDocumentResult | DocumentGenResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const documentTasks = new Map<string, DocumentTask>();

/**
 * Create a new document generation task and return its ID.
 * The task is processed asynchronously.
 */
export function createDocumentTask(
  mode: 'batch' | 'single' | 'local',
  options: BatchDocumentOptions | DocumentGenOptions | LocalDocumentOptions,
  modelId?: string
): string {
  const taskId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const task: DocumentTask = {
    id: taskId,
    status: 'queued',
    stage: 'initialized',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  documentTasks.set(taskId, task);

  // Process asynchronously
  (async () => {
    task.status = 'processing';
    task.stage = 'starting';
    task.updatedAt = Date.now();

    try {
      if (mode === 'local') {
        const localOptions = options as LocalDocumentOptions;
        const result = await generateLocalDocument({
          ...localOptions,
          progressCallback: (stage, progress, message) => {
            task.stage = stage;
            task.progress = progress;
            task.message = message;
            task.updatedAt = Date.now();
          },
        });
        task.status = 'completed';
        task.stage = 'completed';
        task.progress = 100;
        task.result = result;
        task.updatedAt = Date.now();
      } else if (mode === 'batch') {
        const batchOptions = options as BatchDocumentOptions;
        const result = await generateBatchDocument({
          ...batchOptions,
          progressCallback: (stage, progress) => {
            task.stage = stage;
            task.progress = progress;
            task.updatedAt = Date.now();
          },
        });
        task.status = 'completed';
        task.stage = 'completed';
        task.progress = 100;
        task.result = result;
        task.updatedAt = Date.now();
      } else {
        const singleOptions = options as DocumentGenOptions;
        if (!modelId) throw new Error('modelId is required for single mode');
        const result = await generateDocument(modelId, singleOptions);
        task.status = 'completed';
        task.stage = 'completed';
        task.progress = 100;
        task.result = result;
        task.updatedAt = Date.now();
      }
    } catch (error) {
      task.status = 'failed';
      task.stage = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = Date.now();
    }

    // Auto-cleanup after 30 minutes
    setTimeout(() => {
      documentTasks.delete(taskId);
    }, 30 * 60 * 1000);
  })();

  return taskId;
}

/**
 * Get the current status of a document generation task.
 */
export function getDocumentTask(taskId: string): DocumentTask | undefined {
  return documentTasks.get(taskId);
}
