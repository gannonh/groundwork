const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

export type SentenceSlice<T extends string = string> = { readonly text: T; readonly start: number; readonly end: number }

/** Splits text into trimmed sentences with their character range in the original. Shared by import and the seed. */
export function splitSentences<T extends string>(text: T): readonly SentenceSlice<T>[] {
  return [...segmenter.segment(text)].flatMap(({ segment, index }) => {
    const trimmed = segment.trim()
    if (!trimmed) return []
    const start = index + segment.length - segment.trimStart().length
    return [{ text: trimmed as T, start, end: start + trimmed.length }]
  })
}
