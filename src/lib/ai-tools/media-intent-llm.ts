// ═══════════════════════════════════════════════════════════════════════
// Context-based Media Intent Detection (NO LLM — pure regex intelligence)
// ═══════════════════════════════════════════════════════════════════════
// Uses regex with reciter-name recognition + verb intent analysis.
// NO ZAI SDK / NO LLM calls — works 100% offline, instant, free.
//
// How it works:
//   1. Checks if message contains known reciter names → radio
//   2. Checks for radio/إذاعة/قرآن keywords → radio
//   3. Checks for video/youtube/قناة keywords → youtube
//   4. Checks for "play/hear/listen" verbs → context-based default
//   5. Extracts the reciter name or search term as the query
// ═══════════════════════════════════════════════════════════════════════

export interface MediaIntent {
  wantsMedia: boolean;
  source?: 'radio' | 'spotify' | 'youtube' | 'tts';
  query?: string;
  confidence?: number;
  /** V.15: "stop" intent — user wants to stop/close the current media */
  action?: 'play' | 'stop';
}

// ── Known Quran reciters (radio station names) ──
const RECITERS = [
  { name: 'إبراهيم الأخضر', aliases: ['إبراهيم', 'ابراهيم', 'الأخضر', 'الاخضر', 'ibrahim', 'alakdar'] },
  { name: 'أحمد العجمي', aliases: ['العجمي', 'العجمى', 'أحمد', 'احمد', 'ahmad', 'alajmy', 'ajmi'] },
  { name: 'إدريس أبكر', aliases: ['إدريس', 'ادريس', 'أبكر', 'ابكر', 'idrees', 'abkr'] },
  { name: 'الشاطري', aliases: ['الشاطري', 'الشاطرى', 'shatri', 'shatry'] },
  { name: 'مشاري العفاسي', aliases: ['مشاري', 'مشارى', 'العفاسي', 'العفاسى', 'afasi', 'alafasi', 'mishary'] },
  { name: 'ماهر المعيقلي', aliases: ['ماهر', 'المعيقلي', 'المعيقلى', 'maher', 'muaiqly'] },
  { name: 'عبدالباسط عبدالصمد', aliases: ['عبدالباسط', 'عبد الباسط', 'عبدالصمد', 'abdulbasit', 'abdulsamad'] },
  { name: 'ياسر الدوسري', aliases: ['ياسر', 'الدوسري', 'الدوسرى', 'yasser', 'dosari'] },
  { name: 'عبدالرحمن السديس', aliases: ['السديس', 'عبدالرحمن', 'سديس', 'sudais'] },
  { name: 'سعد الغامدي', aliases: ['سعد', 'الغامدي', 'الغامدى', 'saad', 'ghamdi'] },
  { name: 'المنشاوي', aliases: ['المنشاوي', 'المنشاوى', 'minshawi'] },
  { name: 'الحرمين', aliases: ['الحرمين', 'الحرم', 'مكة', 'مكه', 'haramain'] },
];

// ── Normalize Arabic (strip tashkeel, normalize alef/ya/ta-marbuta) ──
function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extract reciter name from message ──
function extractReciter(message: string): string | null {
  const norm = normalizeArabic(message);
  for (const reciter of RECITERS) {
    for (const alias of reciter.aliases) {
      const normAlias = normalizeArabic(alias);
      if (norm.includes(normAlias)) {
        return reciter.name;
      }
    }
  }
  return null;
}

// ── Extract search query (for YouTube/Spotify) ──
// Strips command verbs and returns the actual search term
function extractSearchQuery(message: string): string {
  let q = message
    // Remove command phrases
    .replace(/شغل(?:لي|لنا|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/سمع(?:لي|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/استمع(?:لي|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/افتح(?:لي|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/ابعت(?:لي|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/حط(?:لي|لنا|نا)?\s*(لي)?/gi, '')
    .replace(/خليني\s*(اسمع|اشوف|اتفرج)?/gi, '')
    .replace(/خلينا\s*(اسمع|اشوف|اتفرج)?/gi, '')
    .replace(/عاوز\s*(اسمع|اشوف|اتفرج)?/gi, '')
    .replace(/عوز\s*(اسمع|اشوف|اتفرج)?/gi, '')
    .replace(/play\s*(for\s*me|us)?/gi, '')
    .replace(/play/gi, '')
    .replace(/^(لي|انا|احنا)\s+/gi, '')
    .trim();
  return q || message;
}

/**
 * Detect media intent from context (NO LLM, pure regex intelligence).
 */
export function detectMediaIntent(message: string): MediaIntent {
  const norm = normalizeArabic(message);
  const lower = message.toLowerCase();

  // ── 0a) GENERATION intent: "اعملي صورة/فيديو", "ارسم", "ولد فيديو" ──
  // These are NOT play/search intents — they should fall through to the
  // inline media generation pipeline (detectInlineMediaGenIntent) which
  // actually generates new images/videos via CogView/CogVideoX.
  //
  // Without this guard, "اعملي فيديو عن القطط" would match the "فيديو"
  // keyword below and be routed to YouTube search, returning a random
  // YouTube video instead of generating one.
  //
  // Generation verbs (Arabic): اعمل، اعملي، ولد، طلع، جيب، صور، صوّر، ارسم، ارسملي، حوّل
  // Generation verbs (English): generate, make, create, draw
  const hasGenerateVerb = /اعمل(?:ي|لي)?|ولد(?:لي|ي)?|طلع(?:لي|ي)?|جيب(?:لي|ي)?|صوّ?ر(?:لي|ي)?|ارسم(?:لي|ي)?|حوّل|generate|make|create|draw/i.test(message);
  const hasMediaKeyword = /صور[ةه]|فيديو|فديو|video|image|picture|portrait|رسم|لوح/i.test(message);
  if (hasGenerateVerb && hasMediaKeyword) {
    // Let the inline media generation pipeline handle this.
    return { wantsMedia: false };
  }

  // ── 0) STOP intent: user wants to stop/close current media ──
  // Check this FIRST — "اقفل الراديو" should not be interpreted as "play radio"
  if (/اقفل|اقفله|اقفلي|قفل|وقف|وقفه|قفلي|سكته|اسكت|إيقاف|ايقاف|stop|pause|mute|كتم|صامت|close\s+(?:the\s+)?(?:radio|player|music)|shut\s*up/i.test(message)) {
    // Only treat as stop if there's no "play" verb alongside
    const hasPlayVerb = /شغل|افتح|ابعت|play|start|put\s*on/i.test(message);
    if (!hasPlayVerb || /اقفل|وقف|إيقاف|stop/i.test(message)) {
      return { wantsMedia: true, action: 'stop', source: undefined, query: message, confidence: 0.95 };
    }
  }

  // ── 1) TTS: user wants text read aloud ──
  if (/اقرأ\s*(لي|لنا|نا)?|اقرألي|نطق|تحدث|اقرأ\s*النص|convert\s*to\s*voice|tts/i.test(message)) {
    return { wantsMedia: true, source: 'tts', query: message, confidence: 0.9 };
  }

  // ── 2) RADIO: reciter name present → radio ──
  const reciter = extractReciter(message);
  if (reciter) {
    return { wantsMedia: true, source: 'radio', query: reciter, confidence: 0.95 };
  }

  // ── 3) RADIO: explicit radio/إذاعة/محطة keywords ──
  if (/راديو|إذاعة|اذاعه|radio|station|محطه|محطة|إذاعه/i.test(message)) {
    const query = extractSearchQuery(message);
    return { wantsMedia: true, source: 'radio', query, confidence: 0.9 };
  }

  // ── 4) RADIO: Quran keywords (without video/youtube) ──
  const hasQuran = /قرآن|قران|quran|تلاوه|تلاوة|قراءه|قراءة/i.test(message);
  const hasVideoSignal = /فيديو|video|يوتيوب|youtube|قناة|channel|مشاهده|مشاهدة|حلقه|حلقة/i.test(message);
  if (hasQuran && !hasVideoSignal) {
    const query = extractSearchQuery(message);
    return { wantsMedia: true, source: 'radio', query, confidence: 0.85 };
  }

  // ── 5) YOUTUBE: explicit video/youtube/channel keywords ──
  if (hasVideoSignal) {
    const query = extractSearchQuery(message);
    return { wantsMedia: true, source: 'youtube', query, confidence: 0.9 };
  }

  // ── 6) MUSIC/SPOTIFY: song keywords ──
  if (/أغني|اغني|song|music|موسيقى|spotify|سبوتيفاي|نشيد|نشيده|اناشيد|أناشيد/i.test(message)) {
    const query = extractSearchQuery(message);
    return { wantsMedia: true, source: 'spotify', query, confidence: 0.85 };
  }

  // ── 7) Context: "play/hear/listen" verbs WITHOUT video signal → radio (default for Arabic) ──
  // If user says "سمعلي حاجة" or "شغللي حاجة" without specifying video, default to radio
  const hasPlayVerb = /شغل|اسمع|استمع|افتح|play|تشغيل|سمع|حط|ابعت/i.test(message);
  if (hasPlayVerb && !hasVideoSignal) {
    const query = extractSearchQuery(message);
    return { wantsMedia: true, source: 'radio', query, confidence: 0.6 };
  }

  return { wantsMedia: false };
}

/**
 * Legacy LLM-based detection — DISABLED (ZAI SDK not free, fails silently).
 * Kept for reference but not used.
 */
export async function detectMediaIntentLLM(_message: string): Promise<MediaIntent> {
  return { wantsMedia: false };
}

export function detectMediaIntentRegex(message: string): MediaIntent {
  return detectMediaIntent(message);
}
