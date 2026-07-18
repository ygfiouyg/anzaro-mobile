/**
 * Intent Detection Patterns (Arabic + English)
 * =============================================
 * أنماط regex لكشف نية المستخدم — نبدأ بيها قبل ما نستدعي GLM
 * عشان نوفر tokens ونوجه الطلب للأداة المناسبة.
 */

// ====== Script Writer Patterns ======

/** أنماط عربية صريحة لكتابة سكريبت */
export const AR_SCRIPT_PATTERNS: RegExp[] = [
  /اكتب\s*(لي)?\s*سكريبت/i,
  /اعمل\s*(لي)?\s*سكريبت/i,
  /سوّي?\s*(لي)?\s*سكريبت/i,
  /كتابة\s*سكريبت/i,
  /اكتب\s*(لي)?\s*(ريلز|ريل|short|تيك\s*توك|tiktok|يوتيوب|youtube|بودكاست|podcast|مقال|blog)/i,
  /اعمل\s*(لي)?\s*(ريلز|ريل|فيديو|محتوى)/i,
  /سوّي?\s*(لي)?\s*(ريلز|ريل|فيديو|محتوى)/i,
  /سكريبت\s*(ريلز|ريل|short|تيك\s*توك|tiktok|يوتيوب|youtube|بودكاست|podcast|مقال|blog|فيديو|محتوى)/i,
  /(?:صنع?|اعمل|اكتب)\s*(?:لي)?\s*(?:محتوى|فيديو)\s*(?:عن|لـ|في)/i,
  /سيناريو\s*(لـ|عن|في)/i,
];

/** أنماط إنجليزية صريحة لكتابة سكريبت */
export const EN_SCRIPT_PATTERNS: RegExp[] = [
  /\bwrite\s+(me\s+)?a?\s*script\b/i,
  /\bwrite\s+(me\s+)?a?\s*(youtube|reel|tiktok|podcast|blog|short)\b/i,
  /\bscript\s+(for|about|on)\b/i,
  /\bcreate\s+(a\s+)?(script|reel|tiktok|youtube)/i,
  /\bmake\s+(me\s+)?a?\s*(script|reel|tiktok)\b/i,
  /\bdraft\s+(a\s+)?script\b/i,
];

/** كلمات دلالية لنوع المحتوى */
export const CONTENT_TYPE_HINTS: { type: string; pattern: RegExp }[] = [
  { type: "youtube", pattern: /يوتيوب|youtube|long.?form|فيديو\s*طويل|محاضرة/i },
  { type: "reel", pattern: /ريلز|ريل|short|شورت|reel|short/i },
  { type: "tiktok", pattern: /تيك\s*توك|tiktok|تيك/i },
  { type: "podcast", pattern: /بودكاست|podcast|بودكست/i },
  { type: "blog", pattern: /مقال|blog|بلوك|article|مدونة/i },
];

/** كلمات سلبية — لو موجودة، نقلل الثقة */
export const NEGATIVE_KEYWORDS: RegExp[] = [
  /اشرح|شرح/i,
  /ترجم|translation/i,
  /كود|code|function|برمج/i,
  /لينك|link|url/i,
  /حلل|analyze|تحليل/i,
];

/** كلمات تدل على تحسين سكريبت موجود (refinement) */
export const REFINE_PATTERNS: RegExp[] = [
  /خليه\s*(أقصر|أطول|أقوى|أفضل)/i,
  /عدّل\s*السكريبت/i,
  /غيّر\s*(الـ)?\s*(hook|الخطاف|الـ cta)/i,
  /make\s+it\s+(shorter|longer|better)/i,
  /refine\s+(the\s+)?script/i,
];

// ====== Content Studio Patterns ======

/** أنماط عربية لاستوديو المحتوى (أوسع من script writer) */
export const AR_STUDIO_PATTERNS: RegExp[] = [
  /استوديو\s*محتوى/i,
  /حزمة\s*محتوى/i,
  /خطة\s*محتوى/i,
  /استراتيجية\s*محتوى/i,
  /افكار\s*محتوى/i,
  /أفكار\s*محتوى/i,
  /اعمل\s*(لي)?\s*(حزمة|خطة)\s*محتوى/i,
  /اكتب\s*(لي)?\s*(حزمة|خطة)\s*محتوى/i,
  /content\s*studio/i,
  /content\s*package/i,
  /صنع?\s*محتوى\s*كامل/i,
  /حملة\s*محتوى/i,
  /اعمل\s*(لي)?\s*caption/i,
  /اكتب\s*(لي)?\s*(caption|hashtag|هاشتاج)/i,
  /thumbnail\s*(idea|concept|لـ)/i,
  /صورة\s*مصغرة/i,
];

/** أنماط إنجليزية لاستوديو المحتوى */
export const EN_STUDIO_PATTERNS: RegExp[] = [
  /\bcontent\s+(studio|package|plan|strategy)\b/i,
  /\bcreate\s+(a\s+)?content\s+(plan|package|strategy)\b/i,
  /\bgenerate\s+content\s+ideas\b/i,
  /\bwrite\s+(me\s+)?captions?\b/i,
  /\bhashtag\s+(strategy|ideas|for)\b/i,
  /\bthumbnail\s+(concept|idea|for)\b/i,
  /\bcontent\s+calendar\b/i,
];

/** كلمات تدل على طلب thumbnail/caption/hashtag فقط (محتوى مكمل) */
export const COMPLEMENT_PATTERNS: RegExp[] = [
  /thumbnail/i,
  /caption/i,
  /hashtag|هاشتاج/i,
  /صورة\s*مصغرة/i,
  /جدول\s*نشر/i,
  /content\s*calendar/i,
];


/**
 * استخراج نوع المحتوى من رسالة المستخدم
 */
export function extractContentType(message: string): string {
  for (const hint of CONTENT_TYPE_HINTS) {
    if (hint.pattern.test(message)) return hint.type;
  }
  return "reel"; // default — الأكثر شيوعاً في المنطقة العربية
}

/**
 * استخراج الموضوع من رسالة المستخدم (إزالة كلمات الطلب)
 */
export function extractTopic(message: string): string {
  let topic = message;
  // إزالة الجمل الطلبية الشائعة
  const phrasesToRemove = [
    /اكتب\s*(لي)?\s*سكريبت\s*(عن|لـ|في)?/i,
    /اعمل\s*(لي)?\s*سكريبت\s*(عن|لـ|في)?/i,
    /سوّي?\s*(لي)?\s*سكريبت\s*(عن|لـ|في)?/i,
    /كتابة\s*سكريبت\s*(عن|لـ|في)?/i,
    /اكتب\s*(لي)?\s*(ريلز|ريل|short|تيك\s*توك|tiktok|يوتيوب|youtube|بودكاست|podcast|مقال|blog)\s*(عن|لـ|في)?/i,
    /اعمل\s*(لي)?\s*(ريلز|ريل|فيديو|محتوى)\s*(عن|لـ|في)?/i,
    /write\s+(me\s+)?a?\s*script\s+(about|on|for)?/i,
    /write\s+(me\s+)?a?\s*(youtube|reel|tiktok|podcast|blog|short)\s+(about|on|for)?/i,
    /create\s+(a\s+)?(script|reel|tiktok|youtube)\s+(about|on|for)?/i,
    /make\s+(me\s+)?a?\s*(script|reel|tiktok)\s+(about|on|for)?/i,
  ];
  for (const phrase of phrasesToRemove) {
    topic = topic.replace(phrase, " ").trim();
  }
  // إزالة كلمات نوع المحتوى من الموضوع
  for (const hint of CONTENT_TYPE_HINTS) {
    topic = topic.replace(hint.pattern, " ").trim();
  }
  // تنظيف مسافات زائدة
  topic = topic.replace(/\s+/g, " ").trim();
  return topic || message; // fallback للرسالة الأصلية لو فشل الاستخراج
}
