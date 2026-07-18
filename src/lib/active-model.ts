/**
 * Active Model Helper
 * ===================
 * بيقرا الموديل المختار من الـ request headers/body ويستخدمه في كل حاجة.
 * كل الـ routes اللي بتستخدم GLM ثابت لازم تستخدم ده بداله.
 */

import { getModelById } from "@/lib/models";

/**
 * اقرا الموديل المختار من الـ request.
 * الـ frontend بيبعت الموديل في الـ body (model field) أو في header.
 */
export function getActiveModel(request: Request): string {
  // 1. جرّب header
  const headerModel = request.headers.get("x-active-model");
  if (headerModel) return resolveModel(headerModel);

  // 2. default: glm-4-flash (ZAI fallback)
  return "glm-4-flash";
}

/** حوّل model ID للـ real chat model name */
function resolveModel(modelId: string): string {
  const config = getModelById(modelId);
  if (config) {
    return config.realChatModel || config.id;
  }
  // HF custom model
  if (modelId.startsWith("hf-chat:")) {
    return modelId.slice(8);
  }
  return modelId;
}

/**
 * اقرا الموديل من body field.
 * للاستخدام في routes بتقبل POST body فيه { model: "xxx" }
 */
export function resolveActiveModel(bodyModel: string | undefined): string {
  if (!bodyModel) return "glm-4-flash";
  return resolveModel(bodyModel);
}

/** الـ maxTokens بتاع الموديل المختار */
export function getActiveModelMaxTokens(modelId: string): number {
  const config = getModelById(modelId) as any;
  if (config?.maxTokens) return config.maxTokens;
  if (modelId.startsWith("hf-chat:")) return 8192;
  return 8192;
}

export default getActiveModel;
