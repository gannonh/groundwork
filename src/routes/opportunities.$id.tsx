import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { EvidenceSheet } from '@/components/opportunities/evidence-list'
import { db } from '@/db/client'
import { parseEvidenceFilter, type EvidenceFilter } from '@/domain/evidence'
import { loadEvidence } from '@/server/opportunity-map.server'

/** The evidence list is the URL: no search means the sheet is closed. */
type DetailSearch = EvidenceFilter | { readonly evidence?: never }

const getEvidence = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => {
    const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const filter = parseEvidenceFilter(input.filter)
    if (typeof input.id !== 'string' || !filter) throw new Error('Expected a problem id and an evidence filter')
    return { id: input.id, filter }
  })
  .handler(({ data }) => loadEvidence(db, data.id, data.filter))

// The /opportunities layout reads the $id param and renders the selection; this route owns the evidence sheet.
export const Route = createFileRoute('/opportunities/$id')({
  validateSearch: (search: Record<string, unknown>): DetailSearch => parseEvidenceFilter(search) ?? {},
  loaderDeps: ({ search }) => ({ filter: parseEvidenceFilter(search) }),
  loader: ({ params, deps }) => (deps.filter ? getEvidence({ data: { id: params.id, filter: deps.filter } }) : null),
  component: EvidenceRoute,
})

function EvidenceRoute() {
  const list = Route.useLoaderData()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  if (!list) return null
  return (
    <EvidenceSheet
      list={list}
      onClose={() => void navigate({ to: '/opportunities/$id', params: { id }, resetScroll: false })}
    />
  )
}
