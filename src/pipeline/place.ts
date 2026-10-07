import { isLowConfidence } from '../domain/triage.ts'
import { NONE_OF_THESE, isNonEmpty, toConfidence, type Confidence, type OpportunityId, type RedactedText, type ItemId, type NonEmptyArray } from '../domain/types.ts'
import type { ChoiceAnswer, ChoiceSpec, Judge, Question } from '../judge/types.ts'

/** The tree the judge walks, one level per request: outcomes, then the problems under the outcomes it keeps. */
export type PlaceTree = readonly {
  readonly id: OpportunityId
  readonly title: string
  readonly problems: readonly { readonly id: OpportunityId; readonly title: string }[]
}[]

/** Branches kept after the outcome level. Uncalibrated until triage labels exist (ADR 0004). */
export const BEAM = 2
export const PLACE_OUTCOME_KEY = 'place_outcome'
export const placeProblemKey = (outcomeTitle: string) => `place_problem:${outcomeTitle}`

export type StoredPlaceAnswer = { readonly questionKey: string; readonly answer: ChoiceAnswer }

export type PlaceResult =
  | {
      readonly kind: 'placed'
      readonly opportunityId: OpportunityId
      /** P(outcome) x P(problem | outcome): the probability of the whole path. */
      readonly confidence: Confidence
      /** 'triage' when the confidence is below the pack's place_confidence. */
      readonly routing: 'placed' | 'triage'
      /** The problem-level answer that placed the mention. */
      readonly leaf: string
      readonly answers: readonly StoredPlaceAnswer[]
    }
  /** The judge chose "none" at some level, so the mention waits for a proposed opportunity. */
  | { readonly kind: 'unplaced'; readonly answers: readonly StoredPlaceAnswer[] }

type Path = { readonly score: number; readonly problem: { readonly id: OpportunityId } | null; readonly leaf: string }

/**
 * Places one mention: a Choice over the outcomes plus "none", then a Choice over each of the top BEAM outcomes'
 * problems plus "none". The mention lands on the highest-probability path, and on no node when a "none" path wins.
 */
export async function placeMention(
  judge: Judge,
  state: { readonly itemId: ItemId; readonly text: RedactedText },
  tree: PlaceTree,
  placeConfidence: number,
): Promise<PlaceResult> {
  const outcomeQuestion: Question<ChoiceSpec> = {
    key: PLACE_OUTCOME_KEY,
    type: 'choice',
    instructions: "Which outcome does the customer's problem belong to?",
    options: [...tree.map((o) => o.title), NONE_OF_THESE] as unknown as NonEmptyArray<string>,
  }
  const [outcomeAnswer] = await judge.answer(state, [outcomeQuestion] as const)
  const answers: StoredPlaceAnswer[] = [{ questionKey: outcomeQuestion.key, answer: outcomeAnswer }]
  const p1 = (title: string) => outcomeAnswer.probabilities[title] ?? 0

  const kept = tree
    .filter((o) => o.problems.length > 0)
    .map((outcome, order) => ({ outcome, order }))
    .sort((a, b) => p1(b.outcome.title) - p1(a.outcome.title) || a.order - b.order)
    .slice(0, BEAM)
    .map(({ outcome }) => outcome)

  // Every placed path scores at most P(its outcome), so a "none" at least that likely settles it without a second request.
  const top = kept[0]
  if (!top || (outcomeAnswer.probabilities[NONE_OF_THESE] ?? 0) >= p1(top.title)) return { kind: 'unplaced', answers }

  const problemQuestions = kept.map(
    (outcome): Question<ChoiceSpec> => ({
      key: placeProblemKey(outcome.title),
      type: 'choice',
      instructions: `Which problem under "${outcome.title}" does the customer describe?`,
      options: [...outcome.problems.map((p) => p.title), NONE_OF_THESE] as unknown as NonEmptyArray<string>,
    }),
  )
  if (!isNonEmpty(problemQuestions)) return { kind: 'unplaced', answers }
  const problemAnswers = await judge.answer(state, problemQuestions)

  const paths: Path[] = [{ score: outcomeAnswer.probabilities[NONE_OF_THESE] ?? 0, problem: null, leaf: PLACE_OUTCOME_KEY }]
  kept.forEach((outcome, i) => {
    const question = problemQuestions[i]
    const answer = problemAnswers[i]
    if (!question || !answer) return
    answers.push({ questionKey: question.key, answer })
    paths.push({ score: p1(outcome.title) * (answer.probabilities[NONE_OF_THESE] ?? 0), problem: null, leaf: question.key })
    for (const problem of outcome.problems) {
      paths.push({ score: p1(outcome.title) * (answer.probabilities[problem.title] ?? 0), problem, leaf: question.key })
    }
  })

  // The earlier path wins a tie, and the "none" paths come first, so doubt never places a mention.
  const winner = paths.reduce((best, path) => (path.score > best.score ? path : best))
  if (!winner.problem) return { kind: 'unplaced', answers }
  const confidence = toConfidence(Math.min(1, winner.score))
  return {
    kind: 'placed',
    opportunityId: winner.problem.id,
    confidence,
    routing: isLowConfidence(confidence, placeConfidence) ? 'triage' : 'placed',
    leaf: winner.leaf,
    answers,
  }
}
