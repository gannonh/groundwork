import { describe, expect, test } from 'vitest'
import type { ItemId, NonEmptyArray, RedactedText } from '../domain/types.ts'
import { adapt } from '../judge/adapters.ts'
import type { Judge, Question } from '../judge/types.ts'
import { quote } from './quote.ts'
import type { Sentence } from './state.ts'

const ITEM = '0199aaaa-0000-7000-8000-000000000042' as ItemId

describe('quote', () => {
  test('300 short sentences are offered once each, and no question has more than 255 options', async () => {
    const asked: string[][] = []
    const judge: Judge = {
      provenance: { backend: 'recorded', modelVersion: 'jev-1.13.0' },
      answer(_state, questions: NonEmptyArray<Question>) {
        const options = questions.flatMap((q) => (q.type === 'choice' ? q.options : []))
        asked.push(options)
        const first = options[0] ?? ''
        return Promise.resolve(questions.map((q) => adapt(q, { probabilities: { [first]: 1 }, confidence: 0.9 })) as never)
      },
    }
    const sentences = Array.from({ length: 300 }, (_, ordinal): Sentence => ({ ordinal, text: 'Totals are wrong.' as RedactedText }))
    await quote(judge, ITEM, sentences as unknown as NonEmptyArray<Sentence>)
    expect(asked.map((options) => options.length)).toEqual([255, 45])
    expect(asked.flat().map(Number).sort((a, b) => a - b)).toEqual(sentences.map((s) => s.ordinal))
  })
})
