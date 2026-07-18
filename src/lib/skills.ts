// DeltaAI Platform - AI Skills Configuration
// Defines all available skills and their metadata

export interface Skill {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  category: 'basic' | 'vision-media' | 'advanced' | 'integration';
  sdkMethod?: string; // The z-ai-web-dev-sdk method that powers this skill
  apiRoute?: string;  // The DeltaAI API route for this skill
  isImplemented: boolean; // Whether the skill has a working backend + UI
}

export type SkillCategory = 'basic' | 'vision-media' | 'advanced' | 'integration';

export const SKILL_CATEGORIES: Array<{ id: SkillCategory; name: string; nameEn: string; icon: string; color: string }> = [
  { id: 'basic', name: 'أساسية', nameEn: 'Basic', icon: '📝', color: 'bg-green-500' },
  { id: 'vision-media', name: 'رؤية ووسائط', nameEn: 'Vision & Media', icon: '👁️', color: 'bg-purple-500' },
  { id: 'advanced', name: 'متقدمة', nameEn: 'Advanced', icon: '🚀', color: 'bg-orange-500' },
  { id: 'integration', name: 'تكامل', nameEn: 'Integration', icon: '🔗', color: 'bg-cyan-500' },
];

export const skills: Skill[] = [
  // ═══ Basic Skills ═══
  {
    id: 'text-generation',
    name: 'توليد النصوص',
    nameEn: 'Text Generation',
    icon: '📝',
    description: 'إنشاء نصوص متماسكة في مختلف المجالات — مقالات، قصص، تقارير، مراسلات',
    descriptionEn: 'Create coherent texts in various fields — articles, stories, reports, correspondence',
    category: 'basic',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },
  {
    id: 'code-generation',
    name: 'كتابة الأكواد',
    nameEn: 'Code Generation',
    icon: '💻',
    description: 'إنشاء أكواد برمجية بلغات متعددة، تصحيح الأخطاء، شرح المفاهيم البرمجية',
    descriptionEn: 'Generate code in multiple languages, debug, explain programming concepts',
    category: 'basic',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },
  {
    id: 'summarization',
    name: 'التلخيص',
    nameEn: 'Summarization',
    icon: '📋',
    description: 'تلخيص النصوص الطويلة واستخلاص النقاط الرئيسية بدقة',
    descriptionEn: 'Summarize long texts and extract key points accurately',
    category: 'basic',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },
  {
    id: 'translation',
    name: 'الترجمة',
    nameEn: 'Translation',
    icon: '🌐',
    description: 'الترجمة بين اللغات المختلفة مع مراعاة السياق الثقافي والأسلوب اللغوي',
    descriptionEn: 'Translate between languages considering cultural context and style',
    category: 'basic',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/ai/translate',
    isImplemented: true,
  },
  {
    id: 'reasoning',
    name: 'الاستنتاج المنطقي',
    nameEn: 'Reasoning',
    icon: '🧠',
    description: 'التحليل المنطقي وحل المسائل المعقدة والتفكير النقدي',
    descriptionEn: 'Logical analysis, solving complex problems, and critical thinking',
    category: 'basic',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },

  // ═══ Vision & Media Skills ═══
  {
    id: 'vision',
    name: 'فهم الصور (Vision)',
    nameEn: 'Image Understanding (Vision)',
    icon: '👁️',
    description: 'تحليل الصور ووصف محتواها، التعرف على النصوص داخل الصور (OCR)، الرد على الاستفسارات المرئية',
    descriptionEn: 'Analyze images, OCR, answer visual queries',
    category: 'vision-media',
    sdkMethod: 'chat.completions.createVision',
    apiRoute: '/api/ai/vision',
    isImplemented: true,
  },
  {
    id: 'video-understanding',
    name: 'فهم الفيديو',
    nameEn: 'Video Understanding',
    icon: '🎬',
    description: 'تحليل محتوى الفيديو وفهم التسلسلات الزمنية والأحداث المتتابعة',
    descriptionEn: 'Analyze video content, understand temporal sequences and events',
    category: 'vision-media',
    sdkMethod: 'chat.completions.createVision',
    apiRoute: '/api/ai/vision',
    isImplemented: true,
  },
  {
    id: 'image-generation',
    name: 'توليد الصور',
    nameEn: 'Image Generation',
    icon: '🎨',
    description: 'إنشاء صور من وصف نصي — مدعوم عبر CogViewX',
    descriptionEn: 'Create images from text description — powered by CogViewX',
    category: 'vision-media',
    sdkMethod: 'images.generations.create',
    apiRoute: '/api/ai/image',
    isImplemented: true,
  },
  {
    id: 'image-edit',
    name: 'تعديل الصور',
    nameEn: 'Image Editing',
    icon: '✏️',
    description: 'تعديل صورة موجودة بناءً على تعليمات نصية — إضافة عناصر، تغيير ألوان، إزالة خلفيات',
    descriptionEn: 'Edit existing images based on text instructions — add elements, change colors, remove backgrounds',
    category: 'vision-media',
    sdkMethod: 'images.generations.edit',
    apiRoute: '/api/ai/image/edit',
    isImplemented: true,
  },
  {
    id: 'image-search',
    name: 'البحث عن الصور',
    nameEn: 'Image Search',
    icon: '🔍',
    description: 'البحث عن صور بناءً على وصف نصي أو كلمات مفتاحية',
    descriptionEn: 'Search for images based on text description or keywords',
    category: 'vision-media',
    sdkMethod: 'images.search.create',
    apiRoute: '/api/ai/image/search',
    isImplemented: true,
  },
  {
    id: 'audio-tts',
    name: 'تحويل النص لصوت (TTS)',
    nameEn: 'Text to Speech',
    icon: '🔊',
    description: 'تحويل النص إلى كلام مسموع بأصوات متعددة',
    descriptionEn: 'Convert text to audible speech with multiple voices',
    category: 'vision-media',
    sdkMethod: 'audio.tts.create',
    apiRoute: '/api/tts',
    isImplemented: true,
  },
  {
    id: 'audio-asr',
    name: 'تحويل الصوت لنص (ASR)',
    nameEn: 'Speech to Text',
    icon: '🎙️',
    description: 'تحويل الكلام المسموع إلى نص مكتوب — فهم التعليمات الصوتية',
    descriptionEn: 'Convert speech to text — understand voice instructions',
    category: 'vision-media',
    sdkMethod: 'audio.asr.create',
    apiRoute: '/api/ai/asr',
    isImplemented: true,
  },

  // ═══ Advanced Skills ═══
  {
    id: 'web-search',
    name: 'البحث في الويب',
    nameEn: 'Web Search',
    icon: '🔍',
    description: 'البحث في الإنترنت في الوقت الفعلي لاسترجاع معلومات محدثة',
    descriptionEn: 'Search the internet in real-time for up-to-date information',
    category: 'advanced',
    sdkMethod: 'functions.invoke("web_search")',
    apiRoute: '/api/search',
    isImplemented: true,
  },
  {
    id: 'function-calling',
    name: 'استدعاء الدوال',
    nameEn: 'Function Calling',
    icon: '⚡',
    description: 'استدعاء دوال وأدوات خارجية أثناء المحادثة — حيوي لبناء تطبيقات الوكلاء الأذكياء',
    descriptionEn: 'Call external functions and tools during conversation — vital for AI agents',
    category: 'advanced',
    sdkMethod: 'chat.completions.create (with tools)',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },
  {
    id: 'rag',
    name: 'استرجاع المعلومات (RAG)',
    nameEn: 'Retrieval-Augmented Generation',
    icon: '📚',
    description: 'تعزيز الاستجابات بمعلومات مسترجعة من مصادر خارجية — قواعد بيانات ومستندات',
    descriptionEn: 'Enhance responses with information retrieved from external sources — databases and documents',
    category: 'advanced',
    sdkMethod: 'functions.invoke("page_reader")',
    apiRoute: '/api/ai/page-reader',
    isImplemented: true,
  },
  {
    id: 'large-context',
    name: 'نافذة سياق كبيرة',
    nameEn: 'Large Context Window',
    icon: '📐',
    description: 'القدرة على معالجة نصوص طويلة جدًا في محادثة واحدة (حتى 200K رمز)',
    descriptionEn: 'Process very long texts in a single conversation (up to 200K tokens)',
    category: 'advanced',
    sdkMethod: 'chat.completions.create',
    apiRoute: '/api/chat/stream',
    isImplemented: true,
  },
  {
    id: 'page-reader',
    name: 'قارئ الصفحات',
    nameEn: 'Page Reader',
    icon: '📄',
    description: 'قراءة واستخراج محتوى صفحات الويب والمقالات',
    descriptionEn: 'Read and extract content from web pages and articles',
    category: 'advanced',
    sdkMethod: 'functions.invoke("page_reader")',
    apiRoute: '/api/ai/page-reader',
    isImplemented: true,
  },
  {
    id: 'open-source',
    name: 'مفتوح المصدر',
    nameEn: 'Open Source',
    icon: '🔓',
    description: 'الكود المصدري متاح للعموم — قابل للتخصيص والتعديل والتشغيل محلياً',
    descriptionEn: 'Source code available publicly — customizable, modifiable, can run locally',
    category: 'advanced',
    isImplemented: false,
  },

  // ═══ Integration Skills ═══
  {
    id: 'video-generation',
    name: 'توليد الفيديو',
    nameEn: 'Video Generation',
    icon: '🎥',
    description: 'إنشاء فيديو من وصف نصي — مدعوم عبر CogVideoX',
    descriptionEn: 'Generate video from text description — powered by CogVideoX',
    category: 'integration',
    sdkMethod: 'video.generations.create',
    apiRoute: '/api/ai/video',
    isImplemented: true,
  },
  {
    id: 'pdf-generation',
    name: 'توليد PDF',
    nameEn: 'PDF Generation',
    icon: '📑',
    description: 'إنشاء ملفات PDF احترافية من المحتوى النصي مع دعم RTL/عربي',
    descriptionEn: 'Generate professional PDF files from text content with RTL/Arabic support',
    category: 'integration',
    apiRoute: '/api/ai/hf/document',
    isImplemented: true,
  },
  {
    id: 'batch-processing',
    name: 'المعالجة المجمعة',
    nameEn: 'Batch Processing',
    icon: '📦',
    description: 'معالجة حتى 12 ملف في وقت واحد مع تحليل شامل ومتقاطع',
    descriptionEn: 'Process up to 12 files simultaneously with comprehensive cross-analysis',
    category: 'integration',
    apiRoute: '/api/chat/batch',
    isImplemented: true,
  },
];

export function getSkillById(id: string): Skill | undefined {
  return skills.find((s) => s.id === id);
}

export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return skills.filter((s) => s.category === category);
}

export function getModelSkills(modelId: string, models: Array<{ id: string; skills: string[] }>): Skill[] {
  const model = models.find((m) => m.id === modelId);
  if (!model) return [];
  return skills.filter((s) => model.skills.includes(s.id));
}
