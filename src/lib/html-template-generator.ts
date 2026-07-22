/**
 * HTML Template Generator — Rich HTML → PDF Template Engine
 *
 * Generates stunning HTML documents from content + DesignReasoningBlock,
 * with RTL/BiDi support, Arabic fonts, modern CSS, CSS Grid layouts,
 * gradient backgrounds, embedded chart SVGs, and print optimization.
 *
 * Dynamic theming: Colors are determined by topic category via
 * the dynamic-themes module. Each subject type (medical, tech, islamic,
 * etc.) gets its own unique color palette so documents look distinct.
 *
 * Task ID: 2
 */

import type { DesignReasoningBlock, ChartSpec, ComponentMapEntry } from './design-reasoning';
import { generateChartSVG } from './chart-generator';
import { detectTopicCategory, type TopicCategory, type ThemePalette } from './dynamic-themes';
import { generateUniquePalette, validateContrast, type DesignPreferences } from './unique-palette-generator';
// design-templates.ts: Fixed templates REMOVED — AI-driven design only (design-reasoning.ts)
// ─── v4.0 Ultra Colorful Helpers (مليان الوان) ──────────────────────────

/** Generate a 7-color rainbow strip HTML for the top of every page */
function generateRainbowStrip(decoColors: string[]): string {
  if (!decoColors || decoColors.length === 0) return '';
  const segments = decoColors.slice(0, 7).map(c =>
    `<div style="flex:1; height:100%; background:${c};"></div>`
  ).join('');
  return `<div style="display:flex; width:100%; height:7px; position:absolute; top:0; left:0; z-index:10;">${segments}</div>`;
}

/** Generate a triple-bar accent (3 color segments) */
function generateTripleBar(color1: string, color2: string, color3: string): string {
  return `<div style="display:flex; gap:8px; margin:20px auto; justify-content:center; position:relative; z-index:5;">
    <span style="width:50px; height:4px; border-radius:2px; background:${color1}; display:inline-block;"></span>
    <span style="width:50px; height:4px; border-radius:2px; background:${color2}; display:inline-block;"></span>
    <span style="width:50px; height:4px; border-radius:2px; background:${color3}; display:inline-block;"></span>
  </div>`;
}

/** Generate colorful section header with color-coded numbering */
function generateColorfulSectionHeader(
  heading: string, index: number, sectionColor: { header: string; bg: string; text: string; border: string; accent: string; badgeBg: string },
  isRTL: boolean
): string {
  const dir = isRTL ? 'rtl' : 'ltr';
  return `
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px; direction:${dir};">
      <div style="width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16pt; font-weight:800; color:white; background:${sectionColor.header}; flex-shrink:0;">${index}</div>
      <div style="flex:1;">
        <h1 style="font-size:20pt; font-weight:700; color:${sectionColor.text}; margin:0; line-height:1.3;">${escapeHtml(heading)}</h1>
      </div>
    </div>
    <div style="display:flex; gap:4px; margin-bottom:18px;">
      <span style="height:3px; width:120px; border-radius:2px; background:${sectionColor.header}; display:inline-block;"></span>
      <span style="height:3px; width:80px; border-radius:2px; background:${sectionColor.accent}; display:inline-block;"></span>
      <span style="height:3px; width:40px; border-radius:2px; background:${sectionColor.border}; display:inline-block;"></span>
    </div>
  `;
}

/** Generate decorative dots for section */
function generateDecoDots(decoColors: string[], count: number = 5): string {
  if (!decoColors || decoColors.length === 0) return '';
  const dots = decoColors.slice(0, count).map(c =>
    `<span style="width:8px; height:8px; border-radius:50%; background:${c}; display:inline-block;"></span>`
  ).join('');
  return `<div style="display:flex; gap:6px; margin-bottom:14px;">${dots}</div>`;
}

/** Generate 5-type color-coded highlight box */
function generateHighlightBox(text: string, type: 'key' | 'warning' | 'data' | 'info' | 'success', palette: ThemePalette, isRTL: boolean): string {
  const side = isRTL ? 'right' : 'left';
  const typeMap = {
    key:    { color: palette.accentKey,   bg: palette.accentKeyBg },
    warning:{ color: palette.accentWarm,  bg: lightenColor(palette.accentWarm, 0.82) },
    data:   { color: palette.accentData,  bg: palette.accentDataBg },
    info:   { color: palette.accentInfo,  bg: palette.accentInfoBg },
    success:{ color: palette.accentGreen, bg: lightenColor(palette.accentGreen, 0.80) },
  };
  const { color, bg } = typeMap[type];
  return `<div style="padding:12px 16px; border-radius:8px; margin:12px 0; border-${side}:4px solid ${color}; background:${bg};">
    <p style="font-weight:500; color:${color}; margin:0;">${text}</p>
  </div>`;
}

function lightenColor(hex: string, amount: number): string {
  if (!hex || !hex.startsWith('#')) return '#f0f0f0';
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(h.substring(0, 2), 16) + (255 - parseInt(h.substring(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(h.substring(2, 4), 16) + (255 - parseInt(h.substring(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(h.substring(4, 6), 16) + (255 - parseInt(h.substring(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}


import { generateDynamicDesignCSS, generateUltraColorfulCSS } from './dynamic-design-css';

// ─── Types ────────────────────────────────────────────────────────────────

export interface HTMLTemplateOptions {
  content: string;
  title: string;
  author?: string;
  language?: 'ar' | 'en';
  modelId?: string;
  designReasoning?: DesignReasoningBlock;
  chartSpecs?: ChartSpec[];
  documentType?: 'lecture' | 'summary' | 'research' | 'notes';
  /** Map of image keys to base64 data URIs for embedding in the PDF */
  images?: Record<string, string>;
  /** Batch metadata for multi-lecture documents */
  batchMeta?: {
    lectures: { title: string; index: number }[];
    channelName?: string;
    totalLectures: number;
  };
  /** Topic category for dynamic theming — auto-detected from content if not provided */
  topicCategory?: TopicCategory;
  /** User-specified color preference (e.g. "أحمر", "red", "ذهبي") */
  userColorPreference?: string;
  /** User-specified design preferences (color, style) */
  userDesignPreferences?: DesignPreferences;
  // designTemplateId REMOVED — no more fixed template selection, AI-driven design only
  /** Whether to include images in the document (default: true) */
  includeImages?: boolean;
  /** User's free-text style description for AI-powered dynamic design.
   * The LLM will incorporate this description into the design reasoning
   * to produce a unique visual identity. */
  styleDescription?: string;
}

// ─── Content Parser ───────────────────────────────────────────────────────

interface ParsedSection {
  heading: string;
  level: number;
  content: ParsedBlock[];
}

interface ParsedBlock {
  type: 'paragraph' | 'bullet' | 'table' | 'blockquote' | 'code' | 'numbered' | 'note' | 'warning' | 'tip' | 'image' | 'h2' | 'h3' | 'definition' | 'hr' | 'callout' | 'feature';
  content: string;
  items?: string[];
  subItems?: string[];
  rows?: string[][];
  language?: string;
  index?: number;
  description?: string;
  term?: string;
  definition?: string;
  /** Base64 data URI for embedded image rendering */
  imageData?: string;
  /** Label for callout box (e.g. "قاعدة ذهبية", "خطأ شائع") */
  label?: string;
  /** Variant for callout box: 'hook' (default), 'rule', or 'error' */
  variant?: string;
}

function parseContent(raw: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = raw.split('\n');
  let currentSection: ParsedSection | null = null;
  let currentBlock: ParsedBlock | null = null;
  let numberedIndex = 0;
  let featureIndex = 0;

  const flushBlock = () => {
    if (currentBlock && currentSection) {
      currentSection.content.push(currentBlock);
      currentBlock = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h1Match || h2Match || h3Match) {
      flushBlock();
      const heading = h1Match ? h1Match[1] : h2Match ? h2Match[1] : h3Match![1];
      const level = h1Match ? 1 : h2Match ? 2 : 3;

      if (level === 1 || !currentSection) {
        currentSection = { heading, level, content: [] };
        sections.push(currentSection);
        numberedIndex = 0;
      } else if (level === 2) {
        currentSection.content.push({ type: 'h2', content: heading });
      } else {
        currentSection.content.push({ type: 'h3', content: heading });
      }
      continue;
    }

    if (!currentSection) {
      currentSection = { heading: '', level: 1, content: [] };
      sections.push(currentSection);
    }

    if (!line) {
      flushBlock();
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      flushBlock();
      currentSection.content.push({ type: 'hr', content: '' });
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      if (currentBlock?.type === 'code') {
        flushBlock();
        continue;
      }
      flushBlock();
      const lang = line.replace('```', '').trim() || 'text';
      currentBlock = { type: 'code', content: '', language: lang };
      continue;
    }

    if (currentBlock?.type === 'code') {
      currentBlock.content += (currentBlock.content ? '\n' : '') + line;
      continue;
    }

    // Note/Warning/Tip
    const noteMatch = line.match(/^(?:::note|> \*\*ملاحظة\*\*[:：]?\s*)(.*)/i);
    const warnMatch = line.match(/^(?:::warning|> \*\*تحذير\*\*[:：]?\s*)(.*)/i);
    const tipMatch = line.match(/^(?:::tip|> \*\*نصيحة\*\*[:：]?\s*)(.*)/i);
    const endBoxMatch = line.match(/^:::\s*$/);

    // Callout blocks: :::callout, :::callout-hook, :::callout-rule, :::callout-error
    const calloutMatch = line.match(/^:::callout(?:-(hook|rule|error))?\s*(.*)/i);
    const featureMatch = line.match(/^:::feature\s*(.*)/i);

    if (endBoxMatch && currentBlock && ['note', 'warning', 'tip', 'callout', 'feature'].includes(currentBlock.type)) {
      flushBlock();
      continue;
    }
    if (calloutMatch) {
      flushBlock();
      const variant = calloutMatch[1] || 'hook';
      const restContent = calloutMatch[2] || '';
      currentBlock = { type: 'callout', content: restContent, variant };
      continue;
    }
    if (featureMatch) {
      flushBlock();
      featureIndex++;
      const restContent = featureMatch[1] || '';
      currentBlock = { type: 'feature', content: restContent, index: featureIndex };
      continue;
    }
    // Accumulate content for callout/feature blocks until :::
    if (currentBlock && (currentBlock.type === 'callout' || currentBlock.type === 'feature')) {
      currentBlock.content += (currentBlock.content ? ' ' : '') + line;
      continue;
    }
    if (noteMatch) { flushBlock(); currentBlock = { type: 'note', content: noteMatch[1] || 'ملاحظة' }; continue; }
    if (warnMatch) { flushBlock(); currentBlock = { type: 'warning', content: warnMatch[1] || 'تحذير' }; continue; }
    if (tipMatch) { flushBlock(); currentBlock = { type: 'tip', content: tipMatch[1] || 'نصيحة' }; continue; }

    // Definition list: **term**: definition
    const defMatch = line.match(/^\*\*(.+?)\*\*\s*[:：—–-]\s*(.+)/);
    if (defMatch) {
      flushBlock();
      currentSection.content.push({ type: 'definition', content: '', term: defMatch[1], definition: defMatch[2] });
      continue;
    }

    // Image
    const imageMatch = line.match(/^!\[([^\]]*)\]\([^)]*\)/);
    if (imageMatch) {
      flushBlock();
      currentSection.content.push({ type: 'image', content: '', description: imageMatch[1] });
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      flushBlock();
      currentSection.content.push({ type: 'blockquote', content: line.replace(/^>\s*/, '') });
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (currentBlock?.type !== 'table') {
        flushBlock();
        currentBlock = { type: 'table', content: '', rows: [] };
      }
      if (!line.match(/^\|[\s\-:|]+\|$/)) {
        const cells = line.split('|').map((c) => c.trim()).filter((c) => c);
        currentBlock.rows!.push(cells);
      }
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)/);
    if (numberedMatch) {
      flushBlock();
      numberedIndex++;
      currentSection.content.push({ type: 'numbered', content: numberedMatch[2], index: numberedIndex });
      continue;
    }

    // Bullet
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      flushBlock();
      currentSection.content.push({ type: 'bullet', content: bulletMatch[1], items: [bulletMatch[1]] });
      continue;
    }

    flushBlock();
    currentSection.content.push({ type: 'paragraph', content: line });
  }

  flushBlock();
  return sections;
}

// ─── CSS Generation ───────────────────────────────────────────────────────

/**
 * Parse hex color to RGB components for rgba() usage in CSS.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * Adjust brightness of a hex color by a given amount.
 * Positive = lighter, negative = darker.
 * Used to derive secondary palette colors from LLM-chosen primary colors.
 */
function adjustBrightness(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function generateCSS(designReasoning?: DesignReasoningBlock, language: 'ar' | 'en' = 'ar', topicCategory?: TopicCategory, content?: string, userColorPreference?: string, precomputedPalette?: ThemePalette): string {
  const isRTL = language === 'ar';

  // ── Palette: Use precomputed palette when available ──
  // FIX (Issue 1): generateHTMLTemplate() now generates the palette ONCE
  // and passes it down. This eliminates the redundant double palette
  // generation that previously produced two different palettes due to
  // timestamp-based seed differences.
  let palette: ThemePalette;
  if (precomputedPalette) {
    palette = precomputedPalette;
  } else {
    // Fallback: only generate if no palette was passed (shouldn't happen in normal flow)
    palette = generateUniquePalette(content || topicCategory || 'default', userColorPreference);
  }
  const {
    primary, secondary, accent, accentWarm, accentGreen,
    bg, surface, text, textSecondary, textMuted, border,
    coverGradient, coverAccent,
  } = palette;

  // ── Detect mode from palette ──
  // Parse background lightness to determine if we're in light or dark mode
  const bgHex = bg.replace('#', '');
  const bgR = parseInt(bgHex.substring(0, 2), 16);
  const bgG = parseInt(bgHex.substring(2, 4), 16);
  const bgB = parseInt(bgHex.substring(4, 6), 16);
  const bgLightness = (Math.max(bgR, bgG, bgB) + Math.min(bgR, bgG, bgB)) / 2 / 255 * 100;
  const isLightMode = bgLightness > 50;

  // Derive RGB values for rgba() usage in decorative elements
  const accentRgb = hexToRgb(accent);
  const coverAccentRgb = hexToRgb(coverAccent);

  // Mode-specific values for code blocks, callouts, etc.
  // Derived from palette for consistency across light/dark modes
  const codeBlockBg = isLightMode ? surface : secondary;
  const codeBlockBorder = isLightMode ? border : 'rgba(255, 255, 255, 0.06)';
  const codeBlockHeaderBg = isLightMode ? border : 'rgba(255, 255, 255, 0.04)';
  const codeBlockTextColor = isLightMode ? text : border;
  const accentWarmRgb = hexToRgb(accentWarm);
  const calloutWarningBg = isLightMode ? `rgba(${accentWarmRgb.r}, ${accentWarmRgb.g}, ${accentWarmRgb.b}, 0.06)` : `rgba(${accentWarmRgb.r}, ${accentWarmRgb.g}, ${accentWarmRgb.b}, 0.08)`;
  const calloutWarningBorder = accentWarm;
  const shadowColor = isLightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.15)';
  const shadowColorLight = isLightMode ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.08)';

  return `
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

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      direction: ${isRTL ? 'rtl' : 'ltr'};
      text-align: ${isRTL ? 'right' : 'left'};
    }

    body {
      font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
      color: ${text};
      background: ${bg};
      line-height: 1.9;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }

    /* ─── Page Header/Footer (CSS @page) ─────── */
    @page {
      size: A4;
      margin: 20mm 18mm 25mm 18mm;
    }

    .page-header-line {
      width: 100%;
      height: 1px;
      background: ${border};
      margin-bottom: 4px;
    }
    .page-header-text {
      font-size: 9px;
      color: ${textMuted};
      text-align: center;
      margin-bottom: 16px;
    }
    .page-footer-line {
      width: 100%;
      height: 1px;
      background: ${border};
      margin-top: 16px;
      margin-bottom: 4px;
    }
    .page-footer-text {
      font-size: 9px;
      color: ${textMuted};
      text-align: center;
      margin-top: 4px;
    }

    /* ─── Cover Page ─────────────────────────── */
    .cover-page {
      page-break-after: always;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: ${coverGradient};
      position: relative;
      overflow: hidden;
      padding: 60px 40px;
      color: white;
    }

    /* Decorative geometric shapes — CSS circles with low opacity */
    .cover-deco-circle-1 {
      position: absolute;
      top: -120px;
      right: -80px;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      border: 1px solid rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.1);
      pointer-events: none;
      z-index: 0;
    }
    .cover-deco-circle-2 {
      position: absolute;
      bottom: -100px;
      left: -60px;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.06) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .cover-deco-circle-3 {
      position: absolute;
      top: 30%;
      left: 10%;
      width: 180px;
      height: 180px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.04);
      pointer-events: none;
      z-index: 0;
    }
    .cover-deco-circle-4 {
      position: absolute;
      bottom: 25%;
      right: 8%;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.04);
      pointer-events: none;
      z-index: 0;
    }

    .cover-brand {
      position: relative;
      z-index: 1;
      text-align: center;
      margin-bottom: 20px;
    }

    .cover-logo {
      font-size: 96px;
      color: rgba(255, 255, 255, 0.97);
      font-weight: 700;
      line-height: 1;
      margin-bottom: 16px;
      text-shadow: 0 4px 30px rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.35), 0 0 60px rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.1);
    }

    .cover-brand-name {
      font-size: 28px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
      letter-spacing: 10px;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.2);
    }

    .cover-channel-name {
      font-size: 18px;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 8px;
      font-weight: 400;
    }

    .cover-divider {
      width: 140px;
      height: 3px;
      background: linear-gradient(90deg, transparent, ${coverAccent}, transparent);
      margin: 28px auto;
      position: relative;
      z-index: 1;
    }

    /* Document type badge — rounded pill shape with themed background */
    .cover-doc-type {
      display: inline-block;
      background: ${coverAccent};
      color: white;
      padding: 8px 32px;
      border-radius: 50px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 24px;
      position: relative;
      z-index: 1;
      letter-spacing: 1px;
    }

    .cover-title {
      font-size: 30px;
      font-weight: 700;
      color: white;
      text-align: center;
      max-width: 600px;
      line-height: 1.5;
      position: relative;
      z-index: 1;
      margin-bottom: 20px;
    }

    .cover-meta {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      position: relative;
      z-index: 1;
      margin-top: 6px;
    }

    /* Bottom decorative bar — themed gradient */
    .cover-accent-bottom {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 5px;
      background: linear-gradient(90deg, ${coverAccent}, rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.4), ${coverAccent});
      z-index: 1;
    }

    .cover-frame {
      position: absolute;
      inset: 16px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      pointer-events: none;
      z-index: 0;
    }

    .cover-badges {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 28px;
      position: relative;
      z-index: 1;
    }

    .cover-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      border: 1.5px solid rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.75);
      background: rgba(255, 255, 255, 0.06);
    }

    .cover-badge.filled {
      background: ${coverAccent};
      color: white;
      border-color: ${coverAccent};
    }

    /* Cover description/summary area */
    .cover-description {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.55);
      text-align: center;
      max-width: 500px;
      line-height: 1.8;
      position: relative;
      z-index: 1;
      margin-top: 12px;
      font-weight: 400;
    }

    /* Geometric dot pattern overlay */
    .cover-dots-pattern {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 24px 24px;
      pointer-events: none;
      z-index: 0;
    }

    /* Additional decorative lines on cover */
    .cover-line-left {
      position: absolute;
      left: 40px;
      top: 15%;
      bottom: 15%;
      width: 1px;
      background: linear-gradient(180deg, transparent, rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.15), transparent);
      pointer-events: none;
      z-index: 0;
    }
    .cover-line-right {
      position: absolute;
      right: 40px;
      top: 15%;
      bottom: 15%;
      width: 1px;
      background: linear-gradient(180deg, transparent, rgba(${coverAccentRgb.r}, ${coverAccentRgb.g}, ${coverAccentRgb.b}, 0.15), transparent);
      pointer-events: none;
      z-index: 0;
    }

    /* ─── TOC Page ───────────────────────────── */
    .toc-page {
      page-break-after: auto;
      padding: 60px 50px;
      background: ${bg};
    }

    .toc-title {
      font-size: 26px;
      font-weight: 700;
      color: ${primary};
      margin-bottom: 8px;
    }

    .toc-accent-line {
      width: 60px;
      height: 3px;
      background: ${accent};
      border-radius: 2px;
      margin-bottom: 28px;
    }

    .toc-entry {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 6px;
      transition: background 0.2s;
    }

    .toc-entry:nth-child(odd) {
      background: ${surface};
    }

    .toc-entry-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: ${accent};
      color: white;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
      ${isRTL ? 'margin-left' : 'margin-right'}: 14px;
    }

    .toc-entry-title {
      flex: 1;
      font-size: 14px;
      color: ${text};
      font-weight: 500;
    }

    .toc-dots {
      flex: 0 0 auto;
      color: ${textMuted};
      font-size: 10px;
      letter-spacing: 2px;
      margin: 0 14px;
    }

    /* ─── Content Pages ──────────────────────── */
    .content-page {
      padding: 50px;
    }

    /* Section headers: Full-width primary background bar with white text and section number circle */
    .section-header {
      background: ${primary};
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      page-break-after: avoid;
      box-shadow: 0 2px 8px ${shadowColor};
    }

    .section-header h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      flex: 1;
    }

    .section-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: ${accent};
      font-size: 15px;
      font-weight: 700;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3);
    }

    .section-content {
      padding: 0;
    }

    /* ─── Subsections ────────────────────────── */
    /* Subsection h2: Left border accent, surface background */
    .subsection-h2 {
      background: ${surface};
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accent};
      padding: 12px 20px;
      border-radius: ${isRTL ? '0 8px 8px 0' : '8px 0 0 8px'};
      margin: 24px 0 14px;
    }

    .subsection-h2 h2 {
      font-size: 20px;
      font-weight: 700;
      color: ${secondary};
      margin: 0;
    }

    /* Subsection h3: Left border secondary accent, lighter background */
    .subsection-h3 {
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.04);
      border-${isRTL ? 'right' : 'left'}: 3px solid ${secondary};
      padding: 10px 18px;
      border-radius: ${isRTL ? '0 6px 6px 0' : '6px 0 0 6px'};
      margin: 18px 0 12px;
    }

    .subsection-h3 h3 {
      font-size: 17px;
      font-weight: 700;
      color: ${secondary};
      margin: 0;
    }

    /* ─── Paragraph ──────────────────────────── */
    .paragraph {
      margin-bottom: 1.25rem;
      line-height: 1.9;
      color: ${text};
      text-align: justify;
      font-size: 13px;
    }

    /* ─── Bullet Points — "◆" symbol in accent ── */
    .bullet {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 8px;
    }

    .bullet-icon {
      color: ${accent};
      font-size: 10px;
      margin-top: 7px;
      flex-shrink: 0;
    }

    .bullet-content {
      flex: 1;
      line-height: 1.8;
    }

    /* Sub-bullets with "◦" symbol */
    .sub-bullet {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-${isRTL ? 'right' : 'left'}: 28px;
      margin-bottom: 6px;
    }

    .sub-bullet-icon {
      color: ${textSecondary};
      font-size: 9px;
      margin-top: 7px;
      flex-shrink: 0;
    }

    /* ─── Numbered List — Circle badges with primary background ── */
    .numbered-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }

    .numbered-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      height: 26px;
      border-radius: 50%;
      background: ${primary};
      color: white;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 2px;
    }

    /* ─── Callout Boxes ──────────────────────── */
    .callout {
      padding: 16px 20px;
      border-radius: 8px;
      margin: 18px 0;
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .callout-icon {
      font-size: 20px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .callout-content {
      flex: 1;
    }

    .callout-label {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .callout-text {
      font-size: 12px;
      line-height: 1.8;
    }

    /* Note: Light background, left border accentWarm */
    .callout-note {
      background: rgba(${hexToRgb(accentWarm).r}, ${hexToRgb(accentWarm).g}, ${hexToRgb(accentWarm).b}, 0.08);
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accentWarm};
    }
    .callout-note .callout-icon { color: ${accentWarm}; }
    .callout-note .callout-label { color: ${accentWarm}; }
    .callout-note .callout-text { color: ${text}; }

    /* Warning: Light red background, left border red */
    .callout-warning {
      background: ${calloutWarningBg};
      border-${isRTL ? 'right' : 'left'}: 4px solid ${calloutWarningBorder};
    }
    .callout-warning .callout-icon { color: ${calloutWarningBorder}; }
    .callout-warning .callout-label { color: ${calloutWarningBorder}; }
    .callout-warning .callout-text { color: ${text}; }

    /* Tip: Light green background, left border accentGreen */
    .callout-tip {
      background: rgba(${hexToRgb(accentGreen).r}, ${hexToRgb(accentGreen).g}, ${hexToRgb(accentGreen).b}, 0.06);
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accentGreen};
    }
    .callout-tip .callout-icon { color: ${accentGreen}; }
    .callout-tip .callout-label { color: ${accentGreen}; }
    .callout-tip .callout-text { color: ${text}; }

    /* ─── Callout Box — Strategic callouts for hooks, rules, errors ── */
    .callout-box {
      padding: 18px 22px;
      border-radius: 10px;
      margin: 20px 0;
      position: relative;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      ${isRTL ? 'border-right' : 'border-left'}: 5px solid;
    }

    .callout-box-icon {
      font-size: 22px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .callout-box-content {
      flex: 1;
    }

    .callout-box-label {
      font-weight: 800;
      font-size: 13px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .callout-box-text {
      font-size: 13px;
      line-height: 1.9;
      color: ${text};
    }

    /* Hook variant — accent color, electric feel */
    .callout-box-hook {
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.06);
      border-color: ${accent};
    }
    .callout-box-hook .callout-box-icon { color: ${accent}; }
    .callout-box-hook .callout-box-label { color: ${accent}; }

    /* Rule variant — amber/gold, authority */
    .callout-box-rule {
      background: rgba(${hexToRgb(accentWarm).r}, ${hexToRgb(accentWarm).g}, ${hexToRgb(accentWarm).b}, 0.06);
      border-color: ${accentWarm};
    }
    .callout-box-rule .callout-box-icon { color: ${accentWarm}; }
    .callout-box-rule .callout-box-label { color: ${accentWarm}; }

    /* Error variant — red, danger */
    .callout-box-error {
      background: ${calloutWarningBg};
      border-color: ${calloutWarningBorder};
    }
    .callout-box-error .callout-box-icon { color: ${calloutWarningBorder}; }
    .callout-box-error .callout-box-label { color: ${calloutWarningBorder}; }

    /* ─── Key Insight Box — accent border, star icon ── */
    .key-insight {
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.06);
      border: 1px solid rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25);
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accent};
      border-radius: 8px;
      padding: 18px 22px;
      margin: 22px 0;
      position: relative;
    }

    .key-insight-star {
      position: absolute;
      top: -10px;
      ${isRTL ? 'right' : 'left'}: 18px;
      font-size: 18px;
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.06);
      padding: 0 6px;
      color: ${accent};
    }

    .key-insight-title {
      font-weight: 700;
      font-size: 14px;
      color: ${accent};
      margin-bottom: 8px;
    }

    .key-insight-text {
      font-size: 13px;
      line-height: 1.8;
      color: ${text};
    }

    /* ─── Definition List — Grid layout ──────── */
    .definition-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 18px 0;
    }

    .definition-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: baseline;
      padding: 12px 18px;
      background: ${surface};
      border-radius: 8px;
      border-${isRTL ? 'right' : 'left'}: 3px solid ${accent};
    }

    .definition-term {
      font-weight: 700;
      color: ${primary};
      font-size: 13px;
      white-space: nowrap;
    }

    .definition-value {
      color: ${text};
      font-size: 12px;
      line-height: 1.7;
    }

    /* ─── Table — Zebra-Striped ──────────────── */
    .data-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 18px 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid ${border};
    }

    /* Header row: Primary background, white bold text */
    .data-table th {
      background: ${primary};
      color: white;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 700;
      text-align: ${isRTL ? 'right' : 'left'};
      border-bottom: 2px solid ${primary};
    }

    .data-table td {
      padding: 10px 16px;
      font-size: 12px;
      border-bottom: 1px solid ${border};
      text-align: ${isRTL ? 'right' : 'left'};
    }

    /* Odd rows: slightly lighter than bg */
    .data-table tr:nth-child(odd) td {
      background: ${bg};
    }

    /* Even rows: surface */
    .data-table tr:nth-child(even) td {
      background: ${surface};
    }

    .data-table tr:last-child td {
      border-bottom: none;
    }

    /* ─── Code Block — language badge ── */
    .code-block {
      background: ${codeBlockBg};
      border-radius: 8px;
      margin: 18px 0;
      overflow: hidden;
      position: relative;
      border: 1px solid ${isLightMode ? border : 'transparent'};
    }

    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: ${codeBlockHeaderBg};
      border-bottom: 1px solid ${codeBlockBorder};
    }

    /* Language badge in top-right corner */
    .code-lang {
      color: ${accent};
      font-size: 10px;
      font-weight: 700;
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15);
      padding: 2px 10px;
      border-radius: 4px;
    }

    .code-content {
      padding: 16px;
      overflow-x: auto;
    }

    .code-content pre {
      color: ${codeBlockTextColor};
      font-family: 'CourierPrime', 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* ─── Blockquote ─────────────────────────── */
    .blockquote {
      background: ${surface};
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accent};
      border-radius: ${isRTL ? '0 8px 8px 0' : '8px 0 0 8px'};
      padding: 16px 22px;
      margin: 18px 0;
      position: relative;
    }

    .blockquote::before {
      content: '\\201C';
      position: absolute;
      top: 4px;
      ${isRTL ? 'left' : 'right'}: 18px;
      font-size: 28px;
      color: ${accent};
      opacity: 0.25;
    }

    .blockquote-text {
      color: ${textSecondary};
      font-size: 13px;
      font-style: italic;
      line-height: 1.8;
    }

    /* ─── Diagram/Chart Container ────────────── */
    .diagram-container {
      background: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.04);
      border: 1.5px solid rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3);
      border-${isRTL ? 'right' : 'left'}: 4px solid ${accent};
      border-radius: 8px;
      padding: 20px 24px;
      margin: 22px 0;
      text-align: center;
    }

    .diagram-title {
      font-weight: 700;
      color: ${primary};
      font-size: 14px;
      margin-bottom: 6px;
    }

    .diagram-description {
      font-style: italic;
      color: ${textSecondary};
      font-size: 12px;
      margin-bottom: 14px;
    }

    .diagram-label {
      font-size: 10px;
      color: ${accent};
      font-weight: 700;
      margin-top: 10px;
      letter-spacing: 1px;
    }

    .diagram-analysis {
      font-style: italic;
      font-size: 12px;
      color: ${textSecondary};
      padding-top: 12px;
      margin-top: 12px;
      border-top: 1px dashed ${border};
      text-align: ${isRTL ? 'right' : 'left'};
      line-height: 1.8;
    }

    .diagram-analysis-label {
      display: inline-block;
      color: ${accent};
      font-weight: 700;
      font-size: 12px;
      font-style: normal;
      ${isRTL ? 'margin-left' : 'margin-right'}: 6px;
    }

    /* ─── Lecture Divider ────────────────────── */
    .lecture-divider {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 36px 0 24px;
      page-break-before: auto;
    }
    .lecture-divider::before,
    .lecture-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, ${border}, transparent);
    }
    .lecture-divider-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${accent};
      color: white;
      padding: 6px 20px;
      border-radius: 50px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    .lecture-divider-badge .lecture-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      font-size: 12px;
    }

    /* ─── Lecture Index Card ─────────────────── */
    .lecture-index-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: ${surface};
      border-radius: 8px;
      border: 1px solid ${border};
      margin-bottom: 8px;
      box-shadow: 0 1px 3px ${shadowColorLight};
    }
    .lecture-index-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${accent};
      color: white;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .lecture-index-title {
      flex: 1;
      font-size: 13px;
      color: ${text};
      font-weight: 500;
    }

    /* Chart SVG container — V.53: prevent orphaned charts */
    .chart-container {
      margin: 20px 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .chart-container svg {
      max-width: 100%;
      height: auto;
    }

    /* V.53: Tables, callouts, and code blocks must not break across pages */
    .table-container, table {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 1.5rem;
    }

    .callout, .callout-box, .note-box, .warning-box, .tip-box, .feature-box {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 1.5rem;
    }

    pre, code-block, .code-block {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* V.53: Headings must not be orphaned at bottom of page */
    h1, h2, h3, h4 {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* V.53: Paragraphs should not break mid-sentence if possible */
    p {
      orphans: 3;
      widows: 3;
    }

    /* ─── Grid Cards — 2-column grid ─────────── */
    .grid-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin: 18px 0;
    }

    .grid-card {
      background: ${surface};
      border: 1px solid ${border};
      border-${isRTL ? 'right' : 'left'}: 3px solid ${accent};
      border-radius: 8px;
      padding: 18px;
      box-shadow: 0 1px 3px ${shadowColorLight};
    }

    .grid-card-title {
      font-weight: 700;
      color: ${primary};
      font-size: 14px;
      margin-bottom: 8px;
    }

    .grid-card-text {
      font-size: 12px;
      color: ${textSecondary};
      line-height: 1.7;
    }

    /* ─── Feature Box — Numbered grid items for steps & principles ── */
    .feature-grid,
    .features-table {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin: 20px 0;
    }

    .feature-box {
      background: ${surface};
      border: 1px solid ${border};
      border-radius: 10px;
      padding: 20px;
      position: relative;
      page-break-inside: avoid;
      box-shadow: 0 2px 8px ${shadowColorLight};
      transition: box-shadow 0.2s;
    }

    /* Feature box h3 — styled to match the mandatory structure rule */
    .feature-box h3 {
      font-weight: 700;
      color: ${primary};
      font-size: 14px;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    /* Feature box p — paragraph text inside feature box */
    .feature-box p {
      font-size: 12px;
      color: ${textSecondary};
      line-height: 1.8;
      margin: 0;
    }

    .feature-box-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: ${primary};
      color: white;
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 12px;
    }

    .feature-box-title {
      font-weight: 700;
      color: ${primary};
      font-size: 14px;
      margin-bottom: 8px;
    }

    .feature-box-text {
      font-size: 12px;
      color: ${textSecondary};
      line-height: 1.8;
    }

    /* Full-width feature box (for single column) */
    .feature-box-full {
      grid-column: 1 / -1;
    }

    /* features-table: emphasize with subtle border and accent */
    .features-table {
      border: 1px solid ${border};
      border-radius: 12px;
      padding: 16px;
      background: ${surface};
    }

    .features-table .feature-box {
      border-${isRTL ? 'right' : 'left'}: 3px solid ${accent};
    }

    /* ─── Timeline Component ─────────────────── */
    .timeline {
      position: relative;
      margin: 22px 0;
      padding-${isRTL ? 'right' : 'left'}: 28px;
    }

    .timeline::before {
      content: '';
      position: absolute;
      ${isRTL ? 'right' : 'left'}: 7px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: ${accent};
      border-radius: 2px;
    }

    .timeline-item {
      position: relative;
      margin-bottom: 18px;
      padding: 14px 18px;
      background: ${surface};
      border-radius: 8px;
      border-${isRTL ? 'right' : 'left'}: 2px solid ${accent};
    }

    .timeline-item::before {
      content: '';
      position: absolute;
      ${isRTL ? 'right' : 'left'}: -25px;
      top: 16px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: ${accent};
      border: 3px solid ${bg};
      box-shadow: 0 0 0 2px ${accent};
    }

    .timeline-item-title {
      font-weight: 700;
      color: ${primary};
      font-size: 14px;
    }

    .timeline-item-text {
      font-size: 12px;
      color: ${textSecondary};
      line-height: 1.7;
      margin-top: 6px;
    }

    /* ─── Comparison Table ───────────────────── */
    .comparison-table {
      margin: 18px 0;
      border-radius: 8px;
      overflow: hidden;
    }

    /* ─── Horizontal Rule ────────────────────── */
    .section-divider {
      border: none;
      height: 1px;
      background: ${border};
      margin: 28px 0;
    }

    /* ─── Flow Diagram ──────────────────────── */
    .flow-diagram {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 18px 0;
      flex-wrap: wrap;
      justify-content: center;
    }

    .flow-step {
      background: ${surface};
      border: 2px solid ${accent};
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 700;
      color: ${primary};
    }

    .flow-arrow {
      color: ${accent};
      font-size: 20px;
    }

    /* ─── Embedded Images ─────────────────────── */
    .embedded-image {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 12px ${shadowColor};
      margin: 12px auto;
      display: block;
    }

    .image-container {
      text-align: center;
      margin: 22px 0;
      page-break-inside: avoid;
    }

    .image-caption {
      color: ${textMuted};
      font-size: 11px;
      margin-top: 8px;
      font-style: italic;
    }

    /* ─── Footer ─────────────────────────────── */
    .page-footer {
      text-align: center;
      padding: 20px;
      color: ${textMuted};
      font-size: 10px;
      border-top: 1px solid ${border};
      margin-top: 40px;
    }

    /* ─── Print Optimization ─────────────────── */
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .cover-page { break-after: page; }
      .toc-page { break-after: auto; }
      .section-header { break-after: avoid; break-inside: avoid; }
      .subsection-h2, .subsection-h3 { break-after: avoid; }
      .callout, .key-insight, .blockquote { break-inside: avoid; }
      .data-table, .comparison-table { break-inside: avoid; }
      .grid-card { break-inside: avoid; }
      .timeline-item { break-inside: avoid; }
      .image-container { break-inside: avoid; }
      .definition-item { break-inside: avoid; }
      .code-block { break-inside: avoid; }
      .callout-box, .feature-box, .features-table { break-inside: avoid; }
    }

    /* ─── BiDi Support ───────────────────────── */
    bdi, [dir="ltr"] { direction: ltr; unicode-bidi: isolate; }
    [dir="rtl"] { direction: rtl; unicode-bidi: isolate; }
    .ltr-isolate { unicode-bidi: isolate; direction: ltr; }
    .num { unicode-bidi: isolate; direction: ltr; display: inline-block; }
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateArabic(): string {
  const now = new Date();
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? 'مساءً' : 'صباحاً';
  const displayHours = hours % 12 || 12;

  return `${day} ${month} ${year} — ${displayHours}:${minutes} ${period}`;
}

function getDocTypeLabel(type?: string, language: 'ar' | 'en' = 'ar'): string {
  if (language === 'en') {
    const labels: Record<string, string> = { lecture: 'Lecture', summary: 'Summary', research: 'Research', notes: 'Notes' };
    return labels[type || 'summary'] || 'Summary';
  }
  const labels: Record<string, string> = { lecture: 'محاضرة', summary: 'ملخص', research: 'بحث', notes: 'ملاحظات' };
  return labels[type || 'summary'] || 'ملخص';
}

// ─── Component Mapper ─────────────────────────────────────────────────────

/**
 * Map a component type from DesignReasoning to HTML rendering.
 * Wraps a group of content blocks in the appropriate layout.
 */
function renderComponentWrapper(
  componentType: ComponentMapEntry['componentType'],
  blocksHtml: string,
  _primary: string,
  _accent: string,
  _language: 'ar' | 'en',
): string {
  switch (componentType) {
    case 'grid-cards':
      return `<div class="grid-cards">${blocksHtml}</div>`;

    case 'comparison-table':
      return `<div class="comparison-table">${blocksHtml}</div>`;

    case 'timeline':
      return `<div class="timeline">${blocksHtml}</div>`;

    case 'stat-chart':
      return `<div class="diagram-container">${blocksHtml}</div>`;

    case 'definition-list':
      return `<div class="definition-list">${blocksHtml}</div>`;

    case 'callout-box':
      return `<div class="key-insight"><span class="key-insight-star">\\u2605</span>${blocksHtml}</div>`;

    case 'feature-grid':
      return `<div class="features-table">${blocksHtml}</div>`;

    case 'flow-diagram':
      return `<div class="flow-diagram">${blocksHtml}</div>`;

    default:
      return blocksHtml;
  }
}

// ─── Block Rendering ──────────────────────────────────────────────────────

function renderBlock(block: ParsedBlock, language: 'ar' | 'en' = 'ar', palette?: ThemePalette): string {
  const isRTL = language === 'ar';

  switch (block.type) {
    case 'h2':
      return `<div class="subsection-h2"><h2>${escapeHtml(block.content)}</h2></div>`;

    case 'h3':
      return `<div class="subsection-h3"><h3>${escapeHtml(block.content)}</h3></div>`;

    case 'paragraph':
      return `<div class="paragraph">${escapeHtml(block.content)}</div>`;

    case 'bullet':
      return `
        <div class="bullet">
          <span class="bullet-icon">◆</span>
          <span class="bullet-content">${escapeHtml(block.content)}</span>
        </div>`;

    case 'numbered':
      return `
        <div class="numbered-item">
          <span class="numbered-badge">${block.index || 1}</span>
          <span style="flex:1; line-height:1.8">${escapeHtml(block.content)}</span>
        </div>`;

    case 'blockquote':
      return `
        <div class="blockquote">
          <div class="blockquote-text">${escapeHtml(block.content)}</div>
        </div>`;

    case 'note':
      return `
        <div class="callout callout-note">
          <span class="callout-icon">\\u270D\\uFE0F</span>
          <div class="callout-content">
            <div class="callout-label">${isRTL ? 'ملاحظة' : 'Note'}</div>
            <div class="callout-text">${escapeHtml(block.content)}</div>
          </div>
        </div>`;

    case 'warning':
      return `
        <div class="callout callout-warning">
          <span class="callout-icon">\\u26A0\\uFE0F</span>
          <div class="callout-content">
            <div class="callout-label">${isRTL ? 'تحذير' : 'Warning'}</div>
            <div class="callout-text">${escapeHtml(block.content)}</div>
          </div>
        </div>`;

    case 'tip':
      return `
        <div class="callout callout-tip">
          <span class="callout-icon">\\u1F4A1</span>
          <div class="callout-content">
            <div class="callout-label">${isRTL ? 'نصيحة' : 'Tip'}</div>
            <div class="callout-text">${escapeHtml(block.content)}</div>
          </div>
        </div>`;

    case 'callout': {
      const variant = block.variant || 'hook';
      const icons: Record<string, string> = {
        hook: '\\u26A1',
        rule: '\\uD83C\\uDFC6',
        error: '\\uD83D\\uDEAB',
      };
      const labels: Record<string, string> = {
        hook: isRTL ? 'نقطة صاعقة' : 'Key Insight',
        rule: isRTL ? 'قاعدة ذهبية' : 'Golden Rule',
        error: isRTL ? 'خطأ شائع' : 'Common Mistake',
      };
      const label = block.label || labels[variant];
      return `
        <div class="callout-box callout-box-${variant}">
          <span class="callout-box-icon">${icons[variant]}</span>
          <div class="callout-box-content">
            <strong class="callout-box-label">${escapeHtml(label)}</strong>
            <p class="callout-box-text">${escapeHtml(block.content)}</p>
          </div>
        </div>`;
    }

    case 'feature': {
      const num = block.index || 1;
      const numStr = num.toString().padStart(2, '0');
      // Parse feature content: first bold line is the title, rest is the description
      // Supports both "**Title**\nDescription" and "Title\nDescription" formats
      const content = block.content || '';
      let featureTitle = block.term || '';
      let featureText = content;

      // If content starts with **bold**, extract as title
      const boldMatch = content.match(/^\*\*(.+?)\*\*\s*\n?(.*)/s);
      if (boldMatch && !featureTitle) {
        featureTitle = boldMatch[1];
        featureText = boldMatch[2] || '';
      }

      return `
        <div class="feature-box">
          <div class="feature-box-number">${numStr}</div>
          <h3>${numStr}. ${escapeHtml(featureTitle)}</h3>
          <p>${escapeHtml(featureText.trim())}</p>
        </div>`;
    }

    case 'definition':
      return `
        <div class="definition-item">
          <span class="definition-term">${escapeHtml(block.term || '')}</span>
          <span class="definition-value">${escapeHtml(block.definition || '')}</span>
        </div>`;

    case 'table':
      if (!block.rows || block.rows.length === 0) return '';
      const headerRow = block.rows[0];
      const bodyRows = block.rows.slice(1);
      return `
        <table class="data-table">
          <thead>
            <tr>${headerRow.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>`;

    case 'code':
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(block.language || 'text')}</span>
          </div>
          <div class="code-content">
            <pre>${escapeHtml(block.content)}</pre>
          </div>
        </div>`;

    case 'image':
      // If we have embedded image data, render the actual image
      if (block.imageData) {
        const desc = block.description || (isRTL ? 'رسم توضيحي' : 'Illustration');
        return `
          <div class="image-container">
            <img src="${block.imageData}" class="embedded-image" alt="${escapeHtml(desc)}" />
            <div class="image-caption">${escapeHtml(desc)}</div>
          </div>`;
      }
      // Fallback: show styled placeholder when no image data is available
      {
        const analysisLabel = isRTL ? '📋 وصف وتحليل الرسمة:' : '📋 Diagram Analysis:';
        const analysisText = block.description || '';
        return `
          <div class="diagram-container">
            <div class="diagram-title">${isRTL ? 'رسم توضيحي' : 'Illustration'}</div>
            ${block.description ? `<div class="diagram-description">${escapeHtml(block.description)}</div>` : ''}
            <div style="padding:24px; text-align:center; color:${palette?.textMuted || '#94a3b8'};">
              <div style="font-size:36px; margin-bottom:8px; opacity:0.4;">🖼️</div>
            </div>
            <div class="diagram-label">${isRTL ? 'وصف الرسمة' : 'Diagram Description'}</div>
            ${analysisText ? `
            <div class="diagram-analysis">
              <span class="diagram-analysis-label">${analysisLabel}</span>
              ${escapeHtml(analysisText)}
            </div>` : ''}
          </div>`;
      }

    case 'hr':
      return '<hr class="section-divider">';

    default:
      return block.content ? `<div class="paragraph">${escapeHtml(block.content)}</div>` : '';
  }
}

// ─── Main Template Generator ──────────────────────────────────────────────

/**
 * Generate a complete HTML document from content and DesignReasoningBlock.
 *
 * Produces a stunning, print-optimized HTML document with:
 * - Professional cover page with geometric decorations
 * - Table of contents with teal number badges
 * - Content sections with component mapping
 * - Embedded chart SVGs and images
 * - Callout boxes, definitions, timelines, grid cards
 * - RTL/BiDi support
 * - Page header/footer
 */
/**
 * Generate minimal fallback CSS when AI design reasoning is unavailable.
 * Uses only the dynamic palette — no fixed templates, no static styles.
 * Produces a clean, readable document with palette-derived colors.
 */
function generateMinimalFallbackCSS(palette: ThemePalette, isRTL: boolean): string {
  const {
    primary, secondary, accent, accentWarm, accentGreen,
    bg, surface, text, textSecondary, textMuted, border,
    coverGradient, coverAccent,
  } = palette;

  const dir = isRTL ? 'right' : 'left';

  return `
    /* ─── Minimal Dynamic Palette Fallback ─── */
    .cover-page { background: ${coverGradient}; }
    .cover-logo { color: ${coverAccent}; text-shadow: 0 4px 20px ${coverAccent}44; }
    .cover-brand-name { color: rgba(255,255,255,0.85); letter-spacing: 6px; }
    .cover-channel-name { color: rgba(255,255,255,0.6); }
    .cover-divider { background: linear-gradient(90deg, transparent, ${coverAccent}, transparent); height: 2px; }
    .cover-doc-type { background: ${accent}; color: white; }
    .cover-title { color: white; }
    .cover-meta { color: rgba(255,255,255,0.7); }
    .cover-description { color: rgba(255,255,255,0.6); }
    .cover-accent-bottom { height: 3px; background: ${accent}; }
    .cover-deco-circle-1 { border-color: ${coverAccent}22; }
    .cover-deco-circle-2 { background: radial-gradient(circle, ${coverAccent}11 0%, transparent 70%); }
    .cover-badge { background: ${surface}; color: ${textSecondary}; border-color: ${border}; }
    .cover-badge.filled { background: ${accent}22; color: ${accent}; border-color: ${accent}44; }

    body { background: ${bg}; color: ${text}; }
    .section-header { background: ${primary}; border-radius: 8px; }
    .section-header h1 { color: ${text}; }
    .section-number { background: ${accent}; color: white; }
    .subsection-h2 { border-${dir}: 4px solid ${accent}; background: ${surface}; }
    .subsection-h2 h2 { color: ${accent}; }
    .subsection-h3 h3 { color: ${secondary}; }
    .paragraph { color: ${textSecondary}; }
    .callout-box { background: ${surface}; border-${dir}: 3px solid ${accentWarm}; }
    .callout-box.tip { border-${dir}-color: ${accentGreen}; }
    .definition-box { background: ${surface}; border: 1px solid ${border}; }
    .definition-term { color: ${accent}; }
    .key-point { background: ${accent}15; border-${dir}: 3px solid ${accent}; }
    .page-footer { color: ${textMuted}; border-top: 1px solid ${border}; }
    .toc-item { color: ${textSecondary}; }
    .toc-item:hover { color: ${accent}; }
    .badge { background: ${accent}22; color: ${accent}; }
  `;
}

export function generateHTMLTemplate(options: HTMLTemplateOptions): string {
  const {
    content,
    title,
    author,
    language = 'ar',
    modelId,
    designReasoning,
    chartSpecs,
    documentType = 'summary',
    images,
    batchMeta,
    topicCategory: providedCategory,
    userColorPreference,
    userDesignPreferences,
  } = options;

  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const cp = designReasoning?.contentPsychology;

  // ── Detect topic category for dynamic theming ──
  const topicCategory = providedCategory || detectTopicCategory(content, title);
  // Generate a UNIQUE palette for this document using the seeded PRNG generator
  const effectiveColorPref = userColorPreference || userDesignPreferences?.colorPreference || null;
  let palette = generateUniquePalette(content, effectiveColorPref);

  // ── CRITICAL FIX: Merge LLM design reasoning colors into the palette ──
  // When the AI designer picks specific colors, those MUST override the
  // deterministic palette — otherwise the AI's creative choices are silently
  // discarded and every document uses the same color generation path.
  if (designReasoning?.visualLanguage) {
    const vl = designReasoning.visualLanguage;
    // v4.0: Preserve colorful fields (decoColors, sectionColors, etc.) when merging LLM colors
    const preservedColorfulFields = {
      decoColors: palette.decoColors,
      sectionColors: palette.sectionColors,
      coverAccent2: palette.coverAccent2,
      coverAccent3: palette.coverAccent3,
      coverDarkest: palette.coverDarkest,
      coverBright: palette.coverBright,
      accentInfo: palette.accentInfo,
      accentInfoBg: palette.accentInfoBg,
      accentKey: palette.accentKey,
      accentKeyBg: palette.accentKeyBg,
      accentData: palette.accentData,
      accentDataBg: palette.accentDataBg,
    };
    palette = {
      ...palette,
      // Override palette colors with the LLM's choices when available
      ...(vl.primaryColor && { primary: vl.primaryColor }),
      ...(vl.secondaryColor && { secondary: vl.secondaryColor }),
      ...(vl.accentColor && { accent: vl.accentColor }),
      ...(vl.backgroundColor && { bg: vl.backgroundColor }),
      ...(vl.textColor && { text: vl.textColor }),
      // Derive secondary palette values from the LLM's primary/accent choices
      ...(vl.accentColor && { coverAccent: vl.accentColor }),
      ...(vl.primaryColor && {
        coverGradient: `linear-gradient(135deg, ${vl.primaryColor} 0%, ${vl.secondaryColor || palette.secondary} 25%, ${preservedColorfulFields.coverDarkest || palette.secondary} 55%, ${vl.accentColor || palette.accent} 85%, ${preservedColorfulFields.coverBright || palette.accent} 100%)`,
      }),
      // Re-apply preserved colorful fields (LLM merge must not destroy them)
      ...preservedColorfulFields,
      // Derive surface from background: slightly lighter
      ...(vl.backgroundColor && {
        surface: vl.backgroundColor.startsWith('#')
          ? adjustBrightness(vl.backgroundColor, 15)
          : palette.surface,
      }),
      // Derive text secondary/muted from text color
      ...(vl.textColor && {
        textSecondary: vl.textColor.startsWith('#')
          ? adjustBrightness(vl.textColor, -30)
          : palette.textSecondary,
        textMuted: vl.textColor.startsWith('#')
          ? adjustBrightness(vl.textColor, -60)
          : palette.textMuted,
      }),
      ...(vl.primaryColor && {
        border: vl.primaryColor.startsWith('#')
          ? adjustBrightness(vl.primaryColor, 80)
          : palette.border,
      }),
    };
    console.log(`[HTML-Template] 🎨 LLM colors applied: primary=${vl.primaryColor}, accent=${vl.accentColor}, bg=${vl.backgroundColor}`);
  }

  // ── FIX (Issue 3): WCAG contrast validation for LLM-chosen colors ──
  // The LLM may pick arbitrary hex colors that produce unreadable combinations.
  // Validate that text and primary colors have sufficient contrast against the background.
  if (designReasoning?.visualLanguage) {
    const bgColor = palette.bg;
    // Validate text color against background
    if (palette.text && bgColor.startsWith('#') && palette.text.startsWith('#')) {
      const validatedText = validateContrast(palette.text, bgColor);
      if (validatedText !== palette.text) {
        console.log(`[HTML-Template] ⚠️ Contrast fix: text ${palette.text} → ${validatedText} (bg: ${bgColor})`);
        palette = { ...palette, text: validatedText };
      }
    }
    // Validate primary color (headings) against background
    if (palette.primary && bgColor.startsWith('#') && palette.primary.startsWith('#')) {
      const validatedPrimary = validateContrast(palette.primary, bgColor);
      if (validatedPrimary !== palette.primary) {
        console.log(`[HTML-Template] ⚠️ Contrast fix: primary ${palette.primary} → ${validatedPrimary} (bg: ${bgColor})`);
        palette = { ...palette, primary: validatedPrimary };
      }
    }
    // Validate accent color against background
    if (palette.accent && bgColor.startsWith('#') && palette.accent.startsWith('#')) {
      const validatedAccent = validateContrast(palette.accent, bgColor);
      if (validatedAccent !== palette.accent) {
        console.log(`[HTML-Template] ⚠️ Contrast fix: accent ${palette.accent} → ${validatedAccent} (bg: ${bgColor})`);
        palette = { ...palette, accent: validatedAccent, coverAccent: validatedAccent };
      }
    }
  }

  // ── Extract any AI-generated <style> from content ──
  // The content strategy prompt may instruct AI to output <style> tags.
  // We extract them, strip them from the content, and merge them AFTER
  // our generated CSS so AI styles take precedence for custom elements.
  let aiCustomCSS = '';
  let cleanContent = content;
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  const aiStyles: string[] = [];
  while ((styleMatch = styleRegex.exec(content)) !== null) {
    aiStyles.push(styleMatch[1]);
  }
  if (aiStyles.length > 0) {
    aiCustomCSS = aiStyles.join('\n');
    cleanContent = content.replace(styleRegex, '').trim();
  }

  // Parse content (use cleanContent without style tags)
  const sections = parseContent(cleanContent);

  // ── Apply images to parsed blocks ──
  // Images map: key can be a section heading, image description, image prompt, or "cover"
  if (images && Object.keys(images).length > 0) {
    const imageKeys = Object.keys(images);
    let imageIndex = 0; // Track which image to assign next

    for (const section of sections) {
      // First, try to match existing image blocks
      for (const block of section.content) {
        if (block.type === 'image') {
          // Try to match by description first, then by section heading, then by partial key match
          const descKey = block.description || '';
          if (images[descKey]) {
            block.imageData = images[descKey];
          } else if (images[section.heading]) {
            block.imageData = images[section.heading];
          } else {
            // Try partial key match: if any image key contains the description or section heading
            const partialMatch = imageKeys.find(
              (k) => k.includes(descKey) || k.includes(section.heading) || descKey.includes(k) || section.heading.includes(k)
            );
            if (partialMatch) {
              block.imageData = images[partialMatch];
            } else if (imageIndex < imageKeys.length) {
              // Assign images in order to image blocks that don't have a direct match
              block.imageData = images[imageKeys[imageIndex]];
              imageIndex++;
            }
          }
        }
      }

      // If section has no image blocks but we have images matching this section,
      // inject an image block at the beginning of the section content
      const sectionImage = images[section.heading] || imageKeys.find(k => section.heading && k.includes(section.heading));
      if (sectionImage && !section.content.some(b => b.type === 'image' && b.imageData)) {
        section.content.unshift({
          type: 'image',
          content: '',
          description: section.heading,
          imageData: typeof sectionImage === 'string' ? sectionImage : images[sectionImage as string],
        });
      }
    }
  }
  const nonEmptySections = sections.filter((s) => s.heading);
  const shouldShowTOC = nonEmptySections.length > 2;

  // ── AI-Driven Design ONLY — No more fixed template fallback ──
  // Every document gets a unique, AI-generated visual identity.
  // When AI design reasoning is unavailable, we generate a minimal
  // palette-based CSS instead of falling back to static templates.
  const designMode = designReasoning
    ? (options.styleDescription ? `AI Dynamic (style: "${options.styleDescription?.substring(0, 50)}")` : 'AI Dynamic (auto — content analysis)')
    : 'Dynamic Palette (no AI reasoning — palette-only design)';
  console.log(`[HTML-Template] Design mode: ${designMode} for "${title.substring(0, 50)}"`);

  // Generate CSS — pass the precomputed palette to avoid redundant double palette generation (Issue 1 fix)
  const baseCSS = generateCSS(designReasoning, language, topicCategory, cleanContent, effectiveColorPref || undefined, palette);

  // Apply CSS overrides: ALWAYS dynamic — no fixed template fallback
  let templateOverrideCSS: string;
  let templateLabel: string;

  // v4.0 Ultra Colorful CSS — always applied
  const ultraColorfulCSS = generateUltraColorfulCSS(palette, isRTL);

  if (designReasoning) {
    // AI-powered dynamic design — generate CSS from the LLM's VisualLanguage decisions
    templateOverrideCSS = generateDynamicDesignCSS(designReasoning, palette, isRTL) + '\n' + ultraColorfulCSS;
    templateLabel = `AI Dynamic Design + Ultra Colorful (cover: ${designReasoning.visualLanguage.coverStyle}, header: ${designReasoning.visualLanguage.sectionHeaderStyle})`;
  } else {
    // No AI reasoning available — generate minimal palette-based CSS + ultra colorful
    templateOverrideCSS = generateMinimalFallbackCSS(palette, isRTL) + '\n' + ultraColorfulCSS;
    templateLabel = 'Dynamic Palette + Ultra Colorful Fallback';
  }

  let css = `${baseCSS}\n    /* ─── Design: ${templateLabel} ─── */\n    ${templateOverrideCSS}`;

  // Merge AI custom CSS AFTER the template CSS so AI styles take precedence
  const finalCSS = aiCustomCSS ? `${css}\n    /* ─── AI Custom Styles (merged) ─── */\n    ${aiCustomCSS}` : css;

  // ─── Cover Page ─────────────────────────────
  // If there's a cover image, embed it
  const coverImageHtml = images?.['cover']
    ? `<div style="margin-bottom:20px; position:relative; z-index:1;">
         <img src="${images['cover']}" alt="Cover" style="max-width:280px; max-height:180px; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.3);" />
       </div>`
    : '';

  // ── Cover page element visibility — AI-driven only ──
  // Determine visibility from the AI VisualLanguage fields or use sensible defaults
  let showLogo: boolean;
  let showDotsPattern: boolean;
  let showDecoCircles: boolean;
  let showDecoLines: boolean;
  let showFrame: boolean;

  if (designReasoning) {
    // AI dynamic design: infer visibility from the cover style
    const cs = designReasoning.visualLanguage.coverStyle || designReasoning.visualLanguage.coverDesign || '';
    showLogo = !['centered-minimal'].includes(cs);
    showDotsPattern = ['gradient-full', 'gradient-asymmetric', 'geometric-pattern'].includes(cs) || /gradient|geometric/i.test(cs);
    showDecoCircles = ['gradient-full', 'bordered-frame', 'dark-sleek', 'gradient-asymmetric', 'geometric-pattern'].includes(cs) || /gradient|bordered|dark|geometric/i.test(cs);
    showDecoLines = ['gradient-full', 'bordered-frame', 'split-vertical'].includes(cs) || /gradient|bordered|split/i.test(cs);
    showFrame = ['bordered-frame'].includes(cs) || /bordered|frame|ornate/i.test(cs);
  } else {
    // No AI reasoning: sensible defaults for a clean look
    showLogo = true;
    showDotsPattern = false;
    showDecoCircles = true;
    showDecoLines = false;
    showFrame = false;
  }
  const showAccentBottom = true; // Always show, CSS will hide if needed

  // Logo — simple Δ symbol, CSS handles styling
  const logoHtml = showLogo ? '<div class="cover-logo">Δ</div>' : '';

  // ── v4.0 Ultra Colorful Cover ──
  const rainbowStrip = generateRainbowStrip(palette.decoColors);
  const tripleBar = generateTripleBar(palette.coverAccent, palette.coverAccent2 || palette.accent, palette.coverAccent3 || palette.accentWarm);
  
  // Color legend for cover page
  const legendItems = [
    { color: palette.accentKey, label: isRTL ? 'مصطلحات مهمة' : 'Key Terms' },
    { color: palette.accentData, label: isRTL ? 'أرقام وبيانات' : 'Numbers & Data' },
    { color: palette.accentWarm, label: isRTL ? 'ملاحظات هامة' : 'Important Notes' },
    { color: palette.accentGreen, label: isRTL ? 'نقاط رئيسية' : 'Key Points' },
    { color: palette.accentInfo, label: isRTL ? 'نصائح وتلميحات' : 'Tips & Hints' },
  ];
  const legendHtml = `<div style="display:flex; gap:18px; margin-top:24px; flex-wrap:wrap; justify-content:center; position:relative; z-index:5;">
    ${legendItems.map(li => `<span style="display:flex; align-items:center; gap:6px; font-size:10pt; color:rgba(255,255,255,0.75);">
      <span style="width:10px; height:10px; border-radius:50%; background:${li.color}; display:inline-block;"></span>${li.label}</span>`).join('')}
  </div>`;

  // Decorative circles using decoColors
  const decoCirclesHtml = (palette.decoColors && palette.decoColors.length >= 4) ? `
    <div style="position:absolute; border-radius:50%; background:${palette.decoColors[0]}; opacity:0.18; right:-60px; top:-60px; width:250px; height:250px;"></div>
    <div style="position:absolute; border-radius:50%; background:${palette.decoColors[1]}; opacity:0.12; right:40px; top:20px; width:140px; height:140px;"></div>
    <div style="position:absolute; border-radius:50%; background:${palette.decoColors[2]}; opacity:0.14; left:-40px; bottom:-40px; width:200px; height:200px;"></div>
    <div style="position:absolute; border-radius:50%; background:${palette.decoColors[3]}; opacity:0.10; left:60px; bottom:30px; width:100px; height:100px;"></div>
    <div style="position:absolute; right:30px; top:80px; width:60px; height:60px; background:${palette.decoColors[4]}; opacity:0.16; transform:rotate(45deg);"></div>
  ` : (showDecoCircles ? `
    <div class="cover-deco-circle-1"></div>
    <div class="cover-deco-circle-2"></div>
    <div class="cover-deco-circle-3"></div>
    <div class="cover-deco-circle-4"></div>` : '');

  // Bottom rainbow dots
  const bottomDotsHtml = (palette.decoColors && palette.decoColors.length >= 5) ? `
    <div style="display:flex; gap:12px; margin-top:20px; justify-content:center; position:relative; z-index:5;">
      ${palette.decoColors.slice(0,5).map(dc => `<span style="width:12px; height:12px; border-radius:50%; background:${dc}; display:inline-block;"></span>`).join('')}
    </div>` : '';

  const coverHtml = `
    <div class="cover-page">
      ${rainbowStrip}
      ${decoCirclesHtml}
      ${showFrame ? '<div class="cover-frame"></div>' : ''}
      <div class="cover-accent-bottom"></div>
      ${showDotsPattern ? '<div class="cover-dots-pattern"></div>' : ''}
      ${showDecoLines ? `
      <div class="cover-line-left"></div>
      <div class="cover-line-right"></div>` : ''}

      <div class="cover-brand">
        ${showLogo ? logoHtml : ''}
        <div class="cover-brand-name">DELTA AI</div>
        <div class="cover-channel-name">بعقل هادي</div>
      </div>

      ${tripleBar}

      <div class="cover-doc-type">${batchMeta ? (isRTL ? 'ملخص محاضرات' : 'Lecture Summary') : getDocTypeLabel(documentType, language)}</div>

      <div class="cover-title">${escapeHtml(title)}</div>

      <div class="cover-description">${isRTL ? `مستند شامل يتناول موضوع ${escapeHtml(title)} بالتفصيل والتحليل المعمق، يشمل التعريفات والمبادئ والتطبيقات العملية والتحديات المعاصرة` : `A comprehensive document covering ${escapeHtml(title)} in detail with in-depth analysis, including definitions, principles, practical applications, and contemporary challenges`}</div>

      ${coverImageHtml}
      ${tripleBar}

      ${legendHtml}

      <div class="cover-meta">${formatDateArabic()}</div>
      ${author ? `<div class="cover-meta" style="margin-top:4px;">${escapeHtml(author)}</div>` : ''}
      ${modelId ? `<div class="cover-meta" style="margin-top:4px; font-size:11px; opacity:0.4;">${escapeHtml(modelId)}</div>` : ''}

      <div class="cover-badges">
        ${batchMeta ? `<div class="cover-badge filled">${batchMeta.totalLectures} ${isRTL ? 'محاضرة' : 'Lectures'}</div>` : ''}
        ${cp ? `<div class="cover-badge filled">${cp.type === 'islamic' ? 'إسلامي' : cp.type === 'medical' ? 'طبي' : cp.type === 'academic' ? 'أكاديمي' : cp.type === 'financial' ? 'مالي' : cp.type === 'technical' ? 'تقني' : cp.type === 'legal' ? 'قانوني' : cp.type === 'creative' ? 'أدبي' : 'عام'}</div>` : ''}
      </div>
      ${bottomDotsHtml}
    </div>
  `;

  // ─── TOC Page ───────────────────────────────
  let tocHtml = '';
  if (shouldShowTOC) {
    const tocEntries = nonEmptySections.map((sec, idx) => `
      <div class="toc-entry">
        <div style="display:flex; align-items:center; ${isRTL ? 'flex-direction:row-reverse' : ''}; gap:14px; flex:1;">
          <span class="toc-entry-number">${idx + 1}</span>
          <span class="toc-entry-title">${escapeHtml(sec.heading)}</span>
        </div>
        <span class="toc-dots">· · · · · ·</span>
      </div>
    `).join('');

    // Lecture index section for batch documents
    let lectureIndexHtml = '';
    if (batchMeta && batchMeta.lectures.length > 0) {
      const lectureCards = batchMeta.lectures.map((lec) => `
        <div class="lecture-index-card">
          <span class="lecture-index-num">${lec.index}</span>
          <span class="lecture-index-title">${escapeHtml(lec.title)}</span>
        </div>
      `).join('');

      lectureIndexHtml = `
        <div style="margin-top:32px;">
          <div style="font-size:18px; font-weight:700; color:${palette.primary}; margin-bottom:12px;">
            ${isRTL ? '📚 فهرس المحاضرات' : '📚 Lecture Index'}
          </div>
          ${lectureCards}
        </div>
      `;
    }

    tocHtml = `
      <div class="toc-page" style="position:relative;">
        ${generateRainbowStrip(palette.decoColors)}
        <div class="toc-title">${isRTL ? 'فهرس المحتويات' : 'Table of Contents'}</div>
        ${generateTripleBar(palette.coverAccent, palette.coverAccent2 || palette.accent, palette.coverAccent3 || palette.accentWarm)}
        ${tocEntries}
        ${lectureIndexHtml}
      </div>
    `;
  } else if (batchMeta && batchMeta.lectures.length > 0) {
    // If no TOC sections but we have batch lectures, still show the lecture index
    const lectureCards = batchMeta.lectures.map((lec) => `
      <div class="lecture-index-card">
        <span class="lecture-index-num">${lec.index}</span>
        <span class="lecture-index-title">${escapeHtml(lec.title)}</span>
      </div>
    `).join('');

    tocHtml = `
      <div class="toc-page">
        <div class="toc-title">${isRTL ? '📚 فهرس المحاضرات' : '📚 Lecture Index'}</div>
        <div class="toc-accent-line"></div>
        ${lectureCards}
      </div>
    `;
  }

  // ─── Chart SVGs ────────────────────────────
  let chartsHtml = '';
  const allChartSpecs = [
    ...(designReasoning?.chartSpecs || []),
    ...(chartSpecs || []),
  ];

  if (allChartSpecs.length > 0) {
    chartsHtml = allChartSpecs.map((spec) => {
      const svg = generateChartSVG(spec, isRTL, palette);
      return `<div class="diagram-container">
        <div class="diagram-title">${escapeHtml(spec.title || (isRTL ? 'رسم بياني' : 'Chart'))}</div>
        ${spec.description ? `<div class="diagram-description">${escapeHtml(spec.description)}</div>` : ''}
        ${svg}
        <div class="diagram-label">${isRTL ? 'وصف الرسمة' : 'Diagram Description'}</div>
      </div>`;
    }).join('\n');
  }

  // ─── Content Sections ──────────────────────
  let sectionCounter = 0;

  const contentHtml = sections.map((section) => {
    let html = '<div class="content-page">';

    // Page header with rainbow strip (v4.0)
    html += generateRainbowStrip(palette.decoColors);
    html += `
      <div class="page-header-line"></div>
      <div class="page-header-text">DeltaAI | ${batchMeta?.channelName || 'بعقل هادي'}</div>
    `;

    // Check if this section heading matches a lecture title → insert divider
    if (section.heading && batchMeta) {
      const headingTrimmed = section.heading.trim();
      for (const lec of batchMeta.lectures) {
        if (headingTrimmed.includes(lec.title.trim()) || lec.title.trim().includes(headingTrimmed)) {
          html += `
            <div class="lecture-divider">
              <span class="lecture-divider-badge">
                ${isRTL ? 'المحاضرة' : 'Lecture'} <span class="lecture-num">${lec.index}</span>
              </span>
            </div>
          `;
          break;
        }
      }
    }

    if (section.heading) {
      sectionCounter++;
      // v4.0: Color-coded section with its own color from sectionColors
      const secColor = palette.sectionColors && palette.sectionColors.length > 0
        ? palette.sectionColors[(sectionCounter - 1) % palette.sectionColors.length]
        : null;
      if (secColor) {
        html += generateColorfulSectionHeader(section.heading, sectionCounter, secColor, isRTL);
        // Add section sidebar
        html += `<div style="position:absolute; top:7px; width:6px; height:85%; background:${secColor.header}; ${isRTL ? 'right:0' : 'left:0'};"></div>`;
        html += `<div style="position:absolute; top:7px; width:3px; height:60%; background:${secColor.accent}; ${isRTL ? 'right:6px' : 'left:6px'};"></div>`;
        // Add decorative dots
        html += generateDecoDots(palette.decoColors, 5);
      } else {
        html += `
          <div class="section-header">
            <h1>${escapeHtml(section.heading)}</h1>
            <span class="section-number">${sectionCounter}</span>
          </div>
        `;
      }
    }

    // Render content blocks
    // If we have a componentMap from DesignReasoning, use it to wrap sections
    const componentMap = designReasoning?.componentMap || [];
    const componentEntry = componentMap.find(
      (c) => c.contentSection === section.heading
    );

    // Render content blocks — auto-wrap consecutive 'feature' blocks in a features-table div
    const renderedBlocks: string[] = [];
    let featureGroup: string[] = [];

    const flushFeatureGroup = () => {
      if (featureGroup.length >= 2) {
        renderedBlocks.push(`<div class="features-table">${featureGroup.join('\n')}</div>`);
      } else if (featureGroup.length === 1) {
        renderedBlocks.push(featureGroup[0]);
      }
      featureGroup = [];
    };

    for (const block of section.content) {
      const blockHtml = renderBlock(block, language, palette);
      if (block.type === 'feature') {
        featureGroup.push(blockHtml);
      } else {
        flushFeatureGroup();
        renderedBlocks.push(blockHtml);
      }
    }
    flushFeatureGroup();

    const blocksHtml = renderedBlocks.join('\n');

    if (componentEntry) {
      html += `<div class="section-content">${renderComponentWrapper(
        componentEntry.componentType,
        blocksHtml,
        palette.primary,
        palette.accent,
        language,
      )}</div>`;
    } else {
      html += `<div class="section-content">${blocksHtml}</div>`;
    }

    // Insert charts after the first section if available
    if (sectionCounter === 1 && chartsHtml) {
      html += chartsHtml;
    }

    html += '</div>';
    return html;
  }).join('\n');

  // ─── Brand Integration ─────────────────────
  const brand = designReasoning?.brandIntegration;
  let brandWatermark = '';
  if (brand?.placement === 'watermark') {
    brandWatermark = `<div class="watermark">${escapeHtml(brand.slogan)}</div>`;
  }

  // ─── Assemble Full Document ─────────────────
  const fullHtml = `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${finalCSS}</style>
</head>
<body>
  ${brandWatermark}
  ${coverHtml}
  ${tocHtml}
  ${contentHtml}
</body>
</html>`;

  return fullHtml;
}

// ─── Image Opportunity Detection ─────────────────────────────────────────

/**
 * Keywords that indicate a section could benefit from an illustration.
 */
const IMAGE_OPPORTUNITY_KEYWORDS = [
  // Arabic keywords
  'مخطط', 'رسم', 'شكل', 'مبيان', 'تخطيط', 'هيكل', 'خريطة',
  'مخطط بياني', 'رسم بياني', 'رسم توضيحي', 'هيكل تنظيمي',
  'خريطة ذهنية', 'خريطة عقلية', 'خريطة مفاهيمية',
  // English keywords
  'diagram', 'chart', 'graph', 'figure', 'illustration',
  'flowchart', 'flow chart', 'schematic', 'blueprint',
  'infographic', 'drawing', 'wireframe', 'mockup',
  'mind map', 'venn', 'pie chart', 'bar chart', 'line graph',
];

/**
 * Scan markdown content for sections that could benefit from illustrations.
 * Returns an array of image prompts (one per section that needs an illustration).
 * Also generates a cover image prompt based on the document title.
 *
 * @param content - The markdown content to scan
 * @param title - The document title (used for cover image prompt)
 * @returns Array of image prompt strings
 */
export function detectImageOpportunities(content: string, title?: string): string[] {
  const prompts: string[] = [];

  // Generate a cover image prompt based on document title
  if (title) {
    prompts.push(`cover illustration for document titled: ${title}, professional, clean, elegant, academic style, high quality`);
  }

  // Split content into sections by headings
  const sectionRegex = /^#{1,3}\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const sectionList: { heading: string; fullText: string }[] = [];

  // Use the regex to reset lastIndex
  sectionRegex.lastIndex = 0;
  while ((match = sectionRegex.exec(content)) !== null) {
    sectionList.push({ heading: match[1], fullText: '' });
  }

  const lines = content.split('\n');
  let currentHeading = title || '';
  let currentText = '';

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (currentText.trim()) {
        sectionList.push({ heading: currentHeading, fullText: currentText.trim() });
      }
      currentHeading = headingMatch[1];
      currentText = '';
    } else {
      currentText += line + '\n';
    }
  }
  if (currentText.trim()) {
    sectionList.push({ heading: currentHeading, fullText: currentText.trim() });
  }

  // Check each section for image opportunity keywords
  for (const section of sectionList) {
    const lowerText = section.fullText.toLowerCase();
    const lowerHeading = section.heading.toLowerCase();

    const hasKeyword = IMAGE_OPPORTUNITY_KEYWORDS.some(
      (kw) => lowerText.includes(kw.toLowerCase()) || lowerHeading.includes(kw.toLowerCase())
    );

    if (hasKeyword) {
      // Build a prompt from the section heading and context
      const prompt = `illustration for section: ${section.heading}, professional, clean, academic style, educational diagram`;
      prompts.push(prompt);
    }
  }

  return prompts;
}
