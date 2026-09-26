import { expect, test } from 'vitest'
import type { IsoDate } from '@/domain/types'
import { formatDate, formatDollars, plural } from './format'

test('formats counts, dates, and dollars', () => {
  expect([plural(1, 'item'), plural(500, 'item'), plural(10000, 'account')]).toEqual(['1 item', '500 items', '10,000 accounts'])
  expect(formatDate('2026-09-11' as IsoDate)).toBe('Sep 11, 2026')
  expect(formatDollars(114000)).toBe('$114,000')
})
