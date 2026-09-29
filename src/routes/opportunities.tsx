import { Link, Outlet, createFileRoute, deepEqual, stripSearchParams, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InlineDetail, MissingOpportunity, OpportunityDetail } from '@/components/opportunities/opportunity-detail'
import { formatUsd } from '@/components/opportunities/format'
import { useFlip, useMediaQuery } from '@/components/opportunities/hooks'
import { MapAnchor, MapLinksContext, type MapLinks } from '@/components/opportunities/map-links'
import { Pill } from '@/components/opportunities/pill'
import { Rail } from '@/components/opportunities/rail'
import { RANK_GRID, RankCard } from '@/components/opportunities/rank-card'
import {
  CLOSED,
  DEFAULT_VIEW,
  filterOf,
  filterSearch,
  mapSearch,
  weightsOf,
  type Layout,
  type MapSearch,
} from '@/components/opportunities/search'
import { Seg } from '@/components/opportunities/seg'
import { Sparkline } from '@/components/opportunities/sparkline'
import { db } from '@/db/client'
import type { MapFilter } from '@/domain/filters'
import { FACTORS, groupRanked, rank, type Ranked, type Weights } from '@/domain/rank'
import type { OpportunityId } from '@/domain/types'
import {
  loadOpportunityMap,
  type OpportunityMap,
  type OutcomeView,
  type ProblemView,
} from '@/server/opportunity-map.server'

const getOpportunityMap = createServerFn({ method: 'GET' })
  .validator(filterSearch)
  .handler(({ data }) => loadOpportunityMap(db, data))

export const Route = createFileRoute('/opportunities')({
  validateSearch: mapSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_VIEW)] },
  loaderDeps: ({ search }) => filterOf(search),
  loader: ({ deps }) => getOpportunityMap({ data: deps }),
  // The evidence list lives in the index child route, so opening it, closing it, or going Back never refetches the map.
  shouldReload: false,
  component: OpportunitiesPage,
})

type ReadyMap = Extract<OpportunityMap, { kind: 'ready' }>

function OpportunitiesPage() {
  const map = Route.useLoaderData()
  if (map.kind === 'empty') return <EmptyMap />
  return <OpportunityMapScreen map={map} />
}

const RAIL_PX = 250
const DETAIL_PX = 460
const MIN_SPLIT_LIST_PX = 570
const WIDE = `(min-width: ${String(RAIL_PX + DETAIL_PX + MIN_SPLIT_LIST_PX)}px)`

function OpportunityMapScreen({ map }: { map: ReadyMap }) {
  const search = Route.useSearch()
  const latest = useLatestSearch(search)
  const filter = useEqualValue(filterOf(latest))
  const urlWeights = useEqualValue(weightsOf(latest))
  const navigate = useNavigate({ from: Route.fullPath })
  const update = useCallback(
    (patch: Partial<MapSearch>, replace = false) =>
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace, resetScroll: false }),
    [navigate],
  )
  const select = useCallback((id: OpportunityId | undefined) => void update({ ...CLOSED, selected: id }), [update])
  const commitWeights = useCallback((next: Partial<Weights>) => void update(next, true), [update])
  const changeFilter = useCallback(
    (change: (latest: MapFilter) => Partial<MapFilter>) =>
      void navigate({ search: (prev) => ({ ...prev, ...change(filterOf(prev)) }), resetScroll: false }),
    [navigate],
  )

  const weights = useDraftWeights(urlWeights)
  const wide = useMediaQuery(WIDE, true)
  const layout: Layout = wide ? search.layout : 'stack'
  const [collapsed, setCollapsed] = useState<ReadonlySet<OpportunityId>>(new Set())

  const ranked = useMemo(() => rank(map.problems, weights.value), [map.problems, weights.value])
  const groups = useMemo(
    () =>
      search.group === 'outcome'
        ? groupRanked(ranked, (p) => p.outcome.id).flatMap(({ key, members }) => {
            const outcome = map.outcomes.find((o) => o.id === key)
            return outcome ? [{ outcome, members, open: !collapsed.has(key) }] : []
          })
        : null,
    [ranked, search.group, map.outcomes, collapsed],
  )
  const inDisplayOrder = groups ? groups.flatMap((g) => g.members) : ranked
  const visible = groups ? groups.flatMap((g) => (g.open ? g.members : [])) : ranked
  const selectedId = layout === 'split' ? (search.selected ?? inDisplayOrder[0]?.item.id) : search.selected
  const selected = ranked.find((r) => r.item.id === selectedId)

  const router = useRouter()
  const view = useEqualValue({ ...search, ...CLOSED, selected: undefined })
  const hrefOf = useCallback(
    (id: OpportunityId | undefined) =>
      router.buildLocation({ to: '/opportunities', search: { ...view, selected: id } }).href,
    [router, view],
  )
  const hrefs = useMemo(() => new Map(map.problems.map((p) => [p.id, hrefOf(p.id)])), [map.problems, hrefOf])
  const links = useMemo<MapLinks>(
    () => ({
      href: (patch) => router.buildLocation({ to: '/opportunities', search: { ...view, ...patch } }).href,
      go: (patch) => void navigate({ to: '/opportunities', search: { ...view, ...patch }, resetScroll: false }),
    }),
    [router, navigate, view],
  )

  const list = useRef<HTMLElement>(null)
  useFlip(list, ranked.map((r) => r.item.id).join(), `${search.group} ${layout}`)
  useCardKeys(layout === 'split', visible, selectedId, (id) => {
    void update({ ...CLOSED, selected: id }, true)
  })

  const card = (r: Ranked<ProblemView>) => {
    const isSelected = r.item.id === selectedId
    return (
      <li key={r.item.id}>
        <RankCard
          problem={r.item}
          position={r.position}
          score={r.score}
          layout={layout}
          selected={isSelected}
          href={(layout === 'stack' && isSelected ? hrefOf(undefined) : hrefs.get(r.item.id)) ?? hrefOf(r.item.id)}
          onSelect={select}
          subtitle={
            groups
              ? `${String(r.item.metrics.accounts)} accounts · ${String(r.item.metrics.mentions)} mentions`
              : r.item.outcome.title
          }
        >
          {layout === 'stack' && isSelected && <InlineDetail problem={r.item} window={map.window} />}
        </RankCard>
      </li>
    )
  }

  return (
    <MapLinksContext value={links}>
      {/* Prototype D keeps the browser's normal line height; Tailwind's preflight sets 1.5. */}
      <main className="flex h-[calc(100dvh-48px)] leading-[normal]">
        <Rail
          weights={weights.value}
          onWeightsInput={weights.setDraft}
          onWeightsCommit={commitWeights}
          filter={filter}
          sources={map.sources}
          onFilterChange={changeFilter}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b px-7 py-3">
            <Seg
              label="Grouping"
              value={search.group}
              options={[
                { value: 'ranked', label: 'Ranked' },
                { value: 'outcome', label: 'By outcome' },
              ]}
              onChange={(group) => void update({ group })}
            />
            <div className="flex-1" />
            <span className="text-meta text-ink-3">
              {layout === 'split' ? (
                <>
                  <Kbd>j</Kbd> <Kbd>k</Kbd> to move
                </>
              ) : (
                'Click a row to expand'
              )}
            </span>
            {wide && (
              <Seg
                label="Detail layout"
                value={search.layout}
                options={[
                  { value: 'stack', label: '▤ Stack' },
                  { value: 'split', label: '◧ Split' },
                ]}
                onChange={(next) => void update(next === 'stack' ? { layout: next, ...CLOSED, selected: undefined } : { layout: next })}
              />
            )}
          </div>
          <div className="flex min-h-0 flex-1">
            <section
              ref={list}
              aria-label="Ranked problems"
              className={`relative min-w-0 flex-1 overflow-auto pt-4 pb-22.5 ${
                layout === 'split' ? 'pr-4 pl-5' : 'px-7'
              }`}
            >
              {ranked.length === 0 ? (
                <p className="px-1.5 pt-1 text-ink-2">No problems match these filters.</p>
              ) : groups ? (
                groups.map(({ outcome, members, open }, i) => (
                  <div key={outcome.id} role="group" aria-label={outcome.title}>
                    <OutcomeHeader
                      outcome={outcome}
                      problems={members.length}
                      open={open}
                      first={i === 0}
                      selected={search.selected}
                      onToggle={() => {
                        setCollapsed((prev) => toggled(prev, outcome.id))
                      }}
                    />
                    {open && <ol>{members.map(card)}</ol>}
                  </div>
                ))
              ) : (
                <>
                  <div
                    aria-hidden
                    className={`${RANK_GRID[layout]} px-4 pb-2 text-caption font-semibold text-ink-3 [&>span:nth-child(n+4)]:text-right`}
                  >
                    <span>#</span>
                    <span>Problem</span>
                    <span>Score</span>
                    {layout === 'stack' && <span>Accounts</span>}
                    <span>ARR</span>
                    <span>Trend</span>
                  </div>
                  <ol>{ranked.map(card)}</ol>
                </>
              )}
            </section>
            {layout === 'split' && (selected || search.selected) && (
              <aside
                key={selected?.item.id ?? 'missing'}
                aria-label="Opportunity detail"
                className="w-[460px] shrink-0 overflow-auto border-l bg-card"
              >
                {selected ? <OpportunityDetail problem={selected.item} window={map.window} /> : <MissingOpportunity />}
              </aside>
            )}
          </div>
        </div>
        <Outlet />
      </main>
    </MapLinksContext>
  )
}

const OUTCOME_LINK =
  'rounded-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function OutcomeHeader({
  outcome,
  problems,
  open,
  first,
  selected,
  onToggle,
}: {
  outcome: OutcomeView
  problems: number
  open: boolean
  first: boolean
  selected: OpportunityId | undefined
  onToggle: () => void
}) {
  const { metrics } = outcome
  const accounts = { ...CLOSED, selected, outcome: outcome.id, evidence: 'accounts' } as const
  return (
    <div className={`flex items-center gap-2.5 px-1.5 pb-2.5 ${first ? 'pt-1' : 'pt-4.5'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-6 items-center gap-2.5 text-left">
            <span aria-hidden className="w-3 text-ink-3">
              {open ? '▾' : '▸'}
            </span>
            <span className="text-subhead font-[650] tracking-[-0.01em]">{outcome.title}</span>
          </button>
          {metrics.needsReview > 0 && (
            <Pill tone="warn" title="Low-confidence placements">
              {metrics.needsReview}
            </Pill>
          )}
        </div>
        <div className="mt-0.5 pl-5.5 text-meta text-ink-3">
          {problems} {problems === 1 ? 'problem' : 'problems'} ·{' '}
          <MapAnchor
            patch={accounts}
            label={`Show the ${String(metrics.accounts)} accounts of ${outcome.title}`}
            className={OUTCOME_LINK}
          >
            {metrics.accounts} accounts
          </MapAnchor>{' '}
          ·{' '}
          <MapAnchor
            patch={accounts}
            label={`Show the accounts behind ${formatUsd(metrics.arr)} ARR of ${outcome.title}`}
            className={OUTCOME_LINK}
          >
            {formatUsd(metrics.arr)} ARR
          </MapAnchor>
        </div>
      </div>
      <span className="flex-1" />
      <Sparkline
        series={metrics.weekly}
        width={90}
        height={24}
        label={`Mentions per week: ${metrics.weekly.join(', ')}${
          metrics.needsReview > 0 ? `, ${String(metrics.needsReview)} need review` : ''
        }`}
      />
    </div>
  )
}

/** The search the router is heading to. `search` is the settled one, which stays behind while a refetch is pending. */
function useLatestSearch(search: MapSearch): MapSearch {
  const location = useRouterState({ select: (s) => s.location })
  return location.pathname.replace(/\/$/, '') === Route.fullPath ? mapSearch.parse(location.search) : search
}

function useDraftWeights(url: Weights) {
  const key = FACTORS.map((f) => url[f]).join()
  const [draft, setDraft] = useState({ key, weights: url })
  if (draft.key !== key) setDraft({ key, weights: url })
  const setWeights = useCallback((weights: Weights) => {
    setDraft((prev) => ({ key: prev.key, weights }))
  }, [])
  return { value: draft.key === key ? draft.weights : url, setDraft: setWeights }
}

function useEqualValue<T>(value: T): T {
  const [kept, setKept] = useState(value)
  if (kept === value || deepEqual(kept, value)) return kept
  setKept(value)
  return value
}

function useCardKeys(
  enabled: boolean,
  cards: readonly Ranked<ProblemView>[],
  selectedId: OpportunityId | undefined,
  select: (id: OpportunityId) => void,
) {
  const latest = useRef({ cards, selectedId, select })
  useEffect(() => {
    latest.current = { cards, selectedId, select }
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const step = STEPS[event.key]
      if (step === undefined || event.defaultPrevented || isTyping(event)) return
      const { cards, selectedId, select } = latest.current
      const index = cards.findIndex((r) => r.item.id === selectedId)
      const next = cards[index < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, index + step))]
      if (!next) return
      event.preventDefault()
      if (next.item.id !== selectedId) select(next.item.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}

const STEPS: Partial<Record<string, 1 | -1>> = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }

function isTyping(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest('input, textarea, select, [role=slider], [role=dialog]') !== null
}

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-[4px] border border-b-2 bg-card px-1 font-mono text-micro text-foreground">
      {children}
    </kbd>
  )
}

function EmptyMap() {
  return (
    <main className="grid h-[calc(100dvh-48px)] place-items-center">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-title font-semibold">No opportunities yet</h1>
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
