import { expect, test } from 'vitest'
import { parseAccounts } from './accounts.ts'

test('reads IDs, names, plans, segments, and ARR written with or without $ and commas', () => {
  expect(
    parseAccounts({
      header: ['Account ID', 'Name', 'ARR', 'Plan', 'Segment'],
      rows: [
        ['ACC-001', 'Acme', '$120,000', 'Enterprise', 'Enterprise'],
        ['ACC-002', 'Brightline', '85000', 'Growth', ''],
        ['', '', '', '', ''],
        ['ACC-003', 'Cobalt', '4200.60', '', 'SMB'],
      ],
    }),
  ).toEqual({
    ok: true,
    value: [
      { externalId: 'ACC-001', name: 'Acme', arr: 120000, plan: 'Enterprise', segment: 'Enterprise' },
      { externalId: 'ACC-002', name: 'Brightline', arr: 85000, plan: 'Growth', segment: null },
      { externalId: 'ACC-003', name: 'Cobalt', arr: 4201, plan: null, segment: 'SMB' },
    ],
  })
})

test('accepts header aliases and leaves out optional columns', () => {
  expect(parseAccounts({ header: ['account_id', 'Company', 'Annual Recurring Revenue'], rows: [['A1', 'Acme', '10']] })).toEqual({
    ok: true,
    value: [{ externalId: 'A1', name: 'Acme', arr: 10, plan: null, segment: null }],
  })
})

test.each([
  [
    'missing columns',
    { header: ['Account ID', 'Plan'], rows: [['A1', 'Growth']] },
    'Account files need Account ID, Name, and ARR columns. This file has no Name or ARR column.',
  ],
  [
    'bad ARR values',
    { header: ['ID', 'Name', 'ARR'], rows: [['A1', 'Acme', '-5'], ['A2', 'Brightline', '12k'], ['A3', 'Cobalt', '1,00']] },
    'Some ARR values are not dollar amounts like 120000 or $120,000 (rows 2, 3, 4).',
  ],
  ['a missing ID', { header: ['ID', 'Name', 'ARR'], rows: [['A1', 'Acme', '1'], ['', 'Brightline', '2']] }, 'Some accounts have no ID (row 3).'],
  [
    'a duplicate ID',
    { header: ['ID', 'Name', 'ARR'], rows: [['A1', 'Acme', '1'], ['A2', 'Brightline', '2'], ['A1', 'Cobalt', '3']] },
    'Account ID A1 appears twice (rows 2 and 4).',
  ],
] as const)('%s is an error', (_name, table, error) => {
  expect(parseAccounts(table)).toEqual({ ok: false, error })
})
