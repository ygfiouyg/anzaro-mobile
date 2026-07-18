/**
 * DeltaAI Visual Compile Service — Flexible User-Driven Multi-PDF Compilation Engine
 *
 * Takes multiple PDF files, extracts text and images, and compiles a
 * comprehensive document based on the USER'S SPECIFIC INSTRUCTIONS.
 *
 * The user is in control — they tell the system what to extract and compile,
 * whether it's "active ingredients and microscopic images" or "key formulas
 * and diagrams" or anything else entirely. No hardcoded templates.
 *
 * Pipeline:
 * 1. Extract text + images from each PDF
 * 2. Use AI to understand user's request and plan extraction strategy
 * 3. Use VLM to filter/label images based on user's specific criteria
 * 4. Use AI to extract and organize text content per user's instructions
 * 5. Compile into a rich, dynamic HTML template → Playwright → PDF
 *
 * Works across ALL models via the chat interface.
 */

import { getZAIClient } from '@/lib/chat-utils';
import { generateGeminiVision } from '@/lib/gemini';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { renderHTMLToPDF } from '@/lib/playwright-renderer';

// ─── Types ────────────────────────────────────────────────────────────

export interface CompilePdfInput {
  /** PDF base64 data URLs */
  pdfs: Array<{
    dataUrl: string;
    title: string;
  }>;
  /** User's compilation request — this drives everything */
  userPrompt: string;
  /** Language */
  language?: string;
}

/** A dynamic content section defined by the AI based on user instructions */
export interface DynamicSection {
  title: string;
  emoji: string;
  items: string[];
}

/** A dynamically labeled image */
export interface DynamicLabeledImage {
  pageNumber: number;
  imageIndex: number;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  isRelevant: boolean;
  /** Dynamic label assigned by VLM based on user instructions */
  label: string;
  /** Dynamic category assigned by VLM */
  category: string;
  /** Dynamic description based on what user asked for */
  description: string;
  confidence: number;
  contextText: string;
  sourceTitle: string;
}

export interface ExtractedContent {
  /** PDF title/filename */
  title: string;
  /** Extracted text from the PDF */
  text: string;
  /** Dynamically labeled images */
  images: DynamicLabeledImage[];
  /** Dynamic sections extracted based on user instructions */
  sections: DynamicSection[];
}

export interface VisualCompileProgress {
  stage: 'extracting' | 'planning' | 'analyzing' | 'filtering' | 'summarizing' | 'compiling' | 'completed' | 'failed';
  detail: string;
  current: number;
  total: number;
  percentComplete: number;
}

export type VisualCompileProgressCallback = (progress: VisualCompileProgress) => void;

export interface VisualCompileResult {
  pdfs: ExtractedContent[];
  pdfBuffer: Buffer;
  totalImagesFound: number;
  relevantImages: number;
  totalProcessingTimeMs: number;
}

// ─── Step 1: Extract Text from PDF ────────────────────────────────────

async function extractTextFromPdf(base64DataUrl: string): Promise<string> {
  let base64Part = '';
  if (base64DataUrl.startsWith('data:')) {
    base64Part = base64DataUrl.split(',')[1] || '';
  } else {
    base64Part = base64DataUrl;
  }

  if (!base64Part) return '';
  const buffer = Buffer.from(base64Part, 'base64');
  const maxLen = 80 * 1024;

  // Try unpdf
  try {
    const { extractText } = await import('unpdf');
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const result = await extractText(uint8);
    if (result && result.text && Array.isArray(result.text)) {
      const combined = result.text.join('\n\n').trim();
      if (combined.length > 0) {
        return combined.length > maxLen ? combined.slice(0, maxLen) + '\n\n[...]' : combined;
      }
    }
  } catch {}

  // Fallback: pdf2json
  try {
    const PDFParser = (await import('pdf2json')).default;
    const parser = new PDFParser();
    const text = await new Promise<string>((resolve, reject) => {
      parser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          const pageTexts: string[] = [];
          for (const page of (pdfData.Pages || [])) {
            const pageText = (page.Texts || [])
              .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || '')).join(''))
              .join(' ');
            if (pageText.trim()) pageTexts.push(pageText.trim());
          }
          resolve(pageTexts.join('\n\n'));
        } catch (e) { reject(e); }
      });
      parser.on('pdfParser_dataError', (errData: any) => reject(new Error(errData?.parserError || 'Parse error')));
      parser.parseBuffer(buffer);
      setTimeout(() => reject(new Error('PDF parse timeout')), 30_000);
    });
    if (text.trim()) return text.length > maxLen ? text.slice(0, maxLen) + '\n\n[...]' : text.trim();
  } catch {}

  return '';
}

// ─── Step 2: Extract Images from PDF ──────────────────────────────────

async function extractImagesFromPdf(
  base64DataUrl: string,
  _onProgress?: VisualCompileProgressCallback
): Promise<Array<{
  pageNumber: number;
  imageIndex: number;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  contextText: string;
}>> {
  const images: Array<{
    pageNumber: number;
    imageIndex: number;
    dataUrl: string;
    mimeType: string;
    width: number;
    height: number;
    contextText: string;
  }> = [];

  let base64Part = '';
  if (base64DataUrl.startsWith('data:')) {
    base64Part = base64DataUrl.split(',')[1] || '';
  } else {
    base64Part = base64DataUrl;
  }

  if (!base64Part) return images;
  const pdfBuffer = Buffer.from(base64Part, 'base64');

  // Try pdf2json for embedded images
  try {
    const PDFParser = (await import('pdf2json')).default;
    const parser = new PDFParser();
    const pdfData = await new Promise<any>((resolve, reject) => {
      parser.on('pdfParser_dataReady', (data: any) => resolve(data));
      parser.on('pdfParser_dataError', (err: any) => reject(new Error(err?.parserError || 'Error')));
      parser.parseBuffer(pdfBuffer);
      setTimeout(() => reject(new Error('Timeout')), 30_000);
    });

    const totalPages = pdfData?.Pages?.length || 0;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfData.Pages[pageIdx];
      const contextText = (page.Texts || [])
        .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || '')).join(''))
        .join(' ')
        .trim()
        .slice(0, 500);

      const pageImages = page.Images || [];
      for (let imgIdx = 0; imgIdx < pageImages.length; imgIdx++) {
        const img = pageImages[imgIdx];
        let imageDataUrl = '';
        let mimeType = 'image/png';
        let width = img.width || 300;
        let height = img.height || 200;

        if (img.data) {
          if (typeof img.data === 'string' && img.data.startsWith('data:')) {
            imageDataUrl = img.data;
          } else if (typeof img.data === 'string') {
            mimeType = img.mimeType || 'image/png';
            imageDataUrl = `data:${mimeType};base64,${img.data}`;
          }
        }
        if (img.mimeType) mimeType = img.mimeType;
        if (width < 50 && height < 50) continue;

        if (imageDataUrl) {
          images.push({ pageNumber: pageIdx + 1, imageIndex: imgIdx + 1, dataUrl: imageDataUrl, mimeType, width, height, contextText });
        }
      }
    }
  } catch (err) {
    traceError(`[VisualCompile] Image extraction error: ${err instanceof Error ? err.message : 'خطأ'}`);
  }

  // Raw buffer fallback for JPEG images
  if (images.length === 0) {
    try {
      const pdfStr = pdfBuffer.toString('latin1');
      const jpegRegex = /\/Subtype\s*\/Image\s*\/Width\s*(\d+)\s*\/Height\s*(\d+)[^>]*\/Filter\s*\/DCTDecode/g;
      let match;
      while ((match = jpegRegex.exec(pdfStr)) !== null) {
        const width = parseInt(match[1], 10);
        const height = parseInt(match[2], 10);
        if (width < 50 || height < 50) continue;
        const streamStart = pdfStr.indexOf('stream\n', match.index);
        if (streamStart === -1) continue;
        const streamEnd = pdfStr.indexOf('\nendstream', streamStart);
        if (streamEnd === -1) continue;
        const streamContent = pdfStr.substring(streamStart + 7, streamEnd);
        if (streamContent.length < 100) continue;
        try {
          const jpegBuffer = Buffer.from(streamContent, 'latin1');
          if (jpegBuffer[0] === 0xFF && jpegBuffer[1] === 0xD8) {
            const base64 = jpegBuffer.toString('base64');
            images.push({ pageNumber: 0, imageIndex: images.length + 1, dataUrl: `data:image/jpeg;base64,${base64}`, mimeType: 'image/jpeg', width, height, contextText: '' });
          }
        } catch {}
      }
    } catch {}
  }

  traceAPI(`[VisualCompile] Extracted ${images.length} images`);
  return images;
}

// ─── Step 3: Plan Extraction Strategy with AI ─────────────────────────

interface ExtractionPlan {
  /** What the user wants extracted (categories) */
  categories: Array<{
    name: string;
    description: string;
    emoji: string;
  }>;
  /** What kinds of images to look for */
  imageCriteria: string;
  /** How to label images */
  imageLabelFormat: string;
}

async function planExtractionStrategy(
  userPrompt: string,
  sampleText: string,
  language: string = 'ar'
): Promise<ExtractionPlan> {
  const isArabic = language === 'ar';

  const planPrompt = isArabic
    ? `أنت خبير في تحليل طلبات المستخدمين وتخطيط استراتيجيات استخراج المعلومات.

طلب المستخدم: "${userPrompt}"

نموذج من المحتوى:
${sampleText.slice(0, 3000)}

خطط استراتيجية الاستخراج بناءً على طلب المستخدم تحديدًا. لا تستخدم قوالب جاهزة — خطط بناءً على ما طلبه المستخدم فقط.

أجب بالتنسيق التالي:

CATEGORIES:
[اسم القسم]|الوصف|الإيموجي
[اسم القسم]|الوصف|الإيموجي
...

IMAGE_CRITERIA:
ما أنواع الصور التي يجب البحث عنها بناءً على طلب المستخدم؟ كن محددًا.

IMAGE_LABEL_FORMAT:
كيف يجب تسمية ووصف الصور؟ حدد التنسيق بدقة.`
    : `You are an expert in analyzing user requests and planning information extraction strategies.

User request: "${userPrompt}"

Content sample:
${sampleText.slice(0, 3000)}

Plan the extraction strategy based SPECIFICALLY on what the user asked for. Do not use pre-made templates.

Answer in the following format:

CATEGORIES:
[Category Name]|Description|Emoji
[Category Name]|Description|Emoji
...

IMAGE_CRITERIA:
What types of images should be searched for based on the user's request? Be specific.

IMAGE_LABEL_FORMAT:
How should images be labeled and described? Specify the format precisely.`;

  try {
    const zai = await getZAIClient();
    const result = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: 'أنت خبير تخطيط. أجب بالتنسيق المطلوب فقط بدون أي شرح إضافي.' },
        { role: 'user', content: planPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const responseText = result?.choices?.[0]?.message?.content || '';
    return parsePlanResponse(responseText);
  } catch (err) {
    traceError(`[VisualCompile] Plan extraction failed: ${err instanceof Error ? err.message : 'خطأ'}`);
    // Fallback: generic plan
    return {
      categories: [
        { name: isArabic ? 'النقاط الرئيسية' : 'Key Points', description: isArabic ? 'أهم النقاط المذكورة' : 'Most important points mentioned', emoji: '📝' },
        { name: isArabic ? 'ملخص' : 'Summary', description: isArabic ? 'ملخص المحتوى' : 'Content summary', emoji: '📋' },
      ],
      imageCriteria: isArabic ? 'صور تعليمية أو أكاديمية مهمة' : 'Important educational or academic images',
      imageLabelFormat: isArabic ? 'عنوان مختصر | وصف' : 'Brief title | Description',
    };
  }
}

function parsePlanResponse(text: string): ExtractionPlan {
  const categories: ExtractionPlan['categories'] = [];
  let imageCriteria = 'Important images related to the user request';
  let imageLabelFormat = 'Title | Description';

  // Parse categories
  const catMatch = text.match(/CATEGORIES:\s*\n([\s\S]*?)(?=IMAGE_CRITERIA:|$)/i);
  if (catMatch) {
    const lines = catMatch[1].split('\n').filter(l => l.trim());
    for (const line of lines) {
      const cleaned = line.replace(/^[-•*\d.)\s]+/, '').trim();
      if (!cleaned || cleaned.startsWith('[')) continue;
      const parts = cleaned.split('|').map(p => p.trim());
      if (parts.length >= 1) {
        categories.push({
          name: parts[0].replace(/[[\]]/g, ''),
          description: parts[1]?.replace(/[[\]]/g, '') || parts[0],
          emoji: parts[2]?.replace(/[[\]]/g, '') || '📌',
        });
      }
    }
  }

  // Parse image criteria
  const criteriaMatch = text.match(/IMAGE_CRITERIA:\s*\n([\s\S]*?)(?=IMAGE_LABEL_FORMAT:|$)/i);
  if (criteriaMatch) {
    imageCriteria = criteriaMatch[1].trim().split('\n')[0].trim();
  }

  // Parse image label format
  const labelMatch = text.match(/IMAGE_LABEL_FORMAT:\s*\n([\s\S]*?)$/i);
  if (labelMatch) {
    imageLabelFormat = labelMatch[1].trim().split('\n')[0].trim();
  }

  // Ensure at least one category
  if (categories.length === 0) {
    categories.push({
      name: 'Key Points',
      description: 'Most important points mentioned',
      emoji: '📝',
    });
  }

  return { categories, imageCriteria, imageLabelFormat };
}

// ─── Step 4: Filter & Label Image with VLM (User-Driven) ─────────────

async function filterAndLabelImage(
  image: { dataUrl: string; mimeType: string; width: number; height: number; contextText: string; pageNumber: number; imageIndex: number },
  userPrompt: string,
  plan: ExtractionPlan,
  language: string = 'ar'
): Promise<{
  isRelevant: boolean;
  label: string;
  category: string;
  description: string;
  confidence: number;
}> {
  if (!image.dataUrl) {
    return { isRelevant: false, label: '', category: '', description: '', confidence: 0 };
  }

  const isArabic = language === 'ar';

  const analysisPrompt = isArabic
    ? `أنت وكيل متخصص في تحليل الصور.
حلل هذه الصورة المأخوذة من ملف/محاضرة.

طلب المستخدم: "${userPrompt}"

معايير البحث: ${plan.imageCriteria}
تنسيق التسمية: ${plan.imageLabelFormat}

مهمتك:
1. حدد هل هذه الصورة مهمة بناءً على طلب المستخدم المحدد أم لا
2. إذا كانت مهمة، أعطها عنوانًا مختصرًا وتصنيفًا ووصفًا دقيقًا

أنواع الصور غير المهمة (تجاهلها دائمًا):
- شعارات جامعات أو شركات، أيقونات، زخارف، صور غلاف، أشكال فارغة

أجب بالتنسيق التالي بدقة:
RELEVANT: نعم/لا
LABEL: عنوان مختصر للصورة (مثال: مقطع عرضي للنبات، رسم بياني للمعدلات، جدول المقارنة)
CATEGORY: التصنيف المناسب بناءً على طلب المستخدم
DESCRIPTION: وصف دقيق ومختصر (أقصى 20 كلمة)
CONFIDENCE: رقم من 0.5 إلى 1.0

السياق من الصفحة: ${image.contextText.slice(0, 200)}`
    : `You are an expert image analyst.
Analyze this image taken from a document/lecture.

User request: "${userPrompt}"

Search criteria: ${plan.imageCriteria}
Label format: ${plan.imageLabelFormat}

Your task:
1. Determine if this image is important based on the user's specific request
2. If important, provide a brief title, category, and precise description

Always ignore: university/company logos, icons, decorations, cover images, empty shapes

Answer in the following format precisely:
RELEVANT: yes/no
LABEL: brief image title
CATEGORY: appropriate category based on user request
DESCRIPTION: precise and concise description (max 20 words)
CONFIDENCE: number from 0.5 to 1.0

Page context: ${image.contextText.slice(0, 200)}`;

  // Primary: Gemini Vision
  try {
    const base64Data = image.dataUrl.split(',')[1] || image.dataUrl;
    const mimeType = image.dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/png';

    const result = await generateGeminiVision({
      prompt: analysisPrompt,
      imageBase64: base64Data,
      imageMimeType: mimeType,
      model: 'gemini-2.5-flash-preview-05-20',
    });

    return parseDynamicVLMResponse(result.text || '');
  } catch (geminiError) {
    traceError(`[VisualCompile] Gemini Vision failed: ${geminiError instanceof Error ? geminiError.message : 'خطأ'}`);
  }

  // Fallback: ZAI VLM
  try {
    const zai = await getZAIClient();
    const result = await zai.chat.completions.createVision({
      model: 'glm-4v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: analysisPrompt },
          { type: 'image_url', image_url: { url: image.dataUrl } },
        ],
      }],
      thinking: { type: 'disabled' },
    });

    const text = result?.choices?.[0]?.message?.content || '';
    return parseDynamicVLMResponse(text);
  } catch (zaiError) {
    traceError(`[VisualCompile] ZAI VLM failed: ${zaiError instanceof Error ? zaiError.message : 'خطأ'}`);
  }

  return { isRelevant: false, label: '', category: '', description: '', confidence: 0 };
}

function parseDynamicVLMResponse(text: string): {
  isRelevant: boolean;
  label: string;
  category: string;
  description: string;
  confidence: number;
} {
  const lower = text.toLowerCase();
  const relevantMatch = text.match(/RELEVANT:\s*(نعم|yes|true|1)/i);
  const irrelevantMatch = text.match(/RELEVANT:\s*(لا|no|false|0)/i);

  let isRelevant = !!relevantMatch;
  if (irrelevantMatch) isRelevant = false;

  // Fallback: check by keyword analysis
  if (!relevantMatch && !irrelevantMatch) {
    const irrelevantKw = ['شعار', 'logo', 'أيقونة', 'icon', 'زخرفة', 'decoration', 'غلاف', 'cover', 'فارغ', 'blank'];
    const hasIrrelevant = irrelevantKw.some(kw => lower.includes(kw));
    isRelevant = !hasIrrelevant && text.length > 50;
  }

  const labelMatch = text.match(/LABEL:\s*(.+?)(?:\n|CATEGORY:|$)/i);
  const categoryMatch = text.match(/CATEGORY:\s*(.+?)(?:\n|DESCRIPTION:|$)/i);
  const descriptionMatch = text.match(/DESCRIPTION:\s*(.+?)(?:\n|CONFIDENCE:|$)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);

  return {
    isRelevant,
    label: labelMatch?.[1]?.trim().replace(/["\[\]]/g, '') || '',
    category: categoryMatch?.[1]?.trim().replace(/["\[\]]/g, '') || '',
    description: descriptionMatch?.[1]?.trim().replace(/["\[\]]/g, '') || '',
    confidence: confidenceMatch ? Math.min(Math.max(parseFloat(confidenceMatch[1]), 0), 1) : (isRelevant ? 0.8 : 0.2),
  };
}

// ─── Step 5: Extract Text Content Based on User Instructions ───────────

async function extractTextByUserInstructions(
  text: string,
  title: string,
  userPrompt: string,
  plan: ExtractionPlan,
  language: string = 'ar'
): Promise<DynamicSection[]> {
  if (!text || text.length < 20) return [];

  const isArabic = language === 'ar';
  const categoryFormats = plan.categories
    .map(c => `${c.name}:`)
    .join('\n');

  const extractPrompt = isArabic
    ? `أنت خبير في استخراج المعلومات من المستندات الأكاديمية.
حلل النص التالي من "${title}" واستخرج المعلومات بناءً على طلب المستخدم تحديدًا.

طلب المستخدم: ${userPrompt}

استخرج المعلومات في الأقسام التالية (كل عنصر في سطر منفصل):
${categoryFormats}

لكل قسم، ضع قائمة بالعناصر المستخرجة (كل عنصر في سطر يبدأ بـ -).

--- النص ---
${text.slice(0, 15000)}`
    : `You are an expert in extracting information from academic documents.
Analyze the following text from "${title}" and extract information based on the user's specific request.

User request: ${userPrompt}

Extract the information into the following sections (each item on a separate line):
${categoryFormats}

For each section, list extracted items (each item on a line starting with -).

--- Text ---
${text.slice(0, 15000)}`;

  try {
    const zai = await getZAIClient();
    const result = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: 'أنت خبير أكاديمي. أجب بالتنسيق المطلوب فقط.' },
        { role: 'user', content: extractPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const responseText = result?.choices?.[0]?.message?.content || '';
    return parseDynamicSections(responseText, plan);
  } catch (err) {
    traceError(`[VisualCompile] Text extraction failed: ${err instanceof Error ? err.message : 'خطأ'}`);
    // Fallback: use raw text lines
    return plan.categories.map(cat => ({
      title: cat.name,
      emoji: cat.emoji,
      items: text.split('\n').filter(l => l.trim().length > 10).slice(0, 10),
    }));
  }
}

function parseDynamicSections(text: string, plan: ExtractionPlan): DynamicSection[] {
  const sections: DynamicSection[] = [];

  for (const category of plan.categories) {
    const regex = new RegExp(`${category.name}:\\s*\\n([\\s\\S]*?)(?=${plan.categories.map(c => c.name + ':').join('|')}|$)`, 'i');
    const match = text.match(regex);

    const parseList = (str: string): string[] =>
      str.split('\n').map(l => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(l => l.length > 2);

    sections.push({
      title: category.name,
      emoji: category.emoji,
      items: match ? parseList(match[1]) : [],
    });
  }

  return sections;
}

// ─── Step 6: Compile Dynamic HTML ─────────────────────────────────────

function generateDynamicCompileHtml(
  contents: ExtractedContent[],
  userPrompt: string,
  plan: ExtractionPlan,
  language: string
): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const textAlign = isRTL ? 'right' : 'left';

  // Collect all relevant images across all PDFs
  const allRelevantImages = contents.flatMap((c) =>
    c.images
      .filter((img) => img.isRelevant)
      .map((img) => ({ ...img, sourceTitle: c.title }))
  );

  // Merge sections across all PDFs
  const mergedSections: DynamicSection[] = plan.categories.map(cat => {
    const allItems = contents.flatMap(c => {
      const section = c.sections.find(s => s.title === cat.name);
      return section?.items || [];
    });
    // Deduplicate
    const uniqueItems = [...new Set(allItems)];
    return {
      title: cat.name,
      emoji: cat.emoji,
      items: uniqueItems,
    };
  });

  // Build image cards HTML
  const imageCards = allRelevantImages.map((img, idx) => {
    const confidencePercent = Math.round(img.confidence * 100);
    const hasImageData = !!img.dataUrl;

    return `
    <div class="card">
      <div class="card-header">
        <span class="card-number">${idx + 1}</span>
        <div class="card-titles">
          <div class="plant-name">${img.label || (isRTL ? 'غير محدد' : 'Unspecified')}</div>
          <div class="image-type">${img.category || (isRTL ? 'عام' : 'General')}</div>
        </div>
        <span class="source-badge">${img.sourceTitle}</span>
        <span class="confidence ${confidencePercent >= 80 ? 'high' : confidencePercent >= 60 ? 'medium' : 'low'}">${confidencePercent}%</span>
      </div>
      ${hasImageData ? `
      <div class="card-image">
        <img src="${img.dataUrl}" alt="${img.label}" />
      </div>` : ''}
      <div class="card-label">
        <div class="label-row">
          <span class="label-key">🔬</span>
          <span class="label-value">${img.description || '—'}</span>
        </div>
        <div class="label-row">
          <span class="label-key">📄</span>
          <span class="label-value">${isRTL ? 'صفحة' : 'Page'} ${img.pageNumber || '—'}</span>
        </div>
      </div>
    </div>`;
  }).join('\n');

  // Build dynamic sections HTML
  const sectionsHtml = mergedSections
    .filter(s => s.items.length > 0)
    .map(section => `
    <div class="section">
      <h2 class="section-title">${section.emoji} ${section.title}</h2>
      <div class="tags-grid">
        ${section.items.map((item) => `<span class="tag">${item}</span>`).join('\n')}
      </div>
    </div>`).join('\n');

  // Build per-PDF summaries
  const pdfSummariesHtml = contents.map((c, idx) => {
    const hasContent = c.sections.some(s => s.items.length > 0) || c.images.some(i => i.isRelevant);
    if (!hasContent) return '';

    const sectionParts = c.sections
      .filter(s => s.items.length > 0)
      .map(s => `<div class="mini-section"><strong>${s.emoji} ${s.title}:</strong> ${s.items.slice(0, 8).join(' • ')}</div>`)
      .join('');

    return `
    <div class="pdf-summary-card">
      <div class="pdf-summary-header">
        <span class="pdf-num">${idx + 1}</span>
        <span class="pdf-title">${c.title}</span>
        <span class="pdf-images-count">${c.images.filter(i => i.isRelevant).length} 📷</span>
      </div>
      <div class="pdf-summary-body">
        ${sectionParts}
      </div>
    </div>`;
  }).filter(Boolean).join('\n');

  const statsImages = allRelevantImages.length;
  const statsPdfs = contents.length;
  const avgConfidence = allRelevantImages.length > 0
    ? Math.round(allRelevantImages.reduce((s, i) => s + i.confidence, 0) / allRelevantImages.length * 100)
    : 0;

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${isRTL ? 'تجميعة ذكية' : 'Smart Compilation'}</title>
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf') format('truetype');
      font-weight: 700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', sans-serif;
      direction: ${dir};
      text-align: ${textAlign};
      background: #f8fafc;
      color: #1e293b;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #065f46 0%, #047857 50%, #0d9488 100%);
      color: white;
      padding: 28px 32px;
      border-radius: 16px;
      margin-bottom: 24px;
    }
    .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .header .subtitle { font-size: 13px; opacity: 0.85; }
    .header .user-request { margin-top: 12px; padding: 10px 16px; background: rgba(255,255,255,0.15); border-radius: 8px; font-size: 13px; font-style: italic; }
    .stats {
      display: flex; gap: 12px; margin-bottom: 24px; justify-content: center; flex-wrap: wrap;
    }
    .stat-box {
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 12px 18px; text-align: center; min-width: 100px;
    }
    .stat-box .stat-number { font-size: 24px; font-weight: 700; color: #047857; }
    .stat-box .stat-label { font-size: 11px; color: #64748b; }

    .section {
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 20px 24px; margin-bottom: 20px;
    }
    .section-title {
      font-size: 18px; font-weight: 700; color: #065f46;
      border-bottom: 2px solid #d1fae5; padding-bottom: 8px; margin-bottom: 16px;
    }
    .tags-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag {
      padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
      display: inline-block; break-inside: avoid;
      background: #d1fae5; color: #065f46;
    }

    .pdf-summary-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      overflow: hidden; margin-bottom: 12px; break-inside: avoid;
    }
    .pdf-summary-header {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      padding: 10px 16px; display: flex; align-items: center; gap: 10px;
      border-bottom: 2px solid #d1fae5;
    }
    .pdf-num {
      background: #047857; color: white; width: 26px; height: 26px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .pdf-title { font-size: 14px; font-weight: 700; color: #065f46; flex: 1; }
    .pdf-images-count { font-size: 11px; color: #64748b; }
    .pdf-summary-body { padding: 12px 16px; }
    .mini-section { margin-bottom: 8px; font-size: 12px; line-height: 1.6; }
    .mini-section strong { color: #065f46; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card {
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      overflow: hidden; break-inside: avoid;
    }
    .card-header {
      background: #f0fdf4; padding: 10px 14px;
      display: flex; align-items: center; gap: 8px;
      border-bottom: 2px solid #d1fae5;
    }
    .card-number {
      background: #047857; color: white; width: 26px; height: 26px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .card-titles { flex: 1; min-width: 0; }
    .plant-name { font-size: 13px; font-weight: 700; color: #065f46; }
    .image-type { font-size: 10px; color: #64748b; }
    .source-badge {
      font-size: 9px; padding: 2px 8px; border-radius: 10px;
      background: #fef3c7; color: #92400e; max-width: 80px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .confidence {
      font-size: 10px; font-weight: 700; padding: 2px 8px;
      border-radius: 10px; flex-shrink: 0;
    }
    .confidence.high { background: #d1fae5; color: #065f46; }
    .confidence.medium { background: #fef3c7; color: #92400e; }
    .confidence.low { background: #fee2e2; color: #991b1b; }
    .card-image {
      background: #f1f5f9; display: flex; align-items: center; justify-content: center;
      min-height: 120px; max-height: 220px; overflow: hidden;
    }
    .card-image img { max-width: 100%; max-height: 220px; object-fit: contain; }
    .card-label { padding: 10px 14px; border-top: 1px solid #e2e8f0; }
    .label-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 3px; }
    .label-key { font-size: 11px; color: #64748b; white-space: nowrap; }
    .label-value { font-size: 12px; font-weight: 700; color: #1e293b; }
    .footer {
      text-align: center; margin-top: 24px; padding: 12px;
      color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0;
    }
    @media print {
      body { padding: 0; background: white; }
      .card, .pdf-summary-card, .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔬 ${isRTL ? 'تجميعة ذكية' : 'Smart Compilation'}</h1>
    <div class="subtitle">${isRTL ? `${statsPdfs} ملفات — استخراج وتصنيف بالذكاء الاصطناعي` : `${statsPdfs} files — AI-powered extraction & classification`}</div>
    ${userPrompt ? `<div class="user-request">💡 "${userPrompt}"</div>` : ''}
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-number">${statsPdfs}</div>
      <div class="stat-label">${isRTL ? 'ملفات' : 'Files'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${statsImages}</div>
      <div class="stat-label">${isRTL ? 'صور مهمة' : 'Relevant'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${avgConfidence}%</div>
      <div class="stat-label">${isRTL ? 'متوسط الثقة' : 'Avg Confidence'}</div>
    </div>
  </div>

  ${sectionsHtml}

  ${pdfSummariesHtml ? `
  <div class="section">
    <h2 class="section-title">📚 ${isRTL ? 'ملخص كل ملف' : 'Per-File Summary'}</h2>
    ${pdfSummariesHtml}
  </div>` : ''}

  ${allRelevantImages.length > 0 ? `
  <div class="section">
    <h2 class="section-title">📷 ${isRTL ? 'الصور المصنفة' : 'Classified Images'}</h2>
    <div class="grid">
      ${imageCards}
    </div>
  </div>` : ''}

  <div class="footer">
    DeltaAI | بعقل هادي — ${isRTL ? 'تجميعة ذكية تلقائية' : 'Auto Smart Compilation'} — ${new Date().toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}
  </div>
</body>
</html>`;
}

// ─── Main Pipeline ────────────────────────────────────────────────────

export async function processVisualCompile(
  input: CompilePdfInput,
  onProgress?: VisualCompileProgressCallback
): Promise<VisualCompileResult> {
  const startTime = Date.now();
  const { pdfs, userPrompt, language = 'ar' } = input;
  const results: ExtractedContent[] = [];
  let totalImagesFound = 0;
  let relevantImages = 0;

  const totalSteps = pdfs.length * 3 + 2; // 3 steps per PDF + 1 plan + 1 compile

  // Step 0: Plan extraction strategy
  onProgress?.({
    stage: 'planning',
    detail: language === 'ar' ? 'جاري تحليل طلبك وتخطيط الاستخراج...' : 'Analyzing your request and planning extraction...',
    current: 0,
    total: totalSteps,
    percentComplete: 2,
  });

  // Extract a small sample of text for planning
  let sampleText = '';
  for (const pdf of pdfs.slice(0, 3)) {
    const text = await extractTextFromPdf(pdf.dataUrl);
    sampleText += text.slice(0, 2000) + '\n\n';
  }

  const plan = await planExtractionStrategy(userPrompt, sampleText, language);
  traceAPI(`[VisualCompile] Extraction plan: ${plan.categories.length} categories, image criteria: ${plan.imageCriteria}`);

  for (let pdfIdx = 0; pdfIdx < pdfs.length; pdfIdx++) {
    const pdf = pdfs[pdfIdx];
    const stepBase = pdfIdx * 3 + 1;

    // Step 1: Extract text
    onProgress?.({
      stage: 'extracting',
      detail: language === 'ar'
        ? `جاري استخراج النص من "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`
        : `Extracting text from "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`,
      current: stepBase,
      total: totalSteps,
      percentComplete: Math.round((stepBase / totalSteps) * 100),
    });

    const text = await extractTextFromPdf(pdf.dataUrl);
    traceAPI(`[VisualCompile] Extracted text from "${pdf.title}": ${text.length} chars`);

    // Step 2: Extract images
    onProgress?.({
      stage: 'extracting',
      detail: language === 'ar'
        ? `جاري استخراج الصور من "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`
        : `Extracting images from "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`,
      current: stepBase + 1,
      total: totalSteps,
      percentComplete: Math.round(((stepBase + 1) / totalSteps) * 100),
    });

    const rawImages = await extractImagesFromPdf(pdf.dataUrl, onProgress);
    totalImagesFound += rawImages.length;
    traceAPI(`[VisualCompile] Extracted ${rawImages.length} images from "${pdf.title}"`);

    // Step 3: Filter & label images + extract text content (in parallel)
    onProgress?.({
      stage: 'filtering',
      detail: language === 'ar'
        ? `جاري تحليل وتصنيف محتوى "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`
        : `Analyzing and classifying content from "${pdf.title}" (${pdfIdx + 1}/${pdfs.length})...`,
      current: stepBase + 2,
      total: totalSteps,
      percentComplete: Math.round(((stepBase + 2) / totalSteps) * 100),
    });

    // Process images with VLM (limit to 20 images per PDF to avoid timeout)
    const imagesToProcess = rawImages.slice(0, 20);
    const [labeledImages, textSections] = await Promise.all([
      Promise.all(
        imagesToProcess.map(async (img) => {
          try {
            const label = await filterAndLabelImage(img, userPrompt, plan, language);
            if (label.isRelevant) relevantImages++;
            return {
              ...img,
              ...label,
              sourceTitle: pdf.title,
            } as DynamicLabeledImage;
          } catch (err) {
            traceError(`[VisualCompile] Image labeling failed: ${err instanceof Error ? err.message : 'خطأ'}`);
            return {
              ...img,
              isRelevant: false,
              label: '',
              category: '',
              description: '',
              confidence: 0,
              sourceTitle: pdf.title,
            } as DynamicLabeledImage;
          }
        })
      ),
      extractTextByUserInstructions(text, pdf.title, userPrompt, plan, language),
    ]);

    // Add remaining images as unprocessed
    for (let i = 20; i < rawImages.length; i++) {
      labeledImages.push({
        ...rawImages[i],
        isRelevant: false,
        label: '',
        category: '',
        description: '',
        confidence: 0,
        sourceTitle: pdf.title,
      });
    }

    results.push({
      title: pdf.title,
      text,
      images: labeledImages,
      sections: textSections,
    });
  }

  // Step 5: Compile HTML and generate PDF
  onProgress?.({
    stage: 'compiling',
    detail: language === 'ar'
      ? `جاري تجميع الملف (${relevantImages} صورة مهمة من ${pdfs.length} ملفات)...`
      : `Compiling document (${relevantImages} relevant images from ${pdfs.length} files)...`,
    current: totalSteps,
    total: totalSteps,
    percentComplete: 90,
  });

  const html = generateDynamicCompileHtml(results, userPrompt, plan, language);

  const pdfResult = await renderHTMLToPDF({
    html,
    title: 'Smart Compilation',
    language: language as 'ar' | 'en',
    pageSize: 'A4',
    margins: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  });

  if (!pdfResult.success || !pdfResult.pdfBuffer) {
    throw new Error('فشل في توليد PDF: ' + (pdfResult.error || 'خطأ غير معروف'));
  }

  const totalProcessingTimeMs = Date.now() - startTime;

  onProgress?.({
    stage: 'completed',
    detail: language === 'ar'
      ? `تم! ${relevantImages} صورة مهمة من أصل ${totalImagesFound} — ${Math.round(totalProcessingTimeMs / 1000)}s`
      : `Done! ${relevantImages} relevant images out of ${totalImagesFound} — ${Math.round(totalProcessingTimeMs / 1000)}s`,
    current: totalSteps,
    total: totalSteps,
    percentComplete: 100,
  });

  return {
    pdfs: results,
    pdfBuffer: pdfResult.pdfBuffer,
    totalImagesFound,
    relevantImages,
    totalProcessingTimeMs,
  };
}
