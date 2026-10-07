import type { ItemId, NonEmptyArray, OpportunityId, Confidence } from '../domain/types.ts'
import type { Judge, JudgeAnswer } from '../judge/types.ts'
import type { Pack } from '../pack/pack.ts'
import { detect } from './detect.ts'
import { placeMention, type PlaceTree } from './place.ts'
import { quote, QUOTE_KEY } from './quote.ts'
import { renderState, type Sentence } from './state.ts'

export type PipelineItem = { readonly id: ItemId; readonly sentences: NonEmptyArray<Sentence> }

/** An answer to store. `subject` is '' for the item and 'm0' for its mention. */
export type JudgedAnswer = { readonly questionKey: string; readonly subject: string; readonly answer: JudgeAnswer }

/** Everything the pipeline learned about one item, ready to store in one transaction. */
export type ItemJudgement = {
  readonly answers: readonly JudgedAnswer[]
  /** One mention per item for now: the sentence that carries the problem or request. Null when none is detected. */
  readonly mention: {
    readonly ordinal: 0
    readonly sentenceStart: number
    readonly sentenceEnd: number
    readonly placement: {
      readonly opportunityId: OpportunityId
      readonly confidence: Confidence
      readonly leaf: { readonly questionKey: string; readonly subject: string }
    } | null
  } | null
}

const MENTION = 'm0'
const CONTEXT_SENTENCES = 1

/** Detect, then quote, then place. Pure given the judge: it reads and writes no database. */
export async function judgeItem(judge: Judge, pack: Pack, tree: PlaceTree, item: PipelineItem): Promise<ItemJudgement> {
  const detection = await detect(judge, item.id, item.sentences, pack)
  const answers: JudgedAnswer[] = (['states_problem', 'proposes_solution', 'workaround', 'pain', 'role'] as const).map((key) => ({
    questionKey: key,
    subject: '',
    answer: detection[key],
  }))
  if (!detection.hasMention) return { answers, mention: null }

  const quoted = await quote(judge, item.id, item.sentences)
  answers.push({ questionKey: QUOTE_KEY, subject: MENTION, answer: quoted.answer })

  const around = item.sentences.filter((s) => Math.abs(s.ordinal - quoted.ordinal) <= CONTEXT_SENTENCES)
  const placed = await placeMention(judge, { itemId: item.id, text: renderState(around) }, tree, pack.thresholds.place_confidence)
  for (const { questionKey, answer } of placed.answers) answers.push({ questionKey, subject: MENTION, answer })

  return {
    answers,
    mention: {
      ordinal: 0,
      sentenceStart: quoted.ordinal,
      sentenceEnd: quoted.ordinal,
      placement:
        placed.kind === 'placed'
          ? { opportunityId: placed.opportunityId, confidence: placed.confidence, leaf: { questionKey: placed.leaf, subject: MENTION } }
          : null,
    },
  }
}
