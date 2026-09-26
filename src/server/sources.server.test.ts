import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, like } from 'drizzle-orm'
import { afterAll, expect, test } from 'vitest'
import { pool } from '@/db/client'
import * as t from '@/db/schema'
import { insertWorkspace, rollbackAfter } from '@/db/testing'
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
  })
  expect(result.acc002).toMatchObject({ name: 'Brightline Analytics', arr: 114000, plan: 'Enterprise', segment: 'Mid-market' })
  expect(result.accounts).toBe(60)
  expect(result.otherWorkspace).toBe('missing')
  expect(result.leaks).toBe(false)
  expect(result.missing).toEqual({ kind: 'missing' })
})
