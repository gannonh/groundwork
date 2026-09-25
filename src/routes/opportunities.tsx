import { Link, createFileRoute, useParams } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { OpportunityDetail, MissingOpportunity } from '@/components/opportunities/opportunity-detail'
import { RANK_GRID, RankCard } from '@/components/opportunities/rank-card'
import { db } from '@/db/client'
import { BALANCED, rank } from '@/domain/rank'
import { loadOpportunityMap } from '@/server/opportunity-map.server'

const getOpportunityMap = createServerFn({ method: 'GET' }).handler(() => loadOpportunityMap(db))

export const Route = createFileRoute('/opportunities')({
  loader: () => getOpportunityMap(),
  // Selection is the child $id param, so choosing a card or going Back never refetches the map.
  shouldReload: false,
  component: OpportunitiesPage,
})

function OpportunitiesPage() {
  const map = Route.useLoaderData()
  const { id } = useParams({ strict: false })
  if (map.kind === 'empty') return <EmptyMap />

  const ranked = rank(map.problems, BALANCED)
  const selected = id === undefined ? ranked[0] : ranked.find((r) => r.item.id === id)

  return (
    // Prototype D keeps the browser's normal line height; Tailwind's preflight sets 1.5.
    <main className="flex h-[calc(100dvh-48px)] leading-[normal]">
      <section aria-label="Ranked problems" className="min-w-0 flex-1 overflow-auto pt-4 pr-4 pb-[90px] pl-5">
        <div
          aria-hidden
          className={`${RANK_GRID} px-4 pb-2 text-[11px] font-semibold text-ink-3 [&>span:nth-child(n+4)]:text-right`}
        >
          <span>#</span>
          <span>Problem</span>
          <span>Score</span>
          <span>ARR</span>
          <span>Trend</span>
        </div>
        <ol>
          {ranked.map((r) => (
            <li key={r.item.id}>
              <RankCard
                problem={r.item}
                position={r.position}
                score={r.score}
                selected={r.item.id === selected?.item.id}
              />
            </li>
          ))}
        </ol>
      </section>
      <aside
        key={selected?.item.id ?? 'missing'}
        aria-label="Opportunity detail"
        className="w-[460px] shrink-0 overflow-auto border-l bg-card"
      >
        {selected ? <OpportunityDetail problem={selected.item} window={map.window} /> : <MissingOpportunity />}
      </aside>
    </main>
  )
}

function EmptyMap() {
  return (
    <main className="grid h-[calc(100dvh-48px)] place-items-center">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-[17px] font-semibold">No opportunities yet</h1>
        <p className="text-ink-2">
          Groundwork ranks customer problems once it has conversations to read.{' '}
          <Link to="/sources" className="font-medium text-primary hover:underline">
            Import a source
          </Link>{' '}
          to get started.
        </p>
      </div>
    </main>
  )
}
