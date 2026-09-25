import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { Score } from '@/domain/rank'
import type { ProblemView } from '@/server/opportunity-map.server'
import { formatUsd } from './format'
import { LinkedPill, Pill, TrendPill } from './pill'
import { ScoreBar } from './score-bar'

/** Shared by the cards and their column header so the columns line up. */
export const RANK_GRID = 'grid grid-cols-[30px_minmax(0,1fr)_110px_64px_70px] items-center gap-3'

export type RankCardProps = {
  readonly problem: ProblemView
  readonly position: number
  readonly score: Score
  readonly selected: boolean
}

export function RankCard({ problem, position, score, selected }: RankCardProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <Link
      ref={ref}
      to="/opportunities/$id"
      params={{ id: problem.id }}
      resetScroll={false}
      className={`mb-2 block rounded-[12px] border bg-card ${
        selected ? 'border-primary shadow-[0_0_0_1px_var(--primary),0_4px_18px_rgba(79,70,229,.10)]' : ''
      }`}
    >
      <div className={`${RANK_GRID} px-4 py-3`}>
        <div className="text-[18px] font-bold text-ink-3">{position}</div>
        <div className="text-[14px] font-semibold">
          {problem.title}
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
          <span className="mt-0.5 block text-[11.5px] font-medium text-ink-3">{problem.outcome.title}</span>
        </div>
        <ScoreBar score={score} />
        <div className="text-right tabular-nums">{formatUsd(problem.metrics.arr)}</div>
        <div className="text-right">
          <TrendPill delta={problem.metrics.delta} />
        </div>
      </div>
    </Link>
  )
}
