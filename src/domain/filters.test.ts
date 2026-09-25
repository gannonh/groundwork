import { describe, expect, test } from 'vitest'
import { filterEvidence, segmentOf, type EvidenceFilter } from './filters.ts'
import { computeMetrics, type Evidence } from './metrics.ts'
import type {
  Account,
  AccountId,
  Confidence,
  Item,
  ItemId,
  MentionId,
  OpportunityId,
  SourceId,
  SpeakerRole,
  Usd,
} from './types.ts'

const account = (id: string, arr: number): Account => ({ id: id as AccountId, name: id, arr: arr as Usd })
const item = (id: string, accountId: string | null, source: string, role: SpeakerRole | null, date: string): Item => ({
  id: id as ItemId,
  sourceId: source as SourceId,
  accountId: accountId as AccountId | null,
  role,
  occurredAt: new Date(`${date}T15:00:00Z`),
  pain: null,
})

const asOf = new Date('2026-09-19T15:00:00Z')
const EVIDENCE: Evidence = {
  opportunities: [
    { id: 'o' as OpportunityId, kind: 'outcome', parentId: null, title: 'o' },
    { id: 'p' as OpportunityId, kind: 'problem', parentId: 'o' as OpportunityId, title: 'p' },
  ],
  accounts: [
    account('halcyon', 240_000),
    account('cobalt', 150_000),
    account('orbitly', 149_999),
    account('lumen', 74_000),
  ],
  items: [
    item('i1', 'halcyon', 'gong', 'executive', '2026-09-18'),
    item('i2', 'cobalt', 'zendesk', 'admin', '2026-08-01'),
    item('i3', 'orbitly', 'zendesk', 'end_user', '2026-09-10'),
    item('i4', 'lumen', 'g2', null, '2026-09-01'),
    item('i5', null, 'nps', 'end_user', '2026-09-15'),
    item('i6', 'halcyon', 'zendesk', 'unknown', '2026-01-05'),
  ],
  placements: ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'].map((itemId, n) => ({
    mentionId: `m${String(n + 1)}` as MentionId,
    itemId: itemId as ItemId,
    opportunityId: 'p' as OpportunityId,
    confidence: 0.9 as Confidence,
  })),
  placeThreshold: 0.7 as Confidence,
}

const kept = (filter: EvidenceFilter) => {
  const evidence = filterEvidence(EVIDENCE, filter, asOf)
  return { items: evidence.items.map((i) => i.id), mentions: evidence.placements.map((p) => p.mentionId) }
}

describe('filterEvidence', () => {
  test('the Enterprise-only filter keeps only accounts with ARR at or above $150k', () => {
    const filtered = filterEvidence(EVIDENCE, { segments: ['enterprise'], since: '1y' }, asOf)
    const [, problem] = computeMetrics(filtered, { asOf }).opportunities
    expect(problem?.metrics.evidence.map((m) => m.accountId)).toEqual(['halcyon', 'cobalt', 'halcyon'])
    expect({ accounts: problem?.metrics.accounts, arr: problem?.metrics.arr }).toEqual({ accounts: 2, arr: 390_000 })
  })

  test('a source filter keeps only items from the ticked sources', () => {
    expect(kept({ sources: ['gong' as SourceId, 'g2' as SourceId], since: '1y' })).toEqual({
      items: ['i1', 'i4'],
      mentions: ['m1', 'm4'],
    })
  })

  test('a speaker filter drops items with another role or none', () => {
    expect(kept({ speakers: ['end_user', 'executive'], since: '1y' }).items).toEqual(['i1', 'i3', 'i5'])
  })

  test('the date filter keeps items within its days of the evidence date', () => {
    expect(kept({ since: '30d' }).items).toEqual(['i1', 'i3', 'i4', 'i5'])
    expect(kept({ since: '90d' }).items).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
  })
})

test('segmentOf puts an account in the highest segment its ARR reaches', () => {
  expect([150_000, 149_999, 80_000, 79_999, 0].map((arr) => segmentOf(arr as Usd))).toEqual([
    'enterprise',
    'mid_market',
    'mid_market',
    'smb',
    'smb',
  ])
})
