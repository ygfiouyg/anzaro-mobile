/**
 * AI Tools Registry — 108 أداة من AI Engineering Hub
 * ================================================
 * كل أداة ليها:
 *   - id: معرف فريد
 *   - name: الاسم بالعربي
 *   - category: الفئة
 *   - description: الوصف
 *   - source: المشروع الأصلي
 *   - endpoint: الـ API route
 *   - inputType: نوع المدخلات (text, image, file, url, audio)
 *   - outputType: نوع المخرجات (text, image, audio, video, html, code)
 */

export type ToolCategory =
  | "ocr"
  | "rag"
  | "agents"
  | "audio"
  | "media"
  | "business"
  | "mcp"
  | "compare"
  | "ui"
  | "training";

export type InputType = "text" | "image" | "file" | "url" | "audio" | "code";
export type OutputType = "text" | "image" | "audio" | "video" | "html" | "code" | "json";

export interface AITool {
  id: string;
  name: string;
  nameEn: string;
  category: ToolCategory;
  description: string;
  source: string;
  inputType: InputType;
  outputType: OutputType;
  difficulty: "beginner" | "intermediate" | "advanced";
}

const t = (
  id: string,
  name: string,
  nameEn: string,
  category: ToolCategory,
  description: string,
  source: string,
  inputType: InputType,
  outputType: OutputType,
  difficulty: "beginner" | "intermediate" | "advanced" = "intermediate",
): AITool => ({
  id, name, nameEn, category, description, source, inputType, outputType, difficulty,
});

export const AI_TOOLS: AITool[] = [
  // ═══════════════════════════════════════════
  // 📸 OCR & Vision (4 أدوات)
  // ═══════════════════════════════════════════
  t("ocr-latex", "OCR معادلات LaTeX", "LaTeX OCR", "ocr", "تحويل صور المعادلات الرياضية لـ LaTeX code", "LaTeX-OCR-with-Llama", "image", "code", "beginner"),
  t("ocr-general", "OCR عام", "General OCR", "ocr", "استخراج نص من أي صورة أو مستند", "llama-ocr", "image", "text", "beginner"),
  t("ocr-structured", "OCR منظم", "Structured OCR", "ocr", "استخراج نص منظم من صور بتنسيق JSON", "gemma3-ocr", "image", "json", "beginner"),
  t("ocr-qwen", "OCR بـ Qwen", "Qwen OCR", "ocr", "OCR متقدم بـ Qwen 2.5 VL", "qwen-2.5VL-ocr", "image", "text", "beginner"),

  // ═══════════════════════════════════════════
  // 📄 RAG & Document Chat (22 أداة)
  // ═══════════════════════════════════════════
  t("rag-simple", "RAG أساسي", "Simple RAG", "rag", "نظام RAG أساسي للبحث في المستندات", "simple-rag-workflow", "text", "text", "beginner"),
  t("rag-doc-chat", "شات مع مستندات", "Document Chat", "rag", "محادثة مع ملفات PDF و DOCX و TXT", "document-chat-rag", "file", "text", "beginner"),
  t("rag-fast", "RAG سريع", "Fast RAG", "rag", "RAG عالي السرعة للاستعلامات الفورية", "fastest-rag-stack", "text", "text", "beginner"),
  t("rag-github", "شات مع GitHub", "GitHub RAG", "rag", "محادثة مع أي مستودع GitHub", "github-rag", "url", "text", "intermediate"),
  t("rag-modernbert", "RAG ModernBERT", "ModernBERT RAG", "rag", "RAG بـ ModernBERT embeddings", "modernbert-rag", "text", "text", "intermediate"),
  t("rag-llama4", "RAG Llama 4", "Llama 4 RAG", "rag", "RAG مدعوم بـ Llama 4", "llama-4-rag", "text", "text", "intermediate"),
  t("rag-colbert", "RAG ColBERT", "ColBERT RAG", "rag", "RAG بـ ColBERT للبحث الدقيق", "colbert-rag", "text", "text", "intermediate"),
  t("rag-agentic", "RAG وكيلي", "Agentic RAG", "rag", "RAG وكيلي يبحث في المستندات والويب", "agentic_rag", "text", "text", "intermediate"),
  t("rag-agentic-v2", "RAG وكيلي v2 (Pinecone)", "Agentic RAG v2 (Pinecone)", "rag", "RAG وكيلي بـ Pinecone vector DB + Gemini embeddings (fallback لـ web search)", "agentic_rag_v2_pinecone", "text", "text", "advanced"),
  t("rag-corrective", "RAG تصحيحي", "Corrective RAG", "rag", "RAG يصحح الأخطاء ويتحقق من الإجابات", "corrective-rag", "text", "text", "intermediate"),
  t("rag-trustworthy", "RAG موثوق", "Trustworthy RAG", "rag", "RAG موثوق للوثائق المعقدة", "trustworthy-rag", "text", "text", "advanced"),
  t("rag-docling", "RAG Excel", "Docling RAG", "rag", "RAG على ملفات Excel و CSV", "rag-with-dockling", "file", "text", "intermediate"),
  t("rag-sql", "RAG + SQL", "RAG SQL Router", "rag", "وكيل RAG مع توجيه SQL", "rag-sql-router", "text", "text", "advanced"),
  t("rag-code-chat", "شات مع كود", "Code Chat", "rag", "محادثة مع مستودع كود", "chat-with-code", "code", "text", "intermediate"),
  t("rag-multimodal", "RAG متعدد الوسائط", "Multimodal RAG", "rag", "RAG على صور + نص + صوت", "deepseek-multimodal-RAG", "file", "text", "advanced"),
  t("rag-website", "RAG مواقع", "Website RAG", "rag", "RAG على محتوى أي موقع", "Colivara-deepseek-website-RAG", "url", "text", "intermediate"),
  t("rag-audio", "RAG صوتي", "Audio RAG", "rag", "RAG على ملفات صوتية", "multimodal-rag-assemblyai", "audio", "text", "advanced"),
  t("rag-video", "RAG فيديو", "Video RAG", "rag", "محادثة مع محتوى فيديو", "video-rag-gemini", "file", "text", "advanced"),
  t("rag-deploy", "RAG API", "Deploy RAG", "rag", "RAG كـ API خاص", "deploy-agentic-rag", "text", "text", "advanced"),
  t("rag-groundx", "معالجة مستندات", "GroundX Pipeline", "rag", "معالجة مستندات عالية الجودة", "groundX-doc-pipeline", "file", "text", "advanced"),
  t("rag-milvus", "RAG Milvus", "Milvus RAG", "rag", "RAG فائق السرعة بـ Milvus", "fastest-rag-milvus-groq", "text", "text", "advanced"),
  t("rag-eval", "تقييم RAG", "RAG Evaluation", "rag", "تقييم جودة نظام RAG", "eval-and-observability", "text", "json", "advanced"),

  // ═══════════════════════════════════════════
  // 🤖 Agents & Workflows (18 أداة)
  // ═══════════════════════════════════════════
  t("agent-book-writer", "كاتب كتب", "Book Writer", "agents", "نظام كتابة كتب كاملة بالـ AI", "book-writer-flow", "text", "text", "intermediate"),
  t("agent-content-planner", "مخطط محتوى", "Content Planner", "agents", "تخطيط محتوى سوشيال ميديا", "content_planner_flow", "text", "text", "intermediate"),
  t("agent-brand-monitor", "مراقبة علامات", "Brand Monitor", "agents", "مراقبة ذكر العلامة التجارية", "brand-monitoring", "text", "text", "intermediate"),
  t("agent-doc-writer", "كاتب توثيق", "Doc Writer", "agents", "توليد توثيق تلقائي للكود", "documentation-writer-flow", "code", "text", "intermediate"),
  t("agent-news", "مولد أخبار", "News Generator", "agents", "توليد أخبار بالـ AI", "ai_news_generator", "text", "text", "intermediate"),
  t("agent-stock-analyst", "محلل أسهم", "Stock Analyst", "agents", "تحليل الأسهم بالـ AI", "autogen-stock-analyst", "text", "text", "advanced"),
  t("agent-hotel-booking", "حجز فنادق", "Hotel Booking", "agents", "وكيل حجز فنادق ذكي", "hotel-booking-crew", "text", "text", "intermediate"),
  t("agent-flight-booking", "حجز طيران", "Flight Booking", "agents", "وكيل حجز طيران ذكي", "flight-booking-crew", "text", "text", "intermediate"),
  t("agent-paralegal", "مساعد قانوني", "Paralegal", "agents", "مساعد قانوني بالـ AI", "paralegal-agent-crew", "text", "text", "advanced"),
  t("agent-web-browser", "متصفح ويب", "Web Browser", "agents", "وكيل يتصفح الويب ويلخص", "web-browsing-agent", "url", "text", "advanced"),
  t("agent-firecrawl", "وكيل FireCrawl", "FireCrawl Agent", "agents", "RAG + بحث ويب", "firecrawl-agent", "text", "text", "advanced"),
  t("agent-deep-research", "باحث عميق", "Deep Researcher", "agents", "بحث عميق متعدد الوكلاء", "Multi-Agent-deep-researcher-mcp-windows-linux", "text", "text", "advanced"),
  t("agent-multi-platform", "بحث متعدد", "Multi-Platform Research", "agents", "بحث على منصات متعددة", "multiplatform_deep_researcher", "text", "text", "advanced"),
  t("agent-swarm", "Swarm وكلاء", "Agent Swarm", "agents", "نظام وكلاء متضافرين", "openai-swarm-ollama", "text", "text", "advanced"),
  t("agent-builder", "بناء وكلاء", "Agent Builder", "agents", "بناء وكيل AI مخصص", "open-agent-builder", "text", "text", "advanced"),
  t("agent-context-engine", "محرك سياق", "Context Engine", "agents", "مساعد بحث ذكي بالسياق", "context-engineering-workflow", "text", "text", "advanced"),
  t("agent-conversational", "وكيل محادثة", "Conversational Agent", "agents", "وكيل محادثة متقدم", "parlant-conversational-agent", "text", "text", "advanced"),
  t("agent-portfolio", "تحليل محفظة", "Portfolio Analysis", "agents", "تحليل محفظة استثمارية", "stock-portfolio-analysis-agent", "text", "text", "advanced"),

  // ═══════════════════════════════════════════
  // 🎤 Audio & Voice (6 أدوات)
  // ═══════════════════════════════════════════
  t("voice-bot", "روبوت صوتي", "Voice Bot", "audio", "روبوت محادثة صوتي في الوقت الحقيقي", "real-time-voicebot", "audio", "audio", "advanced"),
  t("voice-rag", "RAG صوتي", "Voice RAG", "audio", "RAG صوتي للمستندات", "rag-voice-agent", "audio", "audio", "advanced"),
  t("audio-chat", "شات مع صوت", "Audio Chat", "audio", "محادثة مع ملفات صوتية", "chat-with-audios", "audio", "text", "intermediate"),
  t("audio-analysis", "تحليل صوت", "Audio Analysis", "audio", "تحليل محتوى صوتي", "audio-analysis-toolkit", "audio", "text", "intermediate"),
  t("meeting-notes", "ملاحظات اجتماعات", "Meeting Notes", "audio", "توليد ملاحظات اجتماعات تلقائياً", "multilingual-meeting-notes-generator", "audio", "text", "intermediate"),
  t("voice-agent-mcp", "وكيل صوتي MCP", "Voice MCP Agent", "audio", "وكيل صوتي بـ MCP", "mcp-voice-agent", "audio", "audio", "advanced"),

  // ═══════════════════════════════════════════
  // 🎨 Media & Content (8 أدوات)
  // ═══════════════════════════════════════════
  t("podcast-gen", "توليد بودكاست", "Podcast Generator", "media", "تحويل نص/مقال لـ بودكاست", "ai-podcast-generation", "text", "audio", "intermediate"),
  t("avatar", "أفاتار AI", "AI Avatar", "media", "أفاتار محادثة بالـ AI", "ai-avatar-demo", "text", "video", "advanced"),
  t("notebook-lm", "NotebookLM", "NotebookLM Clone", "media", "NotebookLM كامل: RAG + استشهادات + بودكاست", "notebook-lm-clone", "file", "text", "advanced"),
  t("social-content", "محتوى سوشيال", "Social Content", "media", "أتمتة محتوى السوشيال ميديا", "motia-content-creation", "text", "text", "intermediate"),
  t("youtube-trends", "تحليل يوتيوب", "YouTube Trends", "media", "تحليل اتجاهات يوتيوب", "Youtube-trend-analysis", "text", "text", "intermediate"),
  t("image-gen-janus", "توليد صور Janus", "Janus Image Gen", "media", "توليد صور بـ Janus-Pro", "imagegen-janus-pro", "text", "image", "intermediate"),
  t("streaming-chat", "شات streaming", "Streaming Chat", "media", "شات بـ streaming في الوقت الحقيقي", "streaming-ai-chatbot", "text", "text", "beginner"),
  t("ai-podcast-m2", "بودكاست M2", "M2 Podcast", "media", "بودكاست بـ Minimax M2", "ai-podcast-generator", "text", "audio", "intermediate"),

  // ═══════════════════════════════════════════
  // 💰 Business & Finance (8 أدوات)
  // ═══════════════════════════════════════════
  t("financial-analyst", "محلل مالي", "Financial Analyst", "business", "تحليل مالي شامل بالـ AI", "financial-analyst-deepseek", "text", "text", "advanced"),
  t("sales-analytics", "تحليل مبيعات", "Sales Analytics", "business", "تحليل بيانات المبيعات", "sales-analytics-agent", "file", "text", "intermediate"),
  t("amazon-analysis", "تحليل منتجات", "Amazon Analysis", "business", "تحليل منتجات أمازون", "amazon-product-analysis-server", "url", "text", "intermediate"),
  t("website-to-api", "موقع → API", "Website to API", "business", "تحويل أي موقع لـ API", "Website-to-API-with-FireCrawl", "url", "json", "intermediate"),
  t("image-similarity", "تشابه صور", "Image Similarity", "business", "كشف التشابه بين الصور", "siamese-network", "image", "json", "advanced"),
  t("object-detection", "كشف أشياء", "Object Detection", "business", "تدريب YOLO لكشف الأشياء", "train-yolo26-object-detection", "image", "json", "advanced"),
  t("memory-agent", "ذاكرة AI", "Memory Agent", "business", "وكيل بذاكرة طويلة المدى", "zep-memory-assistant", "text", "text", "intermediate"),
  t("db-memory-agent", "ذاكرة DB", "DB Memory Agent", "business", "ذاكرة وكيل بقاعدة بيانات", "database-memory-agent", "text", "text", "advanced"),

  // ═══════════════════════════════════════════
  // 🔗 MCP & Tools (16 أداة)
  // ═══════════════════════════════════════════
  t("mcp-search", "بحث MCP", "MCP Search", "mcp", "بحث ويب عميق بـ MCP", "cursor_linkup_mcp", "text", "text", "advanced"),
  t("mcp-client", "عميل MCP", "MCP Client", "mcp", "عميل MCP محلي", "llamaindex-mcp", "text", "text", "advanced"),
  t("mcp-agentic", "RAG وكيلي MCP", "MCP Agentic RAG", "mcp", "RAG وكيلي بـ MCP", "mcp-agentic-rag", "text", "text", "advanced"),
  t("mcp-sdv", "بيانات صناعية", "SDV MCP", "mcp", "بيانات صناعية بـ MCP", "sdv-mcp", "text", "json", "advanced"),
  t("mcp-kitops", "إدارة نماذج", "KitOps MCP", "mcp", "إدارة نماذج ML بـ MCP", "kitops-mcp", "text", "json", "advanced"),
  t("mcp-graphiti", "ذاكرة persistent", "Graphiti MCP", "mcp", "ذاكرة دائمة بـ Graphiti", "graphiti-mcp", "text", "text", "advanced"),
  t("mcp-pixeltable", "بيانات متعددة", "Pixeltable MCP", "mcp", "تنسيق بيانات متعددة الوسائط", "pixeltable-mcp", "file", "json", "advanced"),
  t("mcp-mindsdb", "MCP قواعد بيانات", "MindsDB MCP", "mcp", "MCP لكل مصادر البيانات", "mindsdb-mcp", "text", "text", "advanced"),
  t("mcp-stagehand", "أتمتة ويب", "Stagehand MCP", "mcp", "أتمتة ويب بـ Stagehand", "stagehand x mcp-use", "url", "text", "advanced"),
  t("mcp-assistant", "مساعد شامل", "Ultimate MCP Assistant", "mcp", "مساعد AI متعدد الـ MCP", "ultimate-ai-assitant-using-mcp", "text", "text", "advanced"),
  t("mcp-finetune", "fine-tuning MCP", "Finetune MCP", "mcp", "fine-tuning بـ MCP", "finetune-studio-mcp-app", "text", "json", "advanced"),
  t("mcp-memory", "وكيل بذاكرة MCP", "MCP Memory Agent", "mcp", "وكيل بذاكرة MCP و Opik", "agent-with-mcp-memory", "text", "text", "advanced"),
  t("mcp-hf-skills", "HF Skills", "HF Skills MCP", "mcp", "مهارات HuggingFace بـ MCP", "hugging-face-skills", "text", "text", "advanced"),
  t("mcp-rl", "MCP + RL", "ART MCP RL", "mcp", "تدريب وكيل MCP بـ RL", "art_mcp_rl", "text", "json", "advanced"),
  t("mcp-eyelevel", "EyeLevel MCP", "EyeLevel RAG MCP", "mcp", "MCP لـ RAG على وثائق معقدة", "eyelevel-mcp-rag", "text", "text", "advanced"),
  t("mcp-pipeline", "Context Pipeline", "Context Pipeline MCP", "mcp", "pipeline سياق بـ MCP", "context-engineering-pipeline", "text", "text", "advanced"),

  // ═══════════════════════════════════════════
  // 📊 Comparison & Eval (8 أدوات)
  // ═══════════════════════════════════════════
  t("compare-code", "مقارنة كود", "Code Compare", "compare", "مقارنة قدرات توليد الكود", "code-model-comparison", "code", "json", "intermediate"),
  t("compare-reasoning", "مقارنة reasoning", "Reasoning Compare", "compare", "مقارنة قدرات الاستدلال", "gpt-oss-vs-qwen3", "text", "json", "intermediate"),
  t("compare-models", "مقارنة نماذج", "Model Compare", "compare", "مقارنة بين نماذج AI مختلفة", "llama-4_vs_deepseek-r1", "text", "json", "intermediate"),
  t("compare-o3-claude", "O3 vs Claude", "O3 vs Claude", "compare", "مقارنة O3 و Claude", "o3-vs-claude-code", "text", "json", "intermediate"),
  t("compare-sonnet-o4", "Sonnet vs O4", "Sonnet vs O4", "compare", "مقارنة Sonnet 4 و O4", "sonnet4-vs-o4", "code", "json", "intermediate"),
  t("compare-coder", "مقارنة مبرمجين", "Coder Compare", "compare", "مقارنة نماذج البرمجة", "sonnet4-vs-qwen3-coder", "code", "json", "intermediate"),
  t("compare-multimodel", "مقارنة شاملة", "Multi-Model Compare", "compare", "مقارنة نماذج متعددة", "minimaxm2-vs-sonnet4-5-vs-kimik2-vs-gemini3", "text", "json", "advanced"),
  t("eval-guidelines", "إرشادات", "Guidelines Eval", "compare", "مقارنة الإرشادات والـ prompts", "guidelines-vs-traditional-prompt", "text", "json", "intermediate"),

  // ═══════════════════════════════════════════
  // 🔬 Training & Research (8 أدوات)
  // ═══════════════════════════════════════════
  t("train-finetune", "fine-tuning", "Fine-tuning", "training", "ضبط نموذج على بيانات مخصصة", "DeepSeek-finetuning", "file", "json", "advanced"),
  t("train-reasoning", "بناء reasoning", "Build Reasoning", "training", "بناء نموذج reasoning من الصفر", "Build-reasoning-model", "text", "json", "advanced"),
  t("train-grpo", "GRPO fine-tune", "GRPO Training", "training", "تدريب GRPO على Qwen3", "grpo-finetuning-qwen3", "text", "json", "advanced"),
  t("train-distillation", "distillation", "Knowledge Distillation", "training", "تقطير المعرفة من نموذج لآخر", "knowledge distillation", "text", "json", "advanced"),
  t("deploy-secure", "نشر آمن", "Secure Deploy", "training", "نشر آمن للنماذج", "openclaw-secure-deployment", "text", "json", "advanced"),
  t("acp-protocol", "بروتوكول ACP", "ACP Protocol", "training", "بروتوكول اتصال الوكلاء", "acp-code", "text", "text", "advanced"),
  t("a2a-demo", "A2A", "Agent2Agent", "training", "اتصال وكيل لوكيل", "agent2agent-demo", "text", "text", "advanced"),
  t("roadmap", "خارطة الطريق", "AI Roadmap", "training", "خارطة طريق هندسة AI", "ai-engineering-roadmap", "text", "text", "beginner"),
];

/** قائمة بكل الفئات */
export const TOOL_CATEGORIES: { id: ToolCategory; name: string; nameEn: string; icon: string; color: string }[] = [
  { id: "ocr", name: "OCR والرؤية", nameEn: "OCR & Vision", icon: "📸", color: "amber" },
  { id: "rag", name: "RAG والمستندات", nameEn: "RAG & Documents", icon: "📄", color: "sky" },
  { id: "agents", name: "الوكلاء والأتمتة", nameEn: "Agents & Automation", icon: "🤖", color: "emerald" },
  { id: "audio", name: "الصوت والصوتيات", nameEn: "Audio & Voice", icon: "🎤", color: "rose" },
  { id: "media", name: "الميديا والمحتوى", nameEn: "Media & Content", icon: "🎨", color: "violet" },
  { id: "business", name: "الأعمال والمال", nameEn: "Business & Finance", icon: "💰", color: "teal" },
  { id: "mcp", name: "MCP والأدوات", nameEn: "MCP & Tools", icon: "🔗", color: "indigo" },
  { id: "compare", name: "المقارنة والتقييم", nameEn: "Comparison & Eval", icon: "📊", color: "orange" },
  { id: "training", name: "التدريب والأبحاث", nameEn: "Training & Research", icon: "🔬", color: "fuchsia" },
];

/** أداة واحدة بالـ id */
export function getTool(id: string): AITool | undefined {
  return AI_TOOLS.find((tool) => tool.id === id);
}

/** أدوات حسب الفئة */
export function getToolsByCategory(category: ToolCategory): AITool[] {
  return AI_TOOLS.filter((tool) => tool.category === category);
}

/** إحصائيات */
export function getToolStats() {
  const byCategory: Record<string, number> = {};
  for (const tool of AI_TOOLS) {
    byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
  }
  return {
    total: AI_TOOLS.length,
    byCategory,
    categories: Object.keys(byCategory).length,
  };
}
