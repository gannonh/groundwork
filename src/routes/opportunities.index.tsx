import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { EvidenceSheet } from '@/components/opportunities/evidence-list'
import { CLOSED, evidenceOf, filterOf, filterSearch } from '@/components/opportunities/search'
import { db } from '@/db/client'
import { parseEvidenceFilter } from '@/domain/evidence'
import type { SnapshotId } from '@/domain/types'
import { loadEvidence, type EvidenceList } from '@/server/opportunity-map.server'

const getEvidence = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => {
    const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const filter = parseEvidenceFilter(input.filter)
    const mapFilter = filterSearch.safeParse(input.mapFilter)
    if (typeof input.id !== 'string' || !filter || !mapFilter.success || typeof input.snapshot !== 'string' || input.snapshot === '') {
      throw new Error('Expected a problem id, an evidence filter, a map filter, and a map snapshot')
    }
    return { problemId: input.id, filter, mapFilter: mapFilter.data, snapshot: input.snapshot as SnapshotId }
  })
  .handler(({ data }) => loadEvidence(db, data.mapFilter, data))

// The /opportunities layout renders the map and the selection; this index route owns the evidence sheet.
export const Route = createFileRoute('/opportunities/')({
  loaderDeps: ({ search }) => ({ selected: search.selected, filter: evidenceOf(search), mapFilter: filterOf(search) }),
  // The snapshot comes from the map this list opens over, not the URL, so a pasted link loads a fresh map and list.
  loader: async ({ deps, parentMatchPromise }): Promise<EvidenceList | null> => {
    if (!deps.filter || !deps.selected) return null
    const { loaderData: map } = await parentMatchPromise
    if (map?.kind !== 'ready') return { kind: 'missing' }
    return getEvidence({
      data: { id: deps.selected, filter: deps.filter, mapFilter: deps.mapFilter, snapshot: map.snapshot },
    })
  },
  shouldReload: false,
  component: EvidenceRoute,
})

function EvidenceRoute() {
  const list = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  // Closing clears the list from the URL at once; keeping the last one mounted lets the sheet animate out.
  const [shown, setShown] = useState(list)
  if (list && list !== shown) setShown(list)
  if (!shown) return null
  return (
    <EvidenceSheet
      open={list !== null}
      list={shown}
      onClose={() =>
        void navigate({ to: '/opportunities', search: (prev) => ({ ...prev, ...CLOSED }), resetScroll: false })
      }
      onReload={() => void router.invalidate()}
    />
  )
}
