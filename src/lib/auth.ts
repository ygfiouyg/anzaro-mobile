import { cookies } from 'next/headers'
import { db } from './db'
import crypto from 'crypto'

const SESSION_COOKIE = 'anzaro_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  isGuest: boolean
  role: string
  dialect: string
  themePreset: string
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({ data: { token, userId, expiresAt } })
  return token
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await db.session.delete({ where: { id: session.id } }).catch(() => {})
      }
      return null
    }
    const u = session.user
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      isGuest: u.isGuest,
      role: u.role,
      dialect: u.dialect,
      themePreset: u.themePreset,
    }
  } catch {
    return null
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

// Create a guest user with a profile bound to browser storage concept.
// In this local-first demo we persist guest to DB so the session survives refresh.
export async function createGuestUser(): Promise<SessionUser> {
  const guestId = `guest_${crypto.randomBytes(6).toString('hex')}`
  const user = await db.user.create({
    data: {
      email: `${guestId}@guest.anzaro.local`,
      name: 'Guest',
      isGuest: true,
      dialect: 'egyptian',
      themePreset: 'aurora',
    },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isGuest: true,
    role: user.role,
    dialect: user.dialect,
    themePreset: user.themePreset,
  }
}

// Migrate a guest account into a Google account (Phase 7.4)
export async function migrateGuestToGoogle(
  guestUserId: string,
  googleProfile: { googleId: string; email: string; name: string; avatarUrl?: string }
): Promise<SessionUser> {
  // Check if a real account already exists for this googleId/email
  const existing = await db.user.findFirst({
    where: {
      OR: [{ googleId: googleProfile.googleId }, { email: googleProfile.email }],
    },
  })

  if (existing && existing.id === guestUserId) {
    // already linked
    const updated = await db.user.update({
      where: { id: guestUserId },
      data: {
        googleId: googleProfile.googleId,
        email: googleProfile.email,
        name: googleProfile.name,
        avatarUrl: googleProfile.avatarUrl ?? null,
        isGuest: false,
      },
    })
    return toSessionUser(updated)
  }

  if (existing) {
    // Merge guest data into existing account, then delete guest
    const [profile, quickActions, routines, nudges] = await Promise.all([
      db.personalityProfile.findUnique({ where: { userId: guestUserId } }),
      db.quickAction.findMany({ where: { userId: guestUserId } }),
      db.routine.findMany({ where: { userId: guestUserId } }),
      db.proactiveNudge.findMany({ where: { userId: guestUserId } }),
    ])

    if (profile && !(await db.personalityProfile.findUnique({ where: { userId: existing.id } }))) {
      await db.personalityProfile.update({
        where: { userId: guestUserId },
        data: { userId: existing.id },
      })
    }
    if (quickActions.length) {
      await db.quickAction.updateMany({ where: { userId: guestUserId }, data: { userId: existing.id } })
    }
    if (routines.length) {
      await db.routine.updateMany({ where: { userId: guestUserId }, data: { userId: existing.id } })
    }
    if (nudges.length) {
      await db.proactiveNudge.updateMany({ where: { userId: guestUserId }, data: { userId: existing.id } })
    }
    // delete the now-empty guest
    await db.user.delete({ where: { id: guestUserId } }).catch(() => {})
    return toSessionUser(existing)
  }

  // No existing account — promote the guest in place
  const updated = await db.user.update({
    where: { id: guestUserId },
    data: {
      googleId: googleProfile.googleId,
      email: googleProfile.email,
      name: googleProfile.name,
      avatarUrl: googleProfile.avatarUrl ?? null,
      isGuest: false,
    },
  })
  return toSessionUser(updated)
}

function toSessionUser(u: Awaited<ReturnType<typeof db.user.findUnique>>): SessionUser {
  if (!u) throw new Error('USER_NOT_FOUND')
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    isGuest: u.isGuest,
    role: u.role,
    dialect: u.dialect,
    themePreset: u.themePreset,
  }
}
