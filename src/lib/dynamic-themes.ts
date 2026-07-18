/**
 * Dynamic Theme System — 100% Dynamic, Zero Fixed Palettes
 *
 * Every document gets a unique, dynamically generated color palette.
 * No more hardcoded palettes — colors are generated from a seed hash
 * using seeded PRNG for deterministic but unique results.
 *
 * The AI design reasoning system (design-reasoning.ts) handles the
 * intelligent content analysis. This module provides the base palette
 * generation layer.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type TopicCategory =
  | 'medical'
  | 'chemistry'
  | 'business'
  | 'marketing'
  | 'humanities'
  | 'history'
  | 'literature'
  | 'tech'
  | 'programming'
  | 'islamic'
  | 'law'
  | 'science'
  | 'general'
  | 'default';

export interface SectionColorSet {
  header: string;
  bg: string;
  text: string;
  border: string;
  accent: string;
  badgeBg: string;
}

export interface ThemePalette {
  /** Deep dark color for section headers, badges, primary headings */
  primary: string;
  /** Secondary color for sub-headings */
  secondary: string;
  /** Accent color for highlights, badges, borders, callout accents */
  accent: string;
  /** Warm accent for warnings and rule callouts */
  accentWarm: string;
  /** Green accent for tips and success */
  accentGreen: string;
  /** Page background */
  bg: string;
  /** Surface/card background — slightly lighter than bg */
  surface: string;
  /** Main text color */
  text: string;
  /** Secondary text color */
  textSecondary: string;
  /** Muted text color for captions, footers */
  textMuted: string;
  /** Border color */
  border: string;
  /** CSS gradient string for cover page background */
  coverGradient: string;
  /** Color for cover page accents */
  coverAccent: string;

  // ═══ v4.0 Ultra Colorful (مليان الوان) ═══
  coverAccent2: string;
  coverAccent3: string;
  coverDarkest: string;
  coverBright: string;
  decoColors: string[];
  sectionColors: SectionColorSet[];
  accentInfo: string;
  accentInfoBg: string;
  accentKey: string;
  accentKeyBg: string;
  accentData: string;
  accentDataBg: string;
  /** Background color for code blocks — derived from surface */
  codeBackground: string;
  /** Stripe color for table rows — derived from surface */
  tableStripe: string;
}

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Hash Function (FNV-1a) ─────────────────────────────────────────────

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ─── Color Conversion ────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function lighten(hex: string, amount: number = 0.3): string {
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
}

function darken(hex: string, amount: number = 0.2): string {
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
}

function buildGradient(hue: number, isDark: boolean, rng: () => number): string {
  const h2 = (hue + 10 + Math.floor(rng() * 20)) % 360;
  const h3 = (hue + 25 + Math.floor(rng() * 20)) % 360;
  const h4 = (hue + 40 + Math.floor(rng() * 20)) % 360;
  const angle = 120 + Math.floor(rng() * 45);
  const s1 = 22 + Math.floor(rng() * 10);
  const s2 = 25 + Math.floor(rng() * 10);
  const s3 = 40 + Math.floor(rng() * 15);
  const s4 = 55 + Math.floor(rng() * 15);
  return `linear-gradient(${angle}deg, ${hslToHex(hue, s1, 3 + Math.floor(rng()*3))} 0%, ${hslToHex(h2, s2, 8 + Math.floor(rng()*7))} 25%, ${hslToHex(h3, s3, 18 + Math.floor(rng()*8))} 55%, ${hslToHex(h4, s4, 30 + Math.floor(rng()*10))} 85%, ${hslToHex(h4, s4+5, 45 + Math.floor(rng()*10))} 100%)`;
}

function generateDecoColors(rng: () => number): string[] {
  const colors: string[] = [];
  const startHue = Math.floor(rng() * 360);
  const spacing = 40 + rng() * 32;
  for (let i = 0; i < 7; i++) {
    const h = (startHue + i * spacing) % 360;
    colors.push(hslToHex(h, 65 + rng() * 25, 55 + rng() * 25));
  }
  return colors;
}

function generateSectionColors(baseHue: number, rng: () => number, count: number): SectionColorSet[] {
  const hueSpacingOptions = [45, 55, 65, 72, 80, 90];
  const hueSpacing = hueSpacingOptions[Math.floor(rng() * hueSpacingOptions.length)];
  const sections: SectionColorSet[] = [];
  for (let i = 0; i < count; i++) {
    const sh = (baseHue + i * hueSpacing + (rng() * 16 - 8)) % 360;
    const ss = 50 + rng() * 28;
    const sv = 38 + rng() * 22;
    const header = hslToHex(sh, ss, sv);
    const bg = lighten(header, 0.78);
    const text = darken(header, 0.12);
    const border = lighten(header, 0.50);
    const accentHue = (sh + 20 + rng() * 30) % 360;
    const accent = hslToHex(accentHue, 60 + rng() * 20, 60 + rng() * 20);
    const badgeBg = lighten(accent, 0.70);
    sections.push({ header, bg, text, border, accent, badgeBg });
  }
  return sections;
}

// ─── Dynamic Palette Generation ─────────────────────────────────────────

/**
 * Generate a unique theme palette dynamically from a seed.
 *
 * No fixed palettes — every seed produces a completely unique palette.
 * Same seed = same palette (deterministic).
 *
 * @param category - Topic category (for interface compatibility)
 * @param seed - Optional seed string (e.g., title + content) for per-document uniqueness.
 *               Without seed, category name is used as seed.
 */
export function getThemePalette(category: TopicCategory | string, seed?: string): ThemePalette {
  const hashBase = seed || String(category);
  const hash = hashString(hashBase);
  const rng = mulberry32(hash);

  // Generate a unique hue entirely from the seed — no fixed category mappings
  const hue = Math.floor(rng() * 360);

  // Determine if dark or light based on hash — provides variety
  const isDark = rng() > 0.25; // ~75% dark, 25% light for variety

  // Generate shared colorful fields
  const decoColors = generateDecoColors(rng);
  const numSections = 5 + Math.floor(rng() * 3); // 5-7 section colors
  const sectionColors = generateSectionColors(hue, rng, numSections);
  const coverAccent2Hue = (hue + 100 + Math.floor(rng() * 80)) % 360;
  const coverAccent3Hue = (coverAccent2Hue + 40 + Math.floor(rng() * 50)) % 360;
  const accentInfo = hslToHex(260 + rng() * 30, 60 + rng() * 20, 50 + rng() * 18);
  const accentInfoBg = lighten(accentInfo, 0.80);
  const accentKey = hslToHex(rng() * 25, 75 + rng() * 15, 50 + rng() * 18);
  const accentKeyBg = lighten(accentKey, 0.82);
  const accentData = hslToHex(210 + rng() * 35, 70 + rng() * 18, 50 + rng() * 18);
  const accentDataBg = lighten(accentData, 0.82);

  if (isDark) {
    const darkBg = hslToHex(hue, 35 + rng() * 15, 4 + rng() * 3);
    const darkSurface = hslToHex(hue, 30 + rng() * 15, 9 + rng() * 5);
    return {
      primary: hslToHex(hue, 55 + rng() * 15, 10 + rng() * 5),
      secondary: hslToHex(hue, 45 + rng() * 15, 17 + rng() * 7),
      accent: hslToHex((hue + 25 + rng() * 40) % 360, 70 + rng() * 15, 50 + rng() * 10),
      accentWarm: hslToHex((hue + 35 + rng() * 30) % 360, 65 + rng() * 15, 55 + rng() * 10),
      accentGreen: hslToHex((hue + 110 + rng() * 40) % 360, 55 + rng() * 15, 40 + rng() * 10),
      bg: darkBg,
      surface: darkSurface,
      text: hslToHex(hue, 8 + rng() * 8, 88 + rng() * 8),
      textSecondary: hslToHex(hue, 12 + rng() * 8, 65 + rng() * 10),
      textMuted: hslToHex(hue, 8 + rng() * 8, 40 + rng() * 10),
      border: hslToHex(hue, 25 + rng() * 15, 22 + rng() * 8),
      coverGradient: buildGradient(hue, true, rng),
      coverAccent: hslToHex((hue + 25 + rng() * 40) % 360, 70 + rng() * 15, 50 + rng() * 10),
      // v4.0 Ultra Colorful
      coverAccent2: hslToHex(coverAccent2Hue, 70 + rng() * 20, 60 + rng() * 25),
      coverAccent3: hslToHex(coverAccent3Hue, 65 + rng() * 20, 55 + rng() * 25),
      coverDarkest: hslToHex(hue, 55 + rng() * 20, 4 + rng() * 4),
      coverBright: hslToHex((hue + 40 + Math.floor(rng() * 20)) % 360, 55 + rng() * 20, 55 + rng() * 20),
      decoColors,
      sectionColors,
      accentInfo, accentInfoBg,
      accentKey, accentKeyBg,
      accentData, accentDataBg,
      codeBackground: darkSurface,
      tableStripe: lighten(darkBg, 0.03),
    };
  }

  const lightBg = hslToHex(hue, 8 + rng() * 8, 96 + rng() * 3);
  const lightSurface = hslToHex(hue, 6 + rng() * 6, 93 + rng() * 4);
  return {
    primary: hslToHex(hue, 50 + rng() * 15, 10 + rng() * 5),
    secondary: hslToHex(hue, 40 + rng() * 15, 22 + rng() * 8),
    accent: hslToHex((hue + 25 + rng() * 40) % 360, 65 + rng() * 15, 38 + rng() * 8),
    accentWarm: hslToHex((hue + 35 + rng() * 30) % 360, 60 + rng() * 15, 42 + rng() * 8),
    accentGreen: hslToHex((hue + 110 + rng() * 40) % 360, 50 + rng() * 15, 32 + rng() * 8),
    bg: lightBg,
    surface: lightSurface,
    text: hslToHex(hue, 25 + rng() * 10, 10 + rng() * 5),
    textSecondary: hslToHex(hue, 12 + rng() * 8, 32 + rng() * 8),
    textMuted: hslToHex(hue, 8 + rng() * 8, 55 + rng() * 10),
    border: hslToHex(hue, 12 + rng() * 8, 85 + rng() * 6),
    coverGradient: buildGradient(hue, false, rng),
    coverAccent: hslToHex((hue + 25 + rng() * 40) % 360, 65 + rng() * 15, 38 + rng() * 8),
    // v4.0 Ultra Colorful
    coverAccent2: hslToHex(coverAccent2Hue, 65 + rng() * 20, 55 + rng() * 25),
    coverAccent3: hslToHex(coverAccent3Hue, 60 + rng() * 20, 50 + rng() * 25),
    coverDarkest: hslToHex(hue, 50 + rng() * 20, 5 + rng() * 5),
    coverBright: hslToHex((hue + 40 + Math.floor(rng() * 20)) % 360, 55 + rng() * 20, 55 + rng() * 20),
    decoColors,
    sectionColors,
    accentInfo, accentInfoBg,
    accentKey, accentKeyBg,
    accentData, accentDataBg,
    codeBackground: lighten(lightSurface, 0.5),
    tableStripe: darken(lightBg, 0.03),
  };
}

/**
 * Detect topic category from content.
 * Returns 'general' — the AI design reasoning system handles
 * the actual content analysis for design decisions.
 * No more fixed keyword lists.
 */
export function detectTopicCategory(_content: string, _title: string): TopicCategory {
  return 'general';
}
