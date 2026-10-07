import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, like } from 'drizzle-orm'
import { afterAll, expect, test } from 'vitest'
import { pool } from '@/db/client'
import * as t from '@/db/schema'
import { buildSeed, SEED_WORKSPACE_ID, seedId } from '@/db/seed/build'
import { writeSeed } from '@/db/seed/write'
import { insertWorkspace, rollbackAfter } from '@/db/testing'
import type { Confidence, ItemId, RawText, RedactedText } from '@/domain/types'
import { importAccounts, importItems } from './ingest.server'
import { loadAccounts, loadItem, loadSource, loadSources } from './sources.server'

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../../fixtures/exports', name)))

afterAll(() => pool.end())

test('the sources, source, item, and accounts screens read imported data without the raw text', async () => {
  const result = await rollbackAfter(async (tx) => {
    const ws = await insertWorkspace(tx)
    await importAccounts(tx, fixture('accounts-60.csv'), ws)
    const imported = await importItems(tx, {
      fileName: 'zendesk-500.csv',
      bytes: fixture('zendesk-500.csv'),
      mapping: { text: 'Description', date: 'Created at', dateFormat: 'YYYY-MM-DD', account: 'Organization ID', author: 'Requester role' },
      itemKind: 'ticket',
    }, ws)
    if (imported.kind !== 'imported') throw new Error(imported.message)
    const [jane] = await tx
      .select({ id: t.item.id })
      .from(t.item)
      .where(and(eq(t.item.sourceId, imported.sourceId), like(t.item.body, '%jane@acme.com%')))
    if (!jane) throw new Error('no jane item')

    const sources = await loadSources(tx, ws)
    const source = await loadSource(tx, imported.sourceId, ws)
    const item = await loadItem(tx, jane.id, ws)
    const accounts = await loadAccounts(tx, ws)
    return {
      sources: sources.map(({ name, itemKind, items }) => ({ name, itemKind, items })),
      source: source.kind === 'ready' ? { items: source.source.items, recent: source.recent.length, mapping: source.source.mapping } : source,
      item: item.kind === 'ready' ? { ...item.item, id: undefined, source: item.item.source.name } : item,
      acc002: accounts.find((a) => a.externalId === 'ACC-002'),
      accounts: accounts.length,
      leaks: JSON.stringify({ sources, source, item }).includes('jane@acme.com'),
      missing: await loadItem(tx, '00000000-0000-0000-0000-000000000000' as typeof jane.id, ws),
      otherWorkspace: (await loadItem(tx, jane.id)).kind,
    }
  })

  expect(result.sources).toEqual([{ name: 'zendesk-500', itemKind: 'ticket', items: 500 }])
  expect(result.source).toEqual({
    items: 500,
    recent: 100,
    mapping: { text: 'Description', date: 'Created at', dateFormat: 'YYYY-MM-DD', account: 'Organization ID', author: 'Requester role' },
  })
  expect(result.item).toEqual({
    id: undefined,
    date: '2026-09-11',
    role: 'executive',
    source: 'zendesk-500',
    account: { name: 'Driftwood Analytics', arr: 383500 },
    sentences: [
      { ordinal: 0, text: "Hi, I'm Jane from Acme." },
      { ordinal: 1, text: 'Please email me at [email] or call [phone] about the "Revenue" dashboard.' },
      { ordinal: 2, text: 'Our totals are 8% lower than Salesforce, and my CFO noticed.' },
    ],
    mentions: [],
  })
  expect(result.acc002).toMatchObject({ name: 'Brightline Analytics', arr: 114000, plan: 'Enterprise', segment: 'Mid-market' })
  expect(result.accounts).toBe(60)
  expect(result.otherWorkspace).toBe('missing')
  expect(result.leaks).toBe(false)
  expect(result.missing).toEqual({ kind: 'missing' })
})

test('an item lists its mentions by first sentence with the opportunity, confidence, and low-confidence flag', async () => {
  const { lumen, multi } = await rollbackAfter(async (tx) => {
    await writeSeed(tx, buildSeed())
    const [source] = await tx.select({ id: t.source.id }).from(t.source).limit(1)
    if (!source) throw new Error('no source')
    const [added] = await tx
      .insert(t.item)
      .values({
        workspaceId: SEED_WORKSPACE_ID,
        sourceId: source.id,
        externalId: 'two-mentions',
        body: 'unused' as RawText,
        occurredAt: new Date('2026-09-19T15:00:00Z'),
      })
      .returning({ id: t.item.id })
    if (!added) throw new Error('no item')
    await tx.insert(t.sentence).values(
      ['Hello.', 'The totals are wrong.', 'Please add a lineage view.', 'Thanks.'].map((text, ordinal) => ({
        itemId: added.id,
        ordinal,
        text: text as RedactedText,
      })),
    )
    const packId = seedId('pack', 'product-insights/0.3.0')
    const place = async (ordinal: number, start: number, end: number, to: 'p4' | 'p4/s1' | null, confidence: number) => {
      const [created] = await tx
        .insert(t.mention)
        .values({ packId, itemId: added.id, ordinal, sentenceStart: start, sentenceEnd: end })
        .returning({ id: t.mention.id })
      if (!created || to === null) return
      const opportunityId = seedId('opportunity', to)
      const [answer] = await tx
        .insert(t.judgeAnswer)
        .values({
          packId,
          itemId: added.id,
          questionKey: 'place',
          subject: `m${String(ordinal)}`,
          value: { type: 'choice', option: opportunityId },
          probabilities: { [opportunityId]: confidence },
          confidence: confidence as Confidence,
          backend: 'recorded',
          modelVersion: 'recorded-1.0.0',
        })
        .returning({ id: t.judgeAnswer.id })
      if (!answer) throw new Error('no answer')
      await tx
        .insert(t.placement)
        .values({ mentionId: created.id, opportunityId, judgeAnswerId: answer.id, confidence: confidence as Confidence })
    }
    // Inserted out of order, so the read has to sort.
    await place(0, 2, 2, 'p4/s1', 0.55)
    await place(1, 1, 1, 'p4', 0.9)
    await place(2, 3, 3, null, 0)
    const strip = (detail: Awaited<ReturnType<typeof loadItem>>) =>
      detail.kind === 'ready' ? detail.item.mentions.map(({ span, placement }) => ({ span, placement })) : detail
    return {
      lumen: strip(await loadItem(tx, '0a58b63a-5af8-8375-8d7c-d91d9dfda0d3' as ItemId, SEED_WORKSPACE_ID)),
      multi: strip(await loadItem(tx, added.id, SEED_WORKSPACE_ID)),
    }
  })

  const problem = { kind: 'problem', title: "Dashboard totals don't match the source system", within: 'Trust the numbers in reports' }
  expect(lumen).toEqual([
    {
      span: { start: 0, end: 0 },
      placement: { opportunity: { id: seedId('opportunity', 'p4'), ...problem }, confidence: 0.62, lowConfidence: 0.62 },
    },
  ])
  expect(multi).toEqual([
    {
      span: { start: 1, end: 1 },
      placement: { opportunity: { id: seedId('opportunity', 'p4'), ...problem }, confidence: 0.9, lowConfidence: null },
    },
    {
      span: { start: 2, end: 2 },
      placement: {
        opportunity: {
          id: seedId('opportunity', 'p4/s1'),
          kind: 'solution',
          title: 'Show calculation lineage per metric',
          within: "Dashboard totals don't match the source system",
        },
        confidence: 0.55,
        lowConfidence: 0.55,
      },
    },
    { span: { start: 3, end: 3 }, placement: null },
  ])
})
