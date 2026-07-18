// ═══════════════════════════════════════════════════════════════════════
// ANZARO PRINTER — Memory-Safe Playwright Mutex Queue
// ═══════════════════════════════════════════════════════════════════════
// Since Anzaro generates massive, tool-heavy HTML, the Mutex lock is
// NON-NEGOTIABLE. Only ONE Playwright instance runs at a time.
//
// Anti-OOM flags:
//   --no-sandbox (required in Docker/HF Spaces)
//   --disable-setuid-sandbox
//   --disable-dev-shm-usage (prevents /dev/shm exhaustion)
//   --disable-gpu (saves memory)
//   --single-process (reduces process overhead)
//
// Force kill: page.close() + browser.close() in finally block
// Wait: networkidle0 (all network requests complete)
// ═══════════════════════════════════════════════════════════════════════

import { chromium, type Browser, type Page } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════
// MUTEX LOCK — ensures only ONE Playwright instance at a time
// ═══════════════════════════════════════════════════════════════════════

let _mutexPromise: Promise<void> = Promise.resolve();
let _mutexResolve: (() => void) | null = null;

async function acquireMutex(): Promise<() => void> {
  // Wait for the previous render to finish
  await _mutexPromise;
  // Create a new promise that the next caller will wait on
  _mutexPromise = new Promise<void>(resolve => { _mutexResolve = resolve; });
  // Return a release function
  return () => {
    if (_mutexResolve) {
      _mutexResolve();
      _mutexResolve = null;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Render HTML to PDF — Memory-Safe
// ═══════════════════════════════════════════════════════════════════════

export interface AnzaroPrintOptions {
  html: string;
  outputDir?: string;
  filename?: string;
  /** Page format: A4, Letter, etc. */
  format?: 'A4' | 'Letter';
  /** Print background colors (default true) */
  printBackground?: boolean;
  /** Margin in mm */
  margin?: { top: number; bottom: number; left: number; right: number };
}

export interface AnzaroPrintResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
  renderTimeMs?: number;
}

export async function renderHTMLToPDFAnzaro(options: AnzaroPrintOptions): Promise<AnzaroPrintResult> {
  const startTime = Date.now();
  const releaseMutex = await acquireMutex();

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // ── Launch Chromium with strict anti-OOM flags ──
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-translate',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--font-render-hinting=none',
      ],
    });

    // ── Create page with optimized settings ──
    page = await browser.newPage({
      viewport: { width: 794, height: 1123 }, // A4 in pixels at 96dpi
      deviceScaleFactor: 1,
    });

    // ── Set the HTML content and wait for ALL network requests ──
    await page.setContent(options.html, {
      waitUntil: 'networkidle', // Wait until NO network requests for 500ms
      timeout: 60_000,
    });

    // ── Wait for fonts to be ready ──
    await page.evaluate(() => document.fonts.ready);

    // ── Wait for Mermaid diagrams to render (if present) ──
    await page.evaluate(async () => {
      // @ts-ignore
      if (window.mermaid) {
        // @ts-ignore
        await window.mermaid.run?.();
      }
    });

    // ── Wait for Chart.js to render (if present) ──
    await page.evaluate(async () => {
      // @ts-ignore
      if (window.Chart) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give charts time to draw
      }
    });

    // ── Wait for all images to load ──
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map(img => {
          if (img.complete) return;
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 5000); // 5s timeout per image
          });
        })
      );
    });

    // Small delay for final render
    await page.waitForTimeout(500);

    // ── Ensure output directory exists ──
    const outputDir = options.outputDir || path.join(process.cwd(), 'download');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = options.filename || `anzaro-${Date.now()}.pdf`;
    const filePath = path.join(outputDir, filename);

    // ── Generate the PDF ──
    await page.pdf({
      path: filePath,
      format: options.format || 'A4',
      printBackground: options.printBackground !== false,
      margin: options.margin || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      preferCSSPageSize: true,
    });

    const stats = await import('fs').then(fs => fs.statSync(filePath));
    const renderTimeMs = Date.now() - startTime;

    return {
      success: true,
      filePath,
      fileSize: stats.size,
      renderTimeMs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Anzaro Printer] Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
      renderTimeMs: Date.now() - startTime,
    };
  } finally {
    // ── FORCE KILL: close page and browser immediately ──
    // This is NON-NEGOTIABLE — prevents memory leaks in Docker/HF Spaces
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      console.error('[Anzaro Printer] page.close() error:', e);
    }
    try {
      if (browser && browser.isConnected()) {
        await browser.close();
      }
    } catch (e) {
      console.error('[Anzaro Printer] browser.close() error:', e);
    }
    // ── Release the mutex so the next render can start ──
    releaseMutex();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Health check — verify Playwright is available
// ═══════════════════════════════════════════════════════════════════════

let _isAvailable: boolean | null = null;

export async function isAnzaroPrinterAvailable(): Promise<boolean> {
  if (_isAvailable !== null) return _isAvailable;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    _isAvailable = true;
  } catch {
    _isAvailable = false;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
  return _isAvailable;
}
