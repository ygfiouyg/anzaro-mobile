import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { ensureSeedData } from '@/lib/seed'

export async function GET() {
  try {
    // Lazy seed on first session check so the app is never empty
    await ensureSeedData()
    const user = await getSessionUser()
    return NextResponse.json({ user })
  } catch (e) {
    return NextResponse.json({ user: null, error: String(e) }, { status: 500 })
  }
}
