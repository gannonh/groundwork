import { expect, test } from 'vitest'
import { splitSentences } from './sentences.ts'

test('splits on sentence ends but not on the dot inside a version', () => {
  expect(splitSentences('Hi. It broke on v2.3. Help!')).toEqual([
    { text: 'Hi.', start: 0, end: 3 },
    { text: 'It broke on v2.3.', start: 4, end: 21 },
    { text: 'Help!', start: 22, end: 27 },
  ])
})

test('trims whitespace and newlines between sentences', () => {
  expect(splitSentences('  First line.\n\nSecond line?  ').map((s) => s.text)).toEqual(['First line.', 'Second line?'])
})
