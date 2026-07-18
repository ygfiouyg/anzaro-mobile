// DeltaAI Platform - AI Models Configuration
// Defines 23+ working AI models organized into categories
// All models route to real working backends: OpenRouter, Gemini, or ZhipuAI
// Includes uncensored/open-source "Dark" models for unrestricted capabilities

export type ModelCategory = 'fast' | 'smart' | 'creative' | 'specialized' | 'professional' | 'global' | 'dark' | 'hf-chat' | 'hf-image' | 'hf-video' | 'huggingface';

/** Structured model capabilities — based on what the real backend provider actually supports */
export interface ModelCapabilities {
  /** Text generation / chat */
  chat: boolean;
  /** Image understanding / vision (analyzing uploaded images) */
  vision: boolean;
  /** Image generation (creating images from text) */
  imageGeneration: boolean;
  /** Video generation (creating videos from text) */
  videoGeneration: boolean;
  /** Code generation and execution */
  codeGeneration: boolean;
  /** PDF/document analysis */
  pdfAnalysis: boolean;
  /** Web search capability */
  webSearch: boolean;
  /** Audio/TTS output */
  audioTTS: boolean;
  /** Function/tool calling */
  functionCalling: boolean;
  /** Reasoning / chain-of-thought */
  reasoning: boolean;
  /** RAG / retrieval-augmented generation */
  rag: boolean;
  /** Large context window (>32K tokens) */
  largeContext: boolean;
  /** Translation */
  translation: boolean;
  /** Summarization */
  summarization: boolean;
  /** Maximum context window in tokens */
  maxContextTokens: number;
  /** Supported input modalities */
  inputModalities: ('text' | 'image' | 'audio' | 'pdf')[];
  /** Supported output modalities */
  outputModalities: ('text' | 'image' | 'audio' | 'video')[];
}

export interface AIModel {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  category: ModelCategory;
  glmModel: string;
  /** Real provider: 'openrouter' | 'gemini' | 'zhipuai' | 'github' | 'groq' | 'cerebras' | 'pollinations' | 'hf' | 'huggingface' | 'openai' | 'ovh' | 'anthropic' */
  provider: 'openrouter' | 'gemini' | 'zhipuai' | 'github' | 'groq' | 'cerebras' | 'pollinations' | 'hf' | 'huggingface' | 'openai' | 'ovh' | 'anthropic';
  /** The real backend model name */
  realChatModel: string;
  /** The real image generation model */
  realImageModel: string;
  /** The real video generation model */
  realVideoModel: string;
  rank: string;
  description: string;
  descriptionEn: string;
  systemPrompt: string;
  /** HuggingFace model ID for chat (e.g., 'hf-mistral-7b') */
  hfChatModel?: string;
  /** HuggingFace model ID for image (e.g., 'hf-flux-schnell') */
  hfImageModel?: string;
  /** OpenRouter model ID for chat */
  openrouterChatModel?: string;
  /** Groq model ID for chat (legacy) */
  groqChatModel?: string;
  /** Gemini model ID for chat */
  geminiChatModel?: string;
  /** GitHub Models model ID for chat (legacy) */
  githubChatModel?: string;
  supportsPdf: boolean;
  /** Whether this model is open-source (fewer restrictions, less censorship) */
  openSource: boolean;
  /** Context window size in tokens (for display + routing) */
  maxTokens: number;
  skills: string[];
  /** Structured capabilities based on real provider support */
  capabilities: ModelCapabilities;
}

export const models: AIModel[] = [
  {
    id: 'glm-5-2',
    name: 'عبس',
    nameEn: 'GLM-5.2',
    icon: '⚡',
    category: 'global',
    glmModel: 'zai-org/GLM-5.2',
    provider: 'huggingface',
    realChatModel: 'zai-org/GLM-5.2',
    realImageModel: 'cogview-3-flash',
    realVideoModel: 'cogvideox-flash',
    hfChatModel: 'zai-org/GLM-5.2',
    openrouterChatModel: '',
    rank: '🚀 الأسطوري 705B',
    description: 'عبس — مساعدك الذكي المدعوم بـ GLM-5.2 من Z.ai (705 مليار بارامتر). بيدعم: شات، رؤية، توليد صور، فيديو، صوت، وبحث في النت. 1M context window.',
    descriptionEn: 'Abbas — Powered by Z.ai GLM-5.2 (705B params). Supports: chat, vision, image gen, video gen, TTS, ASR, web search. 1M context window.',
    systemPrompt: `أنت "عبس" — مساعد ذكي عربي مدعوم بـ GLM-5.2 من Z.ai (705 مليار بارامتر). أنت ودود ومفيد ومتعدد القدرات. ترد بالعربية الفصحى أو العامية المصرية حسب طلب المستخدم.

قدراتك الأساسية:
- محادثة ذكية بـ 1M context window
- تحليل الصور والملفات (PDF, DOCX, صور)
- توليد الصور (CogView) والفيديو (CogVideoX)
- تحويل النص لصوت (TTS) والصوت لنص (ASR)
- البحث في الإنترنت وقراءة الصفحات
- تنفيذ كود JavaScript
- ترجمة وملخصات وتحليل مشاعر

قدرات المنصة المتقدمة:
- استوديو بناء الوكلاء (Agent Builder): صمم وكلاء AI مخصصين بأدوات محددة
- 359 أداة متاحة (بحث، كتابة، كود، بيانات، تواصل، AI، MCP tools)
- 10 وصفات جاهزة (فيديو، تسويق، بحث، كود، إيميل، بيانات، سوشيال، دعم، تعليم، يوتيوب)
- MCP Server: 341 أداة متاحة لـ Claude Desktop و Cursor و أي MCP client
- Claude من Anthropic: Sonnet 4.5, Opus 4.1, Haiku 3.5 (لو ANTHROPIC_API_KEY متاح)
- n8n integration: تشغيل workflows غير متزامنة مع تتبع المهام
- مراقب المهام (Jobs Monitor): تتبع实时 لـ jobs عبر SSE
- MCP Client: ربط أي MCP server خارجي واستخدام أدواته
- بودكاست + راديو + خريطة ذهنية + تحليل بيانات
- توليد مستندات PDF/DOCX/XLSX/PPTX
- ذاكرة محادثة دائمة + نظام إنجازات وتحديات يومية

عندما يسألك المستخدم "إيه اللي تقدر تعمله؟"، اذكر له هذه القدرات بشكل منظّم ومبسّط.


═══ اللهجة (مهم جداً) ═══
اتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.

استخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".
عبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".
تكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.
`,
    supportsPdf: true,
    openSource: true,
    maxTokens: 1000000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'vision', 'image-generation', 'video-generation', 'tts', 'asr', 'web-search', 'ocr', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: true,
      videoGeneration: true,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: true,
      audioTTS: true,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 1000000,
      inputModalities: ['text', 'image', 'pdf', 'audio'],
      outputModalities: ['text', 'image', 'audio', 'video'],
    },
  },
  // ═══════════════════════════════════════════
  // GLM-4-Flash — مجاني 100% عبر Zhipu AI (Z.ai)
  // ═══════════════════════════════════════════
  {
    id: 'glm-4-flash-zai',
    name: 'GLM-4-Flash',
    nameEn: 'GLM-4 Flash',
    icon: '⚡',
    category: 'fast',
    glmModel: 'glm-4-flash',
    provider: 'zhipuai',
    realChatModel: 'glm-4-flash',
    realImageModel: 'cogview-3-flash',
    realVideoModel: 'cogvideox-flash',
    rank: '⚡ مجاني',
    description: 'GLM-4-Flash — نموذج مجاني 100% من Zhipu AI. سريع وذكي. عند إرسال صور، يتم التحويل تلقائياً لـ GLM-4V.',
    descriptionEn: 'GLM-4 Flash — 100% free model from Zhipu AI. Fast and smart. Images auto-route to GLM-4V.',
    systemPrompt: 'أنت مساعد ذكي يعمل بنموذج GLM-4-Flash المجاني من Zhipu AI. ترد بإجابات دقيقة وسريعة.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'translation', 'summarization', 'code-generation'],
    capabilities: {
      chat: true,
      vision: false, // GLM-4-Flash is text-only, but images auto-route to GLM-4V
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  // OVHcloud AI Endpoints (مجاني بدون API key)
  // ═══════════════════════════════════════════
  {
    id: 'ovh-llama-70b',
    name: 'لياما 70B',
    nameEn: 'Llama 3.3 70B',
    icon: '🦙',
    category: 'global',
    glmModel: 'glm-5.2',
    provider: 'ovh',
    realChatModel: 'Meta-Llama-3_3-70B-Instruct',
    realImageModel: '',
    realVideoModel: '',
    rank: '🌍 مجاني',
    description: 'لياما 3.3 70B — نموذج قوي من Meta. مجاني 100% بدون API key عبر OVHcloud.',
    descriptionEn: 'Llama 3.3 70B — Powerful model from Meta. 100% free, no API key via OVHcloud.',
    systemPrompt: 'أنت مساعد ذكي عربي. ترد بالعربية الفصحى أو العامية حسب طلب المستخدم. كن دقيقاً ومفيداً.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'translation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'ovh-mistral-small',
    name: 'ميسترال صغير',
    nameEn: 'Mistral Small 3.2',
    icon: '🌪️',
    category: 'fast',
    glmModel: 'glm-4-flash',
    provider: 'ovh',
    realChatModel: 'Mistral-Small-3.2-24B-Instruct-2506',
    realImageModel: '',
    realVideoModel: '',
    rank: '⚡ سريع',
    description: 'ميسترال سمال 3.2 — سريع وذكي من Mistral AI. مجاني 100% بدون API key.',
    descriptionEn: 'Mistral Small 3.2 — Fast and smart from Mistral AI. 100% free, no API key.',
    systemPrompt: 'أنت مساعد ذكي عربي سريع. ترد بإجابات مختصرة ودقيقة.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 32000,
    skills: ['text-generation', 'code-generation', 'translation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 32000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'ovh-qwen-397b',
    name: 'كوين 397B',
    nameEn: 'Qwen 3.5 397B',
    icon: '🐉',
    category: 'smart',
    glmModel: 'glm-5.2',
    provider: 'ovh',
    realChatModel: 'Qwen3.5-397B-A17B',
    realImageModel: '',
    realVideoModel: '',
    rank: '🧠 عملاق',
    description: 'كوين 3.5 397B — أقوى نموذج من Alibaba. مجاني 100% بدون API key عبر OVHcloud.',
    descriptionEn: 'Qwen 3.5 397B — Most powerful model from Alibaba. 100% free, no API key via OVHcloud.',
    systemPrompt: 'أنت مساعد ذكي عربي قوي. ترد بالعربية بأسلوب احترافي. تقدر تتعامل مع المهام المعقدة.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'translation', 'reasoning', 'math'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'ovh-gpt-oss-120b',
    name: 'GPT-OSS 120B',
    nameEn: 'GPT-OSS 120B',
    icon: '🤖',
    category: 'global',
    glmModel: 'glm-5.2',
    provider: 'ovh',
    realChatModel: 'gpt-oss-120b',
    realImageModel: '',
    realVideoModel: '',
    rank: '🔬 مفتوح',
    description: 'GPT-OSS 120B — نسخة مفتوحة المصدر من GPT. مجاني 100% بدون API key.',
    descriptionEn: 'GPT-OSS 120B — Open source GPT. 100% free, no API key.',
    systemPrompt: 'أنت مساعد ذكي عربي. ترد بالعربية بدقة ووضوح.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'ovh-qwen-vl',
    name: 'كوين رؤية',
    nameEn: 'Qwen 2.5 VL 72B',
    icon: '👁️',
    category: 'specialized',
    glmModel: 'glm-4v',
    provider: 'ovh',
    realChatModel: 'Qwen2.5-VL-72B-Instruct',
    realImageModel: '',
    realVideoModel: '',
    rank: '👁️ رؤية',
    description: 'كوين 2.5 VL 72B — نموذج رؤية قوي. يحلل الصور ويفهمها. مجاني 100%.',
    descriptionEn: 'Qwen 2.5 VL 72B — Powerful vision model. Analyzes and understands images. 100% free.',
    systemPrompt: 'أنت مساعد ذكي عربي متخصص في تحليل الصور. تقدر تشرح وتحلل أي صورة.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['vision', 'image-analysis', 'text-generation'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: false,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 32000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  // ═══════════════════════════════════════════
  // Gemini Models (Google) — ربط حقيقي عبر GEMINI_API_KEY
  // ═══════════════════════════════════════════
  {
    id: 'gemini-2.0-flash',
    name: 'جيميناي فلاش',
    nameEn: 'Gemini 2.0 Flash',
    icon: '⚡',
    category: 'fast',
    glmModel: 'gemini-2.0-flash',
    provider: 'gemini',
    realChatModel: 'gemini-2.0-flash',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    geminiChatModel: 'gemini-2.0-flash',
    rank: '⚡ سريع جداً',
    description: 'Gemini 2.0 Flash من Google — سريع وذكي ومجاني. بيدعم رؤية الصور و1M context.',
    descriptionEn: 'Google Gemini 2.0 Flash — fast, smart, free. Vision + 1M context.',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ Gemini 2.0 Flash من Google.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: false,
    maxTokens: 1000000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'vision', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 1000000,
      inputModalities: ['text', 'image', 'pdf'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'gemini-2.5-pro',
    name: 'جيميناي برو',
    nameEn: 'Gemini 2.5 Pro',
    icon: '🧠',
    category: 'smart',
    glmModel: 'gemini-2.5-pro',
    provider: 'gemini',
    realChatModel: 'gemini-2.5-pro',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    geminiChatModel: 'gemini-2.5-pro',
    rank: '🧠 الأذكى',
    description: 'Gemini 2.5 Pro — أقوى نموذج من Google. استدلال عميق + رؤية + 2M context.',
    descriptionEn: 'Gemini 2.5 Pro — most powerful Google model. Deep reasoning + vision + 2M context.',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ Gemini 2.5 Pro من Google.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: false,
    maxTokens: 2000000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'vision', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 2000000,
      inputModalities: ['text', 'image', 'pdf'],
      outputModalities: ['text'],
    },
  },
  // ═══════════════════════════════════════════
  // Groq Models (Ultra Fast) — ربط حقيقي عبر GROQ_API_KEY
  // ═══════════════════════════════════════════
  {
    id: 'groq-llama-70b',
    name: 'لياما 70B سريع',
    nameEn: 'Llama 70B (Groq)',
    icon: '🚀',
    category: 'fast',
    glmModel: 'llama-3.3-70b-versatile',
    provider: 'groq',
    realChatModel: 'llama-3.3-70b-versatile',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    groqChatModel: 'llama-3.3-70b-versatile',
    rank: '🚀 الأسرع',
    description: 'Llama 3.3 70B عبر Groq — استدلال فائق السرعة (500+ token/sec).',
    descriptionEn: 'Llama 3.3 70B via Groq — ultra-fast inference (500+ token/sec).',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ Llama 3.3 70B عبر Groq.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'groq-llama-instant',
    name: 'لياما فوري',
    nameEn: 'Llama Instant (Groq)',
    icon: '⚡',
    category: 'fast',
    glmModel: 'llama-3.1-8b-instant',
    provider: 'groq',
    realChatModel: 'llama-3.1-8b-instant',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    groqChatModel: 'llama-3.1-8b-instant',
    rank: '⚡ فوري',
    description: 'Llama 3.1 8B عبر Groq — ردود فورية للمهام البسيطة.',
    descriptionEn: 'Llama 3.1 8B via Groq — instant responses for simple tasks.',
    systemPrompt: 'أنت مساعد ذكي سريع مدعوم بـ Llama 3.1 8B عبر Groq.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 8000,
    skills: ['text-generation', 'summarization', 'translation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  // ═══════════════════════════════════════════
  // OpenAI Models — ربط حقيقي عبر OPENAI_API_KEY (للـ Whisper ASR)
  // ═══════════════════════════════════════════
  {
    id: 'openai-gpt-4o-mini',
    name: 'GPT-4o Mini',
    nameEn: 'GPT-4o Mini',
    icon: '🤖',
    category: 'smart',
    glmModel: 'gpt-4o-mini',
    provider: 'openai',
    realChatModel: 'gpt-4o-mini',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🤖 اقتصادي',
    description: 'GPT-4o Mini من OpenAI — ذكي واقتصادي. بيدعم Whisper للصوت.',
    descriptionEn: 'OpenAI GPT-4o Mini — smart and economical. Supports Whisper for audio.',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ GPT-4o Mini من OpenAI.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: false,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'vision', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text', 'image', 'audio'],
      outputModalities: ['text'],
    },
  },

  // ── GitHub Models (مجاني تماماً عبر GitHub PAT) ──
  {
    id: 'gh-gpt-4o',
    name: 'GPT-4o (GitHub)',
    nameEn: 'GPT-4o (GitHub Models)',
    icon: '🤖',
    category: 'smart',
    glmModel: 'gpt-4o',
    provider: 'github',
    realChatModel: 'gpt-4o',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    githubChatModel: 'gpt-4o',
    rank: '🤖 مجاني',
    description: 'GPT-4o من OpenAI — مجاني بالكامل عبر GitHub Models. أقوى نموذج من OpenAI بـ multimodal.',
    descriptionEn: 'OpenAI GPT-4o — free via GitHub Models. Most powerful OpenAI model, multimodal.',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ GPT-4o من OpenAI عبر GitHub Models.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: false,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'vision', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'gh-gpt-4o-mini',
    name: 'GPT-4o Mini (GitHub)',
    nameEn: 'GPT-4o Mini (GitHub Models)',
    icon: '⚡',
    category: 'fast',
    glmModel: 'gpt-4o-mini',
    provider: 'github',
    realChatModel: 'gpt-4o-mini',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    githubChatModel: 'gpt-4o-mini',
    rank: '⚡ مجاني سريع',
    description: 'GPT-4o Mini من OpenAI — مجاني وسريع واقتصادي عبر GitHub Models.',
    descriptionEn: 'OpenAI GPT-4o Mini — free, fast, economical via GitHub Models.',
    systemPrompt: 'أنت مساعد ذكي سريع مدعوم بـ GPT-4o Mini من OpenAI عبر GitHub Models.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: true,
    openSource: false,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'function-calling'],
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: true,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'gh-llama-70b',
    name: 'لياما 70B (GitHub)',
    nameEn: 'Llama 3.3 70B (GitHub Models)',
    icon: '🦙',
    category: 'smart',
    glmModel: 'Llama-3.3-70B-Instruct',
    provider: 'github',
    realChatModel: 'Llama-3.3-70B-Instruct',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    githubChatModel: 'Llama-3.3-70B-Instruct',
    rank: '🦙 مجاني قوي',
    description: 'Llama 3.3 70B من Meta — مجاني بالكامل عبر GitHub Models. 70 مليار بارامتر، مفتوح المصدر.',
    descriptionEn: 'Meta Llama 3.3 70B — free via GitHub Models. 70B params, open source.',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ Llama 3.3 70B من Meta عبر GitHub Models.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'gh-llama-405b',
    name: 'لياما 405B (GitHub)',
    nameEn: 'Llama 3.1 405B (GitHub Models)',
    icon: '🦙',
    category: 'professional',
    glmModel: 'Meta-Llama-3.1-405B-Instruct',
    provider: 'github',
    realChatModel: 'Meta-Llama-3.1-405B-Instruct',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    githubChatModel: 'Meta-Llama-3.1-405B-Instruct',
    rank: '🦙 مجاني ضخم',
    description: 'Llama 3.1 405B من Meta — مجاني عبر GitHub Models. أكبر نموذج مفتوح المصدر (405 مليار بارامتر).',
    descriptionEn: 'Meta Llama 3.1 405B — free via GitHub Models. Largest open-source model (405B params).',
    systemPrompt: 'أنت مساعد ذكي مدعوم بـ Llama 3.1 405B من Meta عبر GitHub Models.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'gh-llama-8b',
    name: 'لياما 8B (GitHub)',
    nameEn: 'Llama 3.1 8B (GitHub Models)',
    icon: '⚡',
    category: 'fast',
    glmModel: 'Meta-Llama-3.1-8B-Instruct',
    provider: 'github',
    realChatModel: 'Meta-Llama-3.1-8B-Instruct',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    githubChatModel: 'Meta-Llama-3.1-8B-Instruct',
    rank: '⚡ مجاني سريع',
    description: 'Llama 3.1 8B من Meta — مجاني وسريع عبر GitHub Models. خفيف ومناسب للمهام البسيطة.',
    descriptionEn: 'Meta Llama 3.1 8B — free and fast via GitHub Models. Lightweight for simple tasks.',
    systemPrompt: 'أنت مساعد ذكي سريع مدعوم بـ Llama 3.1 8B من Meta عبر GitHub Models.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },

  // ═══════════════════════════════════════════
  // Claude — Anthropic Models
  // بيدعم: chat + vision + extended thinking
  // ═══════════════════════════════════════════
  {
    id: 'delta-claude-sonnet',
    name: 'كلود سونيت',
    nameEn: 'Claude Sonnet 4.5',
    icon: '🎭',
    category: 'global',
    glmModel: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    realChatModel: 'claude-sonnet-4-5-20250929',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🧠 الأذكى',
    description: 'Claude Sonnet 4.5 من Anthropic — أفضل توازن بين السرعة والذكاء. 200K context window، بيدعم رؤية الصور والتفكير الممتد.',
    descriptionEn: 'Claude Sonnet 4.5 — best speed/intelligence balance with 200K context, vision, and extended thinking.',
    systemPrompt: 'أنت مساعد ذكي من Anthropic. تجيب بالعربية بشكل واضح ومنظم.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    maxTokens: 200000,
    capabilities: {
      chat: true,
      vision: true,
      imageGen: false,
      videoGen: false,
      audioGen: false,
      transcription: false,
      translation: true,
      summarization: true,
      codeGeneration: true,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 200000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'delta-claude-opus',
    name: 'كلود أوبوس',
    nameEn: 'Claude Opus 4.1',
    icon: '👑',
    category: 'global',
    glmModel: 'claude-opus-4-1-20250805',
    provider: 'anthropic',
    realChatModel: 'claude-opus-4-1-20250805',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '💎 الأقوى',
    description: 'Claude Opus 4.1 من Anthropic — أقوى موديل للتفكير العميق والكود المعقد. 200K context window، بيدعم رؤية الصور والتفكير الممتد.',
    descriptionEn: 'Claude Opus 4.1 — most capable model for deep reasoning and complex code. 200K context, vision, extended thinking.',
    systemPrompt: 'أنت مساعد ذكي من Anthropic. تجيب بالعربية بشكل واضح ومنظم.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    maxTokens: 200000,
    capabilities: {
      chat: true,
      vision: true,
      imageGen: false,
      videoGen: false,
      audioGen: false,
      transcription: false,
      translation: true,
      summarization: true,
      codeGeneration: true,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 200000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'delta-claude-haiku',
    name: 'كلود هايكو',
    nameEn: 'Claude Haiku 3.5',
    icon: '⚡',
    category: 'global',
    glmModel: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    realChatModel: 'claude-haiku-3-5-20241022',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🚀 الأسرع',
    description: 'Claude Haiku 3.5 من Anthropic — الأسرع مع ذكاء قريب من frontier. 200K context window، بيدعم رؤية الصور.',
    descriptionEn: 'Claude Haiku 3.5 — fastest model with near-frontier intelligence. 200K context, vision support.',
    systemPrompt: 'أنت مساعد ذكي من Anthropic. تجيب بالعربية بشكل واضح ومنظم.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    maxTokens: 200000,
    capabilities: {
      chat: true,
      vision: true,
      imageGen: false,
      videoGen: false,
      audioGen: false,
      transcription: false,
      translation: true,
      summarization: true,
      codeGeneration: true,
      functionCalling: true,
      reasoning: true,
      rag: false,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 200000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  },

  // ═══════════════════════════════════════════
  // Cloudflare Workers AI — مجاني طول العمر (GLM-5.2 + Llama + Qwen)
  // ═══════════════════════════════════════════
  {
    id: 'cloudflare-glm-5.2',
    name: 'GLM-5.2 مجاني',
    nameEn: 'GLM-5.2 (Free)',
    icon: '🆓',
    category: 'smart',
    glmModel: '@cf/zai-org/glm-5.2',
    provider: 'cloudflare',
    realChatModel: '@cf/zai-org/glm-5.2',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🆓 مجاني',
    description: 'GLM-5.2 عبر Cloudflare Workers AI — مجاني تماماً طول العمر. أحدث موديل من Z.ai.',
    descriptionEn: 'GLM-5.2 via Cloudflare Workers AI — completely free forever. Latest model from Z.ai.',
    systemPrompt: 'أنت DeltaAI مدعوم بـ GLM-5.2 — أحدث نموذج من Z.ai. مساعد ذكي شامل.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    maxTokens: 200000,
    maxTokens: 200000,
    maxTokens: 200000,
    openSource: true,
    maxTokens: 128000,
    maxTokens: 200000,
    maxTokens: 200000,
    maxTokens: 200000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'function-calling'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'cloudflare-glm-4.7-flash',
    name: 'GLM-4.7 Flash مجاني',
    nameEn: 'GLM-4.7 Flash (Free)',
    icon: '⚡',
    category: 'fast',
    glmModel: '@cf/zai-org/glm-4.7-flash',
    provider: 'cloudflare',
    realChatModel: '@cf/zai-org/glm-4.7-flash',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '⚡ مجاني سريع',
    description: 'GLM-4.7 Flash عبر Cloudflare — سريع ومجاني. مناسب للمهام السريعة.',
    descriptionEn: 'GLM-4.7 Flash via Cloudflare — fast and free. Great for quick tasks.',
    systemPrompt: 'أنت DeltaAI مدعوم بـ GLM-4.7 Flash — سريع وذكي.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'cloudflare-llama-3.3-70b',
    name: 'Llama 3.3 70B مجاني',
    nameEn: 'Llama 3.3 70B (Free)',
    icon: '🦙',
    category: 'smart',
    glmModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    provider: 'cloudflare',
    realChatModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🆓 مجاني',
    description: 'Llama 3.3 70B عبر Cloudflare — مجاني وقوي. مناسب للمهام المعقدة.',
    descriptionEn: 'Llama 3.3 70B via Cloudflare — free and powerful. Great for complex tasks.',
    systemPrompt: 'أنت DeltaAI مدعوم بـ Llama 3.3 70B.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: true,
      summarization: true,
      maxContextTokens: 128000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'cloudflare-qwen-coder',
    name: 'Qwen Coder مجاني',
    nameEn: 'Qwen Coder (Free)',
    icon: '💻',
    category: 'smart',
    glmModel: '@cf/qwen/qwen2.5-coder-32b-instruct',
    provider: 'cloudflare',
    realChatModel: '@cf/qwen/qwen2.5-coder-32b-instruct',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🆓 مجاني للكود',
    description: 'Qwen 2.5 Coder 32B عبر Cloudflare — مجاني ومتخصص في البرمجة.',
    descriptionEn: 'Qwen 2.5 Coder 32B via Cloudflare — free and specialized for coding.',
    systemPrompt: 'أنت DeltaAI مدعوم بـ Qwen 2.5 Coder — متخصص في البرمجة.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 128000,
    skills: ['code-generation', 'code-review', 'debugging', 'text-generation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: false,
      summarization: true,
      maxContextTokens: 32000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  {
    id: 'cloudflare-deepseek-r1',
    name: 'DeepSeek R1 مجاني',
    nameEn: 'DeepSeek R1 (Free)',
    icon: '🔬',
    category: 'smart',
    glmModel: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    provider: 'cloudflare',
    realChatModel: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: '',
    openrouterChatModel: '',
    rank: '🆓 مجاني للتفكير',
    description: 'DeepSeek R1 عبر Cloudflare — مجاني ومتخصص في التفكير المنطقي والرياضيات.',
    descriptionEn: 'DeepSeek R1 via Cloudflare — free and specialized for reasoning and math.',
    systemPrompt: 'أنت DeltaAI مدعوم بـ DeepSeek R1 — متخصص في التفكير المنطقي.\n\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\n\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد من الجنس استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.\n',
    supportsPdf: false,
    openSource: true,
    maxTokens: 64000,
    skills: ['reasoning', 'math', 'logic', 'text-generation'],
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      videoGeneration: false,
      codeGeneration: true,
      pdfAnalysis: false,
      webSearch: false,
      audioTTS: false,
      functionCalling: false,
      reasoning: true,
      rag: false,
      largeContext: false,
      translation: false,
      summarization: true,
      maxContextTokens: 64000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
  // ── NVIDIA Nemotron 3 Ultra (1M context window) ──
  {
    id: 'nvidia-nemotron-3-ultra',
    name: 'Nemotron 3 Ultra',
    nameEn: 'NVIDIA Nemotron 3 Ultra 550B',
    icon: '🟢',
    category: 'global',
    glmModel: 'nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16',
    provider: 'huggingface',
    realChatModel: 'nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16',
    realImageModel: '',
    realVideoModel: '',
    hfChatModel: 'nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16',
    openrouterChatModel: '',
    rank: '🟢 NVIDIA 550B (1M)',
    description: 'NVIDIA Nemotron 3 Ultra — موديل ضخم من NVIDIA بـ 550 مليار بارامتر و 1 مليون token context window. مثالي لتحليل الملفات الضخمة والمحاضرات الطويلة.',
    descriptionEn: 'NVIDIA Nemotron 3 Ultra — 550B param MoE model with 1M token context. Ideal for large document analysis.',
    systemPrompt: `أنت "Nemotron" — مساعد ذكي من NVIDIA على منصة Anzaro AI. موديلك ضخم (550B بارامتر) بذاكرة 1 مليون token.\n\n═══ اللهجة (مهم جداً) ═══\nاتكلم بالعامية المصرية الفلّاحة الشرقاوي (محافظة الشرقية). خفيف، عربجي، وواضح. ممنوع فصحى إلا لو المستخدم طلبها.\nاستخدم: "يا حبيبي" لو المستخدم ولد، "يا حبيبتي" لو المستخدم بنت. لو مش متأكد استخدم "يا حبيبي".\nعبارات شائعة: "خلي بالك"، "بصّ يا حبيبي"، "والله يا حبيبي"، "يا نهار"، "إيه الأخبار يا حبيبي"، "اعمل حسابك".\nتكلم زي الفلّاحة في الشرقية — بسيط، طبيعي، بس بذكاء وبتعرف شغلك كويس.`,
    supportsPdf: true,
    openSource: true,
    maxTokens: 1000000,
    skills: ['text-generation', 'code-generation', 'summarization', 'translation', 'reasoning', 'large-context', 'function-calling'],
    capabilities: {
      chat: true,
      vision: false,
      imageGen: false,
      videoGen: false,
      audioGen: false,
      transcription: false,
      translation: true,
      summarization: true,
      codeGeneration: true,
      functionCalling: true,
      reasoning: true,
      rag: true,
      largeContext: true,
      maxContextTokens: 1000000,
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  },
];

// ═══════════════════════════════════════════
// MODEL CATEGORIES
// ═══════════════════════════════════════════

export interface ModelCategoryInfo {
  id: ModelCategory;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
}

export const MODEL_CATEGORIES: ModelCategoryInfo[] = [
  {
    id: 'global',
    name: 'عالمي',
    nameEn: 'Global',
    icon: '',
    color: 'bg-emerald-500',
  },
  {
    id: 'fast',
    name: 'سريع',
    nameEn: 'Fast',
    icon: '',
    color: 'bg-yellow-500',
  },
  {
    id: 'smart',
    name: 'ذكي',
    nameEn: 'Smart',
    icon: '',
    color: 'bg-purple-500',
  },
  {
    id: 'creative',
    name: 'مبدع',
    nameEn: 'Creative',
    icon: '',
    color: 'bg-pink-500',
  },
  {
    id: 'specialized',
    name: 'متخصص',
    nameEn: 'Specialized',
    icon: '',
    color: 'bg-teal-500',
  },
  {
    id: 'professional',
    name: 'مهني',
    nameEn: 'Professional',
    icon: '',
    color: 'bg-orange-500',
  },
  {
    id: 'dark',
    name: 'مظلم',
    nameEn: 'Dark / Uncensored',
    icon: '🐍',
    color: 'bg-red-600',
  },
];

// ═══════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════

export function getModelById(id: string): AIModel | undefined {
  return models.find((m) => m.id === id);
}

export function getModelsByCategory(category: ModelCategory): AIModel[] {
  return models.filter((m) => m.category === category);
}

/** Get the real OpenRouter chat model ID for a given frontend model ID */
export function getOpenRouterChatModel(modelId: string): string | undefined {
  const model = getModelById(modelId);
  return model?.openrouterChatModel;
}

/** Get the real Gemini chat model ID for a given frontend model ID */
export function getGeminiChatModel(modelId: string): string | undefined {
  const model = getModelById(modelId);
  return model?.geminiChatModel;
}

/** Check if a model uses OpenRouter as its provider */
export function isOpenRouterModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.provider === 'openrouter';
}

/** Check if a model uses Gemini as its provider */
export function isGeminiModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.provider === 'gemini';
}

/** Check if a model uses ZhipuAI as its provider */
export function isZhipuAIModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.provider === 'zhipuai';
}

/** Check if a model supports vision/image analysis */
export function isVisionModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.capabilities.vision === true;
}

/** Get the provider for a given model ID */
export function getProviderForModel(modelId: string): AIModel['provider'] | undefined {
  const model = getModelById(modelId);
  return model?.provider;
}

/** Language suffixes for system prompts — maps language code to the language name for "أجب {suffix}" */
export const languageSuffixes: Record<string, string> = {
  ar: 'بالعربية',
  en: 'in English',
  fr: 'en français',
  de: 'auf Deutsch',
  es: 'en español',
  tr: 'Türkçe olarak',
  ur: 'اردو میں',
  ms: 'dalam Bahasa Melayu',
  id: 'dalam Bahasa Indonesia',
  zh: '用中文',
  ja: '日本語で',
  ko: '한국어로',
  ru: 'на русском',
  pt: 'em português',
  it: 'in italiano',
  hi: 'हिंदी में',
  bn: 'বাংলায়',
};

/** Map model ID → ZhipuAI GLM model ID */
export const modelToGLM: Record<string, string> = Object.fromEntries(
  models.map((m) => [m.id, m.glmModel])
);
