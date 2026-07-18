import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const downloadDir = join(process.cwd(), 'download');

    if (!existsSync(downloadDir)) {
      return NextResponse.json({ files: [] });
    }

    const entries = readdirSync(downloadDir);
    const files = entries
      .map((name) => {
        const filePath = join(downloadDir, name);
        try {
          const stats = statSync(filePath);
          if (stats.isDirectory()) return null;
          return {
            name,
            size: stats.size,
            date: stats.mtime.toISOString(),
            type: getFileType(name),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.date).getTime() - new Date(a!.date).getTime());

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Admin drive files GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    pdf: 'pdf',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    mp3: 'audio',
    wav: 'audio',
    ogg: 'audio',
    mp4: 'video',
    webm: 'video',
    txt: 'document',
    md: 'document',
    csv: 'document',
    json: 'document',
    doc: 'document',
    docx: 'document',
    xls: 'document',
    xlsx: 'document',
    ppt: 'document',
    pptx: 'document',
  };
  return types[ext] || 'other';
}
