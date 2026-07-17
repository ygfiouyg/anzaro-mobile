import { NextResponse } from 'next/server'
import { getSessionUser, migrateGuestToGoogle, createSession, setSessionCookie } from '@/lib/auth'
import { ensureSeedData } from '@/lib/seed'

// Phase 4: Google OAuth 2.0 (simulated account selector)
// In production this would redirect to Google's consent screen.
// Here we accept the chosen profile and bind it to the account, migrating
// any guest personality profile (Phase 7.4) into the permanent Google account.
export async function POST(req: Request) {
  try {
    await ensureSeedData()
    const body = await req.json().catch(() => ({}))
    const { googleId, email, name, avatarUrl } = body as {
      googleId?: string
      email?: string
      name?: string
      avatarUrl?: string
    }

    if (!googleId || !email) {
      return NextResponse.json({ error: 'googleId and email are required' }, { status: 400 })
    }

    const current = await getSessionUser()
    const userId = current?.id
    if (!userId) {
      // No existing session — create a fresh bound account
      const guest = await createGuestUserCaller()
      const migrated = await migrateGuestToGoogle(guest.id, { googleId, email, name: name ?? email, avatarUrl })
      const token = await createSession(migrated.id)
      await setSessionCookie(token)
      return NextResponse.json({ user: migrated, token, migrated: true })
    }

    const migrated = await migrateGuestToGoogle(userId, { googleId, email, name: name ?? email, avatarUrl })
    const token = await createSession(migrated.id)
    await setSessionCookie(token)
    return NextResponse.json({ user: migrated, token, migrated: current.isGuest })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// helper to avoid circular import of createGuestUser naming
async function createGuestUserCaller() {
  const { createGuestUser } = await import('@/lib/auth')
  return createGuestUser()
}
