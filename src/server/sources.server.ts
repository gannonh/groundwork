import { and, asc, count, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import type { AccountId, IsoDate, ItemId, ItemKind, RedactedText, SourceId, SpeakerRole, Usd, WorkspaceId } from '@/domain/types'
import type { ColumnMapping } from '@/ingest/mapping'
import { findWorkspace } from './ingest.server'

export type SourceRow = {
  readonly id: SourceId
  readonly name: string
  readonly itemKind: ItemKind
  readonly items: number
  readonly createdAt: IsoDate
}

export type ItemRow = {
  readonly id: ItemId
  readonly date: IsoDate
  readonly account: string | null
  readonly role: SpeakerRole | null
  readonly excerpt: RedactedText
}

export type SourceDetail =
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'ready'
      readonly source: SourceRow & { readonly mapping: ColumnMapping | null }
      readonly recent: readonly ItemRow[]
    }

export type ItemDetail =
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'ready'
      readonly item: {
        readonly id: ItemId
        readonly date: IsoDate
        readonly role: SpeakerRole | null
        readonly source: { readonly id: SourceId; readonly name: string; readonly itemKind: ItemKind }
        readonly account: { readonly name: string; readonly arr: Usd } | null
        readonly sentences: readonly { readonly ordinal: number; readonly text: RedactedText }[]
      }
    }

export type AccountRow = {
  readonly id: AccountId
  readonly externalId: string
  readonly name: string
  readonly arr: Usd
  readonly plan: string | null
  readonly segment: string | null
}

const RECENT_ITEMS = 100

const isoDate = (date: Date) => date.toISOString().slice(0, 10) as IsoDate
const sourceColumns = {
  id: t.source.id,
  name: t.source.name,
  itemKind: t.source.itemKind,
  createdAt: t.source.createdAt,
  items: count(t.item.id),
}

export async function loadSources(db: Db, workspace?: WorkspaceId): Promise<readonly SourceRow[]> {
  const workspaceId = workspace ?? (await findWorkspace(db))
  if (!workspaceId) return []
  const rows = await db
    .select(sourceColumns)
    .from(t.source)
    .leftJoin(t.item, eq(t.item.sourceId, t.source.id))
    .where(eq(t.source.workspaceId, workspaceId))
    .groupBy(t.source.id)
    .orderBy(desc(t.source.createdAt), asc(t.source.name))
  return rows.map((row) => ({ ...row, createdAt: isoDate(row.createdAt) }))
}

export async function loadSource(db: Db, id: SourceId, workspace?: WorkspaceId): Promise<SourceDetail> {
  const workspaceId = workspace ?? (await findWorkspace(db))
  if (!workspaceId) return { kind: 'missing' }
  const [source] = await db
    .select({ ...sourceColumns, mapping: t.source.fieldMapping })
    .from(t.source)
    .leftJoin(t.item, eq(t.item.sourceId, t.source.id))
    .where(and(eq(t.source.id, id), eq(t.source.workspaceId, workspaceId)))
    .groupBy(t.source.id)
  if (!source) return { kind: 'missing' }
  const recent = await db
    .select({
      id: t.item.id,
      occurredAt: t.item.occurredAt,
      account: t.account.name,
      role: t.item.authorRole,
      excerpt: t.sentence.text,
    })
    .from(t.item)
    .innerJoin(t.sentence, and(eq(t.sentence.itemId, t.item.id), eq(t.sentence.ordinal, 0)))
    .leftJoin(t.account, eq(t.account.id, t.item.accountId))
    .where(eq(t.item.sourceId, id))
    .orderBy(desc(t.item.occurredAt), asc(t.item.id))
    .limit(RECENT_ITEMS)
  return {
    kind: 'ready',
    source: { ...source, createdAt: isoDate(source.createdAt) },
    recent: recent.map(({ occurredAt, ...row }) => ({ ...row, date: isoDate(occurredAt) })),
  }
}

export async function loadItem(db: Db, id: ItemId, workspace?: WorkspaceId): Promise<ItemDetail> {
  const workspaceId = workspace ?? (await findWorkspace(db))
  if (!workspaceId) return { kind: 'missing' }
  const [row] = await db
    .select({
      id: t.item.id,
      occurredAt: t.item.occurredAt,
      role: t.item.authorRole,
      sourceId: t.source.id,
      sourceName: t.source.name,
      itemKind: t.source.itemKind,
      accountName: t.account.name,
      accountArr: t.account.arr,
    })
    .from(t.item)
    .innerJoin(t.source, eq(t.source.id, t.item.sourceId))
    .leftJoin(t.account, eq(t.account.id, t.item.accountId))
    .where(and(eq(t.item.id, id), eq(t.item.workspaceId, workspaceId)))
  if (!row) return { kind: 'missing' }
  const sentences = await db
    .select({ ordinal: t.sentence.ordinal, text: t.sentence.text })
    .from(t.sentence)
    .where(eq(t.sentence.itemId, id))
    .orderBy(asc(t.sentence.ordinal))
  return {
    kind: 'ready',
    item: {
      id: row.id,
      date: isoDate(row.occurredAt),
      role: row.role,
      source: { id: row.sourceId, name: row.sourceName, itemKind: row.itemKind },
      account: row.accountName !== null && row.accountArr !== null ? { name: row.accountName, arr: row.accountArr } : null,
      sentences,
    },
  }
}

export async function loadAccounts(db: Db, workspace?: WorkspaceId): Promise<readonly AccountRow[]> {
  const workspaceId = workspace ?? (await findWorkspace(db))
  if (!workspaceId) return []
  return db
    .select({
      id: t.account.id,
      externalId: t.account.externalId,
      name: t.account.name,
      arr: t.account.arr,
      plan: t.account.plan,
      segment: t.account.segment,
    })
    .from(t.account)
    .where(eq(t.account.workspaceId, workspaceId))
    .orderBy(desc(t.account.arr), asc(t.account.name))
}
