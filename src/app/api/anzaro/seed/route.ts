import { ensureSeedData } from '@/lib/anzaro-seed'

export async function POST() {
  try {
    await ensureSeedData()
    return Response.json({ ok: true, message: 'Anzaro seed data ensured' })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
