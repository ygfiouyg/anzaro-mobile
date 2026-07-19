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
import {
  normalizeArabic,
  matchStation as matchStationShared,
  getDefaultStationForCategory,
  type Station,
} from '@/lib/radio-stations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ── Re-export the shared matchStation so the rest of this file keeps working ──
// Returns the best match OR null when no station matches the query well enough.
// The caller is responsible for deciding what to do when null is returned
// (either fall back to a category default or ask the user to specify).
function matchStation(query: string): Station | null {
  return matchStationShared(query, /* minScore */ 10);
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
  // Try DB first — search by name (broad LIKE) and score with the same
  // normalization logic used for BUILTIN_STATIONS. The previous query used
  // `contains: query` which is exact-substring + case-insensitive only,
  // so "نجوم" wouldn't match a station named "Nogoum FM" (different script).
  let stations: any[] = [];
  try {
    // Broad fetch — we'll score + filter in JS so we can normalize Arabic.
    stations = await db.radioStation.findMany({
      where: { isActive: true },
      take: 50,
      orderBy: { sortOrder: 'asc' },
    });
  } catch { /* DB not ready */ }

  // Score DB stations with the same normalizeArabic + token logic.
  if (stations.length > 0) {
    const normQ = normalizeArabic(query);
    const queryTokens = normQ.split(' ').filter(t => t.length > 1);

    const GENERIC = new Set([
      'شغل', 'شغلى', 'شغلي', 'استمع', 'اسمع', 'افتح', 'افتحلي', 'play',
      'قرآن', 'قران', 'quran', 'القرآن', 'القران', 'الكريم', 'من', 'ال',
      'محطة', 'محطه', 'station', 'radio', 'راديو', 'إذاعة', 'اذاعة', 'اذاعه',
      'fm', 'اف ام', 'لي', 'بقا', 'عشان', 'لو', 'سريع',
    ]);

    let bestDb: any = null;
    let bestDbScore = 0;
    for (const s of stations) {
      const normName = normalizeArabic(s.name || '');
      const normCategory = normalizeArabic(s.category || '');
      let score = 0;
      for (const t of queryTokens) {
        if (GENERIC.has(t)) continue;
        if (normName.includes(t)) score += 20;
        if (normCategory.includes(t)) score += 5;
      }
      if (normQ === normName) score += 100;
      else if (normName && (normName.includes(normQ) || normQ.includes(normName))) score += 25;

      if (score > bestDbScore) {
        bestDbScore = score;
        bestDb = s;
      }
    }

    // Require a minimum score to accept a DB match — otherwise we'd silently
    // pick stations[0] for unrelated queries (the original bug).
    if (bestDb && bestDbScore >= 15) {
      console.log(`[play-media] DB match: "${bestDb.name}" (score=${bestDbScore})`);
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
  }

  // ── Use the smart matcher against built-in stations ──
  const matched = matchStation(query);

  if (matched) {
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

  // ── Last-resort: if the user asked for a generic category (قرآن/أخبار/موسيقى)
  //    without specifying a name, pick the category default so playback at
  //    least starts. This is intentional — "شغل قرآن" should always play Quran.
  // ──
  const q = query.toLowerCase();
  if (/قرآن|قران|quran|تلاوه|تلاوة|قارئ/i.test(q)) {
    const def = getDefaultStationForCategory('quran');
    console.log(`[play-media] no specific match — defaulting to "${def.name}"`);
    return NextResponse.json({
      content: `جاري تشغيل ${def.name}...`,
      mediaWidget: buildMediaWidget({
        source: 'radio',
        title: def.name,
        streamUrl: def.streamUrl,
        autoPlay: true,
      }),
    });
  }
  if (/أخبار|اخبار|news|نشرة/i.test(q)) {
    const def = getDefaultStationForCategory('news');
    return NextResponse.json({
      content: `جاري تشغيل ${def.name}...`,
      mediaWidget: buildMediaWidget({
        source: 'radio',
        title: def.name,
        streamUrl: def.streamUrl,
        autoPlay: true,
      }),
    });
  }
  if (/موسيقى|موسيقي|music|أغاني|اغاني|songs/i.test(q)) {
    const def = getDefaultStationForCategory('music');
    return NextResponse.json({
      content: `جاري تشغيل ${def.name}...`,
      mediaWidget: buildMediaWidget({
        source: 'radio',
        title: def.name,
        streamUrl: def.streamUrl,
        autoPlay: true,
      }),
    });
  }
  if (/رياضة|رياضه|sport|sports|كرة/i.test(q)) {
    const def = getDefaultStationForCategory('sports');
    return NextResponse.json({
      content: `جاري تشغيل ${def.name}...`,
      mediaWidget: buildMediaWidget({
        source: 'radio',
        title: def.name,
        streamUrl: def.streamUrl,
        autoPlay: true,
      }),
    });
  }

  // ── Truly no match — ask the user to specify ──
  // Returning a content message (not an HTTP error) keeps the chat flowing.
  return NextResponse.json({
    content:
      `مقدرش ألاقي محطة باسم "${query}". 🤔\n` +
      `جرّب تكتب اسم المحطة بالعربي أو الإنجليزي، مثلاً:\n` +
      `• "شغل إذاعة القرآن" — البث الرئيسي\n` +
      `• "شغل قرآن العجمي" أو "العفاسي" أو "ماهر المعيقلي"\n` +
      `• "شغل نجوم FM" أو "راديو هيتس"\n` +
      `• "شغل راديو الشرق" — الأخبار`,
    mediaWidget: null,
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
