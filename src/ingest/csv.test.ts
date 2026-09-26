import { describe, expect, test } from 'vitest'
import { parseCsv } from './csv.ts'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('parseCsv', () => {
  test('a quoted multi-line cell stays one row', () => {
    expect(parseCsv(bytes('id,text\n1,"First line.\nSecond line, with a comma."\n2,plain\n'))).toEqual({
      ok: true,
      value: {
        header: ['id', 'text'],
        rows: [
          ['1', 'First line.\nSecond line, with a comma.'],
          ['2', 'plain'],
        ],
      },
    })
  })

  test('reads escaped quotes, CRLF line ends, a BOM, and skips blank lines', () => {
    expect(parseCsv(bytes('﻿id,text\r\n1,"She said ""it broke"""\r\n\r\n2,\r\n'))).toEqual({
      ok: true,
      value: {
        header: ['id', 'text'],
        rows: [
          ['1', 'She said "it broke"'],
          ['2', ''],
        ],
      },
    })
  })

  test.each([
    ['an empty file', new Uint8Array(), 'The file is empty.'],
    ['a file of blank lines', bytes('\n  \n'), 'The file is empty.'],
    ['a PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), 'This file is not a text CSV.'],
    ['valid UTF-8 with NUL bytes', bytes('id\u0000,text\n1,a\n'), 'This file is not a text CSV.'],
    ['a header with no rows', bytes('id,text\n'), 'The file has a header row but no data rows.'],
    ['a blank header name', bytes('id,,text\n1,2,3\n'), 'Column 2 has no name in the header row.'],
    ['a duplicate header name', bytes('id,Text,Text\n1,2,3\n'), 'The header row has two columns named "Text".'],
    ['an unterminated quote', bytes('id,text\n1,ok\n2,"never\nclosed\n'), 'A quoted cell that starts on line 3 is never closed.'],
    [
      'a ragged row after a multi-line cell',
      bytes('id,text\n1,"two\nlines"\n2,a,b\n'),
      'Line 4 has 3 cells, but the header has 2 columns. Check that line for an unquoted comma or a missing quote.',
    ],
  ])('%s is an error', (_name, input, error) => {
    expect(parseCsv(input)).toEqual({ ok: false, error })
  })
})
