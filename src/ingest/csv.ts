// src/ingest runs in the browser (preview) and on the server (import), and the seed imports it under plain Node, so
// it uses relative .ts imports, erasable syntax, and no node: modules.
import { isNonEmpty, type NonEmptyArray } from '../domain/types.ts'

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }
export type CsvTable = { readonly header: NonEmptyArray<string>; readonly rows: readonly (readonly string[])[] }

export const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
export const fail = <T>(error: string): Parsed<T> => ({ ok: false, error })

const NOT_TEXT = 'This file is not a text CSV.'

/** RFC 4180 with quoted multi-line cells, CRLF or LF line ends, and an optional BOM. Blank lines are skipped. */
export function parseCsv(bytes: Uint8Array): Parsed<CsvTable> {
  if (bytes.length === 0) return fail('The file is empty.')
  let text: string
  try {
    // The decoder drops a leading BOM.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail(NOT_TEXT)
  }
  if (text.includes('\u0000')) return fail(NOT_TEXT)

  const records = splitRecords(text)
  if (!records.ok) return records
  const [first, ...rest] = records.value
  if (!first) return fail('The file is empty.')

  const header = first.cells.map((name) => name.trim())
  const blank = header.findIndex((name) => name === '')
  if (blank >= 0) return fail(`Column ${String(blank + 1)} has no name in the header row.`)
  const duplicate = header.find((name, i) => header.indexOf(name) !== i)
  if (duplicate !== undefined) return fail(`The header row has two columns named "${duplicate}".`)
  if (!isNonEmpty(header)) return fail('The file is empty.')
  if (rest.length === 0) return fail('The file has a header row but no data rows.')

  const ragged = rest.find((r) => r.cells.length !== header.length)
  if (ragged) {
    return fail(
      `Line ${String(ragged.line)} has ${String(ragged.cells.length)} cells, but the header has ${String(header.length)} columns. Check that line for an unquoted comma or a missing quote.`,
    )
  }
  return ok({ header, rows: rest.map((r) => r.cells) })
}

type CsvRecord = { readonly cells: readonly string[]; readonly line: number }

function splitRecords(text: string): Parsed<readonly CsvRecord[]> {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let quoteLine = 1

  const endRecord = () => {
    cells.push(cell)
    const isBlankLine = cells.length === 1 && cell.trim() === ''
    if (!isBlankLine) records.push({ cells, line: recordLine })
    cells = []
    cell = ''
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        if (ch === '\n') line++
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      quoted = true
      quoteLine = line
    } else if (ch === ',') {
      cells.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      cell += ch
    }
  }
  if (quoted) return fail(`A quoted cell that starts on line ${String(quoteLine)} is never closed.`)
  if (cell !== '' || cells.length > 0) endRecord()
  return ok(records)
}
