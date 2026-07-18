// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Shared Quiz Intent Detection (Client & Server Safe)
// ═══════════════════════════════════════════════════════════════════════
// This module contains quiz intent detection and topic extraction logic
// that can be safely imported on both client and server side.
// It has NO server-only imports (no z-ai-web-dev-sdk, no openrouter, etc.)
// ═══════════════════════════════════════════════════════════════════════

// ─── Quiz Intent Keywords ────────────────────────────────────────────
export const QUIZ_INTENT_KEYWORDS = [
  // Arabic quiz/test keywords — feminine forms (اعملي, اعمللي)
  'اعملي اسئله', 'اعمللي اسئله', 'اعملي اسئلة', 'اعمللي اسئلة',
  'اعملي كويز', 'اعمللي كويز',
  // Arabic quiz/test keywords — masculine forms (اعمل, اعمللي without ي)
  'اعمل اسئله', 'اعمل اسئلة', 'اعمل كويز',
  'اعمل اختبار', 'اعملي اختبار', 'اعمللي اختبار',
  // Egyptian/colloquial forms
  'حطلي اسئلة', 'حطلي اسئله', 'حطلي كويز',
  'جبلي اسئلة', 'جبلي اسئله', 'جبلي كويز',
  'هاتلي اسئلة', 'هاتلي اسئله', 'هاتلي كويز',
  'عطيني كويز', 'عطيني اسئلة', 'عطيني اسئله',
  'جهزلي كويز', 'جهزلي اسئلة', 'جهزلي اسئله',
  'صنعلي كويز', 'صنعلي اسئلة', 'صنعلي اسئله',
  'ولدلي كويز', 'ولدلي اسئلة', 'ولدلي اسئله',
  'انشئلي كويز', 'انشئلي اسئلة', 'انشئلي اسئله',
  // Test/exam keywords
  'امتحاني', 'اختبرني', 'اختبرنى',
  'اختبرني في', 'امتحان في', 'كويز في',
  // Short quiz keywords
  'اسئله', 'اسئلة', 'أسئله', 'أسئلة',
  'كويز', 'اختبار', 'اختبارات',
  // Specific question types
  'أسئلة اختيار', 'اسئلة اختيار',
  'أسئلة صح وخطأ', 'اسئلة صح وخطأ',
  // Combined with context keywords
  'اسئله من', 'اسئلة من', 'كويز من',
  'اسئله على', 'اسئلة على', 'كويز على',
  'اسئله عليه', 'اسئلة عليه', 'أسئلة عليه',
  'اسئله عن', 'اسئلة عن', 'أسئلة عن',
  'أسئلة من الملفات', 'اسئلة من الملفات',
  // English keywords
  'test me', 'quiz me', 'make questions',
  'generate quiz', 'create quiz', 'make a test',
  'questions about', 'quiz about',
  'quiz me on', 'test me on', 'questions on',
];

/**
 * Detect if a message contains quiz/test intent.
 * Client-safe — no server-only imports.
 */
export function isQuizIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Must be at least 5 chars to avoid false positives
  if (lower.length < 5) return false;
  return QUIZ_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Extract Topic from User Message ─────────────────────────────────
// Smarter topic extraction that doesn't strip too aggressively
export function extractTopicFromMessage(message: string): string {
  let topic = message.trim();

  // Remove quiz intent keywords but preserve the actual topic
  // Pattern: "اعملي اسئله عن الذكاء الاصطناعي" → "الذكاء الاصطناعي"
  const topicPatterns = [
    // Arabic patterns — extract what comes AFTER the quiz keyword
    /(?:اعمل[ي]?ل?[ي]?\s*(?:لي)?\s*(?:اسئل[هة]|كويز|اختبار)|(?:حطلي|جبلي|هاتلي|عطيني|جهزلي|صنعلي|ولدلي|انشئلي)\s*(?:اسئل[هة]|كويز)|اختبرن[يى]\s*(?:في|عن|من)?|امتحاني?\s*(?:في|عن|من)?|كويز\s*(?:في|عن|من|على)|اختبار\s*(?:في|عن|من|على)|اسئل[هة]\s*(?:في|عن|من|على|عنه)|أسئل[هة]\s*(?:في|عن|من|على|عنه))\s*(.+)/i,
    // English patterns
    /(?:quiz\s*me\s*(?:on|about)?|test\s*me\s*(?:on|about)?|generate\s*quiz\s*(?:on|about|for)?|create\s*quiz\s*(?:on|about|for)?|make\s*(?:a\s+)?(?:quiz|test|questions)\s*(?:on|about|for)?|questions\s*(?:on|about))\s*(.+)/i,
  ];

  for (const pattern of topicPatterns) {
    const match = topic.match(pattern);
    if (match && match[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  // If no pattern matched, try to remove just the quiz keywords and keep the rest
  const cleaned = topic
    .replace(/اعمل[ي]?ل?[ي]?\s*(?:لي)?\s*(?:اسئل[هة]|كويز|اختبار)\s*/i, '')
    .replace(/(?:حطلي|جبلي|هاتلي|عطيني|جهزلي|صنعلي|ولدلي|انشئلي)\s*(?:اسئل[هة]|كويز)\s*/i, '')
    .replace(/اختبرن[يى]\s*/i, '')
    .replace(/امتحاني?\s*/i, '')
    .replace(/^كويز\s*/i, '')
    .replace(/^اختبار\s*/i, '')
    .replace(/^اسئل[هة]\s*/i, '')
    .replace(/^أسئل[هة]\s*/i, '')
    .replace(/^(?:من|على|عن|في)\s*/i, '')
    .trim();

  return cleaned || 'اختبار عام';
}
