import type { NonEmptyArray, RedactedText } from '../domain/types.ts'

/** ADR 0004: a Jev request carries at most 32k tokens of state. */
export const STATE_TOKEN_LIMIT = 32_000
const CHARS_PER_TOKEN = 4

export type Sentence = { readonly ordinal: number; readonly text: RedactedText }

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN)

/** The numbered text a judge reads, so it can name a sentence by its number. */
export function renderState(sentences: readonly Sentence[]): RedactedText {
  return sentences.map((s) => `${String(s.ordinal)}: ${s.text}`).join('\n') as RedactedText
}

/**
 * Splits an item into consecutive runs of sentences that each fit in one request. A run keeps the item's own
 * sentence numbers. A single sentence longer than the limit is cut to fit, because it cannot be split further.
 */
export function chunkSentences(
  sentences: NonEmptyArray<Sentence>,
  limitTokens = STATE_TOKEN_LIMIT,
): NonEmptyArray<NonEmptyArray<Sentence>> {
  const limitChars = limitTokens * CHARS_PER_TOKEN
  const chunks: Sentence[][] = []
  let size = 0
  for (const sentence of sentences) {
    const fitted = sentence.text.length > limitChars ? { ...sentence, text: sentence.text.slice(0, limitChars) as RedactedText } : sentence
    const cost = renderState([fitted]).length + 1
    const last = chunks.at(-1)
    if (last && size + cost <= limitChars) {
      last.push(fitted)
      size += cost
    } else {
      chunks.push([fitted])
      size = cost
    }
  }
  return chunks as unknown as NonEmptyArray<NonEmptyArray<Sentence>>
}
