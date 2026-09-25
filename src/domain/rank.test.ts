import { describe, expect, test } from 'vitest'
import { BALANCED, rank } from './rank.ts'
import type { PainLevel } from './types.ts'

type Problem = { readonly title: string; readonly metrics: { accounts: number; arr: number; pain: PainLevel; delta: number } }
const problem = (title: string, accounts: number, arr: number, pain: PainLevel, delta: number): Problem => ({
  title,
  metrics: { accounts, arr, pain, delta },
})

// Prototype D's numbers, in the prototype's PROBLEMS order.
const PROTOTYPE = [
  problem('CSV imports fail silently on malformed rows', 38, 1_420_000, 3, 0.2712),
  problem('Field mapping must be redone for every import', 27, 980_000, 2, 0.0541),
  problem('No way to backfill historical data', 12, 610_000, 2, 0.2203),
  problem("Dashboard totals don't match the source system", 44, 2_310_000, 3, 0.3607),
  problem("Can't tell when data was last refreshed", 31, 1_050_000, 1, 0),
  problem('Timezone handling shifts daily counts', 9, 420_000, 1, -0.4615),
  problem('Exported charts lose formatting in slides', 22, 540_000, 1, -0.5),
  problem('Viewers need a paid seat to see a dashboard', 35, 1_880_000, 2, 0.2535),
  problem('No scheduled email digest', 17, 390_000, 0, 0.0385),
  problem("Admins can't restrict access by team", 19, 1_640_000, 3, 0.25),
  problem('Usage-based bill is unpredictable', 26, 1_120_000, 2, 0.2222),
  problem('SSO setup requires contacting support', 8, 720_000, 1, -0.0278),
] as const

describe('rank with Balanced weights', () => {
  test('orders the prototype problems as prototype D does', () => {
    const ranked = rank(PROTOTYPE, BALANCED)
    expect(ranked.slice(0, 5).map((r) => r.item.title)).toEqual([
      "Dashboard totals don't match the source system",
      'CSV imports fail silently on malformed rows',
      'Viewers need a paid seat to see a dashboard',
      "Admins can't restrict access by team",
      'Usage-based bill is unpredictable',
    ])
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  test('splits the top score into its four weighted parts, normalized against the set', () => {
    const [top] = rank(PROTOTYPE, BALANCED)
    expect(top.score.parts.reach).toBeCloseTo(30, 2)
    expect(top.score.parts.revenue).toBeCloseTo(35, 2)
    expect(top.score.parts.pain).toBeCloseTo(20, 2)
    expect(top.score.parts.momentum).toBeCloseTo(11.01, 2)
    expect(top.score.total).toBeCloseTo(96.01, 2)
  })

  test('clamps momentum to zero below the floor and breaks score ties by ARR, then input order', () => {
    const ranked = rank(
      [problem('first', 10, 100_000, 0, -0.9), problem('second', 10, 100_000, 0, -0.9), problem('richer', 10, 200_000, 0, -1)],
      { reach: 1, revenue: 0, pain: 0, momentum: 1 },
    )
    expect(ranked.map((r) => [r.item.title, r.score.total, r.score.parts.momentum])).toEqual([
      ['richer', 50, 0],
      ['first', 50, 0],
      ['second', 50, 0],
    ])
  })
})
