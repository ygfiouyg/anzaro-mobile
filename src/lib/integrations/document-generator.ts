/**
 * Document Generator — DOCX + XLSX + PPTX احترافي
 * ================================================
 * بيستخدم أفضل المكتبات:
 * - docx (للـ Word)
 * - exceljs (للـ Excel)
 * - pptxgenjs (للـ PowerPoint)
 *
 * GLM-5.2 بيكتب المحتوى + المكتبة بتنسّقه
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import pptxgen from 'pptxgenjs';
import { getZAIClient } from '@/lib/zai-client';

export interface DocumentGenRequest {
  topic: string;
  type: 'docx' | 'xlsx' | 'pptx';
  language?: 'ar' | 'en';
  context?: string;
}

export interface DocumentGenResult {
  success: boolean;
  buffer?: Buffer;
  filename: string;
  mimeType: string;
  error?: string;
}

// ─── Theme ────────────────────────────────────────────────────────────────
const THEME = {
  primary: '2E74B5',
  secondary: '1F4E79',
  accent: 'ED7D31',
  light: 'F2F2F2',
  dark: '333333',
  white: 'FFFFFF',
};

/**
 * توليد محتوى احترافي بـ GLM-5.2
 */
async function generateContent(topic: string, type: string, language: string): Promise<any> {
  const zai = await getZAIClient();
  const lang = language === 'ar' ? 'بالعربية' : 'in English';

  let systemPrompt = '';
  if (type === 'docx') {
    systemPrompt = `أنت كاتب محتوى احترافي. اكتب مقال/تقرير كامل عن الموضوع ${lang}. رجّع JSON بهيكل:
{"title":"...","author":"...","sections":[{"heading":"...","paragraphs":["...","..."]}],"table":{"headers":[...],"rows":[[...]]}}
أرجع JSON فقط بدون شرح.`;
  } else if (type === 'xlsx') {
    systemPrompt = `أنت محلل بيانات. اعمل بيانات Excel واقعية عن الموضوع ${lang}. رجّع JSON:
{"sheetName":"...","headers":["...","..."],"rows":[["...","..."]],"summary":"..."}
10-20 صفوف واقعية. JSON فقط.`;
  } else if (type === 'pptx') {
    systemPrompt = `أنت مصمم عروض تقديمية. اعمل عرض احترافي عن الموضوع ${lang}. رجّع JSON:
{"title":"...","author":"...","slides":[{"layout":"title","title":"...","subtitle":"..."},{"layout":"content","title":"...","bullets":["...","..."]},{"layout":"section","title":"..."}]}
8-15 شريحة. JSON فقط.`;
  }

  const completion = await zai.chat.completions.create({
    model: 'glm-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `اكتب عن: ${topic}` },
    ],
    max_tokens: 8192,
    temperature: 0.7,
  });

  const text = completion?.choices?.[0]?.message?.content || '{}';
  // استخراج JSON من الرد
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      title: topic,
      sections: [{ heading: topic, paragraphs: [text.slice(0, 2000)] }],
    };
  }
  try {
    return JSON.parse(match[0]);
  } catch {
    return {
      title: topic,
      sections: [{ heading: topic, paragraphs: [text.slice(0, 2000)] }],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DOCX Generation
// ═══════════════════════════════════════════════════════════════════════

async function generateDocx(topic: string, language: string): Promise<Buffer> {
  const content = await generateContent(topic, 'docx', language);
  const isAr = language === 'ar';

  const children: any[] = [];

  // Title
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: content.title || topic, bold: true, size: 48, color: THEME.primary })],
  }));

  // Author
  if (content.author) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: content.author, italics: true, size: 24, color: '666666' })],
      spacing: { after: 480 },
    }));
  }

  // Sections
  for (const section of content.sections || []) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: section.heading, bold: true, size: 32, color: THEME.primary })],
      spacing: { before: 360, after: 200 },
    }));

    for (const p of section.paragraphs || []) {
      children.push(new Paragraph({
        alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: isAr,
        children: [new TextRun({ text: p, size: 24 })],
        spacing: { after: 200 },
      }));
    }
  }

  // Table
  if (content.table && content.table.headers) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: isAr ? 'جدول البيانات' : 'Data Table', bold: true, size: 32, color: THEME.primary })],
      spacing: { before: 480, after: 200 },
    }));

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: content.table.headers.map((h: string) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: THEME.white })] })],
              shading: { fill: THEME.primary },
            })
          ),
        }),
        ...content.table.rows.map((row: string[]) =>
          new TableRow({
            children: row.map((cell: string) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(cell) })] })],
              })
            ),
          })
        ),
      ],
    }));
  }

  const doc = new Document({
    creator: 'DeltaAI',
    title: content.title || topic,
    description: content.title || topic,
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

// ═══════════════════════════════════════════════════════════════════════
// XLSX Generation
// ═══════════════════════════════════════════════════════════════════════

async function generateXlsx(topic: string, language: string): Promise<Buffer> {
  const content = await generateContent(topic, 'xlsx', language);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DeltaAI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(content.sheetName || 'Sheet1', {
    properties: { tabColor: { argb: 'FF' + THEME.primary } },
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const headers = content.headers || ['Column 1'];
  sheet.columns = headers.map((h: string, i: number) => ({
    header: h,
    key: `col${i}`,
    width: 20,
  }));

  // Style header row
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + THEME.primary } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Data rows
  for (const row of content.rows || []) {
    const rowObj: any = {};
    row.forEach((cell: string, i: number) => { rowObj[`col${i}`] = cell; });
    const addedRow = sheet.addRow(rowObj);
    addedRow.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  }

  // Summary
  if (content.summary) {
    sheet.addRow([]);
    const summaryRow = sheet.addRow({ col0: content.summary });
    summaryRow.getCell(1).font = { bold: true, italics: true, color: { argb: 'FF' + THEME.secondary } };
    sheet.mergeCells(`A${summaryRow.number}:${String.fromCharCode(64 + headers.length)}${summaryRow.number}`);
  }

  // Auto-filter
  sheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + headers.length)}${(content.rows || []).length + 1}`,
  };

  return await workbook.xlsx.writeBuffer() as Buffer;
}

// ═══════════════════════════════════════════════════════════════════════
// PPTX Generation
// ═══════════════════════════════════════════════════════════════════════

async function generatePptx(topic: string, language: string): Promise<Buffer> {
  const content = await generateContent(topic, 'pptx', language);

  const pptx = new pptxgen();
  pptx.author = 'DeltaAI';
  pptx.title = content.title || topic;
  pptx.layout = 'LAYOUT_WIDE'; // 10 x 5.5 inches

  for (const slide of content.slides || []) {
    const s = pptx.addSlide();

    if (slide.layout === 'title') {
      s.background = { color: THEME.primary };
      s.addText(slide.title || content.title || topic, {
        x: 0.5, y: 2, w: 9, h: 1.5,
        fontSize: 44, bold: true, color: THEME.white,
        align: 'center', fontFace: 'Arial',
      });
      if (slide.subtitle || content.author) {
        s.addText(slide.subtitle || content.author || '', {
          x: 0.5, y: 3.8, w: 9, h: 0.8,
          fontSize: 24, color: 'D6E4F0',
          align: 'center', fontFace: 'Arial',
        });
      }
    } else if (slide.layout === 'section') {
      s.background = { color: THEME.secondary };
      s.addText(slide.title || '', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 36, bold: true, color: THEME.white,
        align: 'center', fontFace: 'Arial',
      });
    } else {
      // content slide
      s.addText(slide.title || '', {
        x: 0.5, y: 0.3, w: 9, h: 0.8,
        fontSize: 32, bold: true, color: THEME.primary,
        fontFace: 'Arial',
      });

      // underline
      s.addShape('line', { x: 0.5, y: 1.1, w: 9, h: 0, line: { color: THEME.accent, width: 2 } });

      if (slide.bullets && slide.bullets.length > 0) {
        s.addText(
          slide.bullets.map((b: string) => ({
            text: b,
            options: { bullet: { code: '2022' }, indentLevel: 0, breakLine: true, fontSize: 20, color: THEME.dark },
          })),
          { x: 0.5, y: 1.3, w: 9, h: 4, fontFace: 'Arial', valign: 'top' }
        );
      }

      if (slide.content) {
        s.addText(slide.content, {
          x: 0.5, y: 1.3, w: 9, h: 4,
          fontSize: 20, color: THEME.dark,
          fontFace: 'Arial', valign: 'top',
        });
      }
    }

    // Footer
    s.addText('DeltaAI', {
      x: 8.5, y: 5, w: 1, h: 0.3,
      fontSize: 10, color: '999999', align: 'right',
    });
  }

  return await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

export async function generateDocument(req: DocumentGenRequest): Promise<DocumentGenResult> {
  try {
    const language = req.language || 'ar';
    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    switch (req.type) {
      case 'docx':
        buffer = await generateDocx(req.topic, language);
        filename = `${req.topic.slice(0, 50)}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
        buffer = await generateXlsx(req.topic, language);
        filename = `${req.topic.slice(0, 50)}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'pptx':
        buffer = await generatePptx(req.topic, language);
        filename = `${req.topic.slice(0, 50)}.pptx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        break;
      default:
        return { success: false, filename: '', mimeType: '', error: 'نوع غير مدعوم' };
    }

    return { success: true, buffer, filename, mimeType };
  } catch (e: any) {
    return { success: false, filename: '', mimeType: '', error: e.message };
  }
}
