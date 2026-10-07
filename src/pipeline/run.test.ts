import * as NodeFs from 'node:fs'
import { count, eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { pool } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { insertWorkspace, rollbackAfter } from '../db/testing.ts'
import type { ItemId, RawText, RedactedText, RunId } from '../domain/types.ts'
import { parseCsv, type Parsed } from '../ingest/csv.ts'
import { guessMapping } from '../ingest/mapping.ts'
import { createRecordedJudge, parseRecording } from '../judge/backends/recorded.ts'
import type { Judge } from '../judge/types.ts'
import { importItems } from '../server/ingest.server.ts'
import { loadPackFile, loadTemplateFile } from './files.ts'
import { loadRunContext, pendingItems, processItem, requeueUnfinished, startRun } from './run.ts'

const bytes = NodeFs.readFileSync('fixtures/exports/zendesk-500.csv')
const recording = parseRecording(NodeFs.readFileSync('fixtures/judge/zendesk-500.jsonl', 'utf8'))
function must<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}
const table = must(parseCsv(bytes))
const pack = must(loadPackFile())
const template = must(loadTemplateFile())

/** A fresh workspace with zendesk-500 imported and a run started on a tree seeded from the template. */
async function startedRun(tx: Parameters<Parameters<typeof rollbackAfter>[0]>[0]) {
  const workspaceId = await insertWorkspace(tx)
  const imported = await importItems(
    tx,
    { fileName: 'zendesk-500.csv', bytes, mapping: guessMapping(table), itemKind: 'ticket' },
    workspaceId,
  )
  if (imported.kind !== 'imported') throw new Error(imported.message)
  const started = await startRun(tx, { sourceId: imported.sourceId, pack, template })
  if (!started) throw new Error('the source is missing')
  const context = await loadRunContext(tx, started.runId)
  if (!context) throw new Error('the run is missing')
  const judge = createRecordedJudge(recording, { packVersion: context.pack.version, model: context.pack.judge })
  return { started, context, judge, items: await pendingItems(tx, started.runId) }
}

afterAll(() => pool.end())

describe('processItem', () => {
  test('running the same item twice creates one placement', async () => {
    const rows = await rollbackAfter(async (tx) => {
      const { context, judge, items } = await startedRun(tx)
      // The first ticket is the Jane ticket: totals 8% lower than Salesforce.
      const [first] = items
      if (!first) throw new Error('no items')
      const firstRun = await processItem(tx, context, judge, first)
      const secondRun = await processItem(tx, context, judge, first)
      // Two workers that both read "not finished" before either writes.
      const [second] = items.slice(1)
      if (!second) throw new Error('no second item')
      const raced = await Promise.all([processItem(tx, context, judge, second), processItem(tx, context, judge, second)])
      const tally = async (query: PromiseLike<{ n: number }[]>) => (await query)[0]?.n
      return {
        outcomes: [firstRun.kind, secondRun.kind, ...raced.map((r) => r.kind)],
        placements: await tally(
          tx.select({ n: count() }).from(t.placement).innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId)).where(eq(t.mention.packId, context.packId)),
        ),
        mentions: await tally(tx.select({ n: count() }).from(t.mention).where(eq(t.mention.packId, context.packId))),
        answers: await tally(tx.select({ n: count() }).from(t.judgeAnswer).where(eq(t.judgeAnswer.packId, context.packId))),
        finished: await tally(tx.select({ n: count() }).from(t.pipelineRunItem).where(eq(t.pipelineRunItem.runId, context.runId))),
      }
    })
    expect(rows).toEqual({ outcomes: ['judged', 'skipped', 'judged', 'judged'], placements: 2, mentions: 2, answers: 18, finished: 2 })
  })

  test('an item the recording has no answer for fails with its ID and the next item still completes', async () => {
    const rows = await rollbackAfter(async (tx) => {
      const { context, judge, items } = await startedRun(tx)
      const [first, second] = items
      if (!first || !second) throw new Error('need two items')
      await tx.update(t.sentence).set({ text: 'A sentence nobody recorded an answer for.' as RedactedText }).where(eq(t.sentence.itemId, first))
      const outcomes = [await processItem(tx, context, judge, first), await processItem(tx, context, judge, second)]
      return { outcomes, first }
    })
    expect(rows.outcomes).toEqual([
      { kind: 'failed', message: expect.stringContaining(`No recorded answer for item ${rows.first}`) as string },
      { kind: 'judged' },
    ])
  })

  test('an item whose judge keeps throwing is retried until the last attempt, then recorded as failed and the run finishes', async () => {
    const rows = await rollbackAfter(async (tx) => {
      const { context, judge, items } = await startedRun(tx)
      const [first] = items
      if (!first) throw new Error('no items')
      const broken: Judge = { provenance: judge.provenance, answer: () => Promise.reject(new Error('connection reset')) }
      const early = await processItem(tx, context, broken, first, true).catch((error: unknown) => (error instanceof Error ? error.message : ''))
      const last = await processItem(tx, context, broken, first, false)
      const pending = await pendingItems(tx, context.runId)
      const [stored] = await tx.select({ status: t.pipelineRunItem.status, error: t.pipelineRunItem.error }).from(t.pipelineRunItem).where(eq(t.pipelineRunItem.itemId, first))
      return { early, last, stillPending: pending.includes(first), stored, first }
    })
    expect(rows.early).toBe('connection reset')
    expect(rows.last).toEqual({ kind: 'failed', message: `Item ${rows.first} failed after its last retry: connection reset` })
    expect(rows.stillPending).toBe(false)
    expect(rows.stored).toEqual({ status: 'failed', error: `Item ${rows.first} failed after its last retry: connection reset` })
  })
})

describe('requeueUnfinished', () => {
  test('a run started with no jobs queued is queued in full, judged to the end, and queues nothing once finished', async () => {
    const rows = await rollbackAfter(async (tx) => {
      const { context, judge, items } = await startedRun(tx)
      const queued: ItemId[] = []
      // Stands in for a worker: it judges whatever the reconcile queues.
      const enqueue = async (_runId: RunId, itemIds: readonly ItemId[]) => {
        queued.push(...itemIds)
        for (const itemId of itemIds) await processItem(tx, context, judge, itemId)
      }
      const first = await requeueUnfinished(tx, enqueue)
      const second = await requeueUnfinished(tx, enqueue)
      const [done] = await tx.select({ n: count() }).from(t.pipelineRunItem).where(eq(t.pipelineRunItem.runId, context.runId))
      return { first, second, queuedAll: queued.length === items.length && queued.every((id, i) => id === items[i]), done: done?.n, pending: (await pendingItems(tx, context.runId)).length }
    })
    expect(rows).toEqual({ first: 500, second: 0, queuedAll: true, done: 500, pending: 0 })
  })

  test('an item that committed after the run read its items, with a created_at before the start, is queued on the next pass', async () => {
    const rows = await rollbackAfter(async (tx) => {
      const { started, context, judge, items } = await startedRun(tx)
      for (const itemId of items) await processItem(tx, context, judge, itemId)
      const [source] = await tx
        .select({ id: t.source.id, workspaceId: t.source.workspaceId })
        .from(t.pipelineRun)
        .innerJoin(t.source, eq(t.source.id, t.pipelineRun.sourceId))
        .where(eq(t.pipelineRun.id, started.runId))
      if (!source) throw new Error('the source is missing')
      const [late] = await tx
        .insert(t.item)
        .values({ workspaceId: source.workspaceId, sourceId: source.id, externalId: 'late', body: 'Late.' as RawText, occurredAt: new Date(), createdAt: new Date(Date.now() - 60_000) })
        .returning({ id: t.item.id })
      const queued: ItemId[] = []
      await requeueUnfinished(tx, (_runId, itemIds) => Promise.resolve(void queued.push(...itemIds)))
      return { queued, late: late?.id }
    })
    expect(rows.queued).toEqual([rows.late])
  })
})
