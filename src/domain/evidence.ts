import type { CountedMention } from './metrics.ts'
import type { Account, AccountId, RedactedText } from './types.ts'

export const CONFIDENT_QUOTES = 3
export const MAX_QUOTES = 4

/**
 * Which quotes a detail shows. One voice per account: the account's newest confident mention, else its newest
 * low-confidence one. Confident voices by account ARR desc, at most CONFIDENT_QUOTES, then needs-review voices by
 * ARR desc up to MAX_QUOTES, so a needs-review quote is visible whenever one exists.
 */
export function selectQuotes(
  evidence: readonly CountedMention[],
  accounts: ReadonlyMap<AccountId, Account>,
): readonly CountedMention[] {
  const voices = new Map<string, CountedMention>()
  for (const mention of evidence) {
    const key = mention.accountId ?? mention.mentionId
    const current = voices.get(key)
    if (!current || (current.lowConfidence !== null && mention.lowConfidence === null)) voices.set(key, mention)
  }
  const arrOf = (m: CountedMention) => (m.accountId ? (accounts.get(m.accountId)?.arr ?? 0) : 0)
  const byArr = (list: CountedMention[]) => list.sort((a, b) => arrOf(b) - arrOf(a))
  const all = [...voices.values()]
  const confident = byArr(all.filter((m) => m.lowConfidence === null)).slice(0, CONFIDENT_QUOTES)
  const needsReview = byArr(all.filter((m) => m.lowConfidence !== null))
  return [...confident, ...needsReview].slice(0, MAX_QUOTES)
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
