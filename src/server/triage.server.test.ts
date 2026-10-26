import { eq } from 'drizzle-orm'
import { afterAll, expect, test } from 'vitest'
import { pool, type Db } from '@/db/client'
import * as t from '@/db/schema'
import { buildSeed, SEED_WORKSPACE_ID, seedId } from '@/db/seed/build'
import { writeSeed } from '@/db/seed/write'
import { rollbackAfter } from '@/db/testing'
import type { MapFilter } from '@/domain/filters'
import type { MentionId, OpportunityId } from '@/domain/types'
import { loadOpportunityMap } from './opportunity-map.server'
import { loadItem } from './sources.server'
import { decideTriage, loadTriage, loadTriageCount } from './triage.server'

afterAll(() => pool.end())

const ws = SEED_WORKSPACE_ID
const EVERYTHING: MapFilter = { since: '1y' }
async function problemMetrics(tx: Db, id: OpportunityId) {
  const map = await loadOpportunityMap(tx, EVERYTHING, ws)
  const problem = map.kind === 'ready' ? map.problems.find((p) => p.id === id) : undefined
  return problem ? { mentions: problem.metrics.mentions, needsReview: problem.metrics.needsReview } : null
}

test('the seeded queue lists every low-confidence placement with the judge’s placement and its runner-up', async () => {
  const { count, view } = await rollbackAfter(async (tx) => {
    await writeSeed(tx, buildSeed())
    return { count: await loadTriageCount(tx, ws), view: await loadTriage(tx, ws) }
  })
  expect(count).toBe(44)
  expect(view.items).toHaveLength(44)
  expect(view.placeThreshold).toBeCloseTo(0.7)
  const lumen = view.items.find((i) => i.account?.name === 'Lumen Clinics')
  expect(lumen?.branches.map((b) => [b.title, b.within, b.probability.toFixed(2)])).toEqual([
    ["Dashboard totals don't match the source system", 'Trust the numbers in reports', '0.62'],
    ["Can't tell when data was last refreshed", 'Trust the numbers in reports', '0.14'],
  ])
  expect(lumen?.none.toFixed(2)).toBe('0.13')
  expect(view.targets).toHaveLength(12)
})

test('accept, move, and discard each write one label, update the map, and leave the queue; a second decision is refused', async () => {
  const result = await rollbackAfter(async (tx) => {
    await writeSeed(tx, buildSeed())
    // Three queued items on three problems, the second moved to its runner-up, so each decision moves its own counts.
    const queue = (await loadTriage(tx, ws)).items
    const first = queue[0]
    const second = queue.find((i) => i.branches[0].opportunityId !== first?.branches[0].opportunityId && i.branches[1] && i.branches[1].opportunityId !== first?.branches[0].opportunityId)
    const moveTo = second?.branches[1]?.opportunityId
    const third = queue.find((i) => ![first, second].some((d) => d?.branches[0].opportunityId === i.branches[0].opportunityId) && i.branches[0].opportunityId !== moveTo)
    if (!first || !second || !third || !moveTo) throw new Error('the seed has no three queued items on distinct problems')
    const judged = first.branches[0].opportunityId
    const moveFrom = second.branches[0].opportunityId
    const discardFrom = third.branches[0].opportunityId

    const before = { accepted: await problemMetrics(tx, judged), from: await problemMetrics(tx, moveFrom), to: await problemMetrics(tx, moveTo), discardFrom: await problemMetrics(tx, discardFrom) }
    const accept = await decideTriage(tx, first.mentionId, { action: 'accept' }, ws)
    const again = await decideTriage(tx, first.mentionId, { action: 'discard' }, ws)
    const move = await decideTriage(tx, second.mentionId, { action: 'move', to: moveTo }, ws)
    const discard = await decideTriage(tx, third.mentionId, { action: 'discard' }, ws)
    const toOutcome = (await loadTriage(tx, ws)).items[0]
    const badMove = toOutcome && (await decideTriage(tx, toOutcome.mentionId, { action: 'move', to: seedId('opportunity', 'o1') }, ws))
    const unknown = await decideTriage(tx, '00000000-0000-8000-8000-000000000000' as MentionId, { action: 'accept' }, ws)
    const after = { accepted: await problemMetrics(tx, judged), from: await problemMetrics(tx, moveFrom), to: await problemMetrics(tx, moveTo), discardFrom: await problemMetrics(tx, discardFrom) }
    const rows = await tx
      .select({ mentionId: t.triageDecision.mentionId, action: t.triageDecision.action, judge: t.triageDecision.judgeOpportunityId, human: t.triageDecision.opportunityId, answer: t.judgeAnswer.questionKey })
      .from(t.triageDecision)
      .innerJoin(t.judgeAnswer, eq(t.judgeAnswer.id, t.triageDecision.judgeAnswerId))
    const view = await loadTriage(tx, ws)
    const discardedItem = await loadItem(tx, third.itemId, ws, third.mentionId)
    return {
      ids: { first: first.mentionId, second: second.mentionId, third: third.mentionId, judged, moveFrom, moveTo, discardFrom },
      outcomes: [accept.kind, again.kind, move.kind, discard.kind, badMove?.kind, unknown.kind],
      before,
      after,
      rows,
      count: await loadTriageCount(tx, ws),
      queued: view.items.map((i) => i.mentionId),
      recent: view.recent.map((r) => [r.action, r.opportunity]),
      discardedMentions: discardedItem.kind === 'ready' ? discardedItem.item.mentions.map((m) => [m.discarded, m.placement]) : null,
    }
  })
  const { ids, before, after } = result
  expect(result.outcomes).toEqual(['decided', 'already-decided', 'decided', 'decided', 'missing', 'missing'])
  expect(result.count).toBe(41)
  expect(result.queued).toHaveLength(41)
  expect(result.queued).not.toContain(ids.first)
  expect(result.queued).not.toContain(ids.second)
  expect(result.queued).not.toContain(ids.third)
  expect(result.rows).toHaveLength(3)
  expect(result.rows).toContainEqual({ mentionId: ids.first, action: 'accept', judge: ids.judged, human: ids.judged, answer: expect.stringMatching(/^place_problem:/) as unknown })
  expect(result.rows).toContainEqual({ mentionId: ids.second, action: 'move', judge: ids.moveFrom, human: ids.moveTo, answer: expect.stringMatching(/^place_problem:/) as unknown })
  expect(result.rows).toContainEqual({ mentionId: ids.third, action: 'discard', judge: ids.discardFrom, human: null, answer: expect.stringMatching(/^place_problem:/) as unknown })
  expect(result.recent.map(([action]) => action).sort()).toEqual(['accept', 'discard', 'move'])
  expect(result.discardedMentions).toEqual([[true, null]])

  const delta = (key: keyof typeof before) => {
    const [b, a] = [before[key], after[key]]
    return b && a ? { mentions: a.mentions - b.mentions, needsReview: a.needsReview - b.needsReview } : null
  }
  expect(new Set([ids.judged, ids.moveFrom, ids.moveTo, ids.discardFrom]).size).toBe(4)
  expect(delta('accepted')).toEqual({ mentions: 0, needsReview: -1 })
  expect(delta('from')).toEqual({ mentions: -1, needsReview: -1 })
  expect(delta('to')).toEqual({ mentions: 1, needsReview: 0 })
  expect(delta('discardFrom')).toEqual({ mentions: -1, needsReview: -1 })
})
