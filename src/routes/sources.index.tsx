import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ITEM_KIND_LABELS, TABLE_CELL, TABLE_HEAD, formatDate, plural } from '@/components/sources/format'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/db/client'
import { loadSources } from '@/server/sources.server'

const getSources = createServerFn({ method: 'GET' }).handler(() => loadSources(db))

export const Route = createFileRoute('/sources/')({
  loader: () => getSources(),
  component: SourcesPage,
})

function SourcesPage() {
  const sources = Route.useLoaderData()
  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold">Sources</h1>
          <p className="text-ink-2">{plural(sources.length, 'source')}</p>
        </div>
        <Button asChild size="sm">
          <Link to="/sources/new">New source</Link>
        </Button>
      </div>
      {sources.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-10 text-center text-ink-2">
          No sources yet.{' '}
          <Link to="/sources/new" className="font-medium text-primary hover:underline">
            Import a CSV export
          </Link>{' '}
          to see its items here.
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className={TABLE_HEAD}>Source</TableHead>
                <TableHead className={TABLE_HEAD}>Kind</TableHead>
                <TableHead className={`${TABLE_HEAD} text-right`}>Items</TableHead>
                <TableHead className={`${TABLE_HEAD} text-right`}>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className={`${TABLE_CELL} font-medium`}>
                    <Link to="/sources/$id" params={{ id: source.id }} className="hover:underline">
                      {source.name}
                    </Link>
                  </TableCell>
                  <TableCell className={`${TABLE_CELL} text-ink-2`}>{ITEM_KIND_LABELS[source.itemKind]}</TableCell>
                  <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>
                    <Link to="/sources/$id" params={{ id: source.id }} className="text-primary hover:underline">
                      {plural(source.items, 'item')}
                    </Link>
                  </TableCell>
                  <TableCell className={`${TABLE_CELL} text-right text-ink-2 tabular-nums`}>
                    {formatDate(source.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  )
}
