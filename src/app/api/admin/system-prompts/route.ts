// ─── System Prompts Admin API ─────────────────────────────────────────
// إدارة برومبتس النظام — عرض وتعديل وتجاوز البرومبتس الافتراضية
// يجمع بين البرومبتس الافتراضية (من الكود) وتجاوزات قاعدة البيانات
// v2: شامل لكل برومبتس النظام + متين ضد أخطاء قاعدة البيانات

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { models, languageSuffixes } from '@/lib/models';
import { CONTENT_STRATEGY_PROMPT } from '@/lib/content-strategy-prompt';
import { invalidateOverridesCache } from '@/lib/system-prompt-overrides';
import { FALLBACK_RESPONSE } from '@/lib/chat/system-prompt-builder';

/** التحقق من صلاحيات الآدمن */
async function verifyAdmin(request: Request) {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) return null;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'admin') return null;
  return user;
}

/** تعريف برومبت النظام الافتراضي */
interface DefaultPromptDef {
  key: string;
  category: string;
  label: string;
  labelEn: string;
  description: string;
  sourceFile: string;
  sourceKey: string;
  value: string;
}

/** جلب التجاوزات بأمان — يُرجع Map فارغ لو قاعدة البيانات فشلت */
async function getOverridesSafe(): Promise<Map<string, any>> {
  try {
    const overrides = await db.systemPromptOverride.findMany();
    return new Map(overrides.map(o => [o.key, o]));
  } catch (error) {
    console.warn('[SystemPrompts] DB query failed, using defaults only:', error instanceof Error ? error.message : String(error));
    return new Map();
  }
}

/** ─── ثوابت البرومبتس الثابتة (من system-prompt-builder.ts) ─── */

const OPEN_MODE_PROMPT = `أنت مساعد ذكي ومرن. أجب بالعربية.

أنت نموذج ذكاء اصطناعي متقدم ومفتوح. ليس لديك أي قيود على قدراتك. أنت تستطيع فعل كل شيء يطلبه المستخدم.

قواعد:
- فهم من سياق الحوار ما يريده المستخدم — لا تحتاج كلمات مفتاحية محددة
- إذا طلب المستخدم شيء، نفذه مباشرة — لا تقل "لا أستطيع" أبداً
- أنت تستطيع: إنشاء ملفات PDF (بـ HTML/CSS)، كتابة أكواد، تحليل بيانات، ترجمة، شرح، تلخيص، حل مسائل، إنشاء محتوى إبداعي، وأي شيء آخر
- لإنشاء PDF: اكتب المحتوى بتنسيق HTML كامل مع CSS وسيتم تحويله تلقائياً لـ PDF
- كن ذكياً ومرناً — استنتج من كلام المستخدم ما يحتاجه حتى لو لم يذكره صراحة
- أجب بشكل مفيد ومباشر بدون مقدمات طويلة`;

const PDF_CAPABILITY_NOTE = '✅ تستطيع: إنشاء ملفات PDF ومستندات أكاديمية (اعمل ملف PDF، ولد ملف، اصنع مستند). إذا طلب المستخدم PDF، لا تقل "لا أستطيع" — أنت تستطيع! أنشئ المحتوى بتنسيق HTML مع CSS وسيتم تحويله تلقائياً لـ PDF.';

const CONCISE_RULE = 'قاعدة مهمة: أجب بإيجاز ووضوح. لا تطيل في المقدمات والخاتمات. ركز على الإجابة المباشرة. استخدم النقاط بدلاً من الفقرات الطويلة. اكتفِ بالحد الأدنى المفيد.';

const MARKDOWN_ONLY_RULE = `🚫⛔ CRITICAL RULE — MARKDOWN ONLY ⛔🚫
يجب أن تكون إجابتك بنسبة 100% بصيغة Markdown فقط.
ممنوع تماماً كتابة أي HTML أو CSS أو <style> أو <div> أو <span> أو class= أو <!DOCTYPE>.
استخدم فقط: عناوين #، نقاط • أو -، **عريض**، *مائل*، \`كود\`، \`\`\`بلوك كود\`\`\`.
إذا كتبت أي HTML/CSS سيتم حذفه تلقائياً. اكتب الإجابة كنص مباشر بتنسيق Markdown فقط.
REPEAT: DO NOT output HTML tags. Use Markdown formatting only. No <style>, no <div>, no CSS.`;

const ATTACHMENT_ANALYSIS_PROMPT = 'المستخدم أرفق ملفات. يمكنك قراءة وتحليل محتوى هذه الملفات بالكامل. قم بتحليل المحتوى المرفق والرد عليه بشكل مفصل. لا تقل أنك لا تستطيع قراءة الملفات - المحتوى متاح لك بالفعل.';

const ATTACHMENT_VISION_PROMPT = 'المستخدم أرفق صورة/صور. قم بتحليلها ووصفها بالتفصيل.';

const ATTACHMENT_NO_VISION_PROMPT = 'المستخدم أرفق صورة/صور لكن النموذج الحالي لا يدعم تحليل الصور. أخبر المستخدم بالتبديل لنموذج Delta Vision (دلتا فيجن) لتحليل الصور، ورد على باقي الرسالة.';

const EGYPTIAN_PDF_NOTE = '✅ تستطيع: إنشاء ملفات PDF ومستندات أكاديمية (اعمل ملف PDF، ولد ملف، اصنع مستند). إذا طلب المستخدم PDF، لا تقل "لا أستطيع" — أنت تستطيع! أنشئ المحتوى بتنسيق HTML مع CSS وسيتم تحويله تلقائياً لـ PDF.';

const DRIVE_CONNECTED_PROMPT = '🔗 Google Drive متصل ({fileCount} ملف متاح). يمكنك الوصول لملفات المستخدم على Google Drive. إذا سأل المستخدم عن ملفاته أو محتوى الدرايف، أخبره أن الدرايف متصل ويمكنه طلب أي ملف بالاسم. لا تقل أبداً أنك لا تستطيع الوصول للدرايف — الدرايف متصل فعلاً ومتاح!';

const DRIVE_NO_FILES_PROMPT = '🔗 Google Drive متصل لكن لا توجد ملفات بعد.';

const SEARCH_NO_RESULTS_NOTE = 'ملاحظة: تم محاولة البحث في الإنترنت لكن لم تتوفر نتائج. أجب من معلوماتك وأضف أن المعلومات قد لا تكون محدثة.';

const SEARCH_FAILED_NOTE = 'ملاحظة: تعذر البحث في الإنترنت حالياً. أجب من معلوماتك وأضف أن المعلومات قد لا تكون محدثة.';

const DESIGN_PREFS_TEMPLATE = '🎨 تفضيلات المستخدم للتصميم: {prefs}. يجب أن تنفذ هذه التفضيلات إجبارياً في تصميم المستند.';

const EMOTION_SUPPORT_TEMPLATE = 'المستخدم يبدو عليه {emotion}. اجعله يشعر بالدعم والتعاطف في بداية ردك.';

/** ─── QUIZ SERVICE PROMPT ─── */
const QUIZ_SYSTEM_PROMPT = 'أنت خبير في إنشاء الاختبارات التعليمية باللغة العربية. قم بإنشاء أسئلة اختبار بناءً على الموضوع والمحتوى المقدم.';

/** جمع كل البرومبتس الافتراضية من الكود — النسخة الشاملة */
function getDefaultPrompts(): DefaultPromptDef[] {
  const prompts: DefaultPromptDef[] = [];

  // ══════════════════════════════════════════════
  // الفئة 1: برومبتس النماذج (من models.ts)
  // ══════════════════════════════════════════════
  for (const model of models) {
    if (!model.systemPrompt) continue;
    prompts.push({
      key: `model:${model.id}`,
      category: 'model',
      label: `برومبت ${model.name}`,
      labelEn: `${model.nameEn} System Prompt`,
      description: `البرومبت الافتراضي لنموذج ${model.name} (${model.nameEn}) — يُحقن كأساس لكل محادثة مع هذا النموذج`,
      sourceFile: 'src/lib/models.ts',
      sourceKey: `models.find(m => m.id === '${model.id}').systemPrompt`,
      value: model.systemPrompt,
    });
  }

  // ══════════════════════════════════════════════
  // الفئة 2: برومبتس الميزات (Feature Prompts)
  // ══════════════════════════════════════════════

  // ── برومبت استراتيجية المحتوى ──
  prompts.push({
    key: 'feature:content-strategy',
    category: 'feature',
    label: 'استراتيجية المحتوى',
    labelEn: 'Content Strategy Prompt',
    description: 'برومبت تصميم المستندات وملفات PDF — يُحقن عند طلب إنشاء ملفات. يحدد كيف يصمم الـ AI ملفات PDF بتنسيق HTML/CSS',
    sourceFile: 'src/lib/content-strategy-prompt.ts',
    sourceKey: 'CONTENT_STRATEGY_PROMPT',
    value: CONTENT_STRATEGY_PROMPT,
  });

  // ── برومبت الوضع المفتوح ──
  prompts.push({
    key: 'feature:open-mode',
    category: 'feature',
    label: 'الوضع المفتوح',
    labelEn: 'Open Mode System Prompt',
    description: 'برومبت الوضع المفتوح (Open Mode) — يُستخدم عندما يختار المستخدم وضع "مفتوح" بدون قيود. يُحقن بدلاً من برومبت النموذج الأساسي',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'OPEN_MODE_PROMPT (line 79)',
    value: OPEN_MODE_PROMPT,
  });

  // ── برومبت قدرة PDF ──
  prompts.push({
    key: 'feature:pdf-capability',
    category: 'feature',
    label: 'قدرة إنشاء PDF',
    labelEn: 'PDF Capability Note',
    description: 'ملاحظة تُحقن لإخبار النموذج بقدرته على إنشاء ملفات PDF بتنسيق HTML/CSS — تُضاف لكل النماذج في الوضع العادي',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'PDF_CAPABILITY_NOTE (line 104)',
    value: PDF_CAPABILITY_NOTE,
  });

  // ── قاعدة الإيجاز ──
  prompts.push({
    key: 'feature:concise-rule',
    category: 'feature',
    label: 'قاعدة الإيجاز',
    labelEn: 'Concise Response Rule',
    description: 'قاعدة تُحقن لإجبار النموذج على الإجابة بإيجاز ووضوح وعدم التطويل — تُضاف لكل النماذج ما عدا المصري والوضع المفتوح',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'CONCISE_RULE (line 97)',
    value: CONCISE_RULE,
  });

  // ── قاعدة Markdown فقط ──
  prompts.push({
    key: 'feature:markdown-only',
    category: 'feature',
    label: 'قاعدة Markdown فقط',
    labelEn: 'Markdown-Only Rule',
    description: 'قاعدة صارمة تُحقن عندما لا يكون هناك طلب إنشاء ملفات — تمنع النموذج من كتابة أي HTML/CSS وتلزمه بتنسيق Markdown فقط',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'MARKDOWN_ONLY_RULE (line 143)',
    value: MARKDOWN_ONLY_RULE,
  });

  // ── برومبت تحليل المرفقات ──
  prompts.push({
    key: 'feature:attachment-analysis',
    category: 'feature',
    label: 'تحليل المرفقات',
    labelEn: 'Attachment Analysis Prompt',
    description: 'يُحقن عندما يرفع المستخدم ملفات — يخبر النموذج بقدرته على قراءة وتحليل الملفات المرفقة',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'ATTACHMENT_ANALYSIS_PROMPT (line 162)',
    value: ATTACHMENT_ANALYSIS_PROMPT,
  });

  // ── برومبت تحليل الصور (نموذج رؤية) ──
  prompts.push({
    key: 'feature:attachment-vision',
    category: 'feature',
    label: 'تحليل الصور (نموذج رؤية)',
    labelEn: 'Vision Attachment Prompt',
    description: 'يُحقن عندما يرفع المستخدم صورة ويستخدم نموذج يدعم الرؤية — يطلب من النموذج تحليل الصور بالتفصيل',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'ATTACHMENT_VISION_PROMPT (line 166)',
    value: ATTACHMENT_VISION_PROMPT,
  });

  // ── برومبت تحليل الصور (بدون رؤية) ──
  prompts.push({
    key: 'feature:attachment-no-vision',
    category: 'feature',
    label: 'تحليل الصور (نموذج بدون رؤية)',
    labelEn: 'No-Vision Attachment Prompt',
    description: 'يُحقن عندما يرفع المستخدم صورة لكن النموذج لا يدعم الرؤية — يطلب من النموذج إخبار المستخدم بالتبديل لنموذج Delta Vision',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'ATTACHMENT_NO_VISION_PROMPT (line 170)',
    value: ATTACHMENT_NO_VISION_PROMPT,
  });

  // ── برومنت وعي Google Drive ──
  prompts.push({
    key: 'feature:drive-awareness',
    category: 'feature',
    label: 'وعي Google Drive',
    labelEn: 'Google Drive Awareness Prompt',
    description: 'يُحقن عندما يكون Google Drive متصلاً وبه ملفات — يخبر النموذج بقدرته على الوصول لملفات المستخدم',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'DRIVE_CONNECTED_PROMPT (line 206)',
    value: DRIVE_CONNECTED_PROMPT,
  });

  // ── برومبت Drive بدون ملفات ──
  prompts.push({
    key: 'feature:drive-no-files',
    category: 'feature',
    label: 'Drive متصل بدون ملفات',
    labelEn: 'Drive Connected No Files Prompt',
    description: 'يُحقن عندما يكون Google Drive متصلاً لكن لا توجد ملفات — يخبر النموذج أن الدرايف متصل لكن فاضي',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'DRIVE_NO_FILES_PROMPT (line 220)',
    value: DRIVE_NO_FILES_PROMPT,
  });

  // ── ملاحظة البحث بدون نتائج ──
  prompts.push({
    key: 'feature:search-no-results',
    category: 'feature',
    label: 'ملاحظة البحث بدون نتائج',
    labelEn: 'Search No Results Note',
    description: 'يُحقن عندما يتم البحث في الإنترنت لكن لا تتوفر نتائج — يطلب من النموذج الإجابة من معلوماته مع التنبيه',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'SEARCH_NO_RESULTS_NOTE (line 302)',
    value: SEARCH_NO_RESULTS_NOTE,
  });

  // ── ملاحظة فشل البحث ──
  prompts.push({
    key: 'feature:search-failed',
    category: 'feature',
    label: 'ملاحظة فشل البحث',
    labelEn: 'Search Failed Note',
    description: 'يُحقن عندما يفشل البحث في الإنترنت تماماً — يطلب من النموذج الإجابة من معلوماته',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'SEARCH_FAILED_NOTE (line 306)',
    value: SEARCH_FAILED_NOTE,
  });

  // ── قالب تفضيلات التصميم ──
  prompts.push({
    key: 'feature:design-prefs',
    category: 'feature',
    label: 'تفضيلات التصميم',
    labelEn: 'Design Preferences Template',
    description: 'قالب يُحقن عندما يحدد المستخدم تفضيلات تصميم (لون، أسلوب) — يُلزم النموذج بتنفيذ التفضيلات',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'DESIGN_PREFS_TEMPLATE (line 156)',
    value: DESIGN_PREFS_TEMPLATE,
  });

  // ── قالب الدعم النفسي ──
  prompts.push({
    key: 'feature:emotion-support',
    category: 'feature',
    label: 'الدعم النفسي',
    labelEn: 'Emotion Support Template',
    description: 'قالب يُحقن عندما يكتشف النظام مشاعر سلبية لدى المستخدم — يطلب من النموذج إظهار التعاطف والدعم',
    sourceFile: 'src/lib/chat/chat-utils.ts → system-prompt-builder.ts',
    sourceKey: 'EMOTION_SUPPORT_TEMPLATE (line 179)',
    value: EMOTION_SUPPORT_TEMPLATE,
  });

  // ══════════════════════════════════════════════
  // الفئة 3: برومبتس الوكلاء (Agent Prompts)
  // ══════════════════════════════════════════════

  // ── برومبت نظام الكويز ──
  prompts.push({
    key: 'agent:quiz-generator',
    category: 'agent',
    label: 'مولّد الكويز',
    labelEn: 'Quiz Generator Prompt',
    description: 'برومبت نظام توليد الاختبارات التعليمية — يُستخدم عند طلب إنشاء كويز أو اختبار',
    sourceFile: 'src/lib/quiz-service.ts',
    sourceKey: 'systemPrompt (line 281)',
    value: QUIZ_SYSTEM_PROMPT,
  });

  // ── استجابة الفالباك ──
  prompts.push({
    key: 'agent:fallback-response',
    category: 'agent',
    label: 'استجابة الفالباك',
    labelEn: 'Fallback Response',
    description: 'الاستجابة الافتراضية عندما تفشل كل مزودات الـ AI — تُعرض للمستخدم كرسالة اعتذار',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'FALLBACK_RESPONSE (line 21)',
    value: FALLBACK_RESPONSE,
  });

  // ── ملاحظة PDF للمصري ──
  prompts.push({
    key: 'feature:egyptian-pdf-note',
    category: 'feature',
    label: 'ملاحظة PDF للمصري',
    labelEn: 'Egyptian Model PDF Note',
    description: 'ملاحظة إضافية تُحقن لنموذج اللهجة المصرية لإخباره بقدرة إنشاء PDF',
    sourceFile: 'src/lib/chat/system-prompt-builder.ts',
    sourceKey: 'EGYPTIAN_PDF_NOTE (line 93)',
    value: EGYPTIAN_PDF_NOTE,
  });

  return prompts;
}

// ═══════════════════════════════════════════════════════════
// GET — جلب كل برومبتس النظام (الافتراضية + التجاوزات)
// ═══════════════════════════════════════════════════════════
export async function GET(request: Request) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    // جمع البرومبتس الافتراضية (ده مش بيعتمد على قاعدة البيانات)
    const defaultPrompts = getDefaultPrompts();

    // محاولة جلب التجاوزات من قاعدة البيانات (بأمان)
    const overrideMap = await getOverridesSafe();

    // دمج الافتراضي مع التجاوزات
    const result = defaultPrompts.map(def => {
      const override = overrideMap.get(def.key);
      const isOverridden = !!override;

      return {
        key: def.key,
        category: def.category,
        label: override?.label || def.label,
        labelEn: override?.labelEn || def.labelEn,
        description: override?.description || def.description,
        sourceFile: def.sourceFile,
        sourceKey: def.sourceKey,
        value: isOverridden ? override.value : def.value,
        originalValue: def.value,
        isActive: override?.isActive ?? true,
        isOverridden,
        updatedAt: override?.updatedAt || null,
      };
    });

    // إضافة أي تجاوزات إضافية لا توجد في الافتراضي (برومبتس مخصصة)
    for (const [key, override] of overrideMap.entries()) {
      if (!defaultPrompts.find(d => d.key === key)) {
        result.push({
          key: override.key,
          category: override.category,
          label: override.label,
          labelEn: override.labelEn,
          description: override.description,
          sourceFile: override.sourceFile,
          sourceKey: override.sourceKey,
          value: override.value,
          originalValue: override.originalValue,
          isActive: override.isActive,
          isOverridden: true,
          updatedAt: override.updatedAt,
        });
      }
    }

    // ترتيب: النماذج أولاً، ثم الميزات، ثم الوكلاء
    const categoryOrder: Record<string, number> = { model: 0, feature: 1, agent: 2 };
    result.sort((a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99));

    return NextResponse.json({ prompts: result });
  } catch (error) {
    console.error('[SystemPrompts] GET error:', error);
    // حتى لو حصل خطأ، نحاول نرجع البرومبتس الافتراضية
    try {
      const fallbackPrompts = getDefaultPrompts().map(def => ({
        key: def.key,
        category: def.category,
        label: def.label,
        labelEn: def.labelEn,
        description: def.description,
        sourceFile: def.sourceFile,
        sourceKey: def.sourceKey,
        value: def.value,
        originalValue: def.value,
        isActive: true,
        isOverridden: false,
        updatedAt: null,
      }));
      return NextResponse.json({ prompts: fallbackPrompts, warning: 'قاعدة البيانات غير متاحة — يتم عرض البرومبتس الافتراضية فقط' });
    } catch {
      return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PUT — حفظ/تحديث تجاوز برومبت نظام
// ═══════════════════════════════════════════════════════════
export async function PUT(request: Request) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json() as {
      key: string;
      value: string;
      isActive?: boolean;
    };

    if (!body.key || typeof body.value !== 'string') {
      return NextResponse.json({ error: 'مطلوب: key و value' }, { status: 400 });
    }

    // البحث عن البرومبت الافتراضي للحصول على البيانات الوصفية
    const defaultPrompts = getDefaultPrompts();
    const defaultPrompt = defaultPrompts.find(d => d.key === body.key);

    if (!defaultPrompt) {
      return NextResponse.json({ error: `مفتاح البرومبت "${body.key}" غير موجود` }, { status: 400 });
    }

    // Upsert التجاوز
    const override = await db.systemPromptOverride.upsert({
      where: { key: body.key },
      update: {
        value: body.value,
        isActive: body.isActive ?? true,
      },
      create: {
        key: body.key,
        category: defaultPrompt.category,
        label: defaultPrompt.label,
        labelEn: defaultPrompt.labelEn,
        description: defaultPrompt.description,
        sourceFile: defaultPrompt.sourceFile,
        sourceKey: defaultPrompt.sourceKey,
        value: body.value,
        originalValue: defaultPrompt.value,
        isActive: body.isActive ?? true,
      },
    });

    // إبطال الكاش
    invalidateOverridesCache();

    return NextResponse.json({
      success: true,
      message: 'تم حفظ البرومبت بنجاح',
      override,
    });
  } catch (error) {
    console.error('[SystemPrompts] PUT error:', error);
    return NextResponse.json({ error: 'خطأ في حفظ البرومبت — تأكد من اتصال قاعدة البيانات' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE — إعادة تعيين برومبت للافتراضي (حذف التجاوز)
// ═══════════════════════════════════════════════════════════
export async function DELETE(request: Request) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json() as { key: string };

    if (!body.key) {
      return NextResponse.json({ error: 'مطلوب: key' }, { status: 400 });
    }

    const existing = await db.systemPromptOverride.findUnique({
      where: { key: body.key },
    });

    if (!existing) {
      return NextResponse.json({ error: 'لا يوجد تجاوز لهذا البرومبت' }, { status: 404 });
    }

    await db.systemPromptOverride.delete({
      where: { key: body.key },
    });

    // إبطال الكاش
    invalidateOverridesCache();

    return NextResponse.json({
      success: true,
      message: 'تم إعادة تعيين البرومبت للافتراضي',
    });
  } catch (error) {
    console.error('[SystemPrompts] DELETE error:', error);
    return NextResponse.json({ error: 'خطأ في إعادة التعيين — تأكد من اتصال قاعدة البيانات' }, { status: 500 });
  }
}
