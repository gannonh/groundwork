import { useRef, useState, type ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { CsvFileField } from '@/components/sources/csv-file-field'
import { ITEM_KIND_LABELS, plural } from '@/components/sources/format'
import { Notice } from '@/components/sources/notice'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/db/client'
import { ITEM_KINDS, type ItemKind } from '@/domain/types'
import { parseCsv, type CsvTable } from '@/ingest/csv'
import { DATE_FORMATS, guessMapping, type ColumnMapping } from '@/ingest/mapping'
import { importItems, rememberedMapping, type ItemImportResult } from '@/server/ingest.server'

const MappingInput = z.object({
  text: z.string().min(1),
  date: z.string().min(1),
  dateFormat: z.enum(DATE_FORMATS),
  account: z.string().min(1).nullable(),
  author: z.string().min(1).nullable(),
})

const getRememberedMapping = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ header: z.array(z.string()) }).parse(data))
  .handler(({ data }) => rememberedMapping(db, data.header))

const importSource = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('Expected form data.')
    const file = data.get('file')
    if (!(file instanceof File)) throw new Error('Choose a CSV file to import.')
    const mapping = data.get('mapping')
    if (typeof mapping !== 'string') throw new Error('Expected a column mapping.')
    const fields = z
      .object({ mapping: MappingInput, itemKind: z.enum(ITEM_KINDS) })
      .parse({ mapping: JSON.parse(mapping) as unknown, itemKind: data.get('itemKind') })
    return { file, ...fields }
  })
  .handler(async ({ data }) =>
    importItems(db, {
      fileName: data.file.name,
      bytes: new Uint8Array(await data.file.arrayBuffer()),
      mapping: data.mapping,
      itemKind: data.itemKind,
    }),
  )

export const Route = createFileRoute('/sources/new')({ component: NewSourcePage })

type Upload =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly error: string }
  | {
      readonly kind: 'ready'
      readonly file: File
      readonly table: CsvTable
      readonly mapping: ColumnMapping
      readonly itemKind: ItemKind
      readonly rememberedFrom: string | null
    }
type Submission =
  | { readonly kind: 'idle' }
  | { readonly kind: 'importing' }
  | { readonly kind: 'done'; readonly result: ItemImportResult }

const NONE = '__none__'
const PREVIEW_ROWS = 20

function NewSourcePage() {
  const [upload, setUpload] = useState<Upload>({ kind: 'none' })
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' })
  const latestFile = useRef<File | null>(null)

  const choose = async (file: File, bytes: Uint8Array) => {
    latestFile.current = file
    setSubmission({ kind: 'idle' })
    const parsed = parseCsv(bytes)
    if (!parsed.ok) {
      setUpload({ kind: 'invalid', error: parsed.error })
      return
    }
    setUpload({ kind: 'none' })
    const remembered = await getRememberedMapping({ data: { header: [...parsed.value.header] } })
    if (latestFile.current !== file) return
    setUpload({
      kind: 'ready',
      file,
      table: parsed.value,
      mapping: remembered?.mapping ?? guessMapping(parsed.value),
      itemKind: remembered?.itemKind ?? 'ticket',
      rememberedFrom: remembered?.sourceName ?? null,
    })
  }

  const submit = async (ready: Extract<Upload, { kind: 'ready' }>) => {
    setSubmission({ kind: 'importing' })
    const form = new FormData()
    form.set('file', ready.file)
    form.set('mapping', JSON.stringify(ready.mapping))
    form.set('itemKind', ready.itemKind)
    try {
      setSubmission({ kind: 'done', result: await importSource({ data: form }) })
    } catch {
      setSubmission({ kind: 'done', result: { kind: 'error', message: 'The import failed. Try again.' } })
    }
  }

  return (
    <main className="h-[calc(100dvh-48px)] overflow-auto px-5 py-4">
      <div className="mb-1 text-[12px] text-ink-3">
        <Link to="/sources" className="hover:underline">
          Sources
        </Link>
      </div>
      <h1 className="mb-3 text-[17px] font-semibold">New source</h1>

      <div className="mb-4 grid gap-3">
        <CsvFileField
          label="CSV export"
          disabled={submission.kind === 'importing'}
          onFile={(file, bytes) => void choose(file, bytes)}
        />
        {upload.kind === 'invalid' && <Notice tone="error">{upload.error}</Notice>}
      </div>

      {upload.kind === 'ready' && (
        <>
          {upload.rememberedFrom !== null && (
            <div className="mb-3">
              <Notice tone="info">Mapping remembered from {upload.rememberedFrom}.</Notice>
            </div>
          )}
          <MappingForm
            header={upload.table.header}
            mapping={upload.mapping}
            itemKind={upload.itemKind}
            disabled={submission.kind === 'importing'}
            onMapping={(mapping) => {
              setUpload({ ...upload, mapping })
            }}
            onItemKind={(itemKind) => {
              setUpload({ ...upload, itemKind })
            }}
          />
          <div className="my-4 flex items-center gap-3">
            <Button size="sm" disabled={submission.kind === 'importing'} onClick={() => void submit(upload)}>
              {submission.kind === 'importing'
                ? `Importing ${plural(upload.table.rows.length, 'row')}…`
                : `Import ${plural(upload.table.rows.length, 'row')}`}
            </Button>
            <span className="text-ink-3">{upload.file.name}</span>
          </div>
          {submission.kind === 'done' && (
            <div className="mb-4">
              <ImportOutcome result={submission.result} />
            </div>
          )}
          <Preview table={upload.table} mapping={upload.mapping} />
        </>
      )}
    </main>
  )
}

function ImportOutcome({ result }: { result: ItemImportResult }) {
  if (result.kind === 'error') return <Notice tone="error">{result.message}</Notice>
  return (
    <Notice tone="success">
      Imported {plural(result.imported, 'item')}. {plural(result.duplicates, 'duplicate')} skipped.
      {result.skippedEmpty > 0 && ` ${plural(result.skippedEmpty, 'empty row')} skipped.`}{' '}
      <Link to="/sources/$id" params={{ id: result.sourceId }} className="underline">
        Open {result.sourceName}
      </Link>
    </Notice>
  )
}

function MappingForm({
  header,
  mapping,
  itemKind,
  disabled,
  onMapping,
  onItemKind,
}: {
  header: readonly string[]
  mapping: ColumnMapping
  itemKind: ItemKind
  disabled: boolean
  onMapping: (mapping: ColumnMapping) => void
  onItemKind: (itemKind: ItemKind) => void
}) {
  const columns = header.map((name) => ({ value: name, label: name }))
  const optional = [{ value: NONE, label: 'None' }, ...columns]
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 rounded-lg border bg-card p-3">
      <Field label="Text column" value={mapping.text} options={columns} disabled={disabled} onChange={(text) => {
        onMapping({ ...mapping, text })
      }} />
      <Field label="Date column" value={mapping.date} options={columns} disabled={disabled} onChange={(date) => {
        onMapping({ ...mapping, date })
      }} />
      <Field
        label="Date format"
        value={mapping.dateFormat}
        options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
        disabled={disabled}
        onChange={(value) => {
          const dateFormat = DATE_FORMATS.find((f) => f === value)
          if (dateFormat) onMapping({ ...mapping, dateFormat })
        }}
      />
      <Field label="Account column" value={mapping.account ?? NONE} options={optional} disabled={disabled} onChange={(v) => {
        onMapping({ ...mapping, account: v === NONE ? null : v })
      }} />
      <Field label="Author column" value={mapping.author ?? NONE} options={optional} disabled={disabled} onChange={(v) => {
        onMapping({ ...mapping, author: v === NONE ? null : v })
      }} />
      <Field
        label="Item kind"
        value={itemKind}
        options={ITEM_KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABELS[k] }))}
        disabled={disabled}
        onChange={(value) => {
          const kind = ITEM_KINDS.find((k) => k === value)
          if (kind) onItemKind(kind)
        }}
      />
    </div>
  )
}

function Field({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12px] text-ink-2">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger size="sm" aria-label={label} className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Preview({ table, mapping }: { table: CsvTable; mapping: ColumnMapping }) {
  const roleOf = (column: string) =>
    column === mapping.text
      ? 'Text'
      : column === mapping.date
        ? 'Date'
        : column === mapping.account
          ? 'Account'
          : column === mapping.author
            ? 'Author'
            : null
  const mapped = (column: string) => (roleOf(column) ? 'bg-primary-soft/60' : '')
  return (
    <div className="rounded-lg border bg-card">
      <Table className="text-[12px]">
        <TableCaption className="mt-0 border-t py-2 text-[12px] text-ink-3">
          Showing {Math.min(PREVIEW_ROWS, table.rows.length)} of {plural(table.rows.length, 'row')}
        </TableCaption>
        <TableHeader>
          <TableRow>
            {table.header.map((column) => (
              <TableHead key={column} className={`h-auto px-2 py-1.5 align-bottom ${mapped(column)}`}>
                <Cell>
                  <span className="block min-h-[14px] text-[10px] font-semibold tracking-[0.04em] text-primary uppercase">
                    {roleOf(column)}
                  </span>
                  <span className="text-[11px] font-semibold text-ink-2">{column}</span>
                </Cell>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
            <TableRow key={i}>
              {table.header.map((column, j) => (
                <TableCell key={column} className={`px-2 py-1 ${mapped(column)}`}>
                  <Cell>{row[j]}</Cell>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Cell({ children }: { children: ReactNode }) {
  return <div className="max-w-[260px] truncate">{children}</div>
}
