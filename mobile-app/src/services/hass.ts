/**
 * Anzaro Mobile — HASS Service
 * V.14: All calls guarded with optional chaining + try/catch + AbortSignal.timeout.
 * Falls back to mock devices when HASS is not configured.
 */
import { HASS_URL, HASS_TOKEN, isHassConfigured, type HassDevice } from '../config';

const CONTROLLABLE_DOMAINS = ['light', 'switch', 'climate', 'media_player', 'cover', 'fan'];

export async function fetchHassDevices(): Promise<HassDevice[]> {
  // V.14: Guard — mock mode when HASS not configured
  if (!isHassConfigured || !HASS_URL || !HASS_TOKEN) {
    return getMockDevices();
  }

  try {
    const res = await fetch(`${HASS_URL}/api/states`, {
      headers: {
        Authorization: `Bearer ${HASS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res?.ok) {
      console.warn('[HASS] Fetch failed:', res?.status);
      return getMockDevices();
    }

    const entities: any[] = await res.json();
    if (!Array.isArray(entities)) return getMockDevices();

    return entities
      .filter((e) => {
        const domain = e?.entity_id?.split('.')?.[0] ?? '';
        return CONTROLLABLE_DOMAINS.includes(domain);
      })
      .map((e) => ({
        entity_id: e?.entity_id ?? 'unknown',
        friendly_name: e?.attributes?.friendly_name ?? e?.entity_id ?? 'Unknown',
        domain: e?.entity_id?.split('.')?.[0] ?? 'unknown',
        state: e?.state ?? 'unknown',
        attributes: e?.attributes ?? {},
      }));
  } catch (err) {
    console.error('[HASS] Error:', err);
    return getMockDevices();
  }
}

export async function toggleHassDevice(
  entityId: string,
  action: 'turn_on' | 'turn_off' | 'toggle'
): Promise<{ success: boolean; newState?: string; error?: string }> {
  if (!isHassConfigured || !HASS_URL || !HASS_TOKEN) {
    const isOn = action === 'turn_on' || (action === 'toggle' && Math.random() > 0.5);
    return { success: true, newState: isOn ? 'on' : 'off' };
  }

  try {
    const domain = entityId?.split('.')?.[0] ?? 'homeassistant';
    const res = await fetch(`${HASS_URL}/api/services/${domain}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HASS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res?.ok) {
      return { success: false, error: `HASS returned ${res?.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

// ─── Mock Devices ───
function getMockDevices(): HassDevice[] {
  return [
    { entity_id: 'light.living_room', friendly_name: 'Living Room Light', domain: 'light', state: 'off', attributes: { brightness: 0 } },
    { entity_id: 'light.office', friendly_name: 'Office Light', domain: 'light', state: 'off', attributes: { brightness: 0 } },
    { entity_id: 'switch.smart_plug', friendly_name: 'Smart Plug', domain: 'switch', state: 'off', attributes: {} },
    { entity_id: 'switch.phone_dnd', friendly_name: 'Phone DND', domain: 'switch', state: 'off', attributes: {} },
    { entity_id: 'climate.living_room_ac', friendly_name: 'Living Room AC', domain: 'climate', state: 'off', attributes: { temperature: 24 } },
    { entity_id: 'sensor.temperature', friendly_name: 'Temperature', domain: 'sensor', state: '24.5', attributes: { unit_of_measurement: '°C' } },
    { entity_id: 'sensor.humidity', friendly_name: 'Humidity', domain: 'sensor', state: '55', attributes: { unit_of_measurement: '%' } },
    { entity_id: 'media_player.living_room_tv', friendly_name: 'Living Room TV', domain: 'media_player', state: 'off', attributes: {} },
  ];
}
