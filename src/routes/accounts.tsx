import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { CsvFileField } from '@/components/sources/csv-file-field'
import { TABLE_CELL, TABLE_HEAD, formatDollars, plural } from '@/components/sources/format'
import { Notice } from '@/components/sources/notice'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/db/client'
import { parseCsv } from '@/ingest/csv'
import { importAccounts, type AccountImportResult } from '@/server/ingest.server'
import { loadAccounts } from '@/server/sources.server'

const getAccounts = createServerFn({ method: 'GET' }).handler(() => loadAccounts(db))

const uploadAccounts = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('Expected form data.')
    const file = data.get('file')
    if (!(file instanceof File)) throw new Error('Choose a CSV file to import.')
    return file
  })
  .handler(async ({ data }) => importAccounts(db, new Uint8Array(await data.arrayBuffer())))

export const Route = createFileRoute('/accounts')({
  loader: () => getAccounts(),
  component: AccountsPage,
})

type Upload =
  | { readonly kind: 'idle' }
  | { readonly kind: 'importing'; readonly fileName: string }
  | { readonly kind: 'done'; readonly result: AccountImportResult }

function AccountsPage() {
  const accounts = Route.useLoaderData()
  const router = useRouter()
  const [upload, setUpload] = useState<Upload>({ kind: 'idle' })

  const choose = async (file: File, bytes: Uint8Array) => {
    const parsed = parseCsv(bytes)
    if (!parsed.ok) {
      setUpload({ kind: 'done', result: { kind: 'error', message: parsed.error } })
      return
    }
    setUpload({ kind: 'importing', fileName: file.name })
    const form = new FormData()
    form.set('file', file)
    try {
      const result = await uploadAccounts({ data: form })
      await router.invalidate()
      setUpload({ kind: 'done', result })
    } catch {
      setUpload({ kind: 'done', result: { kind: 'error', message: 'The import failed. Try again.' } })
    }
  }

  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto px-5 py-4">
      <h1 className="text-[17px] font-semibold">Accounts</h1>
      <p className="mb-3 text-ink-2">{plural(accounts.length, 'account')}</p>

      <div className="mb-4 grid gap-3">
        <CsvFileField
          label="Account CSV (Account ID, Name, ARR, and optional Plan and Segment)"
          disabled={upload.kind === 'importing'}
          onFile={(file, bytes) => void choose(file, bytes)}
        />
        {upload.kind === 'importing' && <p className="text-ink-2">Importing {upload.fileName}…</p>}
        {upload.kind === 'done' && <Outcome result={upload.result} />}
      </div>

      {accounts.length > 0 && (
        <div className="rounded-lg border bg-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className={TABLE_HEAD}>Account ID</TableHead>
                <TableHead className={TABLE_HEAD}>Name</TableHead>
                <TableHead className={`${TABLE_HEAD} text-right`}>ARR</TableHead>
                <TableHead className={TABLE_HEAD}>Plan</TableHead>
                <TableHead className={TABLE_HEAD}>Segment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className={`${TABLE_CELL} font-mono text-[12px] text-ink-2`}>{account.externalId}</TableCell>
                  <TableCell className={`${TABLE_CELL} font-medium`}>{account.name}</TableCell>
                  <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>{formatDollars(account.arr)}</TableCell>
                  <TableCell className={TABLE_CELL}>{account.plan ?? <span className="text-ink-3">—</span>}</TableCell>
                  <TableCell className={TABLE_CELL}>{account.segment ?? <span className="text-ink-3">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  )
}

function Outcome({ result }: { result: AccountImportResult }) {
  if (result.kind === 'error') return <Notice tone="error">{result.message}</Notice>
  return (
    <Notice tone="success">
      Imported {plural(result.created + result.updated, 'account')} ({result.created} new, {result.updated} updated).
      {result.linkedItems > 0 && ` Linked ${plural(result.linkedItems, 'item')} to their accounts.`}
    </Notice>
  )
}
