// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — RAG Engine (Main Orchestrator)
// ═══════════════════════════════════════════════════════════════════════
// The main RAG engine that ties together:
//   1. Lecture uploading and indexing (lecture-store)
//   2. Text splitting (text-splitter)
//   3. Query processing and context retrieval
//   4. LLM-powered answer generation with RAG context
//
// This is the SINGLE entry point used by the chat stream route.
//
// This module is SERVER-SIDE ONLY.
// ═══════════════════════════════════════════════════════════════════════

import {
  addLectures,
  queryLectures,
  buildRAGContext,
  hasLectureContext,
  getLecturesSummary,
  getStoreStatus,
  clearLectureStore,
  type LectureStoreState,
  type SearchResult,
} from './lecture-store';

// Re-export everything from sub-modules for convenience
export {
  addLectures,
  queryLectures,
  buildRAGContext,
  hasLectureContext,
  getLecturesSummary,
  getStoreStatus,
  clearLectureStore,
};
export type { LectureStoreState, SearchResult };

// ─── RAG Query Intent Detection ───────────────────────────────────────

/**
 * Patterns that indicate the user is asking about uploaded lecture content.
 * These patterns trigger RAG retrieval before the normal LLM call.
 */
const RAG_QUERY_PATTERNS = [
  // Arabic: Direct reference to lectures/notes
  /(?:المحاضرة|محاضرة|المحاضرات|محاضرات|المذكرة|مذكرة|المذكرات|مذكرات|الملف|ملف|الملفات|ملفات)\s*(?:بتاعتي|اللي|اللي رفعتها|اللي رفعته|المرفوعة|المرفق)/i,
  /(?:في|من)\s+(?:المحاضرة|محاضرة|المحاضرات|المذكرة|المذكرات|الملفات)/i,

  // Arabic: Questions about content (implicit RAG need)
  /(?:إيه|ايه|ما|ماذا|ليه|ليش|إزاي|كيف|كم|أنى|وين|فين)\s+(?:في|من|عن)\s+(?:المحاضرة|محاضرة|المحاضرات)/i,
  /(?:اشرح|شروح|حلل|لخص|اذكر|عرّف|عرف|قارن|وازن|فصّل|فصل)\s+(?:اللي|محتوى|من)/i,

  // Arabic: "from the lectures" / "in the lectures"
  /من\s+(?:المحاضرات|المذكرات|الملفات)\s*(?:اللي|التي)?/i,
  /في\s+(?:المحاضرات|المذكرات|الملفات)\s*(?:اللي|التي)?/i,

  // Arabic: "what did the lecture say about X"
  /(?:المحاضرة|محاضرة)\s+(?:قالت|قال|شرحت|شرح|تتكلم|تتحدث|عن)/i,
  /(?:قالت|قال|شرحت|شرح)\s+(?:المحاضرة|محاضرة|المذكرة)/i,

  // Arabic: "explain X from the lecture"
  /(?:اشرح|شرح|فسر|تفسير|وضح|توضيح)\s+.*(?:محاضرة|مذكرة|ملف)/i,

  // Arabic: General knowledge questions (when lectures are uploaded, assume RAG)
  /(?:إيه|ايه|ما هي|ما هو)\s+.*(?:اللي|الذي|التي)/i,

  // English patterns
  /(?:from|in|about)\s+(?:the\s+)?(?:lecture|lectures|notes|files|document|documents)/i,
  /(?:what did|what does|what is)\s+(?:the\s+)?(?:lecture|notes|file|document)/i,
  /(?:explain|describe|summarize|compare|analyze)\s+.*(?:lecture|notes|file)/i,
];

/**
 * Detect if a user message is asking about uploaded lecture content.
 * Returns true if RAG context should be injected.
 */
export function isRAGQuery(message: string, conversationId: string): boolean {
  // First check: does this conversation even have lectures?
  if (!hasLectureContext(conversationId)) {
    return false;
  }

  // Then check: does the message look like a RAG query?
  const trimmed = message.trim();

  // Short messages in a conversation with lectures are likely follow-up questions
  // This catches things like "ايه المقصود بـ X؟" or "اشرح أكتر"
  if (trimmed.length < 10) return false;

  return RAG_QUERY_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Stronger RAG detection: if lectures exist, almost ANY question
 * should use RAG (since the user uploaded them for a reason).
 * This is a more aggressive approach that assumes most questions
 * in a lecture-context conversation are about the lectures.
 */
export function shouldUseRAG(message: string, conversationId: string): boolean {
  if (!hasLectureContext(conversationId)) return false;

  // Skip obvious non-RAG messages
  const lower = message.toLowerCase().trim();
  const SKIP_PATTERNS = [
    /^(مرحبا|هلا|السلام|سلام|أهلا|اهلا|هاي|شكرا|شكراً)/i,
    /^(hello|hi|hey|thanks|thank you)/i,
    /^(اعمل|اعملي|ولد|أنشئ)\s+(pdf|ملف|مستند|صورة|فيديو)/i,
  ];

  if (SKIP_PATTERNS.some(p => p.test(lower))) return false;

  // If the conversation has lectures loaded, most substantive questions
  // should use RAG. The key insight: if the user uploaded 12 lectures,
  // they want the AI to answer from them, not from general knowledge.
  return lower.length > 15;
}

// ─── RAG-Enhanced Chat ────────────────────────────────────────────────

/**
 * Process a chat message with RAG context.
 * Returns the RAG context string to inject into the system prompt.
 */
export async function processRAGQuery(
  conversationId: string,
  message: string,
  language: 'ar' | 'en' = 'ar',
  topK: number = 8,
): Promise<{
  context: string;
  results: SearchResult[];
  usedRAG: boolean;
}> {
  // Check if RAG should be used
  if (!shouldUseRAG(message, conversationId)) {
    return { context: '', results: [], usedRAG: false };
  }

  console.log(`[RAG-Engine] Processing RAG query for conversation ${conversationId}: "${message.slice(0, 60)}"`);

  try {
    // Search for relevant chunks
    const results = await queryLectures(conversationId, message, topK);

    if (results.length === 0) {
      // No relevant results found — return just the lectures summary
      const summary = getLecturesSummary(conversationId, language);
      return { context: summary, results: [], usedRAG: true };
    }

    // Filter out low-relevance results (score < 0.3)
    const relevantResults = results.filter(r => r.score > 0.25);

    if (relevantResults.length === 0) {
      const summary = getLecturesSummary(conversationId, language);
      return { context: summary, results: [], usedRAG: true };
    }

    // Build RAG context
    const context = buildRAGContext(relevantResults, language);

    console.log(`[RAG-Engine] RAG context: ${relevantResults.length} chunks, ${context.length} chars`);

    return { context, results: relevantResults, usedRAG: true };
  } catch (error) {
    console.error('[RAG-Engine] Error processing RAG query:', error);
    return { context: '', results: [], usedRAG: false };
  }
}

// ─── Lecture Upload Handler ───────────────────────────────────────────

export interface UploadProgress {
  stage: string;
  progress: number;
  message: string;
}

/**
 * Upload and index lecture files for a conversation.
 */
export async function uploadAndIndexLectures(
  conversationId: string,
  files: Array<{
    name: string;
    content: string;
    type: 'pdf' | 'text';
    size?: number;
  }>,
  onProgress?: (progress: UploadProgress) => void,
): Promise<LectureStoreState> {
  console.log(`[RAG-Engine] Uploading ${files.length} lecture(s) for conversation ${conversationId}`);

  const result = await addLectures(
    conversationId,
    files,
    (stage, progress, message) => {
      onProgress?.({ stage, progress, message });
    },
  );

  console.log(`[RAG-Engine] Upload complete: ${result.totalLectures} lectures, ${result.totalChunks} chunks indexed`);

  return result;
}
