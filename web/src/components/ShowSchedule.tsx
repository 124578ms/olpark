import { useState } from 'react'
import { isoDate, venueScale, type ParkEvent } from '../lib/live'
import { RANGE_DAYS, WEEKDAY, addDays } from '../lib/model'
import { Card, SectionHead } from './ui'

const SCALE_BADGE = { large: '1만 명+', mid: '3천–1만 명', small: '' } as const
const SHOW_FIRST = 8
const RANK = ['small', 'mid', 'large']

function md(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return { d, text: `${d.getMonth() + 1}.${d.getDate()}`, wd: WEEKDAY[d.getDay()] }
}

function hourText(t: string) {
  const [h, m] = t.split(':').map(Number)
  return m ? `${h}:${String(m).padStart(2, '0')}` : `${h}시`
}

/** 날짜별 시작 시각을 짧게: '금 19시 · 토 18시 · 일 17시'. 날이 많으면 시각만 모아서 */
function timesText(e: ParkEvent, from: string) {
  const days = Object.entries(e.starts ?? {})
    .filter(([d]) => d >= from)
    .sort(([a], [b]) => a.localeCompare(b))
  if (days.length === 0) return e.time || ''
  if (days.length <= 4) return days.map(([d, ts]) => `${md(d).wd} ${ts.map(hourText).join(', ')}`).join(' · ')
  const uniq = [...new Set(days.flatMap(([, ts]) => ts))].sort()
  return `${days.length}회 · ${uniq.map(hourText).join(', ')} 시작`
}

/** 다가오는 공연 목록. 2주 안의 날짜는 누르면 그날 예보로 이동 */
export function ShowSchedule({ events, now, onPick }: { events: ParkEvent[]; now: Date; onPick: (offset: number) => void }) {
  const [open, setOpen] = useState(false)
  const today = isoDate(now)
  const last = isoDate(addDays(now, RANGE_DAYS - 1))
  const list = events
    .filter((e) => e.end >= today)
    .sort(
      (a, b) =>
        (a.begin < today ? today : a.begin).localeCompare(b.begin < today ? today : b.begin) ||
        RANK.indexOf(venueScale(b.place)) - RANK.indexOf(venueScale(a.place)),
    )
  if (list.length === 0) return null
  const shown = open ? list : list.slice(0, SHOW_FIRST)

  return (
    <section aria-labelledby="schedule" className="pt-20 sm:pt-28">
      <SectionHead id="schedule" title="다가오는 공연">
        올림픽공원 공연 일정이에요. 2주 안의 공연은 누르면 그날 예보로 이동해요
      </SectionHead>
      <Card className="px-4 py-2 sm:px-6">
        <ul className="flex flex-col">
          {shown.map((e) => {
            const first = e.begin < today ? today : e.begin
            const b = md(e.begin)
            const en = md(e.end)
            const ongoing = e.begin < today
            const scale = venueScale(e.place)
            const offset = Math.round((md(first).d.getTime() - md(today).d.getTime()) / 86400000)
            const inRange = first <= last
            const body = (
              <>
                <span className="flex w-[100px] shrink-0 flex-col whitespace-nowrap sm:w-[132px]">
                  <span className="num text-[15px] font-semibold text-ink">
                    {e.begin === e.end ? (
                      <>
                        {b.text} <span className="font-normal text-ink-3">({b.wd})</span>
                      </>
                    ) : (
                      <>
                        {ongoing ? '~' : `${b.text}–`}
                        {en.text}
                      </>
                    )}
                  </span>
                  <span className="text-[12px] text-ink-3">{ongoing ? '공연 중' : e.begin === e.end ? '하루' : `${b.wd}–${en.wd}`}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] text-ink">{e.title}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                    <span className="shrink-0">{e.place.replace('올림픽공원 ', '')}</span>
                    {SCALE_BADGE[scale] && (
                      <span className={`shrink-0 rounded px-1.5 text-[11px] font-medium ${scale === 'large' ? 'bg-sign text-white' : 'bg-sunk text-ink-2'}`}>
                        {SCALE_BADGE[scale]}
                      </span>
                    )}
                    <span className="truncate text-ink-3">{timesText(e, today)}</span>
                  </span>
                </span>
                {inRange && (
                  <span className="hidden shrink-0 self-center text-[13px] text-park sm:inline" aria-hidden>
                    예보 보기 →
                  </span>
                )}
              </>
            )
            return (
              <li key={e.url} className="border-t border-line first:border-t-0">
                {inRange ? (
                  <button
                    type="button"
                    onClick={() => onPick(offset)}
                    className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-sunk"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 py-3">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
        {list.length > SHOW_FIRST && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mb-2 mt-1 w-full rounded-lg border border-line py-2 text-[14px] text-ink-2 transition-colors hover:text-ink"
          >
            {open ? '접기' : `${list.length - SHOW_FIRST}개 더 보기`}
          </button>
        )}
      </Card>
      <p className="mt-2 text-[12px] text-ink-3">출처: 한국체육산업개발 올림픽공원 공연/행사 일정안내. 시작 시각은 일정의 안내 글에서 읽었어요</p>
    </section>
  )
}
