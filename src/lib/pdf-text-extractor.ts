/**
 * DeltaAI PDF Text Extractor — Shared Utility
 *
 * Extracts text content from PDF files using a multi-strategy approach:
 *   1. Primary:   unpdf (fast, works in Node.js without DOM APIs)
 *   2. Fallback:  pdf2json (reliable for most PDFs)
 *   3. Last resort: Regex extraction from raw buffer (unreliable but sometimes works)
 *   4. VLM:       Vision Language Model reads PDF visually (scanned docs, charts, tables)
 *
 * When VLM is enabled, both text extraction AND VLM visual analysis are combined
 * for the most comprehensive extraction with zero data loss.
 *
 * This is the single source of truth for PDF text extraction.
 * Used by:
 *   - parallel-agent-engine.ts (file content extraction for agent analysis)
 *   - stream route (chat with PDF attachments)
 *   - batch-processor.ts (batch file analysis)
 */

import { traceAPI, traceError } from '@/lib/trace-logger';

// ─── Configuration ─────────────────────────────────────────────────────

/** Default maximum text length to return (50 KB) */
const DEFAULT_MAX_LEN = 50 * 1024;

/** Timeout for pdf2json parsing (15 seconds) */
const PDF2JSON_TIMEOUT_MS = 15_000;

// ─── Main Export ───────────────────────────────────────────────────────

/**
 * Extract text from a PDF file provided as a base64 data URL.
 *
 * @param base64DataUrl - PDF content as a data URL (data:application/pdf;base64,...)
 *                        or raw base64 string
 * @param maxLen - Maximum text length to return (default: 50KB)
 * @returns Extracted text content, or an Arabic error message if extraction fails
 */
export async function extractTextFromPdfBase64(
  base64DataUrl: string,
  maxLen: number = DEFAULT_MAX_LEN
): Promise<string> {
  try {
    // Extract the base64 part from data URL
    const base64Part = base64DataUrl.includes(',')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;
    if (!base64Part) return '';

    const buffer = Buffer.from(base64Part, 'base64');

    // ── Strategy 1: unpdf (works in Node.js without DOM APIs) ──
    try {
      const { extractText } = await import('unpdf');
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const result = await extractText(uint8);
      if (result && result.text && Array.isArray(result.text)) {
        const combined = result.text.join('\n\n').trim();
        if (combined.length > 0) {
          traceAPI(`[PDF] unpdf extracted ${combined.length} chars`);
          return truncateText(combined, maxLen);
        }
      } else if (result && typeof result === 'string' && (result as string).trim().length > 0) {
        const text = (result as string).trim();
        traceAPI(`[PDF] unpdf extracted ${text.length} chars (string)`);
        return truncateText(text, maxLen);
      }
    } catch (unpdfError) {
      traceError(`[PDF] unpdf failed: ${unpdfError instanceof Error ? unpdfError.message : String(unpdfError)}`);
    }

    // ── Strategy 2: pdf2json ──
    try {
      const PDFParser = (await import('pdf2json')).default;
      const parser = new PDFParser();
      const text = await new Promise<string>((resolve, reject) => {
        parser.on('pdfParser_dataReady', (pdfData: any) => {
          try {
            const pageTexts: string[] = [];
            for (const page of (pdfData.Pages || [])) {
              const pageText = (page.Texts || [])
                .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || '')).join(''))
                .join(' ');
              if (pageText.trim()) pageTexts.push(pageText.trim());
            }
            resolve(pageTexts.join('\n\n'));
          } catch (e) {
            reject(e);
          }
        });
        parser.on('pdfParser_dataError', (errData: any) => {
          reject(new Error(errData?.parserError || 'pdf2json parse error'));
        });
        parser.parseBuffer(buffer);
        setTimeout(() => reject(new Error('pdf2json timeout')), PDF2JSON_TIMEOUT_MS);
      });
      if (text.trim().length > 0) {
        traceAPI(`[PDF] pdf2json extracted ${text.length} chars`);
        return truncateText(text.trim(), maxLen);
      }
    } catch (pdf2jsonError) {
      traceError(`[PDF] pdf2json failed: ${pdf2jsonError instanceof Error ? pdf2jsonError.message : String(pdf2jsonError)}`);
    }

    // ── Strategy 3: Basic regex (last resort, unreliable) ──
    const rawText = buffer.toString('latin1');
    const extractedTexts: string[] = [];

    // Match (text) Tj patterns
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(rawText)) !== null) {
      const extracted = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (extracted.trim()) {
        extractedTexts.push(extracted);
      }
    }

    // Match [(text)] TJ array patterns
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    while ((match = tjArrayRegex.exec(rawText)) !== null) {
      const arrayContent = match[1];
      const stringParts = arrayContent.match(/\(([^)]*)\)/g);
      if (stringParts) {
        const combined = stringParts
          .map((s) => s.slice(1, -1))
          .join('');
        if (combined.trim()) {
          extractedTexts.push(combined);
        }
      }
    }

    const allText = extractedTexts.join(' ').trim();

    // Detect garbled text: non-ASCII corrupted by latin1 encoding
    if (allText.length > 0) {
      const printableRatio = allText.replace(/[\x00-\x1F\x7F-\xFF]/g, '').length / allText.length;
      if (printableRatio < 0.5) {
        traceError(`[PDF] Regex extraction produced garbled text (printable ratio: ${printableRatio.toFixed(2)})`);
        return '[لم يتم استخراج نص PDF بشكل صحيح. يرجى استخدام ملف DOCX أو نص عادي للحصول على نتائج أفضل.]';
      }
      traceAPI(`[PDF] Regex extracted ${allText.length} chars (last resort)`);
      return truncateText(allText, maxLen);
    }

    traceError(`[PDF] All extraction strategies failed — no text found`);
    return '[لم يتم استخراج نص من ملف PDF. قد يكون الملف يحتوي على صور أو تنسيق معقد.]';
  } catch (error) {
    traceError(`[PDF] Fatal error extracting text: ${error instanceof Error ? error.message : String(error)}`);
    return '[حدث خطأ أثناء استخراج نص PDF]';
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Truncate text to maxLen and add a truncation notice if needed.
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length > maxLen) {
    return text.slice(0, maxLen) + '\n\n[... تم اقتطاع المحتوى]';
  }
  return text;
}

/**
 * Check if a file is a PDF based on MIME type or file extension.
 */
export function isPdfFile(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return mime === 'application/pdf' || ext === 'pdf';
}

// ─── VLM-Based PDF Extraction ─────────────────────────────────────────

/**
 * Extract PDF content using VLM (Vision Language Model).
 * VLM reads the PDF visually, handling scanned documents, charts, tables,
 * images, and layouts that text-based extraction cannot handle.
 *
 * Uses file_url content type to pass the PDF directly to the VLM.
 */
export async function extractPdfWithVLM(
  base64DataUrl: string,
  fileName: string = 'document.pdf'
): Promise<{ text: string; success: boolean }> {
  try {
    // Ensure proper data URL format
    let pdfDataUrl = base64DataUrl;
    if (!base64DataUrl.startsWith('data:')) {
      pdfDataUrl = `data:application/pdf;base64,${base64DataUrl}`;
    }

    // Get ZAI client (shared singleton from chat-utils)
    const { getZAIClient } = await import('@/lib/chat-utils');
    const zai = await getZAIClient();

    traceAPI(`[PDF-VLM] Starting VLM analysis of "${fileName}"`);

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are analyzing a PDF document named "${fileName}". Please extract ALL content from this document thoroughly:

1. Read and transcribe ALL text in the document exactly as written
2. Describe any images, charts, diagrams, or visual elements in detail
3. Extract any data from tables including headers and all rows
4. Note the document structure (headings, sections, pages)
5. For scanned or image-based content, perform OCR and transcribe everything
6. Preserve numbers, dates, and specific data points exactly

Be extremely thorough - do not skip or summarize any content. Every piece of information matters.`,
            },
            {
              type: 'file_url',
              file_url: { url: pdfDataUrl },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const vlmText = response.choices?.[0]?.message?.content || '';
    if (vlmText.trim()) {
      traceAPI(`[PDF-VLM] VLM extracted ${vlmText.length} chars from "${fileName}"`);
      return { text: vlmText.trim(), success: true };
    }

    traceError(`[PDF-VLM] VLM returned empty content for "${fileName}"`);
    return { text: '', success: false };
  } catch (error) {
    traceError(`[PDF-VLM] VLM analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return { text: '', success: false };
  }
}

/**
 * Extract PDF content using BOTH text extraction AND VLM visual analysis.
 * Combines both results for the most comprehensive extraction with zero data loss.
 *
 * @param base64DataUrl - PDF content as a data URL or raw base64 string
 * @param fileName - Name of the PDF file (for VLM context)
 * @param maxLen - Maximum text length to return (default: 50KB)
 * @param enableVlm - Whether to also use VLM for visual analysis (default: true)
 * @returns Combined text extraction + VLM analysis
 */
export async function extractPdfWithVlmAndText(
  base64DataUrl: string,
  fileName: string = 'document.pdf',
  maxLen: number = DEFAULT_MAX_LEN,
  enableVlm: boolean = true
): Promise<string> {
  // Step 1: Extract text using existing strategies
  const textContent = await extractTextFromPdfBase64(base64DataUrl, maxLen);

  // Step 2: If VLM is enabled and file is reasonable size, also analyze with VLM
  if (enableVlm) {
    try {
      const base64Part = base64DataUrl.includes(',')
        ? base64DataUrl.split(',')[1]
        : base64DataUrl;
      const buffer = Buffer.from(base64Part, 'base64');
      const fileSizeMB = buffer.length / (1024 * 1024);

      // Only use VLM for files up to 20MB to avoid timeout
      if (fileSizeMB <= 20) {
        const vlmResult = await extractPdfWithVLM(base64DataUrl, fileName);

        if (vlmResult.success && vlmResult.text) {
          // Combine both extractions
          const parts: string[] = [];

          if (textContent && !textContent.startsWith('[')) {
            parts.push(`[استخراج النص]\n${textContent}`);
          }

          parts.push(`[تحليل VLM البصري]\n${vlmResult.text}`);

          const combined = parts.join('\n\n');
          traceAPI(`[PDF-VLM] Combined extraction: ${combined.length} chars (text + VLM)`);
          return truncateText(combined, maxLen * 2); // Allow more space for combined content
        }
      } else {
        traceAPI(`[PDF-VLM] Skipping VLM for large file (${fileSizeMB.toFixed(1)}MB > 20MB limit)`);
      }
    } catch (vlmError) {
      traceError(`[PDF-VLM] VLM failed, using text-only: ${vlmError instanceof Error ? vlmError.message : String(vlmError)}`);
    }
  }

  // Fallback: text-only extraction
  return textContent;
}

// ─── DOCX Extraction ──────────────────────────────────────────────────

/**
 * Extract text content from a DOCX (Word) file provided as a base64 data URL or raw base64.
 *
 * Uses the `mammoth` library (already a project dependency) to extract raw text
 * from .docx files. This complements the existing PDF/TXT extraction pipeline
 * so users can upload Word documents directly.
 *
 * @param base64DataUrl - DOCX content as a data URL (data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,...)
 *                        or raw base64 string
 * @param maxLen - Maximum text length to return (default: 50KB)
 * @returns Extracted text content, or an empty string if extraction fails
 */
export async function extractTextFromDocxBase64(
  base64DataUrl: string,
  maxLen: number = DEFAULT_MAX_LEN
): Promise<string> {
  try {
    const base64Part = base64DataUrl.includes(',')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;
    if (!base64Part) return '';

    const buffer = Buffer.from(base64Part, 'base64');

    // mammoth is a dynamic import to avoid loading it when not needed
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    const text = (result?.value || '').trim();
    if (text.length > 0) {
      traceAPI(`[DOCX] mammoth extracted ${text.length} chars`);
      return truncateText(text, maxLen);
    }

    traceError('[DOCX] mammoth returned empty content');
    return '';
  } catch (error) {
    traceError(`[DOCX] mammoth failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

/**
 * Unified text extraction entry point.
 * Detects file type from the data URL MIME prefix and dispatches to the
 * appropriate extractor (PDF / DOCX / raw text).
 *
 * This is a convenience wrapper for callers that handle mixed file types.
 *
 * @param base64DataUrl - File content as a data URL
 * @param fileName - File name (used for VLM context on PDFs)
 * @param maxLen - Maximum text length to return (default: 50KB)
 * @returns Extracted text content
 */
export async function extractTextFromAnyBase64(
  base64DataUrl: string,
  fileName: string = 'document',
  maxLen: number = DEFAULT_MAX_LEN
): Promise<string> {
  const lower = base64DataUrl.toLowerCase();

  if (lower.startsWith('data:application/pdf') || fileName.toLowerCase().endsWith('.pdf')) {
    return extractTextFromPdfBase64(base64DataUrl, maxLen);
  }

  if (
    lower.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
    fileName.toLowerCase().endsWith('.docx')
  ) {
    return extractTextFromDocxBase64(base64DataUrl, maxLen);
  }

  // For plain text data URLs, strip the prefix and decode
  if (lower.startsWith('data:text/')) {
    const commaIdx = base64DataUrl.indexOf(',');
    if (commaIdx === -1) return '';
    const payload = base64DataUrl.slice(commaIdx + 1);
    // If base64-encoded
    if (base64DataUrl.slice(0, commaIdx).includes(';base64')) {
      try {
        return truncateText(Buffer.from(payload, 'base64').toString('utf-8'), maxLen);
      } catch {
        return '';
      }
    }
    return truncateText(decodeURIComponent(payload), maxLen);
  }

  return '';
}
