import { formatNum, hourLabel, type GateLoad } from '../lib/model'
import { Card, GateChip, SectionHead } from './ui'

// 개략도용 위치 (이름의 방위 기준, 실제 측량 위치 아님)
const POS: Record<string, [number, number]> = {
  북2: [238, 34],
  동2: [384, 150],
  남2: [222, 272],
  남3: [150, 266],
  남4: [296, 262],
  서1: [30, 118],
  서2: [34, 192],
}

function relativeText(r: number) {
  if (r < 0.8) return '평소보다 한산'
  if (r > 1.2) return '평소보다 붐빔'
  return '평소 수준'
}

export function Gates({ loads, hour, best, rows }: { loads: GateLoad[]; hour: number; best: GateLoad; rows: number }) {
  const maxShare = Math.max(...loads.map((g) => g.share))
  return (
    <section aria-labelledby="gates" className="pt-20 sm:pt-28">
      <SectionHead id="gates" title="어느 문으로 들어갈까">
        2025년 차량 {formatNum(rows)}대의 입차 기록에서 {hourLabel(hour)}에 각 출입문으로 들어온 비율이에요. 그래프에서 다른
        시간을 누르면 바뀌어요
      </SectionHead>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="p-4 sm:p-6">
          <svg viewBox="0 0 420 300" className="block h-auto w-full" role="img" aria-label="올림픽공원 출입문 개략도">
            <path
              d="M70 70 C 110 30, 200 18, 270 30 C 340 42, 392 90, 386 150 C 380 214, 340 262, 260 270 C 190 278, 110 276, 70 238 C 34 204, 28 150, 38 114 C 44 92, 56 80, 70 70 Z"
              fill="var(--color-lv0)"
              stroke="var(--color-lv1)"
              strokeWidth="1.5"
            />
            {loads.map((g) => {
              const [cx, cy] = POS[g.gate] ?? [210, 150]
              const isBest = g.gate === best.gate
              const r = 5 + (g.share / maxShare) * 9
              return (
                <g key={g.gate}>
                  <circle cx={cx} cy={cy} r={r} fill={isBest ? 'var(--color-sign)' : 'var(--color-surface)'} stroke="var(--color-sign)" strokeWidth="1.5" />
                  <text
                    x={cx}
                    y={cy < 60 ? cy + r + 16 : cy - r - 7}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight={isBest ? 600 : 500}
                    fill={isBest ? 'var(--color-sign)' : 'var(--color-ink-2)'}
                  >
                    {g.gate}문
                  </text>
                </g>
              )
            })}
          </svg>
          <p className="mt-2 text-[12px] text-ink-3">개략도예요. 출입문 위치는 이름의 방위를 따라 그렸어요</p>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium">{hourLabel(hour)} 출입문별 입차 비율</p>
            <GateChip gate={best.gate} size="sm" />
          </div>
          <ul className="mt-4 flex flex-col">
            {loads.map((g) => (
              <li key={g.gate} className="grid grid-cols-[48px_1fr_56px] items-center gap-3 border-t border-line py-3 first:border-t-0">
                <span className={`text-[14px] ${g.gate === best.gate ? 'font-semibold text-sign' : 'text-ink'}`}>{g.gate}문</span>
                <span className="flex flex-col gap-1.5">
                  <span className="h-1.5 rounded-full bg-sunk">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]"
                      style={{ width: `${(g.share / maxShare) * 100}%`, background: g.gate === best.gate ? 'var(--color-sign)' : 'var(--color-lv2)' }}
                    />
                  </span>
                  <span className="text-[12px] text-ink-3">{relativeText(g.relative)}</span>
                </span>
                <span className="num text-right text-[14px] text-ink-2">{(g.share * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            추천 문은 이용 비율 3% 이상인 문 중에서, 이 시간에 평소보다 가장 한산한 문이에요
          </p>
        </Card>
      </div>
    </section>
  )
}
