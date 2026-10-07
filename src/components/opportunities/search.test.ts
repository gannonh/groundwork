import { expect, test } from 'vitest'
import { compactView, itemSearch, mapSearch, returnView } from './search'

const MENTION = '0a58b63a-5af8-8375-8d7c-d91d9dfda0d3'

test('compactView keeps only what differs from the default view', () => {
  const view = mapSearch.parse({ pain: 40, group: 'outcome', evidence: 'mentions', selected: MENTION })
  expect(compactView(view)).toEqual({ pain: 40, group: 'outcome', evidence: 'mentions', selected: MENTION })
  expect(compactView(mapSearch.parse({}))).toEqual({})
})

test('the item search reads a mention and the map view it came from, and drops anything malformed', () => {
  const from = { group: 'outcome', evidence: 'mentions', selected: MENTION }
  expect(itemSearch.parse({ mention: MENTION, from })).toEqual({ mention: MENTION, from })
  expect(itemSearch.parse({ mention: 'not-a-uuid', from: 'nope' })).toEqual({ mention: undefined, from: undefined })
  expect(itemSearch.parse({})).toEqual({ mention: undefined, from: undefined })
})

test('returnView reads the map view back with defaults left out', () => {
  expect(returnView({ pain: 40, since: '90d', evidence: 'mentions', selected: MENTION })).toEqual({
    pain: 40,
    evidence: 'mentions',
    selected: MENTION,
  })
  expect(returnView({ pain: 'junk', group: 'sideways' })).toEqual({})
  expect(returnView(undefined)).toBeUndefined()
})
