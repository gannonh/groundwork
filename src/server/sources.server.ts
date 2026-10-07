import { and, asc, count, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import type { SentenceSpan } from '@/domain/evidence'
import { lowConfidenceOf } from '@/domain/metrics'
import type {
  AccountId,
  Confidence,
  IsoDate,
  ItemId,
  ItemKind,
  MentionId,
  OpportunityId,
  RedactedText,
  SourceId,
  SpeakerRole,
  Usd,
  WorkspaceId,
} from '@/domain/types'
import type { ColumnMapping } from '@/ingest/mapping'
import { oldestWorkspace } from './ingest.server'

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

/** One mention in an item, read through the workspace's newest pack like the map. */
export type ItemMention = {
  readonly id: MentionId
  readonly span: SentenceSpan
  /** Null while the judge has not placed the mention. */
  readonly placement: {
    readonly opportunity: {
      readonly id: OpportunityId
      readonly kind: 'outcome' | 'problem' | 'solution'
      readonly title: string
      /** The parent's title: a solution's problem, or a problem's outcome. */
      readonly within: string | null
    }
    readonly confidence: Confidence
    /** Set when the confidence is below the pack's place threshold. */
    readonly lowConfidence: Confidence | null
  } | null
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
        /** By first sentence. */
        readonly mentions: readonly ItemMention[]
        /** The requested mention's sentences when it is this item's, in any pack, so an older link still finds its quote. */
        readonly highlight: SentenceSpan | null
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
  const workspaceId = workspace ?? (await oldestWorkspace(db))
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
  const workspaceId = workspace ?? (await oldestWorkspace(db))
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

export async function loadItem(db: Db, id: ItemId, workspace?: WorkspaceId, mention?: MentionId): Promise<ItemDetail> {
  const workspaceId = workspace ?? (await oldestWorkspace(db))
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
  const mentions = await loadItemMentions(db, id, workspaceId)
  const [linked] = mention
    ? await db
        .select({ start: t.mention.sentenceStart, end: t.mention.sentenceEnd })
        .from(t.mention)
        .where(and(eq(t.mention.id, mention), eq(t.mention.itemId, id)))
    : []
  return {
    kind: 'ready',
    item: {
      id: row.id,
      date: isoDate(row.occurredAt),
      role: row.role,
      source: { id: row.sourceId, name: row.sourceName, itemKind: row.itemKind },
      account: row.accountName !== null && row.accountArr !== null ? { name: row.accountName, arr: row.accountArr } : null,
      sentences,
      mentions,
      highlight: linked ? { start: linked.start, end: linked.end } : null,
    },
  }
}

async function loadItemMentions(db: Db, itemId: ItemId, workspaceId: WorkspaceId): Promise<readonly ItemMention[]> {
  const [pack] = await db
    .select({ id: t.pack.id, placeThreshold: t.pack.placeThreshold })
    .from(t.pack)
    .where(eq(t.pack.workspaceId, workspaceId))
    .orderBy(desc(t.pack.createdAt), desc(t.pack.id))
    .limit(1)
  if (!pack) return []
  const parent = alias(t.opportunity, 'parent')
  const rows = await db
    .select({
      id: t.mention.id,
      start: t.mention.sentenceStart,
      end: t.mention.sentenceEnd,
      opportunityId: t.opportunity.id,
      kind: t.opportunity.kind,
      title: t.opportunity.title,
      within: parent.title,
      confidence: t.placement.confidence,
    })
    .from(t.mention)
    .leftJoin(t.placement, eq(t.placement.mentionId, t.mention.id))
    .leftJoin(t.opportunity, eq(t.opportunity.id, t.placement.opportunityId))
    .leftJoin(parent, eq(parent.id, t.opportunity.parentId))
    .where(and(eq(t.mention.itemId, itemId), eq(t.mention.packId, pack.id)))
    .orderBy(asc(t.mention.sentenceStart), asc(t.mention.sentenceEnd), asc(t.mention.ordinal))
  return rows.map((row) => ({
    id: row.id,
    span: { start: row.start, end: row.end },
    placement:
      row.opportunityId !== null && row.kind !== null && row.title !== null && row.confidence !== null
        ? {
            opportunity: { id: row.opportunityId, kind: row.kind, title: row.title, within: row.within },
            confidence: row.confidence,
            lowConfidence: lowConfidenceOf(row.confidence, pack.placeThreshold),
          }
        : null,
  }))
}

export async function loadAccounts(db: Db, workspace?: WorkspaceId): Promise<readonly AccountRow[]> {
  const workspaceId = workspace ?? (await oldestWorkspace(db))
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
