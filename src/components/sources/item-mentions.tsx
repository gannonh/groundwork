import { Link } from '@tanstack/react-router'
import { formatConfidence } from '@/components/opportunities/format'
import { Pill } from '@/components/opportunities/pill'
import type { MapSearch } from '@/components/opportunities/search'
import type { ItemId, MentionId } from '@/domain/types'
import type { ItemMention } from '@/server/sources.server'

const KIND_LABELS = { outcome: 'Outcome', problem: 'Problem', solution: 'Solution' } as const

/** Sentence ordinals are 0-based in storage and 1-based on the page. */
export function formatSpan({ start, end }: ItemMention['span']): string {
  return start === end ? `Sentence ${String(start + 1)}` : `Sentences ${String(start + 1)}–${String(end + 1)}`
}

export function ItemMentions({
  itemId,
  mentions,
  selected,
  from,
}: {
  itemId: ItemId
  mentions: readonly ItemMention[]
  selected: MentionId | undefined
  from: Partial<MapSearch> | undefined
}) {
  if (mentions.length === 0) return <p className="text-ink-3">No mentions in this item yet.</p>
  return (
    <ul aria-label="Mentions" className="rounded-[10px] border bg-card">
      {mentions.map((mention) => {
        const isSelected = mention.id === selected
        const { placement } = mention
        return (
          <li key={mention.id} className="border-b last:border-b-0">
            <Link
              to="/items/$id"
              params={{ id: itemId }}
              search={{ mention: mention.id, from }}
              replace
              resetScroll={false}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-l-[3px] px-3 py-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                placement?.lowConfidence == null ? 'border-l-transparent' : 'border-l-warn-line'
              }`}
            >
              <span className="min-w-0 flex-1">
                {placement ? (
                  <>
                    <span className={isSelected ? 'font-semibold' : 'font-medium'}>{placement.opportunity.title}</span>
                    <span className="block text-meta text-ink-3">
                      {KIND_LABELS[placement.opportunity.kind]}
                      {placement.opportunity.within && ` in ${placement.opportunity.within}`}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-3">Not placed yet</span>
                )}
              </span>
              <span className="text-meta text-ink-3">
                {isSelected ? <mark className="bg-mark px-px text-foreground">{formatSpan(mention.span)}</mark> : formatSpan(mention.span)}
              </span>
              {placement &&
                (placement.lowConfidence === null ? (
                  <span className="text-meta text-ink-3 tabular-nums">{formatConfidence(placement.confidence)}</span>
                ) : (
                  <Pill tone="warn" title="Below the pack's place threshold">
                    {formatConfidence(placement.lowConfidence)}
                  </Pill>
                ))}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
