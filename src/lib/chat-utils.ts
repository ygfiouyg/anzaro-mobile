// ─── Shared Chat Utilities ───────────────────────────────────────────
// Extracted from api/chat/send/route.ts and api/chat/stream/route.ts
// to eliminate code duplication.

// ─── ZAI SDK Singleton ───────────────────────────────────────────────
// بيستخدم zai-client اللي بيدعم ZAI_API_KEY env var
import { getZAIClient as getZAI } from './zai-client';

declare global {
  var _zaiClient: any;
  var _zaiInitPromise: Promise<any> | null;
}

export async function getZAIClient() {
  // استخدم zai-client الجديد اللي بيدعم env var
  return getZAI();
}

// ─── Fallback Chain (ZAI → Groq → Gemini) ───────────────────────────
// بيجرّب كل provider لحد ما يلاقي واحد شغال. لو واحد وقع، التاني يكمل.

export interface ChatFallbackResult {
  success: boolean;
  content: string;
  provider: 'zai' | 'groq' | 'gemini' | 'none';
  error?: string;
}

/**
 * Fallback chain: ZAI (GLM-5.2) → Groq (Llama 3.3 70B) → Gemini (2.0 Flash).
 * بيجرّب كل provider بالترتيب. أول واحد ينجح بيرجع النتيجة.
 * لو كلهم فشلوا، بيرجع رسالة خطأ بالعربي.
 */
export async function chatWithFallback(
  messages: { role: string; content: string }[],
  options: { model?: string; temperature?: number } = {}
): Promise<ChatFallbackResult> {
  const tryZAI = async (): Promise<ChatFallbackResult> => {
    try {
      // V.14: No hardcoded model fallback — require explicit model selection
      const selectedModel = options.model ?? null;
      if (!selectedModel) {
        return { success: false, content: '', provider: 'zai', error: 'No model selected — sync providers from Dashboard' };
      }
      const client = await getZAIClient();
      const completion = await client.chat.completions.create({
        model: selectedModel,
        messages: messages as any,
        max_tokens: 65536,
        temperature: options.temperature ?? 1.0,
      });
      const content = completion?.choices?.[0]?.message?.content || '';
      if (!content) return { success: false, content: '', provider: 'zai', error: 'empty response' };
      return { success: true, content, provider: 'zai' };
    } catch (e: any) {
      return { success: false, content: '', provider: 'zai', error: e.message };
    }
  };

  const tryGroq = async (): Promise<ChatFallbackResult> => {
    try {
      const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
      if (!GROQ_API_KEY) return { success: false, content: '', provider: 'groq', error: 'no key' };
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: messages as any,
          temperature: options.temperature ?? 1.0,
          max_tokens: 8192,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Groq ${res.status}: ${errText.slice(0, 150)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      if (!content) return { success: false, content: '', provider: 'groq', error: 'empty response' };
      return { success: true, content, provider: 'groq' };
    } catch (e: any) {
      return { success: false, content: '', provider: 'groq', error: e.message };
    }
  };

  const tryGemini = async (): Promise<ChatFallbackResult> => {
    try {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
      if (!GEMINI_API_KEY) return { success: false, content: '', provider: 'gemini', error: 'no key' };
      const systemContent = messages.find((m) => m.role === 'system')?.content;
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            ...(systemContent ? { systemInstruction: systemContent } : {}),
            generationConfig: {
              temperature: options.temperature ?? 1.0,
              maxOutputTokens: 8192,
            },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini ${res.status}: ${errText.slice(0, 150)}`);
      }
      const data = await res.json();
      const content =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join('') || '';
      if (!content) return { success: false, content: '', provider: 'gemini', error: 'empty response' };
      return { success: true, content, provider: 'gemini' };
    } catch (e: any) {
      return { success: false, content: '', provider: 'gemini', error: e.message };
    }
  };

  // Chain: ZAI → Groq → Gemini
  const zaiResult = await tryZAI();
  if (zaiResult.success && zaiResult.content) return zaiResult;
  console.warn('[Fallback] ZAI failed, trying Groq:', zaiResult.error);

  const groqResult = await tryGroq();
  if (groqResult.success && groqResult.content) return groqResult;
  console.warn('[Fallback] Groq failed, trying Gemini:', groqResult.error);

  const geminiResult = await tryGemini();
  if (geminiResult.success && geminiResult.content) return geminiResult;

  return {
    success: false,
    content: 'كل الـ providers فشلوا. حاول تاني.',
    provider: 'none',
    error: `zai: ${zaiResult.error} | groq: ${groqResult.error} | gemini: ${geminiResult.error}`,
  };
}

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
  // Short quiz keywords (be careful — these can be false positives)
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

export function isQuizIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Must be at least 5 chars to avoid false positives
  if (lower.length < 5) return false;
  return QUIZ_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── File Generation Keywords ────────────────────────────────────────
// Both EXPLICIT and IMPLICIT file generation requests.
// The system should auto-detect when a user wants a file generated,
// even without saying "ولد ملف" or "اعمل pdf" explicitly.
// "لخص القوانين" or "اجمع المحاضرات" should also trigger file generation
// because structured output naturally implies a document/file.
export const FILE_GEN_KEYWORDS = [
  // Arabic file/document generation keywords — ALL forms (masculine, feminine, colloquial)
  'ولد ملف', 'ولد pdf', 'أنشئ ملف', 'اصنع ملف', 'اعمل ملف',
  'اعملي ملف', 'اعملي pdf', 'اعمل pdf', 'اعمللي pdf', 'اعمللي ملف',
  'لخص في ملف', 'تقرير pdf', 'بحث pdf', 'حول لملف', 'حوله ل pdf',
  'ولدلي ملف', 'ولدلي pdf', 'أنشئلي ملف', 'اصنعلي ملف', 'اعمللي ملف',
  'اكتب ملف', 'اكتب pdf',
  // /ملفاتي unified command
  '/ملفاتي', 'ملفاتي',
  // Egyptian/colloquial forms
  'طلعلي pdf', 'طلعلي ملف', 'طلع pdf', 'طلع ملف',
  'جيبلي pdf', 'جيبلي ملف', 'جيب pdf',
  'حطلي pdf', 'حطلي ملف',
  'صنعلي pdf', 'صنعلي ملف',
  'جهزلي pdf', 'جهزلي ملف',
  // General PDF generation intent (user asking AI to make a PDF)
  'عملي pdf', 'عملي ملف', 'عمل pdf', 'عمل ملف',
  'اعمللي pdf', 'اعمللي ملف',
  // User explicitly wanting PDF format
  'عاوز pdf', 'عاوزه pdf', 'عاوزه pdf', 'عاوزة pdf',
  'عايز pdf', 'عايزة pdf', 'عايز ملف', 'عاوزه ملف',
  'ابي pdf', 'ابغى pdf', 'ابي ملف', 'ابغى ملف',
  'بصيغه pdf', 'بصيغة pdf', 'ك pdf', 'ملف pdf',
  'pdf بس', 'بس pdf', 'منزليش pdf', 'ما نزلش pdf',
  // PPTX / PowerPoint generation keywords
  'ولد pptx', 'اعمل pptx', 'اعملي pptx', 'اعمللي pptx',
  'أنشئ pptx', 'اصنع pptx', 'اكتب pptx',
  'ولد باوربوينت', 'اعمل باوربوينت', 'اعملي باوربوينت', 'اعمللي باوربوينت',
  'أنشئ باوربوينت', 'اصنع باوربوينت',
  'ولد بوربوينت', 'اعمل بوربوينت', 'اعملي بوربوينت',
  'عرض تقديم', 'اعمل عرض تقديم', 'اعملي عرض تقديم',
  'ولد عرض', 'اعمل عرض', 'سلايدات', 'سلايد',
  'عاوز pptx', 'عايز pptx', 'عاوز باوربوينت', 'عايز باوربوينت',
  'طلعلي pptx', 'جيبلي pptx', 'حطلي pptx',
  // English keywords
  'generate pdf', 'create pdf', 'make pdf', 'export pdf',
  'convert to pdf', 'pdf please', 'as pdf', 'in pdf',
  'generate pptx', 'create pptx', 'make pptx', 'export pptx',
  'generate powerpoint', 'create powerpoint', 'make powerpoint',
  'create slides', 'generate slides', 'make slides', 'presentation',
  // Document/report type keywords (when user asks for a specific document type)
  'دليل سياحي', 'دليل شامل', 'دليل ملف',
  'تقرير عن', 'بحث عن', 'مقال عن',
  'مذكرة عن', 'ملخص عن',
  'write a report', 'create a document', 'tour guide',
  // ── IMPLICIT file generation keywords (new!) ──
  // These detect when the user's intent implies file generation
  // even without explicit "ملف" or "pdf" keywords
  // Law/legal compilation
  'تجميعة القوانين', 'تجميعة قوانين', 'اجمع القوانين', 'لم القوانين',
  'ملخص القوانين', 'لخص القوانين', 'شامل للقوانين', 'شامل للقانون',
  'كل القوانين', 'القوانين كلها', 'القوانين كاملة',
  // Lecture/study material compilation
  'تجميعة المحاضرات', 'اجمع المحاضرات', 'لم المحاضرات',
  'لخص المحاضرات', 'لخصلي المحاضرات', 'ملخص المحاضرات',
  'لخص الدروس', 'لخص الملازم', 'لخص المنهج', 'لخص المقرر',
  'اجمع الدروس', 'اجمع الملازم', 'اجمع المنهج', 'اجمع المقرر',
  // Comprehensive documents
  'ملف شامل', 'مستند شامل', 'تقرير شامل', 'بحث شامل', 'دليل شامل',
  // Structured output requests
  'كلهم في ملف', 'حطهم كلهم', 'خليهم في ملف', 'نظمهم في ملف',
  // English implicit
  'compile the laws', 'summarize the laws', 'all the laws',
  'compile the lectures', 'summarize the lectures',
  'comprehensive summary', 'comprehensive guide', 'comprehensive review',
  'put them all in', 'organize them into',
];

export function isFileGenerationIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return FILE_GEN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Enhanced Emotion Detection ──────────────────────────────────────
interface EmotionDef {
  keywords: string[];
  emoji: string;
  arabicLabel: string; // For the supportive prefix
  isNegative: boolean; // Whether to add supportive prefix
}

export const emotionMatrix: Record<string, EmotionDef> = {
  // Original emotions
  happy: {
    keywords: ['شكرا', 'ممتاز', 'رائع', 'great', 'awesome', 'شكراً'],
    emoji: '😊',
    arabicLabel: 'سعادة',
    isNegative: false,
  },
  supportive: {
    keywords: ['مساعدة', 'ساعدني', 'help', 'محتاج'],
    emoji: '🤗',
    arabicLabel: 'حاجة للمساعدة',
    isNegative: false,
  },
  excited: {
    keywords: ['يا سلام', 'واو', 'wow', 'عظيم'],
    emoji: '🤩',
    arabicLabel: 'حماس',
    isNegative: false,
  },
  calm: {
    keywords: ['هدوء', 'سلام', 'calm', 'peace'],
    emoji: '😌',
    arabicLabel: 'هدوء',
    isNegative: false,
  },
  thoughtful: {
    keywords: ['فكر', 'think', 'تحليل', 'analyze'],
    emoji: '🤔',
    arabicLabel: 'تفكير',
    isNegative: false,
  },

  // Nuanced emotions
  stressed: {
    keywords: ['تعبان', 'ضغط', 'stressed', 'overwhelmed', 'مش قادر', 'مش قادرة', 'ضغوط', 'حمل كبير', 'مش قادرة أتحمل'],
    emoji: '😰',
    arabicLabel: 'توتر وضغط',
    isNegative: true,
  },
  confused: {
    keywords: ['مش فاهم', 'إيه ده', 'confused', 'مفهمتش', 'مش فاهمة', 'مش عارف إيه', 'حائر', 'محتار'],
    emoji: '😕',
    arabicLabel: 'حيرة وارتباك',
    isNegative: true,
  },
  curious: {
    keywords: ['ليه', 'إزاي', 'why', 'how', 'how come', 'كيف', 'ما هو', 'ما هي', 'إيه الفرق', 'عايز أعرف', 'عايزة أعرف'],
    emoji: '🧐',
    arabicLabel: 'فضول',
    isNegative: false,
  },
  grateful: {
    keywords: ['شكراً', 'متشكر', 'thank', 'thanks', 'ممنون', 'ممتن', 'جزاك الله', 'الله يبارك فيك'],
    emoji: '🙏',
    arabicLabel: 'امتنان',
    isNegative: false,
  },
  frustrated: {
    keywords: ['زعلان', 'محبط', 'frustrated', 'upset', 'مش عارف', 'زهقان', 'ملحو', 'نرفزة', 'عصبي'],
    emoji: '😤',
    arabicLabel: 'إحباط وزعل',
    isNegative: true,
  },
};

export function detectEmotion(message: string): string {
  const lower = message.toLowerCase();
  for (const [emotion, data] of Object.entries(emotionMatrix)) {
    if (data.keywords.some((kw) => lower.includes(kw))) {
      return emotion;
    }
  }
  return 'neutral';
}

// Get the supportive prefix for negative emotions
export function getEmotionSupportPrefix(emotion: string): string | null {
  const emotionDef = emotionMatrix[emotion];
  if (!emotionDef || !emotionDef.isNegative) return null;
  return `المستخدم يبدو عليه ${emotionDef.arabicLabel}. اجعله يشعر بالدعم والتعاطف في بداية ردك.`;
}

// ─── Smart Auto-Search Classifier ──────────────────────────────────────
// Determines whether a user message requires web search for up-to-date info.
// Uses a two-tier approach:
//   1. FAST PATH: keyword matching (instant, zero cost)
//   2. SMART PATH: LLM-based classification for ambiguous queries (cheap model, 3s timeout)

// ─── Web Search Keyword Triggers (Fast Path) ───────────────────────────
export const WEB_SEARCH_TRIGGERS = [
  'ابحث', 'بحث عن', 'ابحث عن', 'ابحثلي عن', 'دور على', 'دوري على',
  'search for', 'search about', 'look up', 'find info', 'find information',
  'latest', 'current', 'recent', 'now', 'today', 'حالي', 'أحدث',
  'آخر الأخبار', 'الأخبار', 'news', 'what is the latest',
  'what is the current', 'ما هو أحدث', 'ما هي أحدث',
  'حدثني عن', 'أخبرني عن آخر', 'search', 'بحث',
];

/** Fast-path keyword detection — returns true immediately if any trigger matches */
export function needsWebSearch(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return WEB_SEARCH_TRIGGERS.some((trigger) => lower.includes(trigger));
}

// ─── LRU Cache for Search Decisions ────────────────────────────────────
interface SearchDecision {
  shouldSearch: boolean;
  timestamp: number;
}

const SEARCH_DECISION_CACHE = new Map<string, SearchDecision>();
const SEARCH_CACHE_MAX_SIZE = 50;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let searchCacheLastCleanup = 0;
const SEARCH_CACHE_CLEANUP_INTERVAL = 60 * 1000; // Clean up at most once per minute

/** Lazy eviction — only runs cleanup if enough time has passed since last cleanup */
function cleanSearchDecisionCache() {
  const now = Date.now();
  // PERF: Only run cleanup if at least 1 minute has passed since last cleanup
  if (now - searchCacheLastCleanup < SEARCH_CACHE_CLEANUP_INTERVAL) return;
  searchCacheLastCleanup = now;
  
  for (const [key, value] of SEARCH_DECISION_CACHE.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL_MS) {
      SEARCH_DECISION_CACHE.delete(key);
    }
  }
  if (SEARCH_DECISION_CACHE.size > SEARCH_CACHE_MAX_SIZE) {
    const entries = Array.from(SEARCH_DECISION_CACHE.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - SEARCH_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      SEARCH_DECISION_CACHE.delete(key);
    }
  }
}

/**
 * Smart auto-search classifier using LLM.
 * Only called when keyword detection doesn't match (ambiguous queries).
 * Uses a fast/cheap model with a 3-second timeout.
 * Falls back to keyword detection on timeout.
 */
export async function shouldAutoSearch(message: string): Promise<boolean> {
  // Fast path: if keywords match, search immediately — no LLM call needed
  if (needsWebSearch(message)) {
    return true;
  }

  // ── Ultra-fast skip: messages that obviously don't need search ──
  // Skip the expensive LLM classifier for clearly non-search messages
  // This eliminates 1-3 seconds of latency for greetings, simple questions, etc.
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Skip for very short messages (greetings, simple questions)
  if (trimmed.length < 15) {
    return false;
  }

  // Skip for common non-search patterns
  const SKIP_PATTERNS = [
    /^(مرحبا|هلا|السلام|سلام|أهلا|اهلا|هاي|هاى|يا هلا|صباح|مساء|كيفك|كيف حالك|شخبارك|ايش|ايه|ايش اخبارك|شلونك)/i,
    /^(شكرا|شكراً|مشكور|يعطيك|تسلم|الله يعافيك)/i,
    /^(hello|hi|hey|good morning|good evening|thanks|thank you)/i,
    /^(اعمل|اعملي|ساعدني|اكتب|اكتبي|اشرح|اشرحي|لخص|لخصي|ترجم|ترجمي)/i,
    /^(ولد|اصنع|اصنعي|أنشئ|أنشئي|كلم|كلمي)/i,
  ];
  if (SKIP_PATTERNS.some(p => p.test(trimmed))) {
    return false;
  }

  // Skip for messages that are clearly creative/instructional (no real-time info needed)
  // FIX: Made patterns more specific — removed overly broad patterns like /explain/i
  // that would skip search for queries like "explain the latest AI developments"
  const CREATIVE_PATTERNS = [
    /اكتب (قصيد|شعر|قصة|مقال|رسالة|خطاب)/i,
    /ولد (صورة|فيديو|ملف|مستند)/i,
    /اصنع (برنامج|كود|سكريبت|تطبيق)/i,
    /(ترجمة|تلخيص) /i,
    /^translate this/i,
    /^summarize this/i,
    /^write (a |me )?(poem|story|essay|letter|song)/i,
    /^create (a |me )?(poem|story|image|video)/i,
  ];
  if (CREATIVE_PATTERNS.some(p => p.test(lower))) {
    return false;
  }

  // Check LRU cache for recent decision on similar query
  const cacheKey = message.toLowerCase().trim().slice(0, 200);
  cleanSearchDecisionCache();
  const cached = SEARCH_DECISION_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.shouldSearch;
  }

  // Smart path: use LLM to classify ambiguous queries
  try {
    const zai = await getZAIClient();

    const classifierPrompt = `You are a search necessity classifier. Given a user's message, determine if it requires searching the internet for current, up-to-date, or real-time information to answer accurately.

Examples that NEED search (YES):
- "ما سعر الدولار اليوم" (current prices)
- "Who won the World Cup 2026?" (recent events)
- "أخبار مصر اليوم" (breaking news)
- "What's the weather in Cairo?" (real-time data)
- "أحدث تطورات الذكاء الاصطناعي" (latest developments)
- "Who is the current president of France?" (current facts)

Examples that DON'T need search (NO):
- "Explain quantum physics" (static knowledge)
- "اشرح لي النسبية" (static knowledge)
- "Write a poem about nature" (creative)
- "How does photosynthesis work?" (static knowledge)
- "كيف أتعلم البرمجة؟" (general advice)
- "Translate this to Arabic" (language task)

Reply with ONLY "YES" or "NO". Nothing else.`;

    // 3-second timeout race
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });

    const llmPromise = zai.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: classifierPrompt },
        { role: 'user', content: message.slice(0, 500) },
      ],
      temperature: 0,
      max_tokens: 3,
    });

    const result = await Promise.race([llmPromise, timeoutPromise]);

    if (!result) {
      // Timeout — fall back to keyword detection (already returned false above, so no search)
      console.log('[AutoSearch] LLM classifier timed out, skipping search');
      return false;
    }

    // Parse the LLM response
    let responseText = '';
    if (result.choices && result.choices.length > 0) {
      responseText = (result.choices[0].message?.content || '').trim().toUpperCase();
    }

    const shouldSearch = responseText.includes('YES');

    // Cache the decision
    SEARCH_DECISION_CACHE.set(cacheKey, {
      shouldSearch,
      timestamp: Date.now(),
    });

    console.log(`[AutoSearch] LLM classifier: "${message.slice(0, 60)}" → ${shouldSearch ? 'SEARCH' : 'SKIP'} (raw: "${responseText}")`);
    return shouldSearch;
  } catch (error) {
    // On any error, fall back to no search (keywords already didn't match)
    console.warn('[AutoSearch] Classifier error, skipping search:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// ─── Web Search with Caching ───────────────────────────────────────────
export interface WebSearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  date?: string;
}

interface CachedWebSearch {
  results: WebSearchResult[];
  timestamp: number;
  query: string;
}

const WEB_SEARCH_CACHE = new Map<string, CachedWebSearch>();
const WEB_CACHE_MAX_SIZE = 100;
const WEB_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let webCacheLastCleanup = 0;
const WEB_CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean up at most once per 5 minutes

function cleanWebSearchCache() {
  const now = Date.now();
  // PERF: Only run cleanup if at least 5 minutes have passed since last cleanup
  if (now - webCacheLastCleanup < WEB_CACHE_CLEANUP_INTERVAL) return;
  webCacheLastCleanup = now;
  
  for (const [key, value] of WEB_SEARCH_CACHE.entries()) {
    if (now - value.timestamp > WEB_CACHE_TTL_MS) {
      WEB_SEARCH_CACHE.delete(key);
    }
  }
  if (WEB_SEARCH_CACHE.size > WEB_CACHE_MAX_SIZE) {
    const entries = Array.from(WEB_SEARCH_CACHE.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - WEB_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      WEB_SEARCH_CACHE.delete(key);
    }
  }
}

/**
 * Perform web search using the ZAI SDK singleton with caching.
 * Replaces the inline performWebSearch that created a new ZAI instance each time.
 */
export async function performWebSearch(query: string, num: number = 5): Promise<WebSearchResult[]> {
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  cleanWebSearchCache();
  const cached = WEB_SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEB_CACHE_TTL_MS) {
    console.log(`[WebSearch] Cache hit for: ${query.slice(0, 50)}`);
    return cached.results;
  }

  try {
    const zai = await getZAIClient();
    const rawResults = await zai.functions.invoke('web_search', {
      query,
      num,
    });

    let results: WebSearchResult[] = [];

    if (Array.isArray(rawResults)) {
      results = rawResults.slice(0, num).map((item: Record<string, unknown>) => ({
        url: String(item.url || item.link || ''),
        name: String(item.name || item.title || ''),
        snippet: String(item.snippet || item.description || item.abstract || ''),
        host_name: String(item.host_name || ''),
        date: item.date ? String(item.date) : undefined,
      }));
    } else if (rawResults && typeof rawResults === 'object') {
      const resultsArray = (rawResults as Record<string, unknown>).results || (rawResults as Record<string, unknown>).data || [];
      if (Array.isArray(resultsArray)) {
        results = resultsArray.slice(0, num).map((item: Record<string, unknown>) => ({
          url: String(item.url || item.link || ''),
          name: String(item.name || item.title || ''),
          snippet: String(item.snippet || item.description || item.abstract || ''),
          host_name: String(item.host_name || ''),
          date: item.date ? String(item.date) : undefined,
        }));
      }
    }

    // Cache the results
    WEB_SEARCH_CACHE.set(cacheKey, {
      results,
      timestamp: Date.now(),
      query,
    });

    return results;
  } catch (searchError) {
    console.error('[WebSearch] ZAI SDK search failed:', searchError);

    // ── Fallback: Try direct fetch to DuckDuckGo Instant Answer API ──
    // This provides basic web search capability even when the ZAI SDK is down
    try {
      console.log('[WebSearch] Trying DuckDuckGo fallback...');
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const ddgResponse = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(10_000), // 10s timeout
        headers: { 'User-Agent': 'DeltaAI/3.0' },
      });

      if (ddgResponse.ok) {
        const ddgData = await ddgResponse.json() as Record<string, unknown>;
        const fallbackResults: WebSearchResult[] = [];

        // Extract abstract (main answer)
        const abstract = ddgData.Abstract as string;
        const abstractUrl = ddgData.AbstractURL as string;
        const abstractSource = ddgData.AbstractSource as string;
        if (abstract) {
          fallbackResults.push({
            url: abstractUrl || '',
            name: abstractSource || 'DuckDuckGo',
            snippet: abstract,
            host_name: abstractUrl ? new URL(abstractUrl).hostname : 'duckduckgo.com',
          });
        }

        // Extract related topics
        const relatedTopics = ddgData.RelatedTopics as Array<Record<string, unknown>>;
        if (Array.isArray(relatedTopics)) {
          for (const topic of relatedTopics.slice(0, 4)) {
            const text = topic.Text as string;
            const url = topic.FirstURL as string;
            if (text && url) {
              fallbackResults.push({
                url,
                name: text.slice(0, 80),
                snippet: text,
                host_name: new URL(url).hostname,
              });
            }
          }
        }

        if (fallbackResults.length > 0) {
          console.log(`[WebSearch] DuckDuckGo fallback found ${fallbackResults.length} results`);
          // Cache the fallback results too
          WEB_SEARCH_CACHE.set(cacheKey, {
            results: fallbackResults,
            timestamp: Date.now(),
            query,
          });
          return fallbackResults;
        }
      }
    } catch (ddgError) {
      console.error('[WebSearch] DuckDuckGo fallback also failed:', ddgError);
    }

    return [];
  }
}

/**
 * Format search results for injection into the LLM system prompt.
 */
export function formatSearchResultsForPrompt(results: WebSearchResult[], query: string): string {
  if (results.length === 0) return '';

  let context = `\n\n🔍 نتائج البحث على الإنترنت عن "${query}":\n`;
  context += 'استخدم المعلومات التالية من الإنترنت لإثراء ردك. اذكر المصادر عند الاقتباس.\n\n';

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    context += `${i + 1}. **${r.name}**\n`;
    context += `   ${r.snippet}\n`;
    context += `   المصدر: ${r.host_name}${r.date ? ' | التاريخ: ' + r.date : ''}\n\n`;
  }

  return context;
}
