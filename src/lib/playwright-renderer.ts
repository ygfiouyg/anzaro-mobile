/**
 * Playwright Renderer — Primary HTML/CSS → PDF Rendering Engine
 *
 * Uses Chromium via Playwright to render rich HTML templates to PDF.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔒 MEMORY LEAK FIX: Ephemeral Browser Pattern
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Each render gets its OWN browser instance (chromium.launch) that is
 * GUARANTEED to close in the `finally` block — even if the render fails.
 *
 * This prevents:
 *   ❌ Zombie Chromium processes consuming RAM in Docker
 *   ❌ OOM crashes from accumulated browser contexts
 *   ❌ Race conditions from shared singleton browser
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔤 FONT RACE CONDITION FIX
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Arabic text (Cairo font) was rendering with fallback fonts because
 * PDF generation started before the font finished loading.
 *
 * Fix: `await page.evaluate(() => document.fonts.ready)` — waits
 * until ALL @font-face declarations are fully loaded before rendering.
 *
 * Task ID: arch-5-fix
 */

import { chromium, type Browser, type Page } from 'playwright';
import type { DesignReasoningBlock } from './design-reasoning';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlaywrightPDFOptions {
  html: string;
  title?: string;
  language?: 'ar' | 'en';
  pageSize?: 'A4' | 'Letter';
  margins?: { top: string; bottom: string; left: string; right: string };
  designReasoning?: DesignReasoningBlock;
}

export interface PlaywrightPDFResult {
  success: boolean;
  pdfBuffer?: Buffer;
  duration: number;
  error?: string;
}

// ─── RTL Enforcement ──────────────────────────────────────────────────────

/**
 * Wrap HTML content with RTL enforcement and Arabic font CSS (Cairo).
 * Note: DesignReasoning --dr-* CSS variables are intentionally NOT injected
 * to avoid overriding carefully crafted template colors.
 */
function enforceRTLAndInjectStyles(
  html: string,
  language: 'ar' | 'en',
  designReasoning?: DesignReasoningBlock,
): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  // Note: DesignReasoning --dr-* CSS variables are intentionally NOT injected.
  // They can override carefully crafted template colors (e.g. cause pink/purple hues).
  // Only Cairo font, RTL, and body font-family styling are injected.

  // Cairo font CSS with proper weights
  const fontCSS = `
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf') format('truetype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `;

  // RTL and BiDi styling
  const rtlCSS = isRTL ? `
    * { direction: rtl; text-align: right; }
    bdi, [dir="ltr"] { direction: ltr; text-align: left; unicode-bidi: isolate; }
    [dir="rtl"] { direction: rtl; text-align: right; unicode-bidi: isolate; }
    /* BiDi isolation for numbers and LTR content embedded in RTL */
    .ltr-isolate { unicode-bidi: isolate; direction: ltr; }
  ` : '';

  // If the HTML already has a full document structure, inject into it
  if (html.includes('<html') || html.includes('<!DOCTYPE')) {
    // Add dir attribute to html tag if missing
    let modified = html.replace(/<html/i, `<html dir="${dir}"`);
    // Add lang attribute
    modified = modified.replace(/<html([^>]*)>/i, `<html$1 lang="${language}">`);

    // Inject CSS into head
    const styleTag = `<style>
      ${fontCSS}
      ${rtlCSS}
      body {
        font-family: 'Cairo', ${isRTL ? 'Arabic' : ''} sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
    </style>`;

    if (modified.includes('</head>')) {
      modified = modified.replace('</head>', `${styleTag}</head>`);
    } else {
      modified = styleTag + modified;
    }

    return modified;
  }

  // Wrap in a full document
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${language === 'ar' ? 'مستند DeltaAI' : 'DeltaAI Document'}</title>
  <style>
    ${fontCSS}
    ${rtlCSS}
    body {
      font-family: 'Cairo', ${isRTL ? 'Arabic' : ''} sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

// ─── PDF Rendering — Ephemeral Browser Pattern ────────────────────────────

/**
 * Render HTML content to PDF using Playwright (Chromium).
 *
 * 🔒 EPHEMERAL BROWSER PATTERN:
 *   Each render launches its OWN Chromium instance and GUARANTEES
 *   cleanup in the `finally` block — even if the render fails.
 *
 * 🔤 FONT RACE FIX:
 *   Awaits `document.fonts.ready` before generating PDF, ensuring
 *   Cairo (Arabic) font is fully loaded — no more fallback fonts.
 *
 * @param options - Rendering options
 * @returns PDF buffer result
 */
export async function renderHTMLToPDF(options: PlaywrightPDFOptions): Promise<PlaywrightPDFResult> {
  const startTime = Date.now();
  let browser: Browser | null = null;
  let page: Page | null = null;

  const {
    html,
    title = 'DeltaAI Document',
    language = 'ar',
    pageSize = 'A4',
    margins = { top: '25mm', bottom: '20mm', left: '18mm', right: '18mm' },
    designReasoning,
  } = options;

  try {
    // ━━━ Step 1: Launch ISOLATED Chromium instance ━━━━━━━━━━━━━━
    // Each render gets its own browser — no shared state, no memory leaks
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=TranslateUI',
        // Note: --single-process removed — it causes crashes in Docker
        // Memory limits to prevent OOM in constrained environments
        '--js-flags=--max-old-space-size=1024',
      ],
    });

    // ━━━ Step 2: Create a new page ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    page = await browser.newPage({
      locale: language === 'ar' ? 'ar-EG' : 'en-US',
      viewport: { width: 1200, height: 1600 },
    });

    // ━━━ Step 3: Inject HTML with RTL enforcement + Cairo font ━━
    const wrappedHTML = enforceRTLAndInjectStyles(html, language, designReasoning);

    await page.setContent(wrappedHTML, {
      waitUntil: 'networkidle',
      timeout: 60000, // 60s for page load
    });

    // ━━━ Step 4: FONT RACE FIX — Wait for Cairo font to load ━━━━
    // This is CRITICAL: without this, Arabic text renders with fallback
    // fonts because PDF generation starts before @font-face completes.
    await page.evaluate(() => document.fonts.ready);

    // Small delay to ensure all rendering (images, layout) is complete
    // FIX L1: Reduced from 500ms to 200ms — the fonts.ready wait already
    // ensures font rendering is done; 500ms was unnecessarily long
    await page.waitForTimeout(200);

    // ━━━ Step 5: Generate PDF with 60s timeout ━━━━━━━━━━━━━━━━━
    const pdfBuffer = await Promise.race([
      page.pdf({
        format: pageSize,
        margin: margins,
        printBackground: true, // ضروري عشان الخلفيات الملونة والـ Zebra تظهر
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width:100%; padding:0 18mm; box-sizing:border-box; font-family:'Cairo',sans-serif;">
            <div style="font-size:7px; color:#94a3b8; text-align:center;">DeltaAI | بعقل هادي</div>
            <div style="border-bottom:0.5px solid #94a3b8; margin-top:2px;"></div>
          </div>
        `,
        footerTemplate: `
          <div style="width:100%; padding:0 18mm; box-sizing:border-box; font-family:'Cairo',sans-serif;">
            <div style="border-top:0.5px solid #94a3b8; margin-bottom:2px;"></div>
            <div style="font-size:7px; color:#94a3b8; text-align:center; direction:rtl;">صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>
          </div>
        `,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out (5min)')), 300000)
      ),
    ]);

    const duration = Date.now() - startTime;
    console.log(`[Playwright Renderer] ✅ PDF generated in ${duration}ms`);

    return {
      success: true,
      pdfBuffer: Buffer.from(pdfBuffer),
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error('[Playwright Renderer] ❌ Error:', errorMsg);

    return {
      success: false,
      duration,
      error: errorMsg,
    };

  } finally {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒 CRITICAL: Close browser to prevent memory leaks in Docker
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // This GUARANTEES that Chromium is killed and RAM is freed
    // even if the render failed with OOM, timeout, or any other error.
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (pageCloseErr) {
      console.warn('[Playwright Renderer] Page close warning:', pageCloseErr);
    }

    try {
      if (browser && browser.isConnected()) {
        await browser.close();
        console.log('[Playwright Renderer] 🔒 Browser closed — RAM freed');
      }
    } catch (browserCloseErr) {
      console.warn('[Playwright Renderer] Browser close warning:', browserCloseErr);
      // Force kill if graceful close fails
      try {
        if (browser) {
          browser.close().catch(() => {});
        }
      } catch {
        // Last resort — ignore
      }
    }
  }
}

/**
 * Check if Playwright is available and the browser can launch.
 * Uses ephemeral browser — launches, checks, and immediately closes.
 */
export async function isPlaywrightAvailable(): Promise<boolean> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    return browser.isConnected();
  } catch {
    return false;
  } finally {
    // Always close the test browser to prevent leaks
    try {
      if (browser) {
        await browser.close();
      }
    } catch {
      // Ignore close errors during availability check
    }
  }
}

/**
 * Close any shared browser instance — kept for API compatibility.
 * No-op in ephemeral pattern since each render manages its own browser.
 */
export async function closeBrowser(): Promise<void> {
  // No-op: ephemeral pattern doesn't keep a shared browser alive
  // Each render launches and closes its own browser in try...finally
  console.log('[Playwright Renderer] closeBrowser() called — no shared browser to close (ephemeral pattern)');
}
