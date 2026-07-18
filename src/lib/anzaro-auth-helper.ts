import { NextRequest, NextResponse } from 'next/server'
import { getUserFromToken, extractBearerToken } from '@/lib/auth'

// Helper for Anzaro Smart Ball API routes — extracts the authenticated user
// from the Bearer token. Returns { user, response } — if response is set,
// the caller should return it immediately (401).
export async function requireAnzaroUser(request: NextRequest | Request) {
  const authHeader = request.headers.get('authorization')
  const token = extractBearerToken(authHeader)
  if (!token) {
    return {
      user: null,
      response: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }),
    }
  }
  const user = await getUserFromToken(token)
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }),
    }
  }
  return { user, response: null }
}
