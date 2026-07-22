import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateToken } from '@/lib/auth'

/**
 * V.45: Guest login — creates a throwaway account
 * 
 * Previously this route imported createGuestUser, createSession, setSessionCookie
 * from @/lib/auth — none of those exports existed. Now uses db + generateToken directly.
 */

export async function POST() {
  try {
    // Create a guest user with random email
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({
      data: {
        email: `${guestId}@guest.anzaro.ai`,
        name: 'زائر',
        password: null,
        isVerified: true,
        role: 'user',
      },
    })

    // Create session
    const token = generateToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days for guests

    await db.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    })

    const response = NextResponse.json({ user, token })

    // Set session cookie
    response.cookies.set('anzaro_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    return response
  } catch (e) {
    console.error('[Guest Auth] Error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
