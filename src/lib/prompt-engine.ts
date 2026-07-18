/**
 * Prompt Engineering Engine — DeltaAI Platform
 *
 * Rewrites raw user inputs into hyper-detailed, high-fidelity prompts
 * optimized for all major Image and Video generation models.
 *
 * Model categories:
 * - FLUX.1 (Schnell/Dev/Pro): Direct natural language, skin textures, typography
 * - SDXL / Pony: Descriptive prompt-weighting, lighting, camera gear
 * - Hunyuan-DiT / PixArt: Subject-background, geometric/textural details
 * - CogVideoX / Wan2.1: Rich physical interactions, kinetic motion
 * - LTX-Video / Mochi: Extreme camera control, spatial consistency
 * - Open-Sora / HunyuanVideo: Grand cinematic narrative, realistic physics
 *
 * Universal rules:
 * - BAN generic: "photorealistic", "hyperrealistic", "4K", "8K"
 * - TRANSLATE to technical cues: "captured on ARRI Alexa, 85mm lens..."
 * - Maintain user's core intent, scale atmosphere/lighting/camera
 */

// ─── Types ────────────────────────────────────────────────────────────

export type MediaCategory = 'image' | 'video';

export type ImageModelFamily =
  | 'flux'
  | 'sdxl'
  | 'pony'
  | 'hunyuan'
  | 'pixart'
  | 'sd3'
  | 'generic-image';

export type VideoModelFamily =
  | 'cogvideox'
  | 'wan'
  | 'ltx'
  | 'mochi'
  | 'open-sora'
  | 'hunyuan-video'
  | 'generic-video';

export interface PromptEngineOptions {
  category: MediaCategory;
  /** The specific model family for targeted optimization */
  modelFamily?: ImageModelFamily | VideoModelFamily;
  /** If true, the user's prompt is in Arabic — translate to English first */
  isArabic?: boolean;
  /** Additional style hints from the model config */
  stylePrefix?: string;
}

// ─── Banned Words → Technical Replacements ────────────────────────────

const BANNED_REPLACEMENTS: Record<string, string> = {
  'photorealistic': 'captured on ARRI Alexa, natural subsurface scattering, fine grain texture, detailed pores',
  'hyperrealistic': 'captured on Phase One IQ4 150MP, 85mm f/1.4 lens, realistic fabric weave, micro-detail',
  '4k': 'resolved at 4096×2160, anamorphic grain structure, color-graded print master',
  '8k': 'captured on RED V-Raptor 8K VV, 50mm f/1.3 lens, sensor-level detail retention',
  'ultra hd': 'ARRI Alexa 65 large-format sensor, 6.5K oversampled, pristine highlight roll-off',
  'high quality': 'professional studio capture, precise color science, clean signal-to-noise ratio',
  'best quality': 'master-grade capture, calibrated display pipeline, reference monitor approved',
  'masterpiece': 'gallery-exhibition print, archival pigment on cotton rag, conservation-grade framing',
  'detailed': 'micro-contrast sharpening, resolve individual fabric threads and skin pores',
  'realistic': 'physically-based rendering with natural subsurface scattering and accurate light falloff',
};

// ─── Arabic → English Translation Map (Common Phrases) ────────────────

const ARABIC_IMAGE_PHRASES: [RegExp, string][] = [
  [/\bصور[ةه]?\b/gi, 'image of'],
  [/\bكلب\b/gi, 'dog'],
  [/\bقطة\b/gi, 'cat'],
  [/\bبيضحك\b/gi, 'laughing'],
  [/\bبيلعبو?\b/gi, 'playing'],
  [/\bعلي البحر\b/gi, 'on the beach at the seaside'],
  [/\bغروب\b/gi, 'sunset'],
  [/\bشروق\b/gi, 'sunrise'],
  [/\bمدينة\b/gi, 'city'],
  [/\bطبيعة\b/gi, 'nature'],
  [/\bجبل\b/gi, 'mountain'],
  [/\bسماء\b/gi, 'sky'],
  [/\bبحر\b/gi, 'sea'],
  [/\bصحراء\b/gi, 'desert'],
  [/\bغابة\b/gi, 'forest'],
  [/\bورد\b/gi, 'rose'],
  [/\bطفل[ةه]?\b/gi, 'child'],
  [/\bست\b/gi, 'woman'],
  [/\bراجل\b/gi, 'man'],
  [/\bبنت\b/gi, 'girl'],
  [/\bولد\b/gi, 'boy'],
  [/\bبيت\b/gi, 'house'],
  [/\bعربية\b/gi, 'car'],
  [/\bطيارة\b/gi, 'airplane'],
  [/\bقمر\b/gi, 'moon'],
  [/\bشمس\b/gi, 'sun'],
  [/\bنجوم\b/gi, 'stars'],
  [/\bمطر\b/gi, 'rain'],
  [/\bتلج\b/gi, 'snow'],
  [/\bنار\b/gi, 'fire'],
  [/\bماية?\b/gi, 'water'],
  [/\bشجر[ةه]?\b/gi, 'tree'],
  [/\bزهر[ةه]?\b/gi, 'flower'],
  [/\bطائر\b/gi, 'bird'],
  [/\bأسد\b/gi, 'lion'],
  [/\bحصان\b/gi, 'horse'],
  [/\bفيل\b/gi, 'elephant'],
  [/\bفراش[ةه]?\b/gi, 'butterfly'],
  [/\bسفين[ةه]?\b/gi, 'ship'],
  [/\bجزير[ةه]?\b/gi, 'island'],
  [/\bناطحة سحاب\b/gi, 'skyscraper'],
  [/\bحديق[ةه]?\b/gi, 'garden'],
  [/\bكوبري\b/gi, 'bridge'],
  [/\bقلع[ةه]?\b/gi, 'castle'],
  [/\bمسجد\b/gi, 'mosque'],
  [/\bكنيس[ةه]?\b/gi, 'church'],
  [/\bمدرس[ةه]?\b/gi, 'school'],
  [/\bمستشفى\b/gi, 'hospital'],
  [/\bمطعم\b/gi, 'restaurant'],
  [/\bسوق\b/gi, 'market'],
  [/\bحاج[ةه]?\b/gi, 'thing'],
  [/\bجميل[ةه]?\b/gi, 'beautiful'],
  [/\bكبير[ةه]?\b/gi, 'large'],
  [/\bصغير[ةه]?\b/gi, 'small'],
  [/\bقديم[ةه]?\b/gi, 'ancient'],
  [/\bجديد[ةه]?\b/gi, 'new'],
  [/\bحلو[ةه]?\b/gi, 'sweet'],
  [/\bمرعب[ةه]?\b/gi, 'terrifying'],
  [/\bساحر[ةه]?\b/gi, 'magical'],
  [/\bغامض[ةه]?\b/gi, 'mysterious'],
  [/(?<=^|\s)عن(?=\s|$)/gi, 'of'],
  [/(?<=^|\s)في(?=\s|$)/gi, 'in'],
  [/(?<=^|\s)على(?=\s|$)/gi, 'on'],
  [/(?<=^|\s)مع(?=\s|$)/gi, 'with'],
  [/(?<=^|\s)من(?=\s|$)/gi, 'from'],
  [/\bلازم\b/gi, 'must'],
];

// ─── Image Prompt Builders ────────────────────────────────────────────

function buildFluxPrompt(rawPrompt: string): string {
  return rawPrompt;
}

function buildSdxlPrompt(rawPrompt: string): string {
  const additions = [
    'volumetric rim lighting, moody atmospheric tones',
    'captured on 35mm lens, anamorphic optical characteristics, shallow depth of field',
    'rich color palette with deep shadows and luminous highlights',
  ];
  return `${rawPrompt}, ${additions.join(', ')}`;
}

function buildHunyuanPixArtPrompt(rawPrompt: string): string {
  return `${rawPrompt}, intricate geometric patterns woven into the composition, rich textural surfaces with visible material grain, clear subject-background separation with atmospheric depth`;
}

function buildSd3Prompt(rawPrompt: string): string {
  return `${rawPrompt}, precise lighting with controlled falloff, clean composition with intentional negative space, refined color harmony`;
}

function buildGenericImagePrompt(rawPrompt: string): string {
  return `${rawPrompt}, captured on ARRI Alexa Mini LF, 85mm f/1.4 prime lens, natural subsurface scattering on skin, fine fabric weave detail, realistic material properties, controlled studio-grade lighting`;
}

// ─── Video Prompt Builders ────────────────────────────────────────────

function buildCogVideoxPrompt(rawPrompt: string): string {
  return `${rawPrompt}, fluid kinetic motion with realistic human anatomy, natural weight distribution in movement, subtle muscle contractions under skin, wind rustling through clothes and hair, grounded physics with proper momentum transfer`;
}

function buildWanPrompt(rawPrompt: string): string {
  return `${rawPrompt}, slow-motion fluid dynamics with suspended particles, natural hair and cloth simulation driven by wind forces, realistic muscle tension and relaxation cycles, ambient environmental interaction with atmospheric haze`;
}

function buildLtxPrompt(rawPrompt: string): string {
  return `${rawPrompt}, dynamic tracking shot with cinematic crane pan, subtle vertigo effect on vertical lines, spatial consistency across depth planes, controlled rack focus between foreground and background, smooth Steadicam glide`;
}

function buildMochiPrompt(rawPrompt: string): string {
  return `${rawPrompt}, extreme camera control with precise dolly movement, spatial consistency maintaining object permanence, controlled parallax across depth layers, smooth gimbal-stabilized rotation`;
}

function buildOpenSoraPrompt(rawPrompt: string): string {
  return `${rawPrompt}, grand cinematic narrative scene, 24fps cinematic motion blur, consistent atmospheric lighting transformation over time, realistic physics simulation with proper gravity and collision, sweeping orchestral composition with dramatic pacing, strict adherence to natural light propagation`;
}

function buildHunyuanVideoPrompt(rawPrompt: string): string {
  return `${rawPrompt}, atmospheric cinematic composition, physically accurate lightning transformations, temporal consistency in lighting and shadow, realistic ambient occlusion, proper light bounce and caustic reflections evolving over time`;
}

function buildGenericVideoPrompt(rawPrompt: string): string {
  return `${rawPrompt}, cinematic camera work with fluid tracking motion, captured on ARRI Alexa Mini, 24fps motion blur with natural temporal anti-aliasing, realistic physics with proper weight and momentum, atmospheric lighting with volumetric haze, natural human motion with anatomically correct movement`;
}

// ─── Sanitize Prompt ──────────────────────────────────────────────────

function sanitizeBannedWords(prompt: string): string {
  let result = prompt;
  for (const [banned, replacement] of Object.entries(BANNED_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${banned}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }
  return result;
}

// ─── Simple Arabic-to-English Translation ─────────────────────────────

function translateArabicToEnglish(prompt: string): string {
  let result = prompt;
  for (const [pattern, english] of ARABIC_IMAGE_PHRASES) {
    result = result.replace(pattern, english);
  }
  // Clean up double spaces
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}

// ─── Detect if prompt is primarily Arabic ─────────────────────────────

function isArabicPrompt(prompt: string): boolean {
  const arabicChars = prompt.match(/[\u0600-\u06FF]/g);
  const latinChars = prompt.match(/[a-zA-Z]/g);
  if (!arabicChars) return false;
  if (!latinChars) return true;
  return arabicChars.length > latinChars.length;
}

// ─── Detect Image Model Family from Model ID ─────────────────────────

export function detectImageModelFamily(modelId: string): ImageModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('flux')) return 'flux';
  if (id.includes('sdxl') || id.includes('xl')) return 'sdxl';
  if (id.includes('pony')) return 'pony';
  if (id.includes('hunyuan')) return 'hunyuan';
  if (id.includes('pixart')) return 'pixart';
  if (id.includes('sd3') || id.includes('sd35') || id.includes('stable-diffusion-3')) return 'sd3';
  return 'generic-image';
}

// ─── Detect Video Model Family from Model ID ──────────────────────────

export function detectVideoModelFamily(modelId: string): VideoModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('cogvideox') || id.includes('cogvideo')) return 'cogvideox';
  if (id.includes('wan')) return 'wan';
  if (id.includes('ltx')) return 'ltx';
  if (id.includes('mochi')) return 'mochi';
  if (id.includes('open-sora') || id.includes('opensora')) return 'open-sora';
  if (id.includes('hunyuan') && id.includes('video')) return 'hunyuan-video';
  return 'generic-video';
}

// ─── Main Engine ──────────────────────────────────────────────────────

/**
 * Optimize a raw user prompt for AI image or video generation.
 *
 * @param rawPrompt - The user's original prompt (Arabic or English)
 * @param options - Category, model family, and other options
 * @returns The optimized English prompt ready for the model
 */
export function optimizePrompt(
  rawPrompt: string,
  options: PromptEngineOptions
): string {
  let prompt = rawPrompt.trim();
  if (!prompt) return prompt;

  // Step 1: Translate Arabic to English if needed
  const shouldTranslate = options.isArabic || isArabicPrompt(prompt);
  if (shouldTranslate) {
    prompt = translateArabicToEnglish(prompt);
  }

  // Step 2: Apply model-specific prompt structure
  if (options.category === 'image') {
    const family = (options.modelFamily as ImageModelFamily) || 'generic-image';
    switch (family) {
      case 'flux':
        prompt = buildFluxPrompt(prompt);
        break;
      case 'sdxl':
      case 'pony':
        prompt = buildSdxlPrompt(prompt);
        break;
      case 'hunyuan':
      case 'pixart':
        prompt = buildHunyuanPixArtPrompt(prompt);
        break;
      case 'sd3':
        prompt = buildSd3Prompt(prompt);
        break;
      default:
        prompt = buildGenericImagePrompt(prompt);
    }
  } else {
    const family = (options.modelFamily as VideoModelFamily) || 'generic-video';
    switch (family) {
      case 'cogvideox':
        prompt = buildCogVideoxPrompt(prompt);
        break;
      case 'wan':
        prompt = buildWanPrompt(prompt);
        break;
      case 'ltx':
        prompt = buildLtxPrompt(prompt);
        break;
      case 'mochi':
        prompt = buildMochiPrompt(prompt);
        break;
      case 'open-sora':
        prompt = buildOpenSoraPrompt(prompt);
        break;
      case 'hunyuan-video':
        prompt = buildHunyuanVideoPrompt(prompt);
        break;
      default:
        prompt = buildGenericVideoPrompt(prompt);
    }
  }

  // Step 3: Replace banned generic words with technical cues
  prompt = sanitizeBannedWords(prompt);

  // Step 4: Apply model style prefix if provided
  if (options.stylePrefix) {
    prompt = `${options.stylePrefix}${prompt}`;
  }

  // Clean up: remove trailing commas, double commas, double spaces
  prompt = prompt
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return prompt;
}

// ─── Chat Intent Detection ────────────────────────────────────────────

export type MediaGenIntent = 'image' | 'video' | 'document' | null;

/**
 * Detect if the user's message is a request to generate media.
 * Returns the detected intent or null.
 */
export function detectMediaGenIntent(message: string): MediaGenIntent {
  const lower = message.trim().toLowerCase();

  // Direct slash commands
  if (/^\/(صور[ةه]?|image|img)\b/i.test(lower)) return 'image';
  if (/^\/(فيديو|فديو|video|vid)\b/i.test(lower)) return 'video';
  if (/^\/(مستند|ملف|document|doc|pdf|ppt)\b/i.test(lower)) return 'document';

  // Arabic patterns for image generation
  const imagePatterns = [
    /اعمل[ي]? صور[ةه]/i,
    /صور[ةه] (عن|من|ل)/i,
    /ارسم/i,
    /ولد صور[ةه]/i,
    /طلع صور[ةه]/i,
    /صوّر/i,
    /جيب صور[ةه]/i,
    /صور[ةه] (كلب|قطة|طفل|ست|راجل|بنت|ولد|بحر|سماء|ورد|غروب)/i,
    /generate (an? )?image/i,
    /make (an? )?image/i,
    /create (an? )?image/i,
    /draw (me )?(an? )?/i,
  ];

  // Arabic patterns for video generation
  const videoPatterns = [
    /اعمل[ي]? فيديو/i,
    /اعمل[ي]? فديو/i,
    /فيديو (عن|من|ل)/i,
    /فديو (عن|من|ل)/i,
    /طلع فيديو/i,
    /جيب فيديو/i,
    /generate (an? )?video/i,
    /make (an? )?video/i,
    /create (an? )?video/i,
  ];

  // Arabic patterns for document generation
  const documentPatterns = [
    /اعمل[ي]? (ملف|مستند|عرض|بريزنتيشن)/i,
    /اعمل[ي]? pdf/i,
    /اعمل[ي]? ppt/i,
    /generate (a )?(document|pdf|ppt|presentation)/i,
    /make (a )?(document|pdf|ppt|presentation)/i,
    /create (a )?(document|pdf|ppt|presentation)/i,
  ];

  for (const pattern of imagePatterns) {
    if (pattern.test(lower)) return 'image';
  }
  for (const pattern of videoPatterns) {
    if (pattern.test(lower)) return 'video';
  }
  for (const pattern of documentPatterns) {
    if (pattern.test(lower)) return 'document';
  }

  return null;
}

/**
 * Extract the prompt portion from a media generation message.
 * E.g., "اعملي صورة كلب بيضحك" → "كلب بيضحك"
 */
export function extractMediaPrompt(message: string): string {
  let prompt = message.trim();

  // Remove slash command prefix
  prompt = prompt.replace(/^\/(صور[ةه]?|image|img|فيديو|فديو|video|vid|مستند|ملف|document|doc|pdf|ppt)\s*/i, '');

  // Remove Arabic generation verbs
  prompt = prompt.replace(/^(اعمل[ي]?|ولد|طلع|جيب|ارسم|صوّر)\s+(صور[ةه]?|فيديو|فديو|ملف|مستند|عرض|بريزنتيشن|pdf|ppt)\s*/i, '');

  // Remove English generation verbs
  prompt = prompt.replace(/^(generate|make|create|draw)\s+(me\s+)?(an?\s+)?(image|video|document|pdf|ppt|presentation)\s*(of|about|for)?\s*/i, '');

  return prompt.trim();
}
