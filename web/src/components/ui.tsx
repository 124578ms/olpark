import { animate, useInView, useMotionValue, useTransform, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '../lib/model'

/** 시그니처: 공원 안내판 같은 출입문 표지 */
export function GateChip({ gate, size = 'md' }: { gate: string; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-6 px-2 text-[13px]' : 'h-8 px-3 text-[15px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-sign font-medium text-white ${s}`}
      aria-label={`${gate}문`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="opacity-70">
        <path d="M1 9V4.5L5 1l4 3.5V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {gate}문
    </span>
  )
}

export function LevelBadge({ level }: { level: Level }) {
  const dark = level >= 2
  return (
    <span
      className="inline-flex h-7 items-center rounded-md px-2.5 text-[14px] font-medium"
      style={{ background: LEVEL_COLOR[level], color: dark ? '#fff' : 'var(--color-ink)' }}
    >
      {LEVEL_LABEL[level]}
    </span>
  )
}

/** 숫자가 한 번 굴러 올라가는 효과 (화면에 보일 때 1회) */
export function NumberRoll({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(Math.round(v)))
  useEffect(() => {
    if (!inView) return
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [inView, value, mv])
  return (
    <motion.span ref={ref} className="num">
      {text}
    </motion.span>
  )
}

export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:mb-8">
      <h2 id={id} className="text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-[26px]">
        {title}
      </h2>
      {children && <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>
}
