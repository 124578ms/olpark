import { useEffect, useMemo, useState } from 'react'
import { DataMethod } from './components/DataMethod'
import { Forecast } from './components/Forecast'
import { Gates } from './components/Gates'
import { ShowImpact } from './components/ShowImpact'
import { eventsOn, loadLive, rainHoursOn, showImpact, type Live } from './lib/live'
import { addDays, forecast, gateLoads, loadSite, nowKST, peakWindow, recommendGate, type SiteData } from './lib/model'

const NAV = [
  { href: '#answer', label: '예보' },
  { href: '#gates', label: '출입문' },
  { href: '#shows', label: '공연 영향' },
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
  const impact = useMemo(() => (site ? showImpact(site, dayEvents) : null), [site, dayEvents])
  const showOn = withShow ?? dayEvents.length > 0
  // 일정이 있으면 공연장 규모에 맞는 상승률, 직접 켠 경우는 2025년 전체 평균
  const uplift = showOn ? (impact?.uplift ?? site?.showEffect.meanUplift ?? 0) : 0
  const rainHours = useMemo(() => rainHoursOn(live, date), [live, date])
  const values = useMemo(() => (site ? forecast(site, date, uplift, rainHours) : []), [site, date, uplift, rainHours])

  // 선택 시간이 없으면 가장 붐비는 시각을 보여 준다
  const activeHour = hour ?? (values.length ? peakWindow(values)[0] : 12)
  const loads = useMemo(() => (site ? gateLoads(site, activeHour) : []), [site, activeHour])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-4 sm:px-8">
          <a href="#answer" className="inline-flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={22} height={22} />
            올팍 언제 갈까
          </a>
          <nav aria-label="섹션" className="flex gap-4 text-[13px] text-ink-2 sm:gap-6 sm:text-[14px]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-ink">
                {n.label}
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
              impact={showOn ? impact : null}
              rainHours={rainHours}
              eventDays={[0, 1, 2].map((i) => eventsOn(live, addDays(now, i)).length > 0)}
              values={values}
              hour={activeHour}
              onHour={setHour}
              nowHour={now.getHours()}
              gate={recommendGate(loads)}
              live={live}
            />
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
