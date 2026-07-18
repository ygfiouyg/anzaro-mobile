import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { city = 'Cairo', country = 'Egypt' } = (await request.json()) as { city?: string; country?: string }
    const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=5`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    const timings = data?.data?.timings
    if (!timings) return Response.json({ error: 'could not fetch prayer times' }, { status: 502 })
    return Response.json({
      city, country,
      date: data?.data?.date?.readable,
      timings: {
        Fajr: timings.Fajr, Sunrise: timings.Sunrise, Dhuhr: timings.Dhuhr,
        Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha,
      },
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
