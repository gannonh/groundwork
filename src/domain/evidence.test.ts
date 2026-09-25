import { describe, expect, test } from 'vitest'
import { selectQuotes } from './evidence.ts'
import type { CountedMention } from './metrics.ts'
import type { Account, AccountId, Confidence, ItemId, MentionId, Usd } from './types.ts'

const account = (id: string, arr: number): Account => ({ id: id as AccountId, name: id, arr: arr as Usd })
const mention = (id: string, accountId: string, date: string, lowConfidence: number | null = null): CountedMention => ({
  mentionId: id as MentionId,
  itemId: `item-${id}` as ItemId,
  accountId: accountId as AccountId,
  occurredAt: new Date(`${date}T15:00:00Z`),
  lowConfidence: lowConfidence as Confidence | null,
})
const accounts = new Map(
  [account('halcyon', 240_000), account('northwind', 150_000), account('orbitly', 132_000), account('lumen', 74_000)].map(
    (a) => [a.id, a],
  ),
)
const pick = (evidence: CountedMention[]) =>
  selectQuotes(evidence, accounts).map((m) => [m.mentionId, m.accountId, m.lowConfidence])

describe('selectQuotes', () => {
  test('a low-confidence mention from an account that is already quoted still gets a slot', () => {
    // Newest first, as computeMetrics orders evidence. Northwind has a confident and a low mention.
    expect(
      pick([
        mention('n-low', 'northwind', '2026-09-18', 0.61),
        mention('h1', 'halcyon', '2026-09-17'),
        mention('n1', 'northwind', '2026-09-16'),
        mention('o1', 'orbitly', '2026-09-15'),
        mention('l1', 'lumen', '2026-09-14'),
      ]),
    ).toEqual([
      ['h1', 'halcyon', null],
      ['n1', 'northwind', null],
      ['o1', 'orbitly', null],
      ['n-low', 'northwind', 0.61],
    ])
  })

  test('when every low mention is from a quoted account, the highest-ARR account gets the spare slot', () => {
    expect(
      pick([
        mention('o-low', 'orbitly', '2026-09-18', 0.58),
        mention('h1', 'halcyon', '2026-09-17'),
        mention('n1', 'northwind', '2026-09-16'),
        mention('o1', 'orbitly', '2026-09-15'),
        mention('h-low', 'halcyon', '2026-09-13', 0.64),
      ]),
    ).toEqual([
      ['h1', 'halcyon', null],
      ['n1', 'northwind', null],
      ['o1', 'orbitly', null],
      ['h-low', 'halcyon', 0.64],
    ])
  })

  test('low-confidence voices from accounts not yet shown fill the remaining slots by ARR', () => {
    expect(
      pick([
        mention('h1', 'halcyon', '2026-09-17'),
        mention('n1', 'northwind', '2026-09-16'),
        mention('o1', 'orbitly', '2026-09-15'),
        mention('l-new', 'lumen', '2026-09-14', 0.62),
        mention('l-old', 'lumen', '2026-09-01', 0.55),
      ]),
    ).toEqual([
      ['h1', 'halcyon', null],
      ['n1', 'northwind', null],
      ['o1', 'orbitly', null],
      ['l-new', 'lumen', 0.62],
    ])
  })
})
