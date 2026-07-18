/**
 * JSON Helper for MCP Tools
 * =========================
 * دوال مساعدة لاستخراج JSON من استجابات GLM بذكاء:
 * 1. تشيل markdown code fences (```json ... ```)
 * 2. تلتقط JSON object/array حتى لو فيه نص حواليه
 * 3. تتعامل مع استجابات مقطوعة (تحاول تكمّل القوس)
 * 4. retry logic لما GLM يرجّع rate limit (429) أو empty response
 */
import { getZAIClient } from "@/lib/zai-client";

export interface GLMCallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  /** عدد محاولات retry لو GLM رجّع rate limit أو empty (افتراضي: 3) */
  maxRetries?: number;
  /** delay بين المحاولات بالمللي ثانية (افتراضي: 1500) */
  retryDelayMs?: number;
  /** الموديل الأساسي (افتراضي: glm-5.2) */
  model?: string;
  /** الموديل الاحتياطي لو الأساسي فشل بعد الـ retries (افتراضي: glm-4.6-air) */
  fallbackModel?: string;
}

export interface GLMCallResult {
  success: boolean;
  /** JSON object لو تم parsing بنجاح */
  data?: any;
  /** النص الخام لو فشل parsing */
  raw?: string;
  error?: string;
  durationMs: number;
  retries: number;
  /** الموديل اللي اشتغل في النهاية */
  modelUsed?: string;
}

/**
 * استخراج JSON من نص GLM بذكاء.
 * - يشيل markdown fences
 * - يلتقط أول JSON object/array متكامل
 * - يحاول يكمّل الأقواس لو الـ response مقطوع
 */
export function extractJSON(text: string): any | null {
  if (!text) return null;

  // 1) شيل markdown code fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();

  // 2) حاول parse مباشر أولاً (لو الـ response كله JSON)
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 3) ابحث عن أول JSON object { ... }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // حاول نكمّل الأقواس الناقصة
      const fixed = fixUnclosedJSON(objMatch[0]);
      if (fixed) {
        try {
          return JSON.parse(fixed);
        } catch {}
      }
    }
  }

  // 4) ابحث عن أول JSON array [ ... ]
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      const fixed = fixUnclosedJSON(arrMatch[0]);
      if (fixed) {
        try {
          return JSON.parse(fixed);
        } catch {}
      }
    }
  }

  return null;
}

/**
 * محاولة إصلاح JSON مقطوع بإضافة أقواس إغلاق ناقصة.
 * ده مش مثالي، بس بيحاول يكمّل الاستجابة المقصوصة بسبب max_tokens.
 */
function fixUnclosedJSON(jsonStr: string): string | null {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces++;
    else if (ch === "}") openBraces--;
    else if (ch === "[") openBrackets++;
    else if (ch === "]") openBrackets--;
  }

  // لو فيه قوس ناقص، حاول نكمّله
  if (openBraces > 0 || openBrackets > 0) {
    let fixed = jsonStr;
    // لو النص انقطع في نص string، أقفله الأول
    if (inString) fixed += '"';
    // اقفل الأقواس المفتوحة
    for (let i = 0; i < openBrackets; i++) fixed += "]";
    for (let i = 0; i < openBraces; i++) fixed += "}";
    // شيل فاصلة أخيرة لو موجودة قبل الإغلاق
    fixed = fixed.replace(/,(\s*[\]\}])/g, "$1");
    return fixed;
  }

  return null;
}

/**
 * استدعاء GLM مع retry + استخراج JSON تلقائياً + fallback لموديل تاني.
 *
 * الاستراتيجية:
 *   1. جرّب الموديل الأساسي (default: glm-5.2) حتى maxRetries+1 مرة.
 *   2. لو كل المحاولات فشلت (empty أو rate-limit) → جرّب الموديل الاحتياطي (default: glm-4.6-air).
 *   3. ارجع أول نجاح.
 *
 * مثال:
 *   const result = await callGLMForJSON({
 *     systemPrompt: "ولّد...",
 *     userMessage: topic,
 *     maxTokens: 2500,
 *   });
 *   if (result.success) return { success: true, data: result.data };
 */
export async function callGLMForJSON(opts: GLMCallOptions): Promise<GLMCallResult> {
  const {
    systemPrompt,
    userMessage,
    maxTokens = 2500,
    temperature = 0.5,
    maxRetries = 3,
    retryDelayMs = 1500,
    model = "glm-5.2",
    fallbackModel = "glm-4.6-air",
  } = opts;

  const start = Date.now();
  let lastError = "";
  let lastRaw = "";
  let retries = 0;
  let modelUsed = "";

  // جرّب كل الموديلات بالترتيب: الأساسي، بعدين الاحتياطي
  const modelsToTry = [model];
  if (fallbackModel && fallbackModel !== model) modelsToTry.push(fallbackModel);

  for (const currentModel of modelsToTry) {
    const isFallback = currentModel !== model;
    const attempts = isFallback ? Math.max(1, maxRetries) : maxRetries + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature,
        });

        const response = completion?.choices?.[0]?.message?.content || "";
        lastRaw = response;

        if (!response || response.trim().length < 5) {
          lastError = `GLM (${currentModel}) رجّع response فاضي (محتمل rate limit)`;
          if (attempt < attempts - 1) {
            retries++;
            // exponential backoff: 1.5s, 3s, 6s
            await sleep(retryDelayMs * Math.pow(1.5, attempt));
            continue;
          }
          break; // جرب الموديل الاحتياطي
        }

        const parsed = extractJSON(response);
        if (parsed !== null) {
          modelUsed = currentModel;
          return {
            success: true,
            data: parsed,
            durationMs: Date.now() - start,
            retries,
            modelUsed,
          };
        }

        // parsing فشل — لو فيه محاولات كمان، retry
        lastError = `فشل parsing JSON من استجابة GLM (${currentModel})`;
        if (attempt < attempts - 1) {
          retries++;
          await sleep(retryDelayMs);
          continue;
        }
      } catch (e: any) {
        lastError = e?.message || "GLM call failed";
        // لو rate limit (429)، retry مع backoff أكبر
        if (/429|rate.?limit|too many/i.test(lastError) && attempt < attempts - 1) {
          retries++;
          // 429 → backoff أكبر: 3s, 6s, 9s
          await sleep(retryDelayMs * (attempt + 2));
          continue;
        }
        // لو مش rate limit (network error مثلاً)، retry بنفس الـ delay
        if (attempt < attempts - 1) {
          retries++;
          await sleep(retryDelayMs);
          continue;
        }
        break; // جرب الموديل الاحتياطي
      }
    }
    // لو الموديل الأساسي فشل كله، نكمل للموديل الاحتياطي
  }

  return {
    success: false,
    error: lastError,
    raw: lastRaw,
    durationMs: Date.now() - start,
    retries,
    modelUsed,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
