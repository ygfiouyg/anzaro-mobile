/**
 * Vision & OCR Tools — أدوات رؤية حقيقية
 * ========================================
 * بتستخدم GLM-4V (ZhipuAI vision model) لتحليل الصور.
 *
 * الأدوات:
 * 1. vision-analyze — تحليل أي صورة (وصف، أسئلة)
 * 2. ocr-extract — استخراج نص من صورة
 * 3. ocr-structured — استخراج نص منظم (JSON)
 * 4. ocr-latex — تحويل معادلات لـ LaTeX
 * 5. chart-analyze — تحليل الرسوم البيانية
 * 6. doc-analyze — تحليل مستندات (PDF/DOCX)
 */

import { getZAIClient } from '../zai-client';

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * إرسال طلب vision لـ GLM-4V.
 */
async function callVision(
  imageBase64: string,
  prompt: string,
  model: string = 'glm-4v'
): Promise<string> {
  const response = await fetch(`${ZAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vision API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════
// 1. Vision Analyze — تحليل عام للصورة
// ═══════════════════════════════════════════
export async function visionAnalyze(imageBase64: string, question: string): Promise<{
  success: boolean;
  analysis: string;
  error?: string;
}> {
  try {
    const prompt = question || 'صفلي الصورة دي بالتفصيل. إيه اللي فيها؟ إيه الألوان؟ إيه العناصر الرئيسية؟';
    const analysis = await callVision(imageBase64, prompt);
    return { success: true, analysis };
  } catch (e: any) {
    return { success: false, analysis: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 2. OCR Extract — استخراج نص من صورة
// ═══════════════════════════════════════════
export async function ocrExtract(imageBase64: string): Promise<{
  success: boolean;
  text: string;
  error?: string;
}> {
  try {
    const prompt = 'استخرج كل النص من الصورة دي بالظبط. حافظ على التنسيق والترتيب. لو فيه نص عربي أو إنجليزي، اكتبه زي ما هو. ارجع النص فقط بدون شرح.';
    const text = await callVision(imageBase64, prompt);
    return { success: true, text };
  } catch (e: any) {
    return { success: false, text: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 3. OCR Structured — استخراج نص منظم (JSON)
// ═══════════════════════════════════════════
export async function ocrStructured(imageBase64: string): Promise<{
  success: boolean;
  data: any;
  error?: string;
}> {
  try {
    const prompt = `استخرج كل المعلومات من الصورة دي في JSON format:
{
  "title": "عنوان المستند لو موجود",
  "type": "نوع المستند (receipt, invoice, form, document, screenshot, etc.)",
  "text": "كل النص المستخرج",
  "fields": { "key": "value" لكل حقل مهم },
  "tables": [ { "headers": [], "rows": [] } ] لو فيه جداول
}

ارجع JSON فقط بدون شرح.`;
    const text = await callVision(imageBase64, prompt);

    // حاول parse JSON
    let data: any;
    try {
      // شيل ```json و ``` لو موجودة
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      data = JSON.parse(clean);
    } catch {
      data = { raw: text };
    }

    return { success: true, data };
  } catch (e: any) {
    return { success: false, data: null, error: e.message };
  }
}

// ═══════════════════════════════════════════
// 4. OCR LaTeX — تحويل معادلات لـ LaTeX
// ═══════════════════════════════════════════
export async function ocrLatex(imageBase64: string): Promise<{
  success: boolean;
  latex: string;
  error?: string;
}> {
  try {
    const prompt = 'حوّل المعادلة الرياضية في الصورة دي لـ LaTeX code. ارجع LaTeX فقط بدون شرح. مثال: \\frac{a}{b} = c^2';
    const latex = await callVision(imageBase64, prompt);
    return { success: true, latex };
  } catch (e: any) {
    return { success: false, latex: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 5. Chart Analyze — تحليل الرسوم البيانية
// ═══════════════════════════════════════════
export async function chartAnalyze(imageBase64: string): Promise<{
  success: boolean;
  analysis: string;
  error?: string;
}> {
  try {
    const prompt = `حلل الرسم البياني في الصورة دي:

1. نوع الرسم (bar, line, pie, scatter, etc.)
2. العنوان والمحاور
3. البيانات الظاهرة (أرقام وقيم)
4. الاتجاهات والملاحظات
5. ملخص النتائج

اكتب التحليل بالعربي.`;
    const analysis = await callVision(imageBase64, prompt);
    return { success: true, analysis };
  } catch (e: any) {
    return { success: false, analysis: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 6. Doc Analyze — تحليل مستند (PDF كصورة)
// ═══════════════════════════════════════════
export async function docAnalyze(imageBase64: string, question: string): Promise<{
  success: boolean;
  analysis: string;
  error?: string;
}> {
  try {
    const prompt = question || 'حلل المستند ده واعمل ملخص شامل. إيه المعلومات الرئيسية؟ إيه النقاط المهمة؟';
    const analysis = await callVision(imageBase64, prompt);
    return { success: true, analysis };
  } catch (e: any) {
    return { success: false, analysis: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// Vision Tools Registry
// ═══════════════════════════════════════════
export interface VisionToolDef {
  id: string;
  name: string;
  description: string;
  prompt: string;
  outputType: 'text' | 'json' | 'code';
}

export const VISION_TOOLS: VisionToolDef[] = [
  {
    id: 'vision-analyze',
    name: '👁️ تحليل صورة',
    description: 'وصف وتحليل أي صورة. ارفع صورة واكتب سؤالك.',
    prompt: '',
    outputType: 'text',
  },
  {
    id: 'ocr-extract',
    name: '📝 استخراج نص (OCR)',
    description: 'استخراج كل النص من صورة (مستند، إيصال، سكرين شوت).',
    prompt: 'استخرج كل النص من الصورة دي بالظبط. حافظ على التنسيق.',
    outputType: 'text',
  },
  {
    id: 'ocr-structured',
    name: '📊 استخراج منظم (JSON)',
    description: 'استخراج معلومات منظم من صورة في JSON (إيصالات، فواتير، نماذج).',
    prompt: 'استخرج المعلومات في JSON format.',
    outputType: 'json',
  },
  {
    id: 'ocr-latex',
    name: '🔢 معادلات LaTeX',
    description: 'تحويل صور المعادلات الرياضية لـ LaTeX code.',
    prompt: 'حوّل المعادلة لـ LaTeX.',
    outputType: 'code',
  },
  {
    id: 'chart-analyze',
    name: '📈 تحليل رسم بياني',
    description: 'تحليل الرسوم البيانية (bar, line, pie) واستخراج البيانات.',
    prompt: 'حلل الرسم البياني.',
    outputType: 'text',
  },
  {
    id: 'doc-analyze',
    name: '📄 تحليل مستند',
    description: 'تحليل وملخص أي مستند (PDF صفحة، وثيقة، عقد).',
    prompt: 'حلل المستند واعمل ملخص.',
    outputType: 'text',
  },
];

/**
 * تشغيل أداة vision.
 */
export async function runVisionTool(
  toolId: string,
  imageBase64: string,
  question?: string
): Promise<{ success: boolean; output: string; outputType: string; error?: string }> {
  try {
    switch (toolId) {
      case 'vision-analyze': {
        const result = await visionAnalyze(imageBase64, question || '');
        return { success: result.success, output: result.analysis, outputType: 'text', error: result.error };
      }
      case 'ocr-extract': {
        const result = await ocrExtract(imageBase64);
        return { success: result.success, output: result.text, outputType: 'text', error: result.error };
      }
      case 'ocr-structured': {
        const result = await ocrStructured(imageBase64);
        return {
          success: result.success,
          output: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
          outputType: 'json',
          error: result.error,
        };
      }
      case 'ocr-latex': {
        const result = await ocrLatex(imageBase64);
        return { success: result.success, output: result.latex, outputType: 'code', error: result.error };
      }
      case 'chart-analyze': {
        const result = await chartAnalyze(imageBase64);
        return { success: result.success, output: result.analysis, outputType: 'text', error: result.error };
      }
      case 'doc-analyze': {
        const result = await docAnalyze(imageBase64, question || '');
        return { success: result.success, output: result.analysis, outputType: 'text', error: result.error };
      }
      default:
        return { success: false, output: '', outputType: 'text', error: `أداة vision غير معروفة: ${toolId}` };
    }
  } catch (e: any) {
    return { success: false, output: '', outputType: 'text', error: e.message };
  }
}
