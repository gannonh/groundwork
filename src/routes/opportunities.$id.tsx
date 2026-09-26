import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { EvidenceSheet } from '@/components/opportunities/evidence-list'
import { db } from '@/db/client'
import { parseEvidenceFilter, type EvidenceFilter } from '@/domain/evidence'
import type { SnapshotId } from '@/domain/types'
import { loadEvidence, type EvidenceList } from '@/server/opportunity-map.server'

/** The evidence list is the URL: no search means the sheet is closed. */
type DetailSearch = EvidenceFilter | { readonly evidence?: never }

const getEvidence = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => {
    const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const filter = parseEvidenceFilter(input.filter)
    if (typeof input.id !== 'string' || !filter || typeof input.snapshot !== 'string' || input.snapshot === '') {
      throw new Error('Expected a problem id, an evidence filter, and a map snapshot')
    }
    return { problemId: input.id, filter, snapshot: input.snapshot as SnapshotId }
  })
  .handler(({ data }) => loadEvidence(db, data))

// The /opportunities layout reads the $id param and renders the selection; this route owns the evidence sheet.
export const Route = createFileRoute('/opportunities/$id')({
  validateSearch: (search: Record<string, unknown>): DetailSearch => parseEvidenceFilter(search) ?? {},
  loaderDeps: ({ search }) => ({ filter: parseEvidenceFilter(search) }),
  // The snapshot comes from the map this list opens over, not the URL, so a pasted link loads a fresh map and list.
  loader: async ({ params, deps, parentMatchPromise }): Promise<EvidenceList | null> => {
    if (!deps.filter) return null
    const { loaderData: map } = await parentMatchPromise
    if (map?.kind !== 'ready') return { kind: 'missing' }
    return getEvidence({ data: { id: params.id, filter: deps.filter, snapshot: map.snapshot } })
  },
  component: EvidenceRoute,
})

function EvidenceRoute() {
  const list = Route.useLoaderData()
  const { id } = Route.useParams()
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
      onClose={() => void navigate({ to: '/opportunities/$id', params: { id }, resetScroll: false })}
      onReload={() => void router.invalidate()}
    />
  )
}
