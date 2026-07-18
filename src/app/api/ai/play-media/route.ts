// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/play-media
// ═══════════════════════════════════════════════════════════════════════
// AI Function Calling endpoint for media playback.
// Returns structured JSON with mediaWidget — NEVER raw audio.
//
// Sources:
//   - radio: fetch stream URL from Prisma RadioStation table
//   - spotify: search via Spotify API (stored token)
//   - youtube: extract audio stream URL
//   - tts: generate via /api/ai/tts/edge (Base64 JSON)
//   - auto: detect from query
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { detectMediaSource, buildMediaWidget } from '@/lib/ai-tools/play-media-tool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════════════════
// Verified working radio stations — direct HTTPS audio streams
// Organized by category. All URLs verified to return audio/mpeg.
// ═══════════════════════════════════════════════════════════════════════
interface Station {
  name: string;
  streamUrl: string;
  category: string; // quran | nasheed | music | news | sports
  aliases?: string[]; // additional matching keywords
}

const BUILTIN_STATIONS: Station[] = [
  // ── Quran — General (the main Quran broadcast) ──
  // tarateel = "تراتيل/تلاوات" — this is the main 24/7 Quran recitation stream
  { name: 'إذاعة القرآن الكريم', streamUrl: 'https://qurango.net/radio/tarateel', category: 'quran', aliases: ['قرآن', 'قران', 'quran', 'tarateel', 'تلاوات', 'تراتيل', 'تلاوة'] },

  // ── Quran — By Reciter (all URLs on qurango.net/radio/ — VERIFIED WORKING) ──
  // NOTE: backup.qurango.net is DEAD (returns 500). Use qurango.net/radio/ instead.
  { name: 'إذاعة إبراهيم الأخضر', streamUrl: 'https://qurango.net/radio/ibrahim_alakdar', category: 'quran', aliases: ['إبراهيم', 'ابراهيم', 'الأخضر', 'الاخضر', 'ibrahim', 'alakdar'] },
  { name: 'إذاعة أحمد العجمي', streamUrl: 'https://qurango.net/radio/ahmad_alajmy', category: 'quran', aliases: ['العجمي', 'العجمي', 'أحمد', 'احمد', 'ahmad', 'alajmy', 'ajmi'] },
  { name: 'إذاعة إدريس أبكر', streamUrl: 'https://qurango.net/radio/idrees_abkr', category: 'quran', aliases: ['إدريس', 'ادريس', 'أبكر', 'ابكر', 'idrees', 'abkr'] },
  { name: 'إذاعة الشيخ الشاطري', streamUrl: 'https://qurango.net/radio/shaik_abu_bakr_al_shatri', category: 'quran', aliases: ['الشاطري', 'الشاطرى', 'shatri', 'shatry'] },
  { name: 'إذاعة مشاري العفاسي', streamUrl: 'https://qurango.net/radio/mishary_alafasi', category: 'quran', aliases: ['مشاري', 'مشارى', 'العفاسي', 'العفاسى', 'afasi', 'alafasi', 'mishary'] },
  { name: 'إذاعة ماهر المعيقلي', streamUrl: 'https://qurango.net/radio/maher_almuaiqly', category: 'quran', aliases: ['ماهر', 'المعيقلي', 'المعيقلى', 'maher', 'muaiqly'] },
  { name: 'إذاعة عبدالباسط عبدالصمد', streamUrl: 'https://qurango.net/radio/abdulbasit_abdulsamad', category: 'quran', aliases: ['عبدالباسط', 'عبد الباسط', 'عبدالصمد', 'abdulbasit', 'abdulsamad'] },
  { name: 'إذاعة ياسر الدوسري', streamUrl: 'https://qurango.net/radio/yasser_aldosari', category: 'quran', aliases: ['ياسر', 'الدوسري', 'الدوسرى', 'yasser', 'dosari'] },
  { name: 'إذاعة سعد الغامدي', streamUrl: 'https://qurango.net/radio/saad_alghamdi', category: 'quran', aliases: ['سعد', 'الغامدي', 'الغامدى', 'saad', 'ghamdi'] },

  // ── Cairo/Egypt Quran radio ──
  // qurango.net/radio/tarateel is the main Quran stream (closest to Egyptian Quran radio)
  { name: 'إذاعة القرآن الكريم من القاهرة', streamUrl: 'https://qurango.net/radio/tarateel', category: 'quran', aliases: ['القاهرة', 'القاهره', 'cairo', 'egypt', 'مصر', 'مصري', 'مصرى', 'القاهره', 'مصرية'] },
];

// ═══════════════════════════════════════════════════════════════════════
// Smart station matcher — scores each station by keyword overlap
// Returns the best match (not just the first one).
// ═══════════════════════════════════════════════════════════════════════
function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')        // strip tashkeel
    .replace(/[إأآا]/g, 'ا')                // normalize alef
    .replace(/ى/g, 'ي')                     // normalize alef maqsura
    .replace(/ة/g, 'ه')                     // normalize ta marbuta
    .replace(/\s+/g, ' ')
    .trim();
}

function matchStation(query: string): Station {
  const normQ = normalizeArabic(query);
  const queryTokens = normQ.split(' ').filter(t => t.length > 1);

  let bestStation = BUILTIN_STATIONS[0];
  let bestScore = -1;

  // Generic tokens that don't disambiguate between stations
  const GENERIC = new Set([
    'اذاعه', 'شغل', 'شغلى', 'شغلي', 'استمع', 'اسمع', 'افتح', 'افتحلي',
    'play', 'قرآن', 'قران', 'quran', 'القرآن', 'القران', 'من', 'ال',
    'الكريم', 'الكریم', 'شيخ', 'مولانا', 'الاستماع', 'بسم', 'الله',
    'الرحمن', 'الرحيم', 'لي', 'ليّ', 'بقا', 'عشان', 'لو', 'سريع',
  ]);

  for (const station of BUILTIN_STATIONS) {
    let score = 0;
    const normName = normalizeArabic(station.name);
    const normAliases = (station.aliases || []).map(normalizeArabic);

    // ── 1) SPECIFIC alias match (STRONGEST signal — 30 pts each) ──
    // Specific aliases (reciter names, city names) are the most reliable
    // disambiguation signal. e.g. "القاهره" → Cairo station, "العجمي" → Al-Ajmi
    for (const token of queryTokens) {
      if (GENERIC.has(token)) continue;
      for (const alias of normAliases) {
        if (alias === token || alias.includes(token) || token.includes(alias)) {
          score += 30;
          break;
        }
      }
    }

    // ── 2) Token match against station name (10 pts each) ──
    for (const token of queryTokens) {
      if (GENERIC.has(token)) continue;
      if (normName.includes(token)) score += 10;
    }

    // ── 3) Direct name substring match (weaker — 15 pts) ──
    // Only counts if the station name is a substring of the query OR vice versa
    // Reduced from 50 to 15 because this caused false matches (the general
    // "إذاعة القرآن الكريم" name is a substring of "إذاعة القرآن الكريم من القاهرة")
    if (normQ === normName) {
      // Exact match — very strong
      score += 100;
    } else if (normName.includes(normQ) || normQ.includes(normName)) {
      score += 15;
    }

    // ── 4) Category match (weakest — 1 pt, only for disambiguation) ──
    const wantsQuran = /قرآن|قران|quran|قارئ|تلاوه|تلاوة/i.test(query);
    if (wantsQuran && station.category === 'quran') score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestStation = station;
    }
  }

  console.log(`[play-media] matchStation: query="${query}" → "${bestStation.name}" (score=${bestScore})`);
  return bestStation;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      query?: string;
      source?: 'radio' | 'spotify' | 'youtube' | 'tts' | 'auto';
    };

    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json({ error: 'الاستعلام مطلوب' }, { status: 400 });
    }

    let source = body.source || 'auto';
    if (source === 'auto') {
      source = detectMediaSource(query);
    }

    // ── RADIO: fetch from Prisma ──
    if (source === 'radio') {
      return await handleRadio(query);
    }

    // ── SPOTIFY: search via stored token (fallback to YouTube if not connected) ──
    if (source === 'spotify') {
      try {
        return await handleSpotify(query);
      } catch (spotifyErr) {
        console.warn('[play-media] Spotify failed, falling back to YouTube:', spotifyErr instanceof Error ? spotifyErr.message : String(spotifyErr));
        return await handleYouTube(query);
      }
    }

    // ── YOUTUBE: extract audio stream ──
    if (source === 'youtube') {
      return await handleYouTube(query);
    }

    // ── TTS: generate via Edge TTS ──
    if (source === 'tts') {
      return await handleTTS(query);
    }

    return NextResponse.json({ error: 'مصدر غير مدعوم' }, { status: 400 });
  } catch (error) {
    console.error('[play-media] Error:', error);
    return NextResponse.json(
      { error: 'خطأ في تشغيل الوسائط', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Radio Handler — fetch from Prisma RadioStation table, fallback to builtin
// ═══════════════════════════════════════════════════════════════════════
async function handleRadio(query: string) {
  // Try DB first — search by name with smart matching
  let stations: any[] = [];
  try {
    stations = await db.radioStation.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { sortOrder: 'asc' },
    });
  } catch { /* DB not ready */ }

  // If DB has matches, score them too (don't blindly pick first)
  if (stations.length > 0) {
    const normQ = normalizeArabic(query);
    let bestDb = stations[0];
    let bestDbScore = -1;
    for (const s of stations) {
      const normName = normalizeArabic(s.name || '');
      let score = normName.includes(normQ) ? 50 : 0;
      const qTokens = normQ.split(' ').filter(t => t.length > 1);
      for (const t of qTokens) {
        if (normName.includes(t)) score += 10;
      }
      if (score > bestDbScore) {
        bestDbScore = score;
        bestDb = s;
      }
    }
    return NextResponse.json({
      content: `جاري تشغيل ${bestDb.name}...`,
      mediaWidget: buildMediaWidget({
        source: 'radio',
        title: bestDb.name,
        streamUrl: bestDb.streamUrl,
        autoPlay: true,
      }),
    });
  }

  // Use the smart matcher against built-in stations
  const matched = matchStation(query);

  return NextResponse.json({
    content: `جاري تشغيل ${matched.name}...`,
    mediaWidget: buildMediaWidget({
      source: 'radio',
      title: matched.name,
      streamUrl: matched.streamUrl,
      autoPlay: true,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Spotify Handler — search via stored OAuth token
// ═══════════════════════════════════════════════════════════════════════
async function handleSpotify(query: string) {
  // Get stored Spotify token
  const tokenRecord = await db.spotifyToken.findFirst({
    orderBy: { expiresAt: 'desc' },
  });

  if (!tokenRecord || new Date(tokenRecord.expiresAt) < new Date()) {
    return NextResponse.json({
      content: 'Spotify غير متصل. يرجى ربط حساب Spotify من الإعدادات أولاً.',
      mediaWidget: null,
    });
  }

  // Search Spotify
  const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
  const resp = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${tokenRecord.accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });

  if (!resp.ok) {
    return NextResponse.json({
      content: `تعذر البحث في Spotify: ${resp.status}`,
      mediaWidget: null,
    });
  }

  const data = await resp.json();
  const track = data.tracks?.items?.[0];

  if (!track) {
    return NextResponse.json({
      content: `لم أجد أغنية تطابق "${query}" على Spotify.`,
      mediaWidget: null,
    });
  }

  return NextResponse.json({
    content: `جاري تشغيل "${track.name}" by ${track.artists[0]?.name}...`,
    mediaWidget: buildMediaWidget({
      source: 'spotify',
      title: `${track.name} — ${track.artists[0]?.name}`,
      streamUrl: track.preview_url, // 30s preview (full playback needs SDK)
      autoPlay: true,
      duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined,
      thumbnail: track.album?.images?.[0]?.url,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// YouTube Handler — NO API KEY NEEDED
// ═══════════════════════════════════════════════════════════════════════
// Scrapes YouTube's search results page and extracts the first video's
// ID + title + thumbnail. This bypasses the need for YOUTUBE_API_KEY
// entirely — no quota limits, no key management, works out of the box.
// ═══════════════════════════════════════════════════════════════════════
async function searchYouTubeNoKey(query: string): Promise<{ videoId: string; title: string; thumbnail: string } | null> {
  // ── Strategy 1: Scrape youtube.com/results page ──
  // YouTube embeds video metadata in a JSON blob (ytInitialData) on the
  // search results page. We extract the first video result from it.
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`YouTube scrape ${resp.status}`);
    const html = await resp.text();

    // Extract all videoIds from the page (they appear in ytInitialData JSON)
    const videoIdMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
    if (videoIdMatches.length === 0) throw new Error('No videoId found in page');

    // Deduplicate — the same videoId appears multiple times
    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const m of videoIdMatches) {
      const id = m[1];
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }
    const videoId = uniqueIds[0];
    if (!videoId) throw new Error('No unique videoId');

    // Extract title — find the FIRST title that appears AFTER the first
    // occurrence of our videoId in the page. This avoids matching the
    // "Search filters" section title or other layout titles that appear
    // before the actual video results.
    let title = query; // fallback
    const firstVideoIdIndex = html.indexOf(`"videoId":"${videoId}"`);
    if (firstVideoIdIndex >= 0) {
      // Search for the title pattern within 3000 chars AFTER the videoId
      const afterVideoId = html.substring(firstVideoIdIndex, firstVideoIdIndex + 3000);
      const titleMatch = afterVideoId.match(/"title":\{"runs":\[\{"text":"([^"]{3,200})"\}\]\}/);
      if (titleMatch) {
        title = titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
    }
    // Fallback: if no title found, use oEmbed API (no key needed)
    if (title === query) {
      try {
        const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (oembedResp.ok) {
          const oembed = await oembedResp.json();
          if (oembed.title) title = oembed.title;
        }
      } catch {}
    }

    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return { videoId, title, thumbnail };
  } catch (scrapeErr) {
    console.warn('[play-media] YouTube scrape failed:', scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr));
  }

  // ── Strategy 2: Fall back to YouTube Data API IF a key is set ──
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${process.env.YOUTUBE_API_KEY}`;
      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
      if (resp.ok) {
        const data = await resp.json();
        const video = data.items?.[0];
        if (video?.id?.videoId) {
          return {
            videoId: video.id.videoId,
            title: video.snippet?.title || query,
            thumbnail: video.snippet?.thumbnails?.high?.url || `https://img.youtube.com/vi/${video.id.videoId}/hqdefault.jpg`,
          };
        }
      }
    } catch (apiErr) {
      console.warn('[play-media] YouTube API fallback failed:', apiErr instanceof Error ? apiErr.message : String(apiErr));
    }
  }

  return null;
}

async function handleYouTube(query: string) {
  const result = await searchYouTubeNoKey(query);

  if (!result) {
    return NextResponse.json({
      content: `لم أجد فيديو يطابق "${query}" على YouTube.`,
      mediaWidget: null,
    });
  }

  const { videoId, title, thumbnail } = result;
  // ── Use standard youtube.com/embed/ URL — works in all browsers ──
  // (youtube-nocookie.com can cause issues on some networks)
  const streamUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;

  console.log(`[play-media] YouTube: query="${query}" → videoId=${videoId}, title="${title}"`);

  return NextResponse.json({
    content: `جاري تشغيل "${title}" من YouTube...`,
    mediaWidget: {
      type: 'video',
      source: 'youtube',
      title,
      streamUrl,
      autoPlay: true,
      thumbnail,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TTS Handler — generate via /api/ai/tts/edge (Base64 JSON)
// ═══════════════════════════════════════════════════════════════════════
async function handleTTS(query: string) {
  const ttsUrl = `http://localhost:3000/api/ai/tts/edge?t=${Date.now()}`;
  const resp = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: query.slice(0, 5000),
      voice: 'ar-EG-SalmaNeural',
      speed: 1.0,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    return NextResponse.json({
      content: 'تعذر توليد الصوت.',
      mediaWidget: null,
    });
  }

  const data = await resp.json();

  return NextResponse.json({
    content: `🔊 جاري قراءة النص...`,
    mediaWidget: buildMediaWidget({
      source: 'tts',
      title: 'قراءة صوتية',
      audioData: data.audioData,
      mimeType: data.mimeType || 'audio/mpeg',
      autoPlay: true,
    }),
  });
}
