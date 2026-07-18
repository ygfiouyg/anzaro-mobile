// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — RAG Status API Endpoint
// ═══════════════════════════════════════════════════════════════════════
// GET /api/rag/status?conversationId=xxx
// Returns the current state of the RAG store for a conversation.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import { getStoreStatus } from '@/lib/rag/rag-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('conversationId');

    if (!conversationId) {
      return Response.json(
        { error: 'معرّف المحادثة مطلوب' },
        { status: 400 }
      );
    }

    const status = getStoreStatus(conversationId);

    return Response.json({
      conversationId,
      isReady: status.isReady,
      isIndexing: status.isIndexing,
      totalLectures: status.totalLectures,
      totalChunks: status.totalChunks,
      indexingProgress: status.indexingProgress,
      lastError: status.lastError,
      lectures: status.lectures.map(l => ({
        id: l.id,
        fileName: l.fileName,
        chunkCount: l.chunks.length,
        fileSize: l.fileSize,
        textLength: l.fullText.length,
        uploadedAt: l.uploadedAt,
      })),
    });
  } catch (error) {
    console.error('[RAG-Status] Error:', error);
    return Response.json(
      { error: 'حدث خطأ' },
      { status: 500 }
    );
  }
}
