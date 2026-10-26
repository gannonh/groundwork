import { describe, expect, test } from 'vitest'
import type { Confidence } from '@/domain/types'
import { formatConfidence, formatUsd } from './format'

describe('formatUsd', () => {
  test('rounds to thousands before choosing between k and M', () => {
    expect([999_999, 999_499, 2_310_000, 240_000].map(formatUsd)).toEqual(['$1.00M', '$999k', '$2.31M', '$240k'])
    expect(formatUsd(1_234_567)).toBe('$1.23M')
  })
})

describe('formatConfidence under a 0.7 place threshold', () => {
  const format = (c: number) => formatConfidence(c as Confidence, 0.7 as Confidence)
  test('a flagged placement reads under the threshold, never as it', () => {
    expect([0.6978, 0.695764, 0.69839, 0.694, 0.57, 0.62].map(format)).toEqual([
      '69% confident',
      '69% confident',
      '69% confident',
      '69% confident',
      '57% confident',
      '62% confident',
    ])
  })
  test('a placement at or above the threshold rounds as usual', () => {
    expect([0.7, 0.704, 0.706, 0.95].map(format)).toEqual(['70% confident', '70% confident', '71% confident', '95% confident'])
  })
})
