import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

const KEY_NAMES = ['zhipu_agent_key', 'zhipu_platform_key', 'google_ai_key'];

/**
 * Mask an API key for safe display — show only last 4 characters
 * e.g. "AIza...XXXX" → "XzQ0"
 * Empty or very short values → "••••"
 */
function maskKey(value: string): string {
  if (!value || value.length <= 4) return '••••';
  return '••••' + value.slice(-4);
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const settings = await db.adminSettings.findMany({
      where: { key: { in: KEY_NAMES } },
    });

    // SECURITY: Return masked keys only — never expose full API key values
    const keys: Record<string, string> = {};
    const hasKey: Record<string, boolean> = {};
    for (const keyName of KEY_NAMES) {
      const setting = settings.find((s) => s.key === keyName);
      const rawValue = setting?.value || '';
      keys[keyName] = maskKey(rawValue);
      hasKey[keyName] = rawValue.length > 0;
    }

    return NextResponse.json({ keys, hasKey });
  } catch (error) {
    console.error('Admin api-keys GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json() as Record<string, string>;

    for (const keyName of KEY_NAMES) {
      if (body[keyName] !== undefined) {
        await db.adminSettings.upsert({
          where: { key: keyName },
          update: { value: body[keyName] },
          create: {
            key: keyName,
            value: body[keyName],
            category: 'ai',
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث مفاتيح API بنجاح',
    });
  } catch (error) {
    console.error('Admin api-keys PUT error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
