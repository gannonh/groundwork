import type { ItemId, NonEmptyArray } from '../domain/types.ts'
import type { ChoiceAnswer, Judge, NoulAnswer, Question, ScoreAnswer } from '../judge/types.ts'
import type { Pack } from '../pack/pack.ts'
import { chunkSentences, renderState, type Sentence } from './state.ts'

export type Detection = {
  readonly states_problem: NoulAnswer
  readonly proposes_solution: NoulAnswer
  readonly workaround: NoulAnswer
  readonly pain: ScoreAnswer
  readonly role: ChoiceAnswer
  /** True when the item states a problem or proposes a solution with P(yes) at or above the pack's detect threshold. */
  readonly hasMention: boolean
}

/** All five item questions go in one request per chunk of the item. */
export async function detect(
  judge: Judge,
  itemId: ItemId,
  sentences: NonEmptyArray<Sentence>,
  pack: Pack,
): Promise<Detection> {
  const q = pack.item_questions
  const questions = [
    { key: 'states_problem', ...q.states_problem },
    { key: 'proposes_solution', ...q.proposes_solution },
    { key: 'workaround', ...q.workaround },
    { key: 'pain', ...q.pain },
    { key: 'role', ...q.role },
  ] as const satisfies NonEmptyArray<Question>

  const chunks = await Promise.all(
    chunkSentences(sentences).map((chunk) => judge.answer({ itemId, text: renderState(chunk) }, questions)),
  )
  const merged = {
    states_problem: mostLikelyYes(chunks.map((c) => c[0])),
    proposes_solution: mostLikelyYes(chunks.map((c) => c[1])),
    workaround: mostLikelyYes(chunks.map((c) => c[2])),
    pain: worstPain(chunks.map((c) => c[3])),
    role: mostConfident(chunks.map((c) => c[4])),
  }
  const reads = Math.max(merged.states_problem.value.yes, merged.proposes_solution.value.yes)
  return { ...merged, hasMention: reads >= pack.thresholds.detect }
}

// An item split across chunks reads as the most that any chunk says.
const mostLikelyYes = (answers: readonly NoulAnswer[]) => best(answers, (a) => a.value.yes)
const worstPain = (answers: readonly ScoreAnswer[]) => best(answers, (a) => a.value.level * 2 + a.confidence)
export const mostConfident = <A extends { readonly confidence: number }>(answers: readonly A[]): A => best(answers, (a) => a.confidence)

function best<A>(answers: readonly A[], score: (answer: A) => number): A {
  const [first, ...rest] = answers
  if (!first) throw new Error('No answers to choose from')
  return rest.reduce((top, a) => (score(a) > score(top) ? a : top), first)
}
