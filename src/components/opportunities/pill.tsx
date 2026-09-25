import type { ReactNode } from 'react'
import { formatDelta, trendTone, type TrendTone } from './format'

const TONES: Record<TrendTone | 'warn' | 'linked', string> = {
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  flat: 'bg-line-2 text-ink-2',
  warn: 'bg-warn-soft text-warn',
  linked: 'bg-primary-soft text-primary',
}
const PILL = 'inline-flex items-center gap-1 rounded-[10px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap'

export function Pill({ tone, title, children }: { tone: keyof typeof TONES; title?: string; children: ReactNode }) {
  return (
    <span className={`${PILL} ${TONES[tone]}`} title={title}>
      {children}
    </span>
  )
}

export function LinkedPill({ identifier, url }: { identifier: string; url?: string }) {
  if (!url) return <Pill tone="linked">{identifier}</Pill>
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${PILL} ${TONES.linked} hover:underline`}>
      {identifier}
    </a>
  )
}

const ARROWS: Record<TrendTone, string> = { up: '▲', down: '▼', flat: '■' }

export function TrendPill({ delta }: { delta: number }) {
  const tone = trendTone(delta)
  return (
    <Pill tone={tone} title="Change in mentions, last 4 weeks vs the 4 before">
      {ARROWS[tone]} {formatDelta(delta)}
    </Pill>
  )
}
