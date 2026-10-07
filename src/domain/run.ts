import type { ItemId } from './types.ts'

/** PRD cost model: a mention is quoted once and placed in two requests, and 0.8 mentions per item is the planning figure. */
export const EXPECTED_MENTIONS_PER_ITEM = 0.8
export const REQUESTS_PER_MENTION = 3
/** Each request repeats the question text on top of the state. */
const QUESTION_TOKENS_PER_REQUEST = 120
const CHARS_PER_TOKEN = 4
/** USD per million input tokens by pinned model, from docs/adr/0004-judge-contract.md. */
const PRICES: Readonly<Record<string, number>> = { 'jev-1.13.0': 0.042 }

export type RunEstimate = {
  readonly items: number
  readonly requests: number
  /** Null when the model has no known price. */
  readonly usd: number | null
}

/** The request count and cost shown before a run starts. An estimate: the real mention count is known only afterward. */
export function estimateRun(input: { readonly items: number; readonly characters: number; readonly model: string }): RunEstimate {
  const requestsPerItem = 1 + EXPECTED_MENTIONS_PER_ITEM * REQUESTS_PER_MENTION
  const requests = Math.round(input.items * requestsPerItem)
  const itemTokens = input.items === 0 ? 0 : input.characters / CHARS_PER_TOKEN / input.items
  const tokens = requests * (itemTokens + QUESTION_TOKENS_PER_REQUEST)
  const price = PRICES[input.model]
  return { items: input.items, requests, usd: price === undefined ? null : (tokens * price) / 1_000_000 }
}

export type RunFailure = { readonly itemId: ItemId; readonly message: string }

/** What the source page knows about a run. `run` is null until someone starts it. */
export type RunFacts = {
  /** Every item the source has. */
  readonly items: number
  readonly characters: number
  readonly model: string
  readonly run: {
    /** Items the latest start covered. Items imported after it wait for the next start. */
    readonly started: number
    readonly judged: number
    readonly failed: number
    readonly failures: readonly RunFailure[]
  } | null
}

export type RunState =
  /** `fresh` is false when an earlier start finished and the estimate covers only the items imported since. */
  | ({ readonly kind: 'ready'; readonly fresh: boolean } & RunEstimate)
  | { readonly kind: 'running'; readonly items: number; readonly judged: number; readonly failed: number; readonly percent: number }
  | { readonly kind: 'done'; readonly items: number; readonly judged: number; readonly failed: number; readonly failures: readonly RunFailure[] }

/** A run is done when every item has finished, whether it was judged or failed. */
export function describeRun(facts: RunFacts): RunState {
  const { run, items } = facts
  const estimate = (count: number) =>
    estimateRun({ items: count, characters: items === 0 ? 0 : (facts.characters * count) / items, model: facts.model })
  if (!run) return { kind: 'ready', fresh: true, ...estimate(items) }
  const finished = run.judged + run.failed
  if (finished < run.started) {
    return { kind: 'running', items: run.started, judged: run.judged, failed: run.failed, percent: Math.floor((100 * finished) / run.started) }
  }
  if (finished < items) return { kind: 'ready', fresh: false, ...estimate(items - finished) }
  return { kind: 'done', items, judged: run.judged, failed: run.failed, failures: run.failures }
}
