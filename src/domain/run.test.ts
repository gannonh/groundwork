import { describe, expect, test } from 'vitest'
import { describeRun, estimateRun } from './run.ts'
import type { ItemId } from './types.ts'

describe('estimateRun', () => {
  test('500 items of 400 characters take 1,700 requests and cost 1.57 cents', () => {
    const estimate = estimateRun({ items: 500, characters: 500 * 400, model: 'jev-1.13.0' })
    expect(estimate.requests).toBe(1700)
    // 1,700 requests x (100 item tokens + 120 question tokens) x $0.042 per million.
    expect(estimate.usd).toBeCloseTo(0.015708, 6)
  })

  test('a model with no known price has no dollar estimate', () => {
    expect(estimateRun({ items: 10, characters: 4000, model: 'llm-1.0.0' }).usd).toBeNull()
  })
})

describe('describeRun', () => {
  const failure = { itemId: '0199aaaa-0000-7000-8000-000000000001' as ItemId, message: 'No recorded answer' }
  const base = { items: 500, characters: 200_000, model: 'jev-1.13.0' }

  test('before anyone starts, the run is ready with its estimate', () => {
    expect(describeRun({ ...base, run: null })).toMatchObject({ kind: 'ready', items: 500, requests: 1700 })
  })

  test('progress counts judged and failed items, and reads 100 only when every item has finished', () => {
    expect(describeRun({ ...base, run: { judged: 249, failed: 0, failures: [] } })).toMatchObject({ kind: 'running', percent: 49 })
    expect(describeRun({ ...base, run: { judged: 499, failed: 0, failures: [] } })).toMatchObject({ kind: 'running', percent: 99 })
    expect(describeRun({ ...base, run: { judged: 499, failed: 1, failures: [failure] } })).toEqual({
      kind: 'done',
      items: 500,
      judged: 499,
      failed: 1,
      failures: [failure],
    })
  })
})
