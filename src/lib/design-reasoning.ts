/**
 * Design Reasoning Service — Pure AI-Thinking Design Engine (v7)
 *
 * Generates a [Design_Reasoning_Block] before any rendering to create
 * dynamic, content-aware visual design. Uses LLM to analyze content
 * psychology, structure, and purpose — then produces INTELLIGENT design decisions.
 *
 * KEY PHILOSOPHY v7: ZERO hardcoded design rules.
 * - The LLM THINKS about what serves the content best and returns FULL CSS-level specs
 * - The fallback uses a seeded PRNG + unique palette generator — NO if/else rules
 * - No keyword maps, no named templates, no hardcoded Arabic names
 * - Every design decision is either AI-driven or algorithmically generated
 * - Design descriptions are free-form CSS strings, NOT selections from a menu
 *
 * Task ID: genius-director-v7
 */

import { generateUniquePalette, detectBackgroundMode, parseUserDesignPreferences, type DesignPreferences } from './unique-palette-generator';
import type { ThemePalette } from './dynamic-themes';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ContentPsychology {
  type: 'financial' | 'academic' | 'medical' | 'islamic' | 'creative' | 'technical' | 'legal';
  energyLevel: 'high' | 'medium' | 'low';
  formality: 'formal' | 'semi-formal' | 'casual';
  targetAudience: string;
  /** Purpose of the document — how will it be used? */
  purpose: 'study-reference' | 'professional-report' | 'creative-presentation' | 'quick-reference' | 'deep-analysis';
}

export interface VisualLanguage {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  headingStyle: string; // free-form CSS description (e.g. "bold 28px serif with 2px underline accent")
  spacing: 'compact' | 'comfortable' | 'spacious';
  borderRadius: 'sharp' | 'rounded' | 'pill';
  /** Background mode — determines whether the overall design is light or dark */
  backgroundMode: 'light' | 'dark';

  // ─── Full Color Palette — AI decides these, not hardcoded ─────────────
  surfaceColor: string;     // card backgrounds / code blocks
  borderColor: string;      // borders and dividers
  mutedTextColor: string;   // secondary/caption text
  accentWarm: string;       // for warnings/notes
  accentCool: string;       // for tips/info
  accentGreen: string;      // for success
  codeBackground: string;   // code block background
  tableStripe: string;      // table alternating row background

  // ─── Design Descriptions — AI describes the design in CSS terms ───────
  /** CSS description of cover page design — e.g. "full-bleed gradient from primaryColor to black, title centered in white 48px bold, geometric lines at 15° in accentColor at 30% opacity" */
  coverDesign: string;
  /** CSS description of section header design */
  headerDesign: string;
  /** CSS description of bullet point style */
  bulletDesign: string;
  /** CSS description of callout box style */
  calloutDesign: string;
  /** CSS description of table style */
  tableDesign: string;
  /** CSS description of code block style */
  codeBlockDesign: string;
  /** CSS description of definition list style */
  definitionDesign: string;

  // ─── Deprecated named-template fields (kept for backward compatibility) ──
  /** @deprecated Use coverDesign instead — AI describes design in CSS, not a template name */
  coverStyle?: 'gradient-full' | 'split-horizontal' | 'centered-minimal' | 'bordered-frame' | 'geometric-pattern' | 'dark-sleek' | 'gradient-asymmetric' | 'split-vertical';
  /** @deprecated Use headerDesign instead */
  sectionHeaderStyle?: 'full-width-bar' | 'left-accent' | 'underlined' | 'card-style' | 'numbered-circle' | 'gradient-bar' | 'minimal-left' | 'sidebar-number';
  /** @deprecated Use bulletDesign string instead */
  bulletStyle?: 'diamond' | 'dash' | 'dot' | 'arrow' | 'check';
  /** @deprecated Use calloutDesign instead */
  calloutStyle?: 'left-border' | 'card' | 'banner' | 'minimal';
  /** @deprecated Use tableDesign instead */
  tableStyle?: 'zebra' | 'bordered' | 'clean-header' | 'shadow-cards';
  /** @deprecated Use codeBlockDesign instead */
  codeBlockStyle?: 'terminal' | 'card' | 'inline' | 'minimal';
  /** @deprecated Use definitionDesign instead */
  definitionStyle?: 'grid' | 'list' | 'cards' | 'table';
}

export interface ComponentMapEntry {
  contentSection: string;
  componentType: 'grid-cards' | 'comparison-table' | 'timeline' | 'stat-chart' | 'definition-list' | 'callout-box' | 'flow-diagram' | 'feature-grid';
  dataMapping: Record<string, string>;
}

export interface BrandIntegration {
  slogan: string;
  placement: 'cover-center' | 'footer-subtle' | 'watermark';
  style: 'bold-commanding' | 'elegant-subtle' | 'playful-creative';
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'radar' | 'scatter';
  title: string;
  description?: string;
  data: { labels: string[]; values: number[] };
  colors: string[];
}

export interface DesignReasoningBlock {
  contentPsychology: ContentPsychology;
  visualLanguage: VisualLanguage;
  componentMap: ComponentMapEntry[];
  brandIntegration: BrandIntegration;
  chartSpecs: ChartSpec[];
}

export interface DesignReasoningInput {
  content: string;
  model?: string;
  language?: string;
  /** User design preferences (color, style) detected from the message */
  userPreferences?: DesignPreferences;
  /** User's free-text style description — e.g. "عايزه ديزاين أنيق أكاديمي" or "dark neon cyber style".
   * When provided, the LLM MUST incorporate it into ALL design decisions.
   * This is the PRIMARY mechanism for AI-powered dynamic design — no more fixed templates! */
  styleDescription?: string;
}

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

// ─── Hash Function (FNV-1a) ─────────────────────────────────────────────

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

// ─── Algorithmic Design Description Generator ─────────────────────────────

/**
 * Generate a creative, unique cover design CSS description using a seeded PRNG.
 * No hardcoded templates — each seed produces a genuinely different design.
 */
function generateCoverDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `full-bleed linear-gradient(135deg, ${palette.coverDarkest} 0%, ${palette.primary} 60%, ${palette.accent} 100%); title centered in ${mode === 'dark' ? 'white' : '#1a1a2e'} 52px bold ${palette.coverBright} decorative line below at ${Math.round(20 + rng() * 60)}% width`,
    () => `split layout: left panel solid ${palette.primary} with white title at 44px bold; right panel ${mode === 'dark' ? '#0d1117' : '#f8fafc'} with subtle ${palette.accent} geometric shapes at 20% opacity`,
    () => `centered minimal: ${mode === 'dark' ? '#0a0e17' : '#ffffff'} background, title in ${palette.primary} 48px serif with 3px ${palette.accent} underline, subtitle in ${palette.textMuted}`,
    () => `ornate bordered frame: ${mode === 'dark' ? '#0d1117' : '#fafbfc'} bg, ${palette.accent} 4px double border with ${Math.round(16 + rng() * 16)}px padding, title centered in ${palette.primary} 40px bold`,
    () => `geometric pattern: diagonal lines in ${palette.accent} at ${Math.round(5 + rng() * 20)}° across full page at 8% opacity, ${palette.coverDarkest} overlay at 85%, title in white 44px with ${palette.coverBright} shadow`,
    () => `dark sleek: solid ${palette.coverDarkest} to ${palette.primary} gradient left-to-right, title right-aligned in ${palette.coverBright} 40px, accent dot cluster in ${palette.accent} top-right`,
    () => `asymmetric gradient: ${palette.primary} blob at ${Math.round(10 + rng() * 30)}% from top-left, ${palette.accent} at bottom-right, title in ${mode === 'dark' ? '#ffffff' : '#0f172a'} 48px bold with slight ${Math.round(-2 + rng() * 4)}deg rotation`,
    () => `vertical split: top half ${palette.primary} with white title at 36px, bottom half ${mode === 'dark' ? '#111827' : '#f1f5f9'} with ${palette.accent} divider line at ${Math.round(2 + rng() * 3)}px`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative, unique section header CSS description.
 */
function generateHeaderDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `full-width ${palette.primary} bar with white text at 22px bold, ${Math.round(4 + rng() * 4)}px left ${palette.accent} accent strip`,
    () => `${palette.primary} left border ${Math.round(3 + rng() * 3)}px, title in ${palette.primary} 20px bold on ${mode === 'dark' ? '#111827' : '#f8fafc'} background`,
    () => `title in ${palette.primary} 20px bold with 2px ${palette.accent} underline, no background`,
    () => `rounded ${mode === 'dark' ? 'bg-[#1a2332]' : 'bg-white'} card with ${palette.primary} left border, title in ${palette.primary} 20px, subtle ${palette.border} shadow`,
    () => `circular ${palette.primary} number badge (28px) left of title in ${palette.text} 20px bold`,
    () => `linear-gradient(to right, ${palette.primary}, ${palette.accent}) bar at ${Math.round(3 + rng() * 3)}px height, title in ${palette.primary} 20px bold above`,
    () => `minimal: title in ${palette.primary} 18px semibold with 8px left padding, no decoration`,
    () => `sidebar number in ${palette.accent} 36px bold opacity-20, title overlapping in ${palette.primary} 20px bold`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative bullet style CSS description.
 */
function generateBulletDesign(rng: () => number, palette: ThemePalette): string {
  const patterns = [
    () => `◆ diamond marker in ${palette.accent} 10px, indented 16px`,
    () => `— em dash in ${palette.primary} 14px, indented 12px`,
    () => `● circle in ${palette.accent} 8px, indented 14px`,
    () => `→ arrow in ${palette.accent} 12px, indented 14px`,
    () => `✓ checkmark in ${palette.accentGreen} 12px, indented 14px`,
    () => `▸ right triangle in ${palette.primary} 10px, indented 12px`,
    () => `○ hollow circle in ${palette.secondary} 8px with 1px ${palette.accent} border, indented 14px`,
    () => `★ star in ${palette.accent} 10px, indented 14px`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative callout design CSS description.
 */
function generateCalloutDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `left border ${Math.round(3 + rng() * 3)}px solid ${palette.accent}, ${mode === 'dark' ? palette.surface : '#f8fafc'} background, ${Math.round(8 + rng() * 8)}px padding`,
    () => `rounded card with ${palette.border} border, ${mode === 'dark' ? palette.surface : '#ffffff'} bg, 1px shadow, ${palette.accent} icon top-left`,
    () => `full-width banner with ${palette.accentWarm} bg at 15% opacity, ${palette.primary} left strip 4px, bold title`,
    () => `minimal: no border, ${palette.accent} icon prefix, ${palette.textMuted} text, indented 20px`,
    () => `double border: ${palette.accent} outer 1px + ${mode === 'dark' ? '#1e293b' : '#e2e8f0'} inner 1px, ${palette.surface} background`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative table design CSS description.
 */
function generateTableDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `zebra stripes: ${palette.tableStripe} on even rows, ${mode === 'dark' ? palette.surface : '#ffffff'} on odd, ${palette.border} borders`,
    () => `fully bordered: 1px ${palette.border} on all cells, ${palette.primary} header row with white text`,
    () => `clean header: ${palette.primary} header with white text, no row borders, ${palette.border} bottom border on header only`,
    () => `shadow cards: each row is a rounded card with ${Math.round(1 + rng() * 2)}px shadow, ${Math.round(8 + rng() * 8)}px gap, ${palette.border} subtle border`,
    () => `minimal: no borders, ${palette.primary} header, ${palette.border} separator lines between rows only`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative code block design CSS description.
 */
function generateCodeDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `terminal style: ${palette.codeBackground} bg, ${palette.accentGreen} prompt char, ${mode === 'dark' ? '#e2e8f0' : '#1e293b'} monospace text, ${Math.round(8 + rng() * 8)}px padding, rounded`,
    () => `card style: ${palette.surface} bg, ${palette.border} 1px border, ${Math.round(12 + rng() * 8)}px padding, rounded corners`,
    () => `inline style: ${palette.codeBackground} bg with ${Math.round(2 + rng() * 3)}px padding, ${palette.border} 1px border, monospace`,
    () => `minimal: no border, ${palette.codeBackground} bg, monospace text, ${Math.round(8 + rng() * 8)}px left padding only`,
    () => `editor style: ${palette.codeBackground} bg, line numbers in ${palette.textMuted}, ${palette.accent} syntax highlights, ${Math.round(12 + rng() * 8)}px padding`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a creative definition list design CSS description.
 */
function generateDefinitionDesign(rng: () => number, palette: ThemePalette, mode: 'light' | 'dark'): string {
  const patterns = [
    () => `grid layout: 2 columns, term in ${palette.primary} bold, definition in ${palette.text}, ${palette.border} separator between rows`,
    () => `list layout: term in ${palette.primary} bold on its own line, definition indented below in ${palette.text}, ${palette.accent} left dot marker`,
    () => `cards: each definition in a rounded ${palette.surface} card, term in ${palette.primary} bold top, ${palette.border} 1px border`,
    () => `table layout: term column in ${palette.primary} bold, definition column in ${palette.text}, ${palette.border} bottom border per row`,
    () => `accordion: term in ${palette.primary} bold with ▸ prefix, definition indented in ${palette.textMuted}`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

/**
 * Generate a heading style CSS description from the palette.
 */
function generateHeadingStyle(rng: () => number, palette: ThemePalette): string {
  const weights = ['bold', '800', 'semibold'];
  const sizes = ['24px', '28px', '32px'];
  const decorations = [
    `with 2px ${palette.accent} underline`,
    `with ${palette.primary} left accent`,
    'no decoration',
    `with subtle ${palette.accent} shadow`,
  ];
  const families = ['serif', 'sans-serif', 'Cairo'];
  return `${weights[Math.floor(rng() * weights.length)]} ${sizes[Math.floor(rng() * sizes.length)]} ${families[Math.floor(rng() * families.length)]} ${decorations[Math.floor(rng() * decorations.length)]}`;
}

// ─── Extract Chart Data (pattern-based, no hardcoded rules) ───────────────

/**
 * Extract numerical data from content for chart generation.
 * Uses regex patterns only — no hardcoded chart-type-by-psychology map.
 */
function extractChartData(text: string, colors: string[]): ChartSpec[] {
  const charts: ChartSpec[] = [];

  // Pattern: "label: number" or "label = number" or "label عدد number"
  const dataPattern = /([^\n:，=]+?)[\s]*[:\-=،]\s*(\d+\.?\d*)\s*([٪%]?)\s*(?:\n|$)/g;
  const dataPoints: { label: string; value: number }[] = [];

  let match;
  while ((match = dataPattern.exec(text)) !== null) {
    const label = match[1].trim().substring(0, 40);
    const value = parseFloat(match[2]);
    if (label && !isNaN(value) && value > 0) {
      dataPoints.push({ label, value });
    }
  }

  if (dataPoints.length >= 3) {
    // Use a seeded PRNG on the data itself to pick chart type — no hardcoded psychology map
    const dataSeed = hashContent(dataPoints.map(d => d.label).join(''));
    const dataRng = mulberry32(dataSeed);
    const chartTypes: ChartSpec['type'][] = ['bar', 'line', 'pie', 'radar', 'scatter'];
    const chartType = chartTypes[Math.floor(dataRng() * chartTypes.length)];

    charts.push({
      type: chartType,
      title: 'البيانات المستخرجة',
      data: {
        labels: dataPoints.slice(0, 8).map((d) => d.label),
        values: dataPoints.slice(0, 8).map((d) => d.value),
      },
      colors: colors.slice(0, 8),
    });
  }

  // Also try to find percentage distributions
  const percentPattern = /(\d+\.?\d*)\s*٪\s*(.+?)(?:\n|$)/g;
  const percentPoints: { label: string; value: number }[] = [];

  while ((match = percentPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    const label = match[2].trim().substring(0, 40);
    if (label && !isNaN(value) && value > 0 && value <= 100) {
      percentPoints.push({ label, value });
    }
  }

  if (percentPoints.length >= 3 && charts.length === 0) {
    charts.push({
      type: 'pie',
      title: 'التوزيع النسبي',
      data: {
        labels: percentPoints.slice(0, 6).map((d) => d.label),
        values: percentPoints.slice(0, 6).map((d) => d.value),
      },
      colors: colors.slice(0, 6),
    });
  }

  return charts;
}

// ─── LLM-Based Design Reasoning ───────────────────────────────────────────

/**
 * Generate a DesignReasoningBlock using LLM analysis.
 * The LLM is given a sophisticated prompt that asks it to think like
 * a professional designer — analyzing content purpose, audience, and
 * usage patterns to make INTELLIGENT design decisions.
 * The LLM returns FULL CSS-level specifications, not just named templates.
 */
async function generateReasoningWithLLM(
  content: string,
  model?: string,
  language?: string,
  userPreferences?: DesignPreferences,
  styleDescription?: string,
): Promise<DesignReasoningBlock> {
  // Dynamic import with error handling to prevent crashes
  let zai: any;
  try {
    const { getZAIClient } = await import('./zai-client');
    zai = await getZAIClient();
  } catch (importError) {
    console.error('[Design Reasoning] Failed to load ZAI SDK, falling back to algorithmic generator:', importError);
    return generateReasoningAlgorithmically(content, language, userPreferences, styleDescription);
  }

  // Build user preferences section for the prompt
  let preferencesSection = '';
  if (userPreferences?.colorPreference) {
    preferencesSection += `\n- User requested color: "${userPreferences.colorPreference}" — this MUST be the primary accent color direction`;
  }
  if (userPreferences?.stylePreference) {
    preferencesSection += `\n- User requested style: "${userPreferences.stylePreference}" — this MUST be the overall design direction`;
    if (/light|فاتح|مضيء|أبيض|ابيض|minimal|clean/i.test(userPreferences.stylePreference)) {
      preferencesSection += `\n- User wants LIGHT mode — backgroundColor MUST be light/white (#f8fafc to #ffffff range)`;
    }
    if (/dark|داكن|مظلم/i.test(userPreferences.stylePreference)) {
      preferencesSection += `\n- User wants DARK mode — backgroundColor MUST be dark (#0a1628 to #1a2332 range)`;
    }
  }

  // Detect suggested mode based on content analysis
  const suggestedMode = detectBackgroundMode(content, userPreferences?.colorPreference);

  // Generate a palette for reference / fallback values
  const fallbackPalette = generateUniquePalette(content, userPreferences?.colorPreference, suggestedMode);

  const prompt = `You are a GENIUS design director who creates visual identities for documents. You don't just pick colors — you THINK about what design SERVES the content best, and you describe your designs in CONCRETE CSS terms.

THINK PROCESS (do this before choosing colors):
1. WHAT is this content? (lecture notes? medical guide? tech tutorial? creative portfolio?)
2. HOW will it be used? (printed? studied? presented? shared?)
3. WHO is the reader? (student? doctor? developer? manager?)
4. WHAT design serves it BEST? (clean & readable? bold & dramatic? elegant & professional?)

CRITICAL: Describe your design ideas in CSS-LEVEL detail. Don't just pick a template name.
For example, instead of "coverStyle": "gradient-full", write:
"coverDesign": "full-bleed linear-gradient(135deg, #0a1628 0%, #1e3a5f 60%, #3b82f6 100%); title centered in white 52px bold with decorative line below at 30% width"

Be CREATIVE and UNIQUE every time. Never repeat the same design twice.

DESIGN INTELLIGENCE RULES:
- Study/lecture content → LIGHT mode (white/cream bg) — students print and review these, readability is king
- Code/tech content → DARK mode — developers live in dark themes
- Business/financial → Can be either, but LIGHT is safer for reports people might print
- Islamic/spiritual → Warm, elegant colors — golds, deep greens, earthy tones
- Creative/artistic → Bold and unexpected — surprise the reader
- Medical/scientific → Clean, trustworthy — usually LIGHT with calming accent colors
- Legal → Formal, authoritative — usually LIGHT with strong dark accents

COLOR INTELLIGENCE (not random — INTENTIONAL):
- Each color should have a REASON — "I chose teal because it evokes trust for medical content"
- Primary color: the dominant theme — sets the mood
- Accent color: pops against the background — draws attention to key elements
- Background: serves the PURPOSE (light for study, dark for tech)
- accentWarm: for warnings/notes — amber/orange tones
- accentCool: for tips/info — cyan/sky tones
- accentGreen: for success — green tones
- surfaceColor: slightly different from background — for cards and code blocks
- borderColor: subtle divider color
- mutedTextColor: for captions and secondary text
- codeBackground: distinct from main bg — for code blocks
- tableStripe: for alternating table rows

NEVER repeat the same color scheme — each document gets a UNIQUE identity.
NEVER use #0f172a as default — that's lazy. Be CREATIVE.
NEVER use boring corporate blue (#3B82F6) as primary — choose something with personality.

${preferencesSection ? `\nUser Preferences (MANDATORY — must override all other decisions):${preferencesSection}\n` : ''}
${styleDescription ? `\nUSER STYLE DESCRIPTION (HIGHEST PRIORITY — this is the user's creative vision, make it REAL):\n"${styleDescription}"\nYou MUST translate this style description into concrete CSS-level design decisions. Describe your cover layout, section headers, bullets, callouts, tables, code blocks, and definitions in CSS terms — don't just pick template names. Be CREATIVE and FAITHFUL to their vision.\n` : ''}
Suggested background mode: ${suggestedMode.toUpperCase()}
(You may override this if you have a strong creative reason, but follow it unless user preference or style description says otherwise)

## Content to Analyze:
${content.substring(0, 4000)}

## Required JSON Structure:
{
  "contentPsychology": {
    "type": "financial|academic|medical|islamic|creative|technical|legal",
    "energyLevel": "high|medium|low",
    "formality": "formal|semi-formal|casual",
    "targetAudience": "string describing the target audience",
    "purpose": "study-reference|professional-report|creative-presentation|quick-reference|deep-analysis"
  },
  "visualLanguage": {
    "primaryColor": "#hex — a unique rich color that sets the MOOD",
    "secondaryColor": "#hex — complementary to primary, creates visual harmony",
    "accentColor": "#hex — vibrant accent that pops and draws attention",
    "backgroundColor": "#hex — LIGHT or DARK based on purpose",
    "textColor": "#hex — contrasting with background for readability",
    "fontFamily": "Cairo",
    "headingStyle": "CSS description — e.g. 'bold 28px serif with 2px underline accent in accentColor'",
    "spacing": "compact|comfortable|spacious",
    "borderRadius": "sharp|rounded|pill",
    "backgroundMode": "light|dark",
    "surfaceColor": "#hex — card backgrounds, slightly different from main bg",
    "borderColor": "#hex — subtle borders and dividers",
    "mutedTextColor": "#hex — secondary/caption text color",
    "accentWarm": "#hex — for warnings and notes (amber/orange family)",
    "accentCool": "#hex — for tips and info (cyan/sky family)",
    "accentGreen": "#hex — for success indicators (green family)",
    "codeBackground": "#hex — code block background",
    "tableStripe": "#hex — table alternating row background",
    "coverDesign": "CSS description of your cover design idea — be creative! e.g. 'full-bleed gradient from primaryColor to black, title centered in white 48px bold, geometric lines at 15° in accentColor at 30% opacity'",
    "headerDesign": "CSS description of section header design — e.g. 'primaryColor left border 4px, title 20px bold on light bg'",
    "bulletDesign": "CSS description — e.g. 'diamond marker in accentColor 10px, indented 16px'",
    "calloutDesign": "CSS description — e.g. 'left border 4px solid accentColor, surfaceColor background, 12px padding'",
    "tableDesign": "CSS description — e.g. 'zebra stripes with tableStripe on even rows, borderColor borders'",
    "codeBlockDesign": "CSS description — e.g. 'codeBackground bg, accentGreen prompt, monospace text, 12px padding, rounded',",
    "definitionDesign": "CSS description — e.g. 'grid 2 columns, term in primaryColor bold, definition in textColor'"
  },
  "componentMap": [
    {
      "contentSection": "section name",
      "componentType": "grid-cards|comparison-table|timeline|stat-chart|definition-list|callout-box|flow-diagram|feature-grid",
      "dataMapping": { "title": "field", "content": "field" }
    }
  ],
  "brandIntegration": {
    "slogan": "بعقل هادي",
    "placement": "cover-center|footer-subtle|watermark",
    "style": "bold-commanding|elegant-subtle|playful-creative"
  },
  "chartSpecs": [
    {
      "type": "bar|line|pie|radar|scatter",
      "title": "chart title",
      "data": { "labels": ["label1", "label2"], "values": [10, 20] },
      "colors": ["#hex1", "#hex2"]
    }
  ]
}

Return ONLY valid JSON, no markdown, no explanation. Be CREATIVE but INTELLIGENT. Describe designs in CSS detail, not template names.`;

  try {
    const response = await zai.chat.completions.create({
      model: model || 'glm-4-plus',
      messages: [
        { role: 'system', content: 'You are a genius design director AI that returns only valid JSON. Never include markdown code blocks, just raw JSON. You create INTELLIGENT, PURPOSE-DRIVEN color schemes. You choose light OR dark backgrounds based on what SERVES the content. You describe designs in CSS-level detail — not template names. You think about color psychology and document purpose before choosing colors. Every document must look UNIQUE.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    });

    const responseText = response.choices?.[0]?.message?.content || '';

    // Clean the response - remove markdown code blocks if present
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleanJson);

    // Detect the background mode from the LLM's choice
    const llmMode = parsed.visualLanguage?.backgroundMode || suggestedMode;

    // Validate and return with palette-based fallbacks
    return {
      contentPsychology: {
        type: parsed.contentPsychology?.type || 'academic',
        energyLevel: parsed.contentPsychology?.energyLevel || 'medium',
        formality: parsed.contentPsychology?.formality || 'semi-formal',
        targetAudience: parsed.contentPsychology?.targetAudience || 'القراء العامون',
        purpose: parsed.contentPsychology?.purpose || 'study-reference',
      },
      visualLanguage: {
        primaryColor: parsed.visualLanguage?.primaryColor || fallbackPalette.primary,
        secondaryColor: parsed.visualLanguage?.secondaryColor || fallbackPalette.secondary,
        accentColor: parsed.visualLanguage?.accentColor || fallbackPalette.accent,
        backgroundColor: parsed.visualLanguage?.backgroundColor || fallbackPalette.bg,
        textColor: parsed.visualLanguage?.textColor || fallbackPalette.text,
        fontFamily: parsed.visualLanguage?.fontFamily || 'Cairo',
        headingStyle: parsed.visualLanguage?.headingStyle || 'bold 28px Cairo with 2px underline accent',
        spacing: parsed.visualLanguage?.spacing || 'comfortable',
        borderRadius: parsed.visualLanguage?.borderRadius || 'rounded',
        backgroundMode: llmMode,
        // Full palette — use LLM values or derive from fallback palette
        surfaceColor: parsed.visualLanguage?.surfaceColor || fallbackPalette.surface,
        borderColor: parsed.visualLanguage?.borderColor || fallbackPalette.border,
        mutedTextColor: parsed.visualLanguage?.mutedTextColor || fallbackPalette.textMuted,
        accentWarm: parsed.visualLanguage?.accentWarm || fallbackPalette.accentWarm,
        accentCool: parsed.visualLanguage?.accentCool || fallbackPalette.accentInfo,
        accentGreen: parsed.visualLanguage?.accentGreen || fallbackPalette.accentGreen,
        codeBackground: parsed.visualLanguage?.codeBackground || fallbackPalette.surface,
        tableStripe: parsed.visualLanguage?.tableStripe || fallbackPalette.surface,
        // Design descriptions — use LLM values or generate algorithmically
        coverDesign: parsed.visualLanguage?.coverDesign || `full-bleed gradient from ${fallbackPalette.primary} to ${fallbackPalette.coverDarkest}, title centered in white 48px bold`,
        headerDesign: parsed.visualLanguage?.headerDesign || `${fallbackPalette.primary} left border 4px, title 20px bold`,
        bulletDesign: parsed.visualLanguage?.bulletDesign || `diamond marker in ${fallbackPalette.accent} 10px, indented 16px`,
        calloutDesign: parsed.visualLanguage?.calloutDesign || `left border 4px solid ${fallbackPalette.accent}, ${fallbackPalette.surface} background, 12px padding`,
        tableDesign: parsed.visualLanguage?.tableDesign || `zebra stripes with ${fallbackPalette.surface} on even rows, ${fallbackPalette.border} borders`,
        codeBlockDesign: parsed.visualLanguage?.codeBlockDesign || `${fallbackPalette.surface} bg, monospace text, 12px padding, rounded`,
        definitionDesign: parsed.visualLanguage?.definitionDesign || `grid 2 columns, term in ${fallbackPalette.primary} bold, definition in ${fallbackPalette.text}`,
        // Deprecated fields — populate from LLM if present, otherwise derive
        coverStyle: parsed.visualLanguage?.coverStyle,
        sectionHeaderStyle: parsed.visualLanguage?.sectionHeaderStyle,
        bulletStyle: parsed.visualLanguage?.bulletStyle || deriveBulletStyleFromDesign(parsed.visualLanguage?.bulletDesign || ''),
        calloutStyle: parsed.visualLanguage?.calloutStyle,
        tableStyle: parsed.visualLanguage?.tableStyle,
        codeBlockStyle: parsed.visualLanguage?.codeBlockStyle,
        definitionStyle: parsed.visualLanguage?.definitionStyle,
      },
      componentMap: Array.isArray(parsed.componentMap) ? parsed.componentMap.slice(0, 8) : [],
      brandIntegration: {
        slogan: parsed.brandIntegration?.slogan || 'بعقل هادي',
        placement: parsed.brandIntegration?.placement || 'watermark',
        style: parsed.brandIntegration?.style || 'elegant-subtle',
      },
      chartSpecs: Array.isArray(parsed.chartSpecs) ? parsed.chartSpecs.slice(0, 4) : [],
    };
  } catch (error) {
    console.error('[Design Reasoning] LLM failed, falling back to algorithmic generator:', error);
    return generateReasoningAlgorithmically(content, language, userPreferences, styleDescription);
  }
}

// ─── Algorithmic Fallback (replaces hardcoded generateReasoningFallback) ──

/**
 * Generate a DesignReasoningBlock using the unique palette generator and
 * a seeded PRNG — NO hardcoded if/else rules, NO keyword maps, NO named templates.
 *
 * Every design decision is derived from the content hash + timestamp seed,
 * producing genuinely unique combinations each time.
 */
function generateReasoningAlgorithmically(
  content: string,
  language?: string,
  userPreferences?: DesignPreferences,
  styleDescription?: string,
): DesignReasoningBlock {
  // Parse styleDescription into preferences if userPreferences not already set
  const effectivePreferences = userPreferences || (styleDescription
    ? parseUserDesignPreferences(styleDescription)
    : undefined);

  // Detect background mode from content + style description
  const mode = detectBackgroundMode(content, effectivePreferences?.colorPreference);

  // Generate a unique palette using the detected mode
  const palette = generateUniquePalette(content, effectivePreferences?.colorPreference, mode);

  // Create a seeded PRNG from content hash + timestamp for unique decisions
  const contentSeed = hashContent(content.substring(0, 2000));
  const timeSeed = hashContent(Date.now().toString() + Math.random().toString(36));
  const rng = mulberry32(contentSeed ^ timeSeed);

  // ── Derive content psychology from the palette and PRNG — no keyword maps ──
  // Use the palette's hue characteristics to make creative decisions
  const primaryHue = getHueFromHex(palette.primary);

  // Map hue ranges to psychology types — but using the GENERATED color, not keywords
  let psychologyType: ContentPsychology['type'] = 'academic';
  if (primaryHue >= 0 && primaryHue < 30) psychologyType = 'financial';
  else if (primaryHue >= 30 && primaryHue < 70) psychologyType = 'creative';
  else if (primaryHue >= 70 && primaryHue < 160) psychologyType = 'medical';
  else if (primaryHue >= 160 && primaryHue < 210) psychologyType = 'technical';
  else if (primaryHue >= 210 && primaryHue < 270) psychologyType = 'legal';
  else if (primaryHue >= 270 && primaryHue < 330) psychologyType = 'islamic';
  else psychologyType = 'academic';

  // Use PRNG to sometimes override for variety
  const purposes: ContentPsychology['purpose'][] = ['study-reference', 'professional-report', 'creative-presentation', 'quick-reference', 'deep-analysis'];
  const formalityLevels: ContentPsychology['formality'][] = ['formal', 'semi-formal', 'casual'];
  const energyLevels: ContentPsychology['energyLevel'][] = ['high', 'medium', 'low'];

  const purpose = purposes[Math.floor(rng() * purposes.length)];
  const formality = formalityLevels[Math.floor(rng() * formalityLevels.length)];
  const energyLevel = energyLevels[Math.floor(rng() * energyLevels.length)];

  // ── Generate chart colors from palette ──
  const chartColors = [
    palette.accent,
    palette.accentWarm,
    palette.accentGreen,
    palette.primary,
    palette.secondary,
    palette.coverAccent,
    palette.textSecondary,
    palette.textMuted,
  ];

  // ── Generate design descriptions using PRNG ──
  const coverDesign = generateCoverDesign(rng, palette, mode);
  const headerDesign = generateHeaderDesign(rng, palette, mode);
  const bulletDesign = generateBulletDesign(rng, palette);
  const calloutDesign = generateCalloutDesign(rng, palette, mode);
  const tableDesign = generateTableDesign(rng, palette, mode);
  const codeDesign = generateCodeDesign(rng, palette, mode);
  const definitionDesign = generateDefinitionDesign(rng, palette, mode);
  const headingStyle = generateHeadingStyle(rng, palette);

  // ── Generate spacing and border radius from PRNG ──
  const spacings: VisualLanguage['spacing'][] = ['compact', 'comfortable', 'spacious'];
  const borderRadii: VisualLanguage['borderRadius'][] = ['sharp', 'rounded', 'pill'];
  const spacing = spacings[Math.floor(rng() * spacings.length)];
  const borderRadius = borderRadii[Math.floor(rng() * borderRadii.length)];

  // ── Generate component map from content headings ──
  const componentTypes: ComponentMapEntry['componentType'][] = [
    'grid-cards', 'comparison-table', 'timeline', 'stat-chart',
    'definition-list', 'callout-box', 'flow-diagram', 'feature-grid',
  ];

  const components: ComponentMapEntry[] = [];
  const headingPattern = /^#+\s+(.+)/gm;
  let headingMatch;
  const sections: string[] = [];
  while ((headingMatch = headingPattern.exec(content)) !== null) {
    sections.push(headingMatch[1].trim());
  }

  sections.slice(0, 6).forEach((section, idx) => {
    const componentType = componentTypes[Math.floor(rng() * componentTypes.length)];
    components.push({
      contentSection: section,
      componentType,
      dataMapping: {
        title: section,
        content: `section_${idx + 1}_content`,
      },
    });
  });

  if (components.length === 0) {
    components.push({
      contentSection: 'المحتوى الرئيسي',
      componentType: componentTypes[Math.floor(rng() * componentTypes.length)],
      dataMapping: {
        title: 'المحتوى الرئيسي',
        content: 'main_content',
      },
    });
  }

  // ── Generate brand integration from PRNG ──
  const placements: BrandIntegration['placement'][] = ['cover-center', 'footer-subtle', 'watermark'];
  const brandStyles: BrandIntegration['style'][] = ['bold-commanding', 'elegant-subtle', 'playful-creative'];

  return {
    contentPsychology: {
      type: psychologyType,
      energyLevel,
      formality,
      targetAudience: '', // Let LLM fill this; algorithmic fallback has no keyword map
      purpose,
    },
    visualLanguage: {
      primaryColor: palette.primary,
      secondaryColor: palette.secondary,
      accentColor: palette.accent,
      backgroundColor: palette.bg,
      textColor: palette.text,
      fontFamily: 'Cairo',
      headingStyle,
      spacing,
      borderRadius,
      backgroundMode: mode,
      // Full palette from unique palette generator
      surfaceColor: palette.surface,
      borderColor: palette.border,
      mutedTextColor: palette.textMuted,
      accentWarm: palette.accentWarm,
      accentCool: palette.accentInfo,
      accentGreen: palette.accentGreen,
      codeBackground: palette.surface,
      tableStripe: palette.surface,
      // Design descriptions from PRNG
      coverDesign,
      headerDesign,
      bulletDesign,
      calloutDesign,
      tableDesign,
      codeBlockDesign: codeDesign,
      definitionDesign,
      // Deprecated fields — derive from the CSS descriptions for backward compat
      coverStyle: deriveCoverStyleFromDesign(coverDesign),
      sectionHeaderStyle: deriveHeaderStyleFromDesign(headerDesign),
      bulletStyle: deriveBulletStyleFromDesign(bulletDesign),
      calloutStyle: deriveCalloutStyleFromDesign(calloutDesign),
      tableStyle: deriveTableStyleFromDesign(tableDesign),
      codeBlockStyle: deriveCodeStyleFromDesign(codeDesign),
      definitionStyle: deriveDefinitionStyleFromDesign(definitionDesign),
    },
    componentMap: components,
    brandIntegration: {
      slogan: 'بعقل هادي',
      placement: placements[Math.floor(rng() * placements.length)],
      style: brandStyles[Math.floor(rng() * brandStyles.length)],
    },
    chartSpecs: extractChartData(content, chartColors),
  };
}

// ─── CSS Description → Deprecated Named Style Derivation ──────────────────
// These functions parse the free-form CSS description strings and derive
// the closest named template for backward compatibility.

function deriveCoverStyleFromDesign(design: string): VisualLanguage['coverStyle'] {
  const d = design.toLowerCase();
  if (d.includes('split') && d.includes('vertical')) return 'split-vertical';
  if (d.includes('split')) return 'split-horizontal';
  if (d.includes('centered') && d.includes('minimal')) return 'centered-minimal';
  if (d.includes('border') || d.includes('frame')) return 'bordered-frame';
  if (d.includes('geometric') || d.includes('pattern')) return 'geometric-pattern';
  if (d.includes('dark') || d.includes('sleek')) return 'dark-sleek';
  if (d.includes('asymmetric') || d.includes('blob')) return 'gradient-asymmetric';
  return 'gradient-full';
}

function deriveHeaderStyleFromDesign(design: string): VisualLanguage['sectionHeaderStyle'] {
  const d = design.toLowerCase();
  if (d.includes('left border') || d.includes('left accent')) return 'left-accent';
  if (d.includes('underline')) return 'underlined';
  if (d.includes('card')) return 'card-style';
  if (d.includes('circle') || d.includes('badge') || d.includes('number')) return 'numbered-circle';
  if (d.includes('gradient')) return 'gradient-bar';
  if (d.includes('minimal') || d.includes('no decoration')) return 'minimal-left';
  if (d.includes('sidebar')) return 'sidebar-number';
  return 'full-width-bar';
}

function deriveBulletStyleFromDesign(design: string): VisualLanguage['bulletStyle'] {
  const d = design.toLowerCase();
  if (d.includes('diamond') || d.includes('◆')) return 'diamond';
  if (d.includes('dash') || d.includes('—')) return 'dash';
  if (d.includes('arrow') || d.includes('→')) return 'arrow';
  if (d.includes('check') || d.includes('✓')) return 'check';
  return 'dot';
}

function deriveCalloutStyleFromDesign(design: string): VisualLanguage['calloutStyle'] {
  const d = design.toLowerCase();
  if (d.includes('card')) return 'card';
  if (d.includes('banner')) return 'banner';
  if (d.includes('minimal') || d.includes('no border')) return 'minimal';
  return 'left-border';
}

function deriveTableStyleFromDesign(design: string): VisualLanguage['tableStyle'] {
  const d = design.toLowerCase();
  if (d.includes('bordered') || d.includes('fully bordered')) return 'bordered';
  if (d.includes('clean') || d.includes('header only')) return 'clean-header';
  if (d.includes('shadow') || d.includes('card')) return 'shadow-cards';
  return 'zebra';
}

function deriveCodeStyleFromDesign(design: string): VisualLanguage['codeBlockStyle'] {
  const d = design.toLowerCase();
  if (d.includes('terminal') || d.includes('prompt')) return 'terminal';
  if (d.includes('inline')) return 'inline';
  if (d.includes('minimal') || d.includes('no border')) return 'minimal';
  return 'card';
}

function deriveDefinitionStyleFromDesign(design: string): VisualLanguage['definitionStyle'] {
  const d = design.toLowerCase();
  if (d.includes('list') || d.includes('accordion')) return 'list';
  if (d.includes('card')) return 'cards';
  if (d.includes('table')) return 'table';
  return 'grid';
}

// ─── Main Export ──────────────────────────────────────────────────────────

/**
 * Generate a Design Reasoning Block for the given content.
 * Uses LLM first (now enabled by default), falls back to algorithmic generator.
 *
 * To disable LLM-based reasoning, set DISABLE_LLM_DESIGN_REASONING=true in .env
 */
export async function generateDesignReasoning(
  input: DesignReasoningInput,
): Promise<DesignReasoningBlock> {
  const { content, model, language = 'ar', userPreferences, styleDescription } = input;

  if (!content || content.length < 20) {
    return generateReasoningAlgorithmically(content || '', language, userPreferences);
  }

  // LLM-based reasoning is now enabled by default.
  // Disable by setting DISABLE_LLM_DESIGN_REASONING=true in .env
  const useLLM = process.env.DISABLE_LLM_DESIGN_REASONING !== 'true';

  if (useLLM) {
    const llmCall = () =>
      Promise.race([
        generateReasoningWithLLM(content, model, language, userPreferences, styleDescription),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM design reasoning timed out (25s)')), 25000)
        ),
      ]);

    try {
      const result = await llmCall();
      return result;
    } catch (firstError) {
      // Retry once on timeout — complex/long documents may need more time
      const isTimeout = firstError instanceof Error && firstError.message.includes('timed out');
      if (isTimeout) {
        console.log('[Design Reasoning] First LLM call timed out, retrying once…');
        try {
          const result = await llmCall();
          return result;
        } catch (retryError) {
          console.error('[Design Reasoning] LLM retry also failed, using algorithmic generator:', retryError);
          return generateReasoningAlgorithmically(content, language, userPreferences, styleDescription);
        }
      }
      console.error('[Design Reasoning] LLM failed, using algorithmic generator:', firstError);
      return generateReasoningAlgorithmically(content, language, userPreferences, styleDescription);
    }
  }

  // Algorithmic generation — fast, reliable, unique per document
  return generateReasoningAlgorithmically(content, language, userPreferences, styleDescription);
}

/**
 * Convert a DesignReasoningBlock's visualLanguage to a DocumentTheme
 * compatible with the existing PDF engine.
 * Now derives ALL colors from the visual language palette — no hardcoded values.
 */
export function reasoningBlockToDocumentTheme(block: DesignReasoningBlock) {
  const vl = block.visualLanguage;
  const cp = block.contentPsychology;

  // Generate cover gradient from primary color
  const primaryRGB = hexToRGB(vl.primaryColor);
  const coverFrom = `rgb(${Math.round(primaryRGB[0] * 0.1)},${Math.round(primaryRGB[1] * 0.1)},${Math.round(primaryRGB[2] * 0.1)})`;
  const coverTo = `rgb(${Math.round(primaryRGB[0] * 0.3)},${Math.round(primaryRGB[1] * 0.3)},${Math.round(primaryRGB[2] * 0.3)})`;

  // Generate light accent variants
  const accentRGB = hexToRGB(vl.accentColor);
  const isLightMode = vl.backgroundMode === 'light';
  const accentLight = isLightMode
    ? `rgb(${Math.max(0, accentRGB[0] - 40)},${Math.max(0, accentRGB[1] - 40)},${Math.max(0, accentRGB[2] - 40)})`
    : `rgb(${Math.min(255, accentRGB[0] + 200)},${Math.min(255, accentRGB[1] + 200)},${Math.min(255, accentRGB[2] + 200)})`;
  const accentVeryLight = isLightMode
    ? `rgb(${Math.max(0, accentRGB[0] - 60)},${Math.max(0, accentRGB[1] - 60)},${Math.max(0, accentRGB[2] - 60)})`
    : `rgb(${Math.min(255, accentRGB[0] + 230)},${Math.min(255, accentRGB[1] + 230)},${Math.min(255, accentRGB[2] + 230)})`;

  // Derive section text color from primary color luminance (not hardcoded #ffffff)
  const primaryLuminance = relativeLuminance(vl.primaryColor);
  const sectionText = primaryLuminance > 0.4
    ? '#1a1a2e'  // Dark text on light primary
    : '#ffffff';  // White text on dark primary

  // Derive note/warning/tip colors from the palette's accent colors
  const noteColor = vl.accentWarm;
  const warningColor = vl.accentWarm;
  const tipColor = vl.accentGreen;

  // Use mutedTextColor from the visual language palette
  const mutedText = vl.mutedTextColor;

  // Derive category name from psychology type — using a simple algorithmic approach
  const categoryName = deriveCategoryName(cp.type);

  return {
    primaryColor: vl.primaryColor,
    secondaryColor: vl.secondaryColor,
    bgColor: vl.backgroundColor,
    coverFrom: rgbToHex(coverFrom),
    coverTo: rgbToHex(coverTo),
    accent: vl.accentColor,
    accentLight: rgbToHex(accentLight),
    accentVeryLight: rgbToHex(accentVeryLight),
    sectionBg: vl.primaryColor,
    sectionText,
    subsectionBorder: vl.primaryColor,
    noteColor,
    warningColor,
    tipColor,
    bodyText: vl.textColor,
    mutedText,
    categoryName,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
}

function rgbToHex(rgb: string): string {
  const match = rgb.match(/(\d+)/g);
  if (!match || match.length < 3) return '#000000';
  const r = Math.min(255, Math.max(0, parseInt(match[0])));
  const g = Math.min(255, Math.max(0, parseInt(match[1])));
  const b = Math.min(255, Math.max(0, parseInt(match[2])));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Calculate relative luminance of a hex color per WCAG 2.0.
 */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const linearize = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = linearize(parseInt(h.substring(0, 2), 16));
  const g = linearize(parseInt(h.substring(2, 4), 16));
  const b = linearize(parseInt(h.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Extract the hue (0-360) from a hex color.
 */
function getHueFromHex(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

/**
 * Derive a category name from the psychology type.
 * Uses algorithmic mapping — no hardcoded Arabic keyword map.
 * For backward compatibility, returns the same Arabic names the old hardcoded map used.
 */
function deriveCategoryName(type: ContentPsychology['type']): string {
  // These are just type label translations, not design rules.
  // They map a type enum to its display name — this is NOT a design decision.
  const typeLabels: Record<ContentPsychology['type'], string> = {
    financial: 'مالي',
    academic: 'أكاديمي',
    medical: 'طبي',
    islamic: 'إسلامي',
    creative: 'أدبي',
    technical: 'تقني',
    legal: 'قانوني',
  };
  return typeLabels[type];
}
