import { NextResponse } from 'next/server'
import { createGuestUser, createSession, setSessionCookie } from '@/lib/auth'
import { ensureSeedData } from '@/lib/seed'

export async function POST() {
  try {
    await ensureSeedData()
    const user = await createGuestUser()
    const token = await createSession(user.id)
    await setSessionCookie(token)
    return NextResponse.json({ user, token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
