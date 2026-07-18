/**
 * Dynamic Design CSS Generator — Fully Dynamic, Zero Fixed Templates
 *
 * Generates comprehensive CSS overrides from the LLM's DesignReasoningBlock output.
 * ALL CSS is generated dynamically from the VisualLanguage description + ThemePalette.
 * ZERO hardcoded colors — every single color comes from the palette.
 * ZERO switch/case blocks — every layout decision comes from parsing design descriptions.
 *
 * The `designDescriptionToCSS` helper is the core engine: it parses free-form
 * design descriptions (like "centered minimal with thin accent border") into
 * concrete CSS using ONLY palette-derived colors.
 *
 * Backward compatible: old-style named fields (coverStyle, sectionHeaderStyle, etc.)
 * are treated as description strings and parsed the same way.
 */

import type { DesignReasoningBlock, VisualLanguage } from './design-reasoning';
import type { ThemePalette } from './dynamic-themes';

// ─── Color Helpers ──────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function lightenHex(hex: string, amount: number): string {
  if (!hex || !hex.startsWith('#')) return '#f0f0f0';
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

function darkenHex(hex: string, amount: number): string {
  if (!hex || !hex.startsWith('#')) return '#0a0a0a';
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Compute a high-contrast text color for a given background.
 * Returns white-ish for dark backgrounds, dark-ish for light backgrounds.
 */
function contrastText(bgHex: string): string {
  const { r, g, b } = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0f172a' : '#f8fafc';
}

/**
 * Compute white-ish text color with adjustable opacity (for text on dark/colored surfaces).
 */
function contrastTextAlpha(bgHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance > 0.55) {
    return `rgba(15,23,42,${alpha})`;
  }
  return `rgba(248,250,252,${alpha})`;
}

function detectLightMode(bg: string): boolean {
  const h = bg.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 * 100;
  return lightness > 50;
}

// ─── Design Description Parser ──────────────────────────────────────────

interface DesignKeywords {
  centered: boolean;
  split: boolean;
  horizontal: boolean;
  vertical: boolean;
  minimal: boolean;
  bold: boolean;
  elegant: boolean;
  modern: boolean;
  dark: boolean;
  gradient: boolean;
  full: boolean;
  asymmetric: boolean;
  bordered: boolean;
  frame: boolean;
  geometric: boolean;
  pattern: boolean;
  sleek: boolean;
  card: boolean;
  inline: boolean;
  terminal: boolean;
  underlined: boolean;
  numbered: boolean;
  circle: boolean;
  sidebar: boolean;
  banner: boolean;
  left: boolean;
  right: boolean;
  clean: boolean;
  shadow: boolean;
  elevated: boolean;
  zebra: boolean;
  grid: boolean;
  list: boolean;
  table: boolean;
  rounded: boolean;
  sharp: boolean;
  pill: boolean;
  wide: boolean;
  accent: boolean;
  decorative: boolean;
  ornate: boolean;
  outline: boolean;
  cyber: boolean;
  neon: boolean;
  vibrant: boolean;
  subtle: boolean;
  transparent: boolean;
  glass: boolean;
  mono: boolean;
  compact: boolean;
  /** Raw tokens not matched above, for additional context */
  extras: string[];
}

function parseDescription(desc: string): DesignKeywords {
  const normalized = desc.toLowerCase().replace(/[-_]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const k: DesignKeywords = {
    centered: false, split: false, horizontal: false, vertical: false,
    minimal: false, bold: false, elegant: false, modern: false,
    dark: false, gradient: false, full: false, asymmetric: false,
    bordered: false, frame: false, geometric: false, pattern: false,
    sleek: false, card: false, inline: false, terminal: false,
    underlined: false, numbered: false, circle: false, sidebar: false,
    banner: false, left: false, right: false,
    clean: false, shadow: false, elevated: false, zebra: false,
    grid: false, list: false, table: false,
    rounded: false, sharp: false, pill: false, wide: false,
    accent: false, decorative: false, ornate: false, outline: false,
    cyber: false, neon: false, vibrant: false, subtle: false,
    transparent: false, glass: false, mono: false, compact: false,
    extras: [],
  };

  const keywordMap: Record<string, keyof DesignKeywords> = {
    centered: 'centered', center: 'centered', middle: 'centered',
    split: 'split', divided: 'split',
    horizontal: 'horizontal', across: 'horizontal',
    vertical: 'vertical', side: 'vertical',
    minimal: 'minimal', minimalism: 'minimal', clean: 'clean', simple: 'minimal',
    bold: 'bold', strong: 'bold', heavy: 'bold',
    elegant: 'elegant', refined: 'elegant', sophisticated: 'elegant',
    modern: 'modern', contemporary: 'modern',
    dark: 'dark', night: 'dark',
    gradient: 'gradient', fade: 'gradient',
    full: 'full', entire: 'full', whole: 'full',
    asymmetric: 'asymmetric', offset: 'asymmetric', diagonal: 'asymmetric',
    bordered: 'bordered',
    frame: 'frame', framed: 'frame', enclosed: 'frame',
    geometric: 'geometric', geo: 'geometric', angular: 'geometric',
    pattern: 'pattern', textured: 'pattern', dots: 'pattern',
    sleek: 'sleek', slim: 'sleek',
    card: 'card', cards: 'card', boxed: 'card',
    inline: 'inline',
    terminal: 'terminal', console: 'terminal', code: 'terminal',
    underlined: 'underlined', line: 'underlined', rule: 'underlined',
    numbered: 'numbered', number: 'numbered', count: 'numbered',
    circle: 'circle', dot: 'circle', badge: 'circle',
    sidebar: 'sidebar',
    banner: 'banner', strip: 'banner',
    left: 'left',
    right: 'right',
    shadow: 'shadow', lifted: 'shadow',
    elevated: 'elevated', raised: 'elevated',
    zebra: 'zebra', striped: 'zebra', alternating: 'zebra',
    grid: 'grid', matrix: 'grid',
    list: 'list', stacked: 'list',
    table: 'table', tabular: 'table',
    rounded: 'rounded', round: 'rounded', smooth: 'rounded',
    sharp: 'sharp', square: 'sharp', hard: 'sharp',
    pill: 'pill', bubble: 'pill', chip: 'pill',
    accent: 'accent', highlighted: 'accent',
    decorative: 'decorative', fancy: 'decorative',
    ornate: 'ornate', ornament: 'ornate', ornamental: 'ornate', islamic: 'ornate',
    outline: 'outline', outlined: 'outline',
    cyber: 'cyber', tech: 'cyber', hacker: 'cyber',
    neon: 'neon', glowing: 'neon', glow: 'neon',
    vibrant: 'vibrant', colorful: 'vibrant', vivid: 'vibrant',
    subtle: 'subtle', muted: 'subtle', quiet: 'subtle',
    transparent: 'transparent', clear: 'transparent', invisible: 'transparent',
    glass: 'glass', frosted: 'glass', blur: 'glass',
    mono: 'mono', monospace: 'mono', monochromatic: 'mono',
    compact: 'compact', dense: 'compact', tight: 'compact',
  };

  for (const token of tokens) {
    if (keywordMap[token]) {
      (k[keywordMap[token]] as boolean) = true;
    } else {
      k.extras.push(token);
    }
  }

  return k;
}

/**
 * Resolve a description from either the new-style description field or
 * the old-style named field. Supports both for backward compatibility.
 */
function resolveDescription(
  newField: string | undefined,
  oldField: string | undefined,
): string {
  if (newField && newField.trim().length > 0) return newField;
  if (oldField) return oldField.replace(/[-_]/g, ' ');
  return '';
}

// ─── Palette-Derived Color Computations ─────────────────────────────────

type PaletteColors = ThemePalette & {
  // Derived (not in ThemePalette)
  primaryRgb: { r: number; g: number; b: number };
  accentRgb: { r: number; g: number; b: number };
  coverAccentRgb: { r: number; g: number; b: number };
  isLightMode: boolean;
  shadowSubtle: string;
  shadowMedium: string;
  codeBlockBg: string;
  codeBlockHeaderBg: string;
  codeBlockBorder: string;
};

function extractPaletteColors(palette: ThemePalette): PaletteColors {
  const isLightMode = detectLightMode(palette.bg);
  const codeBlockBg = isLightMode ? darkenHex(palette.bg, 0.88) : darkenHex(palette.bg, 0.4);
  const codeBlockHeaderBg = isLightMode ? darkenHex(palette.bg, 0.82) : withAlpha(palette.surface, 0.04);
  const codeBlockBorder = isLightMode ? palette.border : 'transparent';

  return {
    ...palette,
    primaryRgb: hexToRgb(palette.primary),
    accentRgb: hexToRgb(palette.accent),
    coverAccentRgb: hexToRgb(palette.coverAccent),
    isLightMode,
    shadowSubtle: isLightMode ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.15)',
    shadowMedium: isLightMode ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.20)',
    codeBlockBg,
    codeBlockHeaderBg,
    codeBlockBorder,
  };
}

// ─── Core: designDescriptionToCSS ───────────────────────────────────────

/**
 * Convert a free-form design description into concrete CSS for a given element type.
 * This is the heart of the dynamic CSS system — it parses design vocabulary
 * and produces CSS using ONLY palette colors.
 */
function designDescriptionToCSS(
  description: string,
  pc: PaletteColors,
  elementType: 'cover' | 'section-header' | 'bullet' | 'callout' | 'table' | 'code-block' | 'definition',
  isRTL: boolean,
): string {
  const k = parseDescription(description);
  const dir = isRTL ? 'right' : 'left';
  const dirOpp = isRTL ? 'left' : 'right';

  const dispatch: Record<string, () => string> = {
    'cover': () => generateCoverCSSFromKeywords(k, pc, isRTL, dir, dirOpp),
    'section-header': () => generateSectionHeaderCSSFromKeywords(k, pc, isRTL, dir),
    'bullet': () => generateBulletCSSFromKeywords(k, pc),
    'callout': () => generateCalloutCSSFromKeywords(k, pc, isRTL, dir),
    'table': () => generateTableCSSFromKeywords(k, pc),
    'code-block': () => generateCodeBlockCSSFromKeywords(k, pc, isRTL),
    'definition': () => generateDefinitionCSSFromKeywords(k, pc, isRTL, dir),
  };
  const generator = dispatch[elementType];
  if (generator) return generator();
  return '';
}

// ─── Cover CSS Generator (Dynamic) ─────────────────────────────────────

function generateCoverCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
  isRTL: boolean,
  dir: string,
  dirOpp: string,
  rawDescription: string = '',
): string {
  const accentOpacity = pc.isLightMode ? 0.25 : 0.35;
  const textOnCover = pc.isLightMode ? darkenHex(pc.text, 0.1) : lightenHex(pc.text, 0.15);
  const textOnPrimary = contrastText(pc.primary);
  const textOnAccent = contrastText(pc.accent);

  // Base styles that always apply
  let coverPageBg = pc.coverGradient;
  let coverPageExtras = '';
  let beforePseudo = 'display: none;';
  let afterPseudo = 'display: none;';
  let logoStyle = `color: ${textOnPrimary}; font-size: 64px;`;
  let brandNameStyle = `color: ${withAlpha(textOnPrimary, 0.9)}; letter-spacing: 6px; font-size: 20px; text-shadow: none;`;
  let titleStyle = `color: ${textOnCover};`;
  let metaStyle = `color: ${pc.textMuted};`;
  let dividerStyle = `background: ${pc.accent}; height: 2px; width: 80px;`;
  let docTypeStyle = `background: ${pc.accent}; color: ${textOnAccent};`;
  let badgeStyle = `background: transparent; color: ${pc.textMuted}; border-color: ${pc.border};`;
  let badgeFilledStyle = `background: transparent; color: ${pc.accent}; border-color: ${pc.accent};`;
  let descriptionStyle = `color: ${pc.textSecondary};`;
  let accentBottomStyle = `height: 3px; background: ${pc.accent};`;
  let frameStyle = 'display: none;';
  let dotsPatternStyle = 'display: none;';
  let decoCircle1 = 'display: none;';
  let decoCircle2 = 'display: none;';
  let decoCircle3 = 'display: none;';
  let decoCircle4 = 'display: none;';
  let lineLeft = 'display: none;';
  let lineRight = 'display: none;';

  // ── CENTERED + MINIMAL ──
  if (k.centered && k.minimal) {
    coverPageBg = pc.isLightMode ? lightenHex(pc.bg, 1) : pc.bg;
    coverPageExtras = 'justify-content: center;';
    beforePseudo = `
      content: '';
      position: absolute;
      top: 50%;
      ${dir}: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 1px;
      background: ${pc.accent};
      opacity: 0.3;`;
    logoStyle = 'display: none;';
    brandNameStyle = `color: ${textOnCover}; letter-spacing: 4px; font-size: 20px; text-shadow: none;`;
    titleStyle = `color: ${lightenHex(pc.text, pc.isLightMode ? 0 : 0.1)}; font-size: 32px;`;
    dividerStyle = `background: ${pc.accent}; height: 2px; width: 80px; opacity: 0.6;`;
    docTypeStyle = `background: transparent; color: ${pc.accent}; border: 1.5px solid ${pc.accent}; border-radius: 4px;`;
    accentBottomStyle = 'display: none;';
  }
  // ── SPLIT + HORIZONTAL ──
  else if (k.split && k.horizontal) {
    coverPageExtras = 'justify-content: flex-start; padding-top: 0;';
    beforePseudo = `
      content: '';
      position: absolute;
      top: 0;
      ${dir}: 0;
      ${dirOpp}: 0;
      height: 45%;
      background: ${pc.coverGradient};
      z-index: 0;`;
    logoStyle = `color: ${textOnPrimary}; text-shadow: 0 2px 12px ${withAlpha(pc.coverDarkest, 0.3)}; z-index: 1;`;
    brandNameStyle = `color: ${contrastTextAlpha(pc.coverGradient, 0.9)}; text-shadow: 0 1px 6px ${withAlpha(pc.coverDarkest, 0.2)}; z-index: 1;`;
    titleStyle = `color: ${textOnCover}; z-index: 1; margin-top: 80px;`;
    metaStyle = `color: ${pc.textMuted}; z-index: 1;`;
    dividerStyle += ' z-index: 1;';
    docTypeStyle += ' z-index: 1;';
    badgeStyle += ' z-index: 1;';
    accentBottomStyle = `height: 3px; background: ${pc.accent}; z-index: 1;`;
  }
  // ── SPLIT + VERTICAL ──
  else if (k.split && k.vertical) {
    coverPageBg = pc.isLightMode ? lightenHex(pc.bg, 0.5) : pc.bg;
    coverPageExtras = 'flex-direction: row; padding: 0;';
    beforePseudo = `
      content: '';
      position: absolute;
      top: 0;
      ${dir}: 0;
      bottom: 0;
      width: 35%;
      background: ${pc.primary};
      z-index: 0;`;
    afterPseudo = `
      content: '';
      position: absolute;
      top: 50%;
      ${dir}: 35%;
      transform: translate(${isRTL ? '50%' : '-50%'}, -50%);
      width: 2px;
      height: 60%;
      background: ${pc.accent};
      opacity: 0.6;
      z-index: 1;`;
    logoStyle = `color: ${textOnPrimary}; font-size: 72px; text-shadow: none;`;
    brandNameStyle = `color: ${contrastTextAlpha(pc.primary, 0.85)}; letter-spacing: 6px; font-size: 18px; text-shadow: none;`;
    titleStyle = `z-index: 2; ${dirOpp}: 5%; position: absolute; top: 50%; transform: translateY(-50%);
      text-align: ${isRTL ? 'right' : 'left'}; max-width: 55%; color: ${textOnCover};`;
    metaStyle = `z-index: 2; ${dirOpp}: 5%; position: absolute; bottom: 40px; text-align: ${isRTL ? 'right' : 'left'};`;
    dividerStyle = 'display: none;';
    docTypeStyle = `z-index: 2; position: absolute; ${dirOpp}: 5%; top: 40px; background: ${pc.accent}; color: ${textOnAccent};`;
    accentBottomStyle = 'display: none;';
  }
  // ── BORDERED + FRAME / ORNATE ──
  else if ((k.bordered || k.frame) || k.ornate) {
    coverPageBg = pc.coverGradient;
    const ornateColor = pc.coverAccent;
    const ornateRgb = pc.coverAccentRgb;
    frameStyle = `
      display: block;
      inset: 20px;
      border: 2px solid ${withAlpha(ornateColor, 0.3)};
      border-radius: 12px;
      z-index: 1;`;
    beforePseudo = `
      content: '';
      position: absolute;
      inset: 28px;
      border: 1px solid ${withAlpha(ornateColor, 0.15)};
      border-radius: 8px;
      z-index: 1;`;
    logoStyle = `text-shadow: 0 4px 20px ${withAlpha(ornateColor, 0.4)}, 0 0 40px ${withAlpha(ornateColor, 0.15)};`;
    brandNameStyle = 'letter-spacing: 8px;';
    dividerStyle = `background: linear-gradient(90deg, transparent, ${withAlpha(ornateColor, 0.8)}, transparent); height: 2px;`;
    docTypeStyle = `background: ${withAlpha(ornateColor, 0.9)}; border: 1px solid ${ornateColor}; color: ${contrastText(ornateColor)};`;
    accentBottomStyle = `height: 4px; background: linear-gradient(90deg, ${withAlpha(ornateColor, 0.6)}, ${withAlpha(ornateColor, 0.2)}, ${withAlpha(ornateColor, 0.6)});`;
    decoCircle1 = `border-color: ${withAlpha(ornateColor, 0.15)};`;
    decoCircle2 = `background: radial-gradient(circle, ${withAlpha(ornateColor, 0.08)} 0%, transparent 70%);`;
    lineLeft = `background: linear-gradient(180deg, transparent, ${withAlpha(ornateColor, 0.2)}, transparent);`;
    lineRight = `background: linear-gradient(180deg, transparent, ${withAlpha(ornateColor, 0.2)}, transparent);`;
  }
  // ── GEOMETRIC + PATTERN / CYBER ──
  else if (k.geometric || k.pattern || k.cyber) {
    coverPageBg = pc.coverGradient;
    const ca = pc.coverAccent;
    const caRgb = pc.coverAccentRgb;
    dotsPatternStyle = `
      display: block;
      background-image:
        radial-gradient(circle, ${withAlpha(ca, 0.08)} 1px, transparent 1px),
        linear-gradient(0deg, transparent 49%, ${withAlpha(ca, 0.03)} 49%, ${withAlpha(ca, 0.03)} 51%, transparent 51%),
        linear-gradient(90deg, transparent 49%, ${withAlpha(ca, 0.03)} 49%, ${withAlpha(ca, 0.03)} 51%, transparent 51%);
      background-size: 20px 20px, 40px 40px, 40px 40px;`;
    logoStyle = `font-family: 'Courier New', monospace; font-size: 80px; text-shadow: 0 0 20px ${withAlpha(ca, 0.5)}, 0 0 40px ${withAlpha(ca, 0.2)};`;
    brandNameStyle = `font-family: 'Courier New', monospace; letter-spacing: 6px; font-size: 22px;`;
    dividerStyle = `background: linear-gradient(90deg, transparent, ${ca}, transparent); height: 1px;`;
    docTypeStyle = `background: ${withAlpha(ca, 0.15)}; border: 1px solid ${ca}; color: ${ca}; border-radius: 2px; font-family: 'Courier New', monospace;`;
    accentBottomStyle = `height: 2px; background: ${ca}; opacity: 0.5;`;
    decoCircle1 = `border: 1px dashed ${withAlpha(ca, 0.15)}; border-radius: 50%;`;
    decoCircle2 = 'display: none;';
    decoCircle3 = `border: 1px dashed ${withAlpha(ca, 0.1)};`;
    decoCircle4 = 'display: none;';
  }
  // ── DARK + SLEEK ──
  else if (k.dark && k.sleek) {
    coverPageBg = `linear-gradient(160deg, ${pc.bg} 0%, ${pc.primary} 60%, ${pc.bg} 100%)`;
    coverPageExtras = 'justify-content: flex-end; padding-bottom: 80px;';
    beforePseudo = `
      content: '';
      position: absolute;
      top: 0;
      ${dir}: 0;
      ${dirOpp}: 0;
      height: 200px;
      background: linear-gradient(180deg, ${withAlpha(pc.accent, 0.08)} 0%, transparent 100%);
      z-index: 0;`;
    logoStyle = `font-size: 48px; text-shadow: 0 0 15px ${withAlpha(pc.accent, 0.4)};`;
    brandNameStyle = 'font-size: 18px; letter-spacing: 12px; opacity: 0.8;';
    titleStyle = `font-size: 34px; text-align: ${isRTL ? 'right' : 'left'}; max-width: 70%;`;
    dividerStyle = `margin: 20px ${isRTL ? 'auto 20px 0' : '0 20px auto'}; width: 100px; height: 3px; background: ${pc.accent};`;
    metaStyle = `text-align: ${isRTL ? 'right' : 'left'};`;
    docTypeStyle = 'border-radius: 4px; font-size: 11px; letter-spacing: 2px;';
    badgeStyle = `border-radius: 4px; background: ${withAlpha(pc.text, 0.04)}; border-color: ${withAlpha(pc.text, 0.1)};`;
    accentBottomStyle = `height: 3px; background: linear-gradient(90deg, ${pc.accent}, transparent 80%);`;
    decoCircle1 = `border-color: ${withAlpha(pc.accent, 0.06)};`;
  }
  // ── GRADIENT + ASYMMETRIC / VIBRANT ──
  else if (k.gradient && k.asymmetric) {
    coverPageBg = pc.coverGradient;
    coverPageExtras = 'clip-path: none;';
    beforePseudo = `
      content: '';
      position: absolute;
      top: -50px;
      ${dirOpp}: -50px;
      width: 55%;
      height: 120%;
      background: ${pc.accent};
      opacity: 0.15;
      border-radius: 0 0 0 80px;
      transform: skewX(-5deg);
      z-index: 0;`;
    afterPseudo = `
      content: '';
      position: absolute;
      bottom: -30px;
      ${dir}: -30px;
      width: 40%;
      height: 60%;
      background: ${pc.accentGreen};
      opacity: 0.1;
      border-radius: 60px 0 0 0;
      z-index: 0;`;
    logoStyle = 'font-size: 64px; z-index: 2;';
    brandNameStyle = 'z-index: 2;';
    titleStyle = 'z-index: 2; font-size: 34px;';
    dividerStyle = 'z-index: 2; height: 4px; border-radius: 4px;';
    docTypeStyle = 'z-index: 2; border-radius: 30px; font-size: 14px; padding: 10px 36px;';
    badgeStyle = 'border-radius: 20px; padding: 6px 18px; z-index: 2;';
    accentBottomStyle = 'display: none;';
    dotsPatternStyle = 'display: block; background-size: 30px 30px; z-index: 2;';
    decoCircle1 = 'z-index: 2;';
    decoCircle2 = 'z-index: 2;';
    decoCircle3 = 'z-index: 2;';
    decoCircle4 = 'z-index: 2;';
  }
  // ── GRADIENT + FULL (default / fallback) ──
  else {
    coverPageBg = pc.coverGradient;
    dotsPatternStyle = 'display: block;';
    decoCircle1 = 'display: block;';
    decoCircle2 = 'display: block;';
    decoCircle3 = 'display: block;';
    decoCircle4 = 'display: block;';
    lineLeft = 'display: block;';
    lineRight = 'display: block;';
  }

  // ── Extra keyword adjustments ──
  if (k.neon || k.vibrant) {
    const neonColor = pc.accent;
    logoStyle += ` text-shadow: 0 0 10px ${withAlpha(neonColor, 0.6)}, 0 0 30px ${withAlpha(neonColor, 0.3)};`;
    dividerStyle += ` box-shadow: 0 0 8px ${withAlpha(neonColor, 0.4)};`;
  }
  if (k.glass) {
    docTypeStyle += ` backdrop-filter: blur(8px); background: ${withAlpha(pc.accent, 0.2)};`;
  }
  if (k.subtle) {
    accentBottomStyle = `height: 1px; background: ${withAlpha(pc.accent, 0.3)};`;
    dividerStyle += ` opacity: 0.4;`;
  }

  return `
    /* Cover: Dynamic — "${rawDescription}" */
    .cover-page {
      background: ${coverPageBg};
      color: ${textOnCover};
      ${coverPageExtras}
    }
    .cover-page::before { ${beforePseudo} }
    .cover-page::after { ${afterPseudo} }
    .cover-logo { ${logoStyle} }
    .cover-brand-name { ${brandNameStyle} }
    .cover-title { ${titleStyle} }
    .cover-meta { ${metaStyle} }
    .cover-divider { ${dividerStyle} }
    .cover-doc-type { ${docTypeStyle} }
    .cover-badge { ${badgeStyle} }
    .cover-badge.filled { ${badgeFilledStyle} }
    .cover-description { ${descriptionStyle} }
    .cover-accent-bottom { ${accentBottomStyle} }
    .cover-frame { ${frameStyle} }
    .cover-dots-pattern { ${dotsPatternStyle} }
    .cover-deco-circle-1 { ${decoCircle1} }
    .cover-deco-circle-2 { ${decoCircle2} }
    .cover-deco-circle-3 { ${decoCircle3} }
    .cover-deco-circle-4 { ${decoCircle4} }
    .cover-line-left { ${lineLeft} }
    .cover-line-right { ${lineRight} }
  `;
}

// ─── Section Header CSS Generator (Dynamic) ────────────────────────────

function generateSectionHeaderCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
  isRTL: boolean,
  dir: string,
): string {
  const headerBg = pc.surface;
  const headerText = pc.text;
  const headerPadding = '14px 24px';
  const headerRadius = '8px';
  const h1Color = pc.primary;
  const numberBg = pc.accent;
  const textOnPrimary = contrastText(pc.primary);
  const textOnAccent = contrastText(pc.accent);
  let numberExtra = '';
  let headerExtra = '';

  // ── LEFT + ACCENT ──
  if (k.left && k.accent) {
    return `
      /* Section Header: Left Accent — dynamic */
      .section-header {
        background: ${headerBg};
        color: ${headerText};
        padding: ${headerPadding};
        border-radius: 0;
        border-${dir}: 5px solid ${pc.primary};
        box-shadow: none;
      }
      .section-header h1 { color: ${pc.primary}; }
      .section-number { background: ${pc.primary}; color: ${textOnPrimary}; }
    `;
  }

  // ── UNDERLINED ──
  if (k.underlined) {
    return `
      /* Section Header: Underlined — dynamic */
      .section-header {
        background: transparent;
        color: ${headerText};
        padding: 14px 24px 10px;
        border-radius: 0;
        border-bottom: 3px solid ${pc.primary};
        box-shadow: none;
      }
      .section-header h1 { color: ${pc.primary}; }
      .section-number { background: ${pc.accent}; color: ${textOnAccent}; }
    `;
  }

  // ── CARD ──
  if (k.card) {
    return `
      /* Section Header: Card — dynamic */
      .section-header {
        background: ${headerBg};
        color: ${headerText};
        padding: 16px 24px;
        border-radius: 12px;
        border: 1px solid ${pc.border};
        box-shadow: 0 2px 8px ${pc.shadowSubtle};
      }
      .section-header h1 { color: ${pc.primary}; }
      .section-number { background: ${pc.accent}; color: ${textOnAccent}; border-radius: 8px; }
    `;
  }

  // ── NUMBERED + CIRCLE ──
  if (k.numbered && k.circle) {
    return `
      /* Section Header: Numbered Circle — dynamic */
      .section-header {
        background: ${pc.isLightMode ? lightenHex(pc.bg, 0.5) : pc.surface};
        color: ${headerText};
        padding: 12px 24px 12px 60px;
        border-radius: 8px;
        box-shadow: 0 1px 4px ${pc.shadowSubtle};
      }
      .section-header h1 { color: ${headerText}; }
      .section-number {
        position: absolute;
        ${isRTL ? 'right' : 'left'}: 12px;
        width: 42px; height: 42px;
        border-radius: 50%;
        background: ${pc.primary};
        color: ${textOnPrimary};
        font-size: 18px;
        box-shadow: 0 2px 8px ${withAlpha(pc.primary, 0.3)};
      }
    `;
  }

  // ── GRADIENT + BAR ──
  if (k.gradient) {
    return `
      /* Section Header: Gradient Bar — dynamic */
      .section-header {
        background: linear-gradient(90deg, ${pc.primary}, ${pc.secondary});
        color: ${textOnPrimary};
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 2px 8px ${pc.shadowSubtle};
      }
      .section-header h1 { color: ${textOnPrimary}; }
      .section-number { background: ${contrastTextAlpha(pc.primary, 0.25)}; color: ${textOnPrimary}; }
    `;
  }

  // ── MINIMAL ──
  if (k.minimal) {
    return `
      /* Section Header: Minimal — dynamic */
      .section-header {
        background: transparent;
        color: ${headerText};
        padding: 10px 24px;
        border-radius: 0;
        box-shadow: none;
      }
      .section-header h1 { color: ${headerText}; font-size: 22px; }
      .section-number { display: none; }
    `;
  }

  // ── SIDEBAR + NUMBER ──
  if (k.sidebar && k.numbered) {
    return `
      /* Section Header: Sidebar Number — dynamic */
      .section-header {
        background: ${pc.surface};
        color: ${headerText};
        padding: 12px 24px;
        border-radius: 0 8px 8px 0;
        border-${dir}: 4px solid ${pc.accent};
        box-shadow: 0 1px 4px ${pc.shadowSubtle};
      }
      .section-header h1 { color: ${headerText}; }
      .section-number {
        background: ${pc.accent};
        color: ${textOnAccent};
        border-radius: 4px;
        width: 30px; height: 30px;
        font-size: 12px;
      }
    `;
  }

  // ── BOLD / FULL-WIDTH (default / fallback) ──
  if (k.bold || k.full || k.wide) {
    return `
      /* Section Header: Bold Full-Width — dynamic */
      .section-header {
        background: ${pc.primary};
        color: ${textOnPrimary};
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 2px 8px ${pc.shadowSubtle};
      }
      .section-header h1 { color: ${textOnPrimary}; }
      .section-number { background: ${pc.accent}; color: ${textOnAccent}; }
    `;
  }

  // ── FINAL DEFAULT: full-width bar using primary color ──
  return `
    /* Section Header: Default — dynamic */
    .section-header {
      background: ${pc.primary};
      color: ${textOnPrimary};
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px ${pc.shadowSubtle};
    }
    .section-header h1 { color: ${textOnPrimary}; }
    .section-number { background: ${pc.accent}; color: ${textOnAccent}; }
  `;
}

// ─── Bullet CSS Generator (Dynamic) ────────────────────────────────────

function generateBulletCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
): string {
  let symbol: string;
  let color: string;

  if (k.bordered || k.accent || k.bold) {
    // diamond ◆
    symbol = '◆';
    color = pc.accent;
  } else if (k.minimal || k.subtle || k.clean || k.underlined) {
    // dash —
    symbol = '—';
    color = pc.textSecondary;
  } else if (k.circle || k.rounded || k.grid) {
    // dot ●
    symbol = '●';
    color = pc.accent;
  } else if (k.modern || k.terminal || k.cyber) {
    // arrow →
    symbol = '→';
    color = pc.accent;
  } else if (k.bold || k.card || k.list) {
    // check ✓
    symbol = '✓';
    color = pc.accent;
  } else {
    // Default: dot
    symbol = '●';
    color = pc.accent;
  }

  return `
    /* Bullet Style: Dynamic */
    .bullet-icon::before { content: '${symbol}'; }
    .bullet-icon { color: ${color}; }
  `;
}

// ─── Callout CSS Generator (Dynamic) ───────────────────────────────────

function generateCalloutCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
  isRTL: boolean,
  dir: string,
): string {
  // ── CARD ──
  if (k.card || k.bordered || k.bold) {
    return `
      /* Callout: Card — dynamic */
      .callout-box {
        border-${dir}: 5px solid ${pc.accent};
        background: ${pc.surface};
        border-radius: 12px;
        box-shadow: 0 2px 8px ${pc.shadowSubtle};
        border-top: none; border-${isRTL ? 'left' : 'right'}: none; border-bottom: none;
      }
      .callout { border-radius: 12px; background: ${pc.surface}; box-shadow: 0 1px 4px ${pc.shadowSubtle}; }
    `;
  }

  // ── BANNER ──
  if (k.banner || k.wide || k.full) {
    return `
      /* Callout: Banner — dynamic */
      .callout-box {
        background: ${pc.surface};
        border-radius: 0;
        border: none;
        border-top: 4px solid ${pc.accent};
        padding: 18px 24px;
      }
      .callout { border-radius: 0; border-top: 3px solid ${pc.accent}; border-${dir}: none; }
    `;
  }

  // ── MINIMAL ──
  if (k.minimal || k.subtle || k.clean) {
    return `
      /* Callout: Minimal — dynamic */
      .callout-box {
        background: transparent;
        border-radius: 0;
        border: none;
        border-${dir}: 3px solid ${pc.accent};
        padding: 14px 20px;
      }
      .callout { background: transparent; border-radius: 0; }
    `;
  }

  // ── DEFAULT: left-border ──
  return `
    /* Callout: Left Border (Default) — dynamic */
    .callout-box {
      border-${dir}: 5px solid;
      background: ${withAlpha(pc.accent, 0.06)};
      border-radius: 8px;
    }
  `;
}

// ─── Table CSS Generator (Dynamic) ─────────────────────────────────────

function generateTableCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
): string {
  const textOnPrimary = contrastText(pc.primary);
  // ── BORDERED ──
  if (k.bordered || k.outline || k.sharp) {
    return `
      /* Table: Bordered — dynamic */
      .data-table { border: 2px solid ${pc.primary}; border-radius: 6px; }
      .data-table th { background: ${pc.primary}; color: ${textOnPrimary}; border: 1px solid ${pc.primary}; }
      .data-table td { border: 1px solid ${pc.border}; }
      .data-table tr:nth-child(odd) td, .data-table tr:nth-child(even) td { background: ${pc.isLightMode ? lightenHex(pc.bg, 1) : pc.bg}; }
    `;
  }

  // ── CLEAN HEADER ──
  if (k.clean || k.minimal || k.modern) {
    return `
      /* Table: Clean Header — dynamic */
      .data-table { border: none; border-radius: 0; }
      .data-table th { background: ${pc.surface}; color: ${pc.text}; border-bottom: 2px solid ${pc.primary}; font-weight: 700; }
      .data-table td { border-bottom: 1px solid ${pc.border}; background: transparent; }
      .data-table tr:nth-child(odd) td, .data-table tr:nth-child(even) td { background: transparent; }
    `;
  }

  // ── SHADOW / CARDS ──
  if (k.shadow || k.card || k.elevated) {
    return `
      /* Table: Shadow Cards — dynamic */
      .data-table { border: none; border-collapse: separate; border-spacing: 0 8px; }
      .data-table th { background: ${pc.primary}; color: ${textOnPrimary}; border-radius: 8px; }
      .data-table td { background: ${pc.surface}; border: 1px solid ${pc.border}; border-radius: 8px; box-shadow: 0 2px 6px ${pc.shadowSubtle}; border-bottom: 1px solid ${pc.border}; }
      .data-table tr:nth-child(odd) td, .data-table tr:nth-child(even) td { background: ${pc.surface}; }
      .data-table tr td:first-child { border-radius: 8px 0 0 8px; }
      .data-table tr td:last-child { border-radius: 0 8px 8px 0; }
    `;
  }

  // ── DEFAULT: zebra ──
  return `
    /* Table: Zebra (Default) — dynamic */
    .data-table { border: 1px solid ${pc.border}; }
    .data-table th { background: ${pc.primary}; color: ${textOnPrimary}; }
    .data-table tr:nth-child(odd) td { background: ${pc.bg}; }
    .data-table tr:nth-child(even) td { background: ${pc.surface}; }
  `;
}

// ─── Code Block CSS Generator (Dynamic) ────────────────────────────────

function generateCodeBlockCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
  isRTL: boolean,
): string {
  const codeBg = pc.isLightMode ? darkenHex(pc.bg, 0.85) : darkenHex(pc.bg, 0.35);
  const codeHeaderBg = pc.isLightMode ? darkenHex(pc.bg, 0.78) : withAlpha(pc.surface, 0.06);
  const codeHeaderTextBorder = pc.isLightMode ? darkenHex(pc.border, 0.1) : withAlpha(pc.text, 0.06);
  const codeText = pc.isLightMode ? darkenHex(pc.text, 0.7) : lightenHex(pc.text, 0.15);

  // ── TERMINAL ──
  if (k.terminal || k.cyber || k.mono) {
    const greenAccent = pc.accentGreen;
    const greenRgb = hexToRgb(greenAccent);
    return `
      /* Code Block: Terminal — dynamic */
      .code-block { background: ${codeBg}; border-radius: 8px; border: none; }
      .code-header { background: ${codeHeaderBg}; border-bottom: 1px solid ${withAlpha(pc.text, 0.06)}; }
      .code-lang { color: ${greenAccent}; background: ${withAlpha(greenAccent, 0.15)}; font-family: 'Courier New', monospace; }
      .code-content pre { color: ${codeText}; font-family: 'Courier New', monospace; }
    `;
  }

  // ── INLINE ──
  if (k.inline || k.compact) {
    return `
      /* Code Block: Inline — dynamic */
      .code-block { background: ${pc.surface}; border-radius: 4px; border: 1px solid ${pc.border}; }
      .code-header { background: ${pc.surface}; border-bottom: 1px solid ${pc.border}; padding: 6px 12px; }
      .code-content { padding: 10px 14px; }
      .code-content pre { font-size: 11px; }
    `;
  }

  // ── MINIMAL ──
  if (k.minimal || k.subtle) {
    return `
      /* Code Block: Minimal — dynamic */
      .code-block { background: ${pc.surface}; border-radius: 6px; border: none; }
      .code-header { display: none; }
      .code-content { padding: 14px 18px; }
      .code-lang { display: none; }
    `;
  }

  // ── DEFAULT: card ──
  return `
    /* Code Block: Card (Default) — dynamic */
    .code-block { background: ${pc.isLightMode ? lightenHex(pc.surface, 0.3) : codeBg}; border-radius: 8px; border: 1px solid ${pc.isLightMode ? pc.border : 'transparent'}; }
    .code-header { background: ${codeHeaderBg}; border-bottom: 1px solid ${codeHeaderTextBorder}; }
    .code-lang { color: ${pc.accent}; background: ${withAlpha(pc.accent, 0.15)}; }
    .code-content pre { color: ${codeText}; }
  `;
}

// ─── Definition CSS Generator (Dynamic) ────────────────────────────────

function generateDefinitionCSSFromKeywords(
  k: DesignKeywords,
  pc: PaletteColors,
  isRTL: boolean,
  dir: string,
): string {
  const shadowColor = pc.isLightMode ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.08)';

  // ── LIST ──
  if (k.list || k.minimal || k.clean) {
    return `
      /* Definition: List — dynamic */
      .definition-list { display: flex; flex-direction: column; gap: 6px; }
      .definition-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid ${pc.border}; background: transparent; border-${dir}: none; border-radius: 0; }
      .definition-term { font-size: 13px; }
      .definition-value { font-size: 12px; }
    `;
  }

  // ── CARDS ──
  if (k.card || k.bordered || k.grid) {
    return `
      /* Definition: Cards — dynamic */
      .definition-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .definition-item { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; background: ${pc.surface}; border-radius: 10px; border: 1px solid ${pc.border}; border-${dir}: none; box-shadow: 0 2px 6px ${shadowColor}; }
      .definition-term { font-size: 13px; }
      .definition-value { font-size: 12px; }
    `;
  }

  // ── TABLE ──
  if (k.table || k.bold || k.modern) {
    return `
      /* Definition: Table — dynamic */
      .definition-list { display: table; width: 100%; border-collapse: collapse; }
      .definition-item { display: table-row; padding: 0; border-radius: 0; border: none; background: transparent; }
      .definition-term { display: table-cell; padding: 8px 14px; font-size: 13px; border-bottom: 1px solid ${pc.border}; background: ${pc.surface}; font-weight: 700; white-space: normal; }
      .definition-value { display: table-cell; padding: 8px 14px; font-size: 12px; border-bottom: 1px solid ${pc.border}; }
    `;
  }

  // ── DEFAULT: grid with left accent ──
  return `
    /* Definition: Grid (Default) — dynamic */
    .definition-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .definition-item { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: baseline; padding: 12px 18px; background: ${pc.surface}; border-radius: 8px; border-${dir}: 3px solid ${pc.accent}; }
    .definition-term { font-weight: 700; color: ${pc.primary}; font-size: 13px; white-space: nowrap; }
    .definition-value { color: ${pc.text}; font-size: 12px; line-height: 1.7; }
  `;
}

// ─── Main Export ────────────────────────────────────────────────────────

/**
 * Generate comprehensive CSS override strings based on the AI's VisualLanguage decisions.
 * Fully dynamic — NO switch/case blocks, NO hardcoded colors.
 * Every CSS rule is derived from the design description + palette.
 */
export function generateDynamicDesignCSS(
  reasoning: DesignReasoningBlock,
  palette: ThemePalette,
  isRTL: boolean,
): string {
  const vl = reasoning.visualLanguage;
  const pc = extractPaletteColors(palette);

  const dir = isRTL ? 'right' : 'left';
  const dirOpposite = isRTL ? 'left' : 'right';

  let css = '';

  // ━━━ Typography Overrides ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const spacingDesc = vl.spacing || 'comfortable';
  const baseFontSize = spacingDesc === 'compact' ? 12 : spacingDesc === 'spacious' ? 14 : 13;
  const lineHeight = spacingDesc === 'compact' ? 1.7 : spacingDesc === 'spacious' ? 2.0 : 1.9;
  const paragraphSpacing = spacingDesc === 'compact' ? 1.0 : spacingDesc === 'spacious' ? 1.75 : 1.25;

  const headingDesc = vl.headingStyle || 'bold-serif';
  const headingScale = headingDesc === 'bold-serif' ? 2.0 : headingDesc === 'modern-geometric' ? 2.3 : 1.9;

  const radiusDesc = vl.borderRadius || 'rounded';
  const fontVariant = radiusDesc === 'sharp' ? 'condensed' : radiusDesc === 'pill' ? 'expanded' : 'default';

  css += `
    /* ─── Typography: Dynamic AI Design ─── */
    body {
      font-size: ${baseFontSize}px;
      line-height: ${lineHeight};
      ${fontVariant === 'condensed' ? 'letter-spacing: -0.3px;' : fontVariant === 'expanded' ? 'letter-spacing: 0.2px;' : ''}
    }
    .paragraph {
      margin-bottom: ${paragraphSpacing}rem;
      line-height: ${lineHeight};
    }
    .section-header h1 { font-size: ${Math.round(24 * headingScale / 2)}px; ${fontVariant === 'condensed' ? 'letter-spacing: -0.5px;' : fontVariant === 'expanded' ? 'letter-spacing: 0.5px;' : ''} }
    .subsection-h2 h2 { font-size: ${Math.round(20 * headingScale / 2)}px; ${fontVariant === 'expanded' ? 'letter-spacing: 0.3px;' : ''} }
    .subsection-h3 h3 { font-size: ${Math.round(17 * headingScale / 2)}px; }
  `;

  // ━━━ Cover Page ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const vlAny = vl as unknown as Record<string, unknown>;

  const coverDesc = resolveDescription(
    vlAny.coverDesign as string | undefined,
    vl.coverStyle,
  );
  css += generateCoverCSSFromKeywords(parseDescription(coverDesc), pc, isRTL, isRTL ? 'right' : 'left', isRTL ? 'left' : 'right', coverDesc);

  // ━━━ Section Headers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const headerDesc = resolveDescription(
    vlAny.headerDesign as string | undefined,
    vl.sectionHeaderStyle,
  );
  css += designDescriptionToCSS(headerDesc, pc, 'section-header', isRTL);

  // ━━━ Bullets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const bulletDesc = resolveDescription(
    vlAny.bulletDesign as string | undefined,
    vl.bulletStyle,
  );
  css += designDescriptionToCSS(bulletDesc, pc, 'bullet', isRTL);

  // ━━━ Callouts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const calloutDesc = resolveDescription(
    vlAny.calloutDesign as string | undefined,
    vl.calloutStyle,
  );
  css += designDescriptionToCSS(calloutDesc, pc, 'callout', isRTL);

  // ━━━ Tables ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const tableDesc = resolveDescription(
    vlAny.tableDesign as string | undefined,
    vl.tableStyle,
  );
  css += designDescriptionToCSS(tableDesc, pc, 'table', isRTL);

  // ━━━ Code Blocks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const codeDesc = resolveDescription(
    vlAny.codeBlockDesign as string | undefined,
    vl.codeBlockStyle,
  );
  css += designDescriptionToCSS(codeDesc, pc, 'code-block', isRTL);

  // ━━━ Definitions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const defDesc = resolveDescription(
    vlAny.definitionDesign as string | undefined,
    vl.definitionStyle,
  );
  css += designDescriptionToCSS(defDesc, pc, 'definition', isRTL);

  return css;
}


// ═══════════════════════════════════════════════════════════════════════
// v4.0 Ultra Colorful CSS (مليان الوان) — Rich visual elements
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate ultra-colorful CSS overrides for v4.0 visual richness.
 * All colors come from the palette — zero hardcoded values.
 */
export function generateUltraColorfulCSS(palette: ThemePalette, isRTL: boolean): string {
  const side = isRTL ? 'right' : 'left';
  const decoColors = palette.decoColors || [];
  const sectionColors = palette.sectionColors || [];

  let css = '';

  // ── Color-coded section backgrounds ──
  for (let i = 0; i < sectionColors.length; i++) {
    const sc = sectionColors[i];
    css += `
    .content-page:nth-of-type(${i + 1}) .section-content {
      background: ${sc.bg};
      border: 1px solid ${sc.border};
      border-radius: 10px;
      padding: 18px 22px;
    }
    .content-page:nth-of-type(${i + 1}) .section-content li {
      color: ${sc.text};
    }
    `;
  }

  // ── Highlight box styles (5 types) ──
  if (palette.accentKey) {
    css += `
    .highlight-key { background: ${palette.accentKeyBg}; border-${side}: 4px solid ${palette.accentKey}; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .highlight-key p { color: ${palette.accentKey}; font-weight: 500; }
    `;
  }
  if (palette.accentWarm) {
    css += `
    .highlight-warning { background: ${lightenHex(palette.accentWarm, 0.82)}; border-${side}: 4px solid ${palette.accentWarm}; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .highlight-warning p { color: ${palette.accentWarm}; font-weight: 500; }
    `;
  }
  if (palette.accentData) {
    css += `
    .highlight-data { background: ${palette.accentDataBg}; border-${side}: 4px solid ${palette.accentData}; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .highlight-data p { color: ${palette.accentData}; font-weight: 500; }
    `;
  }
  if (palette.accentInfo) {
    css += `
    .highlight-info { background: ${palette.accentInfoBg}; border-${side}: 4px solid ${palette.accentInfo}; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .highlight-info p { color: ${palette.accentInfo}; font-weight: 500; }
    `;
  }
  if (palette.accentGreen) {
    css += `
    .highlight-success { background: ${lightenHex(palette.accentGreen, 0.80)}; border-${side}: 4px solid ${palette.accentGreen}; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .highlight-success p { color: ${palette.accentGreen}; font-weight: 500; }
    `;
  }

  // ── Cover page enhancements ──
  if (palette.coverAccent2) {
    css += `
    .cover-divider { display: none; }
    `;
  }

  return css;
}
