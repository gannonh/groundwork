import type { CountedMention } from './metrics.ts'
import type { Account, AccountId, RedactedText } from './types.ts'

export const CONFIDENT_QUOTES = 3
export const MAX_QUOTES = 4

/**
 * Which quotes a detail shows: up to CONFIDENT_QUOTES confident voices, one per account by ARR desc, then
 * low-confidence voices from accounts not yet shown, by ARR desc, up to MAX_QUOTES. A voice is an account's newest
 * mention of that confidence. When every low-confidence mention comes from a shown account, the top one by ARR still
 * gets the spare slot. So whenever a mention needs review, at least one returned quote has lowConfidence set.
 */
export function selectQuotes(
  evidence: readonly CountedMention[],
  accounts: ReadonlyMap<AccountId, Account>,
): readonly CountedMention[] {
  const arrOf = (m: CountedMention) => (m.accountId ? (accounts.get(m.accountId)?.arr ?? 0) : 0)
  const voiceOf = (m: CountedMention) => m.accountId ?? m.mentionId
  const voices = (mentions: readonly CountedMention[]) => {
    const newest = new Map<string, CountedMention>()
    // Evidence is newest first, so the first mention seen per account is its newest.
    for (const m of mentions) if (!newest.has(voiceOf(m))) newest.set(voiceOf(m), m)
    return [...newest.values()].sort((a, b) => arrOf(b) - arrOf(a))
  }

  const confident = voices(evidence.filter((m) => m.lowConfidence === null)).slice(0, CONFIDENT_QUOTES)
  const low = voices(evidence.filter((m) => m.lowConfidence !== null))
  const shown = new Set(confident.map(voiceOf))
  const unshownLow = low.filter((m) => !shown.has(voiceOf(m))).slice(0, MAX_QUOTES - confident.length)
  if (unshownLow.length > 0) return [...confident, ...unshownLow]

  // Every low-confidence mention comes from a shown account. CONFIDENT_QUOTES < MAX_QUOTES leaves it a slot.
  return [...confident, ...low.slice(0, 1)]
}

export type TopAccount = { readonly account: Account; readonly mentions: number; readonly allNeedReview: boolean }

/** Distinct accounts by ARR desc, then name. */
export function topAccounts(
  evidence: readonly CountedMention[],
  accounts: ReadonlyMap<AccountId, Account>,
  limit: number,
): readonly TopAccount[] {
  const tally = new Map<AccountId, { mentions: number; allNeedReview: boolean }>()
  for (const mention of evidence) {
    if (!mention.accountId) continue
    const seen = tally.get(mention.accountId) ?? { mentions: 0, allNeedReview: true }
    tally.set(mention.accountId, {
      mentions: seen.mentions + 1,
      allNeedReview: seen.allNeedReview && mention.lowConfidence !== null,
    })
  }
  return [...tally]
    .flatMap(([id, t]) => {
      const account = accounts.get(id)
      return account ? [{ account, ...t }] : []
    })
    .sort((a, b) => b.account.arr - a.account.arr || a.account.name.localeCompare(b.account.name))
    .slice(0, limit)
}

/** Inclusive sentence ordinals, start <= end. */
export type SentenceSpan = { readonly start: number; readonly end: number }
export type QuoteText = {
  readonly leadingEllipsis: boolean
  readonly sentences: readonly { readonly text: RedactedText; readonly highlighted: boolean }[]
  readonly trailingEllipsis: boolean
}

/** The span plus `context` sentences on each side, with the span marked. */
export function excerpt(sentences: readonly RedactedText[], span: SentenceSpan, context = 1): QuoteText {
  const from = Math.max(0, span.start - context)
  const to = Math.min(sentences.length - 1, span.end + context)
  return {
    leadingEllipsis: from > 0,
    sentences: sentences
      .slice(from, to + 1)
      .map((text, i) => ({ text, highlighted: from + i >= span.start && from + i <= span.end })),
    trailingEllipsis: to < sentences.length - 1,
  }
}
