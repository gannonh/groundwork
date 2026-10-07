import { and, asc, eq, inArray, lte, notExists, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import * as t from '../db/schema.ts'
import type { Confidence, ItemId, PackId, RunId, SourceId, WorkspaceId } from '../domain/types.ts'
import { isNonEmpty } from '../domain/types.ts'
import { JudgeError, type Judge } from '../judge/types.ts'
import { packFromDefinition, samePack, type Pack } from '../pack/pack.ts'
import type { Template } from '../pack/template.ts'
import { judgeItem, type ItemJudgement } from './item.ts'
import type { PlaceTree } from './place.ts'

export class PackConflictError extends Error {
  constructor(pack: Pack) {
    super(
      `Pack ${pack.pack} ${pack.version} was already used with different contents. A change to a pack is a new version, so bump version in the pack file.`,
    )
    this.name = 'PackConflictError'
  }
}

/** Takes a lock that lasts to the end of the transaction, so two starts in one workspace take turns. */
async function lockWorkspace(tx: Db, workspaceId: WorkspaceId): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`workspace:${workspaceId}`}, 0))`)
}

/** Gives a workspace with no tree the template's outcomes and problems. A workspace with a tree is left alone. */
async function ensureTree(tx: Db, workspaceId: WorkspaceId, template: Template): Promise<void> {
  const [existing] = await tx.select({ id: t.opportunity.id }).from(t.opportunity).where(eq(t.opportunity.workspaceId, workspaceId)).limit(1)
  if (existing) return
  for (const outcome of template.outcomes) {
    const [row] = await tx
      .insert(t.opportunity)
      .values({ workspaceId, kind: 'outcome', title: outcome.title })
      .returning({ id: t.opportunity.id })
    if (!row) throw new Error('the outcome insert returned no row')
    await tx
      .insert(t.opportunity)
      .values(outcome.problems.map((p) => ({ workspaceId, kind: 'problem' as const, parentId: row.id, parentKind: 'outcome' as const, title: p.title })))
  }
}

async function ensurePack(tx: Db, workspaceId: WorkspaceId, pack: Pack): Promise<PackId> {
  const found = async () => {
    const [row] = await tx
      .select({ id: t.pack.id, definition: t.pack.definition })
      .from(t.pack)
      .where(and(eq(t.pack.workspaceId, workspaceId), eq(t.pack.name, pack.pack), eq(t.pack.version, pack.version)))
    return row
  }
  const existing = await found()
  if (existing) {
    if (!samePack(packFromDefinition(existing.definition), pack)) throw new PackConflictError(pack)
    return existing.id
  }
  const [row] = await tx
    .insert(t.pack)
    .values({
      workspaceId,
      name: pack.pack,
      version: pack.version,
      judgeModel: pack.judge,
      detectThreshold: pack.thresholds.detect as Confidence,
      placeThreshold: pack.thresholds.place_confidence as Confidence,
      definition: pack,
    })
    .returning({ id: t.pack.id })
  if (!row) throw new Error('the pack insert returned no row')
  return row.id
}

export type StartedRun = { readonly runId: RunId; readonly packId: PackId }

/**
 * Seeds the tree if the workspace has none, records the pack version, and opens the run for this source and pack, or
 * reopens it to take in the items imported since its last start.
 */
export function startRun(db: Db, input: { readonly sourceId: SourceId; readonly pack: Pack; readonly template: Template }): Promise<StartedRun | null> {
  return db.transaction(async (tx) => {
    const [source] = await tx.select({ workspaceId: t.source.workspaceId }).from(t.source).where(eq(t.source.id, input.sourceId))
    if (!source) return null
    await lockWorkspace(tx, source.workspaceId)
    await ensureTree(tx, source.workspaceId, input.template)
    const packId = await ensurePack(tx, source.workspaceId, input.pack)
    const [run] = await tx
      .insert(t.pipelineRun)
      .values({ sourceId: input.sourceId, packId })
      .onConflictDoUpdate({ target: [t.pipelineRun.sourceId, t.pipelineRun.packId], set: { startedAt: sql`now()` } })
      .returning({ id: t.pipelineRun.id })
    if (!run) throw new Error('the run upsert returned no row')
    return { runId: run.id, packId }
  })
}

export type Enqueue = (runId: RunId, itemIds: readonly ItemId[]) => Promise<void>

/**
 * Queues the unfinished items of every run, and returns how many it queued. A running worker calls this on a timer
 * as well as at start, so a run whose jobs were never published (the web process died after the start committed),
 * were lost with the queue, or belong to an item that committed after the start read the run's items, still finishes.
 * Safe to repeat: the queue holds one job per run and item, and an item already finished is skipped.
 */
export async function requeueUnfinished(db: Db, enqueue: Enqueue): Promise<number> {
  let queued = 0
  for (const { id } of await db.select({ id: t.pipelineRun.id }).from(t.pipelineRun)) {
    const itemIds = await pendingItems(db, id)
    if (itemIds.length === 0) continue
    await enqueue(id, itemIds)
    queued += itemIds.length
  }
  return queued
}

/** The run's items that have not finished, in the order they were imported. */
export async function pendingItems(db: Db, runId: RunId): Promise<readonly ItemId[]> {
  const rows = await db
    .select({ id: t.item.id })
    .from(t.pipelineRun)
    .innerJoin(t.item, and(eq(t.item.sourceId, t.pipelineRun.sourceId), lte(t.item.createdAt, t.pipelineRun.startedAt)))
    .where(
      and(
        eq(t.pipelineRun.id, runId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(t.pipelineRunItem)
            .where(and(eq(t.pipelineRunItem.runId, runId), eq(t.pipelineRunItem.itemId, t.item.id))),
        ),
      ),
    )
    .orderBy(asc(t.item.createdAt), asc(t.item.id))
  return rows.map((r) => r.id)
}

export type RunContext = {
  readonly runId: RunId
  readonly packId: PackId
  readonly pack: Pack
  readonly tree: PlaceTree
}

/** The pack a run was opened under and the tree as it is now, sorted by title so option order never varies. */
export async function loadRunContext(db: Db, runId: RunId): Promise<RunContext | null> {
  const [row] = await db
    .select({ packId: t.pack.id, definition: t.pack.definition, workspaceId: t.source.workspaceId })
    .from(t.pipelineRun)
    .innerJoin(t.pack, eq(t.pack.id, t.pipelineRun.packId))
    .innerJoin(t.source, eq(t.source.id, t.pipelineRun.sourceId))
    .where(eq(t.pipelineRun.id, runId))
  if (!row) return null
  const nodes = await db
    .select({ id: t.opportunity.id, kind: t.opportunity.kind, parentId: t.opportunity.parentId, title: t.opportunity.title })
    .from(t.opportunity)
    .where(and(eq(t.opportunity.workspaceId, row.workspaceId), inArray(t.opportunity.kind, ['outcome', 'problem'])))
  const byTitle = <T extends { title: string }>(a: T, b: T) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
  const tree: PlaceTree = nodes
    .filter((n) => n.kind === 'outcome')
    .sort(byTitle)
    .map((outcome) => ({
      id: outcome.id,
      title: outcome.title,
      problems: nodes.filter((n) => n.kind === 'problem' && n.parentId === outcome.id).sort(byTitle),
    }))
  return { runId, packId: row.packId, pack: packFromDefinition(row.definition), tree }
}

export type ItemOutcome =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'judged' }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * Judges one item and stores everything about it in one transaction, or records why it failed. Idempotent per item
 * and pack version: an item already finished is skipped, and rows from a rerun that races a first run are ignored.
 * Anything but a JudgeError is thrown for the queue to retry, unless `retriesLeft` is false: then the item is recorded
 * as failed, because an item with no row would keep its run from finishing.
 */
export async function processItem(db: Db, context: RunContext, judge: Judge, itemId: ItemId, retriesLeft = true): Promise<ItemOutcome> {
  const [finished] = await db
    .select({ itemId: t.pipelineRunItem.itemId })
    .from(t.pipelineRunItem)
    .where(and(eq(t.pipelineRunItem.runId, context.runId), eq(t.pipelineRunItem.itemId, itemId)))
  if (finished) return { kind: 'skipped' }

  const rows = await db
    .select({ ordinal: t.sentence.ordinal, text: t.sentence.text })
    .from(t.sentence)
    .where(eq(t.sentence.itemId, itemId))
    .orderBy(asc(t.sentence.ordinal))
  if (!isNonEmpty(rows)) return recordFailure(db, context, itemId, `Item ${itemId} has no sentences to judge.`)

  try {
    const judgement = await judgeItem(judge, context.pack, context.tree, { id: itemId, sentences: rows })
    await store(db, context, judge, itemId, judgement)
    return { kind: 'judged' }
  } catch (error) {
    if (error instanceof JudgeError) return recordFailure(db, context, itemId, error.message)
    if (retriesLeft) throw error
    const reason = error instanceof Error ? error.message : String(error)
    return recordFailure(db, context, itemId, `Item ${itemId} failed after its last retry: ${reason}`)
  }
}

async function recordFailure(db: Db, context: RunContext, itemId: ItemId, message: string): Promise<ItemOutcome> {
  await db.insert(t.pipelineRunItem).values({ runId: context.runId, itemId, status: 'failed', error: message }).onConflictDoNothing()
  return { kind: 'failed', message }
}

async function store(db: Db, context: RunContext, judge: Judge, itemId: ItemId, judgement: ItemJudgement): Promise<void> {
  const { packId } = context
  await db.transaction(async (tx) => {
    await tx
      .insert(t.judgeAnswer)
      .values(
        judgement.answers.map(({ questionKey, subject, answer }) => ({
          packId,
          itemId,
          questionKey,
          subject,
          value: answer.value,
          probabilities: answer.probabilities,
          confidence: answer.confidence,
          backend: judge.provenance.backend,
          modelVersion: judge.provenance.modelVersion,
        })),
      )
      .onConflictDoNothing()

    const { mention } = judgement
    if (mention) {
      const mentionKey = and(eq(t.mention.packId, packId), eq(t.mention.itemId, itemId), eq(t.mention.ordinal, mention.ordinal))
      await tx
        .insert(t.mention)
        .values({ packId, itemId, ordinal: mention.ordinal, sentenceStart: mention.sentenceStart, sentenceEnd: mention.sentenceEnd })
        .onConflictDoNothing()
      const [stored] = await tx.select({ id: t.mention.id }).from(t.mention).where(mentionKey)
      if (!stored) throw new Error(`mention ${String(mention.ordinal)} of item ${itemId} is missing right after it was stored`)

      const { placement } = mention
      if (placement) {
        const [leaf] = await tx
          .select({ id: t.judgeAnswer.id })
          .from(t.judgeAnswer)
          .where(
            and(
              eq(t.judgeAnswer.packId, packId),
              eq(t.judgeAnswer.itemId, itemId),
              eq(t.judgeAnswer.questionKey, placement.leaf.questionKey),
              eq(t.judgeAnswer.subject, placement.leaf.subject),
            ),
          )
        if (!leaf) throw new Error(`the answer that placed item ${itemId} is missing right after it was stored`)
        await tx
          .insert(t.placement)
          .values({ mentionId: stored.id, opportunityId: placement.opportunityId, judgeAnswerId: leaf.id, confidence: placement.confidence })
          .onConflictDoNothing()
      }
    }
    await tx.insert(t.pipelineRunItem).values({ runId: context.runId, itemId, status: 'judged' }).onConflictDoNothing()
  })
}
