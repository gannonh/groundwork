import { describe, expect, test } from 'vitest'
import type { NonEmptyArray, RedactedText } from '../domain/types.ts'
import { chunkSentences, renderState, type Sentence } from './state.ts'

const sentence = (ordinal: number, text: string): Sentence => ({ ordinal, text: text as RedactedText })

describe('chunkSentences', () => {
  test('an item under the limit stays in one request', () => {
    const sentences: NonEmptyArray<Sentence> = [sentence(0, 'One.'), sentence(1, 'Two.')]
    expect(chunkSentences(sentences, 10)).toEqual([sentences])
  })

  test('an item over the limit splits into runs that each fit, keeping the item\'s sentence numbers', () => {
    const sentences: NonEmptyArray<Sentence> = [0, 1, 2, 3].map((i) => sentence(i, 'x'.repeat(30))) as unknown as NonEmptyArray<Sentence>
    // 10 tokens is 40 characters, and "0: " plus 30 characters plus a newline is 34.
    const chunks = chunkSentences(sentences, 10)
    expect(chunks.map((chunk) => chunk.map((s) => s.ordinal))).toEqual([[0], [1], [2], [3]])
    expect(chunks.every((chunk) => renderState(chunk).length <= 40)).toBe(true)
  })

  test('a single sentence longer than the limit is cut to fit', () => {
    const chunks = chunkSentences([sentence(0, 'y'.repeat(100))], 10)
    expect(chunks[0][0].text).toHaveLength(40)
  })

  test('the state numbers each sentence', () => {
    expect(renderState([sentence(3, 'Hello.'), sentence(4, 'Bye.')])).toBe('3: Hello.\n4: Bye.')
  })
})
