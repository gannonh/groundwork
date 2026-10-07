import { describe, expect, test } from 'vitest'
import { NONE_OF_THESE, type ItemId, type NonEmptyArray, type OpportunityId, type RedactedText } from '../domain/types.ts'
import { adapt } from '../judge/adapters.ts'
import type { Judge, Question } from '../judge/types.ts'
import { placeMention, type PlaceTree } from './place.ts'

const id = (n: number) => `00000000-0000-8000-8000-0000000000${String(n).padStart(2, '0')}` as OpportunityId
const TREE: PlaceTree = [
  { id: id(1), title: 'Trust the numbers', problems: [{ id: id(11), title: 'Totals are wrong' }, { id: id(12), title: 'Data is stale' }] },
  { id: id(2), title: 'Share findings', problems: [{ id: id(21), title: 'Exports lose formatting' }] },
]
const STATE = { itemId: '0199aaaa-0000-7000-8000-000000000042' as ItemId, text: '1: The totals are wrong.' as RedactedText }

/** A judge that answers each question from a table of probabilities by question key. */
function judgeWith(probabilities: Record<string, Record<string, number>>, asked: string[] = []): Judge {
  return {
    provenance: { backend: 'recorded', modelVersion: 'jev-1.13.0' },
    answer(_state, questions: NonEmptyArray<Question>) {
      asked.push(questions.map((q) => q.key).join(','))
      const answers = questions.map((q) => adapt(q, { probabilities: probabilities[q.key] ?? { [NONE_OF_THESE]: 1 }, confidence: 0.9 }))
      return Promise.resolve(answers as never)
    },
  }
}
const outcome = { 'Trust the numbers': 1, 'Share findings': 0, [NONE_OF_THESE]: 0 }
const problem = (totals: number) => ({ 'Totals are wrong': totals, 'Data is stale': 0, [NONE_OF_THESE]: 1 - totals })

describe('placeMention with place_confidence 0.7', () => {
  test('an answer at 0.69 goes to triage and one at 0.70 is placed', async () => {
    const at = (confidence: number) =>
      placeMention(judgeWith({ place_outcome: outcome, 'place_problem:Trust the numbers': problem(confidence) }), STATE, TREE, 0.7)
    expect(await at(0.69)).toMatchObject({ kind: 'placed', opportunityId: id(11), confidence: 0.69, routing: 'triage' })
    expect(await at(0.7)).toMatchObject({ kind: 'placed', opportunityId: id(11), confidence: 0.7, routing: 'placed' })
  })

  test('the confidence is the probability of the whole path', async () => {
    const result = await placeMention(
      judgeWith({
        place_outcome: { 'Trust the numbers': 0.8, 'Share findings': 0.2, [NONE_OF_THESE]: 0 },
        'place_problem:Trust the numbers': problem(0.9),
        'place_problem:Share findings': { 'Exports lose formatting': 1, [NONE_OF_THESE]: 0 },
      }),
      STATE,
      TREE,
      0.7,
    )
    // 0.8 x 0.9 = 0.72 beats the second branch's 0.2 x 1.
    expect(result).toMatchObject({ kind: 'placed', opportunityId: id(11), routing: 'placed' })
    expect(result.kind === 'placed' && result.confidence).toBeCloseTo(0.72, 10)
  })

  test('the second branch wins when its leaf is surer than the first branch\'s', async () => {
    const result = await placeMention(
      judgeWith({
        place_outcome: { 'Trust the numbers': 0.55, 'Share findings': 0.45, [NONE_OF_THESE]: 0 },
        'place_problem:Trust the numbers': problem(0.5),
        'place_problem:Share findings': { 'Exports lose formatting': 1, [NONE_OF_THESE]: 0 },
      }),
      STATE,
      TREE,
      0.7,
    )
    expect(result).toMatchObject({ kind: 'placed', opportunityId: id(21), leaf: 'place_problem:Share findings', routing: 'triage' })
  })

  test('a "none" at the outcome level leaves the mention unplaced after one request', async () => {
    const asked: string[] = []
    const result = await placeMention(
      judgeWith({ place_outcome: { 'Trust the numbers': 0.3, 'Share findings': 0.2, [NONE_OF_THESE]: 0.5 } }, asked),
      STATE,
      TREE,
      0.7,
    )
    expect(result.kind).toBe('unplaced')
    expect(asked).toEqual(['place_outcome'])
  })

  test('a "none" under the best outcome leaves the mention unplaced', async () => {
    const result = await placeMention(
      judgeWith({
        place_outcome: outcome,
        'place_problem:Trust the numbers': { 'Totals are wrong': 0.2, 'Data is stale': 0.1, [NONE_OF_THESE]: 0.7 },
      }),
      STATE,
      TREE,
      0.7,
    )
    expect(result.kind).toBe('unplaced')
  })

  test('the second level asks about the top two outcomes in one request', async () => {
    const asked: string[] = []
    await placeMention(
      judgeWith({ place_outcome: { 'Trust the numbers': 0.6, 'Share findings': 0.4, [NONE_OF_THESE]: 0 } }, asked),
      STATE,
      TREE,
      0.7,
    )
    expect(asked).toEqual(['place_outcome', 'place_problem:Trust the numbers,place_problem:Share findings'])
  })
})
