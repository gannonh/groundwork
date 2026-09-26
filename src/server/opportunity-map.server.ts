import { createHash } from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import {
  excerpt,
  groupByAccount,
  selectQuotes,
  topAccounts,
  type EvidenceFilter,
  type QuoteText,
} from '@/domain/evidence'
import {
  computeMetrics,
  evidenceAsOf,
  type CountedMention,
  type Measured,
  type OpportunityMetrics,
  type TrendWindow,
} from '@/domain/metrics'
import {
  isNonEmpty,
  toPainLevel,
  type Account,
  type AccountId,
  type Confidence,
  type IsoDate,
  type Item,
  type ItemId,
  type MentionId,
  type NonEmptyArray,
  type Opportunity,
  type OpportunityId,
  type Placement,
  type RedactedText,
  type SnapshotId,
  type SpeakerRole,
  type Usd,
  type WorkspaceId,
} from '@/domain/types'

export type OpportunityMap =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready'
      readonly workspaceName: string
      readonly snapshot: SnapshotId
      readonly window: TrendWindow
      readonly problems: NonEmptyArray<ProblemView>
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

export type EvidenceList =
  | { readonly kind: 'missing' }
  /** The workspace changed since the client's snapshot, so the list may not add up to the number it clicked. */
  | { readonly kind: 'stale' }
  | {
      readonly kind: 'mentions'
      readonly problemTitle: string
      /** A solution title or an account name. Null when the list is every mention of the problem. */
      readonly scope: string | null
      readonly rows: readonly QuoteView[]
    }
  | {
      readonly kind: 'accounts'
      readonly problemTitle: string
      /** ARR desc, then name. */
      readonly groups: readonly {
        readonly account: { readonly id: AccountId; readonly name: string; readonly arr: Usd }
        readonly rows: readonly QuoteView[]
      }[]
    }

const TOP_ACCOUNTS = 5
const MISSING: EvidenceList = { kind: 'missing' }
const STALE: EvidenceList = { kind: 'stale' }

/**
 * The whole /opportunities screen in one call: the given workspace, else the oldest, read through its newest pack.
 * Queries run one at a time, so this also works inside a transaction.
 */
export async function loadOpportunityMap(db: Db, workspaceId?: WorkspaceId): Promise<OpportunityMap> {
  const read = await readWorkspace(db, workspaceId)
  if (!read) return { kind: 'empty' }
  const { workspace, snapshot, window, opportunities, accountsById } = read

  const linkRows = await db
    .select({ opportunityId: t.link.opportunityId, identifier: t.link.identifier, url: t.link.url })
    .from(t.link)
    .innerJoin(t.opportunity, eq(t.opportunity.id, t.link.opportunityId))
    .where(eq(t.opportunity.workspaceId, workspace.id))
    .orderBy(asc(t.link.createdAt), asc(t.link.id))

  const byId = new Map(opportunities.map((o) => [o.id, o]))
  const problems = opportunities.filter((o) => o.kind === 'problem')
  const quotesByProblem = new Map(problems.map((p) => [p.id, selectQuotes(p.metrics.evidence, accountsById)]))
  const toQuoteView = await read.loadQuotes([...quotesByProblem.values()].flat())

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
      quotes: (quotesByProblem.get(problem.id) ?? []).map(toQuoteView),
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

  return isNonEmpty(views)
    ? { kind: 'ready', workspaceName: workspace.name, snapshot, window, problems: views }
    : { kind: 'empty' }
}

export type EvidenceRequest = {
  readonly problemId: string
  readonly filter: EvidenceFilter
  /** The snapshot of the map the client clicked a number on. */
  readonly snapshot: SnapshotId
}

/**
 * The counted mentions behind one number on a problem's detail, as quotes. Every list is a slice of computeMetrics'
 * evidence, so its length is the number the detail shows, or `stale` when that number has changed since.
 */
export async function loadEvidence(
  db: Db,
  { problemId, filter, snapshot }: EvidenceRequest,
  workspaceId?: WorkspaceId,
): Promise<EvidenceList> {
  const read = await readWorkspace(db, workspaceId)
  if (read && read.snapshot !== snapshot) return STALE
  const problem = read?.opportunities.find((o) => o.kind === 'problem' && o.id === problemId)
  if (!read || !problem) return MISSING
  const mentionsOf = async (scope: string | null, mentions: readonly CountedMention[]): Promise<EvidenceList> => {
    const toQuoteView = await read.loadQuotes(mentions)
    return { kind: 'mentions', problemTitle: problem.title, scope, rows: mentions.map(toQuoteView) }
  }

  switch (filter.evidence) {
    case 'mentions':
      return mentionsOf(null, problem.metrics.evidence)
    case 'solution': {
      const solution = read.opportunities.find(
        (o) => o.kind === 'solution' && o.id === filter.solution && o.parentId === problem.id,
      )
      return solution ? mentionsOf(solution.title, solution.metrics.evidence) : MISSING
    }
    case 'account': {
      const account = read.accountsById.get(filter.account)
      const mentions = problem.metrics.evidence.filter((m) => m.accountId === filter.account)
      return account && mentions.length > 0 ? mentionsOf(account.name, mentions) : MISSING
    }
    case 'accounts': {
      const groups = groupByAccount(problem.metrics.evidence, read.accountsById)
      const toQuoteView = await read.loadQuotes(groups.flatMap((g) => g.mentions))
      return {
        kind: 'accounts',
        problemTitle: problem.title,
        groups: groups.map(({ account, mentions }) => ({
          account: { id: account.id, name: account.name, arr: account.arr },
          rows: mentions.map(toQuoteView),
        })),
      }
    }
  }
}

type WorkspaceRead = {
  readonly workspace: { readonly id: WorkspaceId; readonly name: string }
  readonly snapshot: SnapshotId
  readonly window: TrendWindow
  readonly opportunities: readonly Measured[]
  readonly accountsById: ReadonlyMap<AccountId, Account>
  /** Fetches the sentences behind `mentions`, then turns each of them into a quote. */
  readonly loadQuotes: (mentions: readonly CountedMention[]) => Promise<(counted: CountedMention) => QuoteView>
}

/** The workspace's measured opportunity tree: the given workspace, else the oldest, through its newest pack. */
async function readWorkspace(db: Db, workspaceId: WorkspaceId | undefined): Promise<WorkspaceRead | null> {
  const [ws] = await db
    .select({ id: t.workspace.id, name: t.workspace.name })
    .from(t.workspace)
    .where(workspaceId ? eq(t.workspace.id, workspaceId) : undefined)
    .orderBy(asc(t.workspace.createdAt), asc(t.workspace.id))
    .limit(1)
  if (!ws) return null
  const [pack] = await db
    .select({ id: t.pack.id, placeThreshold: t.pack.placeThreshold })
    .from(t.pack)
    .where(eq(t.pack.workspaceId, ws.id))
    .orderBy(desc(t.pack.createdAt), desc(t.pack.id))
    .limit(1)
  if (!pack) return null

  const treeRows = await db
    .select({ id: t.opportunity.id, kind: t.opportunity.kind, parentId: t.opportunity.parentId, title: t.opportunity.title })
    .from(t.opportunity)
    .where(eq(t.opportunity.workspaceId, ws.id))
    .orderBy(asc(t.opportunity.createdAt), asc(t.opportunity.id))
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
  const sources = await db
    .select({ id: t.source.id, name: t.source.name, itemKind: t.source.itemKind })
    .from(t.source)
    .where(eq(t.source.workspaceId, ws.id))

  const painByItem = new Map(
    painRows.map((r) => [r.itemId, r.value.type === 'score' ? toPainLevel(r.value.level) : null] as const),
  )
  const items = new Map<ItemId, Item>()
  const placements: Placement[] = []
  const spans = new Map<MentionId, (typeof placementRows)[number]>()
  for (const row of placementRows) {
    items.set(row.itemId, {
      id: row.itemId,
      accountId: row.accountId,
      occurredAt: row.occurredAt,
      pain: painByItem.get(row.itemId) ?? null,
    })
    placements.push(row)
    spans.set(row.mentionId, row)
  }

  const { window, opportunities } = computeMetrics(
    {
      opportunities: treeRows.map(toOpportunity),
      placements,
      items: [...items.values()],
      accounts,
      placeThreshold: pack.placeThreshold,
    },
    { asOf: evidenceAsOf([...items.values()], new Date()) },
  )
  // Rows start with their id and sort as strings, so SQL row order cannot change the digest.
  const rows = (values: readonly (readonly unknown[])[]) => values.map((v) => JSON.stringify(v)).sort()
  const snapshot = createHash('sha256')
    .update(
      JSON.stringify({
        pack: [pack.id, pack.placeThreshold],
        tree: rows(treeRows.map((o) => [o.id, o.kind, o.parentId])),
        placements: rows(placements.map((p) => [p.mentionId, p.opportunityId, p.confidence, p.itemId])),
        items: rows([...items.values()].map((i) => [i.id, i.accountId, i.occurredAt.toISOString(), i.pain])),
        accounts: rows(accounts.map((a) => [a.id, a.arr])),
      }),
    )
    .digest('hex') as SnapshotId
  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  const sourceLabel = new Map(sources.map((s) => [s.id, itemLabel(s.name, s.itemKind)]))

  const loadQuotes = async (mentions: readonly CountedMention[]) => {
    const itemIds = [...new Set(mentions.map((m) => m.itemId))]
    const sentenceRows = itemIds.length
      ? await db
          .select({ itemId: t.sentence.itemId, text: t.sentence.text })
          .from(t.sentence)
          // One array parameter, so a large workspace cannot exceed Postgres's 65,535 bind parameters.
          .where(sql`${t.sentence.itemId} = any(${sql.param(itemIds)}::uuid[])`)
          .orderBy(asc(t.sentence.itemId), asc(t.sentence.ordinal))
      : []
    const sentencesByItem = new Map<ItemId, RedactedText[]>()
    for (const row of sentenceRows) {
      const sentences = sentencesByItem.get(row.itemId)
      if (sentences) sentences.push(row.text)
      else sentencesByItem.set(row.itemId, [row.text])
    }
    return (counted: CountedMention): QuoteView => {
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
    }
  }

  return { workspace: ws, snapshot, window, opportunities, accountsById, loadQuotes }
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
