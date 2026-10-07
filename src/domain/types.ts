// src/domain and src/db use relative .ts imports and erasable syntax only: `node src/db/seed.ts` runs them
// under plain Node type stripping, with no path aliases.
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type PackId = Brand<string, 'PackId'>
export type SourceId = Brand<string, 'SourceId'>
export type OpportunityId = Brand<string, 'OpportunityId'>
export type AccountId = Brand<string, 'AccountId'>
export type ItemId = Brand<string, 'ItemId'>
export type MentionId = Brand<string, 'MentionId'>
export type RunId = Brand<string, 'RunId'>
/** A digest of every stored input behind a workspace's numbers. Equal snapshots show equal numbers. */
export type SnapshotId = Brand<string, 'SnapshotId'>
/** Whole US dollars. */
export type Usd = Brand<number, 'Usd'>
/** A probability in [0, 1]. */
export type Confidence = Brand<number, 'Confidence'>
/** 'YYYY-MM-DD' in UTC. Serializable, and formats the same on server and client. */
export type IsoDate = Brand<string, 'IsoDate'>
/** Text that passed redaction. The only text type a view model accepts. */
export type RedactedText = Brand<string, 'RedactedText'>
/** Imported text before redaction. Never leaves the server. */
export type RawText = Brand<string, 'RawText'>

/** A model name and a semantic version, such as 'jev-1.13.0'. Rejects 'jev-latest' and bare names. */
export const PINNED_MODEL = /^[a-z][a-z0-9-]*-[0-9]+\.[0-9]+\.[0-9]+$/

/** Answer payloads. Written only by the judge adapters after parsing a backend response. */
export type JudgeValue =
  | { readonly type: 'noul'; readonly yes: number }
  | { readonly type: 'score'; readonly level: number }
  | { readonly type: 'choice'; readonly option: string }
  | { readonly type: 'span'; readonly start: number; readonly end: number }

/** The option every placement question offers besides the tree's own nodes. */
export const NONE_OF_THESE = 'none'

/** The pain scale, mildest first. A pack's pain question must list exactly these. */
export const PAIN_KEYS = ['mild_annoyance', 'slows_work', 'blocks_work', 'deal_breaker'] as const
/** Index into PAIN_KEYS. */
export type PainLevel = 0 | 1 | 2 | 3
export const PAIN_LEVELS: readonly PainLevel[] = [0, 1, 2, 3]
export type SpeakerRole = 'end_user' | 'admin' | 'buyer' | 'executive' | 'unknown'
export const ITEM_KINDS = ['ticket', 'call', 'survey_response', 'review', 'interview'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]
export type NonEmptyArray<T> = readonly [T, ...T[]]

export type Opportunity =
  | { readonly id: OpportunityId; readonly kind: 'outcome'; readonly parentId: null; readonly title: string }
  | {
      readonly id: OpportunityId
      readonly kind: 'problem' | 'solution'
      readonly parentId: OpportunityId
      readonly title: string
    }

export type Account = { readonly id: AccountId; readonly name: string; readonly arr: Usd }
/** `pain` is the item-level judge Score answer for the pack being read, if any. */
export type Item = {
  readonly id: ItemId
  readonly sourceId: SourceId
  readonly accountId: AccountId | null
  readonly role: SpeakerRole | null
  readonly occurredAt: Date
  readonly pain: PainLevel | null
}
/** A judge placement of one mention on its deepest node. */
export type Placement = {
  readonly mentionId: MentionId
  readonly itemId: ItemId
  readonly opportunityId: OpportunityId
  readonly confidence: Confidence
}

export function toConfidence(value: number): Confidence {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`A confidence is in [0, 1], got ${String(value)}`)
  return value as Confidence
}

export function toPainLevel(level: number): PainLevel | null {
  return PAIN_LEVELS.find((p) => p === level) ?? null
}

export function isNonEmpty<T>(items: readonly T[]): items is NonEmptyArray<T> {
  return items.length > 0
}
