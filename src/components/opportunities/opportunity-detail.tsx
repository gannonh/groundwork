import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { EvidenceFilter } from '@/domain/evidence'
import type { TrendWindow } from '@/domain/metrics'
import type { OpportunityId, PainLevel } from '@/domain/types'
import type { ProblemView } from '@/server/opportunity-map.server'
import { PAIN_LABELS, formatUsd, mentionCount } from './format'
import { LinkedPill, Pill, TrendPill } from './pill'
import { Quote } from './quote'
import { TrendBars } from './trend-bars'

export type OpportunityDetailProps = { readonly problem: ProblemView; readonly window: TrendWindow }

export function OpportunityDetail({ problem, window }: OpportunityDetailProps) {
  const { metrics } = problem
  const evidence = (filter: EvidenceFilter, label: string, children: ReactNode) => (
    <EvidenceLink problemId={problem.id} filter={filter} label={label}>
      {children}
    </EvidenceLink>
  )
  return (
    <div className="px-6 pt-[22px] pb-[90px]">
      <div className="mb-1.5 text-[12px] text-ink-3">{problem.outcome.title}</div>
      <h2 className="mb-3 text-[19px] leading-[1.3] font-bold tracking-[-0.01em]">{problem.title}</h2>
      {problem.link && (
        <div className="mb-[18px]">
          <LinkedPill identifier={`Linked ${problem.link.identifier}`} url={problem.link.url} />
        </div>
      )}

      <dl className="mb-[18px] grid grid-cols-4 rounded-[10px] border">
        <Stat label="Accounts">
          {evidence({ evidence: 'accounts' }, `Show the ${String(metrics.accounts)} accounts`, metrics.accounts)}
        </Stat>
        <Stat label="ARR">
          {evidence(
            { evidence: 'accounts' },
            `Show the accounts behind ${formatUsd(metrics.arr)} ARR`,
            formatUsd(metrics.arr),
          )}
        </Stat>
        <Stat label="Mentions">
          {evidence({ evidence: 'mentions' }, `Show the ${mentionCount(metrics.mentions)}`, metrics.mentions)}
        </Stat>
        <Stat label="Pain">
          <span className="block pt-1 text-[13px]">
            {metrics.pain === null ? (
              <span className="font-medium text-ink-3">Not scored</span>
            ) : (
              <>
                <PainMeter level={metrics.pain} />{' '}
                <span className="font-medium text-ink-3">{PAIN_LABELS[metrics.pain]}</span>
              </>
            )}
          </span>
        </Stat>
      </dl>

      <SectionHeading title="Mentions per week">
        <TrendPill delta={metrics.delta} />
      </SectionHeading>
      <div className="rounded-[10px] border px-3 py-2.5">
        <TrendBars weekly={metrics.weekly} window={window} />
      </div>

      <SectionHeading title="What customers said">
        {metrics.needsReview > 0 && <Pill tone="warn">{metrics.needsReview} need review</Pill>}
      </SectionHeading>
      {problem.quotes.map((quote) => (
        <Quote key={quote.mentionId} quote={quote} />
      ))}

      <SectionHeading title="Requested solutions">mentions</SectionHeading>
      {problem.solutions.map((solution) => (
        <div key={solution.id} className="mb-1.5 flex justify-between gap-3 rounded-[8px] border px-2.5 py-2">
          <span>{solution.title}</span>
          <span className="flex items-center gap-2">
            {solution.needsReview > 0 && (
              <Pill tone="warn" title="Low-confidence placements">
                {solution.needsReview}
              </Pill>
            )}
            <span className="text-ink-3 tabular-nums">
              {evidence(
                { evidence: 'solution', solution: solution.id },
                `Show the ${mentionCount(solution.mentions)} of ${solution.title}`,
                solution.mentions,
              )}
            </span>
          </span>
        </div>
      ))}

      <SectionHeading title="Top accounts">ARR</SectionHeading>
      <ul>
        {problem.topAccounts.map((account) => (
          <li key={account.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line-2 py-1.5">
            <span className="flex items-center gap-2">
              {account.name}
              {account.allNeedReview && <Pill tone="warn">needs review</Pill>}
            </span>
            <span className="text-ink-3 tabular-nums">
              {evidence(
                { evidence: 'account', account: account.id },
                `Show ${account.name}'s ${mentionCount(account.mentions)}`,
                mentionCount(account.mentions),
              )}
            </span>
            <span className="tabular-nums">{formatUsd(account.arr)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MissingOpportunity() {
  return (
    <div className="px-6 pt-[22px] pb-[90px]">
      <h2 className="mb-2 text-[19px] leading-[1.3] font-bold tracking-[-0.01em]">Opportunity not found</h2>
      <p className="text-ink-2">It may have been merged or deleted. Pick a problem from the list.</p>
    </div>
  )
}

function EvidenceLink({
  problemId,
  filter,
  label,
  children,
}: {
  problemId: OpportunityId
  filter: EvidenceFilter
  label: string
  children: ReactNode
}) {
  return (
    <Link
      to="/opportunities/$id"
      params={{ id: problemId }}
      search={filter}
      resetScroll={false}
      aria-label={label}
      className="rounded-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r px-3 py-2.5 last:border-r-0">
      <dt className="mb-[3px] text-[11px] font-medium text-ink-3">{label}</dt>
      <dd className="text-[17px] font-[650] tabular-nums">{children}</dd>
    </div>
  )
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex items-center justify-between text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function PainMeter({ level }: { level: PainLevel }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={`h-3 w-[5px] rounded-[1px] ${i <= level ? 'bg-up' : 'bg-border'}`} />
      ))}
    </span>
  )
}
