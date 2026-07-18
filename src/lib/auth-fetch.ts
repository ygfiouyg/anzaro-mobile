'use client'

import { useAuthStore } from '@/store/auth-store'

/**
 * authFetch — a fetch wrapper that automatically attaches the Bearer token
 * from the auth store. Use this for any /api/anzaro/* call that requires auth.
 *
 * Example:
 *   import { authFetch } from '@/lib/auth-fetch'
 *   const res = await authFetch('/api/anzaro/devices')
 *   const res = await authFetch('/api/anzaro/devices', {
 *     method: 'POST',
 *     body: JSON.stringify({ ... })
 *   })
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...options, headers })
}
