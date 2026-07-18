import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { deleteGenerativeAsset } from '@/lib/cleanup';

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/chat/files/[id]
//
// Deletes a generated file (PDF, image, etc.) from both:
//   1. The disk (download/ directory)
//   2. The database (GenerativeAsset record)
//
// FIX M7: Previously, the FilesPanel delete button only removed the file
// from the frontend state (Zustand store), leaving the file on disk and
// the DB record intact. This caused disk space to grow unboundedly.
// ═══════════════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Require authentication
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
    }

    // Delete the asset and its file from disk
    const result = await deleteGenerativeAsset(id, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[Files Delete] Error:', error);
    return NextResponse.json({ error: 'فشل في حذف الملف' }, { status: 500 });
  }
}
