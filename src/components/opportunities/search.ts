import { z } from 'zod'
import { parseEvidenceFilter, type EvidenceFilter } from '@/domain/evidence'
import { DATE_RANGES, SEGMENTS, SPEAKERS, type MapFilter } from '@/domain/filters'
import { BALANCED, type Weights } from '@/domain/rank'
import type { OpportunityId, SourceId } from '@/domain/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = <T extends string>() => z.custom<T>((value) => typeof value === 'string' && UUID.test(value))
const list = <T extends z.ZodType>(item: T) => z.tuple([item], item).readonly().optional().catch(undefined)
const weight = (fallback: number) => z.int().min(0).max(60).default(fallback).catch(fallback)

export const DEFAULT_VIEW = { ...BALANCED, group: 'ranked', layout: 'split', since: '90d' } as const

export const filterSearch = z.object({
  segments: list(z.literal(SEGMENTS.map((s) => s.key))),
  sources: list(uuid<SourceId>()),
  speakers: list(z.literal(SPEAKERS.map((s) => s.key))),
  since: z
    .literal(DATE_RANGES.map((r) => r.key))
    .default(DEFAULT_VIEW.since)
    .catch(DEFAULT_VIEW.since),
})

const optionalText = z.string().optional().catch(undefined)

/** Search values that close the evidence list. */
export const CLOSED = { evidence: undefined, solution: undefined, account: undefined, outcome: undefined } as const

export const mapSearch = filterSearch
  .extend({
    reach: weight(DEFAULT_VIEW.reach),
    revenue: weight(DEFAULT_VIEW.revenue),
    pain: weight(DEFAULT_VIEW.pain),
    momentum: weight(DEFAULT_VIEW.momentum),
    group: z.enum(['ranked', 'outcome']).default(DEFAULT_VIEW.group).catch(DEFAULT_VIEW.group),
    layout: z.enum(['split', 'stack']).default(DEFAULT_VIEW.layout).catch(DEFAULT_VIEW.layout),
    selected: uuid<OpportunityId>().optional().catch(undefined),
    evidence: optionalText,
    solution: optionalText,
    account: optionalText,
    /** The outcome whose list is open. Absent means the list belongs to the selected problem. */
    outcome: uuid<OpportunityId>().optional().catch(undefined),
  })
  // A combination parseEvidenceFilter rejects, such as a solution list with no solution, reads as closed.
  .transform(({ evidence, solution, account, outcome, ...view }) => {
    const open = parseEvidenceFilter({ evidence, solution, account })
    return {
      ...view,
      evidence: open?.evidence,
      solution: open?.evidence === 'solution' ? open.solution : undefined,
      account: open?.evidence === 'account' ? open.account : undefined,
      outcome: open ? outcome : undefined,
    }
  })
export type MapSearch = z.output<typeof mapSearch>
export type Layout = MapSearch['layout']

/** The problem or outcome whose evidence list is open. */
export function evidenceSubjectOf(search: MapSearch): OpportunityId | undefined {
  return search.outcome ?? search.selected
}

/** The open evidence list, or null when it is closed. */
export function evidenceOf(search: MapSearch): EvidenceFilter | null {
  return parseEvidenceFilter(search)
}

export function filterOf(search: MapSearch): MapFilter {
  const { segments, sources, speakers, since } = search
  return { segments, sources, speakers, since }
}

export function weightsOf(search: MapSearch): Weights {
  const { reach, revenue, pain, momentum } = search
  return { reach, revenue, pain, momentum }
}
