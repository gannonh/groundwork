import { describe, expect, test } from 'vitest'
import type { CsvTable } from './csv.ts'
import { guessMapping, parseDate, parseSpeakerRole, shapeOf, toItemDrafts, type ColumnMapping } from './mapping.ts'

const ZENDESK: CsvTable = {
  header: ['Ticket ID', 'Created at', 'Subject', 'Description', 'Requester role', 'Organization ID'],
  rows: [
    ['1001', '2026-08-14 09:32:10', 'Login', 'Email jane@acme.com. It broke on v2.3!', 'End user', 'ACC-001'],
    ['1002', '2026-08-15 10:00:00', 'Blank', '   ', 'Admin', ''],
    ['1003', '2026-08-16 11:15:00', 'Export', 'Export fails.', 'VP of Data', ''],
  ],
}
const NPS: CsvTable = {
  header: ['Response ID', 'Submitted', 'Score', 'Comment', 'Account'],
  rows: [
    ['r1', '03/02/2026', '9', 'Great.', 'ACC-002'],
    ['r2', '25/02/2026', '4', 'Slow dashboards.', 'ACC-003'],
  ],
}

test('shapeOf ignores case and surrounding spaces', () => {
  expect(shapeOf([' Ticket ID', 'Created At '])).toBe(shapeOf(['ticket id', 'created at']))
  expect(shapeOf(['Ticket ID', 'Created at'])).toBe('ticket id\u001fcreated at')
})

describe('guessMapping', () => {
  test('maps a Zendesk export', () => {
    expect(guessMapping(ZENDESK)).toEqual({
      text: 'Description',
      date: 'Created at',
      dateFormat: 'YYYY-MM-DD',
      account: 'Organization ID',
      author: 'Requester role',
    })
  })

  test('detects DD/MM/YYYY from a day above 12', () => {
    expect(guessMapping(NPS)).toEqual({
      text: 'Comment',
      date: 'Submitted',
      dateFormat: 'DD/MM/YYYY',
      account: 'Account',
      author: null,
    })
  })

  test('falls back to the longest column for text and a parseable column for the date', () => {
    const table: CsvTable = { header: ['a', 'b', 'c'], rows: [['x', '01/31/2026', 'a much longer cell of text']] }
    expect(guessMapping(table)).toEqual({ text: 'c', date: 'b', dateFormat: 'MM/DD/YYYY', account: null, author: null })
  })
})

describe('parseDate', () => {
  test.each([
    ['2026-08-14', 'YYYY-MM-DD', '2026-08-14T00:00:00.000Z'],
    ['2026-08-14 09:32:10', 'YYYY-MM-DD', '2026-08-14T09:32:10.000Z'],
    ['2026-08-14T09:32:10Z', 'YYYY-MM-DD', '2026-08-14T09:32:10.000Z'],
    ['2026-08-14T09:32:10+02:00', 'YYYY-MM-DD', '2026-08-14T07:32:10.000Z'],
    ['2026-08-14T09:32:10.123-0500', 'YYYY-MM-DD', '2026-08-14T14:32:10.000Z'],
    ['08/14/2026', 'MM/DD/YYYY', '2026-08-14T00:00:00.000Z'],
    ['14/08/2026 17:05', 'DD/MM/YYYY', '2026-08-14T17:05:00.000Z'],
  ] as const)('%s as %s', (value, format, iso) => {
    expect(parseDate(value, format)?.toISOString()).toBe(iso)
  })

  test.each([
    ['14/08/2026', 'MM/DD/YYYY'],
    ['2026-02-30', 'YYYY-MM-DD'],
    ['2026-08-14 25:00', 'YYYY-MM-DD'],
    ['08/14/2026', 'YYYY-MM-DD'],
    ['', 'DD/MM/YYYY'],
  ] as const)('%s is not %s', (value, format) => {
    expect(parseDate(value, format)).toBe(null)
  })
})

test('parseSpeakerRole reads aliases, treats blank as no role, and anything else as unknown', () => {
  expect(['End user', 'end_user', 'Customer', 'Administrator', 'buyer', 'Exec', '  ', 'VP of Data'].map(parseSpeakerRole)).toEqual(
    ['end_user', 'end_user', 'end_user', 'admin', 'buyer', 'executive', null, 'unknown'],
  )
})

describe('toItemDrafts', () => {
  const mapping: ColumnMapping = {
    text: 'Description',
    date: 'Created at',
    dateFormat: 'YYYY-MM-DD',
    account: 'Organization ID',
    author: 'Requester role',
  }

  test('redacts, splits, and skips rows with blank text', () => {
    expect(toItemDrafts(ZENDESK, mapping)).toEqual({
      ok: true,
      value: {
        skippedEmpty: 1,
        drafts: [
          {
            cells: ZENDESK.rows[0],
            raw: 'Email jane@acme.com. It broke on v2.3!',
            sentences: ['Email [email].', 'It broke on v2.3!'],
            occurredAt: new Date('2026-08-14T09:32:10Z'),
            accountRef: 'ACC-001',
            authorRole: 'end_user',
          },
          {
            cells: ZENDESK.rows[2],
            raw: 'Export fails.',
            sentences: ['Export fails.'],
            occurredAt: new Date('2026-08-16T11:15:00Z'),
            accountRef: null,
            authorRole: 'unknown',
          },
        ],
      },
    })
  })

  test('fails the whole import when dates do not match the format, naming the rows', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`r${String(i)}`, `2${String(i)}/02/2026`, '9', 'Fine.', ''])
    expect(toItemDrafts({ header: NPS.header, rows }, { ...mapping, text: 'Comment', date: 'Submitted', dateFormat: 'MM/DD/YYYY', account: null, author: null })).toEqual({
      ok: false,
      error: '5 dates don\'t match MM/DD/YYYY (rows 2, 3, 4, and 2 more). Pick the format the "Submitted" column uses.',
    })
  })

  test('a mapped column missing from the file is an error', () => {
    expect(toItemDrafts(NPS, mapping)).toEqual({ ok: false, error: 'This file has no column named "Description".' })
  })
})
