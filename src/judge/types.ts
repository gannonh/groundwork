// The judge contract of docs/adr/0004-judge-contract.md: judge(state, questions) -> answers[{ value, probabilities, confidence }].
import type { Confidence, ItemId, JudgeValue, NonEmptyArray, RedactedText } from '../domain/types.ts'

export type NoulSpec = { readonly type: 'noul'; readonly instructions: string }
export type ScoreSpec = { readonly type: 'score'; readonly instructions?: string; readonly levels: NonEmptyArray<string> }
export type ChoiceSpec = { readonly type: 'choice'; readonly instructions?: string; readonly options: NonEmptyArray<string> }
/** What a pack file declares for one question. */
export type QuestionSpec = NoulSpec | ScoreSpec | ChoiceSpec
export type QuestionType = QuestionSpec['type']

/** A question as asked. `key` is unique within one request. */
export type Question<S extends QuestionSpec = QuestionSpec> = S & { readonly key: string }

export type JudgeBackend = 'recorded' | 'jev' | 'llm'

/** The text a request is about. `itemId` names it in errors and logs and is never part of an answer's key. */
export type JudgeState = { readonly itemId: ItemId; readonly text: RedactedText }

type AnswerOf<V extends JudgeValue> = {
  readonly value: V
  /** Over the question's options, levels, or { yes, no }. */
  readonly probabilities: Readonly<Record<string, number>>
  readonly confidence: Confidence
}
export type NoulAnswer = AnswerOf<Extract<JudgeValue, { type: 'noul' }>>
export type ScoreAnswer = AnswerOf<Extract<JudgeValue, { type: 'score' }>>
export type ChoiceAnswer = AnswerOf<Extract<JudgeValue, { type: 'choice' }>>
export type JudgeAnswer = NoulAnswer | ScoreAnswer | ChoiceAnswer

export type AnswerFor<Q extends Question> = Q extends { readonly type: 'noul' }
  ? NoulAnswer
  : Q extends { readonly type: 'score' }
    ? ScoreAnswer
    : ChoiceAnswer

/** Every answer a backend stores carries these, so a stored answer can always be traced to what produced it. */
export type Provenance = { readonly backend: JudgeBackend; readonly modelVersion: string }

export type Judge = {
  readonly provenance: Provenance
  /** One request: every question about one state, answered in order. A tuple of questions yields a tuple of answers. */
  answer<const Qs extends NonEmptyArray<Question>>(
    state: JudgeState,
    questions: Qs,
  ): Promise<{ readonly [K in keyof Qs]: AnswerFor<Qs[K]> }>
}

/** A failure that a retry cannot fix: the item fails and the rest of the run goes on. */
export class JudgeError extends Error {
  readonly itemId: ItemId
  constructor(itemId: ItemId, message: string) {
    super(message)
    this.name = 'JudgeError'
    this.itemId = itemId
  }
}
