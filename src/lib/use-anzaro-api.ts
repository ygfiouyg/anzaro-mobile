'use client'

import { useAuthStore } from '@/store/auth-store'

/**
 * Returns a fetch wrapper that automatically attaches the Bearer token
 * from the auth store to all Smart Ball API calls.
 *
 * Usage:
 *   const api = useAnzaroApi()
 *   const res = await api.get('/api/anzaro/scenes')
 *   const res = await api.post('/api/anzaro/devices/control', { alias: 'tv', action: 'turn_on' })
 */
export function useAnzaroApi() {
  const token = useAuthStore((s) => s.token)

  function headers(json = true): Record<string, string> {
    const h: Record<string, string> = {}
    if (token) h['Authorization'] = `Bearer ${token}`
    if (json) h['Content-Type'] = 'application/json'
    return h
  }

  async function get(url: string) {
    return fetch(url, { headers: headers(false) })
  }

  async function post(url: string, body?: unknown) {
    return fetch(url, {
      method: 'POST',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async function patch(url: string, body?: unknown) {
    return fetch(url, {
      method: 'PATCH',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async function del(url: string, body?: unknown) {
    return fetch(url, {
      method: 'DELETE',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  return { get, post, patch, del, token, headers }
}
