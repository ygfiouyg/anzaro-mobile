// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Google Drive File Serve API Route
// ═══════════════════════════════════════════════════════════════════════
// GET /api/ai/drive/file/[fileId]
// Returns: File content as downloadable stream or JSON metadata
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getFileBuffer, downloadAndParseFile } from '@/lib/google-drive.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json(
        { error: 'يرجى تقديم معرف الملف' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'download'; // 'download' | 'text'

    if (mode === 'text') {
      // Return parsed text content as JSON
      const parsed = await downloadAndParseFile(fileId);

      return NextResponse.json({
        fileId: parsed.fileId,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        text: parsed.text,
        truncated: parsed.truncated,
        sizeBytes: parsed.sizeBytes,
      });
    }

    // mode === 'download': Return the raw file as a download
    const result = await getFileBuffer(fileId);

    if (!result) {
      return NextResponse.json(
        { error: 'لم يتم العثور على الملف أو لا يمكن الوصول إليه' },
        { status: 404 }
      );
    }

    // Return the file as a downloadable response
    const headers = new Headers();
    headers.set('Content-Type', result.mimeType);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`);
    headers.set('Content-Length', String(result.buffer.length));

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[Drive API] File serve error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب الملف من Google Drive' },
      { status: 500 }
    );
  }
}
