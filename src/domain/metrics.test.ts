import { describe, expect, test } from 'vitest'
import { computeMetrics, evidenceAsOf, type Measured } from './metrics.ts'
import type {
  Account,
  AccountId,
  Confidence,
  Item,
  ItemId,
  MentionId,
  Opportunity,
  OpportunityId,
  PainLevel,
  Placement,
  SourceId,
  Usd,
} from './types.ts'

const oid = (id: string) => id as OpportunityId
const outcome = (id: string): Opportunity => ({ id: oid(id), kind: 'outcome', parentId: null, title: id })
const problem = (id: string, parent: string): Opportunity => ({
  id: oid(id),
  kind: 'problem',
  parentId: oid(parent),
  title: id,
})
const solution = (id: string, parent: string): Opportunity => ({
  id: oid(id),
  kind: 'solution',
  parentId: oid(parent),
  title: id,
})
const account = (id: string, arr: number): Account => ({ id: id as AccountId, name: id, arr: arr as Usd })
const item = (id: string, accountId: string | null, date: string, pain: PainLevel | null = null): Item => ({
  id: id as ItemId,
  sourceId: 'zendesk' as SourceId,
  accountId: accountId as AccountId | null,
  role: null,
  occurredAt: new Date(`${date}T15:00:00Z`),
  pain,
})
const placed = (mentionId: string, itemId: string, opportunityId: string, confidence: number): Placement => ({
  mentionId: mentionId as MentionId,
  itemId: itemId as ItemId,
  opportunityId: oid(opportunityId),
  confidence: confidence as Confidence,
})
const byId = (nodes: readonly Measured[], id: string) => {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new Error(`no node ${id}`)
  return node.metrics
}

const asOf = new Date('2026-09-19T00:00:00Z')
const placeThreshold = 0.7 as Confidence

describe('computeMetrics', () => {
  test('two mentions from one account count as one account and add its ARR once', () => {
    const { opportunities } = computeMetrics(
      {
        opportunities: [outcome('o'), problem('p', 'o')],
        placements: [placed('m1', 'i1', 'p', 0.9), placed('m2', 'i2', 'p', 0.9)],
        items: [item('i1', 'halcyon', '2026-09-14'), item('i2', 'halcyon', '2026-09-15')],
        accounts: [account('halcyon', 240_000)],
        placeThreshold,
      },
      { asOf },
    )
    expect(byId(opportunities, 'p')).toMatchObject({ mentions: 2, accounts: 1, arr: 240_000 })
  })

  test('mentions placed on a solution roll up into its problem and outcome', () => {
    const { opportunities } = computeMetrics(
      {
        opportunities: [outcome('o'), problem('p', 'o'), solution('s', 'p')],
        placements: [placed('m1', 'i1', 'p', 0.9), placed('m2', 'i2', 's', 0.9), placed('m3', 'i3', 's', 0.9)],
        items: [
          item('i1', 'halcyon', '2026-09-14'),
          item('i2', 'cobalt', '2026-09-15'),
          item('i3', 'halcyon', '2026-09-16'),
        ],
        accounts: [account('halcyon', 240_000), account('cobalt', 310_000)],
        placeThreshold,
      },
      { asOf },
    )
    expect(byId(opportunities, 's')).toMatchObject({ mentions: 2, accounts: 2, arr: 550_000 })
    expect(byId(opportunities, 'p')).toMatchObject({ mentions: 3, accounts: 2, arr: 550_000 })
    expect(byId(opportunities, 'o')).toMatchObject({ mentions: 3, accounts: 2, arr: 550_000 })
  })

  test('placements below the threshold still count and are reported as needing review', () => {
    const { opportunities } = computeMetrics(
      {
        opportunities: [outcome('o'), problem('p', 'o'), solution('s', 'p')],
        placements: [placed('m1', 'i1', 'p', 0.62), placed('m2', 'i2', 's', 0.69), placed('m3', 'i3', 's', 0.7)],
        items: [item('i1', 'halcyon', '2026-09-14'), item('i2', 'cobalt', '2026-09-15'), item('i3', null, '2026-09-16')],
        accounts: [account('halcyon', 240_000), account('cobalt', 310_000)],
        placeThreshold,
      },
      { asOf },
    )
    expect(byId(opportunities, 'p')).toMatchObject({ mentions: 3, accounts: 2, arr: 550_000, needsReview: 2 })
    expect(byId(opportunities, 's')).toMatchObject({ mentions: 2, accounts: 1, arr: 310_000, needsReview: 1 })
    expect(byId(opportunities, 'p').evidence.map((m) => [m.mentionId, m.lowConfidence])).toEqual([
      ['m3', null],
      ['m2', 0.69],
      ['m1', 0.62],
    ])
  })

  test('buckets mentions into 12 Monday weeks ending at asOf and compares the last 4 weeks with the 4 before', () => {
    const dates = ['2026-06-29', '2026-08-17', '2026-08-23', '2026-09-14', '2026-09-20', '2026-09-01', '2026-06-28']
    const { window, opportunities } = computeMetrics(
      {
        opportunities: [outcome('o'), problem('p', 'o')],
        placements: dates.map((_, i) => placed(`m${String(i)}`, `i${String(i)}`, 'p', 0.9)),
        items: dates.map((date, i) => item(`i${String(i)}`, null, date)),
        accounts: [],
        placeThreshold,
      },
      { asOf },
    )
    expect(window).toEqual({ firstWeek: '2026-06-29', lastWeek: '2026-09-14' })
    expect(byId(opportunities, 'p')).toMatchObject({
      mentions: 7,
      weekly: [1, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 2],
      delta: 0.5,
    })
  })

  test('pain is the lower median of the answered items', () => {
    const pains: (PainLevel | null)[] = [3, 1, null, 2, 3, 0]
    const { opportunities } = computeMetrics(
      {
        opportunities: [outcome('o'), problem('p', 'o'), problem('q', 'o')],
        placements: [
          ...pains.map((_, i) => placed(`m${String(i)}`, `i${String(i)}`, 'p', 0.9)),
          placed('n0', 'j0', 'q', 0.9),
        ],
        items: [...pains.map((pain, i) => item(`i${String(i)}`, null, '2026-09-14', pain)), item('j0', null, '2026-09-14')],
        accounts: [],
        placeThreshold,
      },
      { asOf },
    )
    expect(byId(opportunities, 'p').pain).toBe(2)
    expect(byId(opportunities, 'q').pain).toBe(null)
    expect(byId(opportunities, 'o').pain).toBe(2)
  })
})

describe('evidenceAsOf', () => {
  test('is the newest item date, or now when there are no items', () => {
    const now = new Date('2026-09-25T12:00:00Z')
    expect(evidenceAsOf([item('a', null, '2026-09-12'), item('b', null, '2026-09-18')], now)).toEqual(
      new Date('2026-09-18T15:00:00Z'),
    )
    expect(evidenceAsOf([], now)).toEqual(now)
  })
})
