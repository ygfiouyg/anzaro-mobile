// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Model Verification API
// ═══════════════════════════════════════════════════════════════════════
// Tests ALL registered HuggingFace models by sending minimal requests
// and returns a detailed verification report with status per model.
//
// GET /api/ai/hf-verify
// Requires Bearer token authentication.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import {
  getAllHFModels,
  HF_API_BASE,
  HF_ROUTER_BASE,
  getHFHeaders,
  type HFModelMappingEntry,
  type HFModelCategory,
} from '@/lib/huggingface';

// ─── Types ────────────────────────────────────────────────────────────

type ModelStatus = 'available' | 'loading' | 'failed' | 'rate-limited';

interface ModelVerificationResult {
  modelId: string;
  category: HFModelCategory;
  status: ModelStatus;
  responseTimeMs: number;
  error?: string;
}

interface VerificationReport {
  success: boolean;
  tokenConfigured: boolean;
  tokenMasked: string;
  totalModels: number;
  available: number;
  loading: number;
  failed: number;
  rateLimited: number;
  results: ModelVerificationResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

const VERIFY_TIMEOUT_MS = 30_000; // 30s per model — cold starts can be slow

/**
 * Mask a HuggingFace API token for safe display.
 * e.g. "hf_xxxx...xxxx" → "hf_xxxx...xxxx"
 */
function maskToken(token: string): string {
  if (!token) return '(not set)';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 7)}...${token.slice(-4)}`;
}

/**
 * Determine model status from an HTTP response.
 */
function classifyStatus(statusCode: number, body: string): ModelStatus {
  if (statusCode === 429) return 'rate-limited';
  if (statusCode === 503) {
    if (body.includes('loading') || body.includes('currently loading')) return 'loading';
  }
  return 'failed';
}

// ─── Per-category verification functions ──────────────────────────────

/**
 * Verify a chat model by sending a minimal chat completion request.
 */
async function verifyChatModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url = `${HF_ROUTER_BASE}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        model: model.hfModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      }),
    });

    const body = await response.text().catch(() => '');

    if (response.ok) {
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'available',
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      modelId: model.hfModel,
      category: model.category,
      status: classifyStatus(response.status, body),
      responseTimeMs: Date.now() - start,
      error: body.slice(0, 300),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      modelId: model.hfModel,
      category: model.category,
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: errMsg.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify an image model by sending a tiny image generation request.
 */
async function verifyImageModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url = `${HF_API_BASE}/${model.hfModel}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        inputs: 'test',
        parameters: { width: 64, height: 64 },
      }),
    });

    const body = await response.text().catch(() => '');

    if (response.ok) {
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'available',
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      modelId: model.hfModel,
      category: model.category,
      status: classifyStatus(response.status, body),
      responseTimeMs: Date.now() - start,
      error: body.slice(0, 300),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      modelId: model.hfModel,
      category: model.category,
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: errMsg.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify an ASR model by sending a HEAD request to check if the endpoint responds.
 */
async function verifyASRModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url = `${HF_API_BASE}/${model.hfModel}`;
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: getHFHeaders(),
    });

    const body = response.status >= 400 ? await response.text().catch(() => '') : '';

    // HEAD may not be supported (405) — that still means the endpoint exists
    if (response.ok || response.status === 405) {
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'available',
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      modelId: model.hfModel,
      category: model.category,
      status: classifyStatus(response.status, body),
      responseTimeMs: Date.now() - start,
      error: body.slice(0, 300) || `HTTP ${response.status}`,
    };
  } catch (error) {
    // If HEAD is not supported, try a lightweight GET as fallback
    try {
      const getUrl = `${HF_API_BASE}/${model.hfModel}`;
      const getResponse = await fetch(getUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        headers: getHFHeaders(),
      });

      if (getResponse.ok || getResponse.status === 405 || getResponse.status === 422) {
        return {
          modelId: model.hfModel,
          category: model.category,
          status: 'available',
          responseTimeMs: Date.now() - start,
        };
      }

      const body = await getResponse.text().catch(() => '');
      return {
        modelId: model.hfModel,
        category: model.category,
        status: classifyStatus(getResponse.status, body),
        responseTimeMs: Date.now() - start,
        error: body.slice(0, 300),
      };
    } catch {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'failed',
        responseTimeMs: Date.now() - start,
        error: errMsg.slice(0, 300),
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify a translation model by sending a tiny translation request.
 */
async function verifyTranslationModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url = `${HF_API_BASE}/${model.hfModel}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        inputs: 'Hello',
      }),
    });

    const body = await response.text().catch(() => '');

    if (response.ok) {
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'available',
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      modelId: model.hfModel,
      category: model.category,
      status: classifyStatus(response.status, body),
      responseTimeMs: Date.now() - start,
      error: body.slice(0, 300),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      modelId: model.hfModel,
      category: model.category,
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: errMsg.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify a summarization model by sending a tiny summarization request.
 */
async function verifySummarizationModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url = `${HF_API_BASE}/${model.hfModel}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        inputs: 'The quick brown fox jumps over the lazy dog.',
        parameters: { max_length: 10 },
      }),
    });

    const body = await response.text().catch(() => '');

    if (response.ok) {
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'available',
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      modelId: model.hfModel,
      category: model.category,
      status: classifyStatus(response.status, body),
      responseTimeMs: Date.now() - start,
      error: body.slice(0, 300),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      modelId: model.hfModel,
      category: model.category,
      status: 'failed',
      responseTimeMs: Date.now() - start,
      error: errMsg.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify a single model, dispatching to the correct verifier by category.
 */
async function verifyModel(model: HFModelMappingEntry): Promise<ModelVerificationResult> {
  switch (model.category) {
    case 'chat':
      return verifyChatModel(model);
    case 'image':
      return verifyImageModel(model);
    case 'asr':
      return verifyASRModel(model);
    case 'translation':
      return verifyTranslationModel(model);
    case 'summarization':
      return verifySummarizationModel(model);
    default:
      return {
        modelId: model.hfModel,
        category: model.category,
        status: 'failed',
        responseTimeMs: 0,
        error: `Unknown category: ${model.category}`,
      };
  }
}

// ─── Route Handler ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication check ──
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json(
        { error: 'يجب تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    // ── Token info ──
    const hfToken = process.env.HUGGINGFACE_API_TOKEN || '';
    const tokenConfigured = hfToken.length > 0;

    // ── Collect all models ──
    const allModels = getAllHFModels();

    // ── Verify models in parallel (batches of 3 to avoid rate limits) ──
    const results: ModelVerificationResult[] = [];
    const batchSize = 3;

    for (let i = 0; i < allModels.length; i += batchSize) {
      const batch = allModels.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((model) => verifyModel(model))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const settled = batchResults[j];
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          // Promise rejected — treat as failed
          results.push({
            modelId: batch[j].hfModel,
            category: batch[j].category,
            status: 'failed',
            responseTimeMs: 0,
            error: settled.reason?.message || 'Unknown error',
          });
        }
      }
    }

    // ── Aggregate counts ──
    const available = results.filter((r) => r.status === 'available').length;
    const loading = results.filter((r) => r.status === 'loading').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const rateLimited = results.filter((r) => r.status === 'rate-limited').length;

    // ── Build report ──
    const report: VerificationReport = {
      success: true,
      tokenConfigured,
      tokenMasked: maskToken(hfToken),
      totalModels: allModels.length,
      available,
      loading,
      failed,
      rateLimited,
      results,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('[HF-Verify] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
