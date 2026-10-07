import { and, count, desc, eq, lte, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import { describeRun, type RunFailure, type RunState } from '@/domain/run'
import type { ItemId, RunId, SourceId } from '@/domain/types'
import { loadPackFile, loadTemplateFile } from '@/pipeline/files'
import { PackConflictError, pendingItems, startRun } from '@/pipeline/run'
import { packFromDefinition, samePack, type Pack } from '@/pack/pack'

/** The run panel on a source's page. `unavailable` explains why a run cannot start. */
export type RunPanel = RunState | { readonly kind: 'unavailable'; readonly message: string }

const LISTED_FAILURES = 20

/** The current pack file, or the reason it cannot be used. */
function currentPack(): { readonly ok: true; readonly pack: Pack } | { readonly ok: false; readonly message: string } {
  const parsed = loadPackFile()
  return parsed.ok ? { ok: true, pack: parsed.value } : { ok: false, message: parsed.error }
}

/** Null when the source does not exist. */
export async function loadRunPanel(db: Db, sourceId: SourceId): Promise<RunPanel | null> {
  const [source] = await db.select({ workspaceId: t.source.workspaceId }).from(t.source).where(eq(t.source.id, sourceId))
  if (!source) return null
  const current = currentPack()
  if (!current.ok) return { kind: 'unavailable', message: current.message }
  const { pack } = current

  const [stored] = await db
    .select({ id: t.pack.id, definition: t.pack.definition })
    .from(t.pack)
    .where(and(eq(t.pack.workspaceId, source.workspaceId), eq(t.pack.name, pack.pack), eq(t.pack.version, pack.version)))
  if (stored && !samePack(packFromDefinition(stored.definition), pack)) {
    return { kind: 'unavailable', message: new PackConflictError(pack).message }
  }
  const [run] = stored
    ? await db
        .select({ id: t.pipelineRun.id, startedAt: t.pipelineRun.startedAt })
        .from(t.pipelineRun)
        .where(and(eq(t.pipelineRun.sourceId, sourceId), eq(t.pipelineRun.packId, stored.id)))
    : []

  const template = loadTemplateFile()
  if (!template.ok) return { kind: 'unavailable', message: template.error }
  const [anyNode] = await db.select({ id: t.opportunity.id }).from(t.opportunity).where(eq(t.opportunity.workspaceId, source.workspaceId)).limit(1)

  const [items] = await db.select({ n: count() }).from(t.item).where(eq(t.item.sourceId, sourceId))
  const [text] = await db
    .select({ characters: sql<number>`coalesce(sum(length(${t.sentence.text})), 0)::int` })
    .from(t.sentence)
    .innerJoin(t.item, eq(t.item.id, t.sentence.itemId))
    .where(eq(t.item.sourceId, sourceId))
  const [started] = run
    ? await db.select({ n: count() }).from(t.item).where(and(eq(t.item.sourceId, sourceId), lte(t.item.createdAt, run.startedAt)))
    : []

  return describeRun({
    items: items?.n ?? 0,
    characters: text?.characters ?? 0,
    model: pack.judge,
    seedOutcomes: anyNode ? [] : template.value.outcomes.map((o) => o.title),
    run: run ? { started: started?.n ?? 0, ...(await loadProgress(db, run.id)) } : null,
  })
}

async function loadProgress(db: Db, runId: RunId) {
  const byStatus = await db
    .select({ status: t.pipelineRunItem.status, n: count() })
    .from(t.pipelineRunItem)
    .where(eq(t.pipelineRunItem.runId, runId))
    .groupBy(t.pipelineRunItem.status)
  const failures: readonly RunFailure[] = (
    await db
      .select({ itemId: t.pipelineRunItem.itemId, error: t.pipelineRunItem.error })
      .from(t.pipelineRunItem)
      .where(and(eq(t.pipelineRunItem.runId, runId), eq(t.pipelineRunItem.status, 'failed')))
      .orderBy(desc(t.pipelineRunItem.finishedAt), desc(t.pipelineRunItem.itemId))
      .limit(LISTED_FAILURES)
  ).map((row) => ({ itemId: row.itemId, message: row.error ?? '' }))
  const n = (status: 'judged' | 'failed') => byStatus.find((row) => row.status === status)?.n ?? 0
  return { judged: n('judged'), failed: n('failed'), failures }
}

export type Enqueue = (runId: RunId, itemIds: readonly ItemId[]) => Promise<void>

/**
 * Opens the run for this source under the current pack file and queues every item that has not finished. Starting a
 * run that is already open queues only what is left, so a second start never judges an item twice.
 */
export async function startSourceRun(db: Db, enqueue: Enqueue, sourceId: SourceId): Promise<RunPanel | null> {
  const current = currentPack()
  if (!current.ok) return { kind: 'unavailable', message: current.message }
  const template = loadTemplateFile()
  if (!template.ok) return { kind: 'unavailable', message: template.error }
  try {
    const started = await startRun(db, { sourceId, pack: current.pack, template: template.value })
    if (!started) return null
    await enqueue(started.runId, await pendingItems(db, started.runId))
  } catch (error) {
    if (error instanceof PackConflictError) return { kind: 'unavailable', message: error.message }
    throw error
  }
  return loadRunPanel(db, sourceId)
}
