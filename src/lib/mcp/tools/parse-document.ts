/**
 * Tool: parse_document (In-Chat RAG / Document Parsing)
 * ======================================================
 * Stateless document parsing + keyword-based retrieval.
 * No vector DB, no embeddings — just parse → chunk → match → inject.
 *
 * For documents <100 pages, keyword search is FASTER and more accurate
 * than vector embeddings. Add embeddings only for >100 documents.
 */

import type { MCPTool, MCPToolResult } from "../types";

// ═══════════════════════════════════════════════════════════════════════
// Document Parsing (multi-format)
// ═══════════════════════════════════════════════════════════════════════

interface ParsedDocument {
  text: string;
  pages: number;
  format: string;
  metadata: Record<string, unknown>;
}

async function parseFile(
  fileUrl: string,
  mimeType?: string
): Promise<ParsedDocument> {
  // Fetch the file
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const blob = await response.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const type = mimeType || blob.type || response.headers.get('content-type') || '';

  // ── Plain text ──
  if (type.includes('text/plain') || fileUrl.endsWith('.txt')) {
    return {
      text: buffer.toString('utf-8'),
      pages: 1,
      format: 'txt',
      metadata: { size: buffer.length },
    };
  }

  // ── Markdown ──
  if (type.includes('markdown') || fileUrl.endsWith('.md')) {
    return {
      text: buffer.toString('utf-8'),
      pages: 1,
      format: 'markdown',
      metadata: { size: buffer.length },
    };
  }

  // ── JSON ──
  if (type.includes('json') || fileUrl.endsWith('.json')) {
    const json = JSON.parse(buffer.toString('utf-8'));
    return {
      text: JSON.stringify(json, null, 2),
      pages: 1,
      format: 'json',
      metadata: { size: buffer.length, keys: Object.keys(json).length },
    };
  }

  // ── CSV ──
  if (type.includes('csv') || fileUrl.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n');
    return {
      text,
      pages: 1,
      format: 'csv',
      metadata: { rows: lines.length - 1, columns: lines[0]?.split(',').length || 0 },
    };
  }

  // ── PDF (requires pdf-parse) ──
  if (type.includes('pdf') || fileUrl.endsWith('.pdf')) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return {
        text: data.text,
        pages: data.numpages,
        format: 'pdf',
        metadata: {
          size: buffer.length,
          info: data.info,
        },
      };
    } catch {
      throw new Error('PDF parsing failed. Install pdf-parse: npm install pdf-parse');
    }
  }

  // ── DOCX (requires mammoth) ──
  if (type.includes('word') || fileUrl.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer });
      return {
        text: result.value,
        pages: 1,
        format: 'docx',
        metadata: { size: buffer.length },
      };
    } catch {
      throw new Error('DOCX parsing failed. Install mammoth: npm install mammoth');
    }
  }

  // ── Image (OCR via vision model) ──
  if (type.startsWith('image/')) {
    const { getZAIClient } = await import('@/lib/zai-client');
    const zai = await getZAIClient();
    const base64 = buffer.toString('base64');
    const dataUri = `data:${type};base64,${base64}`;

    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract ALL text from this image. Return ONLY the text, preserving layout.' },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    } as any);

    return {
      text: completion.choices?.[0]?.message?.content || '',
      pages: 1,
      format: 'image-ocr',
      metadata: { size: buffer.length, mimeType: type },
    };
  }

  // ── Fallback: try as text ──
  try {
    return {
      text: buffer.toString('utf-8'),
      pages: 1,
      format: 'unknown',
      metadata: { size: buffer.length, mimeType: type },
    };
  } catch {
    throw new Error(`Unsupported file format: ${type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Chunking — split text into manageable pieces
// ═══════════════════════════════════════════════════════════════════════

interface Chunk {
  index: number;
  text: string;
  page?: number;
  score?: number;
}

function chunkText(text: string, maxChunkSize = 1500, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  const sentences = text.split(/(?<=[.!?؟。\n])\s+/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
      chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
      // Overlap: keep last `overlap` chars
      currentChunk = currentChunk.slice(-overlap) + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
  }

  return chunks;
}

// ═══════════════════════════════════════════════════════════════════════
// Keyword-based retrieval (BM25-lite)
// ═══════════════════════════════════════════════════════════════════════

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function scoreChunk(chunk: Chunk, queryTokens: string[]): number {
  const chunkTokens = tokenize(chunk.text);
  const chunkTokenSet = new Set(chunkTokens);
  let score = 0;

  for (const qt of queryTokens) {
    // Exact match
    if (chunkTokenSet.has(qt)) {
      score += 3;
    }
    // Partial match (substring)
    else if (chunkTokens.some(ct => ct.includes(qt) || qt.includes(ct))) {
      score += 1;
    }
  }

  // Boost: if multiple query tokens in same chunk
  const uniqueMatches = new Set(queryTokens.filter(qt => chunkTokenSet.has(qt)));
  if (uniqueMatches.size > 1) {
    score += uniqueMatches.size * 2;
  }

  return score;
}

function retrieveRelevantChunks(chunks: Chunk[], query: string, topK = 5): Chunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map(chunk => ({
    ...chunk,
    score: scoreChunk(chunk, queryTokens),
  }));

  return scored
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}

// ═══════════════════════════════════════════════════════════════════════
// THE TOOL
// ═══════════════════════════════════════════════════════════════════════

export const parseDocumentTool: MCPTool = {
  name: "parse_document",
  description: `Parse a document (PDF, DOCX, TXT, CSV, JSON, image) and retrieve relevant content.
Stateless in-chat RAG — no vector DB needed.
Use cases: "summarize this PDF", "find the section about X in this document", "what does this file say about Y?"
Process: parse → chunk → keyword-match → return relevant chunks.
Returns: { format, pages, total_chunks, relevant_chunks, extracted_text }`,
  parameters: {
    type: "object",
    properties: {
      file_url: {
        type: "string",
        description: "URL of the document to parse. Can be a public URL or a local path.",
      },
      query: {
        type: "string",
        description: "The question or topic to search for within the document. E.g., 'revenue growth in Q3'. If empty, returns the first chunk.",
      },
      top_k: {
        type: "number",
        description: "Number of relevant chunks to return (default: 5). Increase for complex queries.",
        default: 5,
      },
      mime_type: {
        type: "string",
        description: "MIME type of the file (optional, auto-detected if omitted).",
      },
    },
    required: ["file_url"],
  },

  async execute(params): Promise<MCPToolResult> {
    const fileUrl = String(params.file_url || "").trim();
    const query = String(params.query || "").trim();
    const topK = Number(params.top_k) || 5;
    const mimeType = params.mime_type ? String(params.mime_type) : undefined;

    if (!fileUrl) {
      return { success: false, error: "No file URL provided" };
    }

    try {
      // 1. Parse the document
      const doc = await parseFile(fileUrl, mimeType);

      // 2. Chunk the text
      const chunks = chunkText(doc.text);

      // 3. Retrieve relevant chunks
      const relevant = query
        ? retrieveRelevantChunks(chunks, query, topK)
        : chunks.slice(0, topK);

      return {
        success: true,
        data: {
          format: doc.format,
          pages: doc.pages,
          total_chunks: chunks.length,
          relevant_chunks: relevant.map(c => ({
            index: c.index,
            text: c.text,
            score: c.score,
          })),
          extracted_text: doc.text.slice(0, 5000), // First 5000 chars for context
          metadata: doc.metadata,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
