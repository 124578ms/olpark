// 실시간·예보 데이터 (scripts/fetch_live.py가 30분마다 만든 live.json)

export type WeatherHour = { tmp: number | null; pop: number | null; sky: number; pty: number }
export type Live = {
  updatedAt: string
  parking: { sum: number; gates: string[] } | null
  weather: { base: string; hours: Record<string, WeatherHour> } | null
  people: {
    time: string
    level: string
    message: string
    min: number
    max: number
    forecast: { time: string; level: string; min: number; max: number }[]
  } | null
}

/** 없거나 실패해도 사이트는 기준표 예보만으로 동작해야 하므로 null을 돌려준다 */
export async function loadLive(): Promise<Live | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/live.json`, { cache: 'no-store' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function weatherAt(live: Live | null, d: Date, hour: number): WeatherHour | null {
  if (!live?.weather) return null
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}`
  return live.weather.hours[key] ?? null
}

export function weatherText(w: WeatherHour) {
  const sky = w.pty === 1 || w.pty === 4 ? '비' : w.pty === 2 ? '비나 눈' : w.pty === 3 ? '눈' : w.sky >= 4 ? '흐림' : w.sky === 3 ? '구름 많음' : '맑음'
  const tmp = w.tmp === null ? '' : `${Math.round(w.tmp)}°`
  return [tmp, sky].filter(Boolean).join(' ')
}

/** '2026-11-25T15:30' 또는 '2026-11-25 15:00' → '오후 3:30' */
export function clockText(s: string) {
  const m = s.match(/(\d{2}):(\d{2})/)
  if (!m) return s
  const h = Number(m[1])
  const ap = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ap} ${h12}:${m[2]}`
}
