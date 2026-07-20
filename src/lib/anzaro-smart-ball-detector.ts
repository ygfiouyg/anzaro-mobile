import { db } from '@/lib/db'
import { executeIntent } from '@/lib/anzaro-control-engine'
import { resolveDeviceByAlias, executeDeviceAction, executeSceneByName, startMediaSession, controlMediaSession } from '@/lib/anzaro-control-engine'
import { complete, buildPersonalitySystemPrompt } from '@/lib/anzaro-llm'
import type { PersonalityTraits } from '@/lib/anzaro-types'
import {
  matchStation,
  getDefaultStationForCategory,
  normalizeArabic,
} from '@/lib/radio-stations'

export interface SmartBallCommand {
  type: 'media_play' | 'media_stop' | 'media_pause' | 'media_resume' | 'device_on' | 'device_off' | 'scene'
  execute: (sink: (data: string | Record<string, unknown>) => void) => Promise<void>
}

/**
 * Pattern-based Smart Ball command detector.
 * Detects media/device/scene commands in Arabic and English without an LLM call
 * (for sub-100ms response). Falls back to LLM-based intent detection if needed.
 *
 * Supported patterns:
 *  - "شغّل قرآن" / "شغل راديو" / "play quran" → media_play
 *  - "اقفل الراديو" / "وقف الأغنية" / "stop" → media_stop
 *  - "وقّف مؤقت" / "pause" → media_pause
 *  - "كمل" / "resume" → media_resume
 *  - "ولّع النور" / "افتح الشاشة" / "turn on light" → device_on
 *  - "اقفل النور" / "طفي التكييف" / "turn off" → device_off
 *  - "وضع التركيز" / "cinema mode" / "focus" → scene
 */
export async function detectSmartBallCommand(message: string): Promise<SmartBallCommand | null> {
  const msg = message.trim()
  const lower = msg.toLowerCase()

  // ── Media: STOP ──
  if (/(?:اقفل|قفل|وقف|أوقف|إيقاف|اطفي|طفّي|stop|turn it off|kill)/i.test(lower) &&
      /(?:الراديو|الأغنية|اغنية|القرآن|القران|radio|song|music|quran|stream|الصوت|الموسيقى)/i.test(lower)) {
    return {
      type: 'media_stop',
      execute: async (sink) => {
        // Find the user's active session
        const active = await db.mediaSession.findFirst({
          where: { status: { in: ['playing', 'paused'] } },
          orderBy: { createdAt: 'desc' },
        })
        if (active) {
          await controlMediaSession(active.userId, 'stop')
          sink(`⏹ **تم إيقاف الراديو**\n\n${active.title} اتقفل. 🎯`)
          // ── V.15: Send stopMedia SSE event so the frontend closes the NowPlayingBar ──
          sink({ stopMedia: true })
        } else {
          sink('مفيش راديو شغّال دلوقتي. 🎵')
        }
      },
    }
  }

  // ── Media: PAUSE ──
  if (/(?:وقف|توقف|pause|paused|موقّف)/i.test(lower) &&
      !/(?:اقفل|قفل|شغّل|كمل|resume)/i.test(lower) &&
      (/(?:الراديو|الأغنية|radio|song|music|الصوت)/i.test(lower) || lower === 'pause')) {
    return {
      type: 'media_pause',
      execute: async (sink) => {
        const active = await db.mediaSession.findFirst({
          where: { status: 'playing' },
          orderBy: { createdAt: 'desc' },
        })
        if (active) {
          await controlMediaSession(active.userId, 'pause')
          sink(`⏸ **اتوقف مؤقتاً**\n\n${active.title} — دوس "كمل" عشان ترجعه.`)
        } else {
          sink('مفيش حاجة شغّالة دلوقتي. 🎵')
        }
      },
    }
  }

  // ── Media: RESUME ──
  if (/(?:كمل|استكمل|resume|continue|رجّع|رجع)/i.test(lower) &&
      (/(?:الراديو|الأغنية|radio|song|music|الصوت)/i.test(lower) || /(?:كمل|resume|continue)/i.test(lower))) {
    return {
      type: 'media_resume',
      execute: async (sink) => {
        const active = await db.mediaSession.findFirst({
          where: { status: 'paused' },
          orderBy: { createdAt: 'desc' },
        })
        if (active) {
          await controlMediaSession(active.userId, 'resume')
          sink(`▶ **كملنا**\n\n${active.title} رجع يشتغل. 🎵`)
        } else {
          sink('مفيش حاجة متوقفة مؤقتاً. 🎵')
        }
      },
    }
  }

  // ── Media: PLAY ──
  // Expanded to match any radio station name (not just قرآن/نجوم).
  // The matcher now searches BOTH DB stations and the shared BUILTIN_STATIONS
  // list (qurango reciters, Nogoum FM, Radio Hits Cairo, Asharq news, etc.).
  // If the user said "شغل قرآن" (generic), we default to the main Quran stream.
  // If the user said "شغل محطة كذا" with a name we don't recognize, we DON'T
  // match here — we return null so the request falls through to the LLM-based
  // media-intent detector, which has more flexibility (and can call the
  // /api/ai/play-media endpoint with a proper search).
  if (/(?:شغّل|شغل|play|ابدأ|ابدأ|تشغيل)/i.test(lower) &&
      /(?:قرآن|قران|راديو|radio|music|موسيقى|أناشيد|أنشودة|nasheed|quran|نجوم|إذاعة|اذاعة|محطة|محطه|station|إليسا|دياب|هيتس|9090|أخبار|اخبار|news|رياضة|رياضه|sport)/i.test(lower)) {
    return {
      type: 'media_play',
      execute: async (sink) => {
        // ── Step 1: Try DB stations (admin-managed) ──
        let dbStations: any[] = []
        try {
          dbStations = await db.radioStation.findMany({ where: { isActive: true } })
        } catch { /* DB not ready */ }

        // ── Step 2: Search DB stations with the shared matcher ──
        // We pass the FULL message (not just lowercased) so Arabic normalization works.
        let match: { name: string; streamUrl: string; category?: string; id?: string } | null = null

        if (dbStations.length > 0) {
          // Inline search against DB rows using the shared normalizeArabic.
          const normQ = normalizeArabic(message)
          const qTokens = normQ.split(' ').filter((t) => t.length > 1)
          const GENERIC = new Set([
            'شغل', 'شغلى', 'شغلي', 'استمع', 'اسمع', 'افتح', 'افتحلي', 'play',
            'قرآن', 'قران', 'quran', 'القرآن', 'القران', 'الكريم', 'من', 'ال',
            'محطة', 'محطه', 'station', 'radio', 'راديو', 'إذاعة', 'اذاعة', 'اذاعه',
            'fm', 'اف ام', 'لي', 'بقا', 'عشان', 'لو', 'سريع',
          ])
          let bestDb: any = null
          let bestDbScore = 0
          for (const s of dbStations) {
            const normName = normalizeArabic(s.name || '')
            let score = 0
            for (const t of qTokens) {
              if (GENERIC.has(t)) continue
              if (normName.includes(t)) score += 20
            }
            if (normQ === normName) score += 100
            else if (normName && (normName.includes(normQ) || normQ.includes(normName))) score += 25
            if (score > bestDbScore) { bestDbScore = score; bestDb = s }
          }
          if (bestDb && bestDbScore >= 15) {
            match = { name: bestDb.name, streamUrl: bestDb.streamUrl, category: bestDb.category, id: bestDb.id }
            console.log(`[smart-ball] DB station match: "${bestDb.name}" (score=${bestDbScore})`)
          }
        }

        // ── Step 3: Fall back to BUILTIN_STATIONS via the shared matcher ──
        if (!match) {
          const builtinMatch = matchStation(message, /* minScore */ 15)
          if (builtinMatch) {
            match = builtinMatch
            console.log(`[smart-ball] BUILTIN station match: "${builtinMatch.name}"`)
          }
        }

        // ── Step 4: Generic category fallback ──
        // "شغل قرآن" → main Quran stream. "شغل أخبار" → Asharq news.
        if (!match) {
          if (/قرآن|قران|quran/i.test(lower)) {
            const def = getDefaultStationForCategory('quran')
            match = def
            console.log(`[smart-ball] generic Quran → default "${def.name}"`)
          } else if (/أخبار|اخبار|news/i.test(lower)) {
            match = getDefaultStationForCategory('news')
          } else if (/موسيقى|موسيقي|music|أغاني|اغاني/i.test(lower)) {
            match = getDefaultStationForCategory('music')
          } else if (/رياضة|رياضه|sport|sports|كرة/i.test(lower)) {
            match = getDefaultStationForCategory('sports')
          }
        }

        // ── Step 5: If still no match, return null from execute() ──
        // The caller (chat stream) will fall through to LLM-based detection
        // which calls /api/ai/play-media (more search options).
        if (!match) {
          sink(`مقدرش ألاقي محطة تطابق "${message.trim()}". 🎵\n` +
               `جرّب تكتب اسم المحطة بالعربي أو الإنجليزي، مثلاً:\n` +
               `• "شغل إذاعة القرآن" — البث الرئيسي\n` +
               `• "شغل قرآن العجمي" أو "العفاسي" أو "ماهر المعيقلي"\n` +
               `• "شغل نجوم FM" أو "راديو هيتس"\n` +
               `• "شغل راديو الشرق" — الأخبار`)
          return
        }

        // Need a userId — find any user with an active session, or use the first user
        const anyUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } })
        if (!anyUser) {
          sink('مقدرش أشغّل — لازم تسجل دخول الأول.')
          return
        }

        // Stream progressively for a more natural feel
        sink('▶ ')
        await new Promise((r) => setTimeout(r, 100))
        sink(`**تم تشغيل ${match.name}**\n\n`)
        await new Promise((r) => setTimeout(r, 150))
        sink('الراديو بيذيع دلوقتي. 🎵\n')
        await new Promise((r) => setTimeout(r, 100))
        sink(`قول "اقفل الراديو" عشان توقفه.`)

        // Execute the actual media session start
        await startMediaSession({
          userId: anyUser.id,
          title: match.name,
          source: match.name,
          streamUrl: match.streamUrl,
          stationId: (match as any).id,
          type: 'radio',
        })

        // ── V.15: Send mediaWidget SSE event so the frontend opens the NowPlayingBar ──
        // This is the critical payload that triggers the audio player UI + auto-play.
        sink({
          mediaWidget: {
            type: 'audio',
            source: 'radio',
            title: match.name,
            streamUrl: match.streamUrl,
            mimeType: 'audio/mpeg',
            autoPlay: true,
          },
        })
      },
    }
  }

  // ── Scene execution ──
  const sceneMatch = lower.match(/(?:وضع|مشهد|scene|mode)\s*(?:ال)?(.+?)(?:\s*$|\s*من فضلك)/)
  if (sceneMatch || /(?:focus|cinema|sleep|business|recording|تركيز|سينما|نوم|أعمال|تسجيل)/i.test(lower)) {
    const sceneName = sceneMatch?.[1] || lower
    if (/(?:تركيز|focus|تركيز)/i.test(lower) ||
        /(?:سينما|cinema)/i.test(lower) ||
        /(?:نوم|sleep)/i.test(lower) ||
        /(?:أعمال|business)/i.test(lower) ||
        /(?:تسجيل|recording)/i.test(lower) ||
        sceneMatch) {
      return {
        type: 'scene',
        execute: async (sink) => {
          const r = await executeSceneByName(sceneName)
          if (r.ok && r.scene) {
            const actions = JSON.parse(r.scene.actionsJson || '[]')
            sink(`🎭 **تم تفعيل ${r.scene.nameAr}**\n\n${r.scene.description}\n\nنفّذت ${actions.length} إجراء على أجهزتك. ✅`)
          } else {
            sink(`مقدرش ألاقي مشهد باسم "${sceneName}". 🎭\nجرّب: وضع التركيز، وضع السينما، وضع النوم`)
          }
        },
      }
    }
  }

  // ── Device: TURN ON ──
  // V.20: Fixed regex — "ac" was matching "spectroscopic", "organic", etc.
  // Now requires word boundary or Arabic context to avoid false triggers.
  if (/(?:ولّع|ولع|افتح|شغّل|turn on|open|fire up|ابدأ)/i.test(lower) &&
      /(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت|light|tv|screen|\bac\b|fan|curtain|softbox)/i.test(lower) &&
      !/(?:محاضرة|spectroscop|organic|analysis|chemistry|تحليل|كيمياء|ملخص|لخص|محتوى|نص)/i.test(lower)) {
    const aliasMatch = lower.match(/(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت بوكس|السوفت|light|tv|screen|\bac\b|fan|curtain|softbox|نور|لمبة|تكييف|مرور|ستارة)/)
    const alias = aliasMatch?.[0] || ''
    return {
      type: 'device_on',
      execute: async (sink) => {
        const deviceId = await resolveDeviceByAlias(alias)
        if (deviceId) {
          const r = await executeDeviceAction(deviceId, 'turn_on')
          const dev = await db.device.findUnique({ where: { id: deviceId } })
          if (r.ok) {
            sink(`💡 **تم تشغيل ${dev?.friendlyName}**\n\n${dev?.entityId} → الحالة: "on" ✅`)
          } else {
            sink(`مقدرش أشغّل ${dev?.friendlyName}. ❌`)
          }
        } else {
          sink(`مقدرش ألاقي جهاز باسم "${alias}". 🤔\nتقدر تضيف أسماء بديلة من لوحة الكرة الذكية.`)
        }
      },
    }
  }

  // ── Device: TURN OFF ──
  if (/(?:اقفل|قفل|اطفي|طفّي|أطفأ|turn off|close|kill)/i.test(lower) &&
      /(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت|light|tv|screen|\bac\b|fan|curtain|softbox)/i.test(lower) &&
      !/(?:راديو|أغنية|radio|song|music|قرآن|قران)/i.test(lower)) {
    const aliasMatch = lower.match(/(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت بوكس|السوفت|light|tv|screen|ac|fan|curtain|softbox|نور|لمبة|تكييف|مرور|ستارة)/)
    const alias = aliasMatch?.[0] || ''
    return {
      type: 'device_off',
      execute: async (sink) => {
        const deviceId = await resolveDeviceByAlias(alias)
        if (deviceId) {
          const r = await executeDeviceAction(deviceId, 'turn_off')
          const dev = await db.device.findUnique({ where: { id: deviceId } })
          if (r.ok) {
            sink(`🔌 **تم إيقاف ${dev?.friendlyName}**\n\n${dev?.entityId} → الحالة: "off" ✅`)
          } else {
            sink(`مقدرش أطفي ${dev?.friendlyName}. ❌`)
          }
        } else {
          sink(`مقدرش ألاقي جهاز باسم "${alias}". 🤔`)
        }
      },
    }
  }

  return null
}
