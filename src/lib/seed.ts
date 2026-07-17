import { db } from './db'

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
          {
            name: 'Quran Radio Cairo',
            nameAr: 'إذاعة القرآن الكريم - القاهرة',
            category: 'quran',
            city: 'Cairo',
            country: 'Egypt',
            streamUrl: 'https://qurango.net/radio/taratee',
            description: 'Live Quran recitation from Cairo',
            logoUrl: '',
          },
          {
            name: 'Holy Quran Radio',
            nameAr: 'إذاعة القرآن الكريم',
            category: 'quran',
            country: 'Saudi Arabia',
            streamUrl: 'https://qurango.net/radio/mix',
            description: 'Mixed recitations from renowned qaris',
            logoUrl: '',
          },
          {
            name: 'Nogoum FM',
            nameAr: 'نجوم إف إم',
            category: 'music',
            city: 'Cairo',
            country: 'Egypt',
            streamUrl: 'https://nogoumfm.net/stream',
            description: 'Egyptian hits and pop music',
            logoUrl: '',
          },
          {
            name: 'Radio Masr',
            nameAr: 'راديو مصر',
            category: 'news',
            city: 'Cairo',
            country: 'Egypt',
            streamUrl: 'https://streaming.radionz.net/radiomasr',
            description: 'Egyptian news and talk',
            logoUrl: '',
          },
          {
            name: 'Mawaly Nasheeds',
            nameAr: 'أناشيد',
            category: 'nasheed',
            country: 'Egypt',
            streamUrl: 'https://qurango.net/radio/afasy',
            description: 'Peaceful nasheed and mishary recitations',
            logoUrl: '',
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
