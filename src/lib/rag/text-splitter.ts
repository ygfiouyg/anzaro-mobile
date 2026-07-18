// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Smart Text Splitter for RAG
// ═══════════════════════════════════════════════════════════════════════
// Splits extracted text into semantic chunks suitable for embedding.
// Handles Arabic text properly — respects paragraph boundaries,
// lecture headers, and logical sections.
//
// This module is SERVER-SIDE ONLY.
// ═══════════════════════════════════════════════════════════════════════

export interface TextChunk {
  /** The chunk text content */
  content: string;
  /** 0-based index of this chunk within the source document */
  chunkIndex: number;
  /** Source file name */
  sourceFile: string;
  /** Character offset in the original text */
  startOffset: number;
  /** Character end offset in the original text */
  endOffset: number;
  /** Optional section header (nearest heading above this chunk) */
  sectionHeader?: string;
}

export interface SplitOptions {
  /** Maximum chunk size in characters (default: 1500) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 200) */
  overlap?: number;
  /** Minimum chunk size — smaller chunks are merged (default: 100) */
  minChunkSize?: number;
}

const DEFAULT_OPTIONS: Required<SplitOptions> = {
  maxChunkSize: 1500,
  overlap: 200,
  minChunkSize: 100,
};

/**
 * Detect section headers in text (Arabic + English).
 * Matches patterns like:
 *   - المحاضرة الأولى / المحاضرة 1
 *   - الفصل الأول / الفصل 1
 *   - Lecture 1 / Chapter 1
 *   - Lines starting with ## or ### (markdown headers)
 *   - Lines that are ALL CAPS or end with colon (common header patterns)
 */
function detectSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return null;

  // Markdown headers
  if (/^#{1,4}\s+/.test(trimmed)) {
    return trimmed.replace(/^#{1,4}\s+/, '').trim();
  }

  // Arabic lecture/chapter headers
  const arabicHeaderMatch = trimmed.match(
    /^(?:المحاضرة|محاضرة|الفصل|فصل|القسم|قسم|الوحدة|وحدة|الباب|باب|الدرس|درس|الموضوع|موضوع)\s+[\d\u0660-\u0669أإىاةآ]+/i
  );
  if (arabicHeaderMatch) return trimmed;

  // English lecture/chapter headers
  const englishHeaderMatch = trimmed.match(
    /^(?:Lecture|Chapter|Section|Unit|Lesson|Part|Module)\s+\d+/i
  );
  if (englishHeaderMatch) return trimmed;

  // Short lines that look like headers (less than 80 chars, no period at end)
  if (
    trimmed.length < 80 &&
    !trimmed.endsWith('.') &&
    !trimmed.endsWith('،') &&
    !trimmed.endsWith(',') &&
    !trimmed.endsWith(')')
  ) {
    // Check if it's mostly Arabic or starts with a capital letter (English)
    const arabicRatio = (trimmed.match(/[\u0600-\u06FF]/g) || []).length / trimmed.length;
    if (arabicRatio > 0.5 && trimmed.length > 5) return trimmed;
    if (/^[A-Z]/.test(trimmed) && trimmed.length > 5 && trimmed.length < 60) return trimmed;
  }

  return null;
}

/**
 * Split text into paragraphs, respecting natural boundaries.
 */
function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph breaks)
  // Also split on single newlines if followed by a header-like line
  const paragraphs: string[] = [];
  const rawParagraphs = text.split(/\n{2,}/);

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    // If paragraph is too long, split on single newlines
    if (trimmed.length > 3000) {
      const subParts = trimmed.split(/\n/);
      let currentSub = '';
      for (const sub of subParts) {
        if (currentSub.length + sub.length + 1 > 2000 && currentSub.length > 0) {
          paragraphs.push(currentSub.trim());
          currentSub = sub;
        } else {
          currentSub += (currentSub ? '\n' : '') + sub;
        }
      }
      if (currentSub.trim()) paragraphs.push(currentSub.trim());
    } else {
      paragraphs.push(trimmed);
    }
  }

  return paragraphs;
}

/**
 * Smart text splitter that produces semantically meaningful chunks.
 * Respects paragraph boundaries, section headers, and lecture structure.
 * Designed for Arabic academic content (lectures, notes, etc.).
 */
export function splitTextIntoChunks(
  text: string,
  sourceFile: string,
  options?: SplitOptions,
): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: TextChunk[] = [];
  const paragraphs = splitIntoParagraphs(text);

  let currentChunk = '';
  let currentHeader: string | undefined;
  let chunkStartOffset = 0;
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Check if this paragraph is a section header
    const header = detectSectionHeader(para);
    if (header) {
      // If we have accumulated content, save it as a chunk
      if (currentChunk.length >= opts.minChunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex,
          sourceFile,
          startOffset: chunkStartOffset,
          endOffset: chunkStartOffset + currentChunk.length,
          sectionHeader: currentHeader,
        });
        chunkIndex++;
      }

      // Start new chunk with the header
      currentHeader = header;
      currentChunk = para + '\n';
      chunkStartOffset = text.indexOf(para);
      continue;
    }

    // Check if adding this paragraph would exceed max chunk size
    if (currentChunk.length + para.length + 1 > opts.maxChunkSize && currentChunk.length >= opts.minChunkSize) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex,
        sourceFile,
        startOffset: chunkStartOffset,
        endOffset: chunkStartOffset + currentChunk.length,
        sectionHeader: currentHeader,
      });
      chunkIndex++;

      // Start new chunk with overlap
      // Include the last portion of the previous chunk for context
      const overlapText = currentChunk.length > opts.overlap
        ? currentChunk.slice(-opts.overlap)
        : currentChunk;
      currentChunk = overlapText + '\n' + para + '\n';
      chunkStartOffset = Math.max(0, chunkStartOffset + currentChunk.length - para.length - opts.overlap);
    } else {
      currentChunk += para + '\n';
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= opts.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      sourceFile,
      startOffset: chunkStartOffset,
      endOffset: chunkStartOffset + currentChunk.length,
      sectionHeader: currentHeader,
    });
  } else if (currentChunk.trim().length > 0 && chunks.length > 0) {
    // Merge small trailing chunk with the previous one
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.content += '\n' + currentChunk.trim();
    lastChunk.endOffset = chunkStartOffset + currentChunk.length;
  }

  console.log(`[RAG-Splitter] Split "${sourceFile}" into ${chunks.length} chunks (avg: ${Math.round(chunks.reduce((s, c) => s + c.content.length, 0) / (chunks.length || 1))} chars)`);

  return chunks;
}
