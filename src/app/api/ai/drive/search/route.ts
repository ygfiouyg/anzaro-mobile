// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Google Drive Search API Route
// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/drive/search
// Body: { query: string, fetchContent?: boolean }
// Returns: { files: DriveFile[], content?: string, detectedReferences?: string[] }
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { searchDriveFiles, searchAndFetch } from '@/lib/google-drive.service';
import { detectFileReferences } from '@/lib/drive-rag';

// Arabic error prefixes that indicate no useful content was extracted
const ERROR_PREFIXES = ['[لم يتم استخراج', '[نوع الملف غير مدعوم', '[الملف كبير', '[حدث خطأ'];

function isUsableContent(text: string): boolean {
  if (!text) return false;
  return !ERROR_PREFIXES.some((prefix) => text.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, fetchContent = false } = body as {
      query: string;
      fetchContent?: boolean;
    };

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'يرجى تقديم نص البحث' },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      return NextResponse.json(
        { error: 'نص البحث قصير جداً' },
        { status: 400 }
      );
    }

    // Detect file references in the query
    const detectedReferences = detectFileReferences(trimmedQuery);

    if (fetchContent) {
      // Full search + fetch content
      const result = await searchAndFetch(trimmedQuery);

      // Combine all content into a single string for AI context
      const contentText = result.contents
        .filter((c) => isUsableContent(c.text))
        .map((c) => `${c.fileName}:\n${c.text}`)
        .join('\n\n---\n\n');

      return NextResponse.json({
        files: result.files,
        content: contentText || undefined,
        detectedReferences,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } else {
      // Search only, no content fetching
      const files = await searchDriveFiles(trimmedQuery);

      return NextResponse.json({
        files,
        detectedReferences,
      });
    }
  } catch (error) {
    console.error('[Drive API] Search error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء البحث في Google Drive' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json(
        { error: 'يرجى تقديم نص البحث (?q=...)' },
        { status: 400 }
      );
    }

    const files = await searchDriveFiles(query);

    return NextResponse.json({
      files,
    });
  } catch (error) {
    console.error('[Drive API] Search GET error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء البحث في Google Drive' },
      { status: 500 }
    );
  }
}
