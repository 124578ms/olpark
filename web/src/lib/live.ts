// 실시간·예보 데이터 (scripts/fetch_live.py가 30분마다 만든 live.json)
import type { Scale, SiteData } from './model'

export type WeatherHour = { tmp: number | null; pop: number | null; sky: number; pty: number }
export type ParkEvent = { title: string; place: string; begin: string; end: string; time: string; url: string }

export type Live = {
  updatedAt: string
  events?: ParkEvent[] | null
  holidays?: { date: string; name: string }[] | null
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

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 그날 열리는 공연 (기간에 걸친 공연 포함) */
/** 그날이 공휴일이면 이름 (한국천문연구원 특일정보) */
export function holidayOn(live: Live | null, d: Date): string | null {
  const day = isoDate(d)
  return live?.holidays?.find((h) => h.date === day)?.name ?? null
}

export function eventsOn(live: Live | null, d: Date): ParkEvent[] {
  const day = isoDate(d)
  return (live?.events ?? []).filter((e) => e.begin <= day && day <= e.end)
}

/** 공연장 이름으로 규모를 어림한다 (KSPO DOME 약 1만 5천 석, 핸드볼경기장·올림픽홀 3천–5천 석, 그 밖은 소규모) */
export function venueScale(place: string): Scale {
  if (/KSPO|체조/i.test(place)) return 'large'
  if (/핸드볼|라이브 아레나|올림픽홀/.test(place)) return 'mid'
  return 'small'
}

const ORDER: Scale[] = ['small', 'mid', 'large']

/** 그날 가장 큰 공연의 규모와, 2025년 같은 규모 공연의 주차 상승률 */
export function showImpact(site: SiteData, events: ParkEvent[]): { scale: Scale; uplift: number } | null {
  if (events.length === 0) return null
  const scale = events.map((e) => venueScale(e.place)).reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a))
  const uplift = site.showEffect.byScale[scale]?.uplift ?? site.showEffect.meanUplift ?? 0
  return { scale, uplift }
}

/** 비·눈 예보(강수형태가 있는)가 있는 시각 */
export function rainHoursOn(live: Live | null, d: Date): number[] {
  if (!live?.weather) return []
  const day = isoDate(d)
  return Object.entries(live.weather.hours)
    .filter(([k, w]) => k.startsWith(day) && w.pty > 0)
    .map(([k]) => Number(k.slice(11, 13)))
}
