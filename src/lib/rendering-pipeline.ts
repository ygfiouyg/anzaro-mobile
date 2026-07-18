/**
 * Rendering Pipeline — Playwright-Only PDF Rendering Orchestrator
 *
 * Orchestrates the full rendering flow:
 *   Content → Design Reasoning → HTML Template → Playwright PDF → Output
 *
 * PDFKit has been removed — Playwright (Chromium) is the sole renderer.
 *
 * Task ID: 6
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateDesignReasoning, type DesignReasoningBlock, type ChartSpec } from './design-reasoning';
import { generateHTMLTemplate } from './html-template-generator';
import { renderHTMLToPDF, isPlaywrightAvailable, closeBrowser } from './playwright-renderer';
import { detectTopicCategory, type TopicCategory, type ThemePalette } from './dynamic-themes';
import { generateUniquePalette, type DesignPreferences } from './unique-palette-generator';

// ─── Types ────────────────────────────────────────────────────────────────

export interface BatchMeta {
  /** List of lectures with titles and indices */
  lectures: { title: string; index: number }[];
  /** Channel name for the document */
  channelName?: string;
  /** Total number of lectures */
  totalLectures: number;
}

export interface RenderingRequest {
  content: string;
  title: string;
  author?: string;
  language?: 'ar' | 'en';
  modelId?: string;
  useDesignReasoning?: boolean;
  chartSpecs?: ChartSpec[];
  /** Document type for styling */
  documentType?: 'lecture' | 'summary' | 'research' | 'notes';
  /** Topic category override */
  topicCategory?: TopicCategory;
  /** User theme customization overrides */
  themeOverrides?: {
    primaryColor?: string;
    secondaryColor?: string;
    bgColor?: string;
    fontFamily?: string;
  };
  /** Map of image keys to base64 data URIs for embedding */
  images?: Record<string, string>;
  /** Batch metadata for multi-lecture documents */
  batchMeta?: BatchMeta;
  /** User-specified color preference (e.g. "أحمر", "red", "ذهبي") */
  userColorPreference?: string;
  /** User design preferences (color, style) detected from the message */
  userDesignPreferences?: DesignPreferences;
  // designTemplateId REMOVED — AI-driven design is the ONLY path, no fixed templates
  /** User's free-text style description for AI-powered dynamic design */
  styleDescription?: string;
}

export interface RenderingResult {
  success: boolean;
  pdfBuffer?: Buffer;
  filePath?: string;
  fileSize?: number;
  designReasoning?: DesignReasoningBlock;
  rendererUsed: 'playwright';
  duration: number;
  error?: string;
}

// ─── Pipeline Implementation ──────────────────────────────────────────────

/**
 * Render content to PDF using the Playwright-only pipeline.
 *
 * Flow:
 * 1. If useDesignReasoning: Call the design reasoning service
 * 2. Generate HTML from content + design reasoning
 * 3. Render HTML to PDF via Playwright (Chromium)
 * 4. Save the file and return result
 */
export async function renderToPDF(request: RenderingRequest): Promise<RenderingResult> {
  const startTime = Date.now();

  const {
    content,
    title,
    author,
    language = 'ar',
    modelId,
    useDesignReasoning = true, // DEFAULT: always use LLM design reasoning (was false)
    chartSpecs,
    documentType = 'summary',
    topicCategory,
    themeOverrides,
    images,
    batchMeta,
    userColorPreference,
    userDesignPreferences,
    styleDescription,
  } = request;

  try {
    // ─── Step 1: Design Reasoning ────────────────
    // AI-driven design reasoning is ALWAYS used.
    // The LLM analyzes content and styleDescription to create
    // a unique visual identity. No fixed templates.
    let designReasoning: DesignReasoningBlock | undefined;

    if (useDesignReasoning) {
      try {
        designReasoning = await generateDesignReasoning({
          content,
          model: modelId,
          language,
          userPreferences: userDesignPreferences,
          styleDescription,
        });
        console.log('[Rendering Pipeline] AI design reasoning completed successfully');
      } catch (drError) {
        console.error('[Rendering Pipeline] Design reasoning failed, using dynamic palette fallback:', drError);
        // Continue without design reasoning — dynamic palette CSS will be used as fallback
      }
    }

    // ─── Step 2: Generate HTML Template ──────────
    // Detect topic category from content if not explicitly provided
    const detectedCategory = topicCategory || detectTopicCategory(content, title);

    let html: string;
    try {
      html = generateHTMLTemplate({
        content,
        title,
        author,
        language,
        modelId,
        designReasoning,
        chartSpecs,
        documentType,
        images,
        batchMeta,
        topicCategory: detectedCategory,
        userColorPreference,
        userDesignPreferences,
        styleDescription,
      });
    } catch (htmlError) {
      console.error('[Rendering Pipeline] HTML template generation failed:', htmlError);
      // Fallback to simple HTML
      html = generateSimpleHTML(content, title, author, language, generateUniquePalette(content || 'default', userColorPreference));
    }

    // ─── Step 3: Playwright Rendering ────────────
    let playwrightAvailable = false;
    try {
      playwrightAvailable = await isPlaywrightAvailable();
    } catch (pwCheckError) {
      console.error('[Rendering Pipeline] Playwright availability check failed:', pwCheckError);
    }

    if (!playwrightAvailable) {
      // Try to generate a simple HTML file as fallback
      console.warn('[Rendering Pipeline] Playwright not available, generating HTML fallback');
      try {
        const downloadDir = join(process.cwd(), 'download');
        if (!existsSync(downloadDir)) {
          mkdirSync(downloadDir, { recursive: true });
        }
        const outputPath = join(downloadDir, `${randomUUID()}.html`);
        writeFileSync(outputPath, html);
        return {
          success: true,
          filePath: outputPath,
          rendererUsed: 'playwright',
          duration: Date.now() - startTime,
          error: 'Playwright unavailable, generated HTML fallback instead of PDF',
        };
      } catch (fallbackError) {
        return {
          success: false,
          rendererUsed: 'playwright',
          duration: Date.now() - startTime,
          error: `Playwright is not available and HTML fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        };
      }
    }

    const result = await renderHTMLToPDF({
      html,
      title,
      language,
      pageSize: 'A4',
      margins: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      designReasoning,
    });

    if (!result.success || !result.pdfBuffer) {
      return {
        success: false,
        rendererUsed: 'playwright',
        duration: Date.now() - startTime,
        error: result.error || 'Playwright rendering failed',
      };
    }

    const pdfBuffer = result.pdfBuffer;
    console.log(`[Rendering Pipeline] Playwright rendering succeeded in ${result.duration}ms`);

    // ─── Step 4: Save PDF Buffer to File ─────────
    const downloadDir = join(process.cwd(), 'download');
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true });
    }

    const outputPath = join(downloadDir, `${randomUUID()}.pdf`);
    writeFileSync(outputPath, pdfBuffer);

    return {
      success: true,
      // FIX L4: Don't return pdfBuffer — it's already written to disk and
      // holding it in memory prevents GC. The caller only needs filePath.
      // pdfBuffer is still returned for backward compatibility but should
      // be avoided in new code. Set to empty buffer to free memory.
      pdfBuffer: Buffer.alloc(0),
      filePath: outputPath,
      fileSize: pdfBuffer.length,
      designReasoning,
      rendererUsed: 'playwright',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      rendererUsed: 'playwright',
      duration: Date.now() - startTime,
      error: `Pipeline error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate a simple HTML document as a fallback when the template generator fails.
 */
function generateSimpleHTML(
  content: string,
  title: string,
  author?: string,
  language: 'ar' | 'en' = 'ar',
  palette?: ThemePalette,
): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  // Use provided palette or generate a default one from content
  const p = palette || generateUniquePalette(content || 'default');

  // Basic markdown-to-HTML conversion
  let htmlContent = content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf') format('truetype');
      font-weight: 700;
    }
    body {
      font-family: 'Cairo', sans-serif;
      direction: ${dir};
      text-align: ${isRTL ? 'right' : 'left'};
      padding: 40px;
      line-height: 1.8;
      font-size: 13px;
      color: ${p.text};
    }
    h1 { font-size: 24px; font-weight: 700; margin: 20px 0 10px; color: ${p.primary}; }
    h2 { font-size: 18px; font-weight: 700; margin: 16px 0 8px; color: ${p.primary}; }
    h3 { font-size: 15px; font-weight: 700; margin: 12px 0 6px; color: ${p.secondary}; }
    li { margin: 4px 0; margin-${isRTL ? 'right' : 'left'}: 20px; }
    strong { font-weight: 700; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${author ? `<p style="color:${p.textMuted}; font-size:11px;">${author}</p>` : ''}
  <hr style="margin: 16px 0; border: none; border-top: 2px solid ${p.primary};">
  <p>${htmlContent}</p>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid ${p.border};">
  <p style="text-align: center; color: ${p.textMuted}; font-size: 10px;">DeltaAI | بعقل هادي</p>
</body>
</html>`;
}

/**
 * Check if the Playwright renderer is available.
 */
export async function checkRendererAvailability(): Promise<{
  playwright: boolean;
}> {
  const playwright = await isPlaywrightAvailable().catch(() => false);
  return { playwright };
}

/**
 * Clean up resources — call on process shutdown.
 */
export async function cleanupRenderingPipeline(): Promise<void> {
  await closeBrowser();
}
