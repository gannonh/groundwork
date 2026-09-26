import { z } from 'zod'
import { DATE_RANGES, SEGMENTS, SPEAKERS, type EvidenceFilter } from '@/domain/filters'
import { BALANCED, type Weights } from '@/domain/rank'
import type { OpportunityId, SourceId } from '@/domain/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = <T extends string>() => z.custom<T>((value) => typeof value === 'string' && UUID.test(value))
const list = <T extends z.ZodType>(item: T) => z.tuple([item], item).readonly().optional().catch(undefined)
const weight = (fallback: number) => z.int().min(0).max(60).default(fallback).catch(fallback)

/** Values the URL leaves out. */
export const DEFAULT_VIEW = { ...BALANCED, group: 'ranked', layout: 'split', since: '90d' } as const

/** The map's filters. The server function parses its input with this too. */
export const filterSearch = z.object({
  segments: list(z.literal(SEGMENTS.map((s) => s.key))),
  sources: list(uuid<SourceId>()),
  speakers: list(z.literal(SPEAKERS.map((s) => s.key))),
  since: z
    .literal(DATE_RANGES.map((r) => r.key))
    .default(DEFAULT_VIEW.since)
    .catch(DEFAULT_VIEW.since),
})

/** The saved view: /opportunities search params. Invalid values fall back to their defaults. */
export const mapSearch = filterSearch.extend({
  reach: weight(DEFAULT_VIEW.reach),
  revenue: weight(DEFAULT_VIEW.revenue),
  pain: weight(DEFAULT_VIEW.pain),
  momentum: weight(DEFAULT_VIEW.momentum),
  group: z.enum(['ranked', 'outcome']).default(DEFAULT_VIEW.group).catch(DEFAULT_VIEW.group),
  layout: z.enum(['split', 'stack']).default(DEFAULT_VIEW.layout).catch(DEFAULT_VIEW.layout),
  selected: uuid<OpportunityId>().optional().catch(undefined),
})
export type MapSearch = z.output<typeof mapSearch>
export type Layout = MapSearch['layout']

export function filterOf(search: MapSearch): EvidenceFilter {
  const { segments, sources, speakers, since } = search
  return { segments, sources, speakers, since }
}

export function weightsOf(search: MapSearch): Weights {
  const { reach, revenue, pain, momentum } = search
  return { reach, revenue, pain, momentum }
}
