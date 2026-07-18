// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Models Catalog API
// ═══════════════════════════════════════════════════════════════════════
// GET /api/ai/hf/models
// Returns all available HF models grouped by category (chat, image, video).
// Supports optional ?category=chat|image|video query parameter for filtering.
// Respects admin-disabled models — they are excluded from the response.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import {
  getChatModels,
  HFChatCategory,
  HF_CHAT_CATEGORIES,
  getModelsByCategory,
  getAllChatModelIds,
  type HFChatModelEntry,
} from '@/lib/hf-chat.service';
import {
  HF_IMAGE_MODELS,
  getAllImageModelIds,
  type HFImageModelEntry,
} from '@/lib/hf-image.service';
import {
  HF_VIDEO_MODELS,
  getAllVideoModelIds,
  type HFVideoModelEntry,
} from '@/lib/hf-video.service';
import { getHFLoadBalancer } from '@/lib/hf-load-balancer';
import { getDisabledModelIds, filterDisabledModels } from '@/lib/disabled-models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category'); // chat | image | video

    // ─── Fetch disabled model IDs ───────────────────────────────────
    const disabledIds = await getDisabledModelIds();

    // ─── Build Chat Models Data ───────────────────────────────────
    const chatModelsRecord = await getChatModels();
    const chatModelsMap: Record<string, HFChatModelEntry> = {};
    for (const [id, entry] of Object.entries(chatModelsRecord)) {
      if (!disabledIds.has(id)) {
        chatModelsMap[id] = entry;
      }
    }

    // Group chat models by category
    const chatCategories: Record<string, HFChatModelEntry[]> = {};
    for (const cat of HF_CHAT_CATEGORIES) {
      const models = getModelsByCategory(cat).filter(m => !disabledIds.has(m.id));
      if (models.length > 0) {
        chatCategories[cat] = models;
      }
    }

    const chatModelIds = Object.keys(chatModelsMap);

    // ─── Build Image Models Data ──────────────────────────────────
    const imageModelsMap: Record<string, HFImageModelEntry> = filterDisabledModels(
      HF_IMAGE_MODELS, disabledIds
    );
    const imageModelIds = Object.keys(imageModelsMap);

    // ─── Build Video Models Data ──────────────────────────────────
    const videoModelsMap: Record<string, HFVideoModelEntry> = filterDisabledModels(
      HF_VIDEO_MODELS, disabledIds
    );
    const videoModelIds = Object.keys(videoModelsMap);

    // ─── Build Health Summary ─────────────────────────────────────
    const lb = getHFLoadBalancer();
    const allModelIds = [...chatModelIds, ...imageModelIds, ...videoModelIds];
    let usableModels = 0;
    let rateLimitedModels = 0;
    let loadingModels = 0;
    let unavailableModels = 0;

    for (const modelId of allModelIds) {
      if (lb.isModelUsable(modelId)) {
        usableModels++;
      } else {
        const health = lb.getHealthStats(modelId);
        if (health?.rateLimited) {
          rateLimitedModels++;
        } else if (health?.loading) {
          loadingModels++;
        } else if (health?.unavailable) {
          unavailableModels++;
        } else {
          // Unknown reason — count as unavailable
          unavailableModels++;
        }
      }
    }

    const healthSummary = {
      usableModels,
      rateLimitedModels,
      loadingModels,
      unavailableModels,
      disabledModels: disabledIds.size,
    };

    // ─── Apply Category Filter ────────────────────────────────────
    if (categoryFilter) {
      switch (categoryFilter) {
        case 'chat':
          return NextResponse.json({
            chat: {
              categories: Object.keys(chatCategories),
              models: chatModelsMap,
              totalCount: chatModelIds.length,
            },
            health: healthSummary,
          });

        case 'image':
          return NextResponse.json({
            image: {
              models: imageModelsMap,
              totalCount: imageModelIds.length,
            },
            health: healthSummary,
          });

        case 'video':
          return NextResponse.json({
            video: {
              models: videoModelsMap,
              totalCount: videoModelIds.length,
            },
            health: healthSummary,
          });

        default:
          return NextResponse.json(
            { error: 'قيمة غير صالحة لمعامل الفئة. استخدم: chat, image, أو video' },
            { status: 400 }
          );
      }
    }

    // ─── Return All Categories ────────────────────────────────────
    return NextResponse.json({
      chat: {
        categories: Object.keys(chatCategories),
        models: chatModelsMap,
        totalCount: chatModelIds.length,
      },
      image: {
        models: imageModelsMap,
        totalCount: imageModelIds.length,
      },
      video: {
        models: videoModelsMap,
        totalCount: videoModelIds.length,
      },
      health: healthSummary,
    });
  } catch (error) {
    console.error('[HF-Models] Error fetching models:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب قائمة النماذج. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
