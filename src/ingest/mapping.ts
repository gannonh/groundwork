import { isNonEmpty, type NonEmptyArray, type RawText, type RedactedText, type SpeakerRole } from '../domain/types.ts'
import { fail, ok, type CsvTable, type Parsed } from './csv.ts'
import { redact } from './redact.ts'
import { splitSentences } from './sentences.ts'

export const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export type ColumnMapping = {
  readonly text: string
  readonly date: string
  readonly dateFormat: DateFormat
  readonly account: string | null
  readonly author: string | null
}

export type ItemDraft = {
  readonly cells: readonly string[]
  readonly raw: RawText
  readonly sentences: NonEmptyArray<RedactedText>
  readonly occurredAt: Date
  readonly accountRef: string | null
  readonly authorRole: SpeakerRole | null
}

export function shapeOf(header: readonly string[]): string {
  return header.map((name) => name.trim().toLowerCase()).join('\u001f')
}

const SAMPLE_ROWS = 20
const TEXT_NAMES = [/description/, /comment/, /body/, /text/, /message/, /feedback/, /review/, /transcript/, /content/, /note/]
const DATE_NAMES = [/created/, /submitted/, /date/, /occurred/, /timestamp/, /time/, /(^|[ _])at$/]
const ACCOUNT_NAMES = [/organi[sz]ation/, /account/, /company/, /customer id/, /\borg\b/]
const AUTHOR_NAMES = [/role/, /persona/, /user type/, /requester/, /author/]

export function guessMapping(table: CsvTable): ColumnMapping {
  const names = table.header.map((name) => name.toLowerCase())
  const sample = table.rows.slice(0, SAMPLE_ROWS)
  const byName = (patterns: readonly RegExp[]): string | null => {
    for (const pattern of patterns) {
      const i = names.findIndex((name) => pattern.test(name))
      if (i >= 0) return table.header[i] ?? null
    }
    return null
  }
  const values = (column: string) => {
    const i = table.header.indexOf(column)
    return sample.map((row) => row[i]?.trim() ?? '').filter((value) => value !== '')
  }
  const detectFormat = (column: string) => {
    const vs = values(column)
    return vs.length > 0 ? DATE_FORMATS.find((f) => vs.every((v) => parseDate(v, f) !== null)) : undefined
  }

  const date = byName(DATE_NAMES) ?? table.header.find((column) => detectFormat(column)) ?? table.header[0]
  const text =
    byName(TEXT_NAMES) ??
    maxBy(
      table.header.filter((column) => column !== date),
      (column) => values(column).reduce((sum, v) => sum + v.length, 0),
    ) ??
    table.header[0]
  return {
    text,
    date,
    dateFormat: detectFormat(date) ?? 'YYYY-MM-DD',
    account: byName(ACCOUNT_NAMES),
    author: byName(AUTHOR_NAMES),
  }
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

export function parseDate(value: string, format: DateFormat): Date | null {
  const m = (format === 'YYYY-MM-DD' ? ISO : SLASHED).exec(value.trim())
  if (!m) return null
  const [, a = '', b = '', c = '', hh = '0', mm = '0', ss = '0', zone] = m
  const [y, mo, d] = format === 'YYYY-MM-DD' ? [a, b, c] : format === 'MM/DD/YYYY' ? [c, a, b] : [c, b, a]
  const [year, month, day, hour, minute, second] = [Number(y), Number(mo), Number(d), Number(hh), Number(mm), Number(ss)]
  if (hour > 23 || minute > 59 || second > 59) return null
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null
  return zone && zone.toUpperCase() !== 'Z' ? new Date(utc.getTime() - offsetMinutes(zone) * 60_000) : utc
}

function offsetMinutes(zone: string): number {
  const digits = zone.replace(':', '')
  const minutes = Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5))
  return digits.startsWith('-') ? -minutes : minutes
}

const ROLE_ALIASES: Readonly<Record<string, SpeakerRole>> = {
  'end user': 'end_user',
  enduser: 'end_user',
  user: 'end_user',
  customer: 'end_user',
  admin: 'admin',
  administrator: 'admin',
  buyer: 'buyer',
  executive: 'executive',
  exec: 'executive',
  unknown: 'unknown',
}

export function parseSpeakerRole(value: string): SpeakerRole | null {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  if (key === '') return null
  return ROLE_ALIASES[key] ?? 'unknown'
}

const ROWS_NAMED = 3

export function toItemDrafts(
  table: CsvTable,
  mapping: ColumnMapping,
): Parsed<{ readonly drafts: readonly ItemDraft[]; readonly skippedEmpty: number }> {
  const index = (column: string) => table.header.indexOf(column)
  const missing = [mapping.text, mapping.date, mapping.account, mapping.author]
    .filter((column) => column !== null)
    .find((column) => index(column) < 0)
  if (missing !== undefined) return fail(`This file has no column named "${missing}".`)
  const textAt = index(mapping.text)
  const dateAt = index(mapping.date)
  const accountAt = mapping.account === null ? -1 : index(mapping.account)
  const authorAt = mapping.author === null ? -1 : index(mapping.author)

  const drafts: ItemDraft[] = []
  const badDateRows: number[] = []
  let skippedEmpty = 0
  table.rows.forEach((cells, i) => {
    const raw = (cells[textAt] ?? '').trim()
    const sentences = splitSentences(redact(raw)).map((s) => s.text as RedactedText)
    if (!isNonEmpty(sentences)) {
      skippedEmpty++
      return
    }
    const occurredAt = parseDate(cells[dateAt] ?? '', mapping.dateFormat)
    if (!occurredAt) {
      badDateRows.push(i + 2)
      return
    }
    const accountRef = accountAt < 0 ? '' : (cells[accountAt] ?? '').trim()
    drafts.push({
      cells,
      raw: raw as RawText,
      sentences,
      occurredAt,
      accountRef: accountRef === '' ? null : accountRef,
      authorRole: authorAt < 0 ? null : parseSpeakerRole(cells[authorAt] ?? ''),
    })
  })

  if (badDateRows.length > 0) {
    const n = badDateRows.length
    return fail(
      `${n === 1 ? "1 date doesn't" : `${String(n)} dates don't`} match ${mapping.dateFormat} (${rowList(badDateRows)}). Pick the format the "${mapping.date}" column uses.`,
    )
  }
  if (drafts.length === 0) return fail(`No row has text in the "${mapping.text}" column.`)
  return ok({ drafts, skippedEmpty })
}

export function rowList(rows: readonly number[]): string {
  const named = rows.slice(0, ROWS_NAMED).map(String).join(', ')
  const more = rows.length - ROWS_NAMED
  return `${rows.length === 1 ? 'row' : 'rows'} ${named}${more > 0 ? `, and ${String(more)} more` : ''}`
}

function maxBy<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T | undefined
  let bestScore = -Infinity
  for (const item of items) {
    const s = score(item)
    if (s > bestScore) {
      best = item
      bestScore = s
    }
  }
  return best
}
