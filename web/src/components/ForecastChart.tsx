import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { LEVEL_COLOR, LEVEL_LABEL, OPEN_FROM, OPEN_TO, SHOW_HOURS, hourLabel, levelOf, type SiteData } from '../lib/model'

type Props = {
  site: SiteData
  values: number[]
  hour: number
  onHour: (h: number) => void
  nowHour: number | null
  withShow: boolean
  animKey: string
  rainHours: number[]
}

const PAD_L = 4
const PAD_T = 28
const PAD_B = 28

/** 컨테이너 실제 폭으로 그려서 글자가 작아지지 않게 한다 */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function ForecastChart({ site, values, hour, onHour, nowHour, withShow, animKey, rainHours }: Props) {
  const [wrapRef, W] = useWidth()
  const narrow = W < 480
  const H = narrow ? 220 : 260
  const PAD_R = narrow ? 60 : 64
  const hours = Array.from({ length: OPEN_TO - OPEN_FROM + 1 }, (_, i) => OPEN_FROM + i)
  const max = Math.max(site.thresholds[2], ...hours.map((h) => values[h])) * 1.08
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const step = plotW / hours.length
  const barW = Math.min(26, step * (narrow ? 0.72 : 0.68))
  const x = (h: number) => PAD_L + (h - OPEN_FROM) * step + (step - barW) / 2
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH

  const showStart = x(SHOW_HOURS[0])
  const showEnd = x(SHOW_HOURS[SHOW_HOURS.length - 1]) + barW

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label="시간대별 예상 혼잡도 막대그래프"
      >
        {/* 등급 기준선 */}
        {site.thresholds.map((t, i) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R + 8} y1={y(t)} y2={y(t)} stroke="var(--color-line-strong)" strokeDasharray="2 4" />
            <text x={W - PAD_R + 12} y={y(t) + 4} fontSize="12" fill="var(--color-ink-3)">
              {narrow ? LEVEL_LABEL[i + 1].replace('매우 ', '매우') : LEVEL_LABEL[i + 1]}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R + 8} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--color-line-strong)" />

        {/* 공연 가정 구간 */}
        {withShow && (
          <g>
            <path
              d={`M${showStart} ${PAD_T - 6} V${PAD_T - 12} H${showEnd} V${PAD_T - 6}`}
              fill="none"
              stroke="var(--color-ink-3)"
              strokeWidth="1"
            />
            <text x={(showStart + showEnd) / 2} y={PAD_T - 16} textAnchor="middle" fontSize="12" fill="var(--color-ink-2)">
              공연 시간대
            </text>
          </g>
        )}

        {/* 막대 */}
        {hours.map((h, i) => {
          const v = values[h]
          const lv = levelOf(site, v)
          const top = y(v)
          const selected = h === hour
          return (
            <g key={`${animKey}-${h}`} onClick={() => onHour(h)} className="cursor-pointer">
              <rect x={x(h) - (step - barW) / 2} y={PAD_T} width={step} height={plotH} fill="transparent" />
              <motion.rect
                x={x(h)}
                width={barW}
                rx={4}
                fill={LEVEL_COLOR[lv]}
                initial={{ y: PAD_T + plotH, height: 0 }}
                animate={{ y: top, height: PAD_T + plotH - top }}
                transition={{ duration: 0.6, delay: i * 0.018, ease: [0.22, 1, 0.36, 1] }}
              />
              {selected && (
                <rect
                  x={x(h) - 3}
                  y={top - 3}
                  width={barW + 6}
                  height={PAD_T + plotH - top + 3}
                  rx={6}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="1.5"
                />
              )}
            </g>
          )
        })}

        {/* 비·눈 예보 시각: 막대 위 물방울 */}
        {hours
          .filter((h) => rainHours.includes(h))
          .map((h) => (
            <path
              key={`rain-${h}`}
              transform={`translate(${x(h) + barW / 2} ${y(values[h]) - 10})`}
              d="M0 -5 C 2 -2 3.5 0 3.5 1.5 A 3.5 3.5 0 0 1 -3.5 1.5 C -3.5 0 -2 -2 0 -5 Z"
              fill="var(--color-ink-3)"
              pointerEvents="none"
              aria-hidden
            />
          ))}

        {/* 지금 */}
        {nowHour !== null && nowHour >= OPEN_FROM && nowHour <= OPEN_TO && (
          <g pointerEvents="none">
            <circle cx={x(nowHour) + barW / 2} cy={PAD_T + plotH + 7} r={3} fill="var(--color-park)" />
            <text x={x(nowHour) + barW / 2} y={H - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-park)">
              지금
            </text>
          </g>
        )}

        {/* 시간 축 */}
        {hours
          .filter((h) => h % (narrow ? 6 : 3) === 0 && (nowHour === null || Math.abs(h - nowHour) > 1))
          .map((h) => (
            <text key={h} x={x(h) + barW / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--color-ink-3)" className="num">
              {h}시
            </text>
          ))}
      </svg>

      {/* 키보드 접근용 시간 선택 */}
      <label className="sr-only" htmlFor="hour-select">
        시간 선택
      </label>
      <select
        id="hour-select"
        className="sr-only"
        value={hour}
        onChange={(e) => onHour(Number(e.target.value))}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </div>
  )
}
