import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { recordApiResponseTime, recordError } from '@/lib/system-monitor';

// ─── Admin Approval API ───────────────────────────────────────────────
// Change approval system using AdminSettings table (category: 'system_changes')
// Each change is stored as a JSON value with key format: change_{timestamp}_{random}

interface ChangeRequest {
  type: string;        // e.g. 'code_change', 'config_update', 'api_key_rotation', 'feature_toggle'
  description: string; // Human-readable description
  code: string;        // The code or config change to apply
  impact: string;      // 'low' | 'medium' | 'high' | 'critical'
}

interface ChangeRecord {
  id: string;
  type: string;
  description: string;
  code: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

const VALID_IMPACT_LEVELS = ['low', 'medium', 'high', 'critical'];
const VALID_TYPES = ['code_change', 'config_update', 'api_key_rotation', 'feature_toggle', 'database_migration', 'system_update'];

// ─── Helper: Parse all change records from AdminSettings ──────────────

async function getAllChanges(): Promise<ChangeRecord[]> {
  const settings = await db.adminSettings.findMany({
    where: { category: 'system_changes' },
    orderBy: { updatedAt: 'desc' },
  });

  const changes: ChangeRecord[] = [];
  for (const setting of settings) {
    try {
      const record = JSON.parse(setting.value) as ChangeRecord;
      changes.push(record);
    } catch {
      // Skip malformed entries
    }
  }

  return changes;
}

// ─── GET: List pending changes ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Auth check - admin only
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'غير مصرح - مطلوب صلاحيات الآدمن' },
        { status: 403 }
      );
    }

    const allChanges = await getAllChanges();

    // Filter by status if query param provided
    const statusFilter = request.nextUrl.searchParams.get('status');
    const typeFilter = request.nextUrl.searchParams.get('type');

    let filtered = allChanges;
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }
    if (typeFilter) {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }

    // Sort: pending first, then by submission date (newest first)
    filtered.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

    const duration = Date.now() - requestStart;
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json({
      changes: filtered,
      total: allChanges.length,
      pending: allChanges.filter((c) => c.status === 'pending').length,
      approved: allChanges.filter((c) => c.status === 'approved').length,
      rejected: allChanges.filter((c) => c.status === 'rejected').length,
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    recordError('/api/system/approvals', error instanceof Error ? error.message : 'Unknown error');
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json(
      { error: 'خطأ في جلب التغييرات' },
      { status: 500 }
    );
  }
}

// ─── POST: Submit a change for approval ───────────────────────────────

export async function POST(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Auth check - any authenticated user can submit
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    if (!user) {
      return NextResponse.json(
        { error: 'يرجى تسجيل الدخول' },
        { status: 401 }
      );
    }

    const body = await request.json() as ChangeRequest;
    const { type, description, code, impact } = body;

    // Validate required fields
    if (!type || !description || !code) {
      return NextResponse.json(
        { error: 'النوع والوصف والكود مطلوبون' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `نوع غير صالح. الأنواع المقبولة: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_IMPACT_LEVELS.includes(impact)) {
      return NextResponse.json(
        { error: `مستوى التأثير غير صالح. المستويات المقبولة: ${VALID_IMPACT_LEVELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Code length limit - 100KB
    if (code.length > 100 * 1024) {
      return NextResponse.json(
        { error: 'الكود طويل جداً. الحد الأقصى 100 كيلوبايت' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const changeId = `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const changeRecord: ChangeRecord = {
      id: changeId,
      type,
      description,
      code,
      impact,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      submittedBy: user.id,
    };

    // Store in AdminSettings with category 'system_changes'
    await db.adminSettings.upsert({
      where: { key: changeId },
      update: {
        value: JSON.stringify(changeRecord),
        category: 'system_changes',
        description: `[${type}] ${description.slice(0, 100)}`,
      },
      create: {
        key: changeId,
        value: JSON.stringify(changeRecord),
        category: 'system_changes',
        description: `[${type}] ${description.slice(0, 100)}`,
      },
    });

    const duration = Date.now() - requestStart;
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json({
      success: true,
      changeId,
      message: 'تم تقديم التغيير للمراجعة بنجاح',
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    recordError('/api/system/approvals', error instanceof Error ? error.message : 'Unknown error');
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json(
      { error: 'خطأ في تقديم التغيير' },
      { status: 500 }
    );
  }
}

// ─── PUT: Approve or reject a change ──────────────────────────────────

export async function PUT(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Auth check - admin only
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'غير مصرح - مطلوب صلاحيات الآدمن للموافقة أو الرفض' },
        { status: 403 }
      );
    }

    const body = await request.json() as { id: string; approved: boolean; adminNote?: string };
    const { id, approved, adminNote } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'معرف التغيير مطلوب' },
        { status: 400 }
      );
    }

    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'يجب تحديد الموافقة أو الرفض' },
        { status: 400 }
      );
    }

    // Find the existing change record
    const existing = await db.adminSettings.findUnique({
      where: { key: id },
    });

    if (!existing || existing.category !== 'system_changes') {
      return NextResponse.json(
        { error: 'التغيير غير موجود' },
        { status: 404 }
      );
    }

    // Parse the existing record
    let changeRecord: ChangeRecord;
    try {
      changeRecord = JSON.parse(existing.value) as ChangeRecord;
    } catch {
      return NextResponse.json(
        { error: 'سجل التغيير تالف' },
        { status: 500 }
      );
    }

    // Check if already reviewed
    if (changeRecord.status !== 'pending') {
      return NextResponse.json(
        { error: `التغيير تمت مراجعته بالفعل (${changeRecord.status === 'approved' ? 'موافق عليه' : 'مرفوض'})` },
        { status: 400 }
      );
    }

    // Update the record
    changeRecord.status = approved ? 'approved' : 'rejected';
    changeRecord.reviewedAt = new Date().toISOString();
    changeRecord.reviewedBy = user.id;
    changeRecord.adminNote = adminNote || undefined;

    await db.adminSettings.update({
      where: { key: id },
      data: {
        value: JSON.stringify(changeRecord),
        description: `[${changeRecord.type}] ${changeRecord.description.slice(0, 80)} (${approved ? 'approved' : 'rejected'})`,
      },
    });

    const duration = Date.now() - requestStart;
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json({
      success: true,
      changeId: id,
      status: changeRecord.status,
      message: approved
        ? 'تمت الموافقة على التغيير بنجاح'
        : 'تم رفض التغيير',
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    recordError('/api/system/approvals', error instanceof Error ? error.message : 'Unknown error');
    recordApiResponseTime('/api/system/approvals', duration);

    return NextResponse.json(
      { error: 'خطأ في مراجعة التغيير' },
      { status: 500 }
    );
  }
}
