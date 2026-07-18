// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — RAG Query API Endpoint
// ═══════════════════════════════════════════════════════════════════════
// POST /api/rag/query
// Queries the RAG store for a conversation and returns relevant chunks.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { queryLectures, buildRAGContext, hasLectureContext, getLecturesSummary } from '@/lib/rag/rag-engine';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  try {
    const body = await request.json();
    const { conversationId, query, topK = 8, language = 'ar' } = body;

    if (!conversationId || !query) {
      return Response.json(
        { error: 'معرّف المحادثة والاستعلام مطلوبان' },
        { status: 400 }
      );
    }

    // Check if the conversation has lectures
    if (!hasLectureContext(conversationId)) {
      return Response.json({
        hasContext: false,
        results: [],
        context: '',
      });
    }

    // Query the store
    const results = await queryLectures(conversationId, query, topK);

    // Build context
    const context = results.length > 0
      ? buildRAGContext(results, language)
      : getLecturesSummary(conversationId, language);

    return Response.json({
      hasContext: true,
      results: results.map(r => ({
        content: r.chunk.content,
        sourceFile: r.chunk.sourceFile,
        sectionHeader: r.chunk.sectionHeader,
        score: r.score,
      })),
      context,
    });
  } catch (error) {
    console.error('[RAG-Query] Error:', error);
    return Response.json(
      { error: 'حدث خطأ أثناء البحث' },
      { status: 500 }
    );
  }
});
