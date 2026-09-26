import { Link, createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState } from 'react'
import { InlineDetail, MissingOpportunity, OpportunityDetail } from '@/components/opportunities/opportunity-detail'
import { formatUsd } from '@/components/opportunities/format'
import { useFlip, useMediaQuery } from '@/components/opportunities/hooks'
import { Rail } from '@/components/opportunities/rail'
import { RANK_GRID, RankCard } from '@/components/opportunities/rank-card'
import {
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
import type { EvidenceFilter } from '@/domain/filters'
import { FACTORS, groupRanked, rank, type Ranked, type Weights } from '@/domain/rank'
import type { OpportunityId } from '@/domain/types'
import { loadOpportunityMap, type OpportunityMap, type ProblemView } from '@/server/opportunity-map.server'

const getOpportunityMap = createServerFn({ method: 'GET' })
  .validator(filterSearch)
  .handler(({ data }) => loadOpportunityMap(db, data))

export const Route = createFileRoute('/opportunities')({
  validateSearch: mapSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_VIEW)] },
  // Only filters change the data. Weights, grouping, layout, and selection re-rank and re-render on the client.
  loaderDeps: ({ search }) => filterOf(search),
  loader: ({ deps }) => getOpportunityMap({ data: deps }),
  shouldReload: false,
  component: OpportunitiesPage,
})

type ReadyMap = Extract<OpportunityMap, { kind: 'ready' }>

function OpportunitiesPage() {
  const map = Route.useLoaderData()
  if (map.kind === 'empty') return <EmptyMap />
  return <OpportunityMapScreen map={map} />
}

// Below this, a 250 px rail and a 460 px detail pane leave the Split list too narrow for a card title.
const WIDE = '(min-width: 1280px)'

function OpportunityMapScreen({ map }: { map: ReadyMap }) {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const update = (patch: Partial<MapSearch>, replace = false) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace, resetScroll: false })

  const weights = useDraftWeights(weightsOf(search))
  const wide = useMediaQuery(WIDE, true)
  const layout: Layout = wide ? search.layout : 'stack'
  const [collapsed, setCollapsed] = useState<ReadonlySet<OpportunityId>>(new Set())

  const ranked = rank(map.problems, weights.value)
  const groups =
    search.group === 'outcome'
      ? groupRanked(ranked, (p) => p.outcome.id).flatMap(({ key, members }) => {
          const outcome = map.outcomes.find((o) => o.id === key)
          return outcome ? [{ outcome, members, open: !collapsed.has(key) }] : []
        })
      : null
  const inDisplayOrder = groups ? groups.flatMap((g) => g.members) : ranked
  const visible = groups ? groups.flatMap((g) => (g.open ? g.members : [])) : ranked
  const selectedId = layout === 'split' ? (search.selected ?? inDisplayOrder[0]?.item.id) : search.selected
  const selected = ranked.find((r) => r.item.id === selectedId)

  const list = useRef<HTMLElement>(null)
  useFlip(list, ranked.map((r) => r.item.id).join(), `${search.group} ${layout}`)
  useCardKeys(layout === 'split', visible, selectedId, (id) => {
    void update({ selected: id }, true)
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
    // Prototype D keeps the browser's normal line height; Tailwind's preflight sets 1.5.
    <main className="flex h-[calc(100dvh-48px)] leading-[normal]">
      <Rail
        weights={weights.value}
        onWeightsInput={weights.setDraft}
        onWeightsCommit={(next) => void update(next, true)}
        filter={filterOf(search)}
        sources={map.sources}
        onFilterChange={(patch: Partial<EvidenceFilter>) => void update(patch)}
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
          <span className="text-[12px] text-ink-3">
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
              onChange={(next) => void update(next === 'stack' ? { layout: next, selected: undefined } : { layout: next })}
            />
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          <section
            ref={list}
            aria-label="Ranked problems"
            className={`relative min-w-0 flex-1 overflow-auto pt-4 pb-[90px] ${
              layout === 'split' ? 'pr-4 pl-5' : 'px-7'
            }`}
          >
            {ranked.length === 0 ? (
              <p className="px-1.5 pt-1 text-ink-2">No problems match these filters.</p>
            ) : groups ? (
              groups.map(({ outcome, members, open }, i) => (
                <div key={outcome.id} role="group" aria-label={outcome.title}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      setCollapsed((prev) => toggled(prev, outcome.id))
                    }}
                    className={`flex w-full items-center gap-2.5 px-1.5 pb-2.5 text-left ${i === 0 ? 'pt-1' : 'pt-[18px]'}`}
                  >
                    <span aria-hidden className="w-3 text-ink-3">
                      {open ? '▾' : '▸'}
                    </span>
                    <span>
                      <span className="block text-[15px] font-[650] tracking-[-0.01em]">{outcome.title}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-3">
                        {members.length} {members.length === 1 ? 'problem' : 'problems'} ·{' '}
                        {outcome.metrics.accounts} accounts · {formatUsd(outcome.metrics.arr)} ARR
                      </span>
                    </span>
                    <span className="flex-1" />
                    <Sparkline
                      series={outcome.metrics.weekly}
                      width={90}
                      height={24}
                      label={`Mentions per week: ${outcome.metrics.weekly.join(', ')}`}
                    />
                  </button>
                  {open && <ol>{members.map(card)}</ol>}
                </div>
              ))
            ) : (
              <>
                <div
                  aria-hidden
                  className={`${RANK_GRID[layout]} px-4 pb-2 text-[11px] font-semibold text-ink-3 [&>span:nth-child(n+4)]:text-right`}
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
    </main>
  )
}

/**
 * The weights the list ranks by. A slider drag re-ranks from a local draft on every step and writes the URL only
 * when released. Any change to the URL's weights, such as a preset, Back, or a shared link, replaces the draft.
 */
function useDraftWeights(url: Weights) {
  const key = FACTORS.map((f) => url[f]).join()
  const [draft, setDraft] = useState({ key, weights: url })
  if (draft.key !== key) setDraft({ key, weights: url })
  return {
    value: draft.key === key ? draft.weights : url,
    setDraft: (weights: Weights) => {
      setDraft({ key, weights })
    },
  }
}

/** j/ArrowDown and k/ArrowUp move the selection through `cards` in display order. */
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
  return target.isContentEditable || target.closest('input, textarea, select, [role=slider]') !== null
}

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-[4px] border border-b-2 bg-card px-1 font-mono text-[10.5px] text-foreground">
      {children}
    </kbd>
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
