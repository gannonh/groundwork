import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, count, eq, isNotNull, like, or } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { pool, type Db } from '@/db/client'
import * as t from '@/db/schema'
import { rollbackAfter } from '@/db/testing'
import type { SourceId } from '@/domain/types'
import type { ColumnMapping } from '@/ingest/mapping'
import { loadOpportunityMap } from './opportunity-map.server'
import { importAccounts, importItems, rememberedMapping } from './ingest.server'

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../../fixtures/exports', name)))
const ZENDESK = fixture('zendesk-500.csv')
const NPS = fixture('nps-300.csv')
const ACCOUNTS = fixture('accounts-60.csv')
const ZENDESK_MAPPING: ColumnMapping = {
  text: 'Description',
  date: 'Created at',
  dateFormat: 'YYYY-MM-DD',
  account: 'Organization ID',
  author: 'Requester role',
}
const NPS_MAPPING: ColumnMapping = { text: 'Comment', date: 'Submitted', dateFormat: 'DD/MM/YYYY', account: 'Account', author: null }

const importZendesk = (db: Db) =>
  importItems(db, { fileName: 'zendesk-500.csv', bytes: ZENDESK, mapping: ZENDESK_MAPPING, itemKind: 'ticket' })

async function itemCount(db: Db, sourceId: SourceId, where = eq(t.item.sourceId, sourceId)) {
  const [row] = await db.select({ n: count() }).from(t.item).where(where)
  return row?.n
}
async function sourceCount(db: Db) {
  const [row] = await db.select({ n: count() }).from(t.source)
  return row?.n
}
function imported<R extends { kind: string }>(result: R): Extract<R, { kind: 'imported' }> {
  if (result.kind !== 'imported') throw new Error(`expected an import, got ${JSON.stringify(result)}`)
  return result as Extract<R, { kind: 'imported' }>
}

afterAll(() => pool.end())

describe('importItems', () => {
  test('imports 500 tickets, then skips all 500 as duplicates on a second upload', async () => {
    const result = await rollbackAfter(async (tx) => {
      const first = imported(await importZendesk(tx))
      const second = imported(await importZendesk(tx))
      return { first, second, sameSource: first.sourceId === second.sourceId, items: await itemCount(tx, first.sourceId) }
    })
    expect(result).toMatchObject({
      first: { sourceName: 'zendesk-500', imported: 500, duplicates: 0, skippedEmpty: 0 },
      second: { sourceName: 'zendesk-500', imported: 0, duplicates: 500, skippedEmpty: 0 },
      sameSource: true,
      items: 500,
    })
  })

  test('stores redacted sentences and keeps the address only in the raw body', async () => {
    const result = await rollbackAfter(async (tx) => {
      const { sourceId } = imported(await importZendesk(tx))
      const [jane] = await tx
        .select({ id: t.item.id, role: t.item.authorRole, accountRef: t.item.accountRef })
        .from(t.item)
        .where(and(eq(t.item.sourceId, sourceId), like(t.item.body, '%jane@acme.com%')))
      if (!jane) throw new Error('no item holds jane@acme.com in its body')
      const sentences = await tx
        .select({ ordinal: t.sentence.ordinal, text: t.sentence.text })
        .from(t.sentence)
        .where(eq(t.sentence.itemId, jane.id))
        .orderBy(t.sentence.ordinal)
      const [leaks] = await tx
        .select({ n: count() })
        .from(t.sentence)
        .where(
          or(
            like(t.sentence.text, '%jane@acme.com%'),
            like(t.sentence.text, '%555-0100%'),
            like(t.sentence.text, '%4111 1111%'),
            like(t.sentence.text, '%ops@brightline.io%'),
          ),
        )
      return { role: jane.role, accountRef: jane.accountRef, sentences, leaks: leaks?.n }
    })
    expect(result).toEqual({
      role: 'executive',
      accountRef: 'ACC-004',
      sentences: [
        { ordinal: 0, text: "Hi, I'm Jane from Acme." },
        { ordinal: 1, text: 'Please email me at [email] or call [phone] about the "Revenue" dashboard.' },
        { ordinal: 2, text: 'Our totals are 8% lower than Salesforce, and my CFO noticed.' },
      ],
      leaks: 0,
    })
  })

  test.each([
    ['a 0-byte file', new Uint8Array(), 'The file is empty.'],
    [
      'a PNG renamed to .csv',
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
      'This file is not a text CSV.',
    ],
  ])('%s is an error and creates no source', async (_name, bytes, message) => {
    const result = await rollbackAfter(async (tx) => {
      const before = await sourceCount(tx)
      const outcome = await importItems(tx, { fileName: 'bad.csv', bytes, mapping: ZENDESK_MAPPING, itemKind: 'ticket' })
      return { outcome, added: (await sourceCount(tx) ?? 0) - (before ?? 0) }
    })
    expect(result).toEqual({ outcome: { kind: 'error', message }, added: 0 })
  })

  test('reads DD/MM/YYYY NPS dates, and refuses the file when told they are MM/DD/YYYY', async () => {
    const result = await rollbackAfter(async (tx) => {
      const before = await sourceCount(tx)
      const wrong = await importItems(tx, {
        fileName: 'nps-300.csv',
        bytes: NPS,
        mapping: { ...NPS_MAPPING, dateFormat: 'MM/DD/YYYY' },
        itemKind: 'survey_response',
      })
      const afterWrong = await sourceCount(tx)
      const right = imported(await importItems(tx, { fileName: 'nps-300.csv', bytes: NPS, mapping: NPS_MAPPING, itemKind: 'survey_response' }))
      const [first] = await tx
        .select({ occurredAt: t.item.occurredAt })
        .from(t.item)
        .where(eq(t.item.sourceId, right.sourceId))
        .orderBy(t.item.occurredAt)
        .limit(1)
      return { wrong, addedByWrong: (afterWrong ?? 0) - (before ?? 0), right, items: await itemCount(tx, right.sourceId), earliest: first?.occurredAt.toISOString() }
    })
    expect(result).toMatchObject({
      wrong: {
        kind: 'error',
        message: '170 dates don\'t match MM/DD/YYYY (rows 2, 3, 6, and 167 more). Pick the format the "Submitted" column uses.',
      },
      addedByWrong: 0,
      right: { imported: 300, duplicates: 0 },
      items: 300,
      earliest: '2026-06-01T00:00:00.000Z',
    })
  })

  test('remembers the mapping for a file with the same columns', async () => {
    const result = await rollbackAfter(async (tx) => {
      const before = await rememberedMapping(tx, ['Ticket ID', 'Created at', 'Subject', 'Description', 'Requester role', 'Organization ID'])
      await importZendesk(tx)
      const after = await rememberedMapping(tx, ['ticket id', 'Created At', 'Subject', 'Description', 'Requester Role', 'organization id'])
      return { before, after }
    })
    expect(result).toEqual({ before: null, after: { sourceName: 'zendesk-500', mapping: ZENDESK_MAPPING, itemKind: 'ticket' } })
  })
})

describe('importAccounts', () => {
  test('creates 60 accounts, links earlier items by account ID, and updates on a second upload', async () => {
    const result = await rollbackAfter(async (tx) => {
      const { sourceId } = imported(await importZendesk(tx))
      const first = await importAccounts(tx, ACCOUNTS)
      const second = await importAccounts(tx, ACCOUNTS)
      const linked = await itemCount(tx, sourceId, and(eq(t.item.sourceId, sourceId), isNotNull(t.item.accountId)))
      const nps = imported(await importItems(tx, { fileName: 'nps-300.csv', bytes: NPS, mapping: NPS_MAPPING, itemKind: 'survey_response' }))
      const npsLinked = await itemCount(tx, nps.sourceId, and(eq(t.item.sourceId, nps.sourceId), isNotNull(t.item.accountId)))
      const [acme] = await tx
        .select({ name: t.account.name, arr: t.account.arr, plan: t.account.plan, segment: t.account.segment })
        .from(t.account)
        .where(eq(t.account.externalId, 'ACC-002'))
      return { first, second, linked, npsLinked, acme }
    })
    expect(result).toEqual({
      first: { kind: 'imported', created: 60, updated: 0, linkedItems: 450 },
      second: { kind: 'imported', created: 0, updated: 60, linkedItems: 0 },
      linked: 450,
      npsLinked: 300,
      acme: { name: 'Brightline Analytics', arr: 114000, plan: 'Enterprise', segment: 'Mid-market' },
    })
  })

  test('leaves the seeded opportunity map unchanged', async () => {
    const result = await rollbackAfter(async (tx) => {
      const before = await loadOpportunityMap(tx)
      await importZendesk(tx)
      await importAccounts(tx, ACCOUNTS)
      await importItems(tx, { fileName: 'nps-300.csv', bytes: NPS, mapping: NPS_MAPPING, itemKind: 'survey_response' })
      return { before, after: await loadOpportunityMap(tx) }
    })
    expect(result.after).toEqual(result.before)
    expect(result.before.kind).toBe('ready')
  })
})
