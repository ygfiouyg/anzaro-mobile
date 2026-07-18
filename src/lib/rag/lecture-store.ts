// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Lecture Vector Store for RAG
// ═══════════════════════════════════════════════════════════════════════
// Manages in-memory vector storage for lecture content.
// Uses HuggingFace Inference API for embeddings (BAAI/bge-m3) and
// a simple cosine similarity search (no native dependencies needed).
//
// Design decisions:
//   - In-memory storage: Fast, no database dependency, survives process lifetime
//   - HF Inference API for embeddings: Free, high-quality multilingual model
//   - Cosine similarity: Simple, effective, no native deps that crash HuggingFace
//   - Conversation-scoped: Each conversation has its own lecture store
//
// This module is SERVER-SIDE ONLY.
// ═══════════════════════════════════════════════════════════════════════

import { splitTextIntoChunks, type TextChunk } from './text-splitter';
import { extractTextFromPdfBase64 } from '@/lib/pdf-text-extractor';

// ─── Types ────────────────────────────────────────────────────────────

export interface LectureDocument {
  /** Unique ID for this lecture */
  id: string;
  /** File name */
  fileName: string;
  /** Full extracted text */
  fullText: string;
  /** Chunks after splitting */
  chunks: TextChunk[];
  /** Upload timestamp */
  uploadedAt: number;
  /** File size in bytes */
  fileSize: number;
}

export interface EmbeddedChunk {
  /** The chunk text */
  content: string;
  /** Source file name */
  sourceFile: string;
  /** Chunk index */
  chunkIndex: number;
  /** Section header */
  sectionHeader?: string;
  /** Embedding vector */
  embedding: number[];
}

export interface SearchResult {
  /** The matched chunk */
  chunk: EmbeddedChunk;
  /** Similarity score (0-1) */
  score: number;
}

export interface LectureStoreState {
  /** All uploaded lecture documents */
  lectures: LectureDocument[];
  /** All embedded chunks (flat list) */
  embeddedChunks: EmbeddedChunk[];
  /** Whether indexing is in progress */
  isIndexing: boolean;
  /** Whether the store is ready for queries */
  isReady: boolean;
  /** Total chunks count */
  totalChunks: number;
  /** Total lectures count */
  totalLectures: number;
  /** Indexing progress (0-100) */
  indexingProgress: number;
  /** Last error message */
  lastError?: string;
}

// ─── Embedding Service ────────────────────────────────────────────────

const EMBEDDING_MODEL = 'BAAI/bge-m3';
const EMBEDDING_DIMENSION = 1024;
const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';

/**
 * Generate embeddings using HuggingFace Inference API.
 * Falls back to simple TF-IDF-like embeddings if HF API is unavailable.
 */
async function generateEmbeddingHF(text: string): Promise<number[]> {
  const response = await fetch(
    `https://router.huggingface.co/hf-inference/models/${EMBEDDING_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(HF_API_TOKEN ? { 'Authorization': `Bearer ${HF_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ inputs: text.slice(0, 2000) }), // bge-m3 limit
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) {
    throw new Error(`HF Embedding API error: ${response.status}`);
  }

  const result = await response.json();

  // HF API returns the embedding directly as an array
  if (Array.isArray(result)) {
    return result;
  }

  throw new Error('Unexpected embedding response format');
}

/**
 * Generate embeddings with batching support.
 * Processes chunks in batches of 8 to avoid rate limits.
 */
async function generateEmbeddingsBatch(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  const embeddings: number[][] = [];
  const BATCH_SIZE = 8;
  const MAX_RETRIES = 2;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchResults: number[][] = [];

    // Process each text in the batch (could parallelize further if needed)
    for (let j = 0; j < batch.length; j++) {
      let retries = 0;
      let success = false;

      while (retries <= MAX_RETRIES && !success) {
        try {
          const embedding = await generateEmbeddingHF(batch[j]);
          batchResults.push(embedding);
          success = true;
        } catch (error) {
          retries++;
          console.warn(`[RAG-Embed] Retry ${retries} for chunk ${i + j}:`, error instanceof Error ? error.message : String(error));

          if (retries > MAX_RETRIES) {
            // Fallback: generate a simple hash-based embedding
            console.warn(`[RAG-Embed] Using fallback embedding for chunk ${i + j}`);
            batchResults.push(generateFallbackEmbedding(batch[j]));
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
      }
    }

    embeddings.push(...batchResults);
    onProgress?.(Math.min(i + BATCH_SIZE, texts.length), texts.length);
  }

  return embeddings;
}

/**
 * Fallback embedding generator when HF API is unavailable.
 * Uses simple character frequency analysis — not as good as real embeddings
 * but allows the system to function offline.
 */
function generateFallbackEmbedding(text: number | string): number[] {
  const str = String(text).toLowerCase();
  const vec = new Float64Array(EMBEDDING_DIMENSION);

  // Simple hash-based embedding
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const idx = i % EMBEDDING_DIMENSION;
    vec[idx] += charCode / 65536.0;
  }

  // Add n-gram features
  for (let i = 0; i < str.length - 2; i++) {
    const triGram = str.slice(i, i + 3);
    let hash = 0;
    for (let c = 0; c < triGram.length; c++) {
      hash = ((hash << 5) - hash + triGram.charCodeAt(c)) | 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    vec[idx] += 1.0;
  }

  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return Array.from(vec).map(v => v / norm);
}

// ─── Similarity Search ────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Search for the most similar chunks to a query embedding.
 */
function findMostSimilar(
  queryEmbedding: number[],
  chunks: EmbeddedChunk[],
  topK: number = 5,
): SearchResult[] {
  const scored = chunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

// ─── Lecture Store (Singleton per conversation) ───────────────────────

/**
 * Global stores map: conversationId → LectureStoreState
 * Each conversation has its own isolated store.
 */
const stores = new Map<string, LectureStoreState>();

/**
 * Get or create a lecture store for a conversation.
 */
export function getLectureStore(conversationId: string): LectureStoreState {
  let store = stores.get(conversationId);
  if (!store) {
    store = {
      lectures: [],
      embeddedChunks: [],
      isIndexing: false,
      isReady: false,
      totalChunks: 0,
      totalLectures: 0,
      indexingProgress: 0,
    };
    stores.set(conversationId, store);
  }
  return store;
}

/**
 * Get store state (safe to call from API routes).
 */
export function getStoreStatus(conversationId: string): LectureStoreState {
  const store = stores.get(conversationId);
  if (!store) {
    return {
      lectures: [],
      embeddedChunks: [],
      isIndexing: false,
      isReady: false,
      totalChunks: 0,
      totalLectures: 0,
      indexingProgress: 0,
    };
  }
  return { ...store };
}

/**
 * Clear a lecture store for a conversation.
 */
export function clearLectureStore(conversationId: string): void {
  stores.delete(conversationId);
  console.log(`[RAG-Store] Cleared store for conversation ${conversationId}`);
}

/**
 * List all active stores (for debugging/admin).
 */
export function listActiveStores(): string[] {
  return Array.from(stores.keys());
}

// ─── Core Operations ─────────────────────────────────────────────────

/**
 * Add lectures (PDF base64 or raw text) to the store and index them.
 * This is the main entry point for uploading lectures.
 *
 * @param conversationId - The conversation ID
 * @param files - Array of files to add
 * @param onProgress - Optional progress callback
 */
export async function addLectures(
  conversationId: string,
  files: Array<{
    name: string;
    content: string; // base64 for PDFs, raw text for .txt/.docx
    type: 'pdf' | 'text';
    size?: number;
  }>,
  onProgress?: (stage: string, progress: number, message: string) => void,
): Promise<LectureStoreState> {
  const store = getLectureStore(conversationId);

  if (store.isIndexing) {
    throw new Error('Indexing is already in progress for this conversation');
  }

  store.isIndexing = true;
  store.indexingProgress = 0;
  store.lastError = undefined;

  try {
    // ── Step 1: Extract text from files ──
    onProgress?.('extracting', 5, `جاري استخراج النص من ${files.length} ملف...`);

    const newLectures: LectureDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let fullText = '';

      try {
        if (file.type === 'pdf') {
          // PDF: use the extractor
          const base64Data = file.content.includes(',')
            ? file.content
            : `data:application/pdf;base64,${file.content}`;
          fullText = await extractTextFromPdfBase64(base64Data, 200 * 1024); // 200KB max per file

          // Check if extraction was successful
          if (fullText.startsWith('[')) {
            console.warn(`[RAG-Store] PDF extraction issue for "${file.name}": ${fullText.slice(0, 100)}`);
            // Try to use whatever text we got
            if (fullText.length < 50) {
              fullText = ''; // Clearly failed
            }
          }
        } else {
          // Text file: use directly
          fullText = file.content;
        }
      } catch (error) {
        console.error(`[RAG-Store] Error extracting text from "${file.name}":`, error);
        fullText = '';
      }

      if (!fullText || fullText.trim().length < 20) {
        console.warn(`[RAG-Store] Skipping "${file.name}" — no usable text extracted`);
        continue;
      }

      // Split into chunks
      const chunks = splitTextIntoChunks(fullText, file.name, {
        maxChunkSize: 1500,
        overlap: 200,
        minChunkSize: 80,
      });

      const lecture: LectureDocument = {
        id: `lec_${Date.now()}_${i}`,
        fileName: file.name,
        fullText,
        chunks,
        uploadedAt: Date.now(),
        fileSize: file.size || fullText.length,
      };

      newLectures.push(lecture);
      onProgress?.('extracting', Math.round(((i + 1) / files.length) * 20), `تم استخراج ${file.name}`);
    }

    if (newLectures.length === 0) {
      throw new Error('لم يتم استخراج أي نص من الملفات المرفوعة');
    }

    // ── Step 2: Generate embeddings for all chunks ──
    onProgress?.('embedding', 25, `جاري توليد المتجهات لـ ${newLectures.reduce((s, l) => s + l.chunks.length, 0)} جزء...`);

    const allNewChunks: TextChunk[] = [];
    for (const lecture of newLectures) {
      allNewChunks.push(...lecture.chunks);
    }

    const chunkTexts = allNewChunks.map(c => c.content);
    const embeddings = await generateEmbeddingsBatch(chunkTexts, (completed, total) => {
      const progress = 25 + Math.round((completed / total) * 60);
      onProgress?.('embedding', progress, `تم تضمين ${completed}/${total} جزء...`);
    });

    // ── Step 3: Store everything ──
    onProgress?.('storing', 90, 'جاري حفظ البيانات...');

    const newEmbeddedChunks: EmbeddedChunk[] = allNewChunks.map((chunk, idx) => ({
      content: chunk.content,
      sourceFile: chunk.sourceFile,
      chunkIndex: chunk.chunkIndex,
      sectionHeader: chunk.sectionHeader,
      embedding: embeddings[idx] || generateFallbackEmbedding(chunk.content),
    }));

    store.lectures.push(...newLectures);
    store.embeddedChunks.push(...newEmbeddedChunks);
    store.totalChunks = store.embeddedChunks.length;
    store.totalLectures = store.lectures.length;
    store.isReady = true;
    store.isIndexing = false;
    store.indexingProgress = 100;

    const totalChars = store.lectures.reduce((s, l) => s + l.fullText.length, 0);
    console.log(`[RAG-Store] Store updated for conversation ${conversationId}: ${store.totalLectures} lectures, ${store.totalChunks} chunks, ${totalChars} total chars`);

    onProgress?.('complete', 100, `تم! ${store.totalLectures} محاضرة، ${store.totalChunks} جزء`);

    return { ...store };
  } catch (error) {
    store.isIndexing = false;
    store.lastError = error instanceof Error ? error.message : String(error);
    console.error(`[RAG-Store] Error adding lectures:`, error);
    throw error;
  }
}

/**
 * Query the lecture store — find the most relevant chunks for a question.
 *
 * @param conversationId - The conversation ID
 * @param query - The user's question
 * @param topK - Number of results to return (default: 5)
 * @returns Array of search results with similarity scores
 */
export async function queryLectures(
  conversationId: string,
  query: string,
  topK: number = 8,
): Promise<SearchResult[]> {
  const store = stores.get(conversationId);

  if (!store || !store.isReady || store.embeddedChunks.length === 0) {
    console.log(`[RAG-Store] No store ready for conversation ${conversationId}`);
    return [];
  }

  try {
    // Generate embedding for the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbeddingHF(query);
    } catch {
      console.warn('[RAG-Store] HF embedding failed for query, using fallback');
      queryEmbedding = generateFallbackEmbedding(query);
    }

    // Find most similar chunks
    const results = findMostSimilar(queryEmbedding, store.embeddedChunks, topK);

    console.log(`[RAG-Store] Query "${query.slice(0, 50)}" → ${results.length} results (top score: ${results[0]?.score.toFixed(3) || 'N/A'})`);

    return results;
  } catch (error) {
    console.error('[RAG-Store] Query error:', error);
    return [];
  }
}

/**
 * Build RAG context from search results for injection into the system prompt.
 * This creates a structured context that the LLM can reference.
 */
export function buildRAGContext(results: SearchResult[], language: 'ar' | 'en' = 'ar'): string {
  if (results.length === 0) return '';

  const isAr = language === 'ar';

  let context = isAr
    ? '\n\n━━━ سياق من المحاضرات المرفوعة ━━━\n'
    : '\n\n━━━ Context from Uploaded Lectures ━━━\n';

  context += isAr
    ? 'المستخدم رفع محاضرات ويسأل عنها. يجب عليك الإجابة بناءً على المحتوى المرفق بدقة.\n'
    : 'The user has uploaded lectures and is asking about them. You must answer based on the attached content accurately.\n';

  context += isAr
    ? '⛔ قاعدة صارمة: كل ما تقوله يجب أن يكون مأخوذاً من المحتوى أعلاه. لا تخترع أي معلومات.\n\n'
    : '⛔ Strict rule: Everything you say must be taken from the content above. Do not invent any information.\n\n';

  // Group results by source file
  const byFile = new Map<string, SearchResult[]>();
  for (const result of results) {
    const file = result.chunk.sourceFile;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(result);
  }

  for (const [fileName, fileResults] of Array.from(byFile.entries())) {
    context += isAr ? `📄 من "${fileName}":\n` : `📄 From "${fileName}":\n`;

    for (const result of fileResults) {
      if (result.chunk.sectionHeader) {
        context += isAr ? `  ┃ قسم: ${result.chunk.sectionHeader}\n` : `  ┃ Section: ${result.chunk.sectionHeader}\n`;
      }
      context += `  ┃ ${result.chunk.content}\n`;
      context += isAr ? `  ┃ (صلة: ${(result.score * 100).toFixed(0)}%)\n\n` : `  ┃ (Relevance: ${(result.score * 100).toFixed(0)}%)\n\n`;
    }
  }

  context += isAr
    ? '\n📝 تعليمات:\n'
    : '\n📝 Instructions:\n';
  context += isAr
    ? '- أجب بناءً على المحتوى أعلاه فقط\n'
    : '- Answer based on the content above only\n';
  context += isAr
    ? '- اذكر اسم الملف والمصدر عند الاستشهاد\n'
    : '- Mention the file name and source when citing\n';
  context += isAr
    ? '- إذا لم تجد الإجابة في المحتوى، قل ذلك صراحةً\n'
    : '- If you cannot find the answer in the content, say so explicitly\n';
  context += isAr
    ? '━━━ نهاية سياق المحاضرات ━━━\n'
    : '━━━ End of Lecture Context ━━━\n';

  return context;
}

/**
 * Check if a conversation has an active RAG store with content.
 */
export function hasLectureContext(conversationId: string): boolean {
  const store = stores.get(conversationId);
  return !!store && store.isReady && store.embeddedChunks.length > 0;
}

/**
 * Get a summary of all uploaded lectures for context injection.
 * This provides a brief overview without the full text.
 */
export function getLecturesSummary(conversationId: string, language: 'ar' | 'en' = 'ar'): string {
  const store = stores.get(conversationId);
  if (!store || store.lectures.length === 0) return '';

  const isAr = language === 'ar';

  let summary = isAr
    ? `\n📚 محاضرات مرفوعة (${store.totalLectures} محاضرة، ${store.totalChunks} جزء):\n`
    : `\n📚 Uploaded lectures (${store.totalLectures} lectures, ${store.totalChunks} chunks):\n`;

  for (const lecture of store.lectures) {
    const sizeKB = Math.round(lecture.fileSize / 1024);
    summary += isAr
      ? `  - ${lecture.fileName} (${sizeKB} KB، ${lecture.chunks.length} أجزاء)\n`
      : `  - ${lecture.fileName} (${sizeKB} KB, ${lecture.chunks.length} chunks)\n`;
  }

  summary += isAr
    ? '\nيمكنك السؤال عن أي موضوع من هذه المحاضرات وسأبحث في المحتوى لك.\n'
    : '\nYou can ask about any topic from these lectures and I will search the content for you.\n';

  return summary;
}
