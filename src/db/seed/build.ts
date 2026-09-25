import { createHash } from 'node:crypto'
import { splitSentences } from '../../domain/sentences.ts'
import type {
  AccountId,
  Confidence,
  ItemId,
  MentionId,
  OpportunityId,
  PackId,
  PainLevel,
  RawText,
  RedactedText,
  SourceId,
  SpeakerRole,
  Usd,
  WorkspaceId,
} from '../../domain/types.ts'
import type {
  account,
  item,
  judgeAnswer,
  link,
  mention,
  opportunity,
  pack,
  placement,
  sentence,
  source,
  workspace,
} from '../schema.ts'
import { OUTCOMES, PACK_DEFINITION, PROBLEMS, SOURCES, type ProtoProblem, type SourceKey } from './prototype.ts'

export type SeedRows = {
  readonly workspace: typeof workspace.$inferInsert & { readonly id: WorkspaceId }
  readonly pack: typeof pack.$inferInsert
  readonly sources: readonly (typeof source.$inferInsert)[]
  readonly accounts: readonly (typeof account.$inferInsert)[]
  readonly opportunities: readonly (typeof opportunity.$inferInsert)[]
  readonly links: readonly (typeof link.$inferInsert)[]
  readonly items: readonly (typeof item.$inferInsert)[]
  readonly sentences: readonly (typeof sentence.$inferInsert)[]
  readonly judgeAnswers: readonly (typeof judgeAnswer.$inferInsert)[]
  readonly mentions: readonly (typeof mention.$inferInsert)[]
  readonly placements: readonly (typeof placement.$inferInsert)[]
}

type SeedIdKinds = {
  workspace: WorkspaceId
  pack: PackId
  source: SourceId
  account: AccountId
  opportunity: OpportunityId
  item: ItemId
  mention: MentionId
  answer: string
  placement: string
  link: string
  linear: string
}

/** A deterministic UUID (RFC 9562 version 8) from a seed key, so seeded URLs survive a reseed. */
export function seedId<K extends keyof SeedIdKinds>(kind: K, key: string): SeedIdKinds[K] {
  const bytes = createHash('sha256').update(`groundwork-seed/${kind}/${key}`).digest().subarray(0, 16)
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6)
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8)
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as SeedIdKinds[K]
}

export const SEED_WORKSPACE_ID = seedId('workspace', 'acme-analytics')

const WEEK0 = Date.UTC(2026, 5, 29) // Monday. Week 11 is Sep 14 to Sep 20.
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const PAIN_OFFSETS = [0, 0, 1, 0, -1, 0, 0, 1, 0, -1] // lower median of any run of 10 is the base
const PAIN_KEYS = ['mild_annoyance', 'slows_work', 'blocks_work', 'deal_breaker'] as const
const FILLER_SOURCES: readonly SourceKey[] = ['zd', 'nps', 'gong', 'zd', 'g2', 'nps', 'int', 'zd']
const FILLER_ROLES: readonly SpeakerRole[] = ['end_user', 'admin', 'end_user', 'buyer', 'executive', 'admin']
const PROBLEM_LEADS = [
  'Same issue for us:',
  'Raising this again:',
  'This keeps coming up:',
  'Our team hit this again:',
  'Still seeing it:',
  'Flagging this before renewal:',
]
const SOLUTION_LEADS = ['We need this:', 'Top request from our team:', 'Please prioritize:', 'This would unblock us:']
const NAME_A = [
  'Acorn', 'Birch', 'Cedar', 'Delta', 'Ember', 'Fjord', 'Granite', 'Harbor', 'Iris', 'Jasper',
  'Kite', 'Linden', 'Maple', 'Nimbus', 'Onyx', 'Pioneer', 'Quarry', 'Raven', 'Summit', 'Tidal',
]
const NAME_B = [
  'Analytics', 'Bio', 'Capital', 'Dynamics', 'Energy', 'Foods', 'Group', 'Health',
  'Industries', 'Logistics', 'Media', 'Networks', 'Outfitters', 'Partners', 'Robotics', 'Systems',
]
const ANSWERS = { backend: 'recorded', modelVersion: 'seed-prototype-d' } as const

type Slot = {
  readonly accountId: AccountId
  readonly opportunityId: OpportunityId
  readonly text: string
  /** Character range of the highlighted part of `text`. */
  readonly mark: { readonly start: number; readonly end: number }
  readonly occurredAt: Date
  readonly source: SourceKey
  readonly role: SpeakerRole
  readonly confidence: number
}

/** Pure and deterministic. Throws when the prototype's numbers cannot be met. */
export function buildSeed(): SeedRows {
  const packId = seedId('pack', 'product-insights/0.3.0')
  const sourceId = (key: SourceKey) => seedId('source', key)
  const outcomeId = (key: string) => seedId('opportunity', key)

  const rows = {
    workspace: { id: SEED_WORKSPACE_ID, slug: 'acme-analytics', name: 'Acme Analytics' },
    pack: {
      id: packId,
      workspaceId: SEED_WORKSPACE_ID,
      name: PACK_DEFINITION.pack,
      version: PACK_DEFINITION.version,
      judgeModel: PACK_DEFINITION.judge,
      detectThreshold: PACK_DEFINITION.thresholds.detect as Confidence,
      placeThreshold: PACK_DEFINITION.thresholds.place_confidence as Confidence,
      definition: PACK_DEFINITION,
    },
    sources: (Object.keys(SOURCES) as SourceKey[]).map((key) => ({
      id: sourceId(key),
      workspaceId: SEED_WORKSPACE_ID,
      kind: 'upload' as const,
      name: SOURCES[key].name,
      itemKind: SOURCES[key].itemKind,
    })),
    accounts: [] as (typeof account.$inferInsert)[],
    opportunities: OUTCOMES.map(
      (o): typeof opportunity.$inferInsert => ({
        id: outcomeId(o.key),
        workspaceId: SEED_WORKSPACE_ID,
        kind: 'outcome',
        title: o.title,
      }),
    ),
    links: [] as (typeof link.$inferInsert)[],
    items: [] as (typeof item.$inferInsert)[],
    sentences: [] as (typeof sentence.$inferInsert)[],
    judgeAnswers: [] as (typeof judgeAnswer.$inferInsert)[],
    mentions: [] as (typeof mention.$inferInsert)[],
    placements: [] as (typeof placement.$inferInsert)[],
  }

  const quotedAccounts = new Map<string, AccountId>()
  const accountRow = (externalId: string, name: string, arr: number) => {
    const id = seedId('account', externalId)
    rows.accounts.push({
      id,
      workspaceId: SEED_WORKSPACE_ID,
      externalId,
      name,
      arr: arr as Usd,
      segment: arr >= 150_000 ? 'Enterprise' : arr >= 80_000 ? 'Mid-market' : 'SMB',
      plan: arr >= 150_000 ? 'Enterprise' : arr >= 80_000 ? 'Business' : 'Team',
    })
    return id
  }
  const quotedArr = new Map<string, number>()
  for (const q of PROBLEMS.flatMap((p) => p.quotes)) {
    const seen = quotedArr.get(q.account)
    invariant(seen === undefined || seen === q.arr, `${q.account} has two ARRs`)
    if (seen === undefined) {
      quotedArr.set(q.account, q.arr)
      quotedAccounts.set(q.account, accountRow(slug(q.account), q.account, q.arr))
    }
  }

  let fillerCount = 0
  PROBLEMS.forEach((p, pi) => {
    const problemId = seedId('opportunity', p.key)
    rows.opportunities.push({
      id: problemId,
      workspaceId: SEED_WORKSPACE_ID,
      kind: 'problem',
      parentId: outcomeId(p.outcome),
      parentKind: 'outcome',
      title: p.title,
    })
    const solutionIds = p.solutions.map(([title], j) => {
      const id = seedId('opportunity', `${p.key}/s${String(j)}`)
      rows.opportunities.push({
        id,
        workspaceId: SEED_WORKSPACE_ID,
        kind: 'solution',
        parentId: problemId,
        parentKind: 'problem',
        title,
      })
      return id
    })
    if (p.link) {
      rows.links.push({
        id: seedId('link', p.key),
        opportunityId: problemId,
        tracker: 'linear',
        target: 'issue',
        externalId: seedId('linear', p.link),
        identifier: p.link,
        url: `https://linear.app/acme/issue/${p.link}`,
      })
    }

    // Accounts: quoted accounts keep their ARR; this problem's own fillers make up the rest exactly.
    const quoted = new Set(p.quotes.map((q) => q.account))
    const fillerAccounts = p.accounts - quoted.size
    const fillerArrK = (p.arr - [...quoted].reduce((sum, name) => sum + (quotedArr.get(name) ?? 0), 0)) / 1000
    invariant(fillerAccounts >= 1 && Number.isInteger(fillerArrK) && fillerArrK >= fillerAccounts, `${p.key} accounts`)
    const fillers = apportion(
      fillerArrK,
      Array.from({ length: fillerAccounts }, (_, j) => 2 - j / Math.max(fillerAccounts - 1, 1)),
    ).map((arrK) => {
      const n = fillerCount++
      const name = `${at(NAME_A, n % NAME_A.length)} ${at(NAME_B, Math.floor(n / NAME_A.length))}`
      invariant(!quotedArr.has(name), `${name} clashes with a quoted account`)
      return accountRow(`acct-${String(n)}`, name, arrK * 1000)
    })

    // Weekly counts sum to the mention count; quotes take their own week's slots first.
    const weekly = blockThenWeek(p.mentions, p.trend)
    const quota = [...weekly]
    for (const q of p.quotes) {
      const week = Math.floor((utcNoon(q.date) - WEEK0) / (7 * DAY_MS))
      invariant((quota[week] ?? 0) > 0, `${p.key} has no slot for its ${q.date} quote`)
      quota[week] = (quota[week] ?? 0) - 1
    }
    const fillerDates = quota
      .flatMap((count, w) =>
        Array.from({ length: count }, (_, j) => WEEK0 + (7 * w + ((3 * j + pi) % 7)) * DAY_MS + 15 * HOUR_MS),
      )
      .sort((a, b) => a - b)

    const flagged = p.quotes.filter((q) => q.low).length
    const lowFill = p.low - flagged
    const fillerMentions = fillerDates.length
    invariant(fillerMentions - lowFill >= fillerAccounts, `${p.key} cannot give every low mention a confident sibling`)
    const targets = [
      ...solutionIds.flatMap((id, j) => Array.from({ length: at(p.solutions, j)[1] }, () => id)),
    ]
    invariant(targets.length <= fillerMentions, `${p.key} solutions exceed its mentions`)
    while (targets.length < fillerMentions) targets.push(problemId)
    const stride = coprimeStride(fillerMentions)

    const slots: Slot[] = [
      ...p.quotes.map((q): Slot => {
        const start = q.text.indexOf('<mark>')
        const text = q.text.replace('<mark>', '').replace('</mark>', '')
        const mark = start < 0 ? { start: 0, end: text.length } : { start, end: q.text.indexOf('</mark>') - 6 }
        return {
          accountId: quotedAccounts.get(q.account) ?? fail(q.account),
          opportunityId: problemId,
          text,
          mark,
          occurredAt: new Date(utcNoon(q.date) + 3 * HOUR_MS),
          source: q.source,
          role: q.role,
          confidence: q.low ? 0.62 : 0.93,
        }
      }),
      ...fillerDates.map((date, i): Slot => {
        const opportunityId = at(targets, (i * stride) % fillerMentions)
        const solution = solutionIds.indexOf(opportunityId)
        const text =
          solution < 0
            ? `${at(PROBLEM_LEADS, i % PROBLEM_LEADS.length)} ${p.title}.`
            : `${at(SOLUTION_LEADS, i % SOLUTION_LEADS.length)} ${at(p.solutions, solution)[0]}.`
        const low = i >= fillerMentions - lowFill
        return {
          accountId: at(fillers, i % fillerAccounts),
          opportunityId,
          text,
          mark: { start: 0, end: text.length },
          occurredAt: new Date(date),
          source: at(FILLER_SOURCES, i % FILLER_SOURCES.length),
          role: at(FILLER_ROLES, i % FILLER_ROLES.length),
          confidence: round2(low ? 0.55 + 0.03 * (i % 5) : 0.78 + 0.01 * ((7 * i) % 20)),
        }
      }),
    ]

    const pains = slots.map((slot, g) => pushSlot(rows, p, g, slot, packId, sourceId(slot.source)))
    invariant(lowerMedian(pains) === p.pain, `${p.key} pain`)
    invariant(slots.filter((s) => s.confidence < PACK_DEFINITION.thresholds.place_confidence).length === p.low, `${p.key} low`)
  })

  return rows
}

function pushSlot(
  rows: {
    items: (typeof item.$inferInsert)[]
    sentences: (typeof sentence.$inferInsert)[]
    judgeAnswers: (typeof judgeAnswer.$inferInsert)[]
    mentions: (typeof mention.$inferInsert)[]
    placements: (typeof placement.$inferInsert)[]
  },
  p: ProtoProblem,
  g: number,
  slot: Slot,
  packId: PackId,
  sourceId: SourceId,
): PainLevel {
  const key = `${p.key}/${String(g)}`
  const itemId = seedId('item', key)
  const mentionId = seedId('mention', key)
  const placeAnswerId = seedId('answer', `${key}/place`)
  const pain = clampPain(p.pain + at(PAIN_OFFSETS, g % PAIN_OFFSETS.length))
  const sentences = splitSentences(slot.text)
  const marked = sentences.flatMap((s, ordinal) => (s.start < slot.mark.end && s.end > slot.mark.start ? [ordinal] : []))
  const confidence = slot.confidence as Confidence

  rows.items.push({
    id: itemId,
    workspaceId: SEED_WORKSPACE_ID,
    sourceId,
    externalId: `${p.key}-${String(g)}`,
    body: slot.text as RawText,
    occurredAt: slot.occurredAt,
    accountId: slot.accountId,
    authorRole: slot.role,
  })
  // The prototype copy holds no emails, phone numbers, or card numbers, so its sentences are already redacted.
  sentences.forEach((s, ordinal) => rows.sentences.push({ itemId, ordinal, text: s.text as RedactedText }))
  rows.judgeAnswers.push(
    {
      id: seedId('answer', `${key}/pain`),
      packId,
      itemId,
      questionKey: 'pain',
      subject: '',
      value: { type: 'score', level: pain },
      probabilities: Object.fromEntries(PAIN_KEYS.map((k, level) => [k, level === pain ? 0.82 : 0.06])),
      confidence: 0.82 as Confidence,
      ...ANSWERS,
    },
    {
      id: placeAnswerId,
      packId,
      itemId,
      questionKey: 'place',
      subject: 'm0',
      value: { type: 'choice', option: slot.opportunityId },
      probabilities: { [slot.opportunityId]: confidence, none: round2(1 - confidence) },
      confidence,
      ...ANSWERS,
    },
  )
  rows.mentions.push({
    id: mentionId,
    packId,
    itemId,
    ordinal: 0,
    sentenceStart: marked[0] ?? 0,
    sentenceEnd: marked.at(-1) ?? sentences.length - 1,
  })
  rows.placements.push({
    id: seedId('placement', key),
    mentionId,
    opportunityId: slot.opportunityId,
    judgeAnswerId: placeAnswerId,
    confidence,
  })
  return pain
}

/**
 * Splits `total` mentions into 12 weeks shaped like `trend`. First picks the three 4-week block totals whose
 * last-block-over-middle-block change is closest to the trend's own, then splits each block by the trend's weeks.
 */
export function blockThenWeek(total: number, trend: readonly number[]): number[] {
  const blocks = [0, 1, 2].map((k) => trend.slice(4 * k, 4 * k + 4).reduce((a, b) => a + b, 0))
  const [t0, t1, t2] = [at(blocks, 0), at(blocks, 1), at(blocks, 2)]
  const target = (t2 - t1) / Math.max(t1, 1)
  const shape = t0 + t1 + t2
  let best = { cost: Infinity, b: [0, 0, 0] }
  for (let b1 = 1; b1 <= total; b1++) {
    for (let b2 = 0; b1 + b2 <= total; b2++) {
      const b = [total - b1 - b2, b1, b2]
      const drift = b.reduce((sum, bk, k) => sum + Math.abs(bk - (total * at(blocks, k)) / shape), 0) / total
      const cost = Math.abs((b2 - b1) / Math.max(b1, 1) - target) + 0.5 * drift
      if (cost < best.cost) best = { cost, b }
    }
  }
  return best.b.flatMap((bk, k) => apportion(bk, trend.slice(4 * k, 4 * k + 4)))
}

/** Largest-remainder split of an integer total by weights. Ties go to the lower index. */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (total * w) / sum)
  const out = exact.map(Math.floor)
  const left = total - out.reduce((a, b) => a + b, 0)
  const byRemainder = exact
    .map((e, j) => ({ r: e - Math.floor(e), j }))
    .sort((a, b) => b.r - a.r || a.j - b.j)
  for (const { j } of byRemainder.slice(0, left)) out[j] = at(out, j) + 1
  return out
}

function coprimeStride(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  let s = 7
  while (gcd(s, n) !== 1) s++
  return s
}

function lowerMedian(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function clampPain(level: number): PainLevel {
  return Math.max(0, Math.min(3, level)) as PainLevel
}

function utcNoon(date: string): number {
  return Date.parse(`${date}T12:00:00Z`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index]
  if (value === undefined) throw new Error(`index ${String(index)} out of range`)
  return value
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Seed is infeasible: ${message}`)
}

function fail(what: string): never {
  throw new Error(`Seed is missing ${what}`)
}
