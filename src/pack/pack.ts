import { z } from 'zod'
import { PAIN_KEYS, PINNED_MODEL } from '../domain/types.ts'
import type { Parsed } from '../ingest/csv.ts'
import type { ChoiceSpec, NoulSpec, ScoreSpec } from '../judge/types.ts'
import { parseYamlWith } from './parse.ts'

/** A question pack, as its YAML file spells it. Immutable once a workspace has run it: a change is a new version. */
export type Pack = {
  readonly pack: string
  readonly version: string
  /** The pinned judge model, such as 'jev-1.13.0'. */
  readonly judge: string
  /** The pipeline reads exactly these five item-level questions. */
  readonly item_questions: {
    readonly states_problem: NoulSpec
    readonly proposes_solution: NoulSpec
    readonly workaround: NoulSpec
    readonly pain: ScoreSpec
    readonly role: ChoiceSpec
  }
  readonly thresholds: {
    /** A mention exists when P(yes) of states_problem or proposes_solution reaches this. */
    readonly detect: number
    /** A placement below this goes to triage. */
    readonly place_confidence: number
  }
}

const text = z.string().trim().min(1)
const list = z.tuple([text], text).refine((items) => new Set(items).size === items.length, 'must not repeat a value')
const threshold = z.number().gt(0).lt(1)

const noul = z.strictObject({ type: z.literal('noul'), instructions: text })
const score = z.strictObject({ type: z.literal('score'), instructions: text.optional(), levels: list })
const choice = z.strictObject({ type: z.literal('choice'), instructions: text.optional(), options: list })

const anyQuestion = z.discriminatedUnion('type', [noul, score, choice], {
  error: 'must have a type of noul, score, or choice',
})

const REQUIRED = { states_problem: 'noul', proposes_solution: 'noul', workaround: 'noul', pain: 'score', role: 'choice' } as const

const itemQuestions = z.record(z.string(), anyQuestion).transform((questions, ctx): Pack['item_questions'] => {
  for (const key of Object.keys(questions)) {
    if (!(key in REQUIRED)) ctx.issues.push({ code: 'custom', message: `${key} is not a question this pipeline reads`, input: questions })
  }
  for (const [key, type] of Object.entries(REQUIRED)) {
    if (questions[key]?.type !== type) ctx.issues.push({ code: 'custom', message: `${key} must be a ${type} question`, input: questions })
  }
  // The map reads a stored level as an index into the domain's scale, so the pack cannot reorder or extend it.
  const pain = questions.pain
  if (pain?.type === 'score' && pain.levels.join() !== PAIN_KEYS.join()) {
    ctx.issues.push({ code: 'custom', message: `pain.levels must be exactly ${PAIN_KEYS.join(', ')}, in that order`, input: questions })
  }
  return questions as unknown as Pack['item_questions']
})

const packSchema: z.ZodType<Pack> = z.strictObject({
  pack: text,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a semantic version such as 0.3.0'),
  judge: z.string().regex(PINNED_MODEL, 'must pin a model version such as jev-1.13.0, never "latest"'),
  item_questions: itemQuestions,
  thresholds: z.strictObject({ detect: threshold, place_confidence: threshold }),
})

export function parsePack(yaml: string): Parsed<Pack> {
  return parseYamlWith(yaml, packSchema, 'The pack')
}

/** Reads a pack back from the `pack.definition` column. */
export function packFromDefinition(definition: unknown): Pack {
  const parsed = packSchema.safeParse(definition)
  if (!parsed.success) throw new Error(`A stored pack definition is invalid: ${parsed.error.message}`)
  return parsed.data
}

/** Whether two packs say the same thing, whatever order their keys came in. */
export function samePack(a: Pack, b: Pack): boolean {
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)))
        : v,
    )
  return canonical(a) === canonical(b)
}
