import { formatNum, formatPct, type SiteData } from '../lib/model'
import { Card, NumberRoll, SectionHead } from './ui'

function shortDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${Number(m)}.${Number(d)}`
}

export function ShowImpact({ site }: { site: SiteData }) {
  const fx = site.showEffect
  const top = fx.shows.filter((s) => s.uplift !== null).slice(0, 8)
  const max = Math.max(...top.map((s) => s.uplift ?? 0))
  if (fx.meanUplift === null || top.length === 0) return null

  return (
    <section aria-labelledby="shows" className="pt-20 sm:pt-28">
      <SectionHead id="shows" title="공연이 있는 날은 얼마나 붐볐을까">
        2025년 공연 {formatNum(fx.shows.length)}건의 시간대를, 공연이 없던 같은 요일·같은 시각과 비교했어요
      </SectionHead>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card className="flex flex-col gap-8 p-6 lg:sticky lg:top-20">
          <div>
            <p className="text-[14px] text-ink-3">공연 시간대 주차</p>
            <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] text-park">
              <NumberRoll value={Math.round(fx.meanUplift * 100)} format={(n) => `+${n}%`} />
            </p>
            <p className="mt-3 text-[15px] text-ink-2">공연이 없는 같은 요일·시각 대비</p>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-3">
            공연 기록 {formatNum(fx.hours)}개 시간대 기준. 공연명과 관람객 수는 한국체육산업개발 연계 데이터, 주차는 전체구역
            입출차 데이터에서 계산했어요
          </p>
        </Card>

        <Card className="p-4 sm:p-6">
          <p className="text-[15px] font-medium">주차가 가장 많이 늘었던 공연</p>
          <ol className="mt-4 flex flex-col">
            {top.map((s) => (
              <li key={s.name} className="grid grid-cols-[1fr_64px] items-center gap-4 border-t border-line py-3 first:border-t-0">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">{s.name}</span>
                  <span className="mt-1 flex items-center gap-3">
                    <span className="h-1 flex-1 rounded-full bg-sunk">
                      <span className="block h-full rounded-full bg-lv2" style={{ width: `${((s.uplift ?? 0) / max) * 100}%` }} />
                    </span>
                    <span className="num shrink-0 text-[12px] text-ink-3">
                      {s.dates.map(shortDate).join(', ')} · 관람객 {formatNum(s.audience)}명
                    </span>
                  </span>
                </span>
                <span className="num text-right text-[15px] font-medium text-ink">{formatPct(s.uplift ?? 0)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </section>
  )
}
