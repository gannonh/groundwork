import { isNonEmpty, type NonEmptyArray, type RedactedText } from '../domain/types.ts'

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
 * Splits an item into consecutive runs of sentences that each fit in one request and hold at most `maxSentences`
 * sentences. A run keeps the item's own sentence numbers. A single sentence longer than the limit is split across
 * runs, each piece under the sentence's own number, so no text is dropped and a quote still names a real sentence.
 * The pieces of one sentence never share a run, so a Choice over a run's numbers never repeats a number.
 */
export function chunkSentences(
  sentences: NonEmptyArray<Sentence>,
  limitTokens = STATE_TOKEN_LIMIT,
  maxSentences = Infinity,
): NonEmptyArray<NonEmptyArray<Sentence>> {
  const limitChars = limitTokens * CHARS_PER_TOKEN
  const chunks: Sentence[][] = []
  let size = 0
  for (const sentence of sentences.flatMap((s) => splitToFit(s, limitChars))) {
    const cost = renderState([sentence]).length + 1
    const last = chunks.at(-1)
    if (last && last.length < maxSentences && size + cost <= limitChars) {
      last.push(sentence)
      size += cost
    } else {
      chunks.push([sentence])
      size = cost
    }
  }
  return chunks as unknown as NonEmptyArray<NonEmptyArray<Sentence>>
}

/** The sentence as pieces that each render within the limit, or the sentence itself when it fits. */
function splitToFit(sentence: Sentence, limitChars: number): Sentence[] {
  const room = Math.max(1, limitChars - renderState([{ ...sentence, text: '' as RedactedText }]).length - 1)
  if (sentence.text.length <= room) return [sentence]
  const pieces: Sentence[] = []
  for (let start = 0; start < sentence.text.length; start += room) {
    pieces.push({ ...sentence, text: sentence.text.slice(start, start + room) as RedactedText })
  }
  return pieces
}

/**
 * The states that place the sentence numbered `ordinal`: that sentence with `context` neighbours on each side when
 * they fit in one request, else the sentence alone, split into pieces when it alone is too long. Neighbours go first
 * because they only help read the quote.
 */
export function placementStates(
  sentences: NonEmptyArray<Sentence>,
  ordinal: number,
  context: number,
  limitTokens = STATE_TOKEN_LIMIT,
): NonEmptyArray<NonEmptyArray<Sentence>> {
  const around = sentences.filter((s) => Math.abs(s.ordinal - ordinal) <= context)
  if (isNonEmpty(around) && estimateTokens(renderState(around)) <= limitTokens) return [around]
  const quoted = sentences.filter((s) => s.ordinal === ordinal)
  if (!isNonEmpty(quoted)) throw new Error(`Sentence ${String(ordinal)} is not in the item`)
  return chunkSentences(quoted, limitTokens)
}
