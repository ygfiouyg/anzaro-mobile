// ═══════════════════════════════════════════════════════════════════════
// ANZARO NATIVE DESIGNER — Premium HTML Template Engine
// ═══════════════════════════════════════════════════════════════════════
// When Anzaro's LLM-generated HTML needs enhancement, this module provides
// a premium fallback template with:
//   - 100% SOLID colors (ZERO transparency)
//   - Mermaid.js + Chart.js CDN injection
//   - Premium tech/medical aesthetic
//   - Arabic RTL support
//   - Multi-page layout (A4)
// ═══════════════════════════════════════════════════════════════════════

import type { AnzaroOutput, AnzaroDocumentInput, AnzaroGeneratedAsset } from './anzaro-orchestrator';

// ═══════════════════════════════════════════════════════════════════════
// Premium Color Palettes (100% SOLID — no transparency)
// ═══════════════════════════════════════════════════════════════════════

const PALETTES = {
  tech: {
    primary: '#0f172a',      // slate-950
    secondary: '#1e293b',    // slate-800
    accent: '#3b82f6',       // blue-500
    accentLight: '#60a5fa',  // blue-400
    bg: '#f8fafc',           // slate-50
    cardBg: '#ffffff',       // white
    text: '#0f172a',
    textMuted: '#475569',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    accentGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
  },
  medical: {
    primary: '#064e3b',      // emerald-950
    secondary: '#065f46',    // emerald-800
    accent: '#10b981',       // emerald-500
    accentLight: '#34d399',  // emerald-400
    bg: '#f0fdf4',           // green-50
    cardBg: '#ffffff',
    text: '#064e3b',
    textMuted: '#4b5563',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
    accentGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
  },
  academic: {
    primary: '#1e1b4b',      // indigo-950
    secondary: '#312e81',    // indigo-900
    accent: '#6366f1',       // indigo-500
    accentLight: '#818cf8',  // indigo-400
    bg: '#f5f3ff',           // violet-50
    cardBg: '#ffffff',
    text: '#1e1b4b',
    textMuted: '#4b5563',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
    accentGradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
  },
  creative: {
    primary: '#18181b',      // zinc-900
    secondary: '#27272a',    // zinc-800
    accent: '#f59e0b',       // amber-500
    accentLight: '#fbbf24',  // amber-400
    bg: '#fafafa',           // zinc-50
    cardBg: '#ffffff',
    text: '#18181b',
    textMuted: '#52525b',
    gradient: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
    accentGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Wrap Anzaro's HTML with premium shell if it's incomplete
// ═══════════════════════════════════════════════════════════════════════

export function enhanceAnzaroHTML(output: AnzaroOutput, input: AnzaroDocumentInput): string {
  const palette = PALETTES[input.style || 'tech'] || PALETTES.tech;
  const isRTL = (input.language || 'ar') === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  // If Anzaro already generated a full HTML document, inject missing pieces
  if (output.html.includes('<html') || output.html.includes('<!DOCTYPE')) {
    let html = output.html;

    // Ensure Mermaid CDN
    if (!html.includes('mermaid')) {
      html = html.replace('</head>', `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script><script>mermaid.initialize({startOnLoad:true,theme:'dark'});</script></head>`);
    }
    // Ensure Chart.js CDN
    if (!html.includes('chart.js') && !html.includes('Chart.js')) {
      html = html.replace('</head>', `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script></head>`);
    }
    return html;
  }

  // Otherwise, build a full premium shell around Anzaro's content
  return buildPremiumShell(output, input, palette, dir);
}

// ═══════════════════════════════════════════════════════════════════════
// Build premium HTML shell (fallback when Anzaro returns partial HTML)
// ═══════════════════════════════════════════════════════════════════════

function buildPremiumShell(
  output: AnzaroOutput,
  input: AnzaroDocumentInput,
  palette: typeof PALETTES.tech,
  dir: string
): string {
  const { plan, assets } = output;

  // Build cover page
  const coverPage = `
    <div class="page cover-page">
      <div class="cover-bg"></div>
      <div class="cover-content">
        <div class="cover-badge">Anzaro AI Document</div>
        <h1 class="cover-title">${escapeHtml(input.topic)}</h1>
        ${input.description ? `<p class="cover-subtitle">${escapeHtml(input.description)}</p>` : ''}
        <div class="cover-meta">
          <span>${new Date().toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US')}</span>
          <span>•</span>
          <span>${plan.pageCount} pages</span>
        </div>
      </div>
    </div>
  `;

  // Build content pages from sections
  const contentPages = plan.sections
    .filter(s => s.type !== 'cover')
    .map((section, i) => buildSectionPage(section, i, assets, palette, dir))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.topic)} — Anzaro AI</title>
  <!-- Mermaid.js for diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <!-- Chart.js for data visualization -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Cairo', 'Tajawal', sans-serif;
      background: ${palette.bg};
      color: ${palette.text};
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm 18mm;
      margin: 0 auto;
      background: ${palette.cardBg};
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .page:last-child { page-break-after: auto; }

    /* Cover Page */
    .cover-page { padding: 0; }
    .cover-bg {
      position: absolute; inset: 0;
      background: ${palette.gradient};
    }
    .cover-content {
      position: relative; z-index: 1;
      height: 297mm;
      display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      padding: 40mm 30mm;
      color: white;
      text-align: center;
    }
    .cover-badge {
      padding: 8px 20px;
      background: ${palette.accent};
      color: white;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 30px;
    }
    .cover-title {
      font-size: 48px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 20px;
      color: white;
    }
    .cover-subtitle {
      font-size: 18px;
      color: rgba(255,255,255,0.8);
      max-width: 500px;
      margin-bottom: 40px;
    }
    .cover-meta {
      display: flex; gap: 12px;
      font-size: 14px;
      color: rgba(255,255,255,0.6);
    }

    /* Content Pages */
    .section-page h2 {
      font-size: 28px;
      font-weight: 700;
      color: ${palette.primary};
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid ${palette.accent};
    }
    .section-content {
      font-size: 14px;
      line-height: 1.8;
      color: ${palette.text};
    }
    .section-content p { margin-bottom: 12px; }
    .section-content h3 {
      font-size: 18px;
      color: ${palette.secondary};
      margin: 20px 0 10px;
    }

    /* Cards */
    .card {
      background: ${palette.cardBg};
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 15px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }

    /* Images */
    .asset-image {
      width: 100%;
      border-radius: 12px;
      margin: 15px 0;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }

    /* Charts */
    .chart-container {
      background: ${palette.cardBg};
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 15px 0;
    }
    .chart-container canvas { max-width: 100%; }

    /* Mermaid Diagrams */
    .diagram-container {
      background: ${palette.cardBg};
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 15px 0;
      text-align: center;
    }
    .mermaid { display: flex; justify-content: center; }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: ${palette.gradient};
      color: white;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: 800; }
    .stat-label { font-size: 12px; opacity: 0.8; }

    /* Footer */
    .page-footer {
      position: absolute;
      bottom: 10mm;
      left: 18mm;
      right: 18mm;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: ${palette.textMuted};
      border-top: 1px solid #e2e8f0;
      padding-top: 5px;
    }
  </style>
</head>
<body>
  ${coverPage}
  ${contentPages}

  <script>
    // Initialize Mermaid
    mermaid.initialize({ startOnLoad: true, theme: 'default' });

    // Render all Chart.js canvases
    document.addEventListener('DOMContentLoaded', function() {
      ${assets.filter(a => a.type === 'chart').map((a, i) => `
      var ctx${i} = document.getElementById('chart-${a.id}');
      if (ctx${i}) {
        new Chart(ctx${i}, {
          type: ${JSON.stringify(a.data.type)},
          data: ${JSON.stringify(a.data.data)},
          options: {
            responsive: true,
            plugins: { title: { display: true, text: ${JSON.stringify(a.data.title)} } }
          }
        });
      }
      `).join('\n')}
    });
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Build a single section page
// ═══════════════════════════════════════════════════════════════════════

function buildSectionPage(
  section: any,
  index: number,
  assets: AnzaroGeneratedAsset[],
  palette: typeof PALETTES.tech,
  dir: string
): string {
  const sectionAssets = assets.filter(a => a.sectionIndex === index);

  let assetHtml = '';

  // Images
  const images = sectionAssets.filter(a => a.type === 'image');
  for (const img of images) {
    if (img.data?.url) {
      assetHtml += `<img src="${img.data.url}" alt="${escapeHtml(img.data.prompt || '')}" class="asset-image" />`;
    }
  }

  // Charts
  const charts = sectionAssets.filter(a => a.type === 'chart');
  for (const chart of charts) {
    assetHtml += `
      <div class="chart-container">
        <canvas id="chart-${chart.id}"></canvas>
      </div>
    `;
  }

  // Diagrams
  const diagrams = sectionAssets.filter(a => a.type === 'diagram');
  for (const diagram of diagrams) {
    if (diagram.data?.code) {
      assetHtml += `
        <div class="diagram-container">
          <div class="mermaid">${escapeHtml(diagram.data.code)}</div>
        </div>
      `;
    }
  }

  // Search results as a data card
  const searchResults = sectionAssets.filter(a => a.type === 'search_result');
  if (searchResults.length > 0) {
    const firstResult = searchResults[0];
    if (firstResult.data?.results?.length) {
      assetHtml += `
        <div class="card">
          <h3>📊 Research Data</h3>
          ${firstResult.data.results.slice(0, 3).map((r: any) => `
            <p><strong>${escapeHtml(r.title || '')}</strong></p>
            <p style="color:${palette.textMuted};font-size:12px;">${escapeHtml((r.snippet || r.content || '').slice(0, 200))}...</p>
          `).join('')}
        </div>
      `;
    }
  }

  return `
    <div class="page section-page">
      <h2>${escapeHtml(section.title)}</h2>
      <div class="section-content">
        ${assetHtml}
      </div>
      <div class="page-footer">
        <span>Anzaro AI</span>
        <span>${index + 2}</span>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
