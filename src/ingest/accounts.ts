import type { Usd } from '../domain/types.ts'
import { fail, ok, type CsvTable, type Parsed } from './csv.ts'
import { rowList } from './mapping.ts'

export type AccountDraft = {
  readonly externalId: string
  readonly name: string
  readonly arr: Usd
  readonly plan: string | null
  readonly segment: string | null
}

const COLUMNS = {
  externalId: { label: 'Account ID', aliases: ['id', 'account id', 'external id', 'customer id'], required: true },
  name: { label: 'Name', aliases: ['name', 'account name', 'company', 'company name'], required: true },
  arr: { label: 'ARR', aliases: ['arr', 'annual recurring revenue', 'arr usd', 'arr (usd)'], required: true },
  plan: { label: 'Plan', aliases: ['plan', 'tier'], required: false },
  segment: { label: 'Segment', aliases: ['segment'], required: false },
} as const
type Column = keyof typeof COLUMNS

const normalize = (name: string) => name.trim().toLowerCase().replace(/[\s_]+/g, ' ')
const ARR = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/

/** An account file needs Account ID, Name, and ARR columns. Plan and Segment are optional. */
export function parseAccounts(table: CsvTable): Parsed<readonly AccountDraft[]> {
  const header = table.header.map(normalize)
  const indexOf = (c: Column) => header.findIndex((h) => COLUMNS[c].aliases.some((a) => a === h))
  const at: Readonly<Record<Column, number>> = {
    externalId: indexOf('externalId'),
    name: indexOf('name'),
    arr: indexOf('arr'),
    plan: indexOf('plan'),
    segment: indexOf('segment'),
  }
  const missing = (Object.keys(COLUMNS) as Column[]).filter((c) => COLUMNS[c].required && at[c] < 0)
  if (missing.length > 0) {
    return fail(
      `Account files need Account ID, Name, and ARR columns. This file has no ${missing.map((c) => COLUMNS[c].label).join(' or ')} column.`,
    )
  }

  const cell = (row: readonly string[], c: Column) => (at[c] < 0 ? '' : (row[at[c]] ?? '').trim())
  const drafts: AccountDraft[] = []
  const firstRow = new Map<string, number>()
  const noId: number[] = []
  const noName: number[] = []
  const badArr: number[] = []
  let duplicate: string | null = null
  for (const [i, row] of table.rows.entries()) {
    if (row.every((value) => value.trim() === '')) continue
    // Row 1 is the header, as in a spreadsheet.
    const rowNumber = i + 2
    const externalId = cell(row, 'externalId')
    const name = cell(row, 'name')
    const arr = cell(row, 'arr')
    if (!externalId) noId.push(rowNumber)
    if (!name) noName.push(rowNumber)
    if (!ARR.test(arr)) badArr.push(rowNumber)
    const seen = firstRow.get(externalId)
    if (externalId && seen !== undefined) {
      duplicate ??= `Account ID ${externalId} appears twice (rows ${String(seen)} and ${String(rowNumber)}).`
    }
    firstRow.set(externalId, seen ?? rowNumber)
    const plan = cell(row, 'plan')
    const segment = cell(row, 'segment')
    drafts.push({
      externalId,
      name,
      arr: Math.round(Number(arr.replace(/[$,\s]/g, ''))) as Usd,
      plan: plan || null,
      segment: segment || null,
    })
  }

  if (noId.length > 0) return fail(`Some accounts have no ID (${rowList(noId)}).`)
  if (noName.length > 0) return fail(`Some accounts have no name (${rowList(noName)}).`)
  if (badArr.length > 0) return fail(`Some ARR values are not dollar amounts like 120000 or $120,000 (${rowList(badArr)}).`)
  if (duplicate) return fail(duplicate)
  if (drafts.length === 0) return fail('The file has a header row but no data rows.')
  return ok(drafts)
}
