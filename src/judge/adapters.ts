// One adapter per question type (ADR 0004). Each parses a backend's raw response for that type and returns the contract's
// answer, so no other code reads a backend's wire shape.
import { z } from 'zod'
import { toConfidence } from '../domain/types.ts'
import type { AnswerFor, ChoiceAnswer, ChoiceSpec, NoulAnswer, NoulSpec, Question, QuestionType, ScoreAnswer, ScoreSpec } from './types.ts'

const probability = z.number().min(0).max(1)

/** A Noul returns only P(yes). */
export const noulRaw = z.strictObject({ p_yes: probability })
/** A Choice or Score returns a probability per option and a confidence. */
export const distributionRaw = z.strictObject({ probabilities: z.record(z.string(), probability), confidence: probability })

export type NoulRaw = z.infer<typeof noulRaw>
export type DistributionRaw = z.infer<typeof distributionRaw>

const SUM_TOLERANCE = 0.02

/** The wire shape a backend must return for a question, so a recorder can check what it writes. */
export function rawSchemaFor(type: QuestionType): z.ZodType {
  return type === 'noul' ? noulRaw : distributionRaw
}

function adaptNoul(_question: Question<NoulSpec>, raw: unknown): NoulAnswer {
  const { p_yes } = noulRaw.parse(raw)
  // A Noul has no confidence field, so it is derived from how far P(yes) is from 0.5, scaled to [0, 1].
  return {
    value: { type: 'noul', yes: p_yes },
    probabilities: { yes: p_yes, no: 1 - p_yes },
    confidence: toConfidence(Math.abs(p_yes - 0.5) * 2),
  }
}

function distribution(question: Question<ScoreSpec | ChoiceSpec>, raw: unknown) {
  const { probabilities, confidence } = distributionRaw.parse(raw)
  const names: readonly string[] = question.type === 'score' ? question.levels : question.options
  const unknown = Object.keys(probabilities).find((name) => !names.includes(name))
  if (unknown !== undefined) throw new Error(`Answer to "${question.key}" has an option the question does not: "${unknown}"`)
  const complete: Record<string, number> = Object.fromEntries(names.map((name) => [name, probabilities[name] ?? 0]))
  const sum = Object.values(complete).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > SUM_TOLERANCE) throw new Error(`Answer to "${question.key}" has probabilities that sum to ${String(sum)}, not 1`)
  // Ties go to the earlier option, so an answer never depends on object key order.
  const best = names.reduce((top, name) => ((complete[name] ?? 0) > (complete[top] ?? 0) ? name : top), names[0] ?? '')
  return { complete, best, confidence: toConfidence(confidence) }
}

function adaptScore(question: Question<ScoreSpec>, raw: unknown): ScoreAnswer {
  const { complete, best, confidence } = distribution(question, raw)
  return { value: { type: 'score', level: question.levels.indexOf(best) }, probabilities: complete, confidence }
}

function adaptChoice(question: Question<ChoiceSpec>, raw: unknown): ChoiceAnswer {
  const { complete, best, confidence } = distribution(question, raw)
  return { value: { type: 'choice', option: best }, probabilities: complete, confidence }
}

export function adapt<Q extends Question>(question: Q, raw: unknown): AnswerFor<Q>
export function adapt(question: Question, raw: unknown): NoulAnswer | ScoreAnswer | ChoiceAnswer {
  switch (question.type) {
    case 'noul':
      return adaptNoul(question, raw)
    case 'score':
      return adaptScore(question, raw)
    case 'choice':
      return adaptChoice(question, raw)
  }
}
