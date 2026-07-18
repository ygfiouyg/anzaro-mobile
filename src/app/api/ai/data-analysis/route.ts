import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/chat-utils';
import { generateChartSVG } from '@/lib/chart-generator';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import type { ChartSpec } from '@/lib/design-reasoning';
import { resolveActiveModel } from "@/lib/active-model";


// ─── Types ────────────────────────────────────────────────────────────
interface DataFile {
  name: string;
  content: string; // base64 or text
  type: string; // file category: 'text', 'csv', 'excel', etc.
}

interface DataAnalysisRequest {
  files: DataFile[];
  prompt: string;
  model?: string;
}

interface DataAnalysisResponse {
  summary: string;
  insights: string[];
  charts: { spec: ChartSpec; svg: string }[];
  recommendation: string;
}

// ─── CSV Parser ───────────────────────────────────────────────────────
interface ParsedCSV {
  headers: string[];
  rows: string[][];
  rawText: string;
}

function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], rawText: text };

  // Detect delimiter (comma, tab, semicolon, or Arabic comma)
  const delimiters = [',', '\t', ';', '،'];
  let bestDelimiter = ',';
  let maxCols = 0;

  for (const d of delimiters) {
    const cols = lines[0].split(d).length;
    if (cols > maxCols) {
      maxCols = cols;
      bestDelimiter = d;
    }
  }

  const headers = lines[0].split(bestDelimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines
    .slice(1)
    .map((line) => line.split(bestDelimiter).map((cell) => cell.trim().replace(/^["']|["']$/g, '')));

  return { headers, rows, rawText: text };
}

function csvToTextSummary(csv: ParsedCSV, maxRows: number = 30): string {
  const { headers, rows } = csv;
  const displayRows = rows.slice(0, maxRows);
  let text = `الأعمدة: ${headers.join(' | ')}\n`;
  text += `عدد الصفوف: ${rows.length}\n\n`;
  text += displayRows.map((row) => row.join(' | ')).join('\n');
  if (rows.length > maxRows) {
    text += `\n... و ${rows.length - maxRows} صف إضافي`;
  }
  return text;
}

// ─── JSON extraction utility ──────────────────────────────────────────
function extractJSON(text: string): string {
  // Try to find JSON object in the response
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  return text;
}

// ─── Default teal/emerald chart colors ────────────────────────────────
const CHART_COLOR_PALETTE = [
  '#14b8a6', // teal-500
  '#0d9488', // teal-600
  '#10b981', // emerald-500
  '#059669', // emerald-600
  '#06b6d4', // cyan-500
  '#0891b2', // cyan-600
  '#34d399', // emerald-400
  '#2dd4bf', // teal-400
  '#22d3ee', // cyan-400
  '#5eead4', // teal-300
];

// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth + rate limiting to data-analysis endpoint ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    const rateLimitResponse = checkRateLimit(
      request,
      user ? RATE_LIMIT_PRESETS.ai : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body: DataAnalysisRequest = await request.json();
    const { files, prompt, model } = body;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'يرجى رفع ملف واحد على الأقل' }, { status: 400 });
    }

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال سؤال التحليل' }, { status: 400 });
    }

    // ─── Parse uploaded files ────────────────────────────────────────
    const parsedData: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || file.type === 'text' || file.type === 'csv') {
        // Decode text content
        let textContent = file.content;
        // If base64 encoded, decode it
        if (file.content.startsWith('data:')) {
          try {
            const base64Part = file.content.split(',')[1];
            textContent = Buffer.from(base64Part, 'base64').toString('utf-8');
          } catch {
            textContent = file.content;
          }
        } else {
          try {
            // Try to decode as base64 if it looks like base64
            if (/^[A-Za-z0-9+/=]+$/.test(file.content) && file.content.length > 100) {
              textContent = Buffer.from(file.content, 'base64').toString('utf-8');
            }
          } catch {
            // Keep original content
          }
        }

        const csv = parseCSV(textContent);
        const summary = csvToTextSummary(csv);
        parsedData.push(`📁 ملف: ${file.name}\n${summary}`);
      } else if (['xlsx', 'xls'].includes(ext)) {
        // For Excel files, we can't parse them on server easily, so inform the AI about the file
        parsedData.push(`📁 ملف Excel: ${file.name} (بيانات ثنائية - يرجى طلب المستخدم تصديرها كـ CSV لتحليل أفضل)`);
      } else {
        parsedData.push(`📁 ملف: ${file.name} (نوع: ${ext})`);
      }
    }

    // Limit total data to prevent token overflow
    const MAX_DATA_CHARS = 8000;
    let combinedData = parsedData.join('\n\n---\n\n');
    if (combinedData.length > MAX_DATA_CHARS) {
      combinedData = combinedData.substring(0, MAX_DATA_CHARS) + '\n\n[... تم اقتطاع البيانات - حجم كبير جداً]';
    }

    // ─── Call AI for analysis ────────────────────────────────────────
    const systemPrompt = `أنت محلل بيانات خبير باللغة العربية. تقوم بتحليل البيانات المقدمة من ملفات CSV/Excel والإجابة على أسئلة المستخدمين.

يجب أن تكون إجابتك بتنسيق JSON فقط بدون أي نص إضافي.

التنسيق المطلوب:
{
  "summary": "ملخص شامل للبيانات باللغة العربية",
  "insights": [
    "رؤية أو استنتاج أول",
    "رؤية أو استنتاج ثاني",
    "رؤية أو استنتاج ثالث"
  ],
  "charts": [
    {
      "type": "bar|line|pie|radar|scatter",
      "title": "عنوان الرسم البياني بالعربية",
      "data": {
        "labels": ["التسمية1", "التسمية2", "التسمية3"],
        "values": [10, 20, 30]
      },
      "colors": ["#14b8a6", "#0d9488", "#10b981"]
    }
  ],
  "recommendation": "توصية عملية بناءً على التحليل باللغة العربية"
}

قواعد مهمة:
- الملخص يجب أن يكون مفصلاً وشاملاً باللغة العربية
- الرؤى يجب أن تكون 3-7 نقاط رئيسية مكتوبة بالعربية
- يجب أن يكون هناك 1-3 رسوم بيانية متنوعة
- ألوان الرسوم البيانية يجب أن تكون من درجات التيل والزمرد (teal/emerald)
- type يجب أن تكون واحدة من: "bar" أو "line" أو "pie" أو "radar" أو "scatter"
- labels يجب أن تكون بالعربية
- values يجب أن تكون أرقاماً حقيقية مستخرجة من البيانات
- التوصية يجب أن تكون عملية وقابلة للتنفيذ
- إذا كانت البيانات تحتوي أعمدة رقمية، استخدمها للقيم
- إذا لم تكن هناك بيانات رقمية كافية، اقترح أنواع رسوم بيانية مناسبة
- تأكد من أن القيم في labels و values متساوية الطول`;

    const userPrompt = `سؤال التحليل: ${prompt}\n\nالبيانات:\n${combinedData}`;

    const zai = await getZAIClient();

    const response = await zai.chat.completions.create({
      model: model || (body.model || 'glm-4-flash'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const rawContent = response.choices?.[0]?.message?.content || '';

    if (!rawContent) {
      return NextResponse.json(
        { error: 'لم يتم توليد التحليل. يرجى المحاولة مرة أخرى.' },
        { status: 500 }
      );
    }

    // ─── Parse AI response ───────────────────────────────────────────
    let parsed: {
      summary?: string;
      insights?: string[];
      charts?: ChartSpec[];
      recommendation?: string;
    };

    try {
      const jsonStr = extractJSON(rawContent);
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try more aggressive extraction
      try {
        const cleaned = rawContent
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        const jsonStr = extractJSON(cleaned);
        parsed = JSON.parse(jsonStr);
      } catch {
        console.error('[DataAnalysis] Failed to parse LLM response:', rawContent.slice(0, 500));
        return NextResponse.json(
          { error: 'فشل في تحليل النتائج المُولدة. يرجى المحاولة مرة أخرى.' },
          { status: 500 }
        );
      }
    }

    // ─── Validate and build response ─────────────────────────────────
    const summary = parsed.summary || 'لم يتم توليد ملخص';
    const insights = Array.isArray(parsed.insights)
      ? parsed.insights.filter((i: unknown) => typeof i === 'string').slice(0, 10)
      : ['لم يتم توليد رؤى'];
    const recommendation = parsed.recommendation || 'لم يتم توليد توصيات';

    // Process chart specs and generate SVGs
    const charts: { spec: ChartSpec; svg: string }[] = [];

    if (Array.isArray(parsed.charts)) {
      for (const chartSpec of parsed.charts.slice(0, 3)) {
        // Validate chart spec
        const validTypes = ['bar', 'line', 'pie', 'radar', 'scatter'];
        const type = validTypes.includes(chartSpec.type) ? chartSpec.type : 'bar';
        const title = String(chartSpec.title || 'رسم بياني');
        const labels = Array.isArray(chartSpec.data?.labels)
          ? chartSpec.data.labels.map(String)
          : [];
        const values = Array.isArray(chartSpec.data?.values)
          ? chartSpec.data.values.map((v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)) || 0))
          : [];

        if (labels.length === 0 || values.length === 0 || labels.length !== values.length) {
          continue; // Skip invalid chart specs
        }

        const spec: ChartSpec = {
          type: type as ChartSpec['type'],
          title,
          data: { labels, values },
          colors: Array.isArray(chartSpec.colors) && chartSpec.colors.length > 0
            ? chartSpec.colors.slice(0, labels.length)
            : CHART_COLOR_PALETTE.slice(0, labels.length),
        };

        try {
          const svg = generateChartSVG(spec, true); // RTL = true for Arabic
          charts.push({ spec, svg });
        } catch (chartError) {
          console.error('[DataAnalysis] Chart SVG generation failed:', chartError);
          // Skip this chart but continue with others
        }
      }
    }

    const result: DataAnalysisResponse = {
      summary,
      insights,
      charts,
      recommendation,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[DataAnalysis] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحليل البيانات. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
