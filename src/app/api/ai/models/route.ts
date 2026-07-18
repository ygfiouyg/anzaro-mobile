import { NextResponse } from 'next/server';
import { models, MODEL_CATEGORIES, getModelById, getModelsByCategory, modelToGLM } from '@/lib/models';

// ─── GET /api/ai/models ─────────────────────────────────────────────
// Return the list of available AI models (public — no auth required)
export async function GET() {
  try {
    return NextResponse.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        nameEn: m.nameEn,
        icon: m.icon,
        category: m.category,
        rank: m.rank,
        description: m.description,
        descriptionEn: m.descriptionEn,
        supportsPdf: m.supportsPdf,
        provider: m.provider,
        realChatModel: m.realChatModel,
        realImageModel: m.realImageModel,
        realVideoModel: m.realVideoModel,
        githubChatModel: m.githubChatModel,
        skills: m.skills,
      })),
      categories: MODEL_CATEGORIES,
      modelToGLM,
    });
  } catch (error) {
    console.error('Get models error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل النماذج' },
      { status: 500 }
    );
  }
}
