/**
 * Unified Content Classifier — Keyword-Aware Classification
 *
 * Classifies content by scanning for category-specific keywords and scoring
 * each category based on match density. Returns the highest-scoring category
 * with a real confidence value. Falls back to 'general' when no keywords match.
 */

// ─── Unified Category Type ────────────────────────────────────────────────

export type ContentCategory =
  | 'medical'
  | 'academic'
  | 'islamic'
  | 'technical'
  | 'programming'
  | 'business'
  | 'financial'
  | 'legal'
  | 'creative'
  | 'science'
  | 'humanities'
  | 'general';

// ─── Psychology Metadata ──────────────────────────────────────────────────

export interface ContentPsychology {
  energy: 'high' | 'medium' | 'low';
  formality: 'formal' | 'semi-formal' | 'casual';
  purpose: 'study-reference' | 'professional-report' | 'creative-presentation' | 'quick-reference' | 'deep-analysis';
}

// ─── Classification Result ────────────────────────────────────────────────

export interface ContentClassification {
  category: ContentCategory;
  confidence: number; // 0–1
  psychology: ContentPsychology;
  preferredHueRange: [number, number]; // [hueMin, hueMax]
}

// ─── Keyword Patterns per Category ────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<ContentCategory, string[]> = {
  medical: [
    'diagnosis', 'treatment', 'patient', 'clinical', 'disease', 'symptoms',
    'therapy', 'medication', 'hospital', 'doctor', 'surgery', 'pathology',
    'anatomy', 'pharmaceutical', 'healthcare', 'medical', 'vaccine', 'cardiac',
    'oncology', 'neurology', 'pediatrics', 'prescription', 'prognosis',
    'radiology', 'hematology', 'dermatology', 'endocrinology', 'immunology',
    'epidemiology', 'mortality', 'morbidity', 'outpatient', 'inpatient',
    'clinician', 'nurse', 'ward', 'surgical', 'chemotherapy', 'biopsy',
    'rehabilitation', 'chronic', 'acute', 'benign', 'malignant', 'etiology',
  ],
  academic: [
    'research', 'thesis', 'dissertation', 'methodology', 'literature review',
    'citation', 'hypothesis', 'peer-reviewed', 'journal', 'publication',
    'bibliography', 'abstract', 'scholarly', 'academia', 'professor',
    'study', 'framework', 'empirical', 'qualitative', 'quantitative',
    'findings', 'conclusion', 'implications', 'limitations', 'discussion',
    'appendix', 'references', 'doi', 'proceedings', 'conference', 'seminar',
    'syllabus', 'curriculum', 'pedagogy', 'tenure', 'postdoctoral',
  ],
  islamic: [
    'quran', 'hadith', 'sharia', 'fiqh', 'salah', 'zakat', 'hajj',
    'ramadan', 'imam', 'mosque', 'islamic', 'muslim', 'sunnah', 'tafsir',
    'fatwa', 'halal', 'haram', 'ayat', 'surah', 'dua', 'prophet muhammad',
    'allah', 'eid', 'wudu', 'iman', 'tawhid', 'deen', 'ummah', 'ijma',
    'qiyas', 'sawm', 'jumuah', 'madrasa', 'muezzin', 'minbar', 'mihrab',
    'kaaba', 'makkah', 'medina', 'salat', 'sadaqah', 'khalifah', 'tawbah',
    'akhira', 'jannah', 'dhikr', 'ruqyah', 'shirk', 'tawaf',
  ],
  technical: [
    'engineering', 'specification', 'architecture', 'protocol', 'infrastructure',
    'optimization', 'system', 'deployment', 'scalability', 'latency',
    'throughput', 'pipeline', 'microservices', 'containerization', 'kubernetes',
    'devops', 'ci/cd', 'monitoring', 'networking', 'firewall', 'load balancer',
    'virtualization', 'cloud computing', 'edge computing', 'distributed system',
    'fault tolerance', 'redundancy', 'bandwidth', 'tcp/ip', 'dns', 'ssl',
    'encryption', 'latency', 'throughput', 'benchmark', 'compliance',
  ],
  programming: [
    'function', 'variable', 'class', 'method', 'algorithm', 'api', 'database',
    'server', 'code', 'programming', 'javascript', 'python', 'typescript',
    'react', 'node', 'git', 'debugging', 'compiler', 'syntax', 'library',
    'framework', 'software', 'frontend', 'backend', 'html', 'css', 'array',
    'object', 'loop', 'async', 'promise', 'interface', 'generic', 'module',
    'package', 'import', 'export', 'const', 'return', 'string', 'boolean',
    'integer', 'recursive', 'iteration', 'refactor', 'repository', 'branch',
    'merge', 'deploy', 'runtime', 'exception', 'stack', 'heap', 'pointer',
  ],
  business: [
    'strategy', 'revenue', 'market', 'startup', 'entrepreneurship', 'profit',
    'stakeholder', 'customer', 'product', 'management', 'leadership',
    'corporate', 'sales', 'marketing', 'brand', 'investment', 'growth',
    'roi', 'kpi', 'mission', 'vision', 'competitive', 'disruption',
    'innovation', 'supply chain', 'logistics', 'outsourcing', 'partnership',
    'acquisition', 'merger', 'valuation', 'pitch', 'pivot', 'scalable',
    'business model', 'value proposition', 'go-to-market', 'traction',
  ],
  financial: [
    'financial', 'accounting', 'balance sheet', 'income statement', 'cash flow',
    'audit', 'tax', 'portfolio', 'equity', 'dividend', 'stock', 'bond',
    'interest rate', 'inflation', 'gdp', 'fiscal', 'monetary', 'capital',
    'asset', 'liability', 'depreciation', 'amortization', 'ledger',
    'reconciliation', 'receivable', 'payable', 'accrual', 'gaap', 'ifrs',
    'hedge', 'derivative', 'commodity', 'forex', 'liquidity', 'solvency',
    'yield', 'coupon', 'maturity', 'principal', 'overhead', 'margin',
  ],
  legal: [
    'law', 'legal', 'court', 'attorney', 'contract', 'litigation',
    'compliance', 'regulation', 'statute', 'jurisdiction', 'plaintiff',
    'defendant', 'verdict', 'appeal', 'constitutional', 'rights', 'liability',
    'intellectual property', 'copyright', 'trademark', 'patent', 'legislation',
    'ordinance', 'precedent', 'arbitration', 'mediation', 'tribunal',
    'indemnity', 'warranty', 'clause', 'provision', 'amendment', 'ruling',
    'subpoena', 'deposition', 'testimony', 'probate', 'tort', 'felony',
    'misdemeanor', 'parliament', 'congress', 'senate', 'judiciary',
  ],
  creative: [
    'art', 'design', 'creative', 'music', 'film', 'photography', 'painting',
    'sculpture', 'poetry', 'novel', 'storytelling', 'aesthetic', 'inspiration',
    'imagination', 'composition', 'illustration', 'visual', 'canvas',
    'palette', 'genre', 'screenplay', 'narrative', 'drama', 'theater',
    'dance', 'choreography', 'melody', 'harmony', 'rhythm', 'sketch',
    'watercolor', 'acrylic', 'portrait', 'landscape', 'abstract',
    'typography', 'calligraphy', 'collage', 'mosaic', 'fresco', 'graffiti',
  ],
  science: [
    'experiment', 'hypothesis', 'theory', 'molecule', 'atom', 'quantum',
    'physics', 'chemistry', 'biology', 'laboratory', 'scientific',
    'observation', 'empirical', 'discovery', 'evolution', 'genome',
    'particle', 'energy', 'force', 'gravity', 'electromagnetic', 'thermodynamics',
    'entropy', 'relativity', 'photosynthesis', 'mitosis', 'dna', 'rna',
    'protein', 'cell', 'organism', 'ecosystem', 'biodiversity', 'telescope',
    'microscope', 'catalyst', 'isotope', 'nucleus', 'electron', 'proton',
    'neutron', 'spectrometry', 'orbital', 'crystallography',
  ],
  humanities: [
    'philosophy', 'history', 'culture', 'society', 'ethics', 'literature',
    'anthropology', 'sociology', 'politics', 'civilization', 'human',
    'identity', 'tradition', 'heritage', 'religion', 'language',
    'linguistics', 'rhetoric', 'semiotics', 'historiography', 'archaeology',
    'existentialism', 'phenomenology', 'dialectic', 'epistemology',
    'metaphysics', 'ontology', 'pragmatism', 'structuralism', 'postmodernism',
    'colonialism', 'imperialism', 'nationalism', 'democracy', 'sovereignty',
    'citizenship', 'feminism', 'marxism', 'capitalism', 'socialism',
  ],
  general: [],
};

// ─── Category → Psychology Mapping ────────────────────────────────────────

const CATEGORY_PSYCHOLOGY: Record<ContentCategory, ContentPsychology> = {
  medical:          { energy: 'low',    formality: 'formal',       purpose: 'study-reference' },
  academic:         { energy: 'medium', formality: 'formal',       purpose: 'deep-analysis' },
  islamic:          { energy: 'medium', formality: 'formal',       purpose: 'study-reference' },
  technical:        { energy: 'medium', formality: 'semi-formal',  purpose: 'professional-report' },
  programming:      { energy: 'high',   formality: 'semi-formal',  purpose: 'quick-reference' },
  business:         { energy: 'high',   formality: 'semi-formal',  purpose: 'professional-report' },
  financial:        { energy: 'medium', formality: 'formal',       purpose: 'professional-report' },
  legal:            { energy: 'low',    formality: 'formal',       purpose: 'deep-analysis' },
  creative:         { energy: 'high',   formality: 'casual',       purpose: 'creative-presentation' },
  science:          { energy: 'medium', formality: 'formal',       purpose: 'deep-analysis' },
  humanities:       { energy: 'medium', formality: 'semi-formal',  purpose: 'deep-analysis' },
  general:          { energy: 'medium', formality: 'semi-formal',  purpose: 'quick-reference' },
};

// ─── Category → Hue Range Mapping ─────────────────────────────────────────

const CATEGORY_HUE_RANGES: Record<ContentCategory, [number, number]> = {
  medical:          [100, 160],   // green — clinical, calming
  academic:         [200, 240],   // blue — scholarly, trustworthy
  islamic:          [40, 160],    // gold-to-emerald — traditional islamic colors
  technical:        [190, 240],   // blue/electric — tech blue
  programming:      [120, 190],   // green-to-cyan — code green / terminal
  business:         [160, 200],   // teal — professional
  financial:        [80, 140],    // deep green/gold — money green
  legal:            [220, 270],   // dark blue/purple — authoritative
  creative:         [300, 360],   // magenta-to-red — vibrant, creative
  science:          [240, 290],   // violet/blue — discovery
  humanities:       [20, 60],     // warm earth tones — warm, grounded
  general:          [180, 220],   // neutral cyan-blue — balanced
};

// ─── Core Classification Function ─────────────────────────────────────────

/**
 * Classify content using keyword-aware scoring.
 *
 * Scans the text for category-specific keywords, scores each category
 * based on match density, and returns the highest-scoring category with
 * a real confidence value. Falls back to 'general' when no keywords match.
 *
 * @param text   - The document content to classify
 * @param title  - Optional title (included in analysis for better accuracy)
 * @returns ContentClassification with all metadata
 */
export function classifyContent(text: string, title?: string): ContentClassification {
  const combined = `${title || ''} ${text}`.toLowerCase();

  // Score each category by counting keyword matches
  const scores: Record<ContentCategory, number> = {
    medical: 0, academic: 0, islamic: 0, technical: 0, programming: 0,
    business: 0, financial: 0, legal: 0, creative: 0, science: 0,
    humanities: 0, general: 0,
  };

  for (const category of Object.keys(CATEGORY_KEYWORDS) as ContentCategory[]) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.length === 0) continue; // skip 'general' — it's the fallback

    for (const keyword of keywords) {
      // Count occurrences of the keyword in the text
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
      const matches = combined.match(regex);
      if (matches) {
        scores[category] += matches.length;
      }
    }
  }

  // Find the highest-scoring category
  let bestCategory: ContentCategory = 'general';
  let bestScore = 0;

  for (const category of Object.keys(scores) as ContentCategory[]) {
    if (category === 'general') continue;
    if (scores[category] > bestScore) {
      bestScore = scores[category];
      bestCategory = category;
    }
  }

  // If no keywords matched, fall back to 'general'
  if (bestScore === 0) {
    bestCategory = 'general';
  }

  // Calculate confidence based on score and text length
  const confidence = calculateConfidence(bestScore, combined.length, bestCategory);

  return {
    category: bestCategory,
    confidence: Math.round(confidence * 100) / 100,
    psychology: generatePsychology(bestCategory),
    preferredHueRange: generateHueRange(bestCategory),
  };
}

// ─── Confidence Calculation ────────────────────────────────────────────────

/**
 * Calculate a confidence score based on keyword match density.
 * More matches and higher density relative to text length produce higher confidence.
 */
function calculateConfidence(score: number, textLength: number, category: ContentCategory): number {
  if (score === 0) return 0.15; // general fallback gets low confidence

  // Base confidence from raw score (diminishing returns)
  const scoreFactor = Math.min(score / 5, 1); // 5+ matches → max score factor

  // Density factor: how concentrated are the matches relative to text length
  const wordsCount = Math.max(textLength / 5, 1); // rough word estimate
  const density = score / wordsCount;
  const densityFactor = Math.min(density * 10, 1); // high density → max density factor

  // Combined confidence: weighted average, capped 0.2–0.95
  const raw = 0.5 * scoreFactor + 0.5 * densityFactor;
  return Math.max(0.2, Math.min(0.95, raw));
}

// ─── Regex Escape Helper ──────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Category-Based Psychology Generation ─────────────────────────────────

/**
 * Generate psychology metadata from the classified category.
 * Each category maps to a specific psychology profile.
 */
function generatePsychology(category: ContentCategory): ContentPsychology {
  return CATEGORY_PSYCHOLOGY[category];
}

// ─── Category-Based Hue Range Generation ──────────────────────────────────

/**
 * Generate a preferred hue range from the classified category.
 * Each category maps to a specific hue range that reflects its theme.
 */
function generateHueRange(category: ContentCategory): [number, number] {
  const range = CATEGORY_HUE_RANGES[category];
  return [range[0], range[1]];
}

/**
 * Get the preferred hue range for a content type string.
 * Looks up the hue range for the given category name.
 */
export function getPreferredHueRange(contentType: string): [number, number] {
  if (contentType in CATEGORY_HUE_RANGES) {
    const range = CATEGORY_HUE_RANGES[contentType as ContentCategory];
    return [range[0], range[1]];
  }
  // Fallback to general hue range for unknown types
  const range = CATEGORY_HUE_RANGES['general'];
  return [range[0], range[1]];
}

/**
 * Get the psychology metadata for a content type string.
 * Looks up the psychology for the given category name.
 */
export function getPsychologyForType(contentType: string): ContentPsychology {
  if (contentType in CATEGORY_PSYCHOLOGY) {
    return CATEGORY_PSYCHOLOGY[contentType as ContentCategory];
  }
  // Fallback to general psychology for unknown types
  return CATEGORY_PSYCHOLOGY['general'];
}

// ─── Category Conversion Helpers ─────────────────────────────────────────

/**
 * Convert a unified ContentCategory to the design-reasoning type.
 * Inline mapping — no exported static lookup tables.
 */
export function toDesignReasoningType(category: ContentCategory): 'financial' | 'academic' | 'medical' | 'islamic' | 'creative' | 'technical' | 'legal' {
  const mapping: Record<ContentCategory, 'financial' | 'academic' | 'medical' | 'islamic' | 'creative' | 'technical' | 'legal'> = {
    medical: 'medical',
    academic: 'academic',
    islamic: 'islamic',
    technical: 'technical',
    programming: 'technical',
    business: 'financial',
    financial: 'financial',
    legal: 'legal',
    creative: 'creative',
    science: 'academic',
    humanities: 'academic',
    general: 'academic',
  };
  return mapping[category];
}

/**
 * Convert a unified ContentCategory to the dynamic-themes TopicCategory.
 * Inline mapping — no exported static lookup tables.
 */
export function toDynamicThemesCategory(category: ContentCategory): string {
  const mapping: Record<ContentCategory, string> = {
    medical: 'medical',
    academic: 'general',
    islamic: 'islamic',
    technical: 'tech',
    programming: 'programming',
    business: 'business',
    financial: 'business',
    legal: 'law',
    creative: 'literature',
    science: 'science',
    humanities: 'humanities',
    general: 'general',
  };
  return mapping[category];
}
