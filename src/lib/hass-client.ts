/**
 * Home Assistant API Client
 * =========================
 * V.14 Defensive — all calls guarded with optional chaining + try/catch.
 * Reads HASS_URL and HASS_TOKEN from environment variables.
 * Falls back to mock data when HASS is not configured (cloud-only deploy).
 */

export interface HassEntity {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

export interface HassDevice {
  entity_id: string
  friendly_name: string
  domain: string  // light, switch, sensor, climate, media_player, etc.
  state: string   // on, off, playing, idle, numeric value for sensors
  attributes: Record<string, unknown>
  icon?: string
}

export interface HassConfig {
  url: string | null
  token: string | null
  isConfigured: boolean
}

export function getHassConfig(): HassConfig {
  const url = process.env.HASS_URL || process.env.HOME_ASSISTANT_URL || null
  const token = process.env.HASS_TOKEN || process.env.HOME_ASSISTANT_TOKEN || null
  return {
    url,
    token,
    isConfigured: !!(url && token),
  }
}

// ─── Fetch all entities from HASS ───
export async function fetchHassEntities(): Promise<HassDevice[]> {
  const config = getHassConfig()

  // V.14: Guard — if HASS not configured, return mock devices
  if (!config?.url || !config?.token) {
    return getMockDevices()
  }

  try {
    const res = await fetch(`${config.url}/api/states`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      console.warn('[HASS] Fetch failed:', res.status)
      return getMockDevices()
    }

    const entities: HassEntity[] = await res.json()

    // Filter to controllable domains + map to HassDevice
    const controllableDomains = ['light', 'switch', 'climate', 'media_player', 'cover', 'fan', 'sensor']
    return entities
      .filter((e) => {
        const domain = e.entity_id.split('.')[0]
        return controllableDomains.includes(domain)
      })
      .map((e) => ({
        entity_id: e.entity_id,
        friendly_name: (e.attributes?.friendly_name as string) || e.entity_id,
        domain: e.entity_id.split('.')[0],
        state: e.state,
        attributes: e.attributes || {},
        icon: e.attributes?.icon as string | undefined,
      }))
  } catch (err) {
    console.error('[HASS] Error fetching entities:', err)
    return getMockDevices()
  }
}

// ─── Toggle a HASS entity (turn_on / turn_off / toggle) ───
export async function toggleHassEntity(
  entityId: string,
  action: 'turn_on' | 'turn_off' | 'toggle'
): Promise<{ success: boolean; newState?: string; error?: string }> {
  const config = getHassConfig()

  // V.14: Guard — mock mode
  if (!config?.url || !config?.token) {
    // Simulate toggle in mock mode
    const isOn = action === 'turn_on' || (action === 'toggle' && Math.random() > 0.5)
    return { success: true, newState: isOn ? 'on' : 'off' }
  }

  try {
    const domain = entityId.split('.')[0]
    const service = action

    const res = await fetch(`${config.url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return { success: false, error: `HASS returned ${res.status}` }
    }

    // Fetch the updated state
    const stateRes = await fetch(`${config.url}/api/states/${entityId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(3000),
    })

    if (stateRes.ok) {
      const stateData = await stateRes.json()
      return { success: true, newState: stateData.state }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown HASS error' }
  }
}

// ─── Set entity state (brightness, temperature, etc.) ───
export async function setHassState(
  entityId: string,
  service: string,
  serviceData: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const config = getHassConfig()

  if (!config?.url || !config?.token) {
    return { success: true } // Mock mode — pretend success
  }

  try {
    const domain = entityId.split('.')[0]
    const res = await fetch(`${config.url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId, ...serviceData }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return { success: false, error: `HASS returned ${res.status}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown HASS error' }
  }
}

// ─── Dynamic Matrix Adaptation ───
// Maps the user's Identity Matrix to recommended environment states
export interface MatrixEnvironmentSuggestion {
  entity_id: string
  service: string
  service_data: Record<string, unknown>
  reason: string
  reasonAr: string
  priority: 'high' | 'medium' | 'low'
}

export function getMatrixEnvironmentSuggestions(matrix: {
  traits?: Record<string, number>
  cognitiveStyle?: string
  darkTriad?: { machiavellianism: number; narcissism: number; psychopathy: number }
}): MatrixEnvironmentSuggestion[] {
  const suggestions: MatrixEnvironmentSuggestion[] = []
  const traits = matrix?.traits || {}
  const stressProxy = Math.max(0, 100 - (traits.resilience || 50) - (traits.emotionalIntelligence || 50) / 2)

  // High stress → warm dim lights for relaxation
  if (stressProxy > 60) {
    suggestions.push({
      entity_id: 'light.living_room',
      service: 'turn_on',
      service_data: { brightness_pct: 30, color_temp: 3000 },
      reason: 'High stress detected — warm dim lights for relaxation',
      reasonAr: 'ضغط عالي — إضاءة دافئة خافتة للاسترخاء',
      priority: 'high',
    })
    suggestions.push({
      entity_id: 'climate.living_room_ac',
      service: 'set_temperature',
      service_data: { temperature: 23, fan_mode: 'low' },
      reason: 'Cool quiet environment for stress relief',
      reasonAr: 'بيئة باردة هادئة لتخفيف الضغط',
      priority: 'medium',
    })
  }

  // Analytical profile → bright cool lights for focus
  if (matrix?.cognitiveStyle === 'analytical') {
    suggestions.push({
      entity_id: 'light.office',
      service: 'turn_on',
      service_data: { brightness_pct: 100, color_temp: 5000 },
      reason: 'Analytical profile — bright cool lights for focus',
      reasonAr: 'شخصية تحليلية — إضاءة ساطعة باردة للتركيز',
      priority: 'medium',
    })
  }

  // Creative profile → warm ambient lighting
  if (matrix?.cognitiveStyle === 'creative') {
    suggestions.push({
      entity_id: 'light.living_room',
      service: 'turn_on',
      service_data: { brightness_pct: 60, rgb_color: [255, 180, 100] },
      reason: 'Creative profile — warm ambient lighting',
      reasonAr: 'شخصية إبداعية — إضاءة محيطة دافئة',
      priority: 'medium',
    })
  }

  // High ambition + leadership → DND on, office lights at 100%
  if ((traits.ambition || 0) > 75 && (traits.leadership || 0) > 75) {
    suggestions.push({
      entity_id: 'switch.phone_dnd',
      service: 'turn_on',
      service_data: {},
      reason: 'Leader profile — DND enabled for deep work',
      reasonAr: 'شخصية قيادية — تفعيل عدم الإزعاج للشغل المركّز',
      priority: 'high',
    })
  }

  // High dark triad → cool blue lights (grounding effect)
  if (matrix?.darkTriad && (matrix.darkTriad.machiavellianism > 70 || matrix.darkTriad.narcissism > 70)) {
    suggestions.push({
      entity_id: 'light.living_room',
      service: 'turn_on',
      service_data: { brightness_pct: 50, rgb_color: [100, 150, 255] },
      reason: 'Grounding cool blue for emotional regulation',
      reasonAr: 'أزرق بارد للتأريض العاطفي',
      priority: 'low',
    })
  }

  return suggestions
}

// ─── Mock Devices (for cloud-only deploy without HASS) ───
function getMockDevices(): HassDevice[] {
  return [
    {
      entity_id: 'light.living_room',
      friendly_name: 'Living Room Light',
      domain: 'light',
      state: 'off',
      attributes: { brightness: 0, color_temp: 4000 },
    },
    {
      entity_id: 'light.office',
      friendly_name: 'Office Light',
      domain: 'light',
      state: 'off',
      attributes: { brightness: 0, color_temp: 4000 },
    },
    {
      entity_id: 'switch.smart_plug',
      friendly_name: 'Smart Plug',
      domain: 'switch',
      state: 'off',
      attributes: {},
    },
    {
      entity_id: 'switch.phone_dnd',
      friendly_name: 'Phone DND',
      domain: 'switch',
      state: 'off',
      attributes: {},
    },
    {
      entity_id: 'climate.living_room_ac',
      friendly_name: 'Living Room AC',
      domain: 'climate',
      state: 'off',
      attributes: { temperature: 24, fan_mode: 'auto' },
    },
    {
      entity_id: 'sensor.temperature',
      friendly_name: 'Temperature',
      domain: 'sensor',
      state: '24.5',
      attributes: { unit_of_measurement: '°C' },
    },
    {
      entity_id: 'sensor.humidity',
      friendly_name: 'Humidity',
      domain: 'sensor',
      state: '55',
      attributes: { unit_of_measurement: '%' },
    },
    {
      entity_id: 'media_player.living_room_tv',
      friendly_name: 'Living Room TV',
      domain: 'media_player',
      state: 'off',
      attributes: { volume_level: 0.3 },
    },
  ]
}
