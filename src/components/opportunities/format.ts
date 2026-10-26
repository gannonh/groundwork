import { isLowConfidence } from '@/domain/triage'
import type { Confidence, IsoDate, PainLevel, SpeakerRole } from '@/domain/types'

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

/** '1 mention', '141 mentions'. */
export function mentionCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'mention' : 'mentions'}`
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

/** '62% confident'. Below the pack's place threshold it reads under the threshold: 0.6978 under 0.7 is '69% confident'. */
export function formatConfidence(confidence: Confidence, placeThreshold: Confidence): string {
  // Round, then cap: flooring every value would turn 0.57 into 56 through float error.
  const pct = Math.round(confidence * 100)
  const shown = isLowConfidence(confidence, placeThreshold) ? Math.min(pct, Math.round(placeThreshold * 100) - 1) : pct
  return `${String(shown)}% confident`
}
