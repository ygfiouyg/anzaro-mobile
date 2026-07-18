/**
 * Model Selection Helper
 * =======================
 * يرجّع الموديل المختار من الـ request، ولو مش متاح → fallback لـ ZAI.
 *
 * القاعدة: الموديل اللي المستخدم بيختاره في الـ chat هو الأساسي لكل حاجة.
 * ZAI (glm-4-flash / glm-5.2) بقى fallback بس.
 */

import { getModelById } from "@/lib/models";

export interface ModelSelection {
  /** الموديل الأساسي (اللي المستخدم اختاره) */
  model: string;
  /** الـ max tokens بتاع الموديل */
  maxTokens: number;
  /** الـ context window بتاع الموديل (بالـ tokens) */
  contextWindow: number;
  /** اسم الموديل للعرض */
  displayName: string;
  /** الفallback لو الأساسي فشل */
  fallbackModel: string;
  fallbackMaxTokens: number;
  /** هل الموديل ده ZAI fallback؟ */
  isFallback: boolean;
}

/**
 * اقرا الموديل المختار من الـ request body أو query params.
 * لو مش متاح → fallback لـ glm-4-flash (ZAI مجاني).
 */
export function getSelectedModel(requestBody?: { model?: string } | null): ModelSelection {
  const requestedModel = requestBody?.model ?? "";

  // لو فيه model في الـ body → اقرا الـ config بتاعه
  if (requestedModel) {
    // جرّب الـ static models الأول
    const config = getModelById(requestedModel);
    if (config) {
      return {
        model: config.realChatModel || config.id,
        maxTokens: config.maxTokens || 8192,
        contextWindow: config.maxTokens || 8192,
        displayName: config.name,
        fallbackModel: "glm-4-flash",
        fallbackMaxTokens: 8192,
        isFallback: false,
      };
    }

    // لو HF custom model (hf-chat:xxx)
    if (requestedModel.startsWith("hf-chat:")) {
      const hfId = requestedModel.slice(8);
      return {
        model: hfId,
        maxTokens: 8192, // HF models ليها max tokens مختلف — نقراه من الـ inference API بعدين
        contextWindow: 8192,
        displayName: hfId.split("/").pop()?.replace(/-/g, " ").slice(0, 30) || "HF Model",
        fallbackModel: "glm-4-flash",
        fallbackMaxTokens: 8192,
        isFallback: false,
      };
    }
  }

  // fallback افتراضي
  return {
    model: "glm-4-flash",
    maxTokens: 8192,
    contextWindow: 8192,
    displayName: "GLM-4-Flash",
    fallbackModel: "glm-4-flash",
    fallbackMaxTokens: 8192,
    isFallback: true,
  };
}

/**
 * ينفّذ function بالموديل المختار، ولو فشل → fallback لـ ZAI.
 */
export async function withModelFallback<T>(
  selection: ModelSelection,
  primaryFn: (model: string, maxTokens: number) => Promise<T>,
  fallbackFn?: (model: string, maxTokens: number) => Promise<T>,
): Promise<T> {
  try {
    return await primaryFn(selection.model, selection.maxTokens);
  } catch (primaryError) {
    console.warn(`[ModelFallback] Primary ${selection.model} failed, using fallback ${selection.fallbackModel}:`,
      primaryError instanceof Error ? primaryError.message : String(primaryError));
    if (fallbackFn) {
      return await fallbackFn(selection.fallbackModel, selection.fallbackMaxTokens);
    }
    throw primaryError;
  }
}

export default getSelectedModel;
