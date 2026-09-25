import type {
  Account,
  AccountId,
  Confidence,
  IsoDate,
  Item,
  ItemId,
  MentionId,
  Opportunity,
  OpportunityId,
  PainLevel,
  Placement,
  Usd,
} from './types.ts'

export const TREND_WEEKS = 12
/** Momentum compares the last DELTA_WEEKS weeks with the DELTA_WEEKS before them. */
export const DELTA_WEEKS = 4

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export type Evidence = {
  readonly opportunities: readonly Opportunity[]
  readonly placements: readonly Placement[]
  /** Every item a placement references. */
  readonly items: readonly Item[]
  readonly accounts: readonly Account[]
  /** The pack's place_confidence. Below it a placement needs review but still counts. */
  readonly placeThreshold: Confidence
}

/** TREND_WEEKS Monday-start UTC weeks. `lastWeek` contains `asOf`. */
export type TrendWindow = { readonly firstWeek: IsoDate; readonly lastWeek: IsoDate }
/** Mentions per week, oldest first, length TREND_WEEKS. Only computeMetrics constructs one. */
export type WeeklyCounts = readonly number[] & { readonly __weeks: typeof TREND_WEEKS }

/** One mention behind a node's numbers: the click-through and quote source for every metric. */
export type CountedMention = {
  readonly mentionId: MentionId
  readonly itemId: ItemId
  readonly accountId: AccountId | null
  readonly occurredAt: Date
  /** Set when every placement of this mention in the node's subtree is below the threshold. */
  readonly lowConfidence: Confidence | null
}

export type OpportunityMetrics = {
  /** Distinct mentions in the subtree. */
  readonly mentions: number
  /** Distinct non-null accounts of those mentions' items. */
  readonly accounts: number
  /** ARR summed once per distinct account. */
  readonly arr: Usd
  /** Lower median of item pain over counted mentions; null when none has a pain answer. */
  readonly pain: PainLevel | null
  /** Counted mentions with lowConfidence set. They still count toward every number. */
  readonly needsReview: number
  readonly weekly: WeeklyCounts
  /** (last DELTA_WEEKS - previous DELTA_WEEKS) / max(previous DELTA_WEEKS, 1). */
  readonly delta: number
  /** Newest first. */
  readonly evidence: readonly CountedMention[]
}

export type Measured = Opportunity & { readonly metrics: OpportunityMetrics }

/**
 * Pure. Returns every input opportunity, in input order, with metrics over its whole subtree. A placement counts
 * on its node and on every ancestor. Mentions outside the window count in `mentions` but not in `weekly`.
 */
export function computeMetrics(
  evidence: Evidence,
  clock: { readonly asOf: Date },
): { readonly window: TrendWindow; readonly opportunities: readonly Measured[] } {
  const parentOf = new Map(evidence.opportunities.map((o) => [o.id, o.parentId]))
  const itemsById = new Map(evidence.items.map((i) => [i.id, i]))
  const arrById = new Map(evidence.accounts.map((a) => [a.id, a.arr]))

  const byNode = new Map<OpportunityId, Map<MentionId, CountedMention>>()
  for (const placement of evidence.placements) {
    const item = itemsById.get(placement.itemId)
    if (!item) throw new Error(`Placement ${placement.mentionId} references an item that was not supplied`)
    const counted: CountedMention = {
      mentionId: placement.mentionId,
      itemId: item.id,
      accountId: item.accountId,
      occurredAt: item.occurredAt,
      lowConfidence: placement.confidence < evidence.placeThreshold ? placement.confidence : null,
    }
    for (let node: OpportunityId | null | undefined = placement.opportunityId; node; node = parentOf.get(node)) {
      let mentions = byNode.get(node)
      if (!mentions) byNode.set(node, (mentions = new Map<MentionId, CountedMention>()))
      const seen = mentions.get(counted.mentionId)
      mentions.set(counted.mentionId, seen ? mergeCounted(seen, counted) : counted)
    }
  }

  const lastWeekStart = mondayOf(clock.asOf)
  const firstWeekStart = lastWeekStart - (TREND_WEEKS - 1) * WEEK_MS
  const painsOf = (m: CountedMention): PainLevel[] => {
    const pain = itemsById.get(m.itemId)?.pain ?? null
    return pain === null ? [] : [pain]
  }

  const opportunities = evidence.opportunities.map((opportunity): Measured => {
    const counted = [...(byNode.get(opportunity.id)?.values() ?? [])].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || compareText(a.mentionId, b.mentionId),
    )
    const accountIds = new Set(counted.flatMap((m) => (m.accountId ? [m.accountId] : [])))
    let arr = 0
    for (const id of accountIds) arr += arrById.get(id) ?? 0

    const weekly = Array.from({ length: TREND_WEEKS }, () => 0)
    for (const m of counted) {
      const week = Math.floor((mondayOf(m.occurredAt) - firstWeekStart) / WEEK_MS)
      if (week >= 0 && week < TREND_WEEKS) weekly[week] = (weekly[week] ?? 0) + 1
    }

    return {
      ...opportunity,
      metrics: {
        mentions: counted.length,
        accounts: accountIds.size,
        arr: arr as Usd,
        pain: lowerMedian(counted.flatMap(painsOf)),
        needsReview: counted.filter((m) => m.lowConfidence !== null).length,
        weekly: weekly as unknown as WeeklyCounts,
        delta: fourWeekDelta(weekly),
        evidence: counted,
      },
    }
  })

  return {
    window: { firstWeek: isoDate(firstWeekStart), lastWeek: isoDate(lastWeekStart) },
    opportunities,
  }
}

/** Trend policy: the window ends at the newest evidence, or at `now` when there is none. */
export function evidenceAsOf(items: readonly Item[], now: Date): Date {
  let newest: Date | null = null
  for (const item of items) if (!newest || item.occurredAt > newest) newest = item.occurredAt
  return newest ?? now
}

function fourWeekDelta(weekly: readonly number[]): number {
  const sum = (from: number, to: number) => weekly.slice(from, to).reduce((a, b) => a + b, 0)
  const last = sum(TREND_WEEKS - DELTA_WEEKS, TREND_WEEKS)
  const previous = sum(TREND_WEEKS - 2 * DELTA_WEEKS, TREND_WEEKS - DELTA_WEEKS)
  return (last - previous) / Math.max(previous, 1)
}

/** A confident placement anywhere in the subtree makes the mention confident. */
function mergeCounted(a: CountedMention, b: CountedMention): CountedMention {
  if (a.lowConfidence === null || b.lowConfidence === null) return { ...a, lowConfidence: null }
  return a.lowConfidence >= b.lowConfidence ? a : b
}

function lowerMedian(values: readonly PainLevel[]): PainLevel | null {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null
}

function mondayOf(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return day - ((date.getUTCDay() + 6) % 7) * DAY_MS
}

function isoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10) as IsoDate
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
