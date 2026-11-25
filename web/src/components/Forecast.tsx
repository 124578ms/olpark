import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  dateLabel,
  formatNum,
  formatPct,
  hourLabel,
  levelOf,
  peakWindow,
  quietestHour,
  WEEKDAY,
  type GateLoad,
  type SiteData,
} from '../lib/model'
import { weatherAt, weatherText, type DayWeather, type Live, type ParkEvent } from '../lib/live'
import type { Scale } from '../lib/model'
import { ForecastChart } from './ForecastChart'
import { LiveStrip } from './LiveStrip'
import { Card, GateChip, LevelBadge, NumberRoll } from './ui'

type Props = {
  site: SiteData
  date: Date
  dayOffset: number
  onDay: (n: number) => void
  withShow: boolean
  onShow: (v: boolean) => void
  values: number[]
  hour: number
  onHour: (h: number) => void
  nowHour: number | null
  gate: GateLoad
  live: Live | null
  events: ParkEvent[]
  impact: { scale: Scale; uplift: number } | null
  rainHours: number[]
  rainCoarse: boolean
  pops: (number | null)[]
  days: { date: Date; show: boolean; holiday: string | null; weather: DayWeather | null }[]
  holiday: string | null
  holidayFx: { kind: 'major' | 'other'; factor: number; days: number } | null
}

const SCALE_TEXT: Record<Scale, string> = {
  large: '관람객 1만 명 이상',
  mid: '관람객 3천–1만 명',
  small: '관람객 3천 명 미만',
}

const DAYS = ['오늘', '내일', '모레']

function rangeText(s: number, e: number) {
  const sameHalf = (s < 12) === (e < 12)
  const t = s === e ? hourLabel(s) : sameHalf ? `${hourLabel(s)}–${e > 12 ? e - 12 : e}시` : `${hourLabel(s)}–${hourLabel(e)}`
  // 시간 표현은 한 줄에: 공백은 줄바꿈 없는 공백, 대시 앞뒤는 단어 결합 문자
  const NBSP = String.fromCharCode(0xa0)
  const WJ = String.fromCharCode(0x2060)
  return t.split(' ').join(NBSP).split('–').join(`${WJ}–${WJ}`)
}

/** 비 오는 시각들을 '오후 2시–5시, 오후 8시' 같은 구간 글로 */
function rainRange(hours: number[]) {
  const hs = [...hours].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < hs.length; i++) {
    let j = i
    while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j++
    parts.push(i === j ? hourLabel(hs[i]) : `${hourLabel(hs[i])}–${hourLabel(hs[j])}`)
    i = j
  }
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} 등` : parts.join(', ')
}

export function Forecast(p: Props) {
  const [ps, pe] = peakWindow(p.values)
  const quiet = quietestHour(p.values, p.nowHour !== null ? p.nowHour + 1 : 9)
  const subject = p.dayOffset < DAYS.length ? DAYS[p.dayOffset] : `${p.date.getMonth() + 1}월 ${p.date.getDate()}일`
  const sel = p.values[p.hour]
  const selLv = levelOf(p.site, sel)
  const uplift = p.site.showEffect.meanUplift
  const w = weatherAt(p.live, p.date, p.hour)
  const rainFx = p.rainHours.length > 0 ? p.site.rainEffect?.[[0, 6].includes(p.date.getDay()) ? 'weekend' : 'weekday'] : undefined

  return (
    <section aria-labelledby="answer" className="pt-10 sm:pt-16">
      <p className="text-[15px] text-ink-2">{dateLabel(p.date)}</p>
      <h1 id="answer" className="mt-2 max-w-[20ch] text-balance text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[44px]">
        {subject} 올림픽공원은 {rangeText(ps, pe)}가 가장 붐벼요
      </h1>
      {p.events.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-[15px]" aria-label={`${subject} 공연`}>
          {p.events.slice(0, 3).map((e) => (
            <li key={e.url} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-ink-3">{e.place.replace('올림픽공원 ', '')}</span>
              <a href={e.url} target="_blank" rel="noreferrer" className="truncate text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                {e.title}
              </a>
            </li>
          ))}
          {p.events.length > 3 && <li className="text-[13px] text-ink-3">외 {p.events.length - 3}건</li>}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-[15px] text-ink-2">
        <span>
          한산한 시간 <strong className="font-medium text-ink">{hourLabel(quiet)}</strong>
        </span>
        <span className="hidden h-4 w-px bg-line-strong sm:block" aria-hidden />
        <span className="inline-flex items-center gap-2">
          {hourLabel(p.hour)} 추천 출입문 <GateChip gate={p.gate.gate} size="sm" />
        </span>
      </div>
      {p.dayOffset === 0 && p.live && <LiveStrip live={p.live} />}

      <Card className="mt-6 p-4 sm:p-6">
        <DayStrip days={p.days} selected={p.dayOffset} onDay={p.onDay} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-3">
            {p.days[p.dayOffset]?.weather
              ? dayWeatherText(p.days[p.dayOffset].weather!)
              : p.dayOffset > 2
                ? '이 날은 아직 날씨 예보가 없어요'
                : ''}
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[14px] text-ink-2">
            <span>{p.events.length > 0 ? '공연 영향 반영' : '저녁 공연이 있는 날로 보기'}</span>
            <span className="relative inline-flex">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={p.withShow}
                onChange={(e) => p.onShow(e.target.checked)}
              />
              <span className="h-6 w-10 rounded-full bg-line-strong transition-colors peer-checked:bg-park" />
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-out-soft)] peer-checked:translate-x-4" />
            </span>
          </label>
        </div>

        <div className="mt-5">
          <ForecastChart
            site={p.site}
            values={p.values}
            hour={p.hour}
            onHour={p.onHour}
            nowHour={p.dayOffset === 0 ? p.nowHour : null}
            withShow={p.withShow}
            animKey={`${p.dayOffset}-${p.withShow}`}
            rainHours={p.rainHours}
            pops={p.pops}
          />
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[14px] text-ink-3">{hourLabel(p.hour)} 예상 주차</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="text-[32px] font-semibold leading-none tracking-[-0.02em]">
                <NumberRoll value={sel} format={formatNum} />
                <span className="ml-1 text-[18px] font-medium text-ink-2">대</span>
              </span>
              <LevelBadge level={selLv} />
            </p>
            {!w && p.pops[p.hour] !== null && (
              <p className="mt-2 text-[13px] text-ink-2">{p.hour < 12 ? '오전' : '오후'} 강수확률 {p.pops[p.hour]}% (중기예보)</p>
            )}
            {w && (
              <p className="mt-2 text-[13px] text-ink-2">
                날씨 {weatherText(w)}
                {w.pop !== null && w.pop > 0 && ` · 강수확률 ${w.pop}%`}
              </p>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-2" aria-label="범례">
            {LEVEL_LABEL.map((l, i) => (
              <li key={l} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LEVEL_COLOR[i] }} aria-hidden />
                {l}
              </li>
            ))}
            {p.rainHours.length > 0 && (
              <li className="inline-flex items-center gap-1.5 font-medium text-rain">
                <Drop size={10} />
                비·눈 예보
              </li>
            )}
          </ul>
        </div>
        {p.holiday && p.holidayFx && (
          <p className="mt-3 text-[13px] text-ink-3">
            {p.holiday}이에요. 2025년 {p.holidayFx.kind === 'major' ? '설날·추석' : '공휴일'}은 같은 요일 평소보다 주차가{' '}
            {Math.round((1 - p.holidayFx.factor) * 100)}% 적어서(공휴일 {p.holidayFx.days}일 중앙값) 하루 전체를 그만큼 낮췄어요
          </p>
        )}
        {rainFx && rainFx.factor < 1 && (
          <p className="mt-3 text-[13px] text-ink-3">
            {p.rainCoarse
              ? `${[p.rainHours.includes(6) && '오전', p.rainHours.includes(12) && '오후'].filter(Boolean).join('과 ')}에 비나 눈 예보(중기예보)가 있어요.`
              : `${rainRange(p.rainHours)}에 비나 눈 예보가 있어요.`} 2025년 {[0, 6].includes(p.date.getDay()) ? '주말' : '평일'} 비 온 시간은 마른
            날보다 주차가 {Math.round((1 - rainFx.factor) * 100)}% 적어서 그만큼 낮췄어요
          </p>
        )}
        {p.withShow && p.impact && (
          <p className="mt-3 text-[13px] text-ink-3">
            2025년 {SCALE_TEXT[p.impact.scale]} 공연은 공연 시간대 주차가 같은 요일·시각보다 {formatPct(p.impact.uplift)} 많았어요(중앙값). 그
            비율을 16–20시에 반영했어요
          </p>
        )}
        {p.withShow && !p.impact && uplift !== null && (
          <p className="mt-3 text-[13px] text-ink-3">
            2025년 공연 시간대는 같은 요일·시각보다 주차가 평균 {formatPct(uplift)} 많았어요. 그 비율을 16–20시에 반영했어요
          </p>
        )}
      </Card>
    </section>
  )
}

function dayWeatherText(w: DayWeather) {
  const t = w.tmin !== null && w.tmax !== null ? `${w.tmin}°/${w.tmax}°` : ''
  const pop = w.pop !== null && w.pop > 0 ? `강수확률 최고 ${w.pop}%` : ''
  return ['날씨', w.sky, t, pop].filter(Boolean).join(' · ').replace('날씨 · ', '날씨 ')
}

/** 물방울 아이콘 (그래프와 날짜 칩에서 같은 모양) */
export function Drop({ size = 10, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="-5 -7 10 13" className={className} aria-hidden>
      <path d="M0 -6.5 C 2.6 -3 4.6 -0.4 4.6 1.6 A 4.6 4.6 0 0 1 -4.6 1.6 C -4.6 -0.4 -2.6 -3 0 -6.5 Z" fill="currentColor" />
    </svg>
  )
}

function DayStrip({
  days,
  selected,
  onDay,
}: {
  days: Props['days']
  selected: number
  onDay: (i: number) => void
}) {
  return (
    <div role="tablist" aria-label="날짜 선택" className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2">
      {days.map((d, i) => {
        const on = selected === i
        const red = d.holiday || d.date.getDay() === 0
        const wx = d.weather
        const wet = wx && (wx.rain || (wx.pop ?? 0) >= 60)
        return (
          <button
            key={i}
            role="tab"
            aria-selected={on}
            aria-label={`${d.date.getMonth() + 1}월 ${d.date.getDate()}일${d.holiday ? ` ${d.holiday}` : ''}${d.show ? ', 공연 있음' : ''}${wet ? `, 비 예보` : ''}`}
            onClick={() => onDay(i)}
            className={`flex w-[58px] shrink-0 snap-start flex-col items-center rounded-[12px] border px-1 pb-1.5 pt-2 transition-colors ${
              on ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
            }`}
          >
            <span className="text-[12px]">{i < DAYS.length ? DAYS[i] : WEEKDAY[d.date.getDay()]}</span>
            <span className={`num text-[18px] font-semibold leading-tight ${red && !on ? 'text-lv3' : ''}`}>{d.date.getDate()}</span>
            <span className="mt-1 flex h-4 items-center gap-1 text-[11px] leading-none">
              {wet ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${on ? 'text-[#9cc5ea]' : 'text-rain'}`}>
                  <Drop size={9} />
                  {wx?.pop ?? ''}
                </span>
              ) : null}
              {d.show && <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-lv1' : 'bg-park'}`} aria-hidden />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
