import { createContext, useContext, type MouseEvent, type ReactNode } from 'react'
import type { MapSearch } from './search'

export type MapLinks = {
  /** The /opportunities URL for the current view with `patch` applied. */
  readonly href: (patch: Partial<MapSearch>) => string
  readonly go: (patch: Partial<MapSearch>) => void
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
