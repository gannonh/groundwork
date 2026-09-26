import { createHash } from 'node:crypto'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import type { AccountId, ItemKind, SourceId, WorkspaceId } from '@/domain/types'
import { parseAccounts } from '@/ingest/accounts'
import { parseCsv } from '@/ingest/csv'
import { shapeOf, toItemDrafts, type ColumnMapping, type ItemDraft } from '@/ingest/mapping'

export type ItemImportResult =
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'imported'
      readonly sourceId: SourceId
      readonly sourceName: string
      readonly imported: number
      readonly duplicates: number
      readonly skippedEmpty: number
    }

export type AccountImportResult =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'imported'; readonly created: number; readonly updated: number; readonly linkedItems: number }

export type RememberedMapping = { readonly sourceName: string; readonly mapping: ColumnMapping; readonly itemKind: ItemKind }

const ITEM_CHUNK = 1000
const SENTENCE_CHUNK = 5000
const ACCOUNT_CHUNK = 1000

export async function findWorkspace(db: Db): Promise<WorkspaceId | null> {
  const [ws] = await db
    .select({ id: t.workspace.id })
    .from(t.workspace)
    .orderBy(asc(t.workspace.createdAt), asc(t.workspace.id))
    .limit(1)
  return ws?.id ?? null
}

export async function currentWorkspace(db: Db): Promise<WorkspaceId> {
  const found = await findWorkspace(db)
  if (found) return found
  const [created] = await db
    .insert(t.workspace)
    .values({ slug: 'default', name: 'My workspace' })
    .onConflictDoNothing()
    .returning({ id: t.workspace.id })
  if (created) return created.id
  const raced = await findWorkspace(db)
  if (!raced) throw new Error('no workspace after creating one')
  return raced
}

export async function importItems(
  db: Db,
  input: { readonly fileName: string; readonly bytes: Uint8Array; readonly mapping: ColumnMapping; readonly itemKind: ItemKind },
  workspace?: WorkspaceId,
): Promise<ItemImportResult> {
  const table = parseCsv(input.bytes)
  if (!table.ok) return { kind: 'error', message: table.error }
  const drafted = toItemDrafts(table.value, input.mapping)
  if (!drafted.ok) return { kind: 'error', message: drafted.error }
  const { drafts, skippedEmpty } = drafted.value
  const byKey = new Map<string, ItemDraft>(drafts.map((draft) => [rowKey(draft.cells), draft]))

  return db.transaction(async (tx) => {
    const workspaceId = workspace ?? (await currentWorkspace(tx))
    const [source] = await tx
      .insert(t.source)
      .values({
        workspaceId,
        kind: 'upload',
        name: input.fileName.replace(/\.[^.]*$/, '') || input.fileName,
        itemKind: input.itemKind,
        shape: shapeOf(table.value.header),
        fieldMapping: input.mapping,
      })
      .onConflictDoUpdate({
        target: [t.source.workspaceId, t.source.shape],
        set: { itemKind: input.itemKind, fieldMapping: input.mapping },
      })
      .returning({ id: t.source.id, name: t.source.name })
    if (!source) throw new Error('the source upsert returned no row')

    const accounts = new Map(
      (
        await tx
          .select({ id: t.account.id, externalId: t.account.externalId })
          .from(t.account)
          .where(eq(t.account.workspaceId, workspaceId))
      ).map((a): [string, AccountId] => [a.externalId, a.id]),
    )

    let imported = 0
    const entries = [...byKey]
    for (let i = 0; i < entries.length; i += ITEM_CHUNK) {
      const inserted = await tx
        .insert(t.item)
        .values(
          entries.slice(i, i + ITEM_CHUNK).map(([externalId, draft]) => ({
            workspaceId,
            sourceId: source.id,
            externalId,
            body: draft.raw,
            occurredAt: draft.occurredAt,
            accountRef: draft.accountRef,
            accountId: draft.accountRef === null ? null : (accounts.get(draft.accountRef) ?? null),
            authorRole: draft.authorRole,
          })),
        )
        .onConflictDoNothing({ target: [t.item.sourceId, t.item.externalId] })
        .returning({ id: t.item.id, externalId: t.item.externalId })
      imported += inserted.length

      const sentences = inserted.flatMap(({ id, externalId }) =>
        (byKey.get(externalId)?.sentences ?? []).map((text, ordinal) => ({ itemId: id, ordinal, text })),
      )
      for (let j = 0; j < sentences.length; j += SENTENCE_CHUNK) {
        await tx.insert(t.sentence).values(sentences.slice(j, j + SENTENCE_CHUNK))
      }
    }

    return {
      kind: 'imported',
      sourceId: source.id,
      sourceName: source.name,
      imported,
      duplicates: drafts.length - imported,
      skippedEmpty,
    }
  })
}

export async function importAccounts(db: Db, bytes: Uint8Array, workspace?: WorkspaceId): Promise<AccountImportResult> {
  const table = parseCsv(bytes)
  if (!table.ok) return { kind: 'error', message: table.error }
  const parsed = parseAccounts(table.value)
  if (!parsed.ok) return { kind: 'error', message: parsed.error }
  const drafts = parsed.value

  return db.transaction(async (tx) => {
    const workspaceId = workspace ?? (await currentWorkspace(tx))
    const existing = new Set(
      (
        await tx
          .select({ externalId: t.account.externalId })
          .from(t.account)
          .where(eq(t.account.workspaceId, workspaceId))
      ).map((a) => a.externalId),
    )
    for (let i = 0; i < drafts.length; i += ACCOUNT_CHUNK) {
      await tx
        .insert(t.account)
        .values(drafts.slice(i, i + ACCOUNT_CHUNK).map((draft) => ({ workspaceId, ...draft })))
        .onConflictDoUpdate({
          target: [t.account.workspaceId, t.account.externalId],
          set: { name: excluded('name'), arr: excluded('arr'), plan: excluded('plan'), segment: excluded('segment') },
        })
    }
    const linked = await tx
      .update(t.item)
      .set({ accountId: t.account.id })
      .from(t.account)
      .where(
        and(
          eq(t.item.workspaceId, workspaceId),
          eq(t.account.workspaceId, workspaceId),
          eq(t.item.accountRef, t.account.externalId),
          isNull(t.item.accountId),
        ),
      )
      .returning({ id: t.item.id })
    const updated = drafts.filter((d) => existing.has(d.externalId)).length
    return { kind: 'imported', created: drafts.length - updated, updated, linkedItems: linked.length }
  })
}

export async function rememberedMapping(
  db: Db,
  header: readonly string[],
  workspace?: WorkspaceId,
): Promise<RememberedMapping | null> {
  const workspaceId = workspace ?? (await findWorkspace(db))
  if (!workspaceId) return null
  const [row] = await db
    .select({ name: t.source.name, mapping: t.source.fieldMapping, itemKind: t.source.itemKind })
    .from(t.source)
    .where(and(eq(t.source.workspaceId, workspaceId), eq(t.source.shape, shapeOf(header))))
  return row?.mapping ? { sourceName: row.name, mapping: row.mapping, itemKind: row.itemKind } : null
}

function rowKey(cells: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(cells)).digest('hex')
}

function excluded(column: 'name' | 'arr' | 'plan' | 'segment') {
  return sql.raw(`excluded.${column}`)
}
