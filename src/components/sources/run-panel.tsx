import { useCallback, useEffect, useState } from 'react'
import { Link, useHydrated, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { RunPanel as RunPanelState } from '@/server/run.server'
import { formatEstimate, plural } from './format'
import { Notice } from './notice'

const POLL_MS = 700

/** Runs the source's items through the pipeline: the estimate and Start before, live progress during, the result after. */
export function RunPanel({
  initial,
  onStart,
  onPoll,
}: {
  initial: RunPanelState
  onStart: () => Promise<RunPanelState | null>
  onPoll: () => Promise<RunPanelState | null>
}) {
  const router = useRouter()
  // A click before hydration attaches onClick is lost, so Start stays disabled until then.
  const hydrated = useHydrated()
  const [panel, setPanel] = useState(initial)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const update = useCallback(
    (next: RunPanelState | null) => {
      if (!next) return
      setPanel((previous) => {
        // The nav's triage count and the item list were loaded before the run finished.
        if (previous.kind !== 'done' && next.kind === 'done') void router.invalidate()
        return next
      })
    },
    [router],
  )

  const running = panel.kind === 'running'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      // A failed poll leaves the last progress on screen, and the next tick tries again.
      onPoll().then(update, () => undefined)
    }, POLL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [running, onPoll, update])

  return (
    <section aria-labelledby="run-heading" className="mb-4 rounded-lg border bg-card px-4 py-3">
      <h2 id="run-heading" className="mb-2 text-body font-semibold">
        Run the pipeline
      </h2>
      {panel.kind === 'unavailable' && <Notice tone="error">{panel.message}</Notice>}
      {panel.kind === 'ready' && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            <Fact label="Items" value={panel.items.toLocaleString('en-US')} />
            <Fact label="Judge requests" value={`about ${panel.requests.toLocaleString('en-US')}`} />
            <Fact label="Estimated cost" value={panel.usd === null ? 'Unknown for this model' : formatEstimate(panel.usd)} />
          </dl>
          <Button
            size="sm"
            disabled={!hydrated || starting || panel.items === 0}
            onClick={() => {
              setStarting(true)
              setStartError(null)
              onStart()
                .then(update, (error: unknown) => {
                  setStartError(error instanceof Error ? error.message : 'The run could not start.')
                })
                .finally(() => {
                  setStarting(false)
                })
            }}
          >
            Start run
          </Button>
        </div>
      )}
      {startError && <Notice tone="error">{startError}</Notice>}
      {panel.kind === 'running' && (
        <div className="grid gap-1.5">
          <Progress value={panel.percent} aria-label="Run progress" />
          <p className="text-ink-2">
            <span className="font-medium text-foreground tabular-nums">{panel.percent}%</span> ·{' '}
            <span className="tabular-nums">{(panel.judged + panel.failed).toLocaleString('en-US')}</span> of{' '}
            <span className="tabular-nums">{plural(panel.items, 'item')}</span>
            {panel.failed > 0 && ` · ${plural(panel.failed, 'item')} failed`}
          </p>
        </div>
      )}
      {panel.kind === 'done' && (
        <div className="grid gap-2">
          <Progress value={100} aria-label="Run progress" />
          <Notice tone={panel.failed > 0 ? 'error' : 'success'}>
            Run complete. {plural(panel.judged, 'item')} judged, {panel.failed.toLocaleString('en-US')} failed.{' '}
            <Link to="/opportunities" className="underline">
              Open the opportunity map
            </Link>
          </Notice>
          {panel.failures.length > 0 && (
            <ul className="grid gap-1 text-meta">
              {panel.failures.map((failure) => (
                <li key={failure.itemId}>
                  <Link to="/items/$id" params={{ id: failure.itemId }} className="font-mono underline">
                    {failure.itemId}
                  </Link>
                  <span className="text-ink-2"> {failure.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
