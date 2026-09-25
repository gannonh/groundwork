import type { NonEmptyArray, PainLevel } from './types.ts'

export const FACTORS = ['reach', 'revenue', 'pain', 'momentum'] as const
export type Factor = (typeof FACTORS)[number]
/** Relative weights. Any non-negative numbers; rank rescales them to sum to 100. */
export type Weights = Readonly<Record<Factor, number>>
export const BALANCED: Weights = { reach: 30, revenue: 35, pain: 20, momentum: 15 }

/** The metrics rank reads. OpportunityMetrics satisfies it structurally. */
export type RankFactors = {
  readonly accounts: number
  readonly arr: number
  readonly pain: PainLevel | null
  readonly delta: number
}
/** `parts` sum to `total`, and both lie in 0..100. */
export type Score = { readonly total: number; readonly parts: Readonly<Record<Factor, number>> }
/** `position` is 1-based. */
export type Ranked<T> = { readonly item: T; readonly position: number; readonly score: Score }

/** The 4-week delta at which momentum is 0. */
export const MOMENTUM_FLOOR = -0.3
/** The delta range from 0 to full momentum. */
export const MOMENTUM_SPAN = 0.9
const MAX_PAIN = 3

/**
 * Pure and isomorphic. Scores relative to the set passed in:
 *   reach = accounts / max(accounts), revenue = arr / max(arr), pain = (pain ?? 0) / 3,
 *   momentum = clamp01((delta - MOMENTUM_FLOOR) / MOMENTUM_SPAN), part = norm * weight / sum(weights) * 100.
 * Sorted by total desc, then ARR desc, then input order.
 */
export function rank<T extends { readonly metrics: RankFactors }>(
  items: NonEmptyArray<T>,
  weights: Weights,
): NonEmptyArray<Ranked<T>>
export function rank<T extends { readonly metrics: RankFactors }>(
  items: readonly T[],
  weights: Weights,
): readonly Ranked<T>[]
export function rank<T extends { readonly metrics: RankFactors }>(
  items: readonly T[],
  weights: Weights,
): readonly Ranked<T>[] {
  const maxAccounts = Math.max(1, ...items.map((i) => i.metrics.accounts))
  const maxArr = Math.max(1, ...items.map((i) => i.metrics.arr))
  const weightSum = FACTORS.reduce((sum, f) => sum + weights[f], 0) || 1
  const part = (factor: Factor, norm: number) => ((norm * weights[factor]) / weightSum) * 100

  return items
    .map((item, index) => {
      const m = item.metrics
      const parts: Record<Factor, number> = {
        reach: part('reach', m.accounts / maxAccounts),
        revenue: part('revenue', m.arr / maxArr),
        pain: part('pain', (m.pain ?? 0) / MAX_PAIN),
        momentum: part('momentum', clamp01((m.delta - MOMENTUM_FLOOR) / MOMENTUM_SPAN)),
      }
      const total = FACTORS.reduce((sum, f) => sum + parts[f], 0)
      return { item, index, score: { total, parts } }
    })
    .sort((a, b) => b.score.total - a.score.total || b.item.metrics.arr - a.item.metrics.arr || a.index - b.index)
    .map(({ item, score }, i) => ({ item, position: i + 1, score }))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
