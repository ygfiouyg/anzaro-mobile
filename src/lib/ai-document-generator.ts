/**
 * AI Document Generator — Unified, Template-Free Document Creation
 *
 * ARCHITECTURE PHILOSOPHY:
 * Instead of the old pipeline (content LLM → design-reasoning LLM → rigid CSS templates),
 * this module asks ONE model to THINK, PLAN, and PROGRAM the entire document.
 *
 * The model:
 *   1. ANALYZES the topic (content psychology, audience, purpose)
 *   2. PLANS the visual identity (unique colors, layout, typography — every time different)
 *   3. WRITES the full HTML + inline CSS itself — no template selection, no fixed styles
 *
 * The pipeline only provides:
 *   - The base HTML shell (DOCTYPE, fonts, RTL, A4 page setup)
 *   - Playwright rendering (HTML → PDF)
 *
 * This guarantees every document is visually UNIQUE because the model is the designer,
 * not a template-selector. There are ZERO fixed CSS templates in this module.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderHTMLToPDF, isPlaywrightAvailable } from './playwright-renderer';

// ─── Types ────────────────────────────────────────────────────────────────

export interface AIDocumentRequest {
  topic: string;
  language?: 'ar' | 'en';
  instructions?: string;
  channelName?: string;
  styleDescription?: string;
  progressCallback?: (
    stage: string,
    progress: number,
    message: string
  ) => void;
}

export interface AIDocumentResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  durationMs: number;
  error?: string;
  /** The complete HTML the model wrote (for debugging/preview) */
  html?: string;
}

// ─── ZAI SDK Singleton (lazy) ─────────────────────────────────────────────

async function getZAI(): Promise<NonNullable<Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>>>> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  return await ZAI.create();
}

// ─── Font base path (shared with legacy pipeline) ─────────────────────────

const FONTS_DIR = join(process.cwd(), 'src', 'lib', 'pdf-engine', 'fonts');

/**
 * The HTML shell that wraps the model's output. This is intentionally MINIMAL —
 * it only sets up fonts, RTL direction, and A4 print dimensions. Everything else
 * (colors, layout, cover, typography, components) is written by the model.
 */
function buildHTMLShell(bodyContent: string, language: 'ar' | 'en'): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DeltaAI Document</title>
<style>
  /* ── ONLY base setup: fonts + A4 page geometry. Zero visual styling. ── */
  @font-face {
    font-family: 'Cairo';
    src: url('file://${join(FONTS_DIR, 'Cairo-Regular.ttf')}') format('truetype');
    font-weight: 400; font-style: normal;
  }
  @font-face {
    font-family: 'Cairo';
    src: url('file://${join(FONTS_DIR, 'Cairo-Bold.ttf')}') format('truetype');
    font-weight: 700; font-style: normal;
  }
  @font-face {
    font-family: 'Courier Prime';
    src: url('file://${join(FONTS_DIR, 'CourierPrime-Regular.ttf')}') format('truetype');
    font-weight: 400; font-style: normal;
  }
  @font-face {
    font-family: 'Courier Prime';
    src: url('file://${join(FONTS_DIR, 'CourierPrime-Bold.ttf')}') format('truetype');
    font-weight: 700; font-style: normal;
  }
  @page {
    size: A4;
    margin: 0;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', system-ui, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
  }
  /* Each "page" is a full A4 sheet. The model controls all visual styling
     via inline <style> blocks and classes. We only enforce page breaks.
     overflow: visible so long content flows to the next printed page. */
  .delta-page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 16mm;
    page-break-after: always;
    break-after: page;
    break-inside: avoid-page;
    position: relative;
    overflow: visible;
  }
  .delta-page:last-child { page-break-after: auto; break-after: auto; }
  /* The model can use .delta-page for every A4 sheet. It styles everything else. */
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

// ─── The System Prompt: forces THINK → PLAN → PROGRAM ─────────────────────

function buildSystemPrompt(language: 'ar' | 'en'): string {
  // MINIMAL prompt — only technical format. No rules, no examples, no thinking
  // process, no color psychology. The model is FREE to think, plan, and design.
  if (language === 'ar') {
    return `اكتب مستند HTML+CSS كامل. كل صفحة A4 في <div class="delta-page">. استخدم خط Cairo. دعم RTL. أرجع HTML خام فقط بدون markdown.`;
  }
  return `Write a complete HTML+CSS document. Each A4 page in <div class="delta-page">. Use Cairo font. LTR. Return raw HTML only, no markdown.`;
}


function buildUserPrompt(req: AIDocumentRequest): string {
  const isAr = req.language === 'ar';
  const styleNote = req.styleDescription
    ? isAr
      ? `\n\n## رؤية المستخدم للتصميم (أولوية قصوى — حقّقها):\n"${req.styleDescription}"`
      : `\n\n## User's Design Vision (highest priority — make it real):\n"${req.styleDescription}"`
    : '';
  const instructionsNote = req.instructions
    ? isAr
      ? `\n\n## تعليمات إضافية:\n${req.instructions}`
      : `\n\n## Additional instructions:\n${req.instructions}`
    : '';

  return isAr
    ? `أنشئ مستند شامل عن: **${req.topic}**${instructionsNote}${styleNote}

تذكّر: فكّر أولاً (محتوى، جمهور، غرض، ألوان، تخطيط)، ثم اكتب HTML+CSS كامل من الصفر. كل صفحة في <div class="delta-page">. ابدأ بغلاف احترافي فريد، ثم 3-7 صفحات محتوى أكاديمي عميق. استخدم ألوان وتخطيط لا يشبه أي مستند آخر.`
    : `Create a comprehensive document about: **${req.topic}**${instructionsNote}${styleNote}

Remember: think first (content, audience, purpose, colors, layout), then write the complete HTML+CSS from scratch. Each page in <div class="delta-page">. Start with a unique professional cover, then 3-7 pages of deep academic content. Use colors and a layout that looks unlike any other document.`;
}

// ─── Main generator ───────────────────────────────────────────────────────

/**
 * Generate a document where the AI is the sole designer + content writer.
 * No fixed templates, no rigid CSS — every document is programmatically unique.
 */
export async function generateAIDocument(
  req: AIDocumentRequest
): Promise<AIDocumentResult> {
  const startTime = Date.now();
  const language = req.language || 'ar';
  const { progressCallback } = req;

  try {
    progressCallback?.('thinking', 10, language === 'ar' ? '🧠 الموديل بيفكّر ويحلّل الموضوع...' : '🧠 Model is thinking and analyzing...');
    const zai = await getZAI();

    // ── Single unified LLM call: content + design + HTML/CSS in one pass ──
    progressCallback?.('planning', 25, language === 'ar' ? '🎨 بيططّب التصميم ويبرمج الـ HTML...' : '🎨 Planning design and programming HTML...');

    const systemPrompt = buildSystemPrompt(language);
    const userPrompt = buildUserPrompt(req);

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.9, // high temperature → more creative variety between documents
    });

    const modelOutput = completion.choices?.[0]?.message?.content || '';
    if (!modelOutput.trim()) {
      throw new Error('Model returned empty content');
    }

    progressCallback?.('extracting', 65, language === 'ar' ? '📦 استخراج الـ HTML...' : '📦 Extracting HTML...');

    // ── Extract the HTML the model wrote ──
    let bodyHtml = modelOutput.trim();
    // Strip markdown code fences if the model added them
    if (bodyHtml.startsWith('```')) {
      bodyHtml = bodyHtml.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    }
    // If the model returned a full <html> doc, extract just the <body> content
    const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bodyHtml = bodyMatch[1].trim();
    }
    // If the model included its own <style>, keep it (it's the design!)
    // but also strip any <html>, <head>, <meta> tags it may have added
    bodyHtml = bodyHtml
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '')
      .replace(/<\/?meta[^>]*>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '');

    // Ensure there's at least one .delta-page wrapper
    if (!bodyHtml.includes('delta-page')) {
      bodyHtml = `<div class="delta-page">${bodyHtml}</div>`;
    }

    // ── Wrap in our minimal shell (fonts + RTL + A4 only) ──
    const fullHTML = buildHTMLShell(bodyHtml, language);

    progressCallback?.('rendering', 80, language === 'ar' ? '🖨️ جاري رندرة PDF...' : '🖨️ Rendering PDF...');

    // ── Playwright: HTML → PDF ──
    const pwAvailable = await isPlaywrightAvailable().catch(() => false);
    if (!pwAvailable) {
      // Save HTML as fallback
      const downloadDir = join(process.cwd(), 'download');
      if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });
      const htmlPath = join(downloadDir, `${randomUUID()}.html`);
      writeFileSync(htmlPath, fullHTML);
      return {
        success: true,
        filePath: htmlPath,
        fileName: `${req.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 60)}.html`,
        durationMs: Date.now() - startTime,
        html: fullHTML,
        error: 'Playwright unavailable, saved HTML instead',
      };
    }

    const result = await renderHTMLToPDF({
      html: fullHTML,
      title: req.topic,
      language,
      pageSize: 'A4',
      margins: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });

    if (!result.success || !result.pdfBuffer) {
      throw new Error(result.error || 'Playwright rendering failed');
    }

    progressCallback?.('finalizing', 95, language === 'ar' ? '✅ جاري الإنهاء...' : '✅ Finalizing...');

    // ── Save PDF ──
    const downloadDir = join(process.cwd(), 'download');
    if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });
    const outputPath = join(downloadDir, `${randomUUID()}.pdf`);
    writeFileSync(outputPath, result.pdfBuffer);

    const safeName = req.topic.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 60);

    progressCallback?.('completed', 100, language === 'ar' ? '🎉 تم إنشاء المستند!' : '🎉 Document created!');

    return {
      success: true,
      filePath: outputPath,
      fileName: `${safeName}.pdf`,
      fileSize: result.pdfBuffer.length,
      durationMs: Date.now() - startTime,
      html: fullHTML,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[AIDocumentGenerator] error:', msg);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: msg,
    };
  }
}

// ─── Multi-File Compilation ───────────────────────────────────────────────
//
// This is the CORE feature: the user uploads many dense files and asks the AI
// to do SOMETHING with all of them (compile, summarize, gather a specific topic,
// compare, etc.). The AI must read and remember ALL the content, understand the
// request, and produce a complete document.
//
// ARCHITECTURE:
//   1. Extract FULL text from every file (no lossy summarization in between)
//   2. Send ALL the full text + the user's actual request to ONE LLM call
//   3. The LLM understands the request and writes the complete HTML+CSS document
//   4. Render to PDF via Playwright
//
// There is NO hardcoded system prompt tied to specific keywords. The AI reads
// the user's request verbatim and decides what to do. Whether the user says
// "compile everything", "summarize", "gather all info about X", or anything
// else — the AI understands and acts accordingly.

export interface CompiledFile {
  name: string;
  /** Full extracted text content (not a summary) */
  text: string;
}

export interface CompileRequest {
  /** The user's verbatim request (e.g. "اجمع كل الكلام في ملف واحد") */
  userRequest: string;
  /** Full text of every uploaded file */
  files: CompiledFile[];
  language?: 'ar' | 'en';
  progressCallback?: (
    stage: string,
    progress: number,
    message: string
  ) => void;
}

function buildCompileSystemPrompt(language: 'ar' | 'en', fileCount: number): string {
  // MINIMAL — only format. The model is free to understand the request and execute.
  if (language === 'ar') {
    return `لديك ${fileCount} ملفات بمحتوى. المستخدم سيطلب منك شيئاً. اقرأ طلبه ونفّذه. اكتب المستند في HTML+CSS، كل صفحة A4 في <div class="delta-page">. استخدم خط Cairo. دعم RTL. أرجع HTML خام فقط.`;
  }
  return `You have ${fileCount} files with content. The user will request something. Read their request and execute it. Write the document in HTML+CSS, each A4 page in <div class="delta-page">. Use Cairo font. LTR. Return raw HTML only.`;
}

function buildCompileUserPrompt(req: CompileRequest): string {
  const isAr = req.language === 'ar';
  const fileSections = req.files
    .map(
      (f, i) =>
        `═════════ الملف ${i + 1}: ${f.name} (${f.text.length} حرف) ═════════
${f.text}`
    )
    .join('\n\n');

  return isAr
    ? `طلب المستخدم: ${req.userRequest}

${fileSections}`
    : `User request: ${req.userRequest}

${fileSections}`;
}

/**
 * Compile multiple files into a single document based on the user's request.
 *
 * STRATEGY: Per-file parallel generation.
 * Each file gets its own dedicated LLM call (full attention, no output limit
 * issues). The AI applies the user's request to each file independently, then
 * all sections are combined with a shared cover page into one PDF.
 *
 * This guarantees:
 * - Every file is covered (each gets a dedicated call)
 * - No hallucination (each call only has one file's content)
 * - No output truncation (each section is smaller)
 * - The user's request is respected (applied to each file)
 */
export async function compileFilesToDocument(
  req: CompileRequest
): Promise<AIDocumentResult> {
  const startTime = Date.now();
  const language = req.language || 'ar';
  const { progressCallback } = req;

  try {
    if (!req.files || req.files.length === 0) {
      return { success: false, durationMs: 0, error: 'No files provided' };
    }
    if (!req.userRequest?.trim()) {
      return { success: false, durationMs: 0, error: 'No user request provided' };
    }

    const totalChars = req.files.reduce((sum, f) => sum + f.text.length, 0);
    console.log(`[CompileFiles] ${req.files.length} files, ${totalChars} chars. Strategy: per-file parallel. Request: "${req.userRequest.slice(0, 80)}"`);

    const zai = await getZAI();

    // ── Step 1: Generate a cover page + shared CSS design ──
    progressCallback?.('thinking', 10, language === 'ar' ? '🎨 بتصميم الغلاف والهوية البصرية...' : '🎨 Designing cover and visual identity...');

    const coverPrompt = language === 'ar'
      ? `صمّم غلاف لمستند يجمع ${req.files.length} ملفات. طلب المستخدم: "${req.userRequest}". اكتب HTML للغلاف في <div class="delta-page"> مع <style>.`
      : `Design a cover for a document compiling ${req.files.length} files. User request: "${req.userRequest}". Write cover HTML in <div class="delta-page"> with <style>.`;

    const coverCompletion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: coverPrompt },
        { role: 'user', content: `Files: ${req.files.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}` },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.9,
    });
    let coverHtml = coverCompletion.choices?.[0]?.message?.content || '';
    coverHtml = cleanHtmlOutput(coverHtml);

    // ── Step 2: Generate each file's section IN PARALLEL ──
    progressCallback?.('planning', 25, language === 'ar' ? `📄 بمعالجة كل ملف (${req.files.length} ملف بالتوازي)...` : `📄 Processing each file (${req.files.length} files in parallel)...`);

    const sectionPromptFn = (file: CompiledFile, index: number, total: number, designColors: string) => {
      // MINIMAL — only the file content + user request. Model is free to decide what to do.
      const isAr = language === 'ar';
      return isAr
        ? `الملف ${index}/${total}: ${file.name}
طلب المستخدم: ${req.userRequest}

محتوى الملف:
${file.text}

اكتب HTML لهذا القسم. الألوان: ${designColors}. كل صفحة في <div class="delta-page">.`
        : `File ${index}/${total}: ${file.name}
User request: ${req.userRequest}

File content:
${file.text}

Write HTML for this section. Colors: ${designColors}. Each page in <div class="delta-page">.`;
    };

    // Extract dominant colors from the cover to keep sections visually consistent
    const colorMatch = coverHtml.match(/#[0-9a-fA-F]{6}/g);
    const designColors = colorMatch ? colorMatch.slice(0, 4).join(', ') : 'emerald, teal, violet';

    // Generate all sections — staggered start to avoid 429 rate limits.
    // Each call starts 3 seconds after the previous, but they still run
    // concurrently (overlap). This keeps total time low while respecting
    // the ZAI SDK's rate limit (which was causing 429s with pure parallel).
    const sectionPromises = req.files.map(async (file, i) => {
      // Stagger: wait 3s × index before starting (but cap at 12s total wait)
      if (i > 0) {
        await new Promise((r) => setTimeout(r, Math.min(i * 3000, 12000)));
      }
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: sectionPromptFn(file, i + 1, req.files.length, designColors) },
            { role: 'user', content: `نفّذ طلب المستخدم على هذا الملف.` },
          ],
          thinking: { type: 'disabled' },
          temperature: 0.7,
        });
        let sectionHtml = completion.choices?.[0]?.message?.content || '';
        sectionHtml = cleanHtmlOutput(sectionHtml);
        progressCallback?.('planning', 25 + Math.round(((i + 1) / req.files.length) * 50), language === 'ar' ? `📄 اتعمل ملف ${i + 1}/${req.files.length}: ${file.name}` : `📄 Processed file ${i + 1}/${req.files.length}: ${file.name}`);
        return sectionHtml;
      } catch (e) {
        console.error(`[CompileFiles] Section ${i + 1} (${file.name}) failed:`, e);
        return `<div class="delta-page"><h2>${file.name}</h2><p>تعذّر معالجة هذا الملف.</p></div>`;
      }
    });

    const sectionHtmls = await Promise.all(sectionPromises);

    // ── Step 3: Combine cover + all sections ──
    progressCallback?.('extracting', 80, language === 'ar' ? '📦 تجميع كل الأقسام...' : '📦 Combining all sections...');

    const fullBody = coverHtml + '\n' + sectionHtmls.join('\n');
    const fullHTML = buildHTMLShell(fullBody, language);

    // ── Step 4: Render to PDF ──
    progressCallback?.('rendering', 90, language === 'ar' ? '🖨️ جاري رندرة PDF...' : '🖨️ Rendering PDF...');

    const pwAvailable = await isPlaywrightAvailable().catch(() => false);
    if (!pwAvailable) {
      const downloadDir = join(process.cwd(), 'download');
      if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });
      const htmlPath = join(downloadDir, `${randomUUID()}.html`);
      writeFileSync(htmlPath, fullHTML);
      return {
        success: true,
        filePath: htmlPath,
        fileName: `compiled-${Date.now()}.html`,
        durationMs: Date.now() - startTime,
        html: fullHTML,
        error: 'Playwright unavailable, saved HTML instead',
      };
    }

    const result = await renderHTMLToPDF({
      html: fullHTML,
      title: language === 'ar' ? 'مستند مجمّع' : 'Compiled Document',
      language,
      pageSize: 'A4',
      margins: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });

    if (!result.success || !result.pdfBuffer) {
      throw new Error(result.error || 'Playwright rendering failed');
    }

    progressCallback?.('finalizing', 95, language === 'ar' ? '✅ جاري الإنهاء...' : '✅ Finalizing...');

    const downloadDir = join(process.cwd(), 'download');
    if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });
    const outputPath = join(downloadDir, `${randomUUID()}.pdf`);
    writeFileSync(outputPath, result.pdfBuffer);

    // Also save the HTML for debugging/inspection
    const htmlDebugPath = outputPath.replace('.pdf', '.html');
    writeFileSync(htmlDebugPath, fullHTML);

    progressCallback?.('completed', 100, language === 'ar' ? '🎉 تم إنشاء المستند المجمّع!' : '🎉 Compiled document created!');

    console.log(`[CompileFiles] ✓ Compiled ${req.files.length} files (per-file parallel) into PDF in ${Date.now() - startTime}ms (${result.pdfBuffer.length} bytes)`);

    return {
      success: true,
      filePath: outputPath,
      fileName: `compiled-${Date.now()}.pdf`,
      fileSize: result.pdfBuffer.length,
      durationMs: Date.now() - startTime,
      html: fullHTML,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[CompileFiles] error:', msg);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: msg,
    };
  }
}

/** Clean model output: strip markdown fences, doctype, html/head/meta tags. */
function cleanHtmlOutput(raw: string): string {
  let html = raw.trim();
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    html = bodyMatch[1].trim();
  }
  html = html
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<\/?meta[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  if (!html.includes('delta-page')) {
    html = `<div class="delta-page">${html}</div>`;
  }
  return html;
}

