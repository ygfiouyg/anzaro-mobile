import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * POST /api/pdf/link
 * Link a PDF asset to a conversation by saving a message with the PDF reference
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'يرجى تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'جلسة غير صالحة' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { assetId, conversationId } = body as {
      assetId: string;
      conversationId: string;
    };

    if (!assetId || !conversationId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف ومعرف المحادثة مطلوبان' },
        { status: 400 }
      );
    }

    // Verify the asset belongs to the user
    const asset = await db.generativeAsset.findFirst({
      where: { id: assetId, userId: user.id, type: 'pdf' },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود أو لا تملك صلاحية الوصول إليه' },
        { status: 404 }
      );
    }

    // Verify the conversation belongs to the user
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها' },
        { status: 404 }
      );
    }

    // Create a system message in the conversation linking the PDF
    const message = await db.message.create({
      data: {
        content: `📄 ملف PDF مرتبط: ${asset.title}\nيمكنك تحميل الملف من قسم الملفات أو من منشئ PDF.`,
        role: 'assistant',
        model: 'delta-pdf-link',
        language: conversation.language || 'ar',
        conversationId,
        userId: user.id,
        pdfUrl: `/api/pdf/download/${assetId}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        pdfUrl: message.pdfUrl,
      },
    });
  } catch (error) {
    console.error('PDF link error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء ربط PDF بالمحادثة' },
      { status: 500 }
    );
  }
}
