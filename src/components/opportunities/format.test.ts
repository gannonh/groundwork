import { describe, expect, test } from 'vitest'
import { formatUsd } from './format'

describe('formatUsd', () => {
  test('rounds to thousands before choosing between k and M', () => {
    expect([999_999, 999_499, 2_310_000, 240_000].map(formatUsd)).toEqual(['$1.00M', '$999k', '$2.31M', '$240k'])
    expect(formatUsd(1_234_567)).toBe('$1.23M')
  })
})
