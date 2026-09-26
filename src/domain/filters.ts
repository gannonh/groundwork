import type { Evidence } from './metrics.ts'
import type { NonEmptyArray, SourceId, SpeakerRole, Usd } from './types.ts'

export const SEGMENTS = [
  { key: 'enterprise', label: 'Enterprise', minArr: 150_000 },
  { key: 'mid_market', label: 'Mid-market', minArr: 80_000 },
  { key: 'smb', label: 'SMB', minArr: 0 },
] as const
export type Segment = (typeof SEGMENTS)[number]['key']

export function segmentOf(arr: Usd): Segment {
  return SEGMENTS.filter((s) => arr >= s.minArr).reduce((a, b) => (b.minArr > a.minArr ? b : a)).key
}

export const SPEAKERS = [
  { key: 'end_user', label: 'End user' },
  { key: 'admin', label: 'Admin' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'executive', label: 'Exec' },
] as const satisfies readonly { key: SpeakerRole; label: string }[]
export type Speaker = (typeof SPEAKERS)[number]['key']

export const DATE_RANGES = [
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
  { key: '1y', days: 365 },
] as const
export type DateRange = (typeof DATE_RANGES)[number]['key']

/** An absent list means no restriction. */
export type EvidenceFilter = {
  readonly segments?: NonEmptyArray<Segment>
  readonly sources?: NonEmptyArray<SourceId>
  readonly speakers?: NonEmptyArray<Speaker>
  readonly since: DateRange
}

const DAY_MS = 86_400_000

export function filterEvidence(evidence: Evidence, filter: EvidenceFilter, asOf: Date): Evidence {
  const days = DATE_RANGES.find((r) => r.key === filter.since)?.days ?? 0
  const cutoff = asOf.getTime() - days * DAY_MS
  const arrById = new Map(evidence.accounts.map((a) => [a.id, a.arr]))
  const segments = filter.segments && new Set<Segment>(filter.segments)
  const sources = filter.sources && new Set<SourceId>(filter.sources)
  const speakers = filter.speakers && new Set<SpeakerRole>(filter.speakers)

  const items = evidence.items.filter((item) => {
    if (item.occurredAt.getTime() < cutoff) return false
    if (sources && !sources.has(item.sourceId)) return false
    if (speakers && (item.role === null || !speakers.has(item.role))) return false
    if (segments) {
      const arr = item.accountId === null ? undefined : arrById.get(item.accountId)
      if (arr === undefined || !segments.has(segmentOf(arr))) return false
    }
    return true
  })
  const kept = new Set(items.map((i) => i.id))
  return { ...evidence, items, placements: evidence.placements.filter((p) => kept.has(p.itemId)) }
}
