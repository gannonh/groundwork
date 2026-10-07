import { createContext, useContext, type MouseEvent, type ReactNode } from 'react'
import type { ItemId, MentionId } from '@/domain/types'
import type { MapSearch } from './search'

export type MapLinks = {
  /** The /opportunities URL for the current view with `patch` applied. */
  readonly href: (patch: Partial<MapSearch>) => string
  readonly go: (patch: Partial<MapSearch>) => void
  /** The item page for one mention, carrying this map view so the page can return to it. */
  readonly itemHref: (itemId: ItemId, mention: MentionId) => string
  readonly openItem: (itemId: ItemId, mention: MentionId) => void
}

export const MapLinksContext = createContext<MapLinks | null>(null)

/**
 * A link to the current map view with `patch` applied. A plain anchor rather than a router Link, because every Link
 * rebuilds its location on each navigation.
 */
export function MapAnchor({
  patch,
  label,
  className,
  children,
}: {
  patch: Partial<MapSearch>
  label: string
  className: string
  children: ReactNode
}) {
  const links = useContext(MapLinksContext)
  if (!links) throw new Error('MapAnchor needs a MapLinksContext')
  return (
    <a
      href={links.href(patch)}
      aria-label={label}
      className={className}
      onClick={(event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        links.go(patch)
      }}
    >
      {children}
    </a>
  )
}

/** A link to the item behind a mention. A plain anchor for the same reason as MapAnchor. */
export function ItemAnchor({
  itemId,
  mention,
  label,
  className,
  children,
}: {
  itemId: ItemId
  mention: MentionId
  label: string
  className: string
  children: ReactNode
}) {
  const links = useContext(MapLinksContext)
  if (!links) throw new Error('ItemAnchor needs a MapLinksContext')
  return (
    <a
      href={links.itemHref(itemId, mention)}
      aria-label={label}
      className={className}
      onClick={(event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        links.openItem(itemId, mention)
      }}
    >
      {children}
    </a>
  )
}
