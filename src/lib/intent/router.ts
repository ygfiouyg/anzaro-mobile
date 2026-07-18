/**
 * Intent Router
 * =============
 * بيكشف نية المستخدم من رسالته ويوجهها للأداة المناسبة.
 * حالياً بيدعم: Script Writer
 * (ممكن نضيف أدوات تانية بعدين بنفس النمط)
 */

import {
  AR_SCRIPT_PATTERNS,
  EN_SCRIPT_PATTERNS,
  AR_STUDIO_PATTERNS,
  EN_STUDIO_PATTERNS,
  NEGATIVE_KEYWORDS,
  REFINE_PATTERNS,
  extractContentType,
  extractTopic,
} from "./patterns";

export type ContentType = "youtube" | "reel" | "tiktok" | "podcast" | "blog" | "twitter-thread";

export interface IntentMatch {
  matched: boolean;
  tool?: "script-writer" | "content-studio";
  contentType?: ContentType;
  topic?: string;
  confidence: "high" | "low";
  isRefinement?: boolean;
}

/**
 * كشف نية كتابة سكريبت من رسالة المستخدم.
 * بيرجع match فيه contentType + topic + confidence.
 */
export function detectScriptWriterIntent(
  message: string,
  options: { inScriptSession?: boolean } = {},
): IntentMatch {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 4) return { matched: false };

  // لو في session سكريبت سابق، والرسالة فيها refinement pattern
  if (options.inScriptSession) {
    for (const pattern of REFINE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          matched: true,
          tool: "script-writer",
          contentType: "reel", // هيتحدد من الـ context السابق
          topic: trimmed,
          confidence: "high",
          isRefinement: true,
        };
      }
    }
  }

  // فحص الأنماط العربية
  let arMatch = false;
  for (const pattern of AR_SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      arMatch = true;
      break;
    }
  }

  // فحص الأنماط الإنجليزية
  let enMatch = false;
  for (const pattern of EN_SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      enMatch = true;
      break;
    }
  }

  if (!arMatch && !enMatch) return { matched: false };

  // فحص الكلمات السلبية — لو موجودة كتير، نقلل الثقة
  let negativeCount = 0;
  for (const neg of NEGATIVE_KEYWORDS) {
    if (neg.test(trimmed)) negativeCount++;
  }

  const contentType = extractContentType(trimmed) as ContentType;
  const topic = extractTopic(trimmed);

  // الثقة عالية لو:
  // 1. فيه نوع محتوى صريح
  // 2. مفيش كلمات سلبية كتير (≤ 1)
  // 3. الموضوع طويل كفاية (≥ 3 chars)
  const hasExplicitContentType = contentType !== "reel" || /ريلز|ريل|short|reel|short/i.test(trimmed);
  const topicLongEnough = topic.length >= 3;
  const confidence: "high" | "low" =
    hasExplicitContentType && negativeCount <= 1 && topicLongEnough ? "high" : "low";

  // لو الثقة منخفضة بسبب كلمات سلبية كتير، نرفض
  if (negativeCount >= 2) return { matched: false };

  return {
    matched: true,
    tool: "script-writer",
    contentType,
    topic,
    confidence,
  };
}

/**
 * كشف نية استخدام استوديو المحتوى المتكامل.
 * أوسع من script writer — بيشمل أفكار + thumbnail + captions + استراتيجية.
 */
export function detectContentStudioIntent(message: string): IntentMatch {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 4) return { matched: false };

  // فحص الأنماط العربية
  let arMatch = false;
  for (const pattern of AR_STUDIO_PATTERNS) {
    if (pattern.test(trimmed)) {
      arMatch = true;
      break;
    }
  }

  // فحص الأنماط الإنجليزية
  let enMatch = false;
  for (const pattern of EN_STUDIO_PATTERNS) {
    if (pattern.test(trimmed)) {
      enMatch = true;
      break;
    }
  }

  if (!arMatch && !enMatch) return { matched: false };

  let negativeCount = 0;
  for (const neg of NEGATIVE_KEYWORDS) {
    if (neg.test(trimmed)) negativeCount++;
  }
  if (negativeCount >= 2) return { matched: false };

  const contentType = extractContentType(trimmed) as ContentType;
  const topic = extractTopic(trimmed);
  const topicLongEnough = topic.length >= 3;
  const confidence: "high" | "low" = topicLongEnough && negativeCount <= 1 ? "high" : "low";

  return {
    matched: true,
    tool: "content-studio",
    contentType,
    topic,
    confidence,
  };
}

/**
 * فحص شامل للنية — بيرجع أول match من كل أدواتنا.
 * أولوية: content-studio (أوسع) > script-writer (أضيق)
 */
export function detectIntent(
  message: string,
  options: { inScriptSession?: boolean } = {},
): IntentMatch {
  // 1. لو فيه keywords استوديو (حزمة محتوى، أفكار، thumbnail، captions، إلخ) → content studio
  const studioIntent = detectContentStudioIntent(message);
  if (studioIntent.matched && studioIntent.confidence === "high") {
    return studioIntent;
  }

  // 2. لو طلب سكريبت صراحة → script writer
  const scriptIntent = detectScriptWriterIntent(message, options);
  if (scriptIntent.matched && scriptIntent.confidence === "high") {
    return scriptIntent;
  }

  // 3. لو في match بأي ثقة
  if (studioIntent.matched) return studioIntent;
  if (scriptIntent.matched) return scriptIntent;

  return { matched: false };
}
