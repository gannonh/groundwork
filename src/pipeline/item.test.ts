import { describe, expect, test } from 'vitest'
import { PACK_DEFINITION } from '../db/seed/prototype.ts'
import type { ItemId, NonEmptyArray, OpportunityId, RedactedText } from '../domain/types.ts'
import { adapt } from '../judge/adapters.ts'
import type { Judge, JudgeState, Question } from '../judge/types.ts'
import { judgeItem } from './item.ts'
import type { PlaceTree } from './place.ts'
import { STATE_TOKEN_LIMIT, type Sentence } from './state.ts'

const ITEM = '0199aaaa-0000-7000-8000-000000000042' as ItemId
const TREE: PlaceTree = [
  { id: '00000000-0000-8000-8000-000000000001' as OpportunityId, title: 'Trust the numbers', problems: [{ id: '00000000-0000-8000-8000-000000000011' as OpportunityId, title: 'Totals are wrong' }] },
]
const LIMIT_CHARS = STATE_TOKEN_LIMIT * 4

/** Says yes to everything, picks sentence 1 as the quote, and takes the first option of any other Choice. Keeps every state it was sent. */
function recordingJudge(states: JudgeState[]): Judge {
  return {
    provenance: { backend: 'recorded', modelVersion: 'jev-1.13.0' },
    answer(state, questions: NonEmptyArray<Question>) {
      states.push(state)
      const answers = questions.map((q) => {
        if (q.type === 'noul') return adapt(q, { p_yes: 0.9 })
        const names = q.type === 'score' ? q.levels : q.options
        const pick = q.key === 'quote' && names.includes('1') ? '1' : names[0]
        return adapt(q, { probabilities: { [pick]: 1 }, confidence: 0.9 })
      })
      return Promise.resolve(answers as never)
    },
  }
}
const sentence = (ordinal: number, length: number): Sentence => ({ ordinal, text: 'x'.repeat(length) as RedactedText })

describe('judgeItem on sentences longer than a request', () => {
  test('three 50,000-character sentences place the quote without its neighbours, and no request passes the limit', async () => {
    const states: JudgeState[] = []
    const judgement = await judgeItem(recordingJudge(states), PACK_DEFINITION, TREE, { id: ITEM, sentences: [sentence(0, 50_000), sentence(1, 50_000), sentence(2, 50_000)] })
    expect(Math.max(...states.map((s) => s.text.length))).toBeLessThanOrEqual(LIMIT_CHARS)
    const placing = states.filter((s) => s.text === `1: ${'x'.repeat(50_000)}`)
    // place_outcome and place_problem each read the quoted sentence alone.
    expect(placing).toHaveLength(2)
    expect(judgement.mention).toMatchObject({ sentenceStart: 1, placement: { opportunityId: TREE[0]?.problems[0]?.id } })
  })

  test('a quoted sentence longer than the limit is placed in pieces, and the answers kept are those of one piece', async () => {
    const states: JudgeState[] = []
    const judgement = await judgeItem(recordingJudge(states), PACK_DEFINITION, TREE, { id: ITEM, sentences: [sentence(0, 200_000)] })
    expect(Math.max(...states.map((s) => s.text.length))).toBeLessThanOrEqual(LIMIT_CHARS)
    expect(judgement.answers.filter((a) => a.questionKey === 'place_outcome')).toHaveLength(1)
    expect(judgement.mention?.sentenceStart).toBe(0)
  })
})
