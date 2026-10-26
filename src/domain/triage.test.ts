import { describe, expect, test } from 'vitest'
import { computeMetrics, type Measured } from './metrics.ts'
import { decide, decidedPlacement, type TriageChoice } from './triage.ts'
import type { AccountId, Confidence, Item, ItemId, MentionId, Opportunity, OpportunityId, Placement, SourceId, Usd } from './types.ts'

const oid = (id: string) => id as OpportunityId
const tree: Opportunity[] = [
  { id: oid('o'), kind: 'outcome', parentId: null, title: 'o' },
  { id: oid('csv'), kind: 'problem', parentId: oid('o'), title: 'csv' },
  { id: oid('mapping'), kind: 'problem', parentId: oid('o'), title: 'mapping' },
]
const item = (id: string, account: string): Item => ({
  id: id as ItemId,
  sourceId: 'zendesk' as SourceId,
  accountId: account as AccountId,
  role: null,
  occurredAt: new Date('2026-09-14T15:00:00Z'),
  pain: null,
})
const placed = (mentionId: string, itemId: string, opportunityId: string, confidence: number): Placement => ({
  mentionId: mentionId as MentionId,
  itemId: itemId as ItemId,
  opportunityId: oid(opportunityId),
  confidence: confidence as Confidence,
})
const judged = [placed('m1', 'i1', 'csv', 0.58), placed('m2', 'i2', 'csv', 0.91), placed('m3', 'i3', 'mapping', 0.88)]

function measure(placements: readonly Placement[]) {
  const { opportunities } = computeMetrics(
    {
      opportunities: tree,
      placements,
      items: [item('i1', 'juniper'), item('i2', 'cobalt'), item('i3', 'halcyon')],
      accounts: [
        { id: 'juniper' as AccountId, name: 'Juniper', arr: 184_000 as Usd },
        { id: 'cobalt' as AccountId, name: 'Cobalt', arr: 310_000 as Usd },
        { id: 'halcyon' as AccountId, name: 'Halcyon', arr: 240_000 as Usd },
      ],
      placeThreshold: 0.7 as Confidence,
    },
    { asOf: new Date('2026-09-19T00:00:00Z') },
  )
  const metrics = (id: string) => {
    const node = opportunities.find((o: Measured) => o.id === id)
    if (!node) throw new Error(`no node ${id}`)
    return { mentions: node.metrics.mentions, needsReview: node.metrics.needsReview, arr: node.metrics.arr }
  }
  return { csv: metrics('csv'), mapping: metrics('mapping'), outcome: metrics('o') }
}

/** The map's numbers after one decision on m1. */
function afterDeciding(choice: TriageChoice) {
  const [first, ...rest] = judged
  if (!first) throw new Error('no placement')
  const label = decide(first, choice)
  return { label, ...measure([decidedPlacement(first, label.human), ...rest].filter((p) => p !== null)) }
}

describe('triage decisions', () => {
  test('before any decision the low-confidence mention counts on the judge’s problem and needs review', () => {
    const { csv, mapping } = measure(judged)
    expect(csv).toEqual({ mentions: 2, needsReview: 1, arr: 494_000 })
    expect(mapping).toEqual({ mentions: 1, needsReview: 0, arr: 240_000 })
  })

  test('a move writes one label with the old and new opportunity ids and changes both opportunities’ counts', () => {
    const { label, csv, mapping, outcome } = afterDeciding({ action: 'move', to: oid('mapping') })
    expect(label).toEqual({
      mentionId: 'm1',
      judgeOpportunityId: 'csv',
      judgeConfidence: 0.58,
      human: { action: 'move', opportunityId: 'mapping' },
    })
    expect(csv).toEqual({ mentions: 1, needsReview: 0, arr: 310_000 })
    expect(mapping).toEqual({ mentions: 2, needsReview: 0, arr: 424_000 })
    expect(outcome).toEqual({ mentions: 3, needsReview: 0, arr: 734_000 })
  })

  test('an accept keeps the judge’s problem and clears its needs-review mark', () => {
    const { label, csv } = afterDeciding({ action: 'accept' })
    expect(label.human).toEqual({ action: 'accept', opportunityId: 'csv' })
    expect(csv).toEqual({ mentions: 2, needsReview: 0, arr: 494_000 })
  })

  test('a discard takes the mention off every opportunity', () => {
    const { label, csv, mapping, outcome } = afterDeciding({ action: 'discard' })
    expect(label.human).toEqual({ action: 'discard', opportunityId: null })
    expect(csv).toEqual({ mentions: 1, needsReview: 0, arr: 310_000 })
    expect(mapping).toEqual({ mentions: 1, needsReview: 0, arr: 240_000 })
    expect(outcome).toEqual({ mentions: 2, needsReview: 0, arr: 550_000 })
  })

  test('a move to the judge’s own problem is an accept', () => {
    expect(afterDeciding({ action: 'move', to: oid('csv') }).label.human).toEqual({ action: 'accept', opportunityId: 'csv' })
  })
})
