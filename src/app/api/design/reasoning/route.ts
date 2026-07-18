import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { generateDesignReasoning } from '@/lib/design-reasoning';

export async function POST(request: NextRequest) {
  try {
    // Auth required
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'يرجى تسجيل الدخول أولاً' },
        { status: 401 },
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'جلسة غير صالحة' },
        { status: 401 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { content, model, language } = body as {
      content: string;
      model?: string;
      language?: string;
    };

    if (!content || content.length < 10) {
      return NextResponse.json(
        { success: false, error: 'المحتوى قصير جداً للتحليل' },
        { status: 400 },
      );
    }

    if (content.length > 50000) {
      return NextResponse.json(
        { success: false, error: 'المحتوى طويل جداً (الحد الأقصى 50,000 حرف)' },
        { status: 400 },
      );
    }

    // Generate design reasoning block
    const reasoningBlock = await generateDesignReasoning({
      content,
      model,
      language: language || 'ar',
    });

    return NextResponse.json({
      success: true,
      reasoning: reasoningBlock,
    });
  } catch (error) {
    console.error('Design reasoning error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء تحليل التصميم' },
      { status: 500 },
    );
  }
}
