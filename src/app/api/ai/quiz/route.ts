import { NextRequest, NextResponse } from 'next/server';
import { generateQuiz } from '@/lib/quiz-service';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── Types ────────────────────────────────────────────────────────────
interface QuizRequest {
  topic: string;
  content?: string;
  /** Conversation messages for context-aware quiz generation */
  conversationContext?: string;
  questionCount?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  types: ('mcq' | 'true-false' | 'short-answer')[];
}

// FIX #14: Quiz Race Condition Dedup
// If two identical quiz requests come within 5 seconds, return the same result
// instead of generating two separate quizzes (which causes UI confusion)
const recentQuizRequests = new Map<string, { promise: Promise<any>; timestamp: number }>();
const QUIZ_DEDUP_TTL_MS = 5_000;

function getQuizDedupeKey(body: QuizRequest): string {
  return `${body.topic}|${body.questionCount}|${body.difficulty}|${body.types.sort().join(',')}`.slice(0, 200);
}

// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth + rate limiting to quiz endpoint ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    // Allow guests with strict rate limits
    const rateLimitResponse = checkRateLimit(
      request,
      user ? RATE_LIMIT_PRESETS.ai : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body: QuizRequest = await request.json();
    const { topic, content, conversationContext, questionCount = 10, difficulty, types } = body;

    // Validate required fields
    if (!topic || topic.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال الموضوع' }, { status: 400 });
    }

    if (!types || !Array.isArray(types) || types.length === 0) {
      return NextResponse.json({ error: 'يرجى اختيار نوع الأسئلة على الأقل' }, { status: 400 });
    }

    // Validate difficulty
    const validDifficulties = ['easy', 'medium', 'hard'];
    const safeDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';

    // Validate types
    const validTypes = ['mcq', 'true-false', 'short-answer'];
    const safeTypes = types.filter((t) => validTypes.includes(t));
    if (safeTypes.length === 0) {
      return NextResponse.json({ error: 'يرجى اختيار نوع أسئلة صالح على الأقل' }, { status: 400 });
    }

    const count = Math.min(Math.max(questionCount || 10, 1), 20);

    // FIX #14: Dedup — if same quiz was requested recently, return pending promise
    const dedupeKey = getQuizDedupeKey(body);
    const existing = recentQuizRequests.get(dedupeKey);
    if (existing && Date.now() - existing.timestamp < QUIZ_DEDUP_TTL_MS) {
      console.log(`[Quiz API] Dedup: returning existing quiz for "${topic.slice(0, 30)}"`);
      const result = await existing.promise;
      return NextResponse.json(result);
    }

    // Clean up old entries
    for (const [key, val] of recentQuizRequests) {
      if (Date.now() - val.timestamp > QUIZ_DEDUP_TTL_MS) recentQuizRequests.delete(key);
    }

    // Use shared quiz generation service
    const quizPromise = generateQuiz({
      topic: topic.trim(),
      content: content?.trim() || undefined,
      conversationContext: conversationContext?.trim() || undefined,
      questionCount: count,
      difficulty: safeDifficulty,
      types: safeTypes,
    });

    // Store the promise for dedup
    recentQuizRequests.set(dedupeKey, { promise: quizPromise, timestamp: Date.now() });

    const result = await quizPromise;

    if (!result) {
      return NextResponse.json(
        { error: 'لم يتم توليد الأسئلة. يرجى المحاولة مرة أخرى.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Quiz API] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الاختبار. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
