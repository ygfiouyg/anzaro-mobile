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

    const settings = await db.adminSettings.findMany({
      orderBy: { category: 'asc' },
    });

    // Group by category
    const grouped: Record<string, Record<string, string>> = {};
    for (const setting of settings) {
      if (!grouped[setting.category]) {
        grouped[setting.category] = {};
      }
      grouped[setting.category][setting.key] = setting.value;
    }

    return NextResponse.json({
      settings: grouped,
      raw: settings,
    });
  } catch (error) {
    console.error('Admin settings GET error:', error);
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

    // ── FIX: Whitelist allowed setting keys to prevent arbitrary key creation ──
    const ALLOWED_SETTING_KEYS = [
      'zhipu_agent_key', 'zhipu_platform_key', 'google_ai_key',
      'openrouter_api_key', 'groq_api_key', 'cerebras_api_key',
      'gemini_api_key', 'huggingface_api_token', 'github_models_token',
      'gd_folder_id', 'brevo_api_key', 'brevo_sender_email', 'brevo_sender_name',
      'resend_api_key', 'resend_from_email', 'sender_email', 'email_pass',
    ];

    // Update each provided setting key
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;
      if (!ALLOWED_SETTING_KEYS.includes(key)) {
        return NextResponse.json(
          { error: `مفتاح الإعداد "${key}" غير مسموح به` },
          { status: 400 }
        );
      }
      await db.adminSettings.upsert({
        where: { key },
        update: { value },
        create: {
          key,
          value,
          category: 'general',
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث الإعدادات بنجاح',
    });
  } catch (error) {
    console.error('Admin settings PUT error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
