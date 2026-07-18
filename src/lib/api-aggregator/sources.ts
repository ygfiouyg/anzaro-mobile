// ═══════════════════════════════════════════════════════════
// مصادر المُجمّع (Aggregator Sources) — نقاط النهاية المعروفة والاستخراج من GitHub و HuggingFace
// ═══════════════════════════════════════════════════════════

import type { DiscoveredEndpoint, ScrapedSource, ApiCategory } from './types';

/**
 * إرجاع قائمة نقاط النهاية المعروفة والمُهيأة مسبقًا
 * تشمل مزوّدين مجانيين ومزوّدين بمفاتيح API
 */
export function getKnownEndpoints(): DiscoveredEndpoint[] {
  return [
    // ─── Pollinations — مجاني بالكامل ───
    {
      name: 'Pollinations Chat',
      provider: 'pollinations',
      category: 'chat',
      baseUrl: 'https://gen.pollinations.ai/v1',
      authType: 'none',
      apiFormat: 'openai',
      isFree: true,
      priority: 80,
      capabilities: { streaming: true, models: ['openai', 'mistral', 'llama'] },
    },
    {
      name: 'Pollinations Image',
      provider: 'pollinations',
      category: 'image',
      baseUrl: 'https://image.pollinations.ai/prompt/',
      authType: 'none',
      apiFormat: 'pollinations',
      isFree: true,
      priority: 85,
      capabilities: { formats: ['png', 'jpg', 'webp'], sizes: ['256', '512', '1024', '1792'] },
    },
    {
      name: 'Pollinations Video',
      provider: 'pollinations',
      category: 'video',
      baseUrl: 'https://video.pollinations.ai/',
      authType: 'none',
      apiFormat: 'pollinations',
      isFree: true,
      priority: 70,
      capabilities: { models: ['veo', 'wan', 'wan-fast', 'wan-image'] },
    },

    // ─── Groq — يتطلب مفتاح API ───
    {
      name: 'Groq Chat',
      provider: 'groq',
      category: 'chat',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 90,
      capabilities: { streaming: true, models: ['llama-3.3-70b', 'mixtral-8x7b', 'gemma2-9b'] },
    },

    // ─── GitHub Models — يتطلب رمز وصول شخصي ───
    {
      name: 'GitHub Models Chat',
      provider: 'github',
      category: 'chat',
      baseUrl: 'https://models.inference.ai.azure.com',
      apiKey: process.env.GITHUB_PAT,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 75,
      capabilities: { streaming: true, models: ['gpt-4o', 'gpt-4o-mini', 'phi-4', 'mistral-large'] },
    },

    // ─── HuggingFace — يتطلب رمز وصول ───
    {
      name: 'HuggingFace Inference Chat',
      provider: 'huggingface',
      category: 'chat',
      baseUrl: 'https://router.huggingface.co/v1',
      apiKey: process.env.HF_TOKEN,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 60,
      capabilities: { streaming: true, models: ['mistralai/Mistral-7B-Instruct-v0.3', 'meta-llama/Llama-3.1-8B-Instruct'] },
    },
    {
      name: 'HuggingFace Inference Image',
      provider: 'huggingface',
      category: 'image',
      baseUrl: 'https://router.huggingface.co/v1',
      apiKey: process.env.HF_TOKEN,
      authType: 'bearer',
      apiFormat: 'hf-inference',
      isFree: false,
      priority: 55,
      modelId: 'stabilityai/stable-diffusion-xl-base-1.0',
      capabilities: { models: ['stabilityai/stable-diffusion-xl-base-1.0', 'black-forest-labs/FLUX.1-dev'] },
    },

    // ─── ZhipuAI — يتطلب مفتاح API ───
    {
      name: 'ZhipuAI Chat',
      provider: 'zhipuai',
      category: 'chat',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.ZHIPUAI_API_KEY,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 50,
      capabilities: { streaming: true, models: ['glm-4-plus', 'glm-4-flash'] },
    },
    {
      name: 'ZhipuAI Image',
      provider: 'zhipuai',
      category: 'image',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.ZHIPUAI_API_KEY,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 45,
      modelId: 'cogview-3-plus',
      capabilities: { models: ['cogview-3-plus'] },
    },
    {
      name: 'ZhipuAI Video',
      provider: 'zhipuai',
      category: 'video',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.ZHIPUAI_API_KEY,
      authType: 'bearer',
      apiFormat: 'openai',
      isFree: false,
      priority: 40,
      modelId: 'cogvideox-2',
      capabilities: { models: ['cogvideox-2'] },
    },

    // ─── Google Gemini — يتطلب مفتاح API ───
    {
      name: 'Google Gemini Chat',
      provider: 'google',
      category: 'chat',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: process.env.GOOGLE_AI_KEY,
      authType: 'x-api-key',
      apiFormat: 'gemini',
      isFree: false,
      priority: 70,
      modelId: 'gemini-2.0-flash',
      capabilities: { streaming: true, models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
    },
  ];
}

/**
 * إرجاع قائمة مستودعات GitHub المراد استخراج نقاط النهاية منها
 */
export function getGitHubSources(): { repo: string; url: string }[] {
  return [
    { repo: 'pollinations/pollinations', url: 'https://github.com/pollinations/pollinations' },
    { repo: 'aurora-develop/aurora', url: 'https://github.com/aurora-develop/aurora' },
    { repo: 'cheahjs/free-llm-api-resources', url: 'https://github.com/cheahjs/free-llm-api-resources' },
    { repo: 'zhu327/gemini-openai-proxy', url: 'https://github.com/zhu327/gemini-openai-proxy' },
    { repo: 'PublicAffairs/openai-gemini', url: 'https://github.com/PublicAffairs/openai-gemini' },
  ];
}

/**
 * استخراج نقاط نهاية API من مستودع GitHub
 * يقرأ ملفات README و Markdown للعثور على روابط API
 * @param repo - اسم المستودع بصيغة owner/repo
 * @returns معلومات المصدر المستخرج
 */
export async function scrapeGitHubRepo(repo: string): Promise<ScrapedSource> {
  const result: ScrapedSource = {
    repo,
    url: `https://github.com/${repo}`,
    endpointsFound: 0,
    errors: [],
    discoveredEndpoints: [],
  };

  try {
    // جلب محتوى ملف README من واجهة GitHub API
    const readmeUrl = `https://api.github.com/repos/${repo}/readme`;
    const response = await fetch(readmeUrl, {
      headers: {
        Accept: 'application/vnd.github.v3.raw',
        'User-Agent': 'DeltaAI-Aggregator/1.0',
      },
      signal: AbortSignal.timeout(15_000), // مهلة 15 ثانية
    });

    if (!response.ok) {
      result.errors.push(`فشل جلب README: HTTP ${response.status}`);
      return result;
    }

    const readmeContent = await response.text();

    // البحث عن روابط API في المحتوى وتحويلها لنقاط نهاية
    const endpoints = extractAndClassifyEndpoints(readmeContent, repo);
    result.discoveredEndpoints.push(...endpoints);
    result.endpointsFound = endpoints.length;

    // محاولة جلب ملفات إضافية إذا كانت متاحة (مثل docs/ أو API.md)
    const additionalFiles = ['API.md', 'docs/API.md', 'ENDPOINTS.md'];
    for (const file of additionalFiles) {
      try {
        const fileUrl = `https://api.github.com/repos/${repo}/contents/${file}`;
        const fileResponse = await fetch(fileUrl, {
          headers: {
            Accept: 'application/vnd.github.v3.raw',
            'User-Agent': 'DeltaAI-Aggregator/1.0',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (fileResponse.ok) {
          const fileContent = await fileResponse.text();
          const extraEndpoints = extractAndClassifyEndpoints(fileContent, repo);
          result.discoveredEndpoints.push(...extraEndpoints);
          result.endpointsFound += extraEndpoints.length;
        }
      } catch {
        // تجاهل أخطاء الملفات الإضافية — ليست ضرورية
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير معروف';
    result.errors.push(`خطأ في الاستخراج: ${message}`);
  }

  return result;
}

/**
 * تصنيف URL إلى نقطة نهاية مهيكلة بناءً على أنماط معروفة
 * @param url - رابط URL للتصنيف
 * @param sourceRepo - مستودع المصدر
 * @returns نقطة نهاية مُكتشفة أو null
 */
function classifyUrl(url: string, sourceRepo: string): DiscoveredEndpoint | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;

    // ─── Pollinations ───
    if (host.includes('pollinations.ai')) {
      if (path.includes('/v1') || path.includes('chat')) {
        return {
          name: `Pollinations (من ${sourceRepo})`,
          provider: 'pollinations',
          category: 'chat',
          baseUrl: 'https://gen.pollinations.ai/v1',
          authType: 'none',
          apiFormat: 'openai',
          isFree: true,
          priority: 60,
          sourceRepo,
          sourceUrl: url,
          capabilities: { streaming: true },
        };
      }
      if (path.includes('image') || path.includes('prompt')) {
        return {
          name: `Pollinations Image (من ${sourceRepo})`,
          provider: 'pollinations',
          category: 'image',
          baseUrl: 'https://image.pollinations.ai/prompt/',
          authType: 'none',
          apiFormat: 'pollinations',
          isFree: true,
          priority: 60,
          sourceRepo,
          sourceUrl: url,
        };
      }
    }

    // ─── Groq ───
    if (host.includes('groq.com')) {
      return {
        name: `Groq Chat (من ${sourceRepo})`,
        provider: 'groq',
        category: 'chat',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        authType: 'bearer',
        apiFormat: 'openai',
        isFree: false,
        priority: 60,
        sourceRepo,
        sourceUrl: url,
      };
    }

    // ─── HuggingFace ───
    if (host.includes('huggingface.co') || host.includes('hf.co')) {
      if (path.includes('/v1/chat') || path.includes('/v1/models')) {
        return {
          name: `HuggingFace Chat (من ${sourceRepo})`,
          provider: 'huggingface',
          category: 'chat',
          baseUrl: 'https://router.huggingface.co/v1',
          apiKey: process.env.HF_TOKEN,
          authType: 'bearer',
          apiFormat: 'openai',
          isFree: false,
          priority: 50,
          sourceRepo,
          sourceUrl: url,
        };
      }
      if (path.includes('inference')) {
        return {
          name: `HuggingFace Inference (من ${sourceRepo})`,
          provider: 'huggingface',
          category: 'image',
          baseUrl: 'https://router.huggingface.co/v1',
          apiKey: process.env.HF_TOKEN,
          authType: 'bearer',
          apiFormat: 'hf-inference',
          isFree: false,
          priority: 45,
          sourceRepo,
          sourceUrl: url,
        };
      }
    }

    // ─── Google Gemini ───
    if (host.includes('generativelanguage.googleapis.com') || host.includes('aiplatform.googleapis.com')) {
      return {
        name: `Google Gemini (من ${sourceRepo})`,
        provider: 'google',
        category: 'chat',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: process.env.GOOGLE_AI_KEY,
        authType: 'x-api-key',
        apiFormat: 'gemini',
        isFree: false,
        priority: 55,
        modelId: 'gemini-2.0-flash',
        sourceRepo,
        sourceUrl: url,
      };
    }

    // ─── OpenAI-compatible endpoints ───
    if (path.includes('/v1/chat/completions') || path.includes('/v1/models')) {
      const baseUrl = `${parsed.protocol}//${parsed.host}/v1`;
      return {
        name: `OpenAI-compatible (${host}) (من ${sourceRepo})`,
        provider: host.split('.')[0],
        category: 'chat',
        baseUrl,
        authType: 'none', // سنحاول بدون مصادقة أولاً
        apiFormat: 'openai',
        isFree: true, // نفترض مجاني — التحقق سيؤكد
        priority: 30,
        sourceRepo,
        sourceUrl: url,
      };
    }

    // ─── DeepInfra ───
    if (host.includes('deepinfra.com')) {
      return {
        name: `DeepInfra (من ${sourceRepo})`,
        provider: 'deepinfra',
        category: 'chat',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        apiKey: process.env.DEEPINFRA_API_KEY,
        authType: 'bearer',
        apiFormat: 'openai',
        isFree: false,
        priority: 40,
        sourceRepo,
        sourceUrl: url,
      };
    }

    // ─── Together AI ───
    if (host.includes('together.ai')) {
      return {
        name: `Together AI (من ${sourceRepo})`,
        provider: 'together',
        category: 'chat',
        baseUrl: 'https://api.together.xyz/v1',
        apiKey: process.env.TOGETHER_API_KEY,
        authType: 'bearer',
        apiFormat: 'openai',
        isFree: false,
        priority: 40,
        sourceRepo,
        sourceUrl: url,
      };
    }

    // لا يمكن تصنيف URL تلقائياً — نتخطاه
    return null;
  } catch {
    return null;
  }
}

/**
 * استخراج وتصنيف نقاط النهاية من محتوى نصي
 * يبحث عن أنماط شائعة لروابط API ويحولها لنقاط نهاية مهيكلة
 * @param content - المحتوى النصي للبحث فيه
 * @param sourceRepo - مستودع المصدر
 * @returns قائمة نقاط النهاية المُكتشفة
 */
function extractAndClassifyEndpoints(content: string, sourceRepo: string): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  const seen = new Set<string>();

  // أنماط البحث عن روابط API
  const patterns = [
    // روابط HTTPS عامة تتضمن api أو inference أو v1
    /https:\/\/[^\s\)`\]]+(?:api|inference|v1|openai|chat|completions|generate)[^\s\)`\]]*/gi,
    // روابط نطاقات محددة معروفة
    /https:\/\/(?:api\.)?(?:groq|huggingface|openai|anthropic|google|together|fireworks|deepinfra|novita|replicate|pollinations)[^\s\)`\]]*/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const url = match[0].replace(/[.,;:!?\]})>]+$/, ''); // إزالة علامات الترقيم النهائية
      if (!seen.has(url)) {
        seen.add(url);
        const endpoint = classifyUrl(url, sourceRepo);
        if (endpoint) {
          // تحقق من عدم وجود نقطة مماثلة بالفعل
          const dedupeKey = `${endpoint.provider}::${endpoint.category}::${endpoint.baseUrl}`;
          if (!endpoints.some((e) => `${e.provider}::${e.category}::${e.baseUrl}` === dedupeKey)) {
            endpoints.push(endpoint);
          }
        }
      }
    }
  }

  return endpoints;
}

// ═══════════════════════════════════════════════════════════
// استخراج نماذج HuggingFace — سحب النماذج المتاحة من واجهة HF
// ═══════════════════════════════════════════════════════════

/** خريطة تصنيف مهام HF إلى فئات المنصة */
const _HF_PIPELINE_TO_CATEGORY: Record<string, ApiCategory> = {
  'text-generation': 'chat',
  'text2text-generation': 'chat',
  'summarization': 'chat',
  'translation': 'translation',
  'automatic-speech-recognition': 'asr',
  'image-generation': 'image',
  'text-to-image': 'image',
  'image-to-image': 'image',
  'text-to-video': 'video',
  'image-to-video': 'video',
};

/** نماذج شات معروفة بجودة عالية (لضمان إضافتها) */
const PREFERRED_CHAT_MODELS = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'meta-llama/Llama-3.2-3B-Instruct',
  'meta-llama/Llama-3.2-1B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'microsoft/Phi-3-mini-4k-instruct',
  'microsoft/Phi-3.5-mini-instruct',
  'HuggingFaceH4/zephyr-7b-beta',
  'teknium/OpenHermes-2.5-Mistral-7B',
  'google/gemma-2-2b-it',
  'google/gemma-2-9b-it',
];

/** نماذج صور معروفة بجودة عالية */
const PREFERRED_IMAGE_MODELS = [
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-xl-base-1.0',
  // ❌ stabilityai/stable-diffusion-3-medium → removed: returns 400/404 on HF Inference
  // ❌ playgroundai/playground-v2.5-1024px-aesthetic → removed: often unavailable
];

/** نماذج فيديو معروفة */
const PREFERRED_VIDEO_MODELS = [
  'tencent/HunyuanVideo',
  'ByteDance/AnimateDiff-Lightning',
];

/**
 * استخراج نماذج HuggingFace المتاحة من واجهة برمجة التطبيقات
 * يسحب قوائم النماذج المجانية والمتاحة للتنفيذ المباشر
 * @returns قائمة نقاط النهاية المُكتشفة من HuggingFace
 */
export async function scrapeHuggingFaceModels(): Promise<{
  endpointsFound: number;
  errors: string[];
  discoveredEndpoints: DiscoveredEndpoint[];
}> {
  const result = {
    endpointsFound: 0,
    errors: [] as string[],
    discoveredEndpoints: [] as DiscoveredEndpoint[],
  };

  const hfToken = process.env.HF_TOKEN;
  const seen = new Set<string>();

  const addHFEndpoint = (ep: DiscoveredEndpoint) => {
    const dedupeKey = `${ep.provider}::${ep.category}::${ep.modelId || ep.baseUrl}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      result.discoveredEndpoints.push(ep);
      result.endpointsFound++;
    }
  };

  // ─── الخطوة 1: إضافة النماذج المفضلة يدوياً (لضمان توفرها) ───
  for (const modelId of PREFERRED_CHAT_MODELS) {
    addHFEndpoint({
      name: `HF Chat: ${modelId.split('/').pop()}`,
      provider: 'huggingface',
      category: 'chat',
      baseUrl: 'https://router.huggingface.co/v1',
      modelId,
      apiKey: hfToken,
      authType: hfToken ? 'bearer' : 'none',
      apiFormat: 'openai',
      isFree: true,
      priority: 50,
      sourceUrl: `https://huggingface.co/${modelId}`,
      capabilities: { streaming: true, hfModel: modelId },
    });
  }

  for (const modelId of PREFERRED_IMAGE_MODELS) {
    addHFEndpoint({
      name: `HF Image: ${modelId.split('/').pop()}`,
      provider: 'huggingface',
      category: 'image',
      baseUrl: `https://api-inference.huggingface.co/models/${modelId}`,
      modelId,
      apiKey: hfToken,
      authType: hfToken ? 'bearer' : 'none',
      apiFormat: 'hf-inference',
      isFree: true,
      priority: 50,
      sourceUrl: `https://huggingface.co/${modelId}`,
      capabilities: { hfModel: modelId },
    });
  }

  for (const modelId of PREFERRED_VIDEO_MODELS) {
    addHFEndpoint({
      name: `HF Video: ${modelId.split('/').pop()}`,
      provider: 'huggingface',
      category: 'video',
      baseUrl: `https://api-inference.huggingface.co/models/${modelId}`,
      modelId,
      apiKey: hfToken,
      authType: hfToken ? 'bearer' : 'none',
      apiFormat: 'hf-inference',
      isFree: true,
      priority: 40,
      sourceUrl: `https://huggingface.co/${modelId}`,
      capabilities: { hfModel: modelId },
    });
  }

  // ─── الخطوة 2: جلب نماذج شات من واجهة HF API ───
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'DeltaAI-Aggregator/1.0',
    };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    // جلب نماذج text-generation الأكثر تحميلاً
    const chatRes = await fetch(
      'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=30&filter=inference-api',
      { headers, signal: AbortSignal.timeout(20_000) }
    );

    if (chatRes.ok) {
      const chatModels = await chatRes.json() as Array<{
        id: string;
        modelId?: string;
        pipeline_tag?: string;
        downloads?: number;
        inference?: string;
        tags?: string[];
      }>;

      for (const model of chatModels) {
        const modelId = model.id || model.modelId;
        if (!modelId) continue;
        // تخطي النماذج التي لا تدعم Inference API
        if (model.inference === 'cold' || model.inference === 'none') continue;

        addHFEndpoint({
          name: `HF Chat: ${modelId.split('/').pop()}`,
          provider: 'huggingface',
          category: 'chat',
          baseUrl: 'https://router.huggingface.co/v1',
          modelId,
          apiKey: hfToken,
          authType: hfToken ? 'bearer' : 'none',
          apiFormat: 'openai',
          isFree: true,
          priority: 45,
          sourceUrl: `https://huggingface.co/${modelId}`,
          capabilities: { streaming: true, hfModel: modelId, downloads: model.downloads },
        });
      }
    } else {
      result.errors.push(`فشل جلب نماذج الشات من HF: HTTP ${chatRes.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير معروف';
    result.errors.push(`خطأ في جلب نماذج الشات من HF: ${message}`);
  }

  // ─── الخطوة 3: جلب نماذج الصور من واجهة HF API ───
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'DeltaAI-Aggregator/1.0',
    };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const imageRes = await fetch(
      'https://huggingface.co/api/models?pipeline_tag=text-to-image&sort=downloads&direction=-1&limit=15&filter=inference-api',
      { headers, signal: AbortSignal.timeout(20_000) }
    );

    if (imageRes.ok) {
      const imageModels = await imageRes.json() as Array<{
        id: string;
        modelId?: string;
        pipeline_tag?: string;
        downloads?: number;
        inference?: string;
      }>;

      for (const model of imageModels) {
        const modelId = model.id || model.modelId;
        if (!modelId) continue;
        if (model.inference === 'cold' || model.inference === 'none') continue;

        addHFEndpoint({
          name: `HF Image: ${modelId.split('/').pop()}`,
          provider: 'huggingface',
          category: 'image',
          baseUrl: `https://api-inference.huggingface.co/models/${modelId}`,
          modelId,
          apiKey: hfToken,
          authType: hfToken ? 'bearer' : 'none',
          apiFormat: 'hf-inference',
          isFree: true,
          priority: 45,
          sourceUrl: `https://huggingface.co/${modelId}`,
          capabilities: { hfModel: modelId, downloads: model.downloads },
        });
      }
    } else {
      result.errors.push(`فشل جلب نماذج الصور من HF: HTTP ${imageRes.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير معروف';
    result.errors.push(`خطأ في جلب نماذج الصور من HF: ${message}`);
  }

  // ─── الخطوة 4: جلب نماذج الفيديو من واجهة HF API ───
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'DeltaAI-Aggregator/1.0',
    };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const videoRes = await fetch(
      'https://huggingface.co/api/models?pipeline_tag=text-to-video&sort=downloads&direction=-1&limit=10&filter=inference-api',
      { headers, signal: AbortSignal.timeout(20_000) }
    );

    if (videoRes.ok) {
      const videoModels = await videoRes.json() as Array<{
        id: string;
        modelId?: string;
        pipeline_tag?: string;
        downloads?: number;
        inference?: string;
      }>;

      for (const model of videoModels) {
        const modelId = model.id || model.modelId;
        if (!modelId) continue;
        if (model.inference === 'cold' || model.inference === 'none') continue;

        addHFEndpoint({
          name: `HF Video: ${modelId.split('/').pop()}`,
          provider: 'huggingface',
          category: 'video',
          baseUrl: `https://api-inference.huggingface.co/models/${modelId}`,
          modelId,
          apiKey: hfToken,
          authType: hfToken ? 'bearer' : 'none',
          apiFormat: 'hf-inference',
          isFree: true,
          priority: 40,
          sourceUrl: `https://huggingface.co/${modelId}`,
          capabilities: { hfModel: modelId, downloads: model.downloads },
        });
      }
    } else {
      result.errors.push(`فشل جلب نماذج الفيديو من HF: HTTP ${videoRes.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير معروف';
    result.errors.push(`خطأ في جلب نماذج الفيديو من HF: ${message}`);
  }

  // ─── الخطوة 5: جلب نماذج ASR من واجهة HF API ───
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'DeltaAI-Aggregator/1.0',
    };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const asrRes = await fetch(
      'https://huggingface.co/api/models?pipeline_tag=automatic-speech-recognition&sort=downloads&direction=-1&limit=5&filter=inference-api',
      { headers, signal: AbortSignal.timeout(15_000) }
    );

    if (asrRes.ok) {
      const asrModels = await asrRes.json() as Array<{
        id: string;
        modelId?: string;
        pipeline_tag?: string;
        downloads?: number;
        inference?: string;
      }>;

      for (const model of asrModels) {
        const modelId = model.id || model.modelId;
        if (!modelId) continue;
        if (model.inference === 'cold' || model.inference === 'none') continue;

        addHFEndpoint({
          name: `HF ASR: ${modelId.split('/').pop()}`,
          provider: 'huggingface',
          category: 'asr',
          baseUrl: 'https://router.huggingface.co/v1',
          modelId,
          apiKey: hfToken,
          authType: hfToken ? 'bearer' : 'none',
          apiFormat: 'hf-inference',
          isFree: true,
          priority: 40,
          sourceUrl: `https://huggingface.co/${modelId}`,
          capabilities: { hfModel: modelId },
        });
      }
    }
  } catch {
    // أخطاء ASR ليست حرجة
  }

  console.log(`[HF Scraper] تم استخراج ${result.endpointsFound} نموذج من HuggingFace (${result.errors.length} أخطاء)`);
  return result;
}
