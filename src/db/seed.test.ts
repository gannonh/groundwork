import { afterAll, describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { pool, type Db } from '@/db/client'
import { account, item, judgeAnswer, mention, placement, sentence, source, workspace } from '@/db/schema'
import type { EvidenceFilter } from '@/domain/evidence'
import type { MapFilter } from '@/domain/filters'
import { BALANCED, rank } from '@/domain/rank'
import {
  loadEvidence,
  loadOpportunityMap,
  type EvidenceList,
  type OpportunityMap,
  type ProblemView,
} from '@/server/opportunity-map.server'
import type { AccountId, Confidence, RawText, RedactedText, SourceId, Usd, WorkspaceId } from '@/domain/types'
import { buildSeed, SEED_WORKSPACE_ID, seedId } from './seed/build.ts'
import { writeSeed } from './seed/write.ts'
import { rollbackAfter } from './testing.ts'

const DEFAULT_FILTER: MapFilter = { since: '90d' }

function problemsOf(map: OpportunityMap): readonly ProblemView[] {
  if (map.kind !== 'ready') throw new Error('expected a ready map')
  return map.problems
}

function byTitle(map: OpportunityMap, title: string): ProblemView {
  const problem = problemsOf(map).find((p) => p.title === title)
  if (!problem) throw new Error(`no problem titled ${title}`)
  return problem
}

const TOP_PROBLEM_ID = seedId('opportunity', 'p4')

/** Places one new confident mention on the top seeded problem, through the seeded pack. */
async function placeOnTopProblem(
  tx: Db,
  { workspaceId, sourceId, accountId }: { workspaceId: WorkspaceId; sourceId: SourceId; accountId: AccountId },
) {
  const text = 'Our totals are wrong as well.'
  const [newItem] = await tx
    .insert(item)
    .values({
      workspaceId,
      sourceId,
      externalId: 'extra-1',
      body: text as RawText,
      occurredAt: new Date('2026-09-19T15:00:00Z'),
      accountId,
    })
    .returning({ id: item.id })
  if (!newItem) throw new Error('no item')
  await tx.insert(sentence).values({ itemId: newItem.id, ordinal: 0, text: text as RedactedText })
  const packId = seedId('pack', 'product-insights/0.3.0')
  const [answer] = await tx
    .insert(judgeAnswer)
    .values({
      packId,
      itemId: newItem.id,
      questionKey: 'place',
      subject: 'm0',
      value: { type: 'choice', option: TOP_PROBLEM_ID },
      probabilities: { [TOP_PROBLEM_ID]: 0.95, none: 0.05 },
      confidence: 0.95 as Confidence,
      backend: 'recorded',
      modelVersion: 'recorded-1.0.0',
    })
    .returning({ id: judgeAnswer.id })
  const [newMention] = await tx
    .insert(mention)
    .values({ packId, itemId: newItem.id, ordinal: 0, sentenceStart: 0, sentenceEnd: 0 })
    .returning({ id: mention.id })
  if (!answer || !newMention) throw new Error('no answer or mention')
  await tx.insert(placement).values({
    mentionId: newMention.id,
    opportunityId: TOP_PROBLEM_ID,
    judgeAnswerId: answer.id,
    confidence: 0.95 as Confidence,
  })
}

describe('pnpm db:seed', () => {
  afterAll(() => pool.end())

  test('computes the prototype numbers for all 12 problems and its Balanced order', async () => {
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      return loadOpportunityMap(tx, DEFAULT_FILTER, SEED_WORKSPACE_ID)
    })

    const problems = problemsOf(map)
    expect(
      Object.fromEntries(
        problems.map((p) => [
          p.title,
          {
            accounts: p.metrics.accounts,
            arr: p.metrics.arr,
            mentions: p.metrics.mentions,
            pain: p.metrics.pain,
            needsReview: p.metrics.needsReview,
          },
        ]),
      ),
    ).toEqual({
      'CSV imports fail silently on malformed rows': { accounts: 38, arr: 1_420_000, mentions: 112, pain: 3, needsReview: 6 },
      'Field mapping must be redone for every import': { accounts: 27, arr: 980_000, mentions: 64, pain: 2, needsReview: 2 },
      'No way to backfill historical data': { accounts: 12, arr: 610_000, mentions: 29, pain: 2, needsReview: 1 },
      "Dashboard totals don't match the source system": { accounts: 44, arr: 2_310_000, mentions: 141, pain: 3, needsReview: 9 },
      "Can't tell when data was last refreshed": { accounts: 31, arr: 1_050_000, mentions: 77, pain: 1, needsReview: 3 },
      'Timezone handling shifts daily counts': { accounts: 9, arr: 420_000, mentions: 18, pain: 1, needsReview: 2 },
      'Exported charts lose formatting in slides': { accounts: 22, arr: 540_000, mentions: 58, pain: 1, needsReview: 4 },
      'Viewers need a paid seat to see a dashboard': { accounts: 35, arr: 1_880_000, mentions: 96, pain: 2, needsReview: 5 },
      'No scheduled email digest': { accounts: 17, arr: 390_000, mentions: 41, pain: 0, needsReview: 3 },
      "Admins can't restrict access by team": { accounts: 19, arr: 1_640_000, mentions: 47, pain: 3, needsReview: 2 },
      'Usage-based bill is unpredictable': { accounts: 26, arr: 1_120_000, mentions: 69, pain: 2, needsReview: 7 },
      'SSO setup requires contacting support': { accounts: 8, arr: 720_000, mentions: 15, pain: 1, needsReview: 0 },
    })

    expect(rank(problems, BALANCED).map((r) => [r.item.title, Math.round(r.score.total)])).toEqual([
      ["Dashboard totals don't match the source system", 96],
      ['CSV imports fail silently on malformed rows', 77],
      ['Viewers need a paid seat to see a dashboard', 75],
      ["Admins can't restrict access by team", 67],
      ['Usage-based bill is unpredictable', 57],
      ['Field mapping must be redone for every import', 52],
      ["Can't tell when data was last refreshed", 49],
      ['No way to backfill historical data', 39],
      ['Exported charts lose formatting in slides', 30],
      ['SSO setup requires contacting support', 28],
      ['No scheduled email digest', 23],
      ['Timezone handling shifts daily counts', 19],
    ])
  })

  test("shows the top problem's trend, solutions, quotes, and top accounts", async () => {
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      return loadOpportunityMap(tx, DEFAULT_FILTER, SEED_WORKSPACE_ID)
    })

    expect(map.kind === 'ready' && map.window).toEqual({ firstWeek: '2026-06-29', lastWeek: '2026-09-14' })
    const top = byTitle(map, "Dashboard totals don't match the source system")
    expect(top.outcome.title).toBe('Trust the numbers in reports')
    expect(top.metrics.weekly).toEqual([6, 5, 8, 11, 9, 9, 13, 16, 13, 14, 19, 18])
    expect(top.metrics.delta).toBeCloseTo(0.3617, 4)
    expect(top.solutions.map((s) => [s.title, s.mentions])).toEqual([
      ['Reconciliation view vs. source', 36],
      ['Show calculation lineage per metric', 29],
      ['Export raw rows behind a number', 14],
    ])
    expect(
      top.quotes.map((q) => [
        q.account?.name,
        q.text.sentences.filter((s) => s.highlighted).map((s) => s.text),
        q.source,
        q.date,
        q.lowConfidence,
      ]),
    ).toEqual([
      ['Cobalt Insurance', ['This is a renewal risk for us.'], 'Zendesk ticket', '2026-09-11', null],
      [
        'Halcyon Bank',
        ['Our CFO saw revenue off by 4% versus Stripe and now nobody trusts the dashboard.'],
        'Gong call',
        '2026-09-18',
        null,
      ],
      [
        'Orbitly',
        ["I have to screenshot the source system next to yours in every exec review to prove it's right."],
        'Interview',
        '2026-09-06',
        null,
      ],
      ['Lumen Clinics', ['Totals are different depending on which page you look at?'], 'G2 review', '2026-08-25', 0.62],
    ])
    expect(top.topAccounts.slice(0, 4).map((a) => [a.name, a.arr])).toEqual([
      ['Cobalt Insurance', 310_000],
      ['Halcyon Bank', 240_000],
      ['Orbitly', 132_000],
      ['Lumen Clinics', 74_000],
    ])
    expect(byTitle(map, "Can't tell when data was last refreshed").link?.identifier).toBe('LIN-417')
    expect(
      problemsOf(map)
        .filter((p) => p.metrics.needsReview > 0 && !p.quotes.some((q) => q.lowConfidence !== null))
        .map((p) => p.title),
    ).toEqual([])
  })

  test("a placement on another workspace's item does not count toward a seeded problem", async () => {
    const top = "Dashboard totals don't match the source system"
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      const [other] = await tx
        .insert(workspace)
        .values({ slug: 'other-workspace', name: 'Other' })
        .returning({ id: workspace.id })
      if (!other) throw new Error('no workspace')
      const [otherSource] = await tx
        .insert(source)
        .values({ workspaceId: other.id, kind: 'upload', name: 'Zendesk', itemKind: 'ticket' })
        .returning({ id: source.id })
      const [otherAccount] = await tx
        .insert(account)
        .values({ workspaceId: other.id, externalId: 'foreign', name: 'Foreign Corp', arr: 9_000_000 as Usd })
        .returning({ id: account.id })
      if (!otherSource || !otherAccount) throw new Error('no source or account')
      await placeOnTopProblem(tx, { workspaceId: other.id, sourceId: otherSource.id, accountId: otherAccount.id })
      return loadOpportunityMap(tx, DEFAULT_FILTER, SEED_WORKSPACE_ID)
    })

    const problem = byTitle(map, top)
    expect({
      accounts: problem.metrics.accounts,
      arr: problem.metrics.arr,
      mentions: problem.metrics.mentions,
    }).toEqual({ accounts: 44, arr: 2_310_000, mentions: 141 })
    expect(problem.quotes.map((q) => q.account?.name)).toEqual([
      'Cobalt Insurance',
      'Halcyon Bank',
      'Orbitly',
      'Lumen Clinics',
    ])
  })

  test('an Enterprise-only filter counts only enterprise accounts and quotes only them', async () => {
    const map = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      return loadOpportunityMap(tx, { segments: ['enterprise'], since: '90d' }, SEED_WORKSPACE_ID)
    })

    const top = byTitle(map, "Dashboard totals don't match the source system")
    expect({ accounts: top.metrics.accounts, arr: top.metrics.arr, mentions: top.metrics.mentions }).toEqual({
      accounts: 2,
      arr: 550_000,
      mentions: 2,
    })
    expect(top.quotes.map((q) => [q.account?.name, q.account?.arr])).toEqual([
      ['Cobalt Insurance', 310_000],
      ['Halcyon Bank', 240_000],
    ])
    expect(problemsOf(map).flatMap((p) => p.quotes.filter((q) => (q.account?.arr ?? 0) < 150_000))).toEqual([])
    expect(top.solutions).toEqual([])
    expect(problemsOf(map).flatMap((p) => p.solutions.filter((s) => s.mentions === 0))).toEqual([])
  })

  test('under an Enterprise-only filter, the accounts list behind a number lists only enterprise accounts', async () => {
    const enterprise: MapFilter = { segments: ['enterprise'], since: '90d' }
    const list = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      const map = await loadOpportunityMap(tx, enterprise, SEED_WORKSPACE_ID)
      if (map.kind !== 'ready') throw new Error('expected a ready map')
      return loadEvidence(
        tx,
        enterprise,
        { problemId: TOP_PROBLEM_ID, filter: { evidence: 'accounts' }, snapshot: map.snapshot },
        SEED_WORKSPACE_ID,
      )
    })

    if (list.kind !== 'accounts') throw new Error(`expected an accounts list, got ${list.kind}`)
    expect(list.groups.map((g) => [g.account.name, g.account.arr, g.rows.length])).toEqual([
      ['Cobalt Insurance', 310_000, 1],
      ['Halcyon Bank', 240_000, 1],
    ])
  })

  test("lists the evidence behind each of the top problem's numbers", async () => {
    const top = "Dashboard totals don't match the source system"
    const lists = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      const map = await loadOpportunityMap(tx, DEFAULT_FILTER, SEED_WORKSPACE_ID)
      const problem = byTitle(map, top)
      const other = byTitle(map, 'Usage-based bill is unpredictable')
      const solution = problem.solutions.find((s) => s.title === 'Reconciliation view vs. source')
      const foreignSolution = other.solutions[0]
      if (!solution || !foreignSolution) throw new Error('missing seeded solution')
      if (map.kind !== 'ready') throw new Error('expected a ready map')
      const load = (problemId: string, filter: EvidenceFilter) =>
        loadEvidence(tx, DEFAULT_FILTER, { problemId, filter, snapshot: map.snapshot }, SEED_WORKSPACE_ID)
      const accounts = await load(problem.id, { evidence: 'accounts' })
      const kite = accounts.kind === 'accounts' ? accounts.groups.find((g) => g.account.name === 'Kite Dynamics') : null
      if (!kite) throw new Error('missing seeded account')
      return {
        mentions: await load(problem.id, { evidence: 'mentions' }),
        accounts,
        solution: await load(problem.id, { evidence: 'solution', solution: solution.id }),
        kite: await load(problem.id, { evidence: 'account', account: kite.account.id }),
        unknownProblem: await load('00000000-0000-0000-0000-000000000000', { evidence: 'mentions' }),
        foreignSolution: await load(problem.id, { evidence: 'solution', solution: foreignSolution.id }),
      }
    })

    const rowsOf = (list: EvidenceList) => {
      if (list.kind !== 'mentions') throw new Error(`expected a mentions list, got ${list.kind}`)
      return list
    }
    const mentions = rowsOf(lists.mentions)
    expect([mentions.problemTitle, mentions.scope, mentions.rows.length]).toEqual([top, null, 141])
    expect(mentions.rows.filter((r) => r.lowConfidence !== null)).toHaveLength(9)

    if (lists.accounts.kind !== 'accounts') throw new Error('expected an accounts list')
    const { groups } = lists.accounts
    expect(groups).toHaveLength(44)
    expect(groups.reduce((sum, g) => sum + g.account.arr, 0)).toBe(2_310_000)
    expect(groups.reduce((sum, g) => sum + g.rows.length, 0)).toBe(141)
    expect(groups.slice(0, 2).map((g) => g.account.name)).toEqual(['Cobalt Insurance', 'Halcyon Bank'])

    const solution = rowsOf(lists.solution)
    expect([solution.scope, solution.rows.length]).toEqual(['Reconciliation view vs. source', 36])

    const kite = rowsOf(lists.kite)
    expect(kite.rows.map((r) => r.account?.name)).toEqual([
      'Kite Dynamics',
      'Kite Dynamics',
      'Kite Dynamics',
      'Kite Dynamics',
    ])

    expect(lists.unknownProblem).toEqual({ kind: 'missing' })
    expect(lists.foreignSolution).toEqual({ kind: 'missing' })
  })

  test('a list opened from an older map is stale, and the reloaded map lists the new mention', async () => {
    const mentions: EvidenceFilter = { evidence: 'mentions' }
    const result = await rollbackAfter(async (tx) => {
      await writeSeed(tx, buildSeed())
      const snapshotOf = async () => {
        const map = await loadOpportunityMap(tx, DEFAULT_FILTER, SEED_WORKSPACE_ID)
        if (map.kind !== 'ready') throw new Error('expected a ready map')
        return map.snapshot
      }
      const before = await snapshotOf()
      const again = await snapshotOf()
      const [seedSource] = await tx
        .select({ id: source.id })
        .from(source)
        .where(eq(source.workspaceId, SEED_WORKSPACE_ID))
        .limit(1)
      const [seedAccount] = await tx
        .select({ id: account.id })
        .from(account)
        .where(eq(account.workspaceId, SEED_WORKSPACE_ID))
        .limit(1)
      if (!seedSource || !seedAccount) throw new Error('no seeded source or account')
      await placeOnTopProblem(tx, {
        workspaceId: SEED_WORKSPACE_ID,
        sourceId: seedSource.id,
        accountId: seedAccount.id,
      })
      const after = await snapshotOf()
      const load = (snapshot: typeof before) =>
        loadEvidence(tx, DEFAULT_FILTER, { problemId: TOP_PROBLEM_ID, filter: mentions, snapshot }, SEED_WORKSPACE_ID)
      return { before, again, after, old: await load(before), fresh: await load(after) }
    })

    expect(result.again).toBe(result.before)
    expect(result.after).not.toBe(result.before)
    expect(result.old).toEqual({ kind: 'stale' })
    expect(result.fresh.kind === 'mentions' && result.fresh.rows.length).toBe(142)
  })

  test('an empty database loads as an empty map, not an error', async () => {
    const map = await rollbackAfter(async (tx) => {
      await tx.delete(workspace)
      return loadOpportunityMap(tx, DEFAULT_FILTER)
    })
    expect(map).toEqual({ kind: 'empty' })
  })
})
