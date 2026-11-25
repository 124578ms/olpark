import type { GateLoad } from '../lib/model'

// 올림픽공원 약도. 한국체육산업개발 공원 주차 안내도의 배치를 따라 직접 그렸어요(정북 방향 아님, 축척 없음).
// 좌표계는 1100×780. 출입문은 차량 출입문(입출차 데이터에 있는 7곳)만 표시
const W = 1100
const H = 780

const GATES: Record<string, { x: number; y: number }> = {
  북2: { x: 590, y: 60 },
  동2: { x: 1040, y: 430 },
  남2: { x: 730, y: 720 },
  남3: { x: 480, y: 720 },
  남4: { x: 320, y: 720 },
  서1: { x: 60, y: 590 },
  서2: { x: 60, y: 470 },
}

const VENUES: { name: string; x: number; y: number; rx: number; ry: number; rect?: boolean; main?: boolean; ly?: number }[] = [
  { name: '올림픽수영경기장', x: 660, y: 230, rx: 62, ry: 34 },
  { name: 'KSPO DOME', x: 790, y: 310, rx: 78, ry: 46, main: true },
  { name: '티켓링크 라이브 아레나', x: 770, y: 440, rx: 58, ry: 34 },
  { name: '우리금융아트홀', x: 650, y: 490, rx: 46, ry: 26, rect: true },
  { name: '벨로드롬', x: 600, y: 600, rx: 66, ry: 30 },
  { name: '올림픽홀', x: 900, y: 580, rx: 46, ry: 30 },
  { name: '올림픽테니스경기장', x: 895, y: 470, rx: 50, ry: 28, rect: true },
  { name: '소마미술관', x: 420, y: 650, rx: 50, ry: 22, rect: true, ly: -34 },
  { name: '올림픽파크텔', x: 150, y: 390, rx: 26, ry: 44, rect: true, ly: -58 },
]

const STATIONS: { name: string; x: number; y: number; lines: { n: string; c: string }[]; anchor: 'start' | 'end' | 'middle'; lx: number; ly: number }[] = [
  // 노선 색은 서울 지하철 노선 표준색
  { name: '올림픽공원역', x: 1070, y: 330, lines: [{ n: '5', c: '#996CAC' }, { n: '9', c: '#BDB092' }], anchor: 'end', lx: -46, ly: 8 },
  { name: '한성백제역', x: 205, y: 750, lines: [{ n: '9', c: '#BDB092' }], anchor: 'start', lx: 26, ly: 8 },
  { name: '몽촌토성역', x: 30, y: 750, lines: [{ n: '8', c: '#E6186C' }], anchor: 'start', lx: 26, ly: 8 },
]

function Venue({ v }: { v: (typeof VENUES)[number] }) {
  const common = {
    fill: v.main ? '#ffffff' : '#f8f6f0',
    stroke: v.main ? 'var(--color-sign)' : '#cbc5b6',
    strokeWidth: v.main ? 3 : 2,
  }
  return (
    <g>
      {/* 그림자 */}
      {v.rect ? (
        <rect x={v.x - v.rx} y={v.y - v.ry + 6} width={v.rx * 2} height={v.ry * 2} rx={8} fill="rgb(28 32 29 / 0.07)" />
      ) : (
        <ellipse cx={v.x} cy={v.y + 6} rx={v.rx} ry={v.ry} fill="rgb(28 32 29 / 0.07)" />
      )}
      {v.rect ? (
        <rect x={v.x - v.rx} y={v.y - v.ry} width={v.rx * 2} height={v.ry * 2} rx={8} {...common} />
      ) : (
        <>
          <ellipse cx={v.x} cy={v.y} rx={v.rx} ry={v.ry} {...common} />
          <ellipse cx={v.x} cy={v.y - 4} rx={v.rx * 0.62} ry={v.ry * 0.5} fill="none" stroke={common.stroke} strokeWidth={1.5} opacity={0.6} />
        </>
      )}
      <text
        className={v.main ? undefined : 'map-minor'}
        x={v.x}
        y={v.y + (v.ly ?? v.ry + 26)}
        textAnchor="middle"
        fontSize={v.main ? 26 : 19}
        fontWeight={v.main ? 600 : 500}
        fill={v.main ? 'var(--color-sign)' : 'var(--color-ink-2)'}
      >
        {v.name}
      </text>
    </g>
  )
}

export function ParkMap({ loads, best }: { loads: GateLoad[]; best: GateLoad }) {
  const share = Object.fromEntries(loads.map((g) => [g.gate, g.share]))
  const maxShare = Math.max(...loads.map((g) => g.share))
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="올림픽공원 약도와 차량 출입문 위치">
        {/* 둘레 도로 */}
        <rect width={W} height={H} rx={18} fill="var(--color-road)" />
        <text className="map-minor" x={W / 2 + 60} y={H - 20} textAnchor="middle" fontSize="18" fill="var(--color-ink-3)" letterSpacing="2">
          위례성대로
        </text>
        <text className="map-minor" x={22} y={250} fontSize="18" fill="var(--color-ink-3)" letterSpacing="2" transform="rotate(-90 22 250)" textAnchor="middle">
          올림픽로
        </text>

        {/* 공원 바닥 */}
        <rect x={60} y={60} width={W - 120} height={H - 120} rx={26} fill="var(--color-grass)" />
        {/* 동쪽 경기장 광장 */}
        <path
          d="M600 160 C 720 140, 880 190, 1040 240 L1040 694 Q1040 720 1014 720 L 500 720 C 500 650, 520 560, 585 505 C 660 440, 640 270, 600 160 Z"
          fill="var(--color-paved)"
        />
        {/* 성내천 */}
        <path d="M545 60 C 610 128, 720 158, 840 156 C 950 154, 1005 200, 1040 262" fill="none" stroke="var(--color-water)" strokeWidth="22" strokeLinecap="round" />

        {/* 몽촌토성 언덕과 등고선 */}
        <path
          d="M175 150 C 245 92, 455 82, 520 118 C 572 152, 600 250, 590 330 C 578 430, 540 505, 468 545 C 382 590, 288 560, 228 515 C 165 470, 145 382, 145 302 C 145 232, 146 186, 175 150 Z"
          fill="var(--color-hill)"
        />
        {[0.78, 0.56, 0.34].map((k) => (
          <path
            key={k}
            transform={`translate(${370 * (1 - k)} ${330 * (1 - k)}) scale(${k})`}
            d="M175 150 C 245 92, 455 82, 520 118 C 572 152, 600 250, 590 330 C 578 430, 540 505, 468 545 C 382 590, 288 560, 228 515 C 165 470, 145 382, 145 302 C 145 232, 146 186, 175 150 Z"
            fill="none"
            stroke="var(--color-hill-line)"
            strokeWidth={2 / k}
            opacity={0.8}
          />
        ))}
        {/* 나무 몇 그루 */}
        {[
          [250, 210],
          [300, 430],
          [470, 200],
          [520, 420],
          [205, 330],
          [420, 490],
          [880, 680],
          [980, 650],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy + 4} r={15} fill="rgb(28 32 29 / 0.06)" />
            <circle cx={cx} cy={cy} r={15} fill="#8fbd7f" />
            <circle cx={cx - 4} cy={cy - 4} r={6} fill="#a9d29a" />
          </g>
        ))}
        <text x={370} y={330} textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--color-park)" opacity="0.85">
          몽촌토성
        </text>

        {/* 몽촌호수(해자)와 88호수 */}
        <path d="M128 205 C 100 320, 118 470, 205 560 C 282 628, 420 648, 560 596" fill="none" stroke="var(--color-water)" strokeWidth="32" strokeLinecap="round" />
        <path d="M562 112 C 598 92, 640 124, 634 176 C 628 222, 600 254, 572 238 C 548 206, 544 144, 562 112 Z" fill="var(--color-water)" />
        <text className="map-minor" x={598} y={180} textAnchor="middle" fontSize="17" fill="var(--color-rain)">
          88호수
        </text>
        <text className="map-minor" x={300} y={616} textAnchor="middle" fontSize="17" fill="var(--color-rain)">
          몽촌호수
        </text>

        {/* 평화의문 */}
        <g transform="translate(190 660)">
          <path d="M-46 8 L-10 -22 L-10 8 Z M46 8 L10 -22 L10 8 Z" fill="#f8f6f0" stroke="#cbc5b6" strokeWidth="2" />
          <text className="map-minor" x={0} y={34} textAnchor="middle" fontSize="19" fontWeight="500" fill="var(--color-ink-2)">
            평화의문
          </text>
        </g>

        {VENUES.map((v) => (
          <Venue key={v.name} v={v} />
        ))}

        {/* 지하철역 */}
        {STATIONS.map((s) => (
          <g key={s.name}>
            {s.lines.map((l, i) => (
              <g key={l.n} transform={`translate(${s.x} ${s.y + (i - (s.lines.length - 1) / 2) * 38})`}>
                <circle r={17} fill={l.c} stroke="#fff" strokeWidth="3" />
                <text y={7} textAnchor="middle" fontSize="19" fontWeight="700" fill="#fff">
                  {l.n}
                </text>
              </g>
            ))}
            <text className="map-minor" x={s.x + s.lx} y={s.y + s.ly} textAnchor={s.anchor} fontSize="18" fontWeight="500" fill="var(--color-ink-2)">
              {s.name}
            </text>
          </g>
        ))}

        {/* 출입문 자리: 이용 비율만큼 퍼지는 원 */}
        {Object.entries(GATES).map(([g, p]) => {
          const r = 22 + ((share[g] ?? 0) / maxShare) * 46
          const isBest = g === best.gate
          return <circle key={g} cx={p.x} cy={p.y} r={r} fill={isBest ? 'var(--color-sign)' : 'var(--color-lv2)'} opacity={isBest ? 0.3 : 0.22} />
        })}
      </svg>

      {/* 출입문 표지: 글자가 작아지지 않게 HTML로 겹쳐 올린다 */}
      {Object.entries(GATES).map(([g, p]) => {
        const isBest = g === best.gate
        const s = share[g]
        return (
          <div
            key={g}
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
          >
            {isBest && (
              <span className="mb-0.5 rounded-[5px] bg-sign px-1.5 py-px text-[10px] font-semibold text-white sm:text-[11px]">추천</span>
            )}
            <span
              className={`inline-flex items-baseline gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.12)] sm:px-2 sm:py-1 sm:text-[13px] ${
                isBest ? 'border-sign bg-sign text-white' : 'border-sign/30 bg-surface text-sign'
              }`}
            >
              <span>
                {g}
                <span className="hidden sm:inline">문</span>
              </span>
              {s !== undefined && (
                <span className={`num hidden text-[11px] font-medium sm:inline ${isBest ? 'text-white/75' : 'text-ink-3'}`}>
                  {Math.round(s * 100)}%
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
