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
  type GateLoad,
  type SiteData,
} from '../lib/model'
import { weatherAt, weatherText, type Live } from '../lib/live'
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

export function Forecast(p: Props) {
  const [ps, pe] = peakWindow(p.values)
  const quiet = quietestHour(p.values, p.nowHour !== null ? p.nowHour + 1 : 9)
  const subject = p.dayOffset === 0 ? '오늘' : DAYS[p.dayOffset]
  const sel = p.values[p.hour]
  const selLv = levelOf(p.site, sel)
  const uplift = p.site.showEffect.meanUplift
  const w = weatherAt(p.live, p.date, p.hour)

  return (
    <section aria-labelledby="answer" className="pt-10 sm:pt-16">
      <p className="text-[15px] text-ink-2">{dateLabel(p.date)}</p>
      <h1 id="answer" className="mt-2 max-w-[20ch] text-balance text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[44px]">
        {subject} 올림픽공원은 {rangeText(ps, pe)}가 가장 붐벼요
      </h1>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="날짜 선택" className="inline-flex rounded-[10px] bg-sunk p-1">
            {DAYS.map((d, i) => (
              <button
                key={d}
                role="tab"
                aria-selected={p.dayOffset === i}
                onClick={() => p.onDay(i)}
                className={`h-8 rounded-lg px-4 text-[14px] font-medium transition-colors ${
                  p.dayOffset === i ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[14px] text-ink-2">
            <span>저녁 공연이 있는 날로 보기</span>
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
          </ul>
        </div>
        {p.withShow && uplift !== null && (
          <p className="mt-3 text-[13px] text-ink-3">
            2025년 공연 시간대는 같은 요일·시각보다 주차가 평균 {formatPct(uplift)} 많았어요. 그 비율을 16–20시에 반영했어요
          </p>
        )}
      </Card>
    </section>
  )
}
