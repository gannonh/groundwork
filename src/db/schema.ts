import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  ITEM_KINDS,
  type AccountId,
  type Confidence,
  type ItemId,
  type MentionId,
  type OpportunityId,
  type PackId,
  type RawText,
  type RedactedText,
  type SourceId,
  type Usd,
  type WorkspaceId,
} from '../domain/types.ts'
import type { ColumnMapping } from '../ingest/mapping.ts'

const tz = { withTimezone: true } as const
const pk = <T extends string>() => uuid('id').$type<T>().primaryKey().default(sql`uuidv7()`)
const createdAt = () => timestamp('created_at', tz).notNull().defaultNow()
/** A model name and a semantic version, such as 'jev-1.13.0'. Rejects 'jev-latest' and bare names. */
const PINNED_MODEL = String.raw`'^[a-z][a-z0-9-]*-[0-9]+\.[0-9]+\.[0-9]+$'`

export const opportunityKind = pgEnum('opportunity_kind', ['outcome', 'problem', 'solution'])
export const itemKind = pgEnum('item_kind', ITEM_KINDS)
export const sourceKind = pgEnum('source_kind', ['upload'])
export const speakerRole = pgEnum('speaker_role', ['end_user', 'admin', 'buyer', 'executive', 'unknown'])
export const judgeBackend = pgEnum('judge_backend', ['recorded', 'jev', 'llm'])
export const tracker = pgEnum('tracker', ['linear'])
export const linkTarget = pgEnum('link_target', ['issue', 'project'])

/** Answer payloads. Written only by the judge adapters after parsing a backend response. */
export type JudgeValue =
  | { readonly type: 'noul'; readonly yes: number }
  | { readonly type: 'score'; readonly level: number }
  | { readonly type: 'choice'; readonly option: string }
  | { readonly type: 'span'; readonly start: number; readonly end: number }
/** Parsed pack YAML. The pack slice replaces this with the type derived from its parser. */
export type PackDefinition = Readonly<Record<string, unknown>>

export const workspace = pgTable('workspace', {
  id: pk<WorkspaceId>(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
})

/** One immutable version of a question pack. A threshold change is a new version. */
export const pack = pgTable(
  'pack',
  {
    id: pk<PackId>(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: text('version').notNull(),
    judgeModel: text('judge_model').notNull(),
    detectThreshold: real('detect_threshold').$type<Confidence>().notNull(),
    placeThreshold: real('place_threshold').$type<Confidence>().notNull(),
    definition: jsonb('definition').$type<PackDefinition>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pack_version_key').on(t.workspaceId, t.name, t.version),
    check('pack_judge_model_pinned', sql`${t.judgeModel} ~ ${sql.raw(PINNED_MODEL)}`),
    check(
      'pack_thresholds_open_unit',
      sql`${t.detectThreshold} > 0 and ${t.detectThreshold} < 1 and ${t.placeThreshold} > 0 and ${t.placeThreshold} < 1`,
    ),
  ],
)

export const account = pgTable(
  'account',
  {
    id: pk<AccountId>(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    arr: bigint('arr', { mode: 'number' }).$type<Usd>().notNull(),
    plan: text('plan'),
    segment: text('segment'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('account_external_key').on(t.workspaceId, t.externalId),
    check('account_arr_nonnegative', sql`${t.arr} >= 0`),
  ],
)

export const source = pgTable(
  'source',
  {
    id: pk<SourceId>(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    kind: sourceKind('kind').notNull(),
    name: text('name').notNull(),
    itemKind: itemKind('item_kind').notNull(),
    shape: text('shape'),
    fieldMapping: jsonb('field_mapping').$type<ColumnMapping>(),
    cursor: text('cursor'),
    createdAt: createdAt(),
  },
  (t) => [unique('source_shape_key').on(t.workspaceId, t.shape)],
)

export const item = pgTable(
  'item',
  {
    id: pk<ItemId>(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .$type<SourceId>()
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    // Re-uploading the same export converges on this key.
    externalId: text('external_id').notNull(),
    body: text('body').$type<RawText>().notNull(),
    occurredAt: timestamp('occurred_at', tz).notNull(),
    accountRef: text('account_ref'),
    accountId: uuid('account_id')
      .$type<AccountId>()
      .references(() => account.id, { onDelete: 'set null' }),
    authorRole: speakerRole('author_role'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('item_external_key').on(t.sourceId, t.externalId),
    index('item_workspace_date_idx').on(t.workspaceId, t.occurredAt),
  ],
)

/** Numbered sentences of an item, already redacted. The only item text that reaches a judge or a browser. */
export const sentence = pgTable(
  'sentence',
  {
    itemId: uuid('item_id')
      .$type<ItemId>()
      .notNull()
      .references(() => item.id, { onDelete: 'cascade' }),
    ordinal: smallint('ordinal').notNull(),
    text: text('text').$type<RedactedText>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.ordinal] }), check('sentence_ordinal_nonnegative', sql`${t.ordinal} >= 0`)],
)

export const opportunity = pgTable(
  'opportunity',
  {
    id: pk<OpportunityId>(),
    workspaceId: uuid('workspace_id')
      .$type<WorkspaceId>()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    kind: opportunityKind('kind').notNull(),
    parentId: uuid('parent_id').$type<OpportunityId>(),
    // Exists only so the parent FK can check the parent's kind.
    parentKind: opportunityKind('parent_kind'),
    title: text('title').notNull(),
    description: text('description'),
    owner: text('owner'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('opportunity_id_kind_workspace_key').on(t.id, t.kind, t.workspaceId),
    // Checks the parent's kind and workspace. Outcomes have a null parent, which MATCH SIMPLE skips.
    foreignKey({
      name: 'opportunity_parent_fk',
      columns: [t.parentId, t.parentKind, t.workspaceId],
      foreignColumns: [t.id, t.kind, t.workspaceId],
    }),
    check(
      'opportunity_tree_shape',
      sql`(${t.kind} = 'outcome' and ${t.parentId} is null and ${t.parentKind} is null) or (${t.kind} = 'problem' and ${t.parentId} is not null and ${t.parentKind} = 'outcome') or (${t.kind} = 'solution' and ${t.parentId} is not null and ${t.parentKind} = 'problem')`,
    ),
    index('opportunity_workspace_kind_idx').on(t.workspaceId, t.kind),
    index('opportunity_parent_idx').on(t.parentId),
  ],
)

/** Every judge answer, keyed so a rerun of (item, pack version) inserts nothing new. */
export const judgeAnswer = pgTable(
  'judge_answer',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    packId: uuid('pack_id')
      .$type<PackId>()
      .notNull()
      .references(() => pack.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .$type<ItemId>()
      .notNull()
      .references(() => item.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    // '' for an item-level question, 'm0' for mention 0.
    subject: text('subject').notNull().default(''),
    value: jsonb('value').$type<JudgeValue>().notNull(),
    probabilities: jsonb('probabilities').$type<Readonly<Record<string, number>>>().notNull(),
    confidence: real('confidence').$type<Confidence>().notNull(),
    backend: judgeBackend('backend').notNull(),
    modelVersion: text('model_version').notNull(),
    askedAt: timestamp('asked_at', tz).notNull().defaultNow(),
  },
  (t) => [
    unique('judge_answer_key').on(t.packId, t.itemId, t.questionKey, t.subject),
    index('judge_answer_question_idx').on(t.packId, t.questionKey),
    check('judge_answer_model_pinned', sql`${t.modelVersion} ~ ${sql.raw(PINNED_MODEL)}`),
    check('judge_answer_confidence_unit', sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
  ],
)

/** A contiguous run of sentences in one item that states a problem or request, under one pack version. */
export const mention = pgTable(
  'mention',
  {
    id: pk<MentionId>(),
    packId: uuid('pack_id')
      .$type<PackId>()
      .notNull()
      .references(() => pack.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .$type<ItemId>()
      .notNull()
      .references(() => item.id, { onDelete: 'cascade' }),
    // Index in the detect answer; a rerun upserts on it.
    ordinal: smallint('ordinal').notNull(),
    sentenceStart: smallint('sentence_start').notNull(),
    sentenceEnd: smallint('sentence_end').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('mention_key').on(t.packId, t.itemId, t.ordinal),
    foreignKey({
      name: 'mention_start_fk',
      columns: [t.itemId, t.sentenceStart],
      foreignColumns: [sentence.itemId, sentence.ordinal],
    }),
    foreignKey({
      name: 'mention_end_fk',
      columns: [t.itemId, t.sentenceEnd],
      foreignColumns: [sentence.itemId, sentence.ordinal],
    }),
    check('mention_span_ordered', sql`${t.sentenceStart} <= ${t.sentenceEnd}`),
  ],
)

/**
 * Judge-owned: a mention on its deepest opportunity. Ancestors count it by rollup, so ancestor rows are never
 * written. Human triage (R11) gets its own append-only log, merged at read, and never writes here.
 */
export const placement = pgTable(
  'placement',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    mentionId: uuid('mention_id')
      .$type<MentionId>()
      .notNull()
      .references(() => mention.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .$type<OpportunityId>()
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    judgeAnswerId: uuid('judge_answer_id')
      .notNull()
      .references(() => judgeAnswer.id, { onDelete: 'cascade' }),
    confidence: real('confidence').$type<Confidence>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // A mention belongs to one pack version, so this is one placement per mention per pack version.
    unique('placement_mention_key').on(t.mentionId),
    index('placement_opportunity_idx').on(t.opportunityId),
    check('placement_confidence_unit', sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
  ],
)

export const link = pgTable(
  'link',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    opportunityId: uuid('opportunity_id')
      .$type<OpportunityId>()
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    tracker: tracker('tracker').notNull(),
    target: linkTarget('target').notNull(),
    externalId: text('external_id').notNull(),
    identifier: text('identifier').notNull(),
    url: text('url').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('link_key').on(t.opportunityId, t.tracker, t.externalId)],
)
