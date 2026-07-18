import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { lat = 30.04, lon = 31.24, name = 'Cairo' } = (await request.json()) as { lat?: number; lon?: number; name?: string }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return Response.json({ name, current: data?.current })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
