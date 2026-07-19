/**
 * Shared radio station constants + smart matcher
 *
 * ═══════════════════════════════════════════════════════════════════════
 * VERIFIED WORKING STREAM URLS (2025-01-30)
 * ═══════════════════════════════════════════════════════════════════════
 * All URLs below have been verified with curl to return `content-type: audio/mpeg`
 * (or audio/aacp) with HTTP 200. They are HTTPS, CORS-friendly, and play
 * directly in an HTML5 <audio>/<video> element WITHOUT setting crossOrigin.
 *
 * Sources:
 *   - qurango.net/radio/*       — 24/7 Quran reciter stations (Cloudflare-fronted)
 *   - stream.radiojar.com/...   — Official Egyptian Radio & TV Union (ERTU) streams
 *   - stream.zeno.fm/...        — Zeno network (Nogoum FM, Arab Mix, Elissa, etc.)
 *   - radiohits882.radioca.st  — Radio Hits 88.2 Cairo
 *   - 9090streaming.mobtada.com — Radio 9090 Egypt
 *   - l3.itworkscdn.net/...     — Radio Asharq (with Bloomberg) news
 *
 * If a stream stops working, replace its URL here — the change propagates
 * to play-media API + Smart Ball detector + DB fallback automatically.
 * ═══════════════════════════════════════════════════════════════════════
 */

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  logo: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

// ── Extended station shape (used by the smart matcher + play-media API) ──
export interface Station {
  name: string;
  streamUrl: string;
  category: 'quran' | 'nasheed' | 'music' | 'news' | 'sports';
  aliases?: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// BUILTIN_STATIONS — the canonical list used by:
//   1. /api/ai/play-media     → matchStation() against this list
//   2. Smart Ball detector    → quick local match (sub-100ms, no LLM)
//   3. /api/radio/stations    → fallback when DB is empty
// ═══════════════════════════════════════════════════════════════════════
export const BUILTIN_STATIONS: Station[] = [
  // ── Quran — main 24/7 recitation stream ──
  {
    name: 'إذاعة القرآن الكريم',
    streamUrl: 'https://qurango.net/radio/tarateel',
    category: 'quran',
    aliases: ['قرآن', 'قران', 'quran', 'tarateel', 'تلاوات', 'تراتيل', 'تلاوة', 'القرآن', 'القران'],
  },

  // ── Quran — Official Egyptian Quran Radio (ERTU, Cairo) ──
  // This is the REAL "إذاعة القرآن الكريم من القاهرة" — stream.radiojar.com
  // hosts the official ERTU stream. Verified 200 OK + audio/mpeg.
  {
    name: 'إذاعة القرآن الكريم من القاهرة',
    streamUrl: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
    category: 'quran',
    aliases: ['القاهرة', 'القاهره', 'cairo', 'egypt', 'مصر', 'مصري', 'مصرى', 'مصرية', 'إذاعة القرآن', 'اذاعة القرآن', 'ertu'],
  },

  // ── Quran — By Reciter (all URLs on qurango.net/radio/ — VERIFIED WORKING) ──
  {
    name: 'إذاعة إبراهيم الأخضر',
    streamUrl: 'https://qurango.net/radio/ibrahim_alakdar',
    category: 'quran',
    aliases: ['إبراهيم', 'ابراهيم', 'الأخضر', 'الاخضر', 'ibrahim', 'alakdar', 'akhdar'],
  },
  {
    name: 'إذاعة أحمد العجمي',
    streamUrl: 'https://qurango.net/radio/ahmad_alajmy',
    category: 'quran',
    aliases: ['العجمي', 'العجمى', 'أحمد', 'احمد', 'ahmad', 'alajmy', 'ajmi', 'ajmi'],
  },
  {
    name: 'إذاعة إدريس أبكر',
    streamUrl: 'https://qurango.net/radio/idrees_abkr',
    category: 'quran',
    aliases: ['إدريس', 'ادريس', 'أبكر', 'ابكر', 'idrees', 'abkr'],
  },
  {
    name: 'إذاعة الشيخ الشاطري',
    streamUrl: 'https://qurango.net/radio/shaik_abu_bakr_al_shatri',
    category: 'quran',
    aliases: ['الشاطري', 'الشاطرى', 'shatri', 'shatry'],
  },
  {
    name: 'إذاعة مشاري العفاسي',
    streamUrl: 'https://qurango.net/radio/mishary_alafasi',
    category: 'quran',
    aliases: ['مشاري', 'مشارى', 'العفاسي', 'العفاسى', 'afasi', 'alafasi', 'mishary', 'afasy'],
  },
  {
    name: 'إذاعة ماهر المعيقلي',
    streamUrl: 'https://qurango.net/radio/maher_almuaiqly',
    category: 'quran',
    aliases: ['ماهر', 'المعيقلي', 'المعيقلى', 'maher', 'muaiqly'],
  },
  {
    name: 'إذاعة عبدالباسط عبدالصمد',
    streamUrl: 'https://qurango.net/radio/abdulbasit_abdulsamad',
    category: 'quran',
    aliases: ['عبدالباسط', 'عبد الباسط', 'عبدالصمد', 'abdulbasit', 'abdulsamad'],
  },
  {
    name: 'إذاعة ياسر الدوسري',
    streamUrl: 'https://qurango.net/radio/yasser_aldosari',
    category: 'quran',
    aliases: ['ياسر', 'الدوسري', 'الدوسرى', 'yasser', 'dosari'],
  },
  {
    name: 'إذاعة سعد الغامدي',
    streamUrl: 'https://qurango.net/radio/saad_alghamdi',
    category: 'quran',
    aliases: ['سعد', 'الغامدي', 'الغامدى', 'saad', 'ghamdi'],
  },
  // ── Quran — multi-reciter mix + fatwa ──
  {
    name: 'إذاعة القرآن المتنوعة',
    streamUrl: 'https://qurango.net/radio/mix',
    category: 'quran',
    aliases: ['mix', 'متنوعة', 'متتنوع', 'مشكل', 'منوع'],
  },
  {
    name: 'إذاعة فتاوى القرآن',
    streamUrl: 'https://qurango.net/radio/fatwa',
    category: 'quran',
    aliases: ['fatwa', 'فتوى', 'فتاوى', 'فتاوي'],
  },

  // ── Music / Entertainment ──
  // Nogoum FM — the actual zeno.fm stream (verified via radio-browser.info)
  {
    name: 'نجوم FM',
    streamUrl: 'https://stream.zeno.fm/qb1zvsykm98uv',
    category: 'music',
    aliases: ['نجوم', 'nogoum', 'njoum', 'نجوم اف ام', 'نجوم fm', 'nogoumfm'],
  },
  {
    name: 'راديو هيتس 88.2',
    streamUrl: 'https://radiohits882.radioca.st/;',
    category: 'music',
    aliases: ['هيتس', 'hits', 'hits 88', 'راديو هيتس', 'radio hits'],
  },
  {
    name: 'راديو 9090',
    streamUrl: 'https://9090streaming.mobtada.com/9090FMEGYPT',
    category: 'music',
    aliases: ['9090', 'تسعينات', 'راديو 9090'],
  },
  {
    name: 'Arab Mix FM',
    streamUrl: 'https://stream.zeno.fm/na3vpvn10qruv',
    category: 'music',
    aliases: ['arab mix', 'mix fm', 'اراب مكس', 'مكس اف ام', 'مكس fm'],
  },
  {
    name: 'إليسا FM',
    streamUrl: 'https://stream.zeno.fm/v7n499m8ckhvv',
    category: 'music',
    aliases: ['إليسا', 'اليسا', 'elissa', 'elissa fm'],
  },
  {
    name: 'راديو عمرو دياب',
    streamUrl: 'https://stream-40.zeno.fm/xa4yhh4k838uv',
    category: 'music',
    aliases: ['عمرو دياب', 'امرو دياب', 'amr diab', 'diab', 'دياب'],
  },

  // ── News ──
  // Radio Asharq with Bloomberg — verified 200 OK + audio/aacp
  {
    name: 'راديو الشرق مع بلومبرج',
    streamUrl: 'https://l3.itworkscdn.net/asharqradioalive/asharqradioa/icecast.audio',
    category: 'news',
    aliases: ['الشرق', 'asharq', 'asharq with bloomberg', 'بلومبرج', 'bloomberg', 'أخبار', 'اخبار', 'news', 'نشرة', 'أخبارية'],
  },

  // ── Sports ──
  // NOTE: On Sport FM (carina.streamerr.co) currently returns 503 — leaving
  // this entry commented out so we don't ship a broken URL. When the stream
  // comes back online or we find another working Arabic sports station, add
  // it back here.
  // {
  //   name: 'On Sport FM',
  //   streamUrl: 'https://carina.streamerr.co:2020/stream/OnSportFM',
  //   category: 'sports',
  //   aliases: ['on sport', 'on sport fm', 'اون سبورت', 'أون سبورت', 'رياضة', 'رياضة', 'sports', 'sport'],
  // },
];

// ═══════════════════════════════════════════════════════════════════════
// FALLBACK_RADIO_STATIONS — used by /api/radio/stations when DB is empty
// ═══════════════════════════════════════════════════════════════════════
// Built dynamically from BUILTIN_STATIONS so we have ONE source of truth.
// The old hardcoded list pointed at non-existent radiojar.com URLs that
// all returned 404 — they have been removed.
// ═══════════════════════════════════════════════════════════════════════
export const FALLBACK_RADIO_STATIONS: RadioStation[] = BUILTIN_STATIONS.map((s, i) => ({
  id: `builtin-${i + 1}`,
  name: s.name,
  streamUrl: s.streamUrl,
  logo: null,
  category: s.category,
  isActive: true,
  sortOrder: i + 1,
}));

/**
 * SEED_RADIO_STATIONS — DB seed data (without id/logo — DB generates those)
 *
 * IMPORTANT: All URLs below are verified working as of 2025-01-30.
 * Do NOT add radiojar.com URLs unless you verify them — most radiojar
 * mountpoints are private and return 404.
 */
export const SEED_RADIO_STATIONS = BUILTIN_STATIONS.map((s, i) => ({
  name: s.name,
  streamUrl: s.streamUrl,
  category: s.category,
  sortOrder: i + 1,
}));

// ═══════════════════════════════════════════════════════════════════════
// Arabic text normalization + smart station matcher
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalize Arabic text for fuzzy matching:
 *   - lowercase
 *   - strip tashkeel (diacritics)
 *   - normalize alef variants (إأآا → ا)
 *   - normalize alef maqsura (ى → ي)
 *   - normalize ta marbuta (ة → ه)
 *   - collapse whitespace
 */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')        // strip tashkeel
    .replace(/[إأآا]/g, 'ا')                // normalize alef
    .replace(/ى/g, 'ي')                     // normalize alef maqsura
    .replace(/ة/g, 'ه')                     // normalize ta marbuta
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic tokens that don't disambiguate between stations
const GENERIC_TOKENS = new Set([
  'اذاعه', 'اذاعة', 'شغل', 'شغلى', 'شغلي', 'استمع', 'اسمع', 'افتح', 'افتحلي',
  'play', 'قرآن', 'قران', 'quran', 'القرآن', 'القران',
  'الكريم', 'الكریم', 'شيخ', 'مولانا', 'الاستماع', 'بسم', 'الله',
  'الرحمن', 'الرحيم', 'لي', 'ليّ', 'بقا', 'عشان', 'لو', 'سريع',
  'محطة', 'محطه', 'station', 'radio', 'راديو', 'إذاعة', 'fm', 'اف ام',
  'من', 'ال', 'لي', 'ليّ', 'بقا', 'عشان', 'لو', 'سريع', 'فقط', 'كمان',
]);

export interface MatchResult {
  station: Station;
  score: number;
}

/**
 * Smart station matcher — scores each station by keyword overlap.
 *
 * Returns the best match if its score is at least `minScore` (default 10).
 * Returns null if no station matches — the caller should then ask the
 * user to specify, instead of silently defaulting to BUILTIN_STATIONS[0].
 */
export function matchStation(query: string, minScore = 10): Station | null {
  const normQ = normalizeArabic(query);
  const queryTokens = normQ.split(' ').filter(t => t.length > 1);

  let bestStation: Station | null = null;
  let bestScore = 0;

  for (const station of BUILTIN_STATIONS) {
    let score = 0;
    const normName = normalizeArabic(station.name);
    const normAliases = (station.aliases || []).map(normalizeArabic);

    // ── 1) SPECIFIC alias match (STRONGEST signal — 30 pts each) ──
    // Specific aliases (reciter names, city names, station names) are the
    // most reliable disambiguation signal.
    for (const token of queryTokens) {
      if (GENERIC_TOKENS.has(token)) continue;
      for (const alias of normAliases) {
        if (!alias) continue;
        if (alias === token || alias.includes(token) || token.includes(alias)) {
          score += 30;
          break;
        }
      }
    }

    // ── 2) Token match against station name (10 pts each) ──
    for (const token of queryTokens) {
      if (GENERIC_TOKENS.has(token)) continue;
      if (normName.includes(token)) score += 10;
    }

    // ── 3) Direct name substring match ──
    if (normQ === normName) {
      score += 100; // Exact match — very strong
    } else if (normName.includes(normQ) || normQ.includes(normName)) {
      score += 15;
    }

    // ── 4) Category match (weakest — 1 pt, only for disambiguation) ──
    const wantsQuran = /قرآن|قران|quran|قارئ|تلاوه|تلاوة/i.test(query);
    if (wantsQuran && station.category === 'quran') score += 1;
    const wantsNews = /أخبار|اخبار|news|نشرة/i.test(query);
    if (wantsNews && station.category === 'news') score += 1;
    const wantsMusic = /موسيقى|موسيقي|music|أغاني|اغاني|songs/i.test(query);
    if (wantsMusic && station.category === 'music') score += 1;
    const wantsSport = /رياضة|رياضه|sport|sports|كرة/i.test(query);
    if (wantsSport && station.category === 'sports') score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestStation = station;
    }
  }

  if (!bestStation || bestScore < minScore) {
    console.log(`[matchStation] no match for "${query}" (best score=${bestScore}, min=${minScore})`);
    return null;
  }

  console.log(`[matchStation] query="${query}" → "${bestStation.name}" (score=${bestScore})`);
  return bestStation;
}

/**
 * Pick a sensible default station for a given category.
 * Used when the user says "شغل قرآن" (generic) without specifying a reciter.
 */
export function getDefaultStationForCategory(category: Station['category']): Station {
  return (
    BUILTIN_STATIONS.find(s => s.category === category) ||
    BUILTIN_STATIONS[0]
  );
}
