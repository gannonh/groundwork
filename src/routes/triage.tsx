import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, createFileRoute, useHydrated, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formatDay, formatUsd } from '@/components/opportunities/format'
import { Pill } from '@/components/opportunities/pill'
import { RedactedText } from '@/components/sources/redacted-text'
import { Kbd, MovePicker, formatPercent } from '@/components/triage/move-picker'
import { db } from '@/db/client'
import type { TriageChoice } from '@/domain/triage'
import type { MentionId, OpportunityId } from '@/domain/types'
import { decideTriage, loadTriage, type BranchView, type DecideResult, type TriageItemView, type TriageView } from '@/server/triage.server'

const getTriage = createServerFn({ method: 'GET' }).handler(() => loadTriage(db))

const decisionInput = z.object({
  mentionId: z.guid(),
  choice: z.discriminatedUnion('action', [
    z.object({ action: z.literal('accept') }),
    z.object({ action: z.literal('move'), to: z.guid() }),
    z.object({ action: z.literal('discard') }),
  ]),
})

const decide = createServerFn({ method: 'POST' })
  .validator((data: unknown) => decisionInput.parse(data))
  .handler(({ data }): Promise<DecideResult> => decideTriage(db, data.mentionId as MentionId, data.choice as TriageChoice))

export const Route = createFileRoute('/triage')({
  loader: () => getTriage(),
  component: TriagePage,
})

const short = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s)

function TriagePage() {
  const view = Route.useLoaderData()
  const router = useRouter()
  // A key or click before hydration attaches the handlers is lost, so the actions wait for it.
  const hydrated = useHydrated()
  // Hidden as soon as a decision is sent, so the next quote shows before the reload lands.
  const [sent, setSent] = useState<ReadonlySet<MentionId>>(new Set())
  const [selected, setSelected] = useState<MentionId | null>(null)
  const [decidedHere, setDecidedHere] = useState(0)
  const [notice, setNotice] = useState<{ readonly text: string } | null>(null)
  const [moving, setMoving] = useState(false)

  const queue = view.items.filter((i) => !sent.has(i.mentionId))
  const index = Math.max(0, queue.findIndex((i) => i.mentionId === selected))
  const item = queue[index]

  const act = useCallback(
    async (target: TriageItemView, choice: TriageChoice, done: string) => {
      setMoving(false)
      setSent((s) => new Set(s).add(target.mentionId))
      const rest = queue.filter((i) => i !== target)
      setSelected(rest[Math.min(index, rest.length - 1)]?.mentionId ?? null)
      let result: DecideResult
      try {
        result = await decide({ data: { mentionId: target.mentionId, choice } })
      } catch {
        setSent((s) => new Set([...s].filter((id) => id !== target.mentionId)))
        setNotice({ text: 'The decision was not saved. Try again.' })
        return
      }
      if (result.kind === 'decided') setDecidedHere((n) => n + 1)
      setNotice({
        text:
          result.kind === 'decided'
            ? done
            : result.kind === 'already-decided'
              ? 'Already decided, maybe in another tab. Nothing changed.'
              : 'That placement is no longer in the queue.',
      })
      await router.invalidate()
    },
    [queue, index, router],
  )

  const accept = useCallback(
    (i: TriageItemView) => act(i, { action: 'accept' }, `Placed in ${short(i.branches[0].title)}`),
    [act],
  )
  const moveTo = useCallback(
    (i: TriageItemView, to: OpportunityId) =>
      act(i, { action: 'move', to }, `Moved to ${short(view.targets.find((o) => o.id === to)?.title ?? 'another problem')}`),
    [act, view.targets],
  )
  const discard = useCallback((i: TriageItemView) => act(i, { action: 'discard' }, 'Discarded · logged as “not a problem”'), [act])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => {
      setNotice(null)
    }, 2400)
    return () => {
      clearTimeout(timer)
    }
  }, [notice])

  useEffect(() => {
    if (!hydrated || moving || !item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select'))) return
      const step = (d: number) => {
        e.preventDefault()
        setSelected(queue[Math.max(0, Math.min(queue.length - 1, index + d))]?.mentionId ?? null)
      }
      if (e.key === 'a') void accept(item)
      else if (e.key === 'd') void discard(item)
      else if (e.key === 'm') {
        e.preventDefault()
        setMoving(true)
      } else if (e.key === 'j' || e.key === 'ArrowDown') step(1)
      else if (e.key === 'k' || e.key === 'ArrowUp') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [hydrated, moving, item, queue, index, accept, discard])

  const threshold = view.placeThreshold === null ? null : formatPercent(view.placeThreshold)
  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b bg-card px-7 py-3 max-sm:px-3.5 max-sm:py-2.5">
        <h1 className="text-subhead font-semibold tracking-[-0.01em]">Triage</h1>
        <span className="text-ink-3">
          {queue.length > 0
            ? `${queue.length.toLocaleString('en-US')} low-confidence placement${queue.length === 1 ? '' : 's'} under ${threshold ?? ''}`
            : 'Nothing waiting'}
        </span>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-2.5 text-meta text-ink-3 max-sm:hidden">
          <span>
            <Kbd>a</Kbd> accept
          </span>
          <span>
            <Kbd>m</Kbd> move
          </span>
          <span>
            <Kbd>d</Kbd> discard
          </span>
          <span>
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> select
          </span>
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {notice?.text}
      </div>
      {notice && (
        <div
          aria-hidden
          className="fixed top-14.5 left-1/2 z-40 max-w-[calc(100vw-24px)] -translate-x-1/2 truncate rounded-lg bg-foreground px-3 py-2 text-meta font-medium text-background"
        >
          {notice.text}
        </div>
      )}
      {item ? (
        <div className="mx-auto max-w-[760px] px-6 pt-6 pb-10 max-sm:px-3 max-sm:pt-3.5">
          <div className="mb-3 flex items-center gap-3 text-ink-2">
            <span>
              <b className="text-foreground tabular-nums">{index + 1}</b> of <span className="tabular-nums">{queue.length}</span> left
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-sm bg-line-2">
              <i
                className="block h-full bg-foreground"
                style={{ width: `${String((decidedHere / Math.max(1, decidedHere + queue.length)) * 100)}%` }}
              />
            </div>
            <span className="text-ink-3 tabular-nums">{decidedHere} decided</span>
          </div>
          <FocusCard
            key={item.mentionId}
            item={item}
            threshold={threshold}
            disabled={!hydrated}
            onAccept={() => void accept(item)}
            onMoveTo={(to) => void moveTo(item, to)}
            onMove={() => {
              setMoving(true)
            }}
            onDiscard={() => void discard(item)}
          />
          <div className="mt-5 mb-2 flex justify-between gap-2 text-caption font-semibold tracking-[0.06em] text-ink-3 uppercase">
            <span>Up next</span>
            <span className="tracking-normal normal-case">
              <Kbd>j</Kbd> <Kbd>k</Kbd> to skip
            </span>
          </div>
          <ul aria-label="Up next" className="mt-4.5">
            {queue.slice(index + 1, index + 3).map((next) => (
              <li key={next.mentionId} className="flex gap-2.5 border-b border-line-2 px-0.5 py-2 text-ink-2">
                <Pill tone="warn">{formatPercent(next.confidence)}</Pill>
                <span className="min-w-0 flex-1 truncate">
                  <QuoteSentences item={next} />
                </span>
              </li>
            ))}
            {index + 1 >= queue.length && <li className="px-0.5 py-2 text-ink-3">Last item in the queue.</li>}
          </ul>
          {moving && (
            <MovePicker
              item={item}
              targets={view.targets}
              onMove={(to) => void moveTo(item, to)}
              onClose={() => {
                setMoving(false)
              }}
            />
          )}
        </div>
      ) : (
        <EmptyQueue view={view} threshold={threshold} />
      )}
    </main>
  )
}

function FocusCard({
  item,
  threshold,
  disabled,
  onAccept,
  onMoveTo,
  onMove,
  onDiscard,
}: {
  item: TriageItemView
  threshold: string | null
  disabled: boolean
  onAccept: () => void
  onMoveTo: (to: OpportunityId) => void
  onMove: () => void
  onDiscard: () => void
}) {
  const [first, second] = item.branches
  return (
    <article aria-label="Placement to review" className="rounded-xl border bg-card px-5.5 py-5 shadow-[0_4px_18px_rgba(0,0,0,.03)] max-sm:px-3.5 max-sm:py-4">
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <Pill tone="warn" title={`Below the ${threshold ?? ''} place threshold`}>
          ⚠ {formatPercent(item.confidence)} confident
        </Pill>
        <span className="text-ink-3">below the {threshold} place threshold</span>
      </div>
      <blockquote className="mb-2.5 border-l-[3px] border-l-warn-line pl-3.5 text-numeral leading-normal tracking-[-0.005em] max-sm:text-subhead">
        “<QuoteSentences item={item} />”
      </blockquote>
      <div className="flex flex-wrap items-center gap-2 text-meta text-ink-3">
        {item.account && (
          <>
            <b className="font-semibold text-ink-2">{item.account.name}</b>
            <span>{formatUsd(item.account.arr)} ARR</span>
          </>
        )}
        <Link
          to="/items/$id"
          params={{ id: item.itemId }}
          search={{ mention: item.mentionId }}
          aria-label={`Open ${item.source} · ${formatDay(item.date)}`}
          className="rounded-[3px] text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {item.source} · {formatDay(item.date)}
        </Link>
      </div>
      <div className="mt-5 mb-2 flex justify-between gap-2 text-caption font-semibold tracking-[0.06em] text-ink-3 uppercase">
        <span>Where the judge would place it</span>
        <span>probability</span>
      </div>
      <div className="grid gap-1">
        <BranchRow rank="1" branch={first} label={`Accept: place in ${first.title}`} disabled={disabled} onClick={onAccept} />
        {second && (
          <BranchRow
            rank="2"
            branch={second}
            tone="second"
            label={`Move to ${second.title}`}
            disabled={disabled}
            onClick={() => {
              onMoveTo(second.opportunityId)
            }}
          />
        )}
        <BranchRow
          rank="–"
          branch={{ title: 'None of these', within: null, probability: item.none }}
          tone="none"
          label="Discard: none of these"
          disabled={disabled}
          onClick={onDiscard}
        />
      </div>
      <div className="mt-4.5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-2">
        <ActionButton
          tone="primary"
          shortcut="a"
          label={`Accept · ${first.title}`}
          disabled={disabled}
          onClick={onAccept}
          className="justify-between max-sm:col-span-2"
        >
          <span className="truncate">Accept · {first.title}</span>
        </ActionButton>
        <ActionButton shortcut="m" label="Move…" disabled={disabled} onClick={onMove}>
          Move…
        </ActionButton>
        <ActionButton tone="danger" shortcut="d" label="Discard" disabled={disabled} onClick={onDiscard}>
          Discard
        </ActionButton>
      </div>
    </article>
  )
}

function BranchRow({
  rank,
  branch,
  tone = 'first',
  label,
  disabled,
  onClick,
}: {
  rank: string
  branch: Pick<BranchView, 'title' | 'within' | 'probability'>
  tone?: 'first' | 'second' | 'none'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const fill = { first: 'bg-primary', second: 'bg-primary-line', none: 'bg-ink-3' }[tone]
  return (
    <button
      type="button"
      aria-label={`${label}, ${formatPercent(branch.probability)}`}
      disabled={disabled}
      onClick={onClick}
      className={`grid w-full grid-cols-[22px_minmax(0,1fr)_140px_42px] items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-ring max-sm:grid-cols-[18px_minmax(0,1fr)_42px] ${tone === 'none' ? 'border-dashed text-ink-2' : ''}`}
    >
      <span className="text-meta font-bold text-ink-3">{rank}</span>
      <span className={`min-w-0 ${tone === 'none' ? 'font-medium' : 'font-semibold'}`}>
        {branch.title}
        {branch.within && <small className="mt-px block text-meta font-medium text-ink-3">{branch.within}</small>}
      </span>
      <span className="flex h-2 overflow-hidden rounded-sm bg-line-2 max-sm:col-[2/-1] max-sm:row-2">
        <i className={`block h-full ${fill}`} style={{ width: formatPercent(branch.probability) }} />
      </span>
      <span className="text-right font-mono text-meta text-ink-2 max-sm:row-1 max-sm:col-3">{formatPercent(branch.probability)}</span>
    </button>
  )
}

function ActionButton({
  tone = 'plain',
  shortcut,
  label,
  disabled,
  onClick,
  className = '',
  children,
}: {
  tone?: 'primary' | 'plain' | 'danger'
  shortcut: string
  /** The visible text without the key hint. */
  label: string
  disabled: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  const tones = {
    primary: 'border-foreground bg-foreground text-background',
    plain: 'bg-card hover:border-ink-3',
    danger: 'bg-card text-up hover:border-ink-3',
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-[7px] border px-3.5 py-2.5 font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${tones[tone]} ${className}`}
    >
      {children}
      <Kbd tone={tone === 'primary' ? 'dark' : 'light'}>{shortcut}</Kbd>
    </button>
  )
}

function QuoteSentences({ item }: { item: TriageItemView }) {
  const { text } = item
  return (
    <>
      {text.leadingEllipsis && '… '}
      {text.sentences.map((sentence, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {sentence.highlighted ? <RedactedText text={sentence.text} /> : <span className="text-ink-3"><RedactedText text={sentence.text} /></span>}
        </span>
      ))}
      {text.trailingEllipsis && ' …'}
    </>
  )
}

function EmptyQueue({ view, threshold }: { view: TriageView; threshold: string | null }) {
  const verb = { accept: 'Accepted', move: 'Moved', discard: 'Discarded' } as const
  return (
    <section aria-labelledby="queue-clear" className="mx-auto mt-14 max-w-[560px] px-5 pb-10 text-center">
      <div aria-hidden className="mx-auto mb-3.5 grid size-11 place-items-center rounded-full bg-down-soft text-headline text-down">
        ✓
      </div>
      <h2 id="queue-clear" className="mb-1.5 text-headline font-semibold tracking-[-0.01em]">
        Queue clear
      </h2>
      <p className="mb-1.5 leading-[1.55] text-ink-2">
        No low-confidence placements are waiting. Every decision is logged as a label for tuning the place threshold and question wording.
      </p>
      {threshold && <p className="mb-4.5 text-ink-3">The next run sends new placements under {threshold} confidence here.</p>}
      {view.recent.length > 0 && (
        <ul aria-label="Latest decisions" className="mb-4.5 rounded-[10px] border bg-card px-3 py-1 text-left">
          {view.recent.map((r) => (
            <li key={r.mentionId} className="grid grid-cols-[74px_minmax(0,1fr)] gap-2.5 border-b border-line-2 py-1.75 text-meta last:border-b-0">
              <span>
                <Pill tone={r.action === 'discard' ? 'flat' : 'linked'}>{verb[r.action]}</Pill>
              </span>
              <Link to="/items/$id" params={{ id: r.itemId }} search={{ mention: r.mentionId }} className="truncate text-ink-2 hover:underline">
                {r.opportunity ?? 'Not a problem statement'}
                {r.account && ` · ${r.account}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/opportunities"
        className="inline-flex items-center rounded-[7px] border border-foreground bg-foreground px-3 py-1.75 font-semibold text-background"
      >
        Back to opportunities
      </Link>
    </section>
  )
}
