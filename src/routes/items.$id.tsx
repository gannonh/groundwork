import type { ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formatRole, formatUsd } from '@/components/opportunities/format'
import { ITEM_KIND_LABELS, formatDate } from '@/components/sources/format'
import { RedactedText } from '@/components/sources/redacted-text'
import { db } from '@/db/client'
import type { ItemId } from '@/domain/types'
import { loadItem, type ItemDetail } from '@/server/sources.server'

const getItem = createServerFn({ method: 'GET' })
  .validator((data: { id: string }) => data)
  .handler(({ data }): Promise<ItemDetail> | ItemDetail => {
    const id = z.guid().safeParse(data.id)
    return id.success ? loadItem(db, id.data as ItemId) : { kind: 'missing' }
  })

export const Route = createFileRoute('/items/$id')({
  loader: ({ params }) => getItem({ data: { id: params.id } }),
  component: ItemPage,
})

function ItemPage() {
  const detail = Route.useLoaderData()
  if (detail.kind === 'missing') {
    return (
      <main className="grid h-[calc(100dvh-48px)] place-items-center">
        <div className="text-center">
          <h1 className="mb-2 text-[17px] font-semibold">Item not found</h1>
          <Link to="/sources" className="font-medium text-primary hover:underline">
            Back to sources
          </Link>
        </div>
      </main>
    )
  }
  const { item } = detail
  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto px-5 py-4">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-1 text-[12px] text-ink-3">
          <Link to="/sources" className="hover:underline">
            Sources
          </Link>{' '}
          /{' '}
          <Link to="/sources/$id" params={{ id: item.source.id }} className="hover:underline">
            {item.source.name}
          </Link>
        </div>
        <h1 className="mb-3 text-[17px] font-semibold">
          {ITEM_KIND_LABELS[item.source.itemKind]} from {formatDate(item.date)}
        </h1>

        <dl className="mb-5 grid grid-cols-[1fr_1fr_1.6fr_1fr] rounded-[10px] border bg-card">
          <Meta label="Date">{formatDate(item.date)}</Meta>
          <Meta label="Source">
            <Link to="/sources/$id" params={{ id: item.source.id }} className="text-primary hover:underline">
              {item.source.name}
            </Link>
          </Meta>
          <Meta label="Account">
            {item.account ? (
              <>
                {item.account.name} <span className="text-ink-3 tabular-nums">{formatUsd(item.account.arr)}</span>
              </>
            ) : (
              <span className="text-ink-3">No account</span>
            )}
          </Meta>
          <Meta label="Author">{item.role ? formatRole(item.role) : <span className="text-ink-3">Not given</span>}</Meta>
        </dl>

        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">Sentences</h2>
        <ol aria-label="Sentences" className="rounded-[10px] border bg-card py-1.5">
          {item.sentences.map((s) => (
            <li key={s.ordinal} className="grid grid-cols-[36px_1fr] gap-2 px-3 py-1 leading-[1.5]">
              <span aria-hidden className="text-right font-mono text-[11px] leading-[20px] text-ink-3 tabular-nums">
                {s.ordinal + 1}
              </span>
              <span>
                <RedactedText text={s.text} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-r px-3.5 py-2.5 last:border-r-0">
      <dt className="text-[11px] font-semibold text-ink-3">{label}</dt>
      <dd className="truncate pt-0.5 font-medium">{children}</dd>
    </div>
  )
}
