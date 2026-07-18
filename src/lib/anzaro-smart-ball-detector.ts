import { db } from '@/lib/db'
import { executeIntent } from '@/lib/anzaro-control-engine'
import { resolveDeviceByAlias, executeDeviceAction, executeSceneByName, startMediaSession, controlMediaSession } from '@/lib/anzaro-control-engine'
import { complete, buildPersonalitySystemPrompt } from '@/lib/anzaro-llm'
import type { PersonalityTraits } from '@/lib/anzaro-types'

export interface SmartBallCommand {
  type: 'media_play' | 'media_stop' | 'media_pause' | 'media_resume' | 'device_on' | 'device_off' | 'scene'
  execute: (sink: (text: string) => void) => Promise<void>
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
        // We need the userId — extract from the request context (passed via header)
        // For now, stop all active sessions
        const active = await db.mediaSession.findFirst({
          where: { status: { in: ['playing', 'paused'] } },
          orderBy: { createdAt: 'desc' },
        })
        if (active) {
          await controlMediaSession(active.userId, 'stop')
          sink(`⏹ **تم إيقاف الراديو**\n\n${active.title} اتقفل. 🎯`)
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
  if (/(?:شغّل|شغل|play|ابدأ|ابدأ|تشغيل)/i.test(lower) &&
      /(?:قرآن|قران|راديو|radio|music|موسيقى|أناشيد|أنشودة|nasheed|quran|نجوم|إذاعة)/i.test(lower)) {
    return {
      type: 'media_play',
      execute: async (sink) => {
        // Search stations by query
        const stations = await db.radioStation.findMany({ where: { isActive: true } })
        let match = null
        if (/قرآن|قران|quran/i.test(lower)) {
          match = stations.find((s) => /quran|قرآن|قران/i.test(s.name) || s.category === 'quran')
        } else if (/نجوم|nogoum/i.test(lower)) {
          match = stations.find((s) => /nogoum|نجوم/i.test(s.name))
        } else if (/موسيقى|music/i.test(lower)) {
          match = stations.find((s) => s.category === 'music')
        } else if (/أناشيد|أنشودة|nasheed/i.test(lower)) {
          match = stations.find((s) => s.category === 'islamic' || /nasheed|أناشيد/i.test(s.name))
        }
        // Default to first quran station if "play quran"
        if (!match && /قرآن|قران|quran/i.test(lower)) {
          match = stations.find((s) => s.category === 'quran') || stations[0]
        }
        if (!match && stations.length > 0) {
          match = stations[0]
        }

        if (match) {
          // Need a userId — find any user with an active session, or use the first user
          const anyUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } })
          if (anyUser) {
            await startMediaSession({
              userId: anyUser.id,
              title: match.name,
              source: match.name,
              streamUrl: match.streamUrl,
              stationId: match.id,
              type: 'radio',
            })
            sink(`▶ **تم تشغيل ${match.name}**\n\nالراديو بيذيع دلوقتي. 🎵\nقول "اقفل الراديو" عشان توقفه.`)
          } else {
            sink('مقدرش أشغّل — لازم تسجل دخول الأول.')
          }
        } else {
          sink('مقدرش ألاقي محطة مناسبة. 🎵')
        }
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
  if (/(?:ولّع|ولع|افتح|شغّل|turn on|open|fire up|ابدأ)/i.test(lower) &&
      /(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت|light|tv|screen|ac|fan|curtain|softbox)/i.test(lower)) {
    const aliasMatch = lower.match(/(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت بوكس|السوفت|light|tv|screen|ac|fan|curtain|softbox|نور|لمبة|تكييف|مرور|ستارة)/)
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
      /(?:النور|اللمبة|الشاشة|التلفزيون|التكييف|المرور|الستارة|السوفت|light|tv|screen|ac|fan|curtain|softbox)/i.test(lower) &&
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
