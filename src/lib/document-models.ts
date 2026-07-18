// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Document Model Types & Registry (CLIENT-SAFE)
// ═══════════════════════════════════════════════════════════════════════
// This file contains ONLY types and model registry constants.
// It does NOT import any server-side modules (no @gradio/client, no fs, etc.)
// Safe to import in both client and server code.
// ═══════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────

export type DocumentType = 'pdf' | 'pptx' | 'xlsx' | 'docx';

export interface DocumentModelEntry {
  id: string;
  spaceName: string;
  name: string;
  nameAr: string;
  type: DocumentType;
  description: string;
  descriptionAr: string;
  endpoint: string;
  available: boolean;
  /** Whether this model generates AI images inside documents */
  supportsImages: boolean;
  icon: string;
}

// ─── Document Model Registry ──────────────────────────────────────────

export const DOCUMENT_MODELS: Record<string, DocumentModelEntry> = {
  // ── Local PDF Engine (Most Reliable) ─────────────────────────────────

  'local-pdf': {
    id: 'local-pdf',
    spaceName: 'local',
    name: 'DeltaAI PDF Engine — Local Generator',
    nameAr: 'محرك PDF دلتا — مولد محلي',
    type: 'pdf',
    description: 'Generates professional Arabic PDF documents locally with LLM-powered content, cover pages, tables, and RTL support',
    descriptionAr: 'ينشئ مستندات PDF عربية احترافية محلياً مع محتوى مدعوم بالذكاء الاصطناعي وصفحات غلاف وجداول ودعم RTL كامل',
    endpoint: '/api/ai/hf/document',
    available: true,
    supportsImages: true,
    icon: '🚀',
  },

  // ── PPTX Generators ──────────────────────────────────────────────────

  'open-gamma': {
    id: 'open-gamma',
    spaceName: 'openfree/Open-GAMMA',
    name: 'Open GAMMA — AI Presentation Generator',
    nameAr: 'أوبن جاما — مولد عروض AI احترافية',
    type: 'pptx',
    description: 'Premium presentation generator with 3-AI collaboration, professional themes, and AI diagrams',
    descriptionAr: 'مولد عروض تقديمية متميز بنظام تعاون 3 ذكاءات اصطناعية مع تصاميم احترافية',
    endpoint: '/generate_ppt_handler',
    available: true,
    supportsImages: true,
    icon: '🌟',
  },
  'fabrica-slides': {
    id: 'fabrica-slides',
    spaceName: 'Radioterapia-AI/Fabrica_de_Slides',
    name: 'Fabrica de Slides — PPTX with Styles',
    nameAr: 'فابريكا سلايدز — عروض بأنماط متعددة',
    type: 'pptx',
    description: 'Creates styled PPTX presentations with customizable themes and color schemes',
    descriptionAr: 'ينشئ عروض PPTX منسقة بأنماط وألوان قابلة للتخصيص',
    endpoint: '/on_generate_ppt',
    available: true,
    supportsImages: false,
    icon: '📊',
  },

  // ── PDF Generators ──────────────────────────────────────────────────

  'pdf-generator': {
    id: 'pdf-generator',
    spaceName: 'Yehor/pdf-generator',
    name: 'Typst PDF Generator',
    nameAr: 'مولد PDF تيبست',
    type: 'pdf',
    description: 'Generates clean PDF documents using Typst markup engine',
    descriptionAr: 'ينشئ مستندات PDF نظيفة باستخدام محرك Typst',
    endpoint: '/generate_pdf',
    available: true,
    supportsImages: false,
    icon: '📄',
  },
  'text-to-pdf-word': {
    id: 'text-to-pdf-word',
    spaceName: 'harshilgandhi90/text-to-pdf-word',
    name: 'Text to PDF/Word Converter',
    nameAr: 'محول النصوص إلى PDF/Word',
    type: 'pdf',
    description: 'Converts text content to PDF or Word documents with formatting',
    descriptionAr: 'يحول المحتوى النصي إلى مستندات PDF أو Word منسقة',
    endpoint: '/predict',
    available: true,
    supportsImages: false,
    icon: '📝',
  },
};

// ─── Lookup Functions ─────────────────────────────────────────────────

export function getDocumentModelById(id: string): DocumentModelEntry | undefined {
  return DOCUMENT_MODELS[id];
}

export function getAvailableDocumentModels(): DocumentModelEntry[] {
  return Object.values(DOCUMENT_MODELS).filter((m) => m.available);
}

export function getDocumentModelsByType(type: DocumentType): DocumentModelEntry[] {
  return Object.values(DOCUMENT_MODELS).filter((m) => m.type === type && m.available);
}
