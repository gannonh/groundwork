import { afterAll, describe, expect, test } from 'vitest'
import { pool } from '@/db/client'
import { workspace } from '@/db/schema'
import { BALANCED, rank } from '@/domain/rank'
import { loadOpportunityMap, type OpportunityMap, type ProblemView } from '@/server/opportunity-map.server'
import { buildSeed, SEED_WORKSPACE_ID } from './seed/build.ts'
import { writeSeed } from './seed/write.ts'
import { rollbackAfter } from './testing.ts'

function problemsOf(map: OpportunityMap): readonly ProblemView[] {
  if (map.kind !== 'ready') throw new Error('expected a ready map')
  return map.problems
}

function byTitle(map: OpportunityMap, title: string): ProblemView {
  const problem = problemsOf(map).find((p) => p.title === title)
  if (!problem) throw new Error(`no problem titled ${title}`)
  return problem
}

describe('pnpm db:seed', () => {
  afterAll(() => pool.end())

  test('computes the prototype numbers for all 12 problems and its Balanced order', async () => {
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      return loadOpportunityMap(tx, SEED_WORKSPACE_ID)
    })

    const problems = problemsOf(map)
    expect(
      Object.fromEntries(
        problems.map((p) => [
          p.title,
          {
            accounts: p.metrics.accounts,
            arr: p.metrics.arr,
            mentions: p.metrics.mentions,
            pain: p.metrics.pain,
            needsReview: p.metrics.needsReview,
          },
        ]),
      ),
    ).toEqual({
      'CSV imports fail silently on malformed rows': { accounts: 38, arr: 1_420_000, mentions: 112, pain: 3, needsReview: 6 },
      'Field mapping must be redone for every import': { accounts: 27, arr: 980_000, mentions: 64, pain: 2, needsReview: 2 },
      'No way to backfill historical data': { accounts: 12, arr: 610_000, mentions: 29, pain: 2, needsReview: 1 },
      "Dashboard totals don't match the source system": { accounts: 44, arr: 2_310_000, mentions: 141, pain: 3, needsReview: 9 },
      "Can't tell when data was last refreshed": { accounts: 31, arr: 1_050_000, mentions: 77, pain: 1, needsReview: 3 },
      'Timezone handling shifts daily counts': { accounts: 9, arr: 420_000, mentions: 18, pain: 1, needsReview: 2 },
      'Exported charts lose formatting in slides': { accounts: 22, arr: 540_000, mentions: 58, pain: 1, needsReview: 4 },
      'Viewers need a paid seat to see a dashboard': { accounts: 35, arr: 1_880_000, mentions: 96, pain: 2, needsReview: 5 },
      'No scheduled email digest': { accounts: 17, arr: 390_000, mentions: 41, pain: 0, needsReview: 3 },
      "Admins can't restrict access by team": { accounts: 19, arr: 1_640_000, mentions: 47, pain: 3, needsReview: 2 },
      'Usage-based bill is unpredictable': { accounts: 26, arr: 1_120_000, mentions: 69, pain: 2, needsReview: 7 },
      'SSO setup requires contacting support': { accounts: 8, arr: 720_000, mentions: 15, pain: 1, needsReview: 0 },
    })

    expect(rank(problems, BALANCED).map((r) => [r.item.title, Math.round(r.score.total)])).toEqual([
      ["Dashboard totals don't match the source system", 96],
      ['CSV imports fail silently on malformed rows', 77],
      ['Viewers need a paid seat to see a dashboard', 75],
      ["Admins can't restrict access by team", 67],
      ['Usage-based bill is unpredictable', 57],
      ['Field mapping must be redone for every import', 52],
      ["Can't tell when data was last refreshed", 49],
      ['No way to backfill historical data', 39],
      ['Exported charts lose formatting in slides', 30],
      ['SSO setup requires contacting support', 28],
      ['No scheduled email digest', 23],
      ['Timezone handling shifts daily counts', 19],
    ])
  })

  test("shows the top problem's trend, solutions, quotes, and top accounts", async () => {
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      return loadOpportunityMap(tx, SEED_WORKSPACE_ID)
    })

    expect(map.kind === 'ready' && map.window).toEqual({ firstWeek: '2026-06-29', lastWeek: '2026-09-14' })
    const top = byTitle(map, "Dashboard totals don't match the source system")
    expect(top.outcome.title).toBe('Trust the numbers in reports')
    expect(top.metrics.weekly).toEqual([6, 5, 8, 11, 9, 9, 13, 16, 13, 14, 19, 18])
    expect(top.metrics.delta).toBeCloseTo(0.3617, 4)
    expect(top.solutions.map((s) => [s.title, s.mentions])).toEqual([
      ['Reconciliation view vs. source', 36],
      ['Show calculation lineage per metric', 29],
      ['Export raw rows behind a number', 14],
    ])
    expect(
      top.quotes.map((q) => [
        q.account?.name,
        q.text.sentences.filter((s) => s.highlighted).map((s) => s.text),
        q.source,
        q.date,
        q.lowConfidence,
      ]),
    ).toEqual([
      ['Cobalt Insurance', ['This is a renewal risk for us.'], 'Zendesk ticket', '2026-09-11', null],
      [
        'Halcyon Bank',
        ['Our CFO saw revenue off by 4% versus Stripe and now nobody trusts the dashboard.'],
        'Gong call',
        '2026-09-18',
        null,
      ],
      [
        'Orbitly',
        ["I have to screenshot the source system next to yours in every exec review to prove it's right."],
        'Interview',
        '2026-09-06',
        null,
      ],
      ['Lumen Clinics', ['Totals are different depending on which page you look at?'], 'G2 review', '2026-08-25', 0.62],
    ])
    expect(top.topAccounts.slice(0, 4).map((a) => [a.name, a.arr])).toEqual([
      ['Cobalt Insurance', 310_000],
      ['Halcyon Bank', 240_000],
      ['Orbitly', 132_000],
      ['Lumen Clinics', 74_000],
    ])
    expect(byTitle(map, "Can't tell when data was last refreshed").link?.identifier).toBe('LIN-417')
    expect(
      problemsOf(map)
        .filter((p) => p.metrics.needsReview > 0 && !p.quotes.some((q) => q.lowConfidence !== null))
        .map((p) => p.title),
    ).toEqual([])
  })

  test('an empty database loads as an empty map, not an error', async () => {
    const map = await rollbackAfter(async (tx) => {
      await tx.delete(workspace)
      return loadOpportunityMap(tx)
    })
    expect(map).toEqual({ kind: 'empty' })
  })
})
