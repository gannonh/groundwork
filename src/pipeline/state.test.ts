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

  test('a single sentence longer than the limit is split across runs, and no text is dropped', () => {
    // 12 tokens is 48 characters. "0: " and a newline leave 44 for text, so 100 characters make pieces of 44, 44 and 12.
    const text = Array.from({ length: 100 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('')
    const chunks = chunkSentences([sentence(0, text), sentence(1, 'Next.')], 12)
    expect(chunks.map((chunk) => chunk.map((s) => [s.ordinal, s.text.length]))).toEqual([[[0, 44]], [[0, 44]], [[0, 12], [1, 5]]])
    expect(chunks.flat().filter((s) => s.ordinal === 0).map((s) => s.text).join('')).toBe(text)
    expect(chunks.every((chunk) => renderState(chunk).length <= 48)).toBe(true)
  })

  test('no run holds more sentences than the cap', () => {
    const sentences = Array.from({ length: 7 }, (_, i) => sentence(i, 'x')) as unknown as NonEmptyArray<Sentence>
    expect(chunkSentences(sentences, 1000, 3).map((chunk) => chunk.map((s) => s.ordinal))).toEqual([[0, 1, 2], [3, 4, 5], [6]])
  })

  test('the state numbers each sentence', () => {
    expect(renderState([sentence(3, 'Hello.'), sentence(4, 'Bye.')])).toBe('3: Hello.\n4: Bye.')
  })
})
