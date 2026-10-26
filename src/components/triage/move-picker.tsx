import { useMemo, useState, type KeyboardEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { OpportunityId } from '@/domain/types'
import type { TriageItemView, TriageView } from '@/server/triage.server'

type Target = TriageView['targets'][number]

/** The problems a quote can move to: the judge's runner-up first, then by outcome, minus the judge's own pick. */
export function moveCandidates(item: TriageItemView, targets: readonly Target[], filter: string): readonly Target[] {
  const query = filter.trim().toLowerCase()
  const suggested = item.branches[1]?.opportunityId
  const pool = targets
    .filter((o) => o.id !== item.branches[0].opportunityId)
    .filter((o) => !query || o.title.toLowerCase().includes(query) || o.outcome.toLowerCase().includes(query))
  return [...pool.filter((o) => o.id === suggested), ...pool.filter((o) => o.id !== suggested)]
}

export function MovePicker({
  item,
  targets,
  onMove,
  onClose,
}: {
  item: TriageItemView
  targets: readonly Target[]
  onMove: (to: OpportunityId) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [index, setIndex] = useState(0)
  const candidates = useMemo(() => moveCandidates(item, targets, filter), [item, targets, filter])
  const suggested = item.branches[1]
  const active = candidates[Math.min(index, candidates.length - 1)]

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(candidates.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && active) {
      e.preventDefault()
      onMove(active.id)
    }
  }

  const groupOf = (o: Target | undefined) => (o && o.id === suggested?.opportunityId ? 'Suggested · branch 2' : o?.outcome)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="top-20 flex max-h-[70vh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogTitle className="px-3.5 pt-3 text-meta font-normal text-ink-3">
          Move <b className="font-semibold text-foreground">{item.account?.name ?? 'this'}</b>’s quote to another opportunity
        </DialogTitle>
        <DialogDescription className="sr-only">Type to filter the problems, then press Enter to move the quote.</DialogDescription>
        <input
          autoFocus
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Move to opportunity…"
          aria-label="Filter opportunities"
          aria-controls="move-options"
          aria-activedescendant={active ? `move-${active.id}` : undefined}
          role="combobox"
          aria-expanded
          autoComplete="off"
          className="w-full border-b px-3.5 py-3 text-lead outline-none"
        />
        <div id="move-options" role="listbox" aria-label="Opportunities" className="min-h-0 overflow-auto p-1.5">
          {candidates.length === 0 && <p className="px-2 py-4 text-ink-3">No opportunity matches.</p>}
          {candidates.map((o, i) => {
            const heading = groupOf(o) !== groupOf(candidates[i - 1]) ? groupOf(o) : null
            return (
              <div key={o.id}>
                {heading && (
                  <div className="px-2 pt-2.5 pb-1 text-caption font-semibold tracking-[0.06em] text-ink-3 uppercase">{heading}</div>
                )}
                <div
                  id={`move-${o.id}`}
                  role="option"
                  aria-selected={o === active}
                  onClick={() => {
                    onMove(o.id)
                  }}
                  onMouseEnter={() => {
                    setIndex(candidates.indexOf(o))
                  }}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.75 ${o === active ? 'bg-primary-soft' : ''}`}
                >
                  <span className="min-w-0 flex-1">{o.title}</span>
                  {o.id === suggested?.opportunityId && (
                    <span className="font-mono text-meta text-ink-3">{formatPercent(suggested.probability)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 border-t px-3.5 py-2 text-meta text-ink-3">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> choose
          </span>
          <span>
            <Kbd>↵</Kbd> move
          </span>
          <span>
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function formatPercent(p: number): string {
  return `${String(Math.round(p * 100))}%`
}

export function Kbd({ children, tone = 'light' }: { children: string; tone?: 'light' | 'dark' }) {
  return (
    <kbd
      className={`rounded-[4px] border border-b-2 px-1 font-mono text-micro font-medium ${tone === 'dark' ? 'border-ink-2 text-line-2' : 'bg-card text-ink-2'}`}
    >
      {children}
    </kbd>
  )
}
