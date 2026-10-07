import type { ItemId, NonEmptyArray } from '../domain/types.ts'
import type { ChoiceAnswer, ChoiceSpec, Judge, Question } from '../judge/types.ts'
import { mostConfident } from './detect.ts'
import { chunkSentences, renderState, type Sentence } from './state.ts'

export const QUOTE_KEY = 'quote'

export type Quote = {
  /** The sentence that carries the mention. */
  readonly ordinal: number
  readonly answer: ChoiceAnswer
}

/** A Choice over sentence numbers picks the sentence that carries the mention. */
export async function quote(judge: Judge, itemId: ItemId, sentences: NonEmptyArray<Sentence>): Promise<Quote> {
  const answers = await Promise.all(
    chunkSentences(sentences).map(async (chunk) => {
      const question: Question<ChoiceSpec> = {
        key: QUOTE_KEY,
        type: 'choice',
        instructions: "Which sentence best states the customer's problem or request?",
        options: chunk.map((s) => String(s.ordinal)) as unknown as NonEmptyArray<string>,
      }
      const [answer] = await judge.answer({ itemId, text: renderState(chunk) }, [question] as const)
      return answer
    }),
  )
  const answer = mostConfident(answers)
  return { ordinal: Number(answer.value.option), answer }
}
