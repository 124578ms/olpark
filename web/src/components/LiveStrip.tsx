import { formatNum } from '../lib/model'
import { clockText, type Live } from '../lib/live'

/** 지금 상황: 실시간 주차 · 공원 안 인구 · 갱신 시각 */
export function LiveStrip({ live }: { live: Live }) {
  const items: { label: string; value: string; note?: string }[] = []
  if (live.parking) {
    items.push({
      label: `지금 주차 (${live.parking.gates.join('·')}문)`,
      value: `${formatNum(live.parking.sum)}대`,
    })
  }
  if (live.people) {
    items.push({
      label: '지금 공원 안 사람',
      value: `${formatNum(live.people.min)}–${formatNum(live.people.max)}명`,
      note: live.people.level,
    })
  }
  if (items.length === 0) return null

  return (
    <div className="mt-6 flex flex-wrap items-stretch gap-x-6 gap-y-4 rounded-xl border border-line bg-surface px-4 py-3 sm:px-5">
      {items.map((it, i) => (
        <div key={it.label} className={`flex flex-col gap-1 ${i > 0 ? 'sm:border-l sm:border-line sm:pl-6' : ''}`}>
          <span className="text-[13px] text-ink-3">{it.label}</span>
          <span className="flex items-baseline gap-2">
            <span className="num text-[20px] font-semibold tracking-[-0.01em]">{it.value}</span>
            {it.note && <span className="text-[13px] font-medium text-park">{it.note}</span>}
          </span>
        </div>
      ))}
      <p className="flex w-full items-end text-[12px] text-ink-3 sm:ml-auto sm:w-auto">
        {clockText(live.updatedAt)} 기준
      </p>
    </div>
  )
}
