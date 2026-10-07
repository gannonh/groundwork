import type { ItemId, NonEmptyArray } from '../domain/types.ts'
import type { ChoiceAnswer, ChoiceSpec, Judge, Question } from '../judge/types.ts'
import { mostConfident } from './detect.ts'
import { STATE_TOKEN_LIMIT, chunkSentences, renderState, type Sentence } from './state.ts'

export const QUOTE_KEY = 'quote'

/** ADR 0004: a Jev Choice allows at most 255 options. */
export const MAX_CHOICE_OPTIONS = 255

export type Quote = {
  /** The sentence that carries the mention. */
  readonly ordinal: number
  readonly answer: ChoiceAnswer
}

/** A Choice over sentence numbers picks the sentence that carries the mention. */
export async function quote(judge: Judge, itemId: ItemId, sentences: NonEmptyArray<Sentence>): Promise<Quote> {
  const answers = await Promise.all(
    chunkSentences(sentences, STATE_TOKEN_LIMIT, MAX_CHOICE_OPTIONS).map(async (chunk) => {
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
