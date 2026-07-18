/**
 * Unique Palette Generator — Intelligent Content-Aware Color System (v6)
 *
 * Instead of hardcoded theme palettes per topic, this generator creates
 * COMPLETELY UNIQUE color palettes for every document using a seeded PRNG.
 *
 * KEY PHILOSOPHY v6: Colors are NOT random — they're INTELLIGENT.
 * The palette is designed to SERVE the content:
 * - Academic content gets clean, professional, trustworthy colors
 * - Tech content gets modern, bold, electric colors
 * - Islamic content gets warm, dignified, traditional colors
 * - Creative content gets unexpected, bold, artistic colors
 *
 * The mode (light/dark) is determined by content psychology —
 * not forced to always-dark. White backgrounds are the RIGHT choice
 * for study/educational content.
 *
 * User-specified color preferences (Arabic/English) override everything.
 *
 * Task ID: genius-director-v6
 */

import type { ThemePalette } from './dynamic-themes';
import { classifyContent, toDesignReasoningType, getPreferredHueRange, type ContentCategory } from './content-classifier';

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────────────

/**
 * Mulberry32 — fast, deterministic PRNG for seeded random number generation.
 * Returns a function that produces floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// ─── v4.0 Ultra Colorful Helpers ─────────────────────────────────────────

function lightenHex(hex: string, amount: number = 0.3): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(h.substring(0, 2), 16) + (255 - parseInt(h.substring(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(h.substring(2, 4), 16) + (255 - parseInt(h.substring(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(h.substring(4, 6), 16) + (255 - parseInt(h.substring(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function darkenHex(hex: string, amount: number = 0.2): string {
  const h = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function generateUltraDecoColors(rng: () => number): string[] {
  const colors: string[] = [];
  const startHue = Math.floor(rng() * 360);
  const spacing = 40 + rng() * 32;
  for (let i = 0; i < 7; i++) {
    const h = (startHue + i * spacing) % 360;
    colors.push(hslToHex(h, 65 + rng() * 25, 55 + rng() * 25));
  }
  return colors;
}

function generateUltraSectionColors(baseHue: number, rng: () => number): import('./dynamic-themes').SectionColorSet[] {
  const hueSpacing = [45, 55, 65, 72, 80, 90][Math.floor(rng() * 6)];
  const count = 5 + Math.floor(rng() * 3);
  const sections: import('./dynamic-themes').SectionColorSet[] = [];
  for (let i = 0; i < count; i++) {
    const sh = (baseHue + i * hueSpacing + (rng() * 16 - 8)) % 360;
    const ss = 50 + rng() * 28;
    const sv = 38 + rng() * 22;
    const header = hslToHex(sh, ss, sv);
    const bg = lightenHex(header, 0.78);
    const text = darkenHex(header, 0.12);
    const border = lightenHex(header, 0.50);
    const accentHue = (sh + 20 + rng() * 30) % 360;
    const accent = hslToHex(accentHue, 60 + rng() * 20, 60 + rng() * 20);
    const badgeBg = lightenHex(accent, 0.70);
    sections.push({ header, bg, text, border, accent, badgeBg });
  }
  return sections;
}

// ─── Hash Function ──────────────────────────────────────────────────────

/**
 * Generate a numeric hash from a string using FNV-1a algorithm.
 * Produces a well-distributed 32-bit hash.
 */
function hashContent(content: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned
}

// ─── HSL ↔ Hex Conversion ───────────────────────────────────────────────

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

// ─── Color Name → Hue Mapping ───────────────────────────────────────────

const COLOR_HUE_MAP: Record<string, number> = {
  // English
  red: 0,
  crimson: 348,
  scarlet: 10,
  orange: 30,
  amber: 45,
  gold: 50,
  golden: 50,
  yellow: 55,
  lime: 80,
  green: 140,
  emerald: 160,
  teal: 180,
  cyan: 190,
  sky: 200,
  blue: 220,
  indigo: 240,
  violet: 270,
  purple: 280,
  magenta: 300,
  pink: 330,
  rose: 340,
  brown: 25,
  maroon: 0,
  navy: 230,
  // Arabic
  'أحمر': 0,
  'احمر': 0,
  'قرمزي': 348,
  'برتقالي': 30,
  'عنبري': 45,
  'ذهبي': 50,
  'ذهبية': 50,
  'أصفر': 55,
  'اصفر': 55,
  'ليموني': 80,
  'أخضر': 140,
  'اخضر': 140,
  'زمردي': 160,
  'فيروزي': 180,
  'سماوي': 200,
  'أزرق': 220,
  'ازرق': 220,
  'نيلي': 240,
  'بنفسجي': 270,
  'أرجواني': 280,
  'وردي': 330,
  'بني': 25,
  'كحلي': 230,
  'فضي': 0,
  'فضة': 0,
  'أبيض': -1,  // Special: signals light mode preference
  'ابيض': -1,
  'أبيضة': -1,
  'بيضاء': -1,
  'بيضه': -1,
};

// ─── Design Preferences ─────────────────────────────────────────────────

export interface DesignPreferences {
  /** User-specified color preference (e.g., "أحمر", "red", "ذهبي") */
  colorPreference: string | null;
  /** User-specified style preference (e.g., "dark", "minimal", "elegant") */
  stylePreference: string | null;
}

// ─── Content-Type Smart Hue Ranges ──────────────────────────────────────
// FIXED hue preferences REMOVED — now uses hash-based hue generation
// via getPreferredHueRange() from content-classifier.ts.
// Every document gets a unique, deterministic hue range.

/**
 * Get a smart accent hue based on content type.
 * Uses hash-based hue range generation — no fixed hue preferences.
 * Every content type gets a unique, deterministic accent color.
 */
function getSmartAccentHue(
  contentType: string,
  rng: () => number,
  userColorPreference?: string | null,
): number {
  // If user specified a color, use it
  if (userColorPreference && COLOR_HUE_MAP[userColorPreference] !== undefined) {
    const hueValue = COLOR_HUE_MAP[userColorPreference];
    if (hueValue === -1) {
      // "White" preference — random accent on white background
      return Math.floor(rng() * 360);
    }
    return (hueValue + Math.floor(rng() * 20 - 10) + 360) % 360;
  }

  // Use hash-based hue range — unique per content type, deterministic
  const [hueMin, hueMax] = getPreferredHueRange(contentType);

  // 80% chance: pick within the preferred range
  // 20% chance: pick a random hue for variety
  if (rng() < 0.8) {
    const range = hueMax > hueMin ? hueMax - hueMin : (hueMax + 360 - hueMin);
    const hue = (hueMin + Math.floor(rng() * range)) % 360;
    return hue;
  } else {
    return Math.floor(rng() * 360);
  }
}

// ─── Content Psychology for Mode Detection ──────────────────────────────
// FIXED keyword indicators REMOVED — mode detection now uses:
// 1. User preference regex (parsing user input, not static design)
// 2. Hash-based deterministic mode selection for variety
// 3. Content pattern heuristics (regex, not keyword lists)

/**
 * Intelligently determine whether the content should use a light or dark
 * background. Uses user preference parsing + hash-based deterministic
 * selection — no fixed keyword lists.
 *
 * Returns 'light' or 'dark' based on content analysis.
 */
export function detectBackgroundMode(content: string, userPreference?: string | null): 'light' | 'dark' {
  const lower = content.toLowerCase();

  // ── User preference overrides everything ──
  if (userPreference) {
    const prefLower = userPreference.toLowerCase();
    // Check for light/white preference
    if (/فاتح|مضيء|أبيض|ابيض|بيضاء|light|white|bright|clean|minimal/i.test(prefLower)) {
      return 'light';
    }
    // Check for dark preference
    if (/داكن|مظلم|كحلي|dark|night|noir/i.test(prefLower)) {
      return 'dark';
    }
  }

  // ── Content pattern heuristics (regex, not keyword lists) ──
  // Educational/study content → light (print-friendly, readable)
  if (/(?:chemistry|physics|math|biology|organic|equation|reaction|formula|الكيمياء|الفيزياء|الرياضيات|الأحياء|معادلة|تفاعل|قانون)/i.test(lower)) {
    return 'light';
  }

  // Code/tech content → dark (classic IDE look)
  if (/(?:function|class|import|export|const |let |var |async|await|def |return|python|javascript|typescript)/i.test(lower)) {
    return 'dark';
  }

  // Academic/lecture content → light
  if (/(?:lecture|summary|notes|study|exam|quiz|محاضرة|ملخص|مذكرة|امتحان|اختبار)/i.test(lower)) {
    return 'light';
  }

  // Creative/artistic content → dark
  if (/(?:creative|art|design|graphic|cinema|إبداع|فن|تصميم|جرافيك)/i.test(lower)) {
    return 'dark';
  }

  // ── Hash-based deterministic selection ──
  // No strong signal → use content hash for variety
  // (about 60% light, 40% dark — light is generally better for readability)
  const seed = hashContent(content.substring(0, 500));
  return (seed % 10) < 6 ? 'light' : 'dark';
}

/**
 * Detect content type from text for smart color selection.
 * NOW DELEGATES to the unified classifyContent() from content-classifier.ts.
 * The old keyword-based detection has been migrated to the canonical system.
 *
 * Backward compatible: still returns a string that matches the old 7-type set
 * (financial, academic, medical, islamic, creative, technical, legal).
 */
function detectContentType(text: string): string {
  const classification = classifyContent(text);
  return toDesignReasoningType(classification.category);
}

// ─── Parse User Color Preference ────────────────────────────────────────

/**
 * Detects color preferences from Arabic/English messages.
 * Returns the detected color name (in its original language) or null.
 */
export function parseUserColorPreference(message: string): string | null {
  const lower = message.toLowerCase();

  // Arabic patterns: باللون الأحمر، لون أحمر، أحمر، تصميم ذهبي
  const arPatterns = [
    /باللون\s+(?:ال)?(\S+)/,
    /لون\s+(?:ال)?(\S+)/,
    /تصميم\s+(?:ال)?(\S+)/,
    /ستايل\s+(?:ال)?(\S+)/,
  ];

  for (const pattern of arPatterns) {
    const match = message.match(pattern);
    if (match) {
      const colorName = match[1].replace(/[ًٌٍَُِّْ]/g, ''); // Strip Arabic diacritics
      if (COLOR_HUE_MAP[colorName] !== undefined) {
        return colorName;
      }
    }
  }

  // English patterns: "red color", "make it blue", "gold theme", "in green"
  const enPatterns = [
    /(?:in|with|use|make|using)\s+(?:the\s+)?(\w+)\s+(?:color|theme|style|palette)/i,
    /(\w+)\s+(?:color|theme|style|palette)/i,
    /(?:color|theme|style|palette)\s*(?::|is|=)\s*(\w+)/i,
  ];

  for (const pattern of enPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const colorName = match[1].toLowerCase();
      if (COLOR_HUE_MAP[colorName] !== undefined) {
        return colorName;
      }
    }
  }

  // Direct color name check in the message
  for (const [colorName, _hue] of Object.entries(COLOR_HUE_MAP)) {
    if (message.includes(colorName) || lower.includes(colorName.toLowerCase())) {
      return colorName;
    }
    if (/[\u0600-\u06FF]/.test(colorName)) {
      const withAl = 'ال' + colorName;
      if (message.includes(withAl)) {
        return colorName;
      }
    }
  }

  return null;
}

// ─── Parse User Design Preferences ──────────────────────────────────────

/**
 * Detects full design preferences (colors, theme style) from a message.
 */
export function parseUserDesignPreferences(message: string): DesignPreferences {
  const colorPreference = parseUserColorPreference(message);
  let stylePreference: string | null = null;

  const lower = message.toLowerCase();

  const stylePatterns: [RegExp, string][] = [
    [/داكن|مظلم|dark\s*(?:mode|theme)?|dark\s*design/i, 'dark'],
    [/فاتح|مضيء|light\s*(?:mode|theme)?/i, 'light'],
    [/أنيق|راقي|elegant|sophisticated|classy/i, 'elegant'],
    [/بسيط|minimal|clean|simple/i, 'minimal'],
    [/حديث|عصري|modern|contemporary/i, 'modern'],
    [/تقليدي|كلاسيكي|classic|traditional/i, 'classic'],
    [/جريء|bold|dramatic|vibrant/i, 'bold'],
    [/هادئ|calm|soft|subtle/i, 'calm'],
  ];

  for (const [pattern, style] of stylePatterns) {
    if (pattern.test(lower)) {
      stylePreference = style;
      break;
    }
  }

  return { colorPreference, stylePreference };
}

// ─── Light Mode Palette Generation ──────────────────────────────────────

/**
 * Generate a light-mode palette — white/light background, dark text,
 * colorful accents. Clean, professional, print-friendly.
 * INTELLIGENT: Uses content-type smart hue selection.
 */
function generateLightPalette(
  accentHue: number,
  rng: () => number,
  userColorPreference?: string | null,
): ThemePalette {
  const secondaryHue = (accentHue + 137.508) % 360;
  const warmHue = (accentHue + 45) % 360;
  const greenHue = (accentHue + 120) % 360;

  // ── Light backgrounds ──
  const bgLightness = 96 + Math.floor(rng() * 4); // 96-100% = near-white to white
  const bgSaturation = 2 + Math.floor(rng() * 8); // 2-10% = very subtle tint
  const bgHueShift = Math.floor(rng() * 40 - 20);
  const bgHue = (accentHue + bgHueShift + 360) % 360;

  // Surface: slightly darker than bg, subtle
  const surfaceLightness = bgLightness - 3 - Math.floor(rng() * 4); // 89-97%
  const surfaceSaturation = bgSaturation + 2 + Math.floor(rng() * 6);

  // ── Primary color — rich, medium saturation for headings ──
  const primarySaturation = 55 + Math.floor(rng() * 30); // 55-85%
  const primaryLightness = 30 + Math.floor(rng() * 15); // 30-45%
  const primaryHue = (accentHue + Math.floor(rng() * 20 - 10) + 360) % 360;

  // Secondary — lighter version of primary
  const secondaryLightness = primaryLightness + 15 + Math.floor(rng() * 10); // 45-70%
  const secondarySaturation = primarySaturation - 5 + Math.floor(rng() * 10);

  // ── Accent — vibrant for highlights and badges ──
  const accentSaturation = 65 + Math.floor(rng() * 30); // 65-95%
  const accentLightness = 45 + Math.floor(rng() * 15); // 45-60%

  // Warm accent
  const warmSaturation = 70 + Math.floor(rng() * 25);
  const warmLightness = 50 + Math.floor(rng() * 15);

  // Green accent
  const greenSaturation = 55 + Math.floor(rng() * 35);
  const greenLightness = 40 + Math.floor(rng() * 20);

  // ── Text colors (dark for light backgrounds) ──
  const textLightness = 10 + Math.floor(rng() * 10); // 10-20% = very dark
  const textSaturation = 5 + Math.floor(rng() * 15);

  const textSecondaryLightness = 30 + Math.floor(rng() * 15); // 30-45%
  const textSecondarySaturation = 5 + Math.floor(rng() * 15);

  const textMutedLightness = 50 + Math.floor(rng() * 15); // 50-65%
  const textMutedSaturation = 3 + Math.floor(rng() * 10);

  // ── Border — subtle, visible but not distracting ──
  const borderLightness = 80 + Math.floor(rng() * 10); // 80-90%
  const borderSaturation = 5 + Math.floor(rng() * 15);

  // ── Cover gradient — rich but elegant for light theme ──
  const coverHue1 = primaryHue;
  const coverHue2 = (primaryHue + Math.floor(rng() * 60) + 360) % 360;

  // ── Build final palette ──
  const primary = hslToHex(primaryHue, primarySaturation, primaryLightness);
  const secondary = hslToHex(secondaryHue, secondarySaturation, secondaryLightness);
  const accent = hslToHex(accentHue, accentSaturation, accentLightness);
  const accentWarm = hslToHex(warmHue, warmSaturation, warmLightness);
  const accentGreen = hslToHex(greenHue, greenSaturation, greenLightness);

  const bgColor = hslToHex(bgHue, bgSaturation, bgLightness);
  const surfaceColor = hslToHex(bgHue, surfaceSaturation, surfaceLightness);

  const textColor = hslToHex(bgHue, textSaturation, textLightness);
  const textSecondaryColor = hslToHex(bgHue, textSecondarySaturation, textSecondaryLightness);
  const textMutedColor = hslToHex(bgHue, textMutedSaturation, textMutedLightness);

  const borderColor = hslToHex(bgHue, borderSaturation, borderLightness);

  const coverGradient = `linear-gradient(135deg, ${hslToHex(coverHue1, primarySaturation, 20 + Math.floor(rng() * 10))} 0%, ${hslToHex(coverHue2, primarySaturation, 35 + Math.floor(rng() * 10))} 50%, ${hslToHex(coverHue1, primarySaturation - 10, 15 + Math.floor(rng() * 10))} 100%)`;
  const coverAccent = hslToHex(accentHue, accentSaturation, accentLightness);

  // ── v4.0 Ultra Colorful fields ──
  const decoColors = generateUltraDecoColors(rng);
  const sectionColors = generateUltraSectionColors(accentHue, rng);
  const coverAccent2Hue = (accentHue + 100 + Math.floor(rng() * 80)) % 360;
  const coverAccent3Hue = (coverAccent2Hue + 40 + Math.floor(rng() * 50)) % 360;
  const accentInfo = hslToHex(260 + rng() * 30, 60 + rng() * 20, 50 + rng() * 18);
  const accentKey = hslToHex(rng() * 25, 75 + rng() * 15, 50 + rng() * 18);
  const accentData = hslToHex(210 + rng() * 35, 70 + rng() * 18, 50 + rng() * 18);

  return {
    primary,
    secondary,
    accent,
    accentWarm,
    accentGreen,
    bg: bgColor,
    surface: surfaceColor,
    text: textColor,
    textSecondary: textSecondaryColor,
    textMuted: textMutedColor,
    border: borderColor,
    coverGradient,
    coverAccent,
    // v4.0 Ultra Colorful
    coverAccent2: hslToHex(coverAccent2Hue, 65 + rng() * 20, 55 + rng() * 25),
    coverAccent3: hslToHex(coverAccent3Hue, 60 + rng() * 20, 50 + rng() * 25),
    coverDarkest: hslToHex(accentHue, 50 + rng() * 20, 5 + rng() * 5),
    coverBright: hslToHex((accentHue + 40 + Math.floor(rng() * 20)) % 360, 55 + rng() * 20, 55 + rng() * 20),
    decoColors,
    sectionColors,
    accentInfo,
    accentInfoBg: lightenHex(accentInfo, 0.80),
    accentKey,
    accentKeyBg: lightenHex(accentKey, 0.82),
    accentData,
    accentDataBg: lightenHex(accentData, 0.82),
    codeBackground: lightenHex(surfaceColor, 0.5),
    tableStripe: darkenHex(bgColor, 0.03),
  };
}

// ─── Dark Mode Palette Generation ──────────────────────────────────────

/**
 * Generate a dark-mode palette — dark rich background, light text,
 * vibrant accents. Dramatic, immersive.
 * INTELLIGENT: Uses content-type smart hue selection.
 */
function generateDarkPalette(
  accentHue: number,
  rng: () => number,
): ThemePalette {
  const secondaryHue = (accentHue + 137.508) % 360;
  const warmHue = (accentHue + 45) % 360;
  const greenHue = (accentHue + 120) % 360;

  // ── Dark backgrounds ──
  const bgLightness = 4 + Math.floor(rng() * 8); // 4-12% = very dark
  const bgSaturation = 20 + Math.floor(rng() * 40); // 20-60% saturation
  const bgHueShift = Math.floor(rng() * 60 - 30);
  const bgHue = (accentHue + bgHueShift + 360) % 360;

  const surfaceLightness = bgLightness + 4 + Math.floor(rng() * 4); // 8-20%
  const surfaceSaturation = bgSaturation - 5 + Math.floor(rng() * 10);

  // ── Primary and secondary ──
  const primaryLightness = bgLightness + 8 + Math.floor(rng() * 10); // 12-30%
  const primarySaturation = bgSaturation + 10 + Math.floor(rng() * 20);
  const primaryHue = (bgHue + Math.floor(rng() * 30 - 15) + 360) % 360;

  const secondaryLightness = primaryLightness + 5 + Math.floor(rng() * 8);
  const secondarySaturation = primarySaturation + 5 + Math.floor(rng() * 10);
  const secondaryHueShift = Math.floor(rng() * 40 - 20);
  const secondaryColorHue = (primaryHue + secondaryHueShift + 360) % 360;

  // ── Accent color with good saturation ──
  const accentSaturation = 65 + Math.floor(rng() * 30);
  const accentLightness = 50 + Math.floor(rng() * 15);

  const warmSaturation = 70 + Math.floor(rng() * 25);
  const warmLightness = 55 + Math.floor(rng() * 15);

  const greenSaturation = 55 + Math.floor(rng() * 35);
  const greenLightness = 45 + Math.floor(rng() * 20);

  // ── Text colors (light for dark backgrounds) ──
  const textLightness = 88 + Math.floor(rng() * 10); // 88-98%
  const textSaturation = 5 + Math.floor(rng() * 15);

  const textSecondaryLightness = 65 + Math.floor(rng() * 15);
  const textSecondarySaturation = 8 + Math.floor(rng() * 15);
  const textSecondaryHueShift = Math.floor(rng() * 30 - 15);

  const textMutedLightness = 40 + Math.floor(rng() * 15);
  const textMutedSaturation = 5 + Math.floor(rng() * 10);

  // ── Border color ──
  const borderLightness = bgLightness + 12 + Math.floor(rng() * 8);
  const borderSaturation = bgSaturation - 5 + Math.floor(rng() * 10);

  // ── Cover gradient ──
  const coverHue1 = bgHue;
  const coverHue2 = (bgHue + Math.floor(rng() * 60) + 360) % 360;
  const coverHue3 = bgHue;

  // ── Build final palette ──
  const primary = hslToHex(primaryHue, primarySaturation, primaryLightness);
  const secondary = hslToHex(secondaryColorHue, secondarySaturation, secondaryLightness);
  const accent = hslToHex(accentHue, accentSaturation, accentLightness);
  const accentWarm = hslToHex(warmHue, warmSaturation, warmLightness);
  const accentGreen = hslToHex(greenHue, greenSaturation, greenLightness);

  const bgColor = hslToHex(bgHue, bgSaturation, bgLightness);
  const surfaceColor = hslToHex(bgHue, surfaceSaturation, surfaceLightness);

  const textColor = hslToHex(bgHue, textSaturation, textLightness);
  const textSecondaryColor = hslToHex(
    (bgHue + textSecondaryHueShift + 360) % 360,
    textSecondarySaturation,
    textSecondaryLightness,
  );
  const textMutedColor = hslToHex(bgHue, textMutedSaturation, textMutedLightness);

  const borderColor = hslToHex(bgHue, borderSaturation, borderLightness);

  const coverGradient = `linear-gradient(135deg, ${hslToHex(coverHue1, bgSaturation, bgLightness)} 0%, ${hslToHex(coverHue2, primarySaturation, primaryLightness)} 50%, ${hslToHex(coverHue3, bgSaturation, bgLightness)} 100%)`;
  const coverAccent = hslToHex(accentHue, accentSaturation, accentLightness);

  // ── v4.0 Ultra Colorful fields ──
  const decoColors = generateUltraDecoColors(rng);
  const sectionColors = generateUltraSectionColors(accentHue, rng);
  const coverAccent2Hue = (accentHue + 100 + Math.floor(rng() * 80)) % 360;
  const coverAccent3Hue = (coverAccent2Hue + 40 + Math.floor(rng() * 50)) % 360;
  const accentInfo = hslToHex(260 + rng() * 30, 60 + rng() * 20, 50 + rng() * 18);
  const accentKey = hslToHex(rng() * 25, 75 + rng() * 15, 50 + rng() * 18);
  const accentData = hslToHex(210 + rng() * 35, 70 + rng() * 18, 50 + rng() * 18);

  return {
    primary,
    secondary,
    accent,
    accentWarm,
    accentGreen,
    bg: bgColor,
    surface: surfaceColor,
    text: textColor,
    textSecondary: textSecondaryColor,
    textMuted: textMutedColor,
    border: borderColor,
    coverGradient,
    coverAccent,
    // v4.0 Ultra Colorful
    coverAccent2: hslToHex(coverAccent2Hue, 70 + rng() * 20, 60 + rng() * 25),
    coverAccent3: hslToHex(coverAccent3Hue, 65 + rng() * 20, 55 + rng() * 25),
    coverDarkest: hslToHex(accentHue, 55 + rng() * 20, 4 + rng() * 4),
    coverBright: hslToHex((accentHue + 40 + Math.floor(rng() * 20)) % 360, 55 + rng() * 20, 55 + rng() * 20),
    decoColors,
    sectionColors,
    accentInfo,
    accentInfoBg: lightenHex(accentInfo, 0.80),
    accentKey,
    accentKeyBg: lightenHex(accentKey, 0.82),
    accentData,
    accentDataBg: lightenHex(accentData, 0.82),
    codeBackground: surfaceColor,
    tableStripe: lightenHex(bgColor, 0.03),
  };
}

// ─── Generate Unique Palette ─────────────────────────────────────────────

/**
 * Generate a completely unique color palette from content + timestamp.
 *
 * The AI ANALYZES the content to decide whether to use a light or dark
 * background. Both are fully supported. White backgrounds are used when
 * appropriate (academic, professional, print-friendly content).
 *
 * INTELLIGENT: Colors are chosen based on content psychology, not random.
 * Medical content gets calming greens/blues. Islamic content gets warm golds.
 * Tech content gets electric blues/cyans. Creative content gets bold purples.
 *
 * Every call produces a different palette — even for the same content —
 * because the timestamp is mixed into the seed.
 *
 * @param content — The document content (used for seed generation & mode detection)
 * @param userColorPreference — Optional color name (Arabic/English) to anchor the accent
 * @param forceMode — Optional force 'light' or 'dark' mode (overrides content analysis)
 * @returns A complete ThemePalette with all 14 color fields
 */
export function generateUniquePalette(
  content: string,
  userColorPreference?: string | null,
  forceMode?: 'light' | 'dark',
): ThemePalette {
  // Combine content hash with current timestamp for maximum uniqueness
  const contentSeed = hashContent(content.substring(0, 2000));
  const timeSeed = hashContent(Date.now().toString() + Math.random().toString(36));
  const seed = contentSeed ^ timeSeed;
  const rng = mulberry32(seed);

  // ── Determine background mode (light or dark) ──
  const mode = forceMode || detectBackgroundMode(content, userColorPreference);

  // ── Detect content type for smart hue selection ──
  const contentType = detectContentType(content);

  // ── Determine accent hue using INTELLIGENT selection ──
  const accentHue = getSmartAccentHue(contentType, rng, userColorPreference);

  // ── Generate palette based on mode ──
  if (mode === 'light') {
    return generateLightPalette(accentHue, rng, userColorPreference);
  } else {
    return generateDarkPalette(accentHue, rng);
  }
}

/**
 * Detect which background mode was used for a given palette.
 * Useful for downstream CSS adjustments.
 */
export function detectPaletteMode(palette: ThemePalette): 'light' | 'dark' {
  // Parse the bg color lightness
  const h = palette.bg.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 * 100;
  return lightness > 50 ? 'light' : 'dark';
}

// ─── WCAG 2.0 Contrast Validation ──────────────────────────────────────

/**
 * Linearize an sRGB channel value (0-255) to the 0-1 range.
 * Uses the standard sRGB -> linear RGB conversion per WCAG 2.0.
 */
function linearizeChannel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Calculate the relative luminance of a hex color per WCAG 2.0.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B (where R, G, B are linearized)
 */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = linearizeChannel(parseInt(h.substring(0, 2), 16));
  const g = linearizeChannel(parseInt(h.substring(2, 4), 16));
  const b = linearizeChannel(parseInt(h.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate the WCAG 2.0 contrast ratio between two hex colors.
 * Contrast ratio = (L_light + 0.05) / (L_dark + 0.05)
 * Returns a value >= 1 (1 = no contrast, 21 = max contrast).
 */
export function calculateContrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validate and adjust a foreground color to meet WCAG 2.0 AA minimum
 * contrast ratio of 4.5:1 against the given background color.
 *
 * If the foreground already meets the threshold, it is returned unchanged.
 * If not, the foreground is adjusted by darkening (on light backgrounds)
 * or lightening (on dark backgrounds) until the minimum contrast is met.
 *
 * @param fg - Foreground hex color (e.g. "#1a1a2e")
 * @param bg - Background hex color (e.g. "#f5f5f5")
 * @param minRatio - Minimum contrast ratio (default: 4.5 for WCAG AA)
 * @returns The adjusted foreground hex color that meets the minimum contrast
 */
export function validateContrast(fg: string, bg: string, minRatio: number = 4.5): string {
  // Check current contrast
  const currentRatio = calculateContrastRatio(fg, bg);
  if (currentRatio >= minRatio) {
    return fg; // Already meets the threshold
  }

  // Determine whether the background is light or dark
  const bgLuminance = relativeLuminance(bg);
  const isLightBg = bgLuminance > 0.179; // ~46% lightness threshold

  // Parse the foreground color
  const h = fg.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);

  // Iteratively adjust the foreground color to meet the contrast ratio
  // On light backgrounds: darken the foreground
  // On dark backgrounds: lighten the foreground
  const maxIterations = 50;
  for (let i = 0; i < maxIterations; i++) {
    const adjusted = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const ratio = calculateContrastRatio(adjusted, bg);
    if (ratio >= minRatio) {
      return adjusted;
    }

    if (isLightBg) {
      // Darken foreground by reducing RGB values
      r = Math.max(0, r - 8);
      g = Math.max(0, g - 8);
      b = Math.max(0, b - 8);
    } else {
      // Lighten foreground by increasing RGB values
      r = Math.min(255, r + 8);
      g = Math.min(255, g + 8);
      b = Math.min(255, b + 8);
    }
  }

  // If we couldn't meet the ratio after max iterations, return the best we got
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
