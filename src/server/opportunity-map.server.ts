import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import { excerpt, selectQuotes, topAccounts, type QuoteText } from '@/domain/evidence'
import { filterEvidence, type EvidenceFilter } from '@/domain/filters'
import {
  computeMetrics,
  evidenceAsOf,
  type OpportunityMetrics,
  type TrendWindow,
  type WeeklyCounts,
} from '@/domain/metrics'
import {
  toPainLevel,
  type Account,
  type AccountId,
  type Confidence,
  type IsoDate,
  type Item,
  type ItemId,
  type MentionId,
  type Opportunity,
  type OpportunityId,
  type Placement,
  type RedactedText,
  type SourceId,
  type SpeakerRole,
  type Usd,
  type WorkspaceId,
} from '@/domain/types'

export type OpportunityMap =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready'
      readonly workspaceName: string
      readonly window: TrendWindow
      /** Every source in the workspace, whatever the filter. */
      readonly sources: readonly { readonly id: SourceId; readonly name: string }[]
      readonly outcomes: readonly OutcomeView[]
      /** Problems with at least one mention that passes the filter. Empty when the filter hides every one. */
      readonly problems: readonly ProblemView[]
    }

export type OutcomeView = {
  readonly id: OpportunityId
  readonly title: string
  readonly metrics: Pick<OpportunityMetrics, 'accounts' | 'arr' | 'mentions'> & { readonly weekly: WeeklyCounts }
}

export type MetricsView = Omit<OpportunityMetrics, 'evidence'>
export type ProblemView = {
  readonly id: OpportunityId
  readonly title: string
  readonly outcome: { readonly id: OpportunityId; readonly title: string }
  readonly link: { readonly identifier: string; readonly url: string } | null
  readonly metrics: MetricsView
  readonly quotes: readonly QuoteView[]
  /** Mentions desc. */
  readonly solutions: readonly {
    readonly id: OpportunityId
    readonly title: string
    readonly mentions: number
    readonly needsReview: number
  }[]
  readonly topAccounts: readonly {
    readonly id: AccountId
    readonly name: string
    readonly arr: Usd
    readonly mentions: number
    readonly allNeedReview: boolean
  }[]
}
export type QuoteView = {
  readonly mentionId: MentionId
  readonly text: QuoteText
  readonly account: { readonly name: string; readonly arr: Usd } | null
  readonly role: SpeakerRole | null
  /** 'Gong call', 'Zendesk ticket'. */
  readonly source: string
  readonly date: IsoDate
  /** Set when the placement is below the pack's place threshold. */
  readonly lowConfidence: Confidence | null
}

const TOP_ACCOUNTS = 5

/**
 * The whole /opportunities screen in one call: the given workspace, else the oldest, read through its newest pack,
 * counting only the evidence that passes `filter`. Queries run one at a time, so this also works inside a transaction.
 */
export async function loadOpportunityMap(
  db: Db,
  filter: EvidenceFilter,
  workspaceId?: WorkspaceId,
): Promise<OpportunityMap> {
  const [ws] = await db
    .select({ id: t.workspace.id, name: t.workspace.name })
    .from(t.workspace)
    .where(workspaceId ? eq(t.workspace.id, workspaceId) : undefined)
    .orderBy(asc(t.workspace.createdAt), asc(t.workspace.id))
    .limit(1)
  if (!ws) return { kind: 'empty' }
  const [pack] = await db
    .select({ id: t.pack.id, placeThreshold: t.pack.placeThreshold })
    .from(t.pack)
    .where(eq(t.pack.workspaceId, ws.id))
    .orderBy(desc(t.pack.createdAt), desc(t.pack.id))
    .limit(1)
  if (!pack) return { kind: 'empty' }

  const treeRows = await db
    .select({ id: t.opportunity.id, kind: t.opportunity.kind, parentId: t.opportunity.parentId, title: t.opportunity.title })
    .from(t.opportunity)
    .where(eq(t.opportunity.workspaceId, ws.id))
    .orderBy(asc(t.opportunity.createdAt), asc(t.opportunity.id))
  if (!treeRows.some((r) => r.kind === 'problem')) return { kind: 'empty' }
  const placementRows = await db
    .select({
      mentionId: t.placement.mentionId,
      opportunityId: t.placement.opportunityId,
      confidence: t.placement.confidence,
      itemId: t.mention.itemId,
      sentenceStart: t.mention.sentenceStart,
      sentenceEnd: t.mention.sentenceEnd,
      accountId: t.item.accountId,
      occurredAt: t.item.occurredAt,
      sourceId: t.item.sourceId,
      authorRole: t.item.authorRole,
    })
    .from(t.placement)
    .innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    // The schema does not tie a mention's item to its pack's workspace, so the read path does.
    .where(and(eq(t.mention.packId, pack.id), eq(t.item.workspaceId, ws.id)))
  const accounts: Account[] = await db
    .select({ id: t.account.id, name: t.account.name, arr: t.account.arr })
    .from(t.account)
    .where(eq(t.account.workspaceId, ws.id))
  const painRows = await db
    .select({ itemId: t.judgeAnswer.itemId, value: t.judgeAnswer.value })
    .from(t.judgeAnswer)
    .where(and(eq(t.judgeAnswer.packId, pack.id), eq(t.judgeAnswer.questionKey, 'pain'), eq(t.judgeAnswer.subject, '')))
  const linkRows = await db
    .select({ opportunityId: t.link.opportunityId, identifier: t.link.identifier, url: t.link.url })
    .from(t.link)
    .innerJoin(t.opportunity, eq(t.opportunity.id, t.link.opportunityId))
    .where(eq(t.opportunity.workspaceId, ws.id))
    .orderBy(asc(t.link.createdAt), asc(t.link.id))
  const sources = await db
    .select({ id: t.source.id, name: t.source.name, itemKind: t.source.itemKind })
    .from(t.source)
    .where(eq(t.source.workspaceId, ws.id))
    .orderBy(asc(t.source.name), asc(t.source.id))

  const painByItem = new Map(
    painRows.map((r) => [r.itemId, r.value.type === 'score' ? toPainLevel(r.value.level) : null] as const),
  )
  const items = new Map<ItemId, Item>()
  const placements: Placement[] = []
  const spans = new Map<MentionId, (typeof placementRows)[number]>()
  for (const row of placementRows) {
    items.set(row.itemId, {
      id: row.itemId,
      sourceId: row.sourceId,
      accountId: row.accountId,
      role: row.authorRole,
      occurredAt: row.occurredAt,
      pain: painByItem.get(row.itemId) ?? null,
    })
    placements.push(row)
    spans.set(row.mentionId, row)
  }

  // Taken before filtering, so the trend window and the date cutoff hold still while filters change.
  const asOf = evidenceAsOf([...items.values()], new Date())
  const evidence = filterEvidence(
    {
      opportunities: treeRows.map(toOpportunity),
      placements,
      items: [...items.values()],
      accounts,
      placeThreshold: pack.placeThreshold,
    },
    filter,
    asOf,
  )
  const { window, opportunities } = computeMetrics(evidence, { asOf })

  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  const byId = new Map(opportunities.map((o) => [o.id, o]))
  const problems = opportunities.filter((o) => o.kind === 'problem' && o.metrics.mentions > 0)
  const quotesByProblem = new Map(problems.map((p) => [p.id, selectQuotes(p.metrics.evidence, accountsById)]))

  const quoteItemIds = [...new Set([...quotesByProblem.values()].flatMap((qs) => qs.map((q) => q.itemId)))]
  const sentenceRows = quoteItemIds.length
    ? await db
        .select({ itemId: t.sentence.itemId, text: t.sentence.text })
        .from(t.sentence)
        .where(inArray(t.sentence.itemId, quoteItemIds))
        .orderBy(asc(t.sentence.itemId), asc(t.sentence.ordinal))
    : []
  const sentencesByItem = new Map<ItemId, RedactedText[]>()
  for (const row of sentenceRows) {
    const sentences = sentencesByItem.get(row.itemId)
    if (sentences) sentences.push(row.text)
    else sentencesByItem.set(row.itemId, [row.text])
  }
  const sourceLabel = new Map(sources.map((s) => [s.id, itemLabel(s.name, s.itemKind)]))

  const views = problems.map((problem): ProblemView => {
    const outcome = problem.parentId ? byId.get(problem.parentId) : undefined
    if (!outcome) throw new Error(`Problem ${problem.id} has no outcome`)
    const link = linkRows.find((l) => l.opportunityId === problem.id)
    const { evidence, ...metrics } = problem.metrics
    return {
      id: problem.id,
      title: problem.title,
      outcome: { id: outcome.id, title: outcome.title },
      link: link ? { identifier: link.identifier, url: link.url } : null,
      metrics,
      quotes: (quotesByProblem.get(problem.id) ?? []).map((counted) => {
        const span = spans.get(counted.mentionId)
        const account = counted.accountId ? accountsById.get(counted.accountId) : undefined
        return {
          mentionId: counted.mentionId,
          text: excerpt(sentencesByItem.get(counted.itemId) ?? [], {
            start: span?.sentenceStart ?? 0,
            end: span?.sentenceEnd ?? 0,
          }),
          account: account ? { name: account.name, arr: account.arr } : null,
          role: span?.authorRole ?? null,
          source: (span && sourceLabel.get(span.sourceId)) ?? '',
          date: counted.occurredAt.toISOString().slice(0, 10) as IsoDate,
          lowConfidence: counted.lowConfidence,
        }
      }),
      solutions: opportunities
        .filter((o) => o.kind === 'solution' && o.parentId === problem.id)
        .map((s) => ({ id: s.id, title: s.title, mentions: s.metrics.mentions, needsReview: s.metrics.needsReview }))
        .sort((a, b) => b.mentions - a.mentions),
      topAccounts: topAccounts(evidence, accountsById, TOP_ACCOUNTS).map((a) => ({
        id: a.account.id,
        name: a.account.name,
        arr: a.account.arr,
        mentions: a.mentions,
        allNeedReview: a.allNeedReview,
      })),
    }
  })

  return {
    kind: 'ready',
    workspaceName: ws.name,
    window,
    sources: sources.map((s) => ({ id: s.id, name: s.name })),
    outcomes: opportunities
      .filter((o) => o.kind === 'outcome')
      .map(({ id, title, metrics }) => ({
        id,
        title,
        metrics: { accounts: metrics.accounts, arr: metrics.arr, mentions: metrics.mentions, weekly: metrics.weekly },
      })),
    problems: views,
  }
}

function toOpportunity(row: {
  id: OpportunityId
  kind: Opportunity['kind']
  parentId: OpportunityId | null
  title: string
}): Opportunity {
  if (row.kind === 'outcome') return { id: row.id, kind: 'outcome', parentId: null, title: row.title }
  if (!row.parentId) throw new Error(`Opportunity ${row.id} is a ${row.kind} with no parent`)
  return { id: row.id, kind: row.kind, parentId: row.parentId, title: row.title }
}

function itemLabel(sourceName: string, kind: (typeof t.itemKind.enumValues)[number]): string {
  switch (kind) {
    case 'ticket':
      return `${sourceName} ticket`
    case 'call':
      return `${sourceName} call`
    case 'survey_response':
      return `${sourceName} comment`
    case 'review':
      return `${sourceName} review`
    case 'interview':
      return 'Interview'
  }
}
