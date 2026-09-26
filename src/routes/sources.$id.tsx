import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formatRole } from '@/components/opportunities/format'
import { ITEM_KIND_LABELS, TABLE_CELL, TABLE_HEAD, formatDate, plural } from '@/components/sources/format'
import { RedactedText } from '@/components/sources/redacted-text'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/db/client'
import type { SourceId } from '@/domain/types'
import type { ColumnMapping } from '@/ingest/mapping'
import { loadSource, type SourceDetail } from '@/server/sources.server'

const getSource = createServerFn({ method: 'GET' })
  .validator((data: { id: string }) => data)
  .handler(({ data }): Promise<SourceDetail> | SourceDetail => {
    const id = z.guid().safeParse(data.id)
    return id.success ? loadSource(db, id.data as SourceId) : { kind: 'missing' }
  })

export const Route = createFileRoute('/sources/$id')({
  loader: ({ params }) => getSource({ data: { id: params.id } }),
  component: SourcePage,
})

function SourcePage() {
  const detail = Route.useLoaderData()
  if (detail.kind === 'missing') return <Missing />
  const { source, recent } = detail
  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto px-5 py-4">
      <div className="mb-1 text-[12px] text-ink-3">
        <Link to="/sources" className="hover:underline">
          Sources
        </Link>
      </div>
      <h1 className="text-[17px] font-semibold">{source.name}</h1>
      <p className="mb-3 text-ink-2">
        {ITEM_KIND_LABELS[source.itemKind]} · <span className="tabular-nums">{plural(source.items, 'item')}</span> · Created{' '}
        {formatDate(source.createdAt)}
      </p>
      {source.mapping && <MappingSummary mapping={source.mapping} />}

      <div className="rounded-lg border bg-card">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead className={`${TABLE_HEAD} w-[110px]`}>Date</TableHead>
              <TableHead className={`${TABLE_HEAD} w-[180px]`}>Account</TableHead>
              <TableHead className={`${TABLE_HEAD} w-[100px]`}>Role</TableHead>
              <TableHead className={TABLE_HEAD}>First sentence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((item) => (
              <TableRow key={item.id} className="relative">
                <TableCell className={`${TABLE_CELL} text-ink-2 tabular-nums`}>
                  <Link to="/items/$id" params={{ id: item.id }} className="after:absolute after:inset-0">
                    {formatDate(item.date)}
                  </Link>
                </TableCell>
                <TableCell className={TABLE_CELL}>{item.account ?? <span className="text-ink-3">No account</span>}</TableCell>
                <TableCell className={`${TABLE_CELL} text-ink-2`}>{item.role ? formatRole(item.role) : '—'}</TableCell>
                <TableCell className={`${TABLE_CELL} max-w-0 truncate`}>
                  <RedactedText text={item.excerpt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        Showing {recent.length.toLocaleString('en-US')} of {plural(source.items, 'item')}, newest first.
      </p>
    </main>
  )
}

function MappingSummary({ mapping }: { mapping: ColumnMapping }) {
  const fields = [
    ['Text', mapping.text],
    ['Date', `${mapping.date} (${mapping.dateFormat})`],
    ['Account', mapping.account ?? 'None'],
    ['Author', mapping.author ?? 'None'],
  ] as const
  return (
    <dl className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
      {fields.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt className="text-ink-3">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Missing() {
  return (
    <main className="grid h-[calc(100dvh-48px)] place-items-center">
      <div className="text-center">
        <h1 className="mb-2 text-[17px] font-semibold">Source not found</h1>
        <Link to="/sources" className="font-medium text-primary hover:underline">
          Back to sources
        </Link>
      </div>
    </main>
  )
}
