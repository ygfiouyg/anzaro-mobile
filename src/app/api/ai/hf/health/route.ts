// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Health Status API
// ═══════════════════════════════════════════════════════════════════════
// GET /api/ai/hf/health
// Returns the health status of all HuggingFace models, including
// rate-limiting, cold start, and availability information.
// Respects admin-disabled models — they are excluded from health counts.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getHFLoadBalancer, type ModelHealth } from '@/lib/hf-load-balancer';
import { getAllChatModelIds } from '@/lib/hf-chat.service';
import { getAllImageModelIds } from '@/lib/hf-image.service';
import { getAllVideoModelIds } from '@/lib/hf-video.service';
import { getDisabledModelIds } from '@/lib/disabled-models';

export async function GET() {
  try {
    const lb = getHFLoadBalancer();
    const now = new Date();
    const disabledIds = await getDisabledModelIds();

    // ─── Chat Models Health ───────────────────────────────────────
    const allChatModelIds = getAllChatModelIds();
    const chatModelIds = allChatModelIds.filter(id => !disabledIds.has(id));
    let chatUsable = 0;
    let chatRateLimited = 0;
    let chatLoading = 0;
    let chatUnavailable = 0;

    for (const modelId of chatModelIds) {
      if (lb.isModelUsable(modelId)) {
        chatUsable++;
      } else {
        const health = lb.getHealthStats(modelId);
        if (health?.loading) {
          chatLoading++;
        } else if (health?.rateLimited) {
          chatRateLimited++;
        } else if (health?.unavailable) {
          chatUnavailable++;
        } else {
          chatUnavailable++;
        }
      }
    }

    // ─── Image Models Health ──────────────────────────────────────
    const allImageModelIds = getAllImageModelIds();
    const imageModelIds = allImageModelIds.filter(id => !disabledIds.has(id));
    let imageUsable = 0;
    let imageRateLimited = 0;
    let imageLoading = 0;
    let imageUnavailable = 0;

    for (const modelId of imageModelIds) {
      if (lb.isModelUsable(modelId)) {
        imageUsable++;
      } else {
        const health = lb.getHealthStats(modelId);
        if (health?.loading) {
          imageLoading++;
        } else if (health?.rateLimited) {
          imageRateLimited++;
        } else if (health?.unavailable) {
          imageUnavailable++;
        } else {
          imageUnavailable++;
        }
      }
    }

    // ─── Video Models Health ──────────────────────────────────────
    const allVideoModelIds = getAllVideoModelIds();
    const videoModelIds = allVideoModelIds.filter(id => !disabledIds.has(id));
    let videoUsable = 0;
    let videoLoading = 0;
    let videoUnavailable = 0;

    for (const modelId of videoModelIds) {
      if (lb.isModelUsable(modelId)) {
        videoUsable++;
      } else {
        const health = lb.getHealthStats(modelId);
        if (health?.loading) {
          videoLoading++;
        } else if (health?.unavailable) {
          videoUnavailable++;
        } else {
          videoUnavailable++;
        }
      }
    }

    // ─── Per-Model Health Details ─────────────────────────────────
    const allModelIds = [...chatModelIds, ...imageModelIds, ...videoModelIds];
    const modelHealth: Record<string, ModelHealthSummary> = {};

    for (const modelId of allModelIds) {
      const health = lb.getHealthStats(modelId);
      if (health) {
        modelHealth[modelId] = {
          usable: lb.isModelUsable(modelId),
          rateLimited: health.rateLimited,
          rateLimitExpiry: health.rateLimitExpiry > 0
            ? new Date(health.rateLimitExpiry).toISOString()
            : null,
          loading: health.loading,
          loadingExpiry: health.loadingExpiry > 0
            ? new Date(health.loadingExpiry).toISOString()
            : null,
          successCount: health.successCount,
          failCount: health.failCount,
          avgResponseMs: Math.round(health.avgResponseMs),
          lastSuccessAt: health.lastSuccessAt > 0
            ? new Date(health.lastSuccessAt).toISOString()
            : null,
          unavailable: health.unavailable,
          unavailableExpiry: health.unavailableExpiry > 0
            ? new Date(health.unavailableExpiry).toISOString()
            : null,
          disabled: disabledIds.has(modelId),
        };
      }
    }

    // ─── Return Health Report ─────────────────────────────────────
    return NextResponse.json({
      timestamp: now.toISOString(),
      chat: {
        total: chatModelIds.length,
        usable: chatUsable,
        rateLimited: chatRateLimited,
        loading: chatLoading,
        unavailable: chatUnavailable,
      },
      image: {
        total: imageModelIds.length,
        usable: imageUsable,
        rateLimited: imageRateLimited,
        loading: imageLoading,
        unavailable: imageUnavailable,
      },
      video: {
        total: videoModelIds.length,
        usable: videoUsable,
        loading: videoLoading,
        unavailable: videoUnavailable,
      },
      disabledModelsCount: disabledIds.size,
      modelHealth,
    });
  } catch (error) {
    console.error('[HF-Health] Error fetching health status:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب حالة النماذج. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}

/** Summary health info for a single model */
interface ModelHealthSummary {
  usable: boolean;
  rateLimited: boolean;
  rateLimitExpiry: string | null;
  loading: boolean;
  loadingExpiry: string | null;
  successCount: number;
  failCount: number;
  avgResponseMs: number;
  lastSuccessAt: string | null;
  unavailable: boolean;
  unavailableExpiry: string | null;
  disabled: boolean;
}
