import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * V.44: PDF Upload Endpoint
 * 
 * Uploads a PDF file separately from the chat message to avoid
 * sending a 5MB+ base64 blob inline in the chat request body.
 * 
 * Flow:
 * 1. Frontend uploads PDF here → gets back a fileId
 * 2. Frontend sends chat message with [DELTA_PDF_REF:fileId:filename:size]
 * 3. Chat stream route reads the PDF from disk using the fileId
 * 
 * This prevents the "انتهت مهلة الاتصال" (connection timeout) error
 * that happens when a 5MB JSON body is sent to /api/chat/stream.
 */

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'ملف مطلوب' }, { status: 400 });

    // Validate file type
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF فقط' }, { status: 400 });
    }

    // Save to disk
    const uploadDir = join(process.cwd(), 'upload-temp');
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const fileId = randomUUID();
    const filePath = join(uploadDir, `${fileId}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);

    console.log(`[Upload-PDF] Saved ${file.name} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) as ${fileId}`);

    return NextResponse.json({
      fileId,
      fileName: file.name,
      fileSize: buffer.length,
      fileSizeLabel: buffer.length < 1024 * 1024
        ? `${(buffer.length / 1024).toFixed(0)} KB`
        : `${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
    });
  } catch (error) {
    console.error('[Upload-PDF] Error:', error);
    return NextResponse.json(
      { error: 'فشل في رفع الملف' },
      { status: 500 }
    );
  }
}
