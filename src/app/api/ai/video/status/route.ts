import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { traceError, traceImage, traceDB } from '@/lib/trace-logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════
// VIDEO STATUS POLLING — LEGACY + HuggingFace
// ═══════════════════════════════════════════════════════════════════
// HuggingFace Gradio returns video synchronously, so new tasks
// won't need polling. This endpoint remains for:
//   1. Legacy Z-AI/ZhipuAI tasks still in the database
//   2. Any edge cases where polling is needed
// ═══════════════════════════════════════════════════════════════════

const ZHIPU_PLATFORM_KEY = process.env.ZHIPU_PLATFORM_KEY || '';
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ error: 'معرف المهمة مطلوب' }, { status: 400 });

    const prompt = request.nextUrl.searchParams.get('prompt') || '';
    const provider = request.nextUrl.searchParams.get('provider') || '';

    // ═══════════════════════════════════════════════════════════════
    // Determine which provider to poll
    // ═══════════════════════════════════════════════════════════════
    let resolvedProvider = provider;

    if (!resolvedProvider) {
      try {
        const originalAsset = await db.generativeAsset.findFirst({
          where: { filePath: { contains: taskId }, userId: user.id },
          orderBy: { createdAt: 'desc' },
        });
        if (originalAsset?.metadata) {
          const meta = JSON.parse(originalAsset.metadata);
          resolvedProvider = meta.provider || '';
        }
      } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // HuggingFace — should not need polling (returns video directly)
    // But handle it gracefully if somehow called
    // ═══════════════════════════════════════════════════════════════
    if (resolvedProvider === 'huggingface') {
      return NextResponse.json({
        success: false,
        taskStatus: 'FAIL',
        error: 'نماذج HuggingFace تُرجع الفيديو مباشرة ولا تحتاج استعلام حالة.',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Legacy: Poll z-ai-web-dev-sdk
    // ═══════════════════════════════════════════════════════════════
    if (resolvedProvider === 'zai') {
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();

        const result = await zai.async.result.query(taskId);

        if (result.task_status === 'PROCESSING') {
          return NextResponse.json({
            success: true,
            taskStatus: 'PROCESSING',
            taskId: taskId,
            provider: 'zai',
          });
        }

        if (result.task_status === 'FAIL') {
          return NextResponse.json({
            success: false,
            taskStatus: 'FAIL',
            error: 'فشل في توليد الفيديو. يرجى المحاولة مرة أخرى.',
          });
        }

        // SUCCESS — download and save the video
        let videoUrl: string | null = null;
        if (result.video_result?.[0]?.url) videoUrl = result.video_result[0].url;
        else if (result.video_url) videoUrl = result.video_url;
        else if (result.url) videoUrl = result.url;
        else if (result.video) videoUrl = result.video;

        if (!videoUrl) {
          return NextResponse.json(
            { error: 'لم يتم العثور على الفيديو المُولد', taskStatus: 'SUCCESS' },
            { status: 500 }
          );
        }

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          return NextResponse.json({ error: 'فشل تحميل الفيديو' }, { status: 500 });
        }

        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        const downloadDir = path.join(process.cwd(), 'download');
        await mkdir(downloadDir, { recursive: true });
        const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const filename = `${videoId}.mp4`;
        const absoluteFilePath = path.join(downloadDir, filename);
        await writeFile(absoluteFilePath, videoBuffer);
        const fileSize = videoBuffer.length;

        let realModelName = 'cogvideox-flash';
        try {
          const originalAsset = await db.generativeAsset.findFirst({
            where: { filePath: { contains: taskId }, userId: user.id },
            orderBy: { createdAt: 'desc' },
          });
          if (originalAsset?.metadata) {
            const meta = JSON.parse(originalAsset.metadata);
            if (meta.realModel || meta.backendModel) realModelName = meta.realModel || meta.backendModel;
          }
        } catch {}

        const asset = await db.generativeAsset.create({
          data: {
            type: 'video',
            title: prompt ? prompt.slice(0, 100) : 'فيديو مُولد',
            prompt: prompt,
            filePath: absoluteFilePath,
            fileSize,
            model: realModelName,
            metadata: JSON.stringify({ format: 'mp4', taskId, realModel: realModelName, provider: 'zai' }),
            userId: user.id,
          },
        });

        return NextResponse.json({
          success: true,
          taskStatus: 'SUCCESS',
          videoUrl: `/api/ai/video/download/${asset.id}`,
          assetId: asset.id,
          size: fileSize,
        });
      } catch (zaiError) {
        traceError(`خطأ في استعلام حالة فيديو Z-AI: ${zaiError instanceof Error ? zaiError.message : 'خطأ'}`);
        return NextResponse.json({ error: 'حدث خطأ أثناء الاستعلام عن حالة الفيديو' }, { status: 500 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Legacy: Poll ZhipuAI
    // ═══════════════════════════════════════════════════════════════
    const url = `${ZHIPU_API_BASE}/async-result?id=${encodeURIComponent(taskId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ZHIPU_PLATFORM_KEY}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      traceError(`فشل استعلام حالة الفيديو: ${response.status} ${errorBody.slice(0, 100)}`);
      return NextResponse.json({ error: 'فشل الاستعلام عن حالة المهمة', taskStatus: 'FAIL' }, { status: 500 });
    }

    const result = await response.json();

    if (result.task_status === 'PROCESSING') {
      return NextResponse.json({ success: true, taskStatus: 'PROCESSING', taskId, provider: 'zhipuai' });
    }

    if (result.task_status === 'FAIL') {
      const failReason = result.error?.message || 'فشل في توليد الفيديو';
      return NextResponse.json({
        success: false,
        taskStatus: 'FAIL',
        error: failReason.includes('sensitive') || failReason.includes('不安全')
          ? 'تم رفض الطلب بسبب محتوى حساس. يرجى تعديل الوصف والمحاولة مرة أخرى.'
          : 'فشل في توليد الفيديو. يرجى المحاولة مرة أخرى.',
      });
    }

    // SUCCESS — download and save the video
    let videoUrl: string | null = null;
    if (result.video_result?.[0]?.url) videoUrl = result.video_result[0].url;
    else if (result.video_url) videoUrl = result.video_url;
    else if (result.url) videoUrl = result.url;
    else if (result.video) videoUrl = result.video;

    if (!videoUrl) {
      return NextResponse.json({ error: 'لم يتم العثور على الفيديو المُولد', taskStatus: 'SUCCESS' }, { status: 500 });
    }

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      return NextResponse.json({ error: 'فشل تحميل الفيديو' }, { status: 500 });
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const downloadDir = path.join(process.cwd(), 'download');
    await mkdir(downloadDir, { recursive: true });
    const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const filename = `${videoId}.mp4`;
    const absoluteFilePath = path.join(downloadDir, filename);
    await writeFile(absoluteFilePath, videoBuffer);
    const fileSize = videoBuffer.length;

    let realModelName = 'cogvideox-flash';
    try {
      const originalAsset = await db.generativeAsset.findFirst({
        where: { filePath: { contains: taskId }, userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (originalAsset?.metadata) {
        const meta = JSON.parse(originalAsset.metadata);
        if (meta.realModel || meta.backendModel) realModelName = meta.realModel || meta.backendModel;
      }
    } catch {}

    const asset = await db.generativeAsset.create({
      data: {
        type: 'video',
        title: prompt ? prompt.slice(0, 100) : 'فيديو مُولد',
        prompt: prompt,
        filePath: absoluteFilePath,
        fileSize,
        model: realModelName,
        metadata: JSON.stringify({ format: 'mp4', taskId, realModel: realModelName }),
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      taskStatus: 'SUCCESS',
      videoUrl: `/api/ai/video/download/${asset.id}`,
      assetId: asset.id,
      size: fileSize,
    });
  } catch (error) {
    traceError(`خطأ في استعلام حالة الفيديو: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json({ error: 'حدث خطأ أثناء الاستعلام عن حالة الفيديو' }, { status: 500 });
  }
}
