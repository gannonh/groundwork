import type { IsoDate, PainLevel, SpeakerRole } from '@/domain/types'

export const PAIN_LABELS: Record<PainLevel, string> = {
  0: 'Mild annoyance',
  1: 'Slows work',
  2: 'Blocks work',
  3: 'Deal breaker',
}

/** '$2.31M', '$184k'. */
export function formatUsd(value: number): string {
  // Compare after rounding, so 999,999 reads $1.00M rather than $1000k.
  const thousands = Math.round(value / 1000)
  return thousands >= 1000 ? `$${(value / 1e6).toFixed(2)}M` : `$${String(thousands)}k`
}

/** '+36%', '-40%', '0%'. */
export function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100)
  return `${pct > 0 ? '+' : ''}${String(pct)}%`
}

export type TrendTone = 'up' | 'down' | 'flat'
/** A change within ±8% reads as flat. */
export function trendTone(delta: number): TrendTone {
  return delta > 0.08 ? 'up' : delta < -0.08 ? 'down' : 'flat'
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
/** 'Sep 12'. */
export function formatDay(date: IsoDate): string {
  return DAY.format(new Date(`${date}T00:00:00Z`))
}

/** 'end user'. */
export function formatRole(role: SpeakerRole): string {
  return role.replace('_', ' ')
}
