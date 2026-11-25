// site.json(파이썬에서 생성)을 읽어 날짜별 시간대 예보를 계산한다.
// 예상 재차대수 = 기준표[요일][시] × 월 보정 × 공연 영향 × 비 영향 × 공휴일 영향

export type Scale = 'small' | 'mid' | 'large'
export type HolidayKind = 'major' | 'other'

export type Show = {
  with: string[]
  name: string
  dates: string[]
  audience: number
  peakOccupancy: number
  uplift: number | null
}

export type SiteData = {
  generatedAt: string
  source: {
    rows: number
    days: number
    from: string
    to: string
    complete: boolean
    sampledMonths: number[]
    partialDays: string[]
  }
  gates: string[]
  thresholds: [number, number, number]
  baseline: number[][] // [요일 0=월][시]
  monthFactor: Record<string, number>
  gateShare: number[][] // [시][출입문]
  /** 비 온 시간 / 마른 날 같은 시간 (주차 비율의 중앙값끼리) */
  rainEffect: Record<'weekday' | 'weekend', { factor: number; rainHours: number; dryHours: number }> | null
  /** 공휴일 공연 없는 10–19시 주차 / 같은 요일 기준 (명절=설날·추석, other=그 밖 공휴일), 2025년 중앙값 */
  holidayEffect?: Partial<Record<HolidayKind, { factor: number; days: number }>> | null
  showEffect: {
    hours: number
    meanUplift: number | null
    showCount: number
    shows: Show[]
    /** 관람객 규모별 공연 영향 중앙값: small < 3,000명 ≤ mid < 10,000명 ≤ large */
    byScale: Partial<Record<Scale, { uplift: number; shows: number }>>
  }
  daily: Record<string, { entries: number; peak: number; show: string }>
}

export type Level = 0 | 1 | 2 | 3
export const LEVEL_LABEL = ['여유', '보통', '붐빔', '매우 붐빔'] as const
export const LEVEL_COLOR = ['var(--color-lv0)', 'var(--color-lv1)', 'var(--color-lv2)', 'var(--color-lv3)'] as const

export const OPEN_FROM = 6
export const OPEN_TO = 23 // 그래프에 보여 줄 시간 범위
export const SHOW_HOURS = [16, 17, 18, 19, 20] // 2025년 공연 기록이 몰린 시간대

export async function loadSite(): Promise<SiteData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/site.json`)
  if (!res.ok) throw new Error(`데이터를 불러오지 못했어요 (${res.status})`)
  return res.json()
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 한국 시간 기준 현재 시각 */
export function nowKST(): Date {
  const now = new Date()
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function dateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`
}

export function hourLabel(h: number): string {
  if (h === 0) return '자정'
  if (h === 12) return '낮 12시'
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`
}

export function shortHour(h: number): string {
  return `${h}시`
}

/** JS getDay(0=일) → 기준표 요일(0=월) */
function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

export function rainFactor(site: SiteData, d: Date): number {
  const fx = site.rainEffect?.[d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'weekday']
  return fx?.factor ?? 1
}

/** 공휴일 이름으로 영향 계수를 고른다. 설날·추석은 명절, 그 밖은 일반 공휴일 */
export function holidayEffectOf(site: SiteData, name: string | null): { kind: HolidayKind; factor: number; days: number } | null {
  if (!name) return null
  const kind: HolidayKind = name === '설날' || name === '추석' ? 'major' : 'other'
  const fx = site.holidayEffect?.[kind]
  return fx ? { kind, ...fx } : null
}

/** uplift: 공연 시간대(16–20시)에 더할 비율, 공연이 없으면 0. rainHours: 비나 눈 예보가 있는 시각. holiday: 공휴일 계수(평일·주말 모두 하루 전체에 곱함) */
export function forecast(site: SiteData, d: Date, uplift: number, rainHours: number[] = [], holiday = 1): number[] {
  const base = site.baseline[weekdayIndex(d)]
  const mf = site.monthFactor[String(d.getMonth() + 1)] ?? 1
  const rf = rainFactor(site, d)
  return base.map((v, h) =>
    Math.round(v * mf * holiday * (SHOW_HOURS.includes(h) ? 1 + uplift : 1) * (rainHours.includes(h) ? rf : 1)),
  )
}

export function levelOf(site: SiteData, v: number): Level {
  const [a, b, c] = site.thresholds
  if (v >= c) return 3
  if (v >= b) return 2
  if (v >= a) return 1
  return 0
}

/** 가장 붐비는 연속 구간 (최댓값의 90% 이상) */
export function peakWindow(values: number[]): [number, number] {
  let peak = OPEN_FROM
  for (let h = OPEN_FROM; h <= OPEN_TO; h++) if (values[h] > values[peak]) peak = h
  let s = peak
  let e = peak
  while (s - 1 >= OPEN_FROM && values[s - 1] >= values[peak] * 0.9) s--
  while (e + 1 <= OPEN_TO && values[e + 1] >= values[peak] * 0.9) e++
  return [s, e]
}

/** 낮 시간(9–20시) 중 가장 한산한 시각, fromHour 이후만 */
export function quietestHour(values: number[], fromHour = 9): number {
  const pick = (from: number) => {
    let best = -1
    for (let h = Math.max(9, from); h <= 20; h++) if (best < 0 || values[h] < values[best]) best = h
    return best
  }
  // 남은 시간이 없으면(저녁 이후) 하루 전체에서 고른다
  const best = pick(fromHour)
  return best < 0 ? pick(9) : best
}

export type GateLoad = { gate: string; share: number; relative: number }

/** 그 시각 출입문별 입차 비중과 평소 대비 부담(1보다 작으면 그 시각에 상대적으로 한산) */
export function gateLoads(site: SiteData, hour: number): GateLoad[] {
  const avg = site.gates.map((_, i) => site.gateShare.reduce((s, row) => s + row[i], 0) / 24)
  return site.gates
    .map((gate, i) => {
      const share = site.gateShare[hour][i]
      return { gate, share, relative: avg[i] ? share / avg[i] : 1 }
    })
    .sort((a, b) => b.share - a.share)
}

/** 추천 출입문: 이용 비중 3% 이상인 문 중 평소 대비 가장 한산한 문 */
export function recommendGate(loads: GateLoad[]): GateLoad {
  const main = loads.filter((g) => g.share >= 0.03)
  return (main.length ? main : loads).reduce((a, b) => (b.relative < a.relative ? b : a))
}

export function formatNum(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function formatPct(r: number): string {
  return `${r >= 0 ? '+' : ''}${Math.round(r * 100)}%`
}
