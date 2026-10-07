import { createHash } from 'node:crypto'
import type { Question } from './types.ts'

/**
 * The key a recorded answer is stored under: a hash of the pack version, the redacted text the judge reads, and the
 * question, whose identity covers its type, instructions, and options. A different pack version, text, or option list
 * is a different key, so a recording can never answer a question it was not recorded for.
 */
export function answerKey(packVersion: string, stateText: string, question: Question): string {
  // Levels run in order, but the order of a Choice's options carries no meaning.
  const choices = question.type === 'noul' ? null : question.type === 'score' ? question.levels : [...question.options].sort()
  const identity = [question.key, question.type, question.instructions ?? null, choices]
  return createHash('sha256').update(JSON.stringify([packVersion, stateText, identity])).digest('hex')
}
