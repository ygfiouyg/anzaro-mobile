/**
 * AI Tools Catalog
 * =================
 * دليل كامل لكل أدوات AI الموجودة في المنصة.
 * كل أداة فيها: id + name + category + description + patterns الاستدعاء من الشات.
 *
 * المصدر: src/lib/ai-tools/*.ts (40 أداة مربوطة بالشات + 12 مش مربوطة = 57 إجمالي)
 */

export interface AIToolEntry {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  /** أمثلة للرسائل اللي بتستدعي الأداة من الشات (لو مربوطة) */
  patterns?: string[];
  /** طريقة الاستدعاء المباشر عبر API (لو محتاج) */
  apiEndpoint?: string;
  /** status: مربوط بالشات / مش مربوط / مدخل فقط */
  status: "chat" | "api-only" | "upload";
  /** أي ملفات محتاجة ترفعها */
  needsUpload?: boolean;
  /** أي skills مرتبطة */
  relatedSkills?: string[];
}

export type ToolCategory =
  | "mcp"
  | "vision"
  | "media"
  | "agents"
  | "rag"
  | "business"
  | "compare"
  | "audio"
  | "adv-agents"
  | "adv-rag";

export const TOOL_CATALOG: AIToolEntry[] = [
  // ═════════ MCP Tools (5) ═════════
  {
    id: "mcp-web-search",
    name: "بحث في الويب",
    category: "mcp",
    description: "بيبحث في الإنترنت عن أي معلومة ويرجع نتائج من DuckDuckGo",
    patterns: ["ابحث عن X", "دور على X", "search for X", "معلومات عن X", "أخبار X"],
    status: "chat",
  },
  {
    id: "mcp-page-reader",
    name: "قارئ الصفحات",
    category: "mcp",
    description: "بيقرا محتوى أي URL ويرجع النص نظيف",
    patterns: ["اقرا https://...", "قرا الرابط ده", "read this URL"],
    status: "chat",
  },
  {
    id: "mcp-image-search",
    name: "بحث عن صور",
    category: "mcp",
    description: "بيدور على صور من Unsplash ويرجع URLs",
    patterns: ["دورلي على صورة X", "image search X", "صور لـ X"],
    status: "chat",
  },
  {
    id: "mcp-code-exec",
    name: "تنفيذ كود",
    category: "mcp",
    description: "بيشغل كود JavaScript/Python ويرجع النتيجة",
    patterns: ["نفّذ الكود: ...", "run code: ...", "console.log(2+2)"],
    status: "chat",
  },
  {
    id: "mcp-memory",
    name: "الذاكرة",
    category: "mcp",
    description: "بيحفظ ويسترجع معلومات من الذاكرة طويلة المدى",
    patterns: ["افتكر إن X", "remember that X", "ايه اللي قلته عن X"],
    status: "chat",
  },

  // ═════════ Vision & OCR (6) ═════════
  {
    id: "vision-analyze",
    name: "تحليل الصور",
    category: "vision",
    description: "بيحلل أي صورة (محتوى، ألوان، مشاعر، نصوص) عبر GLM-4V",
    patterns: ["حلل الصورة دي", "analyze this image"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "ocr-extract",
    name: "استخراج النصوص (OCR)",
    category: "vision",
    description: "بيستخرج نصوص من أي صورة (مستندات، شاشات، صور)",
    patterns: ["استخرج النص من الصورة", "OCR this image"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "ocr-structured",
    name: "استخراج منظّم",
    category: "vision",
    description: "بيستخرج بيانات منظّمة (JSON) من صور (فواتير، بطاقات)",
    patterns: ["استخرج البيانات من الفاتورة", "extract structured data"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "ocr-latex",
    name: "تحويل لـ LaTeX",
    category: "vision",
    description: "بيحوّل معادلات رياضية في الصور لـ LaTeX",
    patterns: ["حوّل المعادلة لـ LaTeX", "convert to latex"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "chart-analyze",
    name: "تحليل الرسوم البيانية",
    category: "vision",
    description: "بيحلل charts و graphs في الصور ويرجع البيانات",
    patterns: ["حلل الرسم البياني", "analyze this chart"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "doc-analyze",
    name: "تحليل المستندات",
    category: "vision",
    description: "بيحلل PDF/Word/مستندات ويرجع ملخص + بيانات",
    patterns: ["حلل المستند ده", "analyze document"],
    status: "upload",
    needsUpload: true,
  },

  // ═════════ Media & Content (6) ═════════
  {
    id: "media-image-gen",
    name: "توليد الصور",
    category: "media",
    description: "بيولّد صور من وصف نصي عبر CogView",
    patterns: ["ارسم صورة X", "generate image of X", "صورة لـ X"],
    status: "chat",
  },
  {
    id: "media-video-gen",
    name: "توليد الفيديو",
    category: "media",
    description: "بيولّد فيديو قصير من وصف عبر CogVideoX-2",
    patterns: ["اعمل فيديو عن X", "generate video of X"],
    status: "chat",
  },
  {
    id: "media-podcast",
    name: "مولّد البودكاست",
    category: "media",
    description: "بيولّد حلقة بودكاست كاملة عن أي موضوع",
    patterns: ["اعمل بودكاست عن X", "podcast about X"],
    status: "chat",
  },
  {
    id: "media-youtube",
    name: "محلل يوتيوب",
    category: "media",
    description: "بيحلل قناة يوتيوب ويعطي استراتيجية نمو",
    patterns: ["حلل قناة يوتيوب X", "youtube analysis for X"],
    status: "chat",
  },
  {
    id: "media-social",
    name: "محتوى سوشيال",
    category: "media",
    description: "بيولّد محتوى لكل منصات السوشيال ميديا",
    patterns: ["اعمل محتوى سوشيال عن X", "social content for X"],
    status: "chat",
  },
  {
    id: "media-notebooklm",
    name: "NotebookLM",
    category: "media",
    description: "محاكاة NotebookLM — بيحوّل المستندات لملاحظات ذكية",
    status: "api-only",
    apiEndpoint: "/api/ai/media-tools",
  },

  // ═════════ Agents (8) ═════════
  {
    id: "agent-book-writer",
    name: "كاتب الكتب",
    category: "agents",
    description: "بيكتب كتاب كامل (فصول + مقدمة + خاتمة) عن أي موضوع",
    patterns: ["اكتب كتاب عن X", "write a book about X"],
    status: "chat",
  },
  {
    id: "agent-news",
    name: "مولّد الأخبار",
    category: "agents",
    description: "بيولّد خبر صحفي احترافي عن أي حدث",
    patterns: ["اكتب خبر عن X", "news about X"],
    status: "chat",
  },
  {
    id: "agent-financial",
    name: "المحلل المالي",
    category: "agents",
    description: "بيحلل سهم/شركة ويعطي توصية شراء/بيع",
    patterns: ["حلل سهم X", "analyze stock X", "تحليل مالي لـ X"],
    status: "chat",
  },
  {
    id: "agent-booking",
    name: "مخطط الرحلات",
    category: "agents",
    description: "بيخطط رحلة كاملة (طيران + فنادق + أنشطة)",
    patterns: ["خطط رحلة لـ X", "plan a trip to X"],
    status: "chat",
  },
  {
    id: "agent-research",
    name: "البحث العميق",
    category: "agents",
    description: "بيعمل بحث أكاديمي عميق عن أي موضوع",
    patterns: ["اعمل بحث عن X", "research X in depth"],
    status: "chat",
  },
  {
    id: "agent-paralegal",
    name: "المستشار القانوني",
    category: "agents",
    description: "بيعطي استشارة قانونية مدعومة بالمراجع",
    patterns: ["استشارة قانونية عن X", "legal advice for X"],
    status: "chat",
  },
  {
    id: "agent-brand",
    name: "محلل العلامات التجارية",
    category: "agents",
    description: "بيحلل علامة تجارية ويعطي استراتيجية تطوير",
    patterns: ["حلل علامة X", "brand analysis for X"],
    status: "chat",
  },
  {
    id: "agent-doc-writer",
    name: "كاتب المستندات",
    category: "agents",
    description: "بيكتب مستندات تقنية/أعمال احترافية",
    status: "api-only",
    apiEndpoint: "/api/ai/agent-tools",
  },

  // ═════════ RAG (5) ═════════
  {
    id: "rag-github",
    name: "شات مع GitHub",
    category: "rag",
    description: "بتحط URL لـ GitHub repo وبيقراه وتقدر تسأله أسئلة",
    patterns: ["اقرا الـ repo ده https://github.com/...", "chat with this repo"],
    status: "chat",
  },
  {
    id: "rag-code-chat",
    name: "شات مع الكود",
    category: "rag",
    description: "بتحط كود وبتسأل عليه أسئلة",
    patterns: ["الكود ده بيعمل إيه: ...", "explain this code"],
    status: "chat",
  },
  {
    id: "rag-corrective",
    name: "RAG التصحيحي",
    category: "rag",
    description: "RAG بيتصحح نفسه — بيبحث ويراجع الإجابة قبل ما يرجعها",
    patterns: ["corrective RAG about X", "ابحث وراجع عن X"],
    status: "chat",
  },
  {
    id: "rag-doc-chat",
    name: "شات مع المستندات",
    category: "rag",
    description: "بتحمل مستند وبتسأل عليه",
    status: "upload",
    needsUpload: true,
  },
  {
    id: "rag-agentic",
    name: "Agentic RAG",
    category: "rag",
    description: "RAG بيستخدم agents متعددين للبحث العميق",
    status: "api-only",
    apiEndpoint: "/api/ai/rag-tools",
  },
  {
    id: "rag-agentic-v2",
    name: "Agentic RAG v2 (Pinecone)",
    category: "rag",
    description: "RAG وكيلي بـ Pinecone vector DB حقيقي + Gemini embeddings (fallback لـ web search)",
    status: "api-only",
    apiEndpoint: "/api/ai/rag-tools",
  },

  // ═════════ Business (6) ═════════
  {
    id: "biz-financial",
    name: "تحليل مالي شامل",
    category: "business",
    description: "تحليل SWOT + مالي + توصيات لأي شركة",
    patterns: ["حلل مالي شركة X", "financial analysis for X"],
    status: "chat",
  },
  {
    id: "biz-sales",
    name: "تحليل المبيعات",
    category: "business",
    description: "بيحلل بيانات مبيعات ويعطي insights",
    patterns: ["حلل بيانات المبيعات دي", "analyze sales data"],
    status: "chat",
  },
  {
    id: "biz-amazon",
    name: "تحليل منتج أمازون",
    category: "business",
    description: "بيحلل منتج من أمازون (سعر + مراجعات + منافسين)",
    patterns: ["حلل منتج أمازون: X", "amazon analysis for X"],
    status: "chat",
  },
  {
    id: "biz-portfolio",
    name: "تحليل المحفظة",
    category: "business",
    description: "بيحلل محفظة استثمارية ويعطي توصيات",
    patterns: ["حلل محفظتي", "analyze my portfolio"],
    status: "chat",
  },
  {
    id: "biz-website-api",
    name: "موقع → API",
    category: "business",
    description: "بيحوّل أي موقع لـ API جاهز للاستخدام",
    patterns: ["حوّل الموقع ده لـ API: https://...", "website to API"],
    status: "chat",
  },
  {
    id: "biz-memory",
    name: "ذاكرة الأعمال",
    category: "business",
    description: "بيستخرج facts من المحادثة ويحفظها",
    patterns: ["استخرج المعلومات دي", "remember these facts"],
    status: "chat",
  },

  // ═════════ Compare & Training (6) ═════════
  {
    id: "compare-models",
    name: "مقارنة النماذج",
    category: "compare",
    description: "بيقارن نماذج AI في أداء وسرعة وتكلفة",
    patterns: ["قارن بين نماذج X و Y", "compare models X vs Y"],
    status: "chat",
  },
  {
    id: "compare-code",
    name: "تقييم الكود",
    category: "compare",
    description: "بيقارن نماذج في كتابة كود",
    patterns: ["قارن نماذج في كتابة كود", "code eval"],
    status: "chat",
  },
  {
    id: "compare-reasoning",
    name: "تقييم الاستدلال",
    category: "compare",
    description: "بيقارن قدرات الاستدلال بين النماذج",
    status: "api-only",
    apiEndpoint: "/api/ai/compare-tools",
  },
  {
    id: "eval-rag",
    name: "تقييم RAG",
    category: "compare",
    description: "بيقيم نظام RAG في الجودة والدقة",
    status: "api-only",
    apiEndpoint: "/api/ai/compare-tools",
  },
  {
    id: "compare-guidelines",
    name: "إرشادات vs Prompts",
    category: "compare",
    description: "بيقارن بين guidelines و traditional prompts",
    status: "api-only",
    apiEndpoint: "/api/ai/compare-tools",
  },
  {
    id: "finetune-guide",
    name: "دليل Fine-tuning",
    category: "compare",
    description: "بيديك دليل كامل لـ fine-tune أي نموذج",
    patterns: ["ازاي اعمل fine-tune لـ X", "fine-tuning guide for X"],
    status: "chat",
  },

  // ═════════ Audio (3) ═════════
  {
    id: "audio-meeting-notes",
    name: "ملاحظات الاجتماعات",
    category: "audio",
    description: "بيحوّل تسجيل اجتماع لملاحظات منظّمة + action items",
    patterns: ["اعمل ملاحظات للاجتماع ده", "meeting notes from audio"],
    status: "upload",
    needsUpload: true,
  },
  {
    id: "audio-chat",
    name: "شات مع الصوت",
    category: "audio",
    description: "بتحط ملف صوتي وبتسأل عليه أسئلة",
    status: "upload",
    needsUpload: true,
  },
  {
    id: "audio-analysis",
    name: "تحليل الصوت",
    category: "audio",
    description: "بيحلل المحتوى الصوتي (موسيقى/كلام/مشاعر)",
    patterns: ["حلل الصوت ده", "audio analysis"],
    status: "upload",
    needsUpload: true,
  },

  // ═════════ Advanced RAG (4) ═════════
  {
    id: "rag-video",
    name: "Video RAG",
    category: "adv-rag",
    description: "RAG للفيديو — ابحث جوه فيديو ولاتسأل",
    status: "api-only",
    apiEndpoint: "/api/ai/extended-tools",
  },
  {
    id: "rag-sql-router",
    name: "SQL Router",
    category: "adv-rag",
    description: "بيحوّل أسئلة عربية لـ SQL queries",
    patterns: ["حوّل السؤال ده لـ SQL", "SQL from question"],
    status: "chat",
  },
  {
    id: "rag-excel",
    name: "Excel RAG",
    category: "adv-rag",
    description: "بتحط Excel وبتسأل عليه أسئلة",
    status: "upload",
    needsUpload: true,
  },
  {
    id: "rag-context",
    name: "Context Engine",
    category: "adv-rag",
    description: "محرك context engineering workflow",
    patterns: ["context engineering for X", "بناء سياق لـ X"],
    status: "chat",
  },

  // ═════════ Advanced Agents (6) ═════════
  {
    id: "agent-swarm",
    name: "Swarm Agents",
    category: "adv-agents",
    description: "multiple agents بيشتغلوا سوا على مهمة معقدة",
    patterns: ["swarm agents ابحث عن X", "multiple agents for X"],
    status: "chat",
  },
  {
    id: "agent-builder",
    name: "Agent Builder",
    category: "adv-agents",
    description: "بيبني agent مخصص لأي مهمة",
    patterns: ["ابني agent لـ X", "build an agent for X"],
    status: "chat",
  },
  {
    id: "agent-acp",
    name: "ACP Agent",
    category: "adv-agents",
    description: "Agent Communication Protocol — تواصل بين agents",
    patterns: ["ACP agent for X", "agent communication"],
    status: "chat",
  },
  {
    id: "agent-a2a",
    name: "A2A Agent",
    category: "adv-agents",
    description: "Agent-to-Agent — agents بيتحدثوا مع بعض",
    patterns: ["A2A agents for X", "agent to agent"],
    status: "chat",
  },
  {
    id: "agent-compliance",
    name: "Compliance Agent",
    category: "adv-agents",
    description: "agent بيحقق compliance للأنظمة",
    status: "api-only",
    apiEndpoint: "/api/ai/extended-tools",
  },
  {
    id: "agent-content-planner",
    name: "Content Planner",
    category: "adv-agents",
    description: "بيخطط محتوى كامل لـ campaign",
    patterns: ["خطط محتوى عن X", "content plan for X"],
    status: "chat",
  },
];

/** تصنيفات الأدوات للعرض */
export const TOOL_CATEGORIES: { id: ToolCategory; name: string; nameEn: string; icon: string; color: string }[] = [
  { id: "mcp", name: "MCP والأدوات", nameEn: "MCP & Tools", icon: "🔗", color: "indigo" },
  { id: "vision", name: "الرؤية و OCR", nameEn: "Vision & OCR", icon: "📸", color: "amber" },
  { id: "media", name: "الميديا والمحتوى", nameEn: "Media & Content", icon: "🎨", color: "violet" },
  { id: "agents", name: "الوكلاء والأتمتة", nameEn: "Agents & Automation", icon: "🤖", color: "emerald" },
  { id: "rag", name: "RAG والمستندات", nameEn: "RAG & Documents", icon: "📄", color: "sky" },
  { id: "business", name: "الأعمال والمال", nameEn: "Business & Finance", icon: "💰", color: "teal" },
  { id: "compare", name: "المقارنة والتقييم", nameEn: "Comparison & Eval", icon: "📊", color: "orange" },
  { id: "audio", name: "الصوت والصوتيات", nameEn: "Audio & Voice", icon: "🎤", color: "rose" },
  { id: "adv-rag", name: "RAG المتقدم", nameEn: "Advanced RAG", icon: "🔍", color: "cyan" },
  { id: "adv-agents", name: "الوكلاء المتقدمون", nameEn: "Advanced Agents", icon: "🧠", color: "fuchsia" },
];

/** عدد الأدوات في كل فئة */
export function getToolsByCategory(category: ToolCategory | "all"): AIToolEntry[] {
  if (category === "all") return TOOL_CATALOG;
  return TOOL_CATALOG.filter((t) => t.category === category);
}

/** إحصائيات */
export function getToolsStats() {
  const total = TOOL_CATALOG.length;
  const chatConnected = TOOL_CATALOG.filter((t) => t.status === "chat").length;
  const uploadRequired = TOOL_CATALOG.filter((t) => t.status === "upload").length;
  const apiOnly = TOOL_CATALOG.filter((t) => t.status === "api-only").length;
  return { total, chatConnected, uploadRequired, apiOnly };
}
