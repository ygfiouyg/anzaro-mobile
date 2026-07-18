/**
 * PDF Engine Utilities — Theme System, Topic Detection, Helpers
 *
 * CLEANUP NOTES:
 * - Removed hardcoded TOPIC_THEMES (8 palettes, ~120 hex colors).
 *   getDocumentTheme() now delegates to reasoningBlockToDocumentTheme()
 *   when a DesignReasoningBlock is available, or returns a minimal default.
 * - Removed hardcoded TOPIC_KEYWORDS (8 keyword arrays).
 *   detectTopic() now delegates to classifyContent() from content-classifier.ts.
 * - Removed hardcoded catMap (category mapping).
 *   Replaced by classifyContent().
 * - Removed MODEL_ULTRA_PALETTES and getModelPalette() (hardcoded model palettes).
 *   getModelPalette() now derives colors from a DesignReasoningBlock.
 * - Kept: resolveFontDir(), isRTLText(), formatDateArabic(),
 *   formatDateTimeArabic(), toArabicNumerals(), UserThemeOverrides,
 *   DocumentTheme, PdfTopicCategory.
 *
 * Arabic text processing is now handled by Playwright (CSS direction: rtl),
 * so the arabic-reshaper and bidi-js dependencies are no longer needed.
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { DesignReasoningBlock } from '@/lib/design-reasoning';
import { reasoningBlockToDocumentTheme } from '@/lib/design-reasoning';
import { classifyContent, type ContentCategory } from '@/lib/content-classifier';

// ─── Dynamic Theme System ─────────────────────────────────────────────────

// Re-export TopicCategory from dynamic-themes for consistency
export type { TopicCategory } from '@/lib/dynamic-themes';
// Also re-export the detection function for convenience
export { detectTopicCategory } from '@/lib/dynamic-themes';

/**
 * @deprecated Use ContentCategory from content-classifier.ts instead.
 * Legacy alias for backward compatibility with pdf-engine consumers.
 */
export type PdfTopicCategory = 'medical' | 'islamic' | 'scientific' | 'mathematical' | 'legal' | 'creative' | 'financial' | 'default';

/**
 * @deprecated Prefer using DesignReasoningBlock-driven themes via
 * reasoningBlockToDocumentTheme() instead of this static interface.
 * Kept for backward compatibility with pdf-engine consumers.
 */
export interface DocumentTheme {
  /** Primary accent color */
  primaryColor: string;
  /** Secondary accent color */
  secondaryColor: string;
  /** Content page background color */
  bgColor: string;
  /** Cover gradient start */
  coverFrom: string;
  /** Cover gradient end */
  coverTo: string;
  /** Accent color (matches primary or lighter variant) */
  accent: string;
  /** Light accent for backgrounds/badges */
  accentLight: string;
  /** Very light accent for alternating rows */
  accentVeryLight: string;
  /** Section header background */
  sectionBg: string;
  /** Section header text color */
  sectionText: string;
  /** Subsection border color */
  subsectionBorder: string;
  /** Note box color */
  noteColor: string;
  /** Warning box color */
  warningColor: string;
  /** Tip box color */
  tipColor: string;
  /** Body text color */
  bodyText: string;
  /** Muted text color */
  mutedText: string;
  /** Topic category name (Arabic) */
  categoryName: string;
}

/** User customization overrides */
export interface UserThemeOverrides {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  fontFamily: string;
}

// ─── Compatibility shim: TOPIC_THEMES ────────────────────────────────────
// If any consumer imports TOPIC_THEMES, provide a computed getter that
// returns palettes derived from getDefaultTheme() for every key.
// This avoids breaking imports while removing the hardcoded hex values.

/**
 * @deprecated Do not use. Will be removed in a future version.
 * Provided only as a backward-compatibility shim for consumers that
 * import TOPIC_THEMES. Each key returns the same minimal default.
 */
export const TOPIC_THEMES: Record<PdfTopicCategory, DocumentTheme> = new Proxy(
  {} as Record<PdfTopicCategory, DocumentTheme>,
  {
    get(_target, prop: string) {
      // Always return the default theme for any key — the real theme
      // should come from getDocumentTheme(reasoning) instead.
      return getDefaultTheme();
    },
  },
);

// ─── Default Theme ────────────────────────────────────────────────────────

/**
 * Return a minimal, neutral default theme.
 * This is used when no DesignReasoningBlock is available and serves
 * as a placeholder that the rendering pipeline can override.
 */
function getDefaultTheme(): DocumentTheme {
  return {
    primaryColor: '#0f172a',
    secondaryColor: '#1e3a5f',
    bgColor: '#ffffff',
    coverFrom: '#0f172a',
    coverTo: '#1e3a5f',
    accent: '#0d9488',
    accentLight: '#f0fdfa',
    accentVeryLight: '#f7fffe',
    sectionBg: '#0f172a',
    sectionText: '#ffffff',
    subsectionBorder: '#0d9488',
    noteColor: '#fffbeb',
    warningColor: '#fef2f2',
    tipColor: '#ecfdf5',
    bodyText: '#1e293b',
    mutedText: '#64748b',
    categoryName: 'عام',
  };
}

// ─── ContentCategory → PdfTopicCategory mapping ──────────────────────────

/**
 * Map a ContentCategory (from content-classifier) to the legacy PdfTopicCategory.
 * Used internally by detectTopic() for backward compatibility.
 */
function contentCategoryToPdfTopic(category: ContentCategory): PdfTopicCategory {
  const mapping: Record<ContentCategory, PdfTopicCategory> = {
    medical: 'medical',
    academic: 'scientific',
    islamic: 'islamic',
    technical: 'scientific',
    programming: 'scientific',
    business: 'financial',
    financial: 'financial',
    legal: 'legal',
    creative: 'creative',
    science: 'scientific',
    humanities: 'creative',
    general: 'default',
  };
  return mapping[category];
}

// ─── Topic Detection ─────────────────────────────────────────────────────

/**
 * Detect the topic category from content and title.
 *
 * Delegates to classifyContent() from content-classifier.ts instead of
 * using hardcoded keyword arrays. The optional `modelId` and `category`
 * parameters are kept for backward compatibility but are no longer used
 * for keyword-based detection.
 */
export function detectTopic(
  content: string,
  title: string,
  _modelId?: string,
  _category?: string,
): PdfTopicCategory {
  const classification = classifyContent(content, title);
  return contentCategoryToPdfTopic(classification.category);
}

// ─── Document Theme ──────────────────────────────────────────────────────

/**
 * Get the document theme, optionally driven by a DesignReasoningBlock.
 *
 * When a DesignReasoningBlock is provided, delegates to
 * reasoningBlockToDocumentTheme() which derives ALL colors from the
 * AI-generated visual language — no hardcoded palettes.
 *
 * When no reasoning is available, returns a minimal default theme
 * that the rendering pipeline can override.
 */
export function getDocumentTheme(
  topicOrReasoning?: PdfTopicCategory | DesignReasoningBlock,
  overrides?: Partial<UserThemeOverrides>,
): DocumentTheme {
  let base: DocumentTheme;

  // Check if the first argument is a DesignReasoningBlock
  if (topicOrReasoning && typeof topicOrReasoning === 'object' && 'visualLanguage' in topicOrReasoning) {
    base = reasoningBlockToDocumentTheme(topicOrReasoning as DesignReasoningBlock);
  } else {
    // No reasoning available — return the minimal default
    base = getDefaultTheme();
  }

  if (!overrides) return base;

  return {
    ...base,
    ...(overrides.primaryColor ? { primaryColor: overrides.primaryColor, accent: overrides.primaryColor } : {}),
    ...(overrides.secondaryColor ? { secondaryColor: overrides.secondaryColor } : {}),
    ...(overrides.bgColor ? { bgColor: overrides.bgColor } : {}),
  };
}

// ─── Model Palette ───────────────────────────────────────────────────────

/**
 * @deprecated Do not use. Will be removed in a future version.
 * Provided only as a backward-compatibility shim for consumers that
 * import MODEL_ULTRA_PALETTES.
 */
export const MODEL_ULTRA_PALETTES: Record<string, { accent: string; coverFrom: string; coverTo: string }> = new Proxy(
  {} as Record<string, { accent: string; coverFrom: string; coverTo: string }>,
  {
    get(_target, _prop: string) {
      return { accent: '#0d9488', coverFrom: '#0f172a', coverTo: '#1e3a5f' };
    },
  },
);

/**
 * Get palette derived from a DesignReasoningBlock instead of a fixed model name.
 *
 * @deprecated Prefer using getDocumentTheme(reasoning) directly.
 * This function is kept for backward compatibility but now requires
 * a DesignReasoningBlock to produce meaningful colors. When called
 * without one, it returns the default palette.
 */
export function getModelPalette(
  modelIdOrReasoning?: string | DesignReasoningBlock,
): { accent: string; coverFrom: string; coverTo: string } {
  // If a DesignReasoningBlock is passed, derive palette from it
  if (modelIdOrReasoning && typeof modelIdOrReasoning === 'object' && 'visualLanguage' in modelIdOrReasoning) {
    const theme = reasoningBlockToDocumentTheme(modelIdOrReasoning as DesignReasoningBlock);
    return {
      accent: theme.accent,
      coverFrom: theme.coverFrom,
      coverTo: theme.coverTo,
    };
  }

  // No reasoning — return default palette
  return { accent: '#0d9488', coverFrom: '#0f172a', coverTo: '#1e3a5f' };
}

// ─── Utility Functions ───────────────────────────────────────────────────

/**
 * Resolve font directory with fallback candidates
 */
export function resolveFontDir(): string {
  const candidates = [
    join(process.cwd(), 'src', 'lib', 'pdf-engine', 'fonts'),
    join(process.cwd(), 'fonts'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error('Font directory not found!');
}

/**
 * Check if text is primarily RTL (Arabic)
 */
export function isRTLText(text: string): boolean {
  if (!text) return false;
  const arabicChars = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
  const latinChars = text.match(/[a-zA-Z]/g);
  const arCount = arabicChars ? arabicChars.length : 0;
  const laCount = latinChars ? latinChars.length : 0;
  return arCount > laCount;
}

/**
 * Format date in Arabic
 */
export function formatDateArabic(date: Date = new Date()): string {
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format date and time in Arabic
 */
export function formatDateTimeArabic(date: Date = new Date()): string {
  const dateStr = formatDateArabic(date);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? 'مساءً' : 'صباحاً';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${dateStr} — ${displayHours}:${minutes} ${period}`;
}

/**
 * Convert Arabic numerals to Arabic-Indic numerals for RTL context
 */
export function toArabicNumerals(num: number | string): string {
  const western = String(num);
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return western.replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)]);
}
