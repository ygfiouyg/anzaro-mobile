import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const broadcasts = await db.voiceBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ broadcasts });
  } catch (error) {
    console.error('Admin broadcast GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json();
    const { title } = body as { title?: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'نص الرسالة مطلوب' }, { status: 400 });
    }

    if (title.length > 5000) {
      return NextResponse.json({ error: 'نص الرسالة طويل جداً (الحد الأقصى 5000 حرف)' }, { status: 400 });
    }

    const broadcast = await db.voiceBroadcast.create({
      data: {
        title: title.trim(),
        audioUrl: '',
        duration: 0,
      },
    });

    // ── Generate audio for the broadcast using Edge TTS ──
    try {
      const { synthesizeSpeech } = await import('@/lib/edge-tts');
      const audioBuffer = await synthesizeSpeech({
        text: title.trim().slice(0, 5000),
        voice: 'ar-EG-ShakirNeural',
        rate: '+0%',
      });
      
      if (audioBuffer.length > 100) {
        // Save audio to file system
        const fs = await import('fs/promises');
        const path = await import('path');
        const audioDir = path.join(process.cwd(), 'download', 'broadcasts');
        await fs.mkdir(audioDir, { recursive: true });
        const audioFileName = `broadcast-${broadcast.id}.mp3`;
        const audioFilePath = path.join(audioDir, audioFileName);
        await fs.writeFile(audioFilePath, audioBuffer);
        
        // Estimate duration (MP3 at ~128kbps ≈ 16KB per second)
        const estimatedDuration = Math.ceil(audioBuffer.length / 16000);
        
        // Update broadcast with audio URL and duration
        await db.voiceBroadcast.update({
          where: { id: broadcast.id },
          data: {
            audioUrl: `/api/pdf/serve/broadcasts/${audioFileName}`,
            duration: estimatedDuration,
          },
        });
        
        console.log(`[Broadcast] Audio generated: ${audioFileName} (${estimatedDuration}s)`);
      }
    } catch (ttsError) {
      // TTS generation is optional — broadcast is still created without audio
      console.error('[Broadcast] TTS generation failed (non-fatal):', ttsError instanceof Error ? ttsError.message : String(ttsError));
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال الرسالة الجماعية بنجاح',
      broadcast,
    });
  } catch (error) {
    console.error('Admin broadcast POST error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'معرف الرسالة مطلوب' }, { status: 400 });
    }

    const existing = await db.voiceBroadcast.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });
    }

    await db.voiceBroadcast.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'تم حذف الرسالة بنجاح',
    });
  } catch (error) {
    console.error('Admin broadcast DELETE error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
