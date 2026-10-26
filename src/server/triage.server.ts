import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import { excerpt, type QuoteText } from '@/domain/evidence'
import { decide, isLowConfidence, triageCount, type TriageChoice, type TriageLabel } from '@/domain/triage'
import type { Confidence, IsoDate, ItemId, MentionId, OpportunityId, PackId, RedactedText, TriageAction, WorkspaceId } from '@/domain/types'
import { PLACE_OUTCOME_KEY, placeBranches, type PlaceTree } from '@/pipeline/place'
import { itemLabel } from './opportunity-map.server'

export type BranchView = {
  readonly opportunityId: OpportunityId
  readonly title: string
  /** The outcome, or for a solution its problem. */
  readonly within: string | null
  readonly probability: number
}

export type TriageItemView = {
  readonly mentionId: MentionId
  readonly itemId: ItemId
  readonly text: QuoteText
  readonly account: { readonly name: string; readonly arr: number } | null
  /** 'Zendesk ticket'. */
  readonly source: string
  readonly date: IsoDate
  readonly confidence: Confidence
  /** The judge's placement, which Accept keeps, then its runner-up when the answers name one. */
  readonly branches: readonly [BranchView, ...BranchView[]]
  /** Probability that the mention fits no problem, at either level of the judge's walk. */
  readonly none: number
}

export type TriageView = {
  readonly placeThreshold: Confidence | null
  /** Most recent item first. */
  readonly items: readonly TriageItemView[]
  /** The problems Move can put a quote on, by outcome then title. */
  readonly targets: readonly { readonly id: OpportunityId; readonly title: string; readonly outcome: string }[]
  /** The five latest decisions, newest first. */
  readonly recent: readonly {
    readonly mentionId: MentionId
    readonly itemId: ItemId
    readonly action: TriageAction
    readonly opportunity: string | null
    readonly account: string | null
  }[]
}

export type DecideResult = { readonly kind: 'decided'; readonly label: TriageLabel } | { readonly kind: 'already-decided' } | { readonly kind: 'missing' }

type Scope = { readonly workspaceId: WorkspaceId; readonly packId: PackId; readonly placeThreshold: Confidence }

/** The given workspace, else the oldest, and its newest pack: the pack the map reads through. */
async function triageScope(db: Db, workspaceId: WorkspaceId | undefined): Promise<Scope | null> {
  const [workspace] = await db
    .select({ id: t.workspace.id })
    .from(t.workspace)
    .where(workspaceId ? eq(t.workspace.id, workspaceId) : undefined)
    .orderBy(asc(t.workspace.createdAt), asc(t.workspace.id))
    .limit(1)
  if (!workspace) return null
  const [pack] = await db
    .select({ id: t.pack.id, placeThreshold: t.pack.placeThreshold })
    .from(t.pack)
    .where(eq(t.pack.workspaceId, workspace.id))
    .orderBy(desc(t.pack.createdAt), desc(t.pack.id))
    .limit(1)
  return pack ? { workspaceId: workspace.id, packId: pack.id, placeThreshold: pack.placeThreshold } : null
}

/** Placements below the place threshold that no person has decided: the nav's Triage count. */
export async function loadTriageCount(db: Db, workspaceId?: WorkspaceId): Promise<number> {
  const scope = await triageScope(db, workspaceId)
  if (!scope) return 0
  const rows = await db
    .select({ confidence: t.placement.confidence })
    .from(t.placement)
    .innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    .leftJoin(t.triageDecision, eq(t.triageDecision.mentionId, t.mention.id))
    .where(and(eq(t.mention.packId, scope.packId), eq(t.item.workspaceId, scope.workspaceId), isNull(t.triageDecision.id)))
  return triageCount(
    rows.map((r) => r.confidence),
    scope.placeThreshold,
  )
}

/** The /triage screen: every undecided low-confidence placement with its quote and the judge's top two branches. */
export async function loadTriage(db: Db, workspaceId?: WorkspaceId): Promise<TriageView> {
  const scope = await triageScope(db, workspaceId)
  if (!scope) return { placeThreshold: null, items: [], targets: [], recent: [] }
  const rows = await db
    .select({
      mentionId: t.placement.mentionId,
      opportunityId: t.placement.opportunityId,
      confidence: t.placement.confidence,
      itemId: t.mention.itemId,
      sentenceStart: t.mention.sentenceStart,
      sentenceEnd: t.mention.sentenceEnd,
      occurredAt: t.item.occurredAt,
      accountName: t.account.name,
      accountArr: t.account.arr,
      sourceName: t.source.name,
      itemKind: t.source.itemKind,
    })
    .from(t.placement)
    .innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    .innerJoin(t.source, eq(t.source.id, t.item.sourceId))
    .leftJoin(t.account, eq(t.account.id, t.item.accountId))
    .leftJoin(t.triageDecision, eq(t.triageDecision.mentionId, t.mention.id))
    .where(and(eq(t.mention.packId, scope.packId), eq(t.item.workspaceId, scope.workspaceId), isNull(t.triageDecision.id)))
    .orderBy(desc(t.item.occurredAt), asc(t.mention.id))
  const queued = rows.filter((r) => isLowConfidence(r.confidence, scope.placeThreshold))
  const nodes = await db
    .select({ id: t.opportunity.id, kind: t.opportunity.kind, parentId: t.opportunity.parentId, title: t.opportunity.title })
    .from(t.opportunity)
    .where(eq(t.opportunity.workspaceId, scope.workspaceId))
    .orderBy(asc(t.opportunity.title), asc(t.opportunity.id))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const tree: PlaceTree = nodes
    .filter((n) => n.kind === 'outcome')
    .map((o) => ({ id: o.id, title: o.title, problems: nodes.filter((n) => n.kind === 'problem' && n.parentId === o.id) }))

  const itemIds = [...new Set(queued.map((r) => r.itemId))]
  const anyItem = (column: typeof t.sentence.itemId | typeof t.judgeAnswer.itemId) => sql`${column} = any(${sql.param(itemIds)}::uuid[])`
  const sentenceRows = itemIds.length
    ? await db.select({ itemId: t.sentence.itemId, text: t.sentence.text }).from(t.sentence).where(anyItem(t.sentence.itemId)).orderBy(asc(t.sentence.ordinal))
    : []
  const answerRows = itemIds.length
    ? await db
        .select({ itemId: t.judgeAnswer.itemId, questionKey: t.judgeAnswer.questionKey, probabilities: t.judgeAnswer.probabilities })
        .from(t.judgeAnswer)
        .where(
          and(
            eq(t.judgeAnswer.packId, scope.packId),
            eq(t.judgeAnswer.subject, 'm0'),
            anyItem(t.judgeAnswer.itemId),
            or(eq(t.judgeAnswer.questionKey, PLACE_OUTCOME_KEY), like(t.judgeAnswer.questionKey, 'place\\_problem:%')),
          ),
        )
    : []
  const sentencesByItem = groupBy(sentenceRows, (r) => r.itemId)
  const answersByItem = groupBy(answerRows, (r) => r.itemId)

  const branch = (opportunityId: OpportunityId, probability: number): BranchView => {
    const node = nodeById.get(opportunityId)
    const parent = node?.parentId ? nodeById.get(node.parentId) : undefined
    return { opportunityId, title: node?.title ?? 'Unknown opportunity', within: parent?.title ?? null, probability }
  }
  const items = queued.map((row): TriageItemView => {
    const { branches, none } = placeBranches(answersByItem.get(row.itemId) ?? [], tree)
    const placedOn = nodeById.get(row.opportunityId)
    // A placement on a solution is a path through its problem, so that problem is not a runner-up.
    const runnerUp = branches.find((b) => b.opportunityId !== row.opportunityId && b.opportunityId !== placedOn?.parentId)
    return {
      mentionId: row.mentionId,
      itemId: row.itemId,
      text: excerpt(
        (sentencesByItem.get(row.itemId) ?? []).map((s): RedactedText => s.text),
        { start: row.sentenceStart, end: row.sentenceEnd },
      ),
      account: row.accountName !== null && row.accountArr !== null ? { name: row.accountName, arr: row.accountArr } : null,
      source: itemLabel(row.sourceName, row.itemKind),
      date: row.occurredAt.toISOString().slice(0, 10) as IsoDate,
      confidence: row.confidence,
      branches: runnerUp ? [branch(row.opportunityId, row.confidence), branch(runnerUp.opportunityId, runnerUp.probability)] : [branch(row.opportunityId, row.confidence)],
      none: branches.length ? none : 1 - row.confidence,
    }
  })

  const recentRows = await db
    .select({
      mentionId: t.triageDecision.mentionId,
      itemId: t.mention.itemId,
      action: t.triageDecision.action,
      opportunity: t.opportunity.title,
      account: t.account.name,
    })
    .from(t.triageDecision)
    .innerJoin(t.mention, eq(t.mention.id, t.triageDecision.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    .leftJoin(t.account, eq(t.account.id, t.item.accountId))
    .leftJoin(t.opportunity, eq(t.opportunity.id, t.triageDecision.opportunityId))
    .where(and(eq(t.mention.packId, scope.packId), eq(t.item.workspaceId, scope.workspaceId)))
    .orderBy(desc(t.triageDecision.createdAt), desc(t.triageDecision.id))
    .limit(5)

  const outcomeTitle = new Map(tree.map((o) => [o.id, o.title]))
  return {
    placeThreshold: scope.placeThreshold,
    items,
    targets: nodes
      .filter((n) => n.kind === 'problem')
      .map((n) => ({ id: n.id, title: n.title, outcome: (n.parentId && outcomeTitle.get(n.parentId)) || '' }))
      .sort((a, b) => a.outcome.localeCompare(b.outcome) || a.title.localeCompare(b.title)),
    recent: recentRows,
  }
}

/**
 * Records a person's decision on one queued placement as a label. A placement that is not in the queue, or a move to
 * anything but a problem of the same workspace, is `missing`. A second decision on the same mention, from another tab
 * or a double press, inserts nothing and reports `already-decided`.
 */
export async function decideTriage(
  db: Db,
  mentionId: MentionId,
  choice: TriageChoice,
  workspaceId?: WorkspaceId,
): Promise<DecideResult> {
  const scope = await triageScope(db, workspaceId)
  if (!scope) return { kind: 'missing' }
  const [row] = await db
    .select({
      mentionId: t.placement.mentionId,
      itemId: t.mention.itemId,
      opportunityId: t.placement.opportunityId,
      confidence: t.placement.confidence,
      judgeAnswerId: t.placement.judgeAnswerId,
      decided: t.triageDecision.id,
    })
    .from(t.placement)
    .innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    .leftJoin(t.triageDecision, eq(t.triageDecision.mentionId, t.mention.id))
    .where(and(eq(t.placement.mentionId, mentionId), eq(t.mention.packId, scope.packId), eq(t.item.workspaceId, scope.workspaceId)))
  if (!row) return { kind: 'missing' }
  if (row.decided) return { kind: 'already-decided' }
  if (!isLowConfidence(row.confidence, scope.placeThreshold)) return { kind: 'missing' }
  if (choice.action === 'move') {
    const [target] = await db
      .select({ id: t.opportunity.id })
      .from(t.opportunity)
      .where(and(eq(t.opportunity.id, choice.to), eq(t.opportunity.workspaceId, scope.workspaceId), inArray(t.opportunity.kind, ['problem'])))
    if (!target) return { kind: 'missing' }
  }
  const label = decide(row, choice)
  const inserted = await db
    .insert(t.triageDecision)
    .values({
      mentionId: label.mentionId,
      judgeAnswerId: row.judgeAnswerId,
      judgeOpportunityId: label.judgeOpportunityId,
      judgeConfidence: label.judgeConfidence,
      action: label.human.action,
      opportunityId: label.human.opportunityId,
    })
    .onConflictDoNothing()
    .returning({ id: t.triageDecision.id })
  return inserted.length ? { kind: 'decided', label } : { kind: 'already-decided' }
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row))
    if (group) group.push(row)
    else groups.set(key(row), [row])
  }
  return groups
}
