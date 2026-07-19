import { db } from '@/lib/db'

// Seed default devices, radio stations, mood scenes, MCP tools, quick actions.
// Idempotent — safe to call multiple times.
export async function ensureSeedData() {
  const [deviceCount, radioCount, sceneCount, toolCount] = await Promise.all([
    db.device.count(),
    db.radioStation.count(),
    db.moodScene.count(),
    db.mcpTool.count(),
  ])

  const tasks: Promise<unknown>[] = []

  if (deviceCount === 0) {
    tasks.push(
      db.device.createMany({
        data: [
          {
            entityId: 'light.living_room',
            friendlyName: 'Living Room Light',
            domain: 'light',
            room: 'Living Room',
            state: 'off',
            attributesJson: JSON.stringify({ brightness: 0, color_temp: 4000 }),
            aliasesJson: JSON.stringify([
              { alias: 'النور', lang: 'ar' },
              { alias: 'اللمبة', lang: 'ar' },
              { alias: 'light', lang: 'en' },
            ]),
            icon: 'Lightbulb',
          },
          {
            entityId: 'light.office',
            friendlyName: 'Office Light',
            domain: 'light',
            room: 'Office',
            state: 'off',
            attributesJson: JSON.stringify({ brightness: 0, color_temp: 4000 }),
            aliasesJson: JSON.stringify([
              { alias: 'نور المكتب', lang: 'ar' },
              { alias: 'office', lang: 'en' },
            ]),
            icon: 'Lamp',
          },
          {
            entityId: 'media_player.living_room_tv',
            friendlyName: 'Living Room TV',
            domain: 'media_player',
            room: 'Living Room',
            state: 'off',
            attributesJson: JSON.stringify({ volume: 30 }),
            aliasesJson: JSON.stringify([
              { alias: 'الشاشة', lang: 'ar' },
              { alias: 'التلفزيون', lang: 'ar' },
              { alias: 'tv', lang: 'en' },
              { alias: 'screen', lang: 'en' },
            ]),
            icon: 'Tv',
          },
          {
            entityId: 'climate.living_room_ac',
            friendlyName: 'Living Room AC',
            domain: 'climate',
            room: 'Living Room',
            state: 'off',
            attributesJson: JSON.stringify({ temperature: 24, mode: 'cool', fan: 'auto' }),
            aliasesJson: JSON.stringify([
              { alias: 'التكييف', lang: 'ar' },
              { alias: 'ac', lang: 'en' },
            ]),
            icon: 'Wind',
          },
          {
            entityId: 'cover.bedroom_curtains',
            friendlyName: 'Bedroom Curtains',
            domain: 'cover',
            room: 'Bedroom',
            state: 'closed',
            attributesJson: JSON.stringify({ position: 0 }),
            aliasesJson: JSON.stringify([
              { alias: 'الستارة', lang: 'ar' },
              { alias: 'curtains', lang: 'en' },
            ]),
            icon: 'Blinds',
          },
          {
            entityId: 'fan.bedroom',
            friendlyName: 'Bedroom Fan',
            domain: 'fan',
            room: 'Bedroom',
            state: 'off',
            attributesJson: JSON.stringify({ speed: 50 }),
            aliasesJson: JSON.stringify([
              { alias: 'المرور', lang: 'ar' },
              { alias: 'fan', lang: 'en' },
            ]),
            icon: 'Fan',
          },
          {
            entityId: 'switch.studio_softbox',
            friendlyName: 'Studio Softbox',
            domain: 'switch',
            room: 'Studio',
            state: 'off',
            attributesJson: JSON.stringify({}),
            aliasesJson: JSON.stringify([
              { alias: 'السوفت بوكس', lang: 'ar' },
              { alias: 'softbox', lang: 'en' },
            ]),
            icon: 'Lightbulb',
          },
          {
            entityId: 'switch.phone_dnd',
            friendlyName: 'Phone Do Not Disturb',
            domain: 'switch',
            room: 'Phone',
            state: 'off',
            attributesJson: JSON.stringify({}),
            aliasesJson: JSON.stringify([
              { alias: 'عدم الإزعاج', lang: 'ar' },
              { alias: 'dnd', lang: 'en' },
            ]),
            icon: 'BellOff',
          },
        ],
      })
    )
  }

  if (radioCount === 0) {
    tasks.push(
      db.radioStation.createMany({
        data: [
          // ── Quran stations (all URLs VERIFIED 2025-01-30) ──
          {
            name: 'إذاعة القرآن الكريم',
            category: 'quran',
            streamUrl: 'https://qurango.net/radio/tarateel',
            logo: '',
            sortOrder: 1,
          },
          {
            name: 'إذاعة القرآن الكريم من القاهرة',
            category: 'quran',
            // Official ERTU Quran Radio Cairo stream (via radiojar) — VERIFIED 200 OK
            streamUrl: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
            logo: '',
            sortOrder: 2,
          },
          {
            name: 'إذاعة مشاري العفاسي',
            category: 'quran',
            streamUrl: 'https://qurango.net/radio/mishary_alafasi',
            logo: '',
            sortOrder: 3,
          },
          {
            name: 'إذاعة أحمد العجمي',
            category: 'quran',
            streamUrl: 'https://qurango.net/radio/ahmad_alajmy',
            logo: '',
            sortOrder: 4,
          },
          {
            name: 'إذاعة ماهر المعيقلي',
            category: 'quran',
            streamUrl: 'https://qurango.net/radio/maher_almuaiqly',
            logo: '',
            sortOrder: 5,
          },
          // ── Music stations (all URLs VERIFIED 2025-01-30 via radio-browser.info) ──
          {
            name: 'نجوم FM',
            category: 'music',
            // Nogoum FM via zeno.fm — VERIFIED 200 OK
            streamUrl: 'https://stream.zeno.fm/qb1zvsykm98uv',
            logo: '',
            sortOrder: 6,
          },
          {
            name: 'راديو هيتس 88.2',
            category: 'music',
            streamUrl: 'https://radiohits882.radioca.st/;',
            logo: '',
            sortOrder: 7,
          },
          {
            name: 'راديو 9090',
            category: 'music',
            streamUrl: 'https://9090streaming.mobtada.com/9090FMEGYPT',
            logo: '',
            sortOrder: 8,
          },
          // ── News ──
          {
            name: 'راديو الشرق مع بلومبرج',
            category: 'news',
            // Radio Asharq — VERIFIED 200 OK + audio/aacp
            streamUrl: 'https://l3.itworkscdn.net/asharqradioalive/asharqradioa/icecast.audio',
            logo: '',
            sortOrder: 9,
          },
        ],
      })
    )
  }

  if (sceneCount === 0) {
    tasks.push(
      db.moodScene.createMany({
        data: [
          {
            name: 'Focus Mode',
            nameAr: 'وضع التركيز',
            description: 'Optimized for deep work — bright office light, DND on, AC cool.',
            triggerPhrase: 'focus',
            icon: 'Brain',
            color: 'blue',
            actionsJson: JSON.stringify([
              { entityId: 'light.office', action: 'turn_on', params: { brightness: 100, color_temp: 5000 } },
              { entityId: 'switch.phone_dnd', action: 'turn_on' },
              { entityId: 'climate.living_room_ac', action: 'set_state', params: { temperature: 23, mode: 'cool' } },
              { entityId: 'cover.bedroom_curtains', action: 'set_state', params: { position: 100 } },
            ]),
          },
          {
            name: 'Cinema Mode',
            nameAr: 'وضع السينما',
            description: 'Dim living room, TV on, AC quiet — movie night.',
            triggerPhrase: 'cinema',
            icon: 'Clapperboard',
            color: 'violet',
            actionsJson: JSON.stringify([
              { entityId: 'light.living_room', action: 'set_state', params: { brightness: 20, color_temp: 3000 } },
              { entityId: 'media_player.living_room_tv', action: 'turn_on', params: { volume: 50 } },
              { entityId: 'climate.living_room_ac', action: 'set_state', params: { temperature: 24, fan: 'low' } },
            ]),
          },
          {
            name: 'Business Recording',
            nameAr: 'وضع التسجيل',
            description: 'Studio softbox on, DND on, AC quiet — record your video.',
            triggerPhrase: 'recording',
            icon: 'Video',
            color: 'amber',
            actionsJson: JSON.stringify([
              { entityId: 'switch.studio_softbox', action: 'turn_on' },
              { entityId: 'switch.phone_dnd', action: 'turn_on' },
              { entityId: 'light.office', action: 'set_state', params: { brightness: 60 } },
              { entityId: 'climate.living_room_ac', action: 'set_state', params: { fan: 'low' } },
            ]),
          },
          {
            name: 'Sleep Mode',
            nameAr: 'وضع النوم',
            description: 'All lights off, curtains closed, AC cool — good night.',
            triggerPhrase: 'sleep',
            icon: 'Moon',
            color: 'indigo',
            actionsJson: JSON.stringify([
              { entityId: 'light.living_room', action: 'turn_off' },
              { entityId: 'light.office', action: 'turn_off' },
              { entityId: 'media_player.living_room_tv', action: 'turn_off' },
              { entityId: 'cover.bedroom_curtains', action: 'set_state', params: { position: 0 } },
              { entityId: 'climate.living_room_ac', action: 'set_state', params: { temperature: 22, fan: 'low' } },
            ]),
          },
          {
            name: 'Business Focus',
            nameAr: 'تركيز الأعمال',
            description: 'High-contrast office light, DND on, bright and alert — leadership energy.',
            triggerPhrase: 'business',
            icon: 'Briefcase',
            color: 'emerald',
            actionsJson: JSON.stringify([
              { entityId: 'light.office', action: 'set_state', params: { brightness: 100, color_temp: 6000 } },
              { entityId: 'switch.phone_dnd', action: 'turn_on' },
              { entityId: 'fan.bedroom', action: 'turn_off' },
            ]),
          },
        ],
      })
    )
  }

  if (toolCount === 0) {
    tasks.push(
      db.mcpTool.createMany({
        data: [
          { name: 'radio_play', description: 'Play a radio station by name or city', category: 'media', endpoint: '/api/media/control', inputSchemaJson: JSON.stringify({ query: 'string' }), isLocal: true, latencyMs: 12 },
          { name: 'radio_stop', description: 'Stop the currently playing radio stream', category: 'media', endpoint: '/api/media/control', isLocal: true, latencyMs: 8 },
          { name: 'device_toggle', description: 'Toggle a Home Assistant device on/off by alias', category: 'home', endpoint: '/api/devices/control', inputSchemaJson: JSON.stringify({ alias: 'string', action: 'string' }), isLocal: true, latencyMs: 5 },
          { name: 'scene_execute', description: 'Execute a mood scene by name', category: 'home', endpoint: '/api/scenes/execute', inputSchemaJson: JSON.stringify({ name: 'string' }), isLocal: true, latencyMs: 20 },
          { name: 'web_search', description: 'Search the web for real-time information', category: 'search', endpoint: '/api/mcp/search', isLocal: false, latencyMs: 800 },
          { name: 'prayer_times', description: 'Get Islamic prayer times for a city', category: 'data', endpoint: '/api/mcp/prayer', isLocal: false, latencyMs: 400 },
          { name: 'weather', description: 'Get current weather for a location', category: 'data', endpoint: '/api/mcp/weather', isLocal: false, latencyMs: 500 },
          { name: 'memory_recall', description: 'Recall a stored user memory fact', category: 'utility', endpoint: '/api/personality/profile', isLocal: true, latencyMs: 10 },
        ],
      })
    )
  }

  await Promise.all(tasks)
}
