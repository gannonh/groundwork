import type { NonEmptyArray, PainLevel } from './types.ts'

export const FACTORS = ['reach', 'revenue', 'pain', 'momentum'] as const
export type Factor = (typeof FACTORS)[number]
/** Relative weights. Any non-negative numbers; rank rescales them to sum to 100. */
export type Weights = Readonly<Record<Factor, number>>
export const PRESETS = [
  { name: 'Balanced', weights: { reach: 30, revenue: 35, pain: 20, momentum: 15 } },
  { name: 'Enterprise', weights: { reach: 10, revenue: 60, pain: 20, momentum: 10 } },
  { name: 'Breadth', weights: { reach: 50, revenue: 10, pain: 20, momentum: 20 } },
  { name: 'Heating up', weights: { reach: 15, revenue: 15, pain: 20, momentum: 50 } },
] as const satisfies readonly { name: string; weights: Weights }[]
export const BALANCED: Weights = PRESETS[0].weights

export function sameWeights(a: Weights, b: Weights): boolean {
  return FACTORS.every((f) => a[f] === b[f])
}

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

/**
 * Pure. Buckets ranked items by `keyOf`, keeping ranked order and positions inside each bucket. Buckets are ordered
 * by the sum of their members' scores desc, then by their best position.
 */
export function groupRanked<T, K>(
  ranked: readonly Ranked<T>[],
  keyOf: (item: T) => K,
): readonly { readonly key: K; readonly members: NonEmptyArray<Ranked<T>> }[] {
  const buckets = new Map<K, [Ranked<T>, ...Ranked<T>[]]>()
  for (const r of ranked) {
    const key = keyOf(r.item)
    const members = buckets.get(key)
    if (members) members.push(r)
    else buckets.set(key, [r])
  }
  const total = (members: readonly Ranked<T>[]) => members.reduce((sum, r) => sum + r.score.total, 0)
  return [...buckets]
    .map(([key, members]) => ({ key, members, total: total(members) }))
    .sort((a, b) => b.total - a.total || a.members[0].position - b.members[0].position)
    .map(({ key, members }) => ({ key, members }))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
