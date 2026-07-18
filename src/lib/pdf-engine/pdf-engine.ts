/**
 * PDF Engine v5.0 — Playwright-Only PDF Generation
 *
 * Generates PDFs using the Playwright-based rendering pipeline.
 * No longer spawns subprocesses — all rendering is done in-process
 * via Chromium (Playwright) for consistent, high-quality output.
 *
 * PDFKit has been completely removed.
 *
 * Task ID: 4
 */

import { statSync } from 'fs';
import type { UserThemeOverrides, TopicCategory } from './utils';
import type { DesignReasoningBlock } from '../design-reasoning';
import { renderToPDF } from '../rendering-pipeline';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PDFGenerationOptions {
  title: string;
  content: string;
  modelId: string;
  author?: string;
  language?: string;
  category?: string;
  /** User theme customization overrides */
  themeOverrides?: Partial<UserThemeOverrides>;
  /** Document type for styling */
  documentType?: 'lecture' | 'summary' | 'research' | 'notes';
  /** Force a specific topic category */
  topicCategory?: TopicCategory;
  /** Design Reasoning Block — when provided, overrides static theme system */
  designReasoning?: DesignReasoningBlock;
  /** Channel name displayed on cover page and footer (default: "بعقل هادي") */
  channelName?: string;
}

export interface PDFGenerationResult {
  success: boolean;
  filePath?: string;
  size?: number;
  error?: string;
}

// ─── PDF Generation ───────────────────────────────────────────────────────

/**
 * Generate a PDF document using the Playwright rendering pipeline.
 *
 * This function delegates to the rendering pipeline which:
 * 1. Optionally generates design reasoning (if not provided)
 * 2. Creates an HTML template from content
 * 3. Renders HTML to PDF via Playwright (Chromium)
 * 4. Saves the PDF to the download directory
 *
 * @param options - PDF generation options
 * @returns Result with file path and size on success, or error on failure
 */
export async function generatePDF(options: PDFGenerationOptions): Promise<PDFGenerationResult> {
  const {
    title,
    content,
    modelId,
    author,
    language = 'ar',
    documentType = 'summary',
    topicCategory,
    themeOverrides,
    designReasoning,
  } = options;

  try {
    // Use the rendering pipeline — it handles everything:
    // Design reasoning (if not provided), HTML generation, Playwright rendering, file saving
    const result = await renderToPDF({
      content,
      title,
      author,
      language: language as 'ar' | 'en',
      modelId,
      useDesignReasoning: !!designReasoning, // If DR already provided, we pass it in; otherwise let pipeline generate
      chartSpecs: designReasoning?.chartSpecs,
      documentType,
      topicCategory,
      themeOverrides: themeOverrides ? {
        primaryColor: themeOverrides.primaryColor,
        secondaryColor: themeOverrides.secondaryColor,
        bgColor: themeOverrides.bgColor,
        fontFamily: themeOverrides.fontFamily,
      } : undefined,
    });

    if (!result.success || !result.filePath) {
      return {
        success: false,
        error: result.error || 'PDF generation failed',
      };
    }

    // Get file size — prefer fileSize from result, fall back to statSync
    let fileSize = 0;
    if ((result as any).fileSize) {
      fileSize = (result as any).fileSize;
    } else {
      try {
        fileSize = statSync(result.filePath).size;
      } catch {
        fileSize = result.pdfBuffer?.length || 0;
      }
    }

    return {
      success: true,
      filePath: result.filePath,
      size: fileSize,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
