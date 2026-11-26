import { useEffect, useMemo, useState } from 'react'
import { DataMethod } from './components/DataMethod'
import { Forecast } from './components/Forecast'
import { Gates } from './components/Gates'
import { ShowImpact } from './components/ShowImpact'
import { ShowSchedule } from './components/ShowSchedule'
import { dayShowPlan, dayWeather, eventsOn, holidayOn, loadLive, popsOn, rainHoursOn, typicalShowPlan, type Live } from './lib/live'
import { RANGE_DAYS, addDays, forecast, gateLoads, holidayEffectOf, loadSite, nowKST, peakWindow, recommendGate, type SiteData } from './lib/model'

const NAV = [
  { href: '#answer', label: '예보' },
  { href: '#schedule', label: '공연 일정', short: '일정' },
  { href: '#gates', label: '출입문' },
  { href: '#shows', label: '공연 영향', short: '영향' },
  { href: '#method', label: '데이터' },
]

export default function App() {
  const [site, setSite] = useState<SiteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dayOffset, setDayOffset] = useState(0)
  // null이면 자동: 그날 공연 일정이 있으면 켠다
  const [withShow, setWithShow] = useState<boolean | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  const [live, setLive] = useState<Live | null>(null)

  useEffect(() => {
    loadSite().then(setSite, (e: Error) => setError(e.message))
    loadLive().then(setLive)
  }, [])

  const now = useMemo(() => nowKST(), [])
  const date = useMemo(() => addDays(now, dayOffset), [now, dayOffset])
  const dayEvents = useMemo(() => eventsOn(live, date), [live, date])
  const showOn = withShow ?? dayEvents.length > 0
  // 일정이 있으면 가장 큰 공연장의 실제 시작 시각 기준, 직접 켠 경우는 평소 공연 시각 가정
  const showPlan = useMemo(() => {
    if (!site || !showOn) return null
    return dayShowPlan(site, dayEvents, date) ?? { ...typicalShowPlan(site, date), event: null }
  }, [site, showOn, dayEvents, date])
  const rain = useMemo(() => rainHoursOn(live, date), [live, date])
  const rainHours = rain.hours
  const pops = useMemo(() => popsOn(live, date), [live, date])
  // 날짜 칩: 공연·공휴일·날씨 요약
  const days = useMemo(
    () =>
      Array.from({ length: RANGE_DAYS }, (_, i) => {
        const d = addDays(now, i)
        return { date: d, show: eventsOn(live, d).length > 0, holiday: holidayOn(live, d), weather: dayWeather(live, d) }
      }),
    [live, now],
  )
  const holiday = useMemo(() => holidayOn(live, date), [live, date])
  const holidayFx = site ? holidayEffectOf(site, holiday) : null
  const hf = holidayFx?.factor ?? 1
  const values = useMemo(
    () => (site ? forecast(site, date, showPlan, rainHours, hf) : []),
    [site, date, showPlan, rainHours, hf],
  )

  // 선택 시간이 없으면 가장 붐비는 시각을 보여 준다
  const activeHour = hour ?? (values.length ? peakWindow(values)[0] : 12)
  const loads = useMemo(() => (site ? gateLoads(site, activeHour) : []), [site, activeHour])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-4 sm:px-8">
          <a href="#answer" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[16px] font-semibold tracking-[-0.01em]">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={22} height={22} />
            올팍 언제 갈까
          </a>
          <nav aria-label="섹션" className="flex gap-3 whitespace-nowrap text-[13px] text-ink-2 sm:gap-6 sm:text-[14px]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-ink">
                {'short' in n && n.short ? (
                  <>
                    <span className="sm:hidden">{n.short}</span>
                    <span className="hidden sm:inline">{n.label}</span>
                  </>
                ) : (
                  n.label
                )}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 pb-24 sm:px-8">
        {error && <p className="pt-16 text-ink-2">{error}</p>}
        {!site && !error && <p className="pt-16 text-ink-3">예보를 불러오는 중이에요</p>}
        {site && loads.length > 0 && (
          <>
            <Forecast
              site={site}
              date={date}
              dayOffset={dayOffset}
              onDay={(n) => {
                setDayOffset(n)
                setHour(null)
                setWithShow(null)
              }}
              withShow={showOn}
              onShow={setWithShow}
              events={dayEvents}
              showPlan={showPlan}
              rainHours={rainHours}
              rainCoarse={rain.coarse}
              pops={pops}
              days={days}
              holiday={holiday}
              holidayFx={holidayFx}
              values={values}
              hour={activeHour}
              onHour={setHour}
              nowHour={now.getHours()}
              gate={recommendGate(loads)}
              live={live}
            />
            {live?.events && (
              <ShowSchedule
                events={live.events}
                now={now}
                onPick={(n) => {
                  setDayOffset(n)
                  setHour(null)
                  setWithShow(null)
                  document.getElementById('answer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
              />
            )}
            <Gates loads={loads} hour={activeHour} best={recommendGate(loads)} rows={site.source.rows} />
            <ShowImpact site={site} />
            <DataMethod site={site} />
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-2 px-4 py-8 text-[13px] text-ink-3 sm:px-8">
          <p>출처: 한국체육산업개발(주) 공공데이터 (공공데이터포털·문화공공데이터광장), 기상청 단기예보, 서울시 실시간 도시데이터. 예보는 과거 기록에 기반한 추정이에요</p>
          <p>2026 공공데이터 활용 경진대회 출품작</p>
        </div>
      </footer>
    </div>
  )
}
