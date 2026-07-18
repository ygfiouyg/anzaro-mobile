// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Shared Quiz Generation Service
// ═══════════════════════════════════════════════════════════════════════
// Centralizes quiz generation logic used by:
//   - /api/ai/quiz/route.ts (standalone quiz API)
//   - /api/chat/stream/route.ts (inline quiz generation during chat)
//
// This eliminates code duplication and ensures consistent quiz quality.
// ═══════════════════════════════════════════════════════════════════════

import { getZAIClient } from '@/lib/chat-utils';
import { generateOpenRouterChat } from '@/lib/openrouter';

// ─── Types ────────────────────────────────────────────────────────────
export interface QuizQuestion {
  id: string;
  type: 'mcq' | 'true-false' | 'short-answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
}

export interface QuizResult {
  title: string;
  questions: QuizQuestion[];
}

export interface QuizGenerationRequest {
  topic: string;
  content?: string;
  /** Conversation messages for context-aware quiz generation */
  conversationContext?: string;
  questionCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  types?: ('mcq' | 'true-false' | 'short-answer')[];
}

// ─── JSON Extraction Utility ──────────────────────────────────────────
// Robust extraction that handles various LLM output formats:
// - Markdown code fences (```json ... ```)
// - Bare JSON objects
// - JSON embedded in explanatory text
// - Array-only responses (missing the wrapper object)
export function extractJSON(text: string): string {
  // Step 1: Strip markdown code fences first
  const stripped = text
    .replace(/```json\s*/g, '')
    .replace(/```[\s\S]*?\n/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // Step 2: Try direct parse on stripped text
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // continue to extraction
  }

  // Step 3: Try to find JSON object with "questions" key (EXPECTED FORMAT)
  const objectMatch = stripped.match(/\{[\s\S]*?"questions"[\s\S]*?\}/);
  if (objectMatch) {
    try {
      JSON.parse(objectMatch[0]);
      return objectMatch[0];
    } catch {
      // match found but not valid JSON, continue
    }
  }

  // Step 4: Try to find JSON array (fallback for array-only responses)
  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      JSON.parse(arrayMatch[0]);
      return arrayMatch[0];
    } catch {
      // match found but not valid JSON, continue
    }
  }

  // Step 5: Try broader object match on original text
  const broadObjectMatch = text.match(/\{[\s\S]*?"questions"[\s\S]*?\}/);
  if (broadObjectMatch) {
    try {
      JSON.parse(broadObjectMatch[0]);
      return broadObjectMatch[0];
    } catch {
      // continue
    }
  }

  // Step 6: Try to fix common issues — trailing commas
  const trailingCommaFix = stripped.replace(/,\s*([}\]])/g, '$1');
  try {
    JSON.parse(trailingCommaFix);
    return trailingCommaFix;
  } catch {
    // continue
  }

  // Step 7: Return stripped text as last resort
  return stripped;
}

// ─── Validate and Normalize Questions ─────────────────────────────────
export function normalizeQuestions(
  rawQuestions: unknown[],
  defaultDifficulty: 'easy' | 'medium' | 'hard' = 'medium',
  maxCount: number = 10
): QuizQuestion[] {
  const validTypes = ['mcq', 'true-false', 'short-answer'];
  const validDifficulties = ['easy', 'medium', 'hard'];

  return rawQuestions.slice(0, maxCount).map((rawQ: unknown, index: number) => {
    const q = rawQ as Record<string, unknown>;

    const type = (validTypes.includes(q.type as string)
      ? q.type
      : 'mcq') as QuizQuestion['type'];

    const diff = (validDifficulties.includes(q.difficulty as string)
      ? q.difficulty
      : defaultDifficulty) as QuizQuestion['difficulty'];

    const points = diff === 'easy' ? 1 : diff === 'medium' ? 2 : 3;

    const question: QuizQuestion = {
      id: q.id ? String(q.id) : `q${index + 1}`,
      type,
      question: String(q.question || ''),
      correctAnswer: String(q.correctAnswer || ''),
      explanation: q.explanation ? String(q.explanation) : undefined,
      difficulty: diff,
      points,
    };

    // Add options for MCQ and true-false
    if (type === 'mcq') {
      const opts = Array.isArray(q.options) ? q.options.map(String) : [];
      if (opts.length >= 4) {
        question.options = opts.slice(0, 4);
      } else if (opts.length >= 2) {
        // Pad with placeholder options
        while (opts.length < 4) {
          opts.push(`خيار ${opts.length + 1}`);
        }
        question.options = opts;
      } else {
        question.options = ['خيار 1', 'خيار 2', 'خيار 3', 'خيار 4'];
      }
    } else if (type === 'true-false') {
      question.options = ['صح', 'خطأ'];
      // Normalize true-false answer
      const ans = String(q.correctAnswer || '').trim();
      if (ans === 'true' || ans === 'True' || ans === 'صحيح' || ans === 'صح') {
        question.correctAnswer = 'صح';
      } else if (ans === 'false' || ans === 'False' || ans === 'خاطئ' || ans === 'خطأ' || ans === 'خطا') {
        question.correctAnswer = 'خطأ';
      }
    }

    return question;
  });
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

// ─── Build Conversation Context ───────────────────────────────────────
// Converts conversation messages into a readable context string for quiz generation
export function buildConversationContext(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 10
): string {
  if (!messages || messages.length === 0) return '';

  // Take the last N messages
  const recentMessages = messages.slice(-maxMessages);

  const parts = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim().length > 0)
    .map((m) => {
      const label = m.role === 'user' ? 'المستخدم' : 'المساعد';
      // Truncate very long messages to avoid token limits
      const content = m.content.length > 1500
        ? m.content.slice(0, 1500) + '...'
        : m.content;
      return `${label}: ${content}`;
    });

  return parts.join('\n\n');
}

// ─── Main Quiz Generation Function ───────────────────────────────────
/**
 * Generates a quiz from a topic, content, and/or conversation context.
 * Uses OpenRouter models first, then falls back to ZAI SDK.
 *
 * @returns QuizResult with title and questions, or null if generation fails
 */
export async function generateQuiz(request: QuizGenerationRequest): Promise<QuizResult | null> {
  const {
    topic,
    content,
    conversationContext,
    questionCount = 10,
    difficulty = 'medium',
    types = ['mcq', 'true-false'],
  } = request;

  // Validate inputs
  if (!topic || topic.trim().length === 0) {
    console.warn('[QuizService] No topic provided');
    return null;
  }

  const validTypes = ['mcq', 'true-false', 'short-answer'];
  const safeTypes = types.filter((t) => validTypes.includes(t));
  if (safeTypes.length === 0) {
    safeTypes.push('mcq', 'true-false');
  }

  const validDifficulties = ['easy', 'medium', 'hard'];
  const safeDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';
  const count = Math.min(Math.max(questionCount, 1), 20);

  const difficultyLabel: Record<string, string> = {
    easy: 'سهل',
    medium: 'متوسط',
    hard: 'صعب',
  };

  const typeLabels: Record<string, string> = {
    mcq: 'اختيار من متعدد',
    'true-false': 'صح أم خطأ',
    'short-answer': 'إجابة قصيرة',
  };

  const selectedTypes = safeTypes.map((t) => typeLabels[t]).join('، ');

  // Build system prompt
  let systemPrompt = `أنت خبير في إنشاء الاختبارات التعليمية باللغة العربية. قم بإنشاء أسئلة اختبار بناءً على الموضوع والمحتوى المقدم.

المستوى: ${difficultyLabel[safeDifficulty]}
أنواع الأسئلة المطلوبة: ${selectedTypes}
عدد الأسئلة: ${count}

يجب أن تكون الإجابة بتنسيق JSON فقط بدون أي نص إضافي.

التنسيق المطلوب:
{
  "title": "عنوان الاختبار",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "نص السؤال بالعربية",
      "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
      "correctAnswer": "الإجابة الصحيحة",
      "explanation": "شرح لماذا هذه الإجابة صحيحة",
      "difficulty": "easy",
      "points": 1
    }
  ]
}

قواعد مهمة:
- لأسئلة الاختيار من متعدد (mcq): يجب أن تحتوي على 4 خيارات بالضبط
- لأسئلة صح أم خطأ (true-false): الخيارات تكون ["صح"، "خطأ"] والإجابة إما "صح" أو "خطأ"
- لأسئلة الإجابة القصيرة (short-answer): لا حقل options، والإجابة تكون نص قصير
- النقاط: easy=1, medium=2, hard=3
- يجب أن تكون type واحدة من: "mcq" أو "true-false" أو "short-answer"
- يجب أن تكون difficulty واحدة من: "easy" أو "medium" أو "hard"
- جميع الأسئلة والخيارات والشروحات يجب أن تكون باللغة العربية
- تأكد من تنوع الأسئلة وتغطية جوانب مختلفة من الموضوع
- تأكد من صحة الإجابات علمياً`;

  // Build user prompt
  let userPrompt = `الموضوع: ${topic}`;

  if (content && content.trim().length > 0) {
    // Truncate very long content
    const truncatedContent = content.length > 30000
      ? content.slice(0, 30000) + '\n\n[... تم اقتطاع المحتوى]'
      : content;
    userPrompt += `\n\nالمحتوى المرجعي:\n${truncatedContent}`;
  }

  if (conversationContext && conversationContext.trim().length > 0) {
    // Truncate very long conversation context
    const truncatedContext = conversationContext.length > 10000
      ? conversationContext.slice(0, 10000) + '\n\n[... تم اقتطاع السياق]'
      : conversationContext;
    userPrompt += `\n\nسياق المحادثة السابقة (استخدمه لفهم الموضوع بشكل أفضل):\n${truncatedContext}`;
  }

  userPrompt += `\n\nأنشئ ${count} سؤال من الأنواع: ${selectedTypes}`;

  // ── Try OpenRouter models first ──
  let rawContent = '';
  const openRouterModels = [
    { model: 'nvidia/nemotron-3-nano-30b-a3b:free' as const, label: 'Nemotron Nano' },
    { model: 'openai/gpt-oss-120b:free' as const, label: 'GPT OSS 120B' },
  ];

  for (const { model, label } of openRouterModels) {
    try {
      const response = await generateOpenRouterChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model,
        temperature: 0.7,
        max_tokens: 4000,
      });
      rawContent = response.choices?.[0]?.message?.content || '';
      if (rawContent) {
        console.log(`[QuizService] Generated with ${label} successfully`);
        break;
      }
    } catch (orError) {
      console.warn(`[QuizService] ${label} failed, trying next model:`, orError instanceof Error ? orError.message : String(orError));
    }
  }

  // ── Final fallback to ZAI SDK ──
  if (!rawContent) {
    try {
      console.warn('[QuizService] All OpenRouter models failed, falling back to ZAI');
      const zai = await getZAIClient();
      const fallbackResponse = await zai.chat.completions.create({
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });
      rawContent = fallbackResponse.choices?.[0]?.message?.content || '';
    } catch (zaiError) {
      console.warn('[QuizService] ZAI fallback also failed:', zaiError instanceof Error ? zaiError.message : String(zaiError));
    }
  }

  if (!rawContent) {
    console.error('[QuizService] All LLM providers failed — empty response');
    return null;
  }

  // ── Parse JSON from response ──
  let parsed: { title?: string; questions?: unknown[] };
  try {
    const jsonStr = extractJSON(rawContent);
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[QuizService] Failed to parse LLM response. Raw content (first 500 chars):', rawContent.slice(0, 500));
    return null;
  }

  // Handle case where LLM returned an array of questions instead of an object
  if (Array.isArray(parsed)) {
    parsed = { questions: parsed as unknown[] };
  }

  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    console.error('[QuizService] No questions in parsed response. Parsed keys:', Object.keys(parsed));
    return null;
  }

  // ── Validate and normalize questions ──
  const questions = normalizeQuestions(parsed.questions, safeDifficulty, count);

  if (questions.length === 0) {
    console.error('[QuizService] No valid questions after normalization');
    return null;
  }

  const title = parsed.title || `اختبار: ${topic}`;
  console.log(`[QuizService] Successfully generated ${questions.length} questions for topic: "${topic}"`);

  return { title, questions };
}
