import { z } from 'zod'
import type { NonEmptyArray } from '../../domain/types.ts'
import { adapt } from '../adapters.ts'
import { answerKey } from '../key.ts'
import { JudgeError, type AnswerFor, type Judge, type JudgeState, type Question } from '../types.ts'

const line = z.strictObject({
  key: z.string().regex(/^[0-9a-f]{64}$/),
  /** For a reader of the file. The lookup never uses it. */
  question: z.string(),
  model: z.string(),
  raw: z.unknown(),
})
export type RecordedLine = z.infer<typeof line>

/** Recorded answers by `answerKey`. */
export type Recording = ReadonlyMap<string, RecordedLine>

/** Parses a JSONL recording. A bad line fails with its line number, and one key recorded twice must agree. */
export function parseRecording(jsonl: string): Recording {
  const recording = new Map<string, RecordedLine>()
  jsonl.split('\n').forEach((text, index) => {
    if (text.trim() === '') return
    let parsed: RecordedLine
    try {
      parsed = line.parse(JSON.parse(text))
    } catch (error) {
      throw new Error(`Recording line ${String(index + 1)} is invalid: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    const seen = recording.get(parsed.key)
    if (seen && JSON.stringify(seen.raw) !== JSON.stringify(parsed.raw)) {
      throw new Error(`Recording line ${String(index + 1)} repeats key ${parsed.key} with a different answer`)
    }
    recording.set(parsed.key, parsed)
  })
  return recording
}

export function serializeLine(recorded: RecordedLine): string {
  return JSON.stringify(recorded)
}

export type RecordedJudgeOptions = {
  readonly packVersion: string
  /** The pack's pinned model. A recording made by another model is refused. */
  readonly model: string
  /** Waits this long per request, so a run takes the time a live backend would. For checks that interrupt a run. */
  readonly delayMs?: number
}

/** Replays answers instead of asking a model, so a run costs nothing and gives the same result every time. */
export function createRecordedJudge(recording: Recording, options: RecordedJudgeOptions): Judge {
  return {
    provenance: { backend: 'recorded', modelVersion: options.model },
    async answer<const Qs extends NonEmptyArray<Question>>(state: JudgeState, questions: Qs) {
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
      const answers = questions.map((question) => {
        const key = answerKey(options.packVersion, state.text, question)
        const recorded = recording.get(key)
        if (!recorded) {
          throw new JudgeError(
            state.itemId,
            `No recorded answer for item ${state.itemId}, question "${question.key}" (key ${key.slice(0, 12)}) under pack ${options.packVersion}.`,
          )
        }
        if (recorded.model !== options.model) {
          throw new JudgeError(
            state.itemId,
            `The recorded answer for item ${state.itemId}, question "${question.key}" came from ${recorded.model}, but the pack pins ${options.model}.`,
          )
        }
        try {
          return adapt(question, recorded.raw)
        } catch (error) {
          const why = error instanceof Error ? error.message : String(error)
          throw new JudgeError(state.itemId, `The recorded answer for item ${state.itemId}, question "${question.key}" is malformed: ${why}`)
        }
      })
      return answers as unknown as { readonly [K in keyof Qs]: AnswerFor<Qs[K]> }
    },
  }
}
