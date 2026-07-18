/**
 * DeltaAI Architecture Report Generator
 * Generates a comprehensive technical PDF report about the project architecture
 */

import { renderToPDF } from '../lib/rendering-pipeline';

const ARCHITECTURE_CONTENT = `
# تقرير معمارية مشروع DeltaAI
## Technical Architecture Report — DeltaAI Platform

---

## 1. الـ Tech Stack: التقنيات المستخدمة

### 1.1 Backend — اللغة والإطار

| الخاصية | القيمة |
|---------|--------|
| لغة البرمجة الأساسية | TypeScript 5 (Strict Mode) |
| Runtime | Node.js via Bun 1.x |
| إطار العمل (Framework) | Next.js 16 (App Router) |
| وضع التشغيل | Standalone Server (output: "standalone") |
| منصة الاستضافة | HuggingFace Spaces (Docker Container) |
| الموارد | 16GB RAM / 100GB Storage |
| المنفذ | 3000 |

### 1.2 قاعدة البيانات

| الخاصية | القيمة |
|---------|--------|
| نوع قاعدة البيانات | PostgreSQL |
| ORM | Prisma 6.11.1 |
| خادم قاعدة البيانات | PostgreSQL 16 ( عبر DATABASE_URL ) |
| عدد الجداول | 9 (User, Session, Conversation, Message, OtpCode, AdminSettings, GenerativeAsset, Podcast, RadioStation, VoiceBroadcast, ApiEndpoint, ApiValidationLog, ApiAggregationJob) |

### 1.3 مكتبات العرض والمولدات

| المكتبة | الإصدار | الغرض |
|---------|---------|-------|
| Playwright | 1.60.0 | عرض HTML → PDF باستخدام Chromium headless |
| @gradio/client | 2.2.1 | التواصل مع HuggingFace Gradio Spaces |
| mammoth | 1.12.0 | قراءة ملفات DOCX |
| officeparser | 7.1.0 | تحليل ملفات Office |
| pdf-parse | 2.4.5 | قراءة ملفات PDF |
| sharp | 0.34.3 | معالجة الصور |

### 1.4 الذكاء الاصطناعي — مزودو الخدمة

| المزود | API Endpoint | النماذج المستخدمة | نوع الاستجابة |
|--------|-------------|------------------|--------------|
| Google Gemini | generativelanguage.googleapis.com/v1beta | gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash | JSON (generateContent / streamGenerateContent) |
| HuggingFace Router | router.huggingface.co/v1/chat/completions | Llama-3.1-8B, Qwen2.5-7B, DeepSeek-R1, و50+ نموذج | JSON (OpenAI-compatible SSE stream) |
| Pollinations AI | gen.pollinations.ai/v1/chat/completions | openai, qwen-large, deepseek, mistral, llama | JSON (OpenAI-compatible SSE stream) |
| Pollinations Image | image.pollinations.ai/prompt/ | flux, gptimage, seedream5, zimage, nova-canvas | Binary Image (JPEG/PNG) |
| z-ai-web-dev-sdk | internal-api.z.ai/v1 | glm-4-plus, cogview-4 | JSON |
| Groq | api.groq.com/openai/v1 | llama-3.3-70b, mixtral-8x7b | JSON (OpenAI-compatible) |
| OpenRouter | openrouter.ai/api/v1 | متعدد النماذج | JSON (OpenAI-compatible) |

### 1.5 واجهة المستخدم (Frontend)

| التقنية | الغرض |
|---------|-------|
| React 19 | مكتبة واجهة المستخدم |
| Tailwind CSS 4 | تنسيق الأنماط |
| shadcn/ui (Radix) | مكتبة المكونات الجاهزة |
| Framer Motion | الحركات والتأثيرات |
| Zustand | إدارة حالة العميل |
| TanStack Query | إدارة حالة الخادم |
| Socket.IO | الاتصال الفوري (WebSocket) |

---

## 2. الـ Data Flow: خط سير البيانات

### 2.1 مسار توليد المستندات (PDF Generation Flow)

**الخطوة 1: إرسال الطلب من الواجهة**

يرسل العميل طلب POST إلى المسار الموحد:
- /api/ai/hf/document — المسار الموحد لتوليد المستندات (PDF/PPTX/XLSX/DOCX) مع دعم الأنماط (local/batch/single)

**الخطوة 2: معالجة الطلب في API Route**

\`\`\`typescript
// مثال: /api/ai/hf/document — Local PDF Mode
const result = await generateLocalDocument({
  topic,
  language: language || 'ar',
  instructions: instructions || '',
  channelName: channelName || 'بعقل هادي',
  includeImages: shouldIncludeImages,
});
\`\`\`

**الخطوة 3: توليد المحتوى بالذكاء الاصطناعي**

عند استخدام generateLocalDocument:
1. يحاول النظام استخدام LLM (عبر z-ai-web-dev-sdk) لتوليد محتوى غني
2. الـ LLM يُرجع نص Markdown خام (Response Format: Text/String)
3. إذا فشل الـ LLM (مثل في Docker على HuggingFace)، يُستخدم محتوى Fallback غني بـ 11 قسم

\`\`\`typescript
// محاولة استخدام z-ai-web-dev-sdk
const zai = await ZAI.create();
const response = await zai.chat.completions.create({
  model: 'glm-4-plus',
  messages: [...],
  stream: false,
});
// Response: response.choices[0].message.content → Markdown Text
\`\`\`

**الخطوة 4: توليد الصور (اختياري)**

إذا كان includeImages = true:
1. يتم فحص المحتوى لاكتشاف فرص إدراج الصور
2. يتم توليد حتى 5 صور عبر Pollinations AI
3. الصور تُخزن كـ Base64 Data URI
4. تُمرر للقالب HTML للدمج

\`\`\`typescript
// توليد صورة عبر Pollinations AI
const imageData = await generateImageForDocument(prompt, 800, 600);
// Response: Base64 String (data:image/jpeg;base64,...)
\`\`\`

**الخطوة 5: Design Reasoning (تحليل تصميمي)**

إذا كان useDesignReasoning = true:
1. يُحلل المحتوى لتحديد نوع السيكولوجيا (financial/academic/medical/islamic/creative/technical/legal)
2. يُحدد لوحة الألوان والخطوط والتباعد بناءً على نوع المحتوى
3. حالياً: القائم على القواعد (Rule-Based) هو الافتراضي؛ الـ LLM معطل لتفادي OOM
4. النتيجة: كائن DesignReasoningBlock يتحكم في التصميم البصري

**الخطوة 6: توليد قالب HTML**

\`\`\`typescript
html = generateHTMLTemplate({
  content,          // محتوى Markdown
  title,            // عنوان المستند
  author,           // اسم المؤلف
  language,         // 'ar' | 'en'
  modelId,          // معرف النموذج
  designReasoning,  // كائن التصميم
  chartSpecs,       // مواصفات الرسوم البيانية
  documentType,     // 'lecture' | 'summary' | 'research' | 'notes'
  images,           // صور Base64
  batchMeta,        // بيانات الدفعات
});
\`\`\`

القالب يشمل:
- صفحة غلاف مع شعار DeltaAI و"بعقل هادي"
- فهرس المحتويات (TOC)
- أقسام محتوى بتنسيق احترافي (Callout Boxes, Feature Boxes, Data Tables, Timelines)
- تذييل بأرقام الصفحات

**الخطوة 7: عرض PDF عبر Playwright**

\`\`\`typescript
const result = await renderHTMLToPDF({
  html,                    // القالب HTML الكامل
  title,                   // العنوان
  language,                // اللغة
  pageSize: 'A4',          // حجم الصفحة
  margins: {...},          // الهوامش
  designReasoning,         // التصميم
});
\`\`\`

**الخطوة 8: إرجاع النتيجة**

- يُحفظ الملف في /app/download/{uuid}.pdf
- يُخزن سجل في قاعدة البيانات (جدول GenerativeAsset)
- يُعاد رابط التحميل للعميل: /api/pdf/serve/{filename}

### 2.2 مسار المحادثة (Chat Flow)

1. العميل يرسل رسالة عبر /api/chat/send أو /api/chat/stream
2. الـ API Route يحدد النموذج المناسب بناءً على modelId
3. يتم التوجيه لأحد المزودين: Gemini / HuggingFace / Pollinations / Groq / OpenRouter
4. الرد يُبث عبر SSE (Server-Sent Events) أو يُعاد كاملاً
5. يُخزن الرد في قاعدة البيانات (جدول Message)

### 2.3 مسار توليد الصور (Image Generation Flow)

1. العميل يحدد الـ prompt والنموذج
2. PromptEngine يُحسّن الـ prompt (ترجمة عربي→إنجليزي، إضافة تفاصيل تقنية)
3. يُرسل لـ Pollinations AI أو z-ai-web-dev-sdk
4. يُعاد Base64 Image Data

---

## 3. الـ PDF Generation Pipeline: خط أنابيب توليد PDF

### 3.1 المكونات الأساسية

\`\`\`
Content → Design Reasoning → HTML Template → Playwright (Chromium) → PDF Buffer → Save to /download/ → DB Record + Serve URL
\`\`\`

### 3.2 الطريقة المستخدمة: page.setContent

يستخدم النظام page.setContent() وليس فتح ملف HTML جاهز:

\`\`\`typescript
// من playwright-renderer.ts — السطر 315
await page.setContent(wrappedHTML, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
\`\`\`

المحتوى HTML يُبنى كاملاً في الذاكرة ثم يُحقن في الصفحة. هذا يعني:
- لا توجد ملفات HTML وسيطة على القرص
- المرونة الكاملة في تعديل HTML قبل العرض
- دعم RTL/Arabic fonts عن طريق حقن CSS ديناميكياً

### 3.3 RTL/Arabic Support

\`\`\`typescript
// حقن CSS للدعم RTL والخطوط العربية
function enforceRTLAndInjectStyles(html, language, designReasoning) {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  
  // حقن @font-face للخطوط Cairo
  const fontCSS = \`
    @font-face {
      font-family: 'Cairo';
      src: url('file://\${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://\${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf');
      font-weight: 700;
    }
  \`;
  
  // حقن RTL CSS
  const rtlCSS = isRTL ? \`
    * { direction: rtl; text-align: right; }
    bdi, [dir="ltr"] { direction: ltr; text-align: left; }
  \` : '';
}
\`\`\`

### 3.4 الرأس والتذييل (Header/Footer)

يستخدم Playwright الـ headerTemplate و footerTemplate المدمجين:

\`\`\`typescript
// Header — شعار DeltaAI
headerTemplate: \`
  <div style="width:100%; padding:0 18mm; font-family:'Cairo',sans-serif;">
    <div style="font-size:7px; color:#94a3b8; text-align:center;">
      DeltaAI | بعقل هادي
    </div>
    <div style="border-bottom:0.5px solid #94a3b8; margin-top:2px;"></div>
  </div>
\`,

// Footer — أرقام الصفحات
footerTemplate: \`
  <div style="width:100%; padding:0 18mm; font-family:'Cairo',sans-serif;">
    <div style="border-top:0.5px solid #94a3b8; margin-bottom:2px;"></div>
    <div style="font-size:7px; color:#94a3b8; text-align:center; direction:rtl;">
      صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>
    </div>
  </div>
\`,
\`\`\`

### 3.5 حفظ وإرسال الملف

\`\`\`typescript
// 1. حفظ الـ PDF Buffer كملف
const downloadDir = join(process.cwd(), 'download');
const outputPath = join(downloadDir, \`\${randomUUID()}.pdf\`);
writeFileSync(outputPath, pdfBuffer);

// 2. تخزين سجل في قاعدة البيانات
const asset = await db.generativeAsset.create({
  data: {
    type: 'pdf',
    title,
    prompt: content.substring(0, 500),
    filePath: outputPath,
    fileSize,
    model: modelId,
    metadata: JSON.stringify({ language, category, documentType, ... }),
    userId: user.id,
  },
});

// 3. إرجاع رابط التحميل
// /api/pdf/serve/{filename} → يقرأ الملف من القرص ويُرجعه
\`\`\`

---

## 4. الـ Server Setup: إعداد الخادم

### 4.1 إدارة متصفح Chromium

**الاستراتيجية: Singleton مع إعادة التشغيل**

\`\`\`typescript
// متغيرات عامة (Module-level)
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;
let browserRestartCount = 0;
const MAX_RESTARTS = 3;

// الحصول على المتصفح — Singleton Pattern
async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;  // إعادة استخدام الموجود
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;  // الانتظار إذا كان قيد التشغيل
  }
  browserLaunchPromise = launchBrowser();
  browserInstance = await browserLaunchPromise;
  return browserInstance;
}
\`\`\`

**لكل طلب عرض:**
- يُنشئ BrowserContext جديد للعزل
- يُنشئ Page جديد
- بعد الانتهاء: يُغلق الصفحة والسياق والمتصفح

\`\`\`typescript
// في renderHTMLToPDF — finally block
try {
  if (page) await page.close();
  if (context) await context.close();
  if (browser) await browser.close();  // يُغلق لتفادي OOM
} catch {
  // تجاهل أخطاء الإغلاق
}
\`\`\`

:::callout-rule
الخلاصة: المتصفح ليس دائم التشغيل (NOT Persistent). يُفتح ويُغلق مع كل طلب عرض لتوفير الذاكرة في بيئة Docker المحدودة (16GB RAM). هذا قرار متعمد لتجنب OOM.
:::

### 4.2 معلمات تشغيل Chromium

\`\`\`typescript
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--no-first-run',
    '--no-default-browser-check',
    '--js-flags=--max-old-space-size=1024',  // حد ذاكرة JS
    // ملاحظة: --single-process تمت إزالته لأنه يسبب انهيارات في Docker
  ],
});
\`\`\`

### 4.3 طابور الطلبات (Queue)

:::callout-error
لا يوجد طابور طلبات (NO Queue). النظام لا يستخدم BullMQ أو Celery أو أي نظام طوابير.
:::

المعالجة تتم:
- بشكل متزامن (Synchronous) لطلبات PDF الفردية
- بشكل غير متزامن مع تتبع (Async + Progress) لطلبات الدفعات (Batch)
  - يُستخدم نظام Task بسيط في الذاكرة (In-Memory)
  - التتبع عبر SSE أو Polling

\`\`\`typescript
// نظام المهام البسيط (In-Memory)
const documentTasks = new Map<string, DocumentTask>();

export function createDocumentTask(mode, options, modelId): string {
  const taskId = randomUUID();
  documentTasks.set(taskId, {
    id: taskId,
    mode,
    status: 'pending',
    progress: 0,
    stage: 'initializing',
    ...
  });
  // بدء المعالجة في الخلفية
  processDocumentTask(taskId, mode, options, modelId);
  return taskId;
}
\`\`\`

### 4.4 Handle OOM و Browser Crashes

\`\`\`typescript
// كشف الانهيارات
if (errorMsg.includes('OOM') || 
    errorMsg.includes('Out of memory') ||
    errorMsg.includes('Target closed') ||
    errorMsg.includes('disconnected')) {
  // إعادة تشغيل المتصفح بشكل غير متزامن
  restartBrowser().catch(e => 
    console.error('Restart failed:', e)
  );
}

// حد إعادة التشغيل
if (browserRestartCount >= MAX_RESTARTS) {
  browserRestartCount = 0;
  throw new Error('Browser restarted 3 times. Giving up.');
}
\`\`\`

### 4.5 Docker Build Pipeline

\`\`\`dockerfile
# Stage 1: تثبيت التبعيات
FROM oven/bun:1 AS deps
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN bun install --frozen-lockfile
RUN ./node_modules/.bin/prisma generate

# Stage 2: بناء التطبيق
FROM oven/bun:1 AS builder
ENV NODE_OPTIONS="--max-old-space-size=6144"
RUN bun run build

# Stage 3: التشغيل
FROM oven/bun:1 AS runner
# تثبيت مكتبات النظام لـ Chromium
RUN apt-get install -y libnss3 libatk1.0-0 libgbm1 ...
# تثبيت Chromium فقط
RUN ./node_modules/playwright-core/cli.js install chromium
# أمر التشغيل
CMD prisma db push && node seed.js && node server.js
\`\`\`

---

## 5. الـ AI Integration: تكامل الذكاء الاصطناعي

### 5.1 استراتيجية التوجيه (Routing Strategy)

يستخدم النظام 7 مزودين مختلفين مع Fallback تلقائي:
1. Google Gemini — النموذج الأساسي (مجاني via AI Studio)
2. HuggingFace Serverless — نماذج مفتوحة المصدر (Llama, Qwen, DeepSeek)
3. Pollinations AI — مجاني بالكامل (لا يحتاج API Key)
4. z-ai-web-dev-sdk — SDK متكامل (glm-4-plus, cogview-4)
5. Groq — سرعة فائقة (llama-3.3-70b)
6. OpenRouter — واجهة موحدة لعدة مزودين
7. Cerebras — سرعة عالية (llama-3.3-70b)

### 5.2 Load Balancer — موازنة الحمل

يستخدم النظام HFLoadBalancer لتوزيع الطلبات عبر 3 مراحل:

\`\`\`typescript
// Phase 1: تجربة النماذج المفضلة بالترتيب
for (const modelId of preferredModels) {
  if (lb.isModelUsable(modelId)) {
    try { return await generateHFChatCompletion(messages, modelId); }
    catch { excludeModels.add(modelId); continue; }
  }
}

// Phase 2: تجربة نماذج من نفس الفئة
const selection = lb.selectBestModel(categoryModels, { excludeModels });

// Phase 3: تجربة أي نموذج متاح
const globalSelection = lb.selectBestModel(allAvailable, { maxAttempts: 5 });
\`\`\`

### 5.3 تحويل تنسيق الرسائل

لأن كل مزود له تنسيق مختلف:

\`\`\`typescript
// Gemini يستخدم "user" و "model" بدلاً من "user" و "assistant"
function convertMessagesToGeminiFormat(messages) {
  for (const msg of messages) {
    if (msg.role === 'system') {
      // يُحقن كـ systemInstruction وليس رسالة عادية
      systemInstructionText += msg.content;
    } else if (msg.role === 'assistant') {
      // تحويل "assistant" → "model"
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
}
\`\`\`

### 5.4 أنماط الاستجابة

| المزود | نوع الاستجابة | Streaming |
|--------|-------------|-----------|
| Gemini | JSON (generateContent) | SSE (streamGenerateContent?alt=sse) |
| HuggingFace | JSON (OpenAI-compatible) | SSE (stream: true) |
| Pollinations | JSON (OpenAI-compatible) | SSE (stream: true) |
| z-ai-web-dev-sdk | JSON (choices[0].message.content) | لا يدعم |

---

## 6. النقاط الحرجة والتوصيات

### 6.1 نقاط القوة

:::feature
**Playwright Rendering**
جودة PDF عالية مع دعم كامل لـ CSS وRTL — النظام الوحيد الذي يُدعم كل ميزات CSS الحديثة في توليد PDF
:::

:::feature
**Multi-Provider AI**
لا يوجد نقطة فشل واحدة — 7 مزودين مختلفين مع Fallback تلقائي يضمن استمرارية الخدمة
:::

:::feature
**Load Balancer**
توزيع ذكي مع تتبع حالة النماذج (نسبة النجاح، وقت الاستجابة، معدل الفشل)
:::

:::feature
**Design Reasoning**
تحليل سيكولوجي للمحتوى يحدد التصميم البصري تلقائياً — 7 أنماط (financial, academic, medical, islamic, creative, technical, legal)
:::

:::feature
**Rich HTML Template**
قالب احترافي مع Cover Page + TOC + Callout Boxes + Feature Grids + Data Tables + Timelines
:::

### 6.2 نقاط الضعف

:::callout-error
لا يوجد Queue: الطلبات تُعالج مباشرة — يمكن أن تُنهار تحت الضغط
:::

:::callout-error
Browser Lifecycle: فتح وإغلاق Chromium مع كل طلب يستهلك وقتاً وذاكرة (حوالي 2-5 ثوان لكل عملية فتح)
:::

:::callout-error
In-Memory Tasks: بيانات المهام تُفقد عند إعادة تشغيل الخادم
:::

:::callout-error
No Persistent Browser: كان يمكن أن يُحسن الأداء إذا استمر المتصفح مفتوحاً مع Connection Pool
:::

### 6.3 توصيات للتطوير

1. **إضافة BullMQ**: طابور طلبات Redis لتوزيع الحمل ومنع الانهيار تحت الضغط
2. **Browser Pool**: تجمع متصفحات دائم (Persistent Browser Pool) بدلاً من الفتح/الإغلاق مع كل طلب — توفير 2-5 ثوان لكل طلب
3. **LLM Content Generation**: تفعيل توليد المحتوى بالذكاء الاصطناعي بشكل افتراضي مع معالجة OOM عبر memory management أفضل
4. **Task Persistence**: تخزين بيانات المهام في قاعدة البيانات (PostgreSQL) بدلاً من الذاكرة المؤقتة
5. **Streaming PDF**: دعم التدفق التدريجي للصفحات المعقدة وتقسيم المستندات الكبيرة
6. **Caching Layer**: تخزين مؤقت للقوالب HTML المتكررة باستخدام LRU Cache

---

بعقل هادي | DeltaAI | Technical Architecture Report v1.0
`;

async function main() {
  console.log('[Architecture Report] Generating PDF...');

  const result = await renderToPDF({
    content: ARCHITECTURE_CONTENT,
    title: 'DeltaAI — Technical Architecture Report',
    author: 'DeltaAI Engineering',
    language: 'ar',
    modelId: 'architecture-report',
    useDesignReasoning: true,
    documentType: 'research',
  });

  if (result.success && result.filePath) {
    console.log(`[Architecture Report] ✅ PDF generated successfully!`);
    console.log(`  File: ${result.filePath}`);
    console.log(`  Size: ${(result.pdfBuffer?.length || 0) / 1024} KB`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Renderer: ${result.rendererUsed}`);
  } else {
    console.error('[Architecture Report] ❌ Failed:', result.error);
  }

  process.exit(0);
}

main().catch(console.error);
