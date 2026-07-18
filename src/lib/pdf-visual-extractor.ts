/**
 * DeltaAI PDF Visual Extractor
 *
 * Extracts educational/diagnostic images from PDF lecture files,
 * filters irrelevant images (logos, decorations), generates high-yield labels
 * using VLM, and compiles a clean "Visual Summary PDF".
 *
 * Pipeline:
 * 1. Extract images from PDF (pdf2json for embedded images)
 * 2. Filter with VLM — keep only diagnostic/academic images
 * 3. Label each image with Plant Name, Image Type, Diagnostic Feature
 * 4. Compile into HTML grid and render as PDF via Playwright
 */

import { getZAIClient } from '@/lib/chat-utils';
import { generateGeminiVision } from '@/lib/gemini';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { renderHTMLToPDF } from '@/lib/playwright-renderer';

// ─── Types ────────────────────────────────────────────────────────────

export interface ExtractedImage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Image index on the page */
  imageIndex: number;
  /** Base64 data URL of the image */
  dataUrl: string;
  /** MIME type of the image */
  mimeType: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Surrounding text context from the PDF page */
  contextText: string;
}

export interface LabeledImage extends ExtractedImage {
  /** Whether this image passed the relevance filter */
  isRelevant: boolean;
  /** Plant/Drug name (e.g., Fennel, Nux-vomica) */
  plantName: string;
  /** Image type classification (T.S., Powder Key Element, Chemical Test, Morphological) */
  imageType: string;
  /** Precise exam-focused description (max 15 words) */
  diagnosticFeature: string;
  /** VLM confidence score (0-1) */
  confidence: number;
  /** Raw VLM analysis text */
  rawAnalysis: string;
}

export interface VisualExtractProgress {
  stage: 'extracting' | 'filtering' | 'labeling' | 'compiling' | 'completed' | 'failed';
  detail: string;
  current: number;
  total: number;
  percentComplete: number;
}

export type VisualExtractProgressCallback = (progress: VisualExtractProgress) => void;

export interface VisualExtractResult {
  /** Total images found in PDF */
  totalImagesFound: number;
  /** Images that passed the relevance filter */
  relevantImages: number;
  /** Labeled images with VLM analysis */
  labeledImages: LabeledImage[];
  /** Generated PDF buffer */
  pdfBuffer: Buffer;
  /** Total processing time in ms */
  totalProcessingTimeMs: number;
  /** Model used for VLM analysis */
  model: string;
}

// ─── Step 1: Extract Images from PDF ──────────────────────────────────

/**
 * Extract embedded images from a PDF using pdf2json.
 * Also extracts surrounding text context for each image.
 */
async function extractImagesFromPdf(
  base64DataUrl: string,
  onProgress?: VisualExtractProgressCallback
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  onProgress?.({
    stage: 'extracting',
    detail: 'جاري استخراج الصور من ملف PDF...',
    current: 0,
    total: 1,
    percentComplete: 5,
  });

  // Extract base64 data from data URL
  let base64Part = '';
  if (base64DataUrl.startsWith('data:')) {
    base64Part = base64DataUrl.split(',')[1] || '';
  } else {
    base64Part = base64DataUrl;
  }

  if (!base64Part) {
    throw new Error('No PDF data provided');
  }

  const pdfBuffer = Buffer.from(base64Part, 'base64');

  // Use pdf2json for image extraction
  try {
    const PDFParser = (await import('pdf2json')).default;
    const parser = new PDFParser();

    const pdfData = await new Promise<any>((resolve, reject) => {
      parser.on('pdfParser_dataReady', (data: any) => resolve(data));
      parser.on('pdfParser_dataError', (err: any) => reject(new Error(err?.parserError || 'PDF parse error')));
      parser.parseBuffer(pdfBuffer);
      setTimeout(() => reject(new Error('PDF parsing timeout')), 30_000);
    });

    const totalPages = pdfData?.Pages?.length || 0;
    traceAPI(`[VisualExtract] PDF has ${totalPages} pages`);

    // Extract images from each page
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfData.Pages[pageIdx];

      // Get surrounding text context
      const contextText = (page.Texts || [])
        .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || '')).join(''))
        .join(' ')
        .trim()
        .slice(0, 500);

      // Extract images (pdf2json stores them as Forms/XObjects)
      const pageImages = page.Images || [];
      const pageForms = page.Forms || [];

      // Process embedded images
      for (let imgIdx = 0; imgIdx < pageImages.length; imgIdx++) {
        const img = pageImages[imgIdx];

        // pdf2json provides image data in different formats
        let imageDataUrl = '';
        let mimeType = 'image/png';
        let width = 300;
        let height = 200;

        if (img.data) {
          // Image data is available directly
          if (typeof img.data === 'string' && img.data.startsWith('data:')) {
            imageDataUrl = img.data;
          } else if (typeof img.data === 'string') {
            // Base64 encoded
            mimeType = img.mimeType || 'image/png';
            imageDataUrl = `data:${mimeType};base64,${img.data}`;
          }
        }

        if (img.width) width = Math.round(img.width);
        if (img.height) height = Math.round(img.height);
        if (img.mimeType) mimeType = img.mimeType;

        // Skip very small images (likely icons or decorations)
        if (width < 50 && height < 50) continue;

        if (imageDataUrl) {
          images.push({
            pageNumber: pageIdx + 1,
            imageIndex: imgIdx + 1,
            dataUrl: imageDataUrl,
            mimeType,
            width,
            height,
            contextText,
          });
        }
      }

      // Process form XObjects (often contain images in PDFs)
      for (let formIdx = 0; formIdx < pageForms.length; formIdx++) {
        const form = pageForms[formIdx];
        if (form.type === 'image' || form.Image) {
          let imageDataUrl = '';
          let mimeType = 'image/png';
          let width = form.width || 300;
          let height = form.height || 200;

          if (form.data) {
            if (typeof form.data === 'string' && form.data.startsWith('data:')) {
              imageDataUrl = form.data;
            } else if (typeof form.data === 'string') {
              mimeType = form.mimeType || 'image/png';
              imageDataUrl = `data:${mimeType};base64,${form.data}`;
            }
          } else if (form.Image) {
            // Some pdf2json versions store images differently
            if (form.Image.data) {
              imageDataUrl = form.Image.data.startsWith('data:')
                ? form.Image.data
                : `data:image/png;base64,${form.Image.data}`;
            }
          }

          if (width < 50 && height < 50) continue;

          if (imageDataUrl) {
            images.push({
              pageNumber: pageIdx + 1,
              imageIndex: pageImages.length + formIdx + 1,
              dataUrl: imageDataUrl,
              mimeType,
              width,
              height,
              contextText,
            });
          }
        }
      }
    }

    traceAPI(`[VisualExtract] Extracted ${images.length} images from ${totalPages} pages`);
  } catch (pdf2jsonError) {
    traceError(`[VisualExtract] pdf2json image extraction failed: ${pdf2jsonError instanceof Error ? pdf2jsonError.message : 'خطأ'}`);

    // Fallback: Try raw buffer image extraction
    try {
      const rawImages = extractImagesFromRawBuffer(pdfBuffer);
      images.push(...rawImages);
      traceAPI(`[VisualExtract] Raw buffer extraction found ${rawImages.length} images`);
    } catch (rawError) {
      traceError(`[VisualExtract] Raw buffer extraction also failed: ${rawError instanceof Error ? rawError.message : 'خطأ'}`);
    }
  }

  // If no images were extracted using pdf2json, use VLM-based page analysis
  if (images.length === 0) {
    traceAPI(`[VisualExtract] No embedded images found. Using VLM page analysis fallback...`);
    return await extractImagesViaPageAnalysis(base64DataUrl, onProgress);
  }

  onProgress?.({
    stage: 'extracting',
    detail: `تم استخراج ${images.length} صورة من ملف PDF`,
    current: 1,
    total: 1,
    percentComplete: 20,
  });

  return images;
}

/**
 * Fallback: Extract images by analyzing the raw PDF buffer.
 * Finds JPEG/PNG image streams embedded in the PDF.
 */
function extractImagesFromRawBuffer(buffer: Buffer): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const pdfStr = buffer.toString('latin1');

  // Find JPEG images in PDF streams
  const jpegRegex = /\/Subtype\s*\/Image\s*\/Width\s*(\d+)\s*\/Height\s*(\d+)\s*\/ColorSpace\s*\/(DeviceRGB|DeviceCMYK|DeviceGray)\s*\/BitsPerComponent\s*8[^>]*\/Filter\s*\/DCTDecode/g;
  let match;

  while ((match = jpegRegex.exec(pdfStr)) !== null) {
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);

    if (width < 50 || height < 50) continue;

    // Find the stream content after this image object
    const streamStart = pdfStr.indexOf('stream\n', match.index);
    if (streamStart === -1) continue;

    const streamEnd = pdfStr.indexOf('\nendstream', streamStart);
    if (streamEnd === -1) continue;

    const streamContent = pdfStr.substring(streamStart + 7, streamEnd);
    if (streamContent.length < 100) continue; // Skip tiny images

    // Convert the JPEG data
    try {
      const jpegBuffer = Buffer.from(streamContent, 'latin1');
      // Verify it's a valid JPEG
      if (jpegBuffer[0] === 0xFF && jpegBuffer[1] === 0xD8) {
        const base64 = jpegBuffer.toString('base64');
        images.push({
          pageNumber: 0, // Unknown page
          imageIndex: images.length + 1,
          dataUrl: `data:image/jpeg;base64,${base64}`,
          mimeType: 'image/jpeg',
          width,
          height,
          contextText: '',
        });
      }
    } catch {
      // Skip invalid image data
    }
  }

  return images;
}

/**
 * Fallback: Use VLM to analyze the entire PDF and describe its images.
 * Used when no embedded images can be extracted from the PDF.
 */
async function extractImagesViaPageAnalysis(
  base64DataUrl: string,
  onProgress?: VisualExtractProgressCallback
): Promise<ExtractedImage[]> {
  onProgress?.({
    stage: 'extracting',
    detail: 'جاري تحليل PDF بالرؤية الحاسوبية...',
    current: 0,
    total: 1,
    percentComplete: 10,
  });

  // Use ZAI VLM with file_url to analyze the PDF directly
  try {
    const zai = await getZAIClient();

    const result = await zai.chat.completions.createVision({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `أنت وكيل متخصص في استخراج الصور التعليمية والأكاديمية من ملفات PDF.
حلل هذا الملف وحدد كل الصور التعليمية والأكاديمية المهمة.
تشمل: مقاطع عرضية، صور مجهرية، اختبارات كيميائية، رسومات مورفولوجية، رسوم بيانية، جداول مقارنة، صور تشريحية، مخططات انسيابية، وأي صورة تحتوي على معلومات أكاديمية مهمة.
تجاهل: شعارات الجامعة، صور الغلاف، الأيقونات الزخرفية، والأشكال الفارغة.

لكل صورة مهمة، قدم:
1. عنوان الصورة (Label): عنوان مختصر ووصفي
2. نوع الصورة (Image Type): مثال: T.S. / Microscopic / Chemical Test / Morphological / Diagram / Table / Flowchart
3. الوصف (Description): وصف دقيق ومختصر (أقصى 15 كلمة)

أجب بالتنسيق التالي لكل صورة:
[IMAGE]
Page: رقم الصفحة
Plant: عنوان الصورة
Type: نوع الصورة
Feature: الوصف الدقيق
[/IMAGE]`,
            },
            {
              type: 'file_url',
              file_url: { url: base64DataUrl },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const analysisText = result?.choices?.[0]?.message?.content || '';

    if (analysisText) {
      // Parse the VLM response to create pseudo-images with text descriptions
      const imageBlocks = analysisText.split('[IMAGE]').filter((b: string) => b.trim());
      const extractedImages: ExtractedImage[] = [];

      for (const block of imageBlocks) {
        const content = block.replace('[/IMAGE]', '').trim();
        const pageMatch = content.match(/Page:\s*(\d+)/i);
        const plantMatch = content.match(/Plant:\s*(.+)/i);
        const typeMatch = content.match(/Type:\s*(.+)/i);
        const featureMatch = content.match(/Feature:\s*(.+)/i);

        if (plantMatch || typeMatch) {
          extractedImages.push({
            pageNumber: pageMatch ? parseInt(pageMatch[1], 10) : 0,
            imageIndex: extractedImages.length + 1,
            dataUrl: '', // No actual image - text-based analysis
            mimeType: 'text/vlm-analysis',
            width: 0,
            height: 0,
            contextText: content,
          });
        }
      }

      traceAPI(`[VisualExtract] VLM page analysis found ${extractedImages.length} image descriptions`);
      return extractedImages;
    }
  } catch (vlmError) {
    traceError(`[VisualExtract] VLM page analysis failed: ${vlmError instanceof Error ? vlmError.message : 'خطأ'}`);
  }

  return [];
}

// ─── Step 2 & 3: Filter and Label Images with VLM ────────────────────

/**
 * Analyze an image using VLM to determine if it's a relevant academic image
 * and generate a high-yield label.
 */
async function filterAndLabelImage(
  image: ExtractedImage,
  language: string = 'ar'
): Promise<LabeledImage> {
  const labeledImage: LabeledImage = {
    ...image,
    isRelevant: false,
    plantName: '',
    imageType: '',
    diagnosticFeature: '',
    confidence: 0,
    rawAnalysis: '',
  };

  // If no actual image data (VLM-based fallback), use context text
  if (!image.dataUrl || image.mimeType === 'text/vlm-analysis') {
    // Parse from context text (VLM already analyzed it)
    const content = image.contextText || '';
    const plantMatch = content.match(/Plant:\s*(.+)/i);
    const typeMatch = content.match(/Type:\s*(.+)/i);
    const featureMatch = content.match(/Feature:\s*(.+)/i);

    labeledImage.isRelevant = !!(plantMatch || typeMatch);
    labeledImage.plantName = plantMatch?.[1]?.trim() || '';
    labeledImage.imageType = typeMatch?.[1]?.trim() || '';
    labeledImage.diagnosticFeature = featureMatch?.[1]?.trim() || '';
    labeledImage.confidence = labeledImage.isRelevant ? 0.7 : 0;
    labeledImage.rawAnalysis = content;
    return labeledImage;
  }

  // Use VLM to analyze the actual image
  const analysisPrompt = `أنت وكيل متخصص في تحليل الصور الأكاديمية والتعليمية.
حلل هذه الصورة المأخوذة من ملف/محاضرة.

مهمتك:
1. حدد هل هذه الصورة تعليمية/أكاديمية/تشخيصية مهمة أم مجرد زخرفة/شعار/غلاف؟
2. إذا كانت مهمة، حدد: عنوان الصورة، نوعها، ووصف دقيق

أنواع الصور المهمة (أي صورة تعليمية أو أكاديمية):
- مقاطع عرضية (T.S.) — Transverse Sections
- صور مجهرية (Microscopic images) — Cell/tissue structures
- عناصر مسحوقية (Powder Key Elements) — Microscopical features
- اختبارات كيميائية (Chemical Tests) — Test results
- رسومات مورفولوجية (Morphological diagrams) — Structural features
- رسوم بيانية مهمة (Important diagrams/charts)
- جداول مقارنة (Comparison tables)
- صور تشريحية (Anatomical images)
- مخططات انسيابية (Flowcharts)
- أي صورة تحتوي على معلومات أكاديمية مهمة

أنواع الصور غير المهمة (تجاهلها دائمًا):
- شعارات جامعات أو شركات، أيقونات، زخارف، صور غلاف، أشكال فارغة، خلفيات

أجب بالتنسيق التالي بدقة:
RELEVANT: نعم/لا
PLANT: عنوان مختصر للصورة (مثال: مقطع عرضي للنبات، رسم بياني للمعدلات، جدول المقارنة)
TYPE: نوع الصورة (مثال: T.S. / Microscopic / Chemical Test / Morphological / Diagram / Table / Flowchart)
FEATURE: وصف دقيق ومختصر (أقصى 15 كلمة) يركز على المعلومات الأكاديمية المهمة
CONFIDENCE: رقم من 0.5 إلى 1.0

السياق من الصفحة: ${image.contextText.slice(0, 200)}`;

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

    const analysisText = result.text || '';
    labeledImage.rawAnalysis = analysisText;
    parseVLMResponse(labeledImage, analysisText);

    traceAPI(`[VisualExtract] Gemini Vision labeled image (p${image.pageNumber}_img${image.imageIndex}): relevant=${labeledImage.isRelevant}, plant=${labeledImage.plantName}`);
    return labeledImage;
  } catch (geminiError) {
    traceError(`[VisualExtract] Gemini Vision failed for image: ${geminiError instanceof Error ? geminiError.message : 'خطأ'}`);
  }

  // Fallback: ZAI VLM
  try {
    const zai = await getZAIClient();

    const result = await zai.chat.completions.createVision({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'image_url', image_url: { url: image.dataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const analysisText = result?.choices?.[0]?.message?.content || '';
    labeledImage.rawAnalysis = analysisText;
    parseVLMResponse(labeledImage, analysisText);

    traceAPI(`[VisualExtract] ZAI VLM labeled image (p${image.pageNumber}_img${image.imageIndex}): relevant=${labeledImage.isRelevant}`);
    return labeledImage;
  } catch (zaiError) {
    traceError(`[VisualExtract] ZAI VLM failed for image: ${zaiError instanceof Error ? zaiError.message : 'خطأ'}`);
  }

  // If all VLM providers fail, keep as non-relevant
  return labeledImage;
}

/**
 * Parse VLM response into structured label fields.
 */
function parseVLMResponse(labeledImage: LabeledImage, text: string): void {
  const lower = text.toLowerCase();

  // Check relevance
  const relevantMatch = text.match(/RELEVANT:\s*(نعم|yes|true|1)/i);
  labeledImage.isRelevant = !!relevantMatch;

  // Also check if the text mentions it's irrelevant
  const irrelevantMatch = text.match(/RELEVANT:\s*(لا|no|false|0)/i);
  if (irrelevantMatch) labeledImage.isRelevant = false;

  // If no RELEVANT field, check by content analysis
  if (!relevantMatch && !irrelevantMatch) {
    const irrelevantKeywords = ['شعار', 'logo', 'أيقونة', 'icon', 'زخرفة', 'decoration', 'غلاف', 'cover', 'فارغ', 'blank', 'غير مهم', 'خلفية', 'background'];
    const relevantKeywords = ['مقطع', 't.s', 'transverse', 'مسحوق', 'powder', 'اختبار', 'test', 'مورفولوج', 'morpholog', 'خلايا', 'cells', 'أنسجة', 'tissue', 'مجهري', 'microscop', 'رسوم', 'diagram', 'بيان', 'chart', 'جدول', 'table', 'تشريح', 'anatom', 'مخطط', 'flowchart', 'تعليمي', 'educational', 'أكاديمي', 'academic', 'مهم', 'important', 'صيدلان', 'pharmac', 'نبات', 'plant', 'دواء', 'drug'];
    
    const hasIrrelevant = irrelevantKeywords.some(kw => lower.includes(kw));
    const hasRelevant = relevantKeywords.some(kw => lower.includes(kw));
    
    labeledImage.isRelevant = hasRelevant && !hasIrrelevant;
  }

  // Extract plant name
  const plantMatch = text.match(/PLANT:\s*(.+?)(?:\n|$)/i);
  if (plantMatch) {
    labeledImage.plantName = plantMatch[1].trim().replace(/["\[\]]/g, '');
  }

  // Extract image type
  const typeMatch = text.match(/TYPE:\s*(.+?)(?:\n|$)/i);
  if (typeMatch) {
    labeledImage.imageType = typeMatch[1].trim().replace(/["\[\]]/g, '');
  }

  // Extract diagnostic feature
  const featureMatch = text.match(/FEATURE:\s*(.+?)(?:\n|$)/i);
  if (featureMatch) {
    labeledImage.diagnosticFeature = featureMatch[1].trim().replace(/["\[\]]/g, '');
  }

  // Extract confidence
  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
  if (confidenceMatch) {
    labeledImage.confidence = Math.min(Math.max(parseFloat(confidenceMatch[1]), 0), 1);
  } else {
    labeledImage.confidence = labeledImage.isRelevant ? 0.8 : 0.2;
  }
}

// ─── Step 4: Compile Visual Summary PDF ───────────────────────────────

/**
 * Compile labeled images into a clean HTML grid and render as PDF.
 */
async function compileVisualSummaryPdf(
  labeledImages: LabeledImage[],
  pdfTitle: string,
  language: string = 'ar'
): Promise<Buffer> {
  const relevantImages = labeledImages.filter((img) => img.isRelevant);

  if (relevantImages.length === 0) {
    // Generate a "no relevant images found" PDF
    const noImagesHtml = generateNoImagesHTML(pdfTitle, language);
    const result = await renderHTMLToPDF({
      html: noImagesHtml,
      title: pdfTitle,
      language: language as 'ar' | 'en',
      pageSize: 'A4',
      margins: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });

    if (!result.success || !result.pdfBuffer) {
      throw new Error('فشل في توليد PDF');
    }
    return result.pdfBuffer;
  }

  // Generate the visual summary HTML
  const html = generateVisualSummaryHTML(relevantImages, pdfTitle, language);

  const result = await renderHTMLToPDF({
    html,
    title: pdfTitle,
    language: language as 'ar' | 'en',
    pageSize: 'A4',
    margins: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  });

  if (!result.success || !result.pdfBuffer) {
    throw new Error('فشل في توليد PDF');
  }

  return result.pdfBuffer;
}

/**
 * Generate HTML template for the visual summary PDF.
 * Clean 2-column grid with image cards.
 */
function generateVisualSummaryHTML(
  images: LabeledImage[],
  title: string,
  language: string
): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const textAlign = isRTL ? 'right' : 'left';

  const imageCards = images.map((img, idx) => {
    const hasImageData = img.dataUrl && img.mimeType !== 'text/vlm-analysis';
    const confidencePercent = Math.round(img.confidence * 100);

    return `
    <div class="card">
      <div class="card-header">
        <span class="card-number">${idx + 1}</span>
        <div class="card-titles">
          <div class="plant-name">${img.plantName || 'غير محدد'}</div>
          <div class="image-type">${img.imageType || 'عام'}</div>
        </div>
        <span class="confidence ${confidencePercent >= 80 ? 'high' : confidencePercent >= 60 ? 'medium' : 'low'}">${confidencePercent}%</span>
      </div>
      ${hasImageData ? `
      <div class="card-image">
        <img src="${img.dataUrl}" alt="${img.plantName} - ${img.imageType}" />
      </div>
      ` : `
      <div class="card-image card-image-text">
        <div class="text-analysis">${img.rawAnalysis || img.contextText || 'لا يوجد وصف'}</div>
      </div>
      `}
      <div class="card-label">
        <div class="label-row">
          <span class="label-key">🔬 ${isRTL ? 'الوصف التشخيصي' : 'Diagnostic Feature'}:</span>
          <span class="label-value">${img.diagnosticFeature || '—'}</span>
        </div>
        <div class="label-row">
          <span class="label-key">📄 ${isRTL ? 'الصفحة' : 'Page'}:</span>
          <span class="label-value">${img.pageNumber || '—'}</span>
        </div>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
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
      background: linear-gradient(135deg, #065f46 0%, #047857 100%);
      color: white;
      padding: 24px 28px;
      border-radius: 12px;
      margin-bottom: 24px;
      text-align: center;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .header .subtitle {
      font-size: 13px;
      opacity: 0.85;
    }
    .stats {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      justify-content: center;
    }
    .stat-box {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 16px;
      text-align: center;
      min-width: 100px;
    }
    .stat-box .stat-number {
      font-size: 24px;
      font-weight: 700;
      color: #047857;
    }
    .stat-box .stat-label {
      font-size: 11px;
      color: #64748b;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      break-inside: avoid;
    }
    .card-header {
      background: #f0fdf4;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 2px solid #d1fae5;
    }
    .card-number {
      background: #047857;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .card-titles {
      flex: 1;
      min-width: 0;
    }
    .plant-name {
      font-size: 14px;
      font-weight: 700;
      color: #065f46;
    }
    .image-type {
      font-size: 11px;
      color: #64748b;
    }
    .confidence {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      flex-shrink: 0;
    }
    .confidence.high { background: #d1fae5; color: #065f46; }
    .confidence.medium { background: #fef3c7; color: #92400e; }
    .confidence.low { background: #fee2e2; color: #991b1b; }
    .card-image {
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 150px;
      max-height: 250px;
      overflow: hidden;
    }
    .card-image img {
      max-width: 100%;
      max-height: 250px;
      object-fit: contain;
    }
    .card-image-text {
      padding: 16px;
      text-align: ${textAlign};
      font-size: 12px;
      color: #475569;
      line-height: 1.7;
      background: #fefce8;
      border: 1px dashed #d97706;
      margin: 8px;
      border-radius: 8px;
    }
    .text-analysis {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .card-label {
      padding: 10px 14px;
      border-top: 1px solid #e2e8f0;
    }
    .label-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .label-key {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
    }
    .label-value {
      font-size: 12px;
      font-weight: 700;
      color: #1e293b;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      padding: 12px;
      color: #94a3b8;
      font-size: 10px;
      border-top: 1px solid #e2e8f0;
    }
    @media print {
      body { padding: 0; background: white; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔬 ${isRTL ? 'ملخص بصري' : 'Visual Summary'}: ${title}</h1>
    <div class="subtitle">${isRTL ? 'استخراج وتصنيف الصور التعليمية بالذكاء الاصطناعي' : 'AI-powered educational image extraction & classification'}</div>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-number">${images.length}</div>
      <div class="stat-label">${isRTL ? 'صور مهمة' : 'Relevant'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${Math.round(images.reduce((s, i) => s + i.confidence, 0) / images.length * 100)}%</div>
      <div class="stat-label">${isRTL ? 'متوسط الثقة' : 'Avg Confidence'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${new Set(images.map(i => i.plantName).filter(Boolean)).size}</div>
      <div class="stat-label">${isRTL ? 'نباتات/أدوية' : 'Plants/Drugs'}</div>
    </div>
  </div>

  <div class="grid">
    ${imageCards}
  </div>

  <div class="footer">
    DeltaAI | بعقل هادي — ${isRTL ? 'ملخص بصري تلقائي' : 'Auto Visual Summary'} — ${new Date().toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for the "no relevant images found" case.
 */
function generateNoImagesHTML(title: string, language: string): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    body {
      font-family: 'Cairo', sans-serif;
      direction: ${dir};
      text-align: center;
      padding: 60px 40px;
      color: #475569;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: #1e293b; margin-bottom: 12px; }
    p { font-size: 14px; line-height: 1.8; max-width: 500px; margin: 0 auto; }
    .tip { background: #fef3c7; padding: 16px; border-radius: 8px; margin-top: 24px; display: inline-block; }
  </style>
</head>
<body>
  <div class="icon">🔍</div>
  <h2>${isRTL ? 'لم يتم العثور على صور تعليمية' : 'No Educational Images Found'}</h2>
  <p>${isRTL ? 'لم يتم العثور على صور تشخيصية أو أكاديمية مهمة في هذا الملف. قد يكون الملف يحتوي على نصوص فقط أو صور زخرفية.' : 'No diagnostic or academic images were found in this file. It may contain only text or decorative images.'}</p>
  <div class="tip">💡 ${isRTL ? 'نصيحة: جرب استخدام أمر /ملخص للحصول على ملخص نصي شامل للمحاضرة' : 'Tip: Try using /ملخص command for a comprehensive text summary of the lecture'}</div>
</body>
</html>`;
}

// ─── Main Pipeline ────────────────────────────────────────────────────

/**
 * Process a PDF file through the visual extraction pipeline.
 *
 * 1. Extract embedded images from PDF
 * 2. Filter & label each image using VLM
 * 3. Compile relevant labeled images into a visual summary PDF
 */
export async function processPdfVisualExtract(
  pdfBase64DataUrl: string,
  pdfTitle: string = 'Visual Summary',
  language: string = 'ar',
  onProgress?: VisualExtractProgressCallback
): Promise<VisualExtractResult> {
  const startTime = Date.now();
  const model = 'gemini-vision';

  // ── Step 1: Extract Images ──
  onProgress?.({
    stage: 'extracting',
    detail: 'جاري استخراج الصور من ملف PDF...',
    current: 0,
    total: 4,
    percentComplete: 5,
  });

  const extractedImages = await extractImagesFromPdf(pdfBase64DataUrl, onProgress);

  traceAPI(`[VisualExtract] Step 1 complete: ${extractedImages.length} images extracted`);

  // ── Step 2 & 3: Filter and Label with VLM ──
  const labeledImages: LabeledImage[] = [];

  for (let i = 0; i < extractedImages.length; i++) {
    const image = extractedImages[i];

    onProgress?.({
      stage: 'filtering',
      detail: `جاري تحليل الصورة ${i + 1} من ${extractedImages.length}...`,
      current: i + 1,
      total: extractedImages.length,
      percentComplete: 20 + Math.round((i / extractedImages.length) * 50),
    });

    try {
      const labeled = await filterAndLabelImage(image, language);
      labeledImages.push(labeled);
    } catch (error) {
      traceError(`[VisualExtract] Failed to label image ${i + 1}: ${error instanceof Error ? error.message : 'خطأ'}`);
      labeledImages.push({
        ...image,
        isRelevant: false,
        plantName: '',
        imageType: '',
        diagnosticFeature: '',
        confidence: 0,
        rawAnalysis: `خطأ: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
      });
    }
  }

  const relevantCount = labeledImages.filter((img) => img.isRelevant).length;
  traceAPI(`[VisualExtract] Step 2&3 complete: ${relevantCount}/${labeledImages.length} images are relevant`);

  // ── Step 4: Compile Visual Summary PDF ──
  onProgress?.({
    stage: 'compiling',
    detail: `جاري تجميع الملخص البصري (${relevantCount} صورة مهمة)...`,
    current: 3,
    total: 4,
    percentComplete: 85,
  });

  const pdfBuffer = await compileVisualSummaryPdf(labeledImages, pdfTitle, language);

  traceAPI(`[VisualExtract] Step 4 complete: PDF generated (${pdfBuffer.length} bytes)`);

  const totalProcessingTimeMs = Date.now() - startTime;

  onProgress?.({
    stage: 'completed',
    detail: `تم! ${relevantCount} صورة مهمة من أصل ${labeledImages.length} — ${Math.round(totalProcessingTimeMs / 1000)}s`,
    current: 4,
    total: 4,
    percentComplete: 100,
  });

  return {
    totalImagesFound: extractedImages.length,
    relevantImages: relevantCount,
    labeledImages,
    pdfBuffer,
    totalProcessingTimeMs,
    model,
  };
}
