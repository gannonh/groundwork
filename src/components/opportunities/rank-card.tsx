import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { Score } from '@/domain/rank'
import type { ProblemView } from '@/server/opportunity-map.server'
import { formatDelta, formatUsd } from './format'
import { LinkedPill, Pill, TrendPill } from './pill'
import { ScoreBar } from './score-bar'
import type { Layout } from './search'

/** Shared by the cards and their column header so the columns line up. Stack adds an Accounts column. */
export const RANK_GRID: Record<Layout, string> = {
  split: 'grid grid-cols-[30px_minmax(0,1fr)_110px_64px_70px] items-center gap-3',
  stack: 'grid grid-cols-[34px_minmax(0,1fr)_200px_70px_80px_76px] items-center gap-[14px]',
}

export type RankCardProps = {
  readonly problem: ProblemView
  readonly position: number
  readonly score: Score
  readonly layout: Layout
  readonly selected: boolean
  /** The line under the title. */
  readonly subtitle: string
  /** The inline detail, when the card is expanded in Stack. */
  readonly children?: ReactNode
}

export function RankCard({ problem, position, score, layout, selected, subtitle, children }: RankCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (selected && ref.current) reveal(ref.current)
  }, [selected])
  const stack = layout === 'stack'

  return (
    <div
      ref={ref}
      data-flip={problem.id}
      className={`mb-2 rounded-[12px] border bg-card transition-transform duration-350 ease-[ease] ${
        !selected
          ? ''
          : stack
            ? 'border-primary-line shadow-[0_4px_18px_rgba(79,70,229,.08)]'
            : 'border-primary shadow-[0_0_0_1px_var(--primary),0_4px_18px_rgba(79,70,229,.10)]'
      }`}
    >
      <Link
        to="/opportunities"
        search={(prev) => ({ ...prev, selected: stack && selected ? undefined : problem.id })}
        resetScroll={false}
        aria-current={selected && !stack ? 'page' : undefined}
        aria-expanded={stack ? selected : undefined}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className={`${RANK_GRID[layout]} rounded-[12px] px-4 py-3`}
      >
        <div className="text-[18px] font-bold text-ink-3">{position}</div>
        <div className="text-[14px] font-semibold">
          <span id={`${id}-title`}>{problem.title}</span>
          <span id={`${id}-description`} className="sr-only">
            {describe(problem, score)}
          </span>
          {problem.link && (
            <span className="ml-1 align-[1px]">
              <LinkedPill identifier={problem.link.identifier} />
            </span>
          )}
          {problem.metrics.needsReview > 0 && (
            <span className="ml-1 align-[1px]">
              <Pill tone="warn" title="Low-confidence placements">
                {problem.metrics.needsReview}
              </Pill>
            </span>
          )}
          <span className="mt-0.5 block text-[11.5px] font-medium text-ink-3">{subtitle}</span>
        </div>
        <ScoreBar score={score} />
        {stack && <div className="text-right tabular-nums">{problem.metrics.accounts}</div>}
        <div className="text-right tabular-nums">{formatUsd(problem.metrics.arr)}</div>
        <div className="text-right">
          <TrendPill delta={problem.metrics.delta} />
        </div>
      </Link>
      {children}
    </div>
  )
}

function describe(problem: ProblemView, score: Score): string {
  const { metrics } = problem
  return [
    problem.outcome.title,
    `score ${score.total.toFixed(0)}`,
    `${formatUsd(metrics.arr)} ARR`,
    `${formatDelta(metrics.delta)} over 4 weeks`,
    ...(metrics.needsReview > 0 ? [`${String(metrics.needsReview)} need review`] : []),
    ...(problem.link ? [`linked ${problem.link.identifier}`] : []),
  ].join(', ')
}

/**
 * Scrolls the nearest scrolling ancestor just enough to show `el`, or its top when it is taller than the view. Not scrollIntoView: Chromium moves the Tab
 * starting point to the scrolled element, so the first Tab on a direct load would skip the top bar.
 */
function reveal(el: HTMLElement) {
  let scroller = el.parentElement
  while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
  if (!scroller) return
  const box = el.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  if (box.top < view.top) scroller.scrollTop += box.top - view.top
  else if (box.bottom > view.bottom) scroller.scrollTop += Math.min(box.bottom - view.bottom, box.top - view.top)
}
