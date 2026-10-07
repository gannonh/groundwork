import { z } from 'zod'
import { NONE_OF_THESE, type NonEmptyArray } from '../domain/types.ts'
import type { Parsed } from '../ingest/csv.ts'
import { parseYamlWith } from './parse.ts'

/** A starter tree: the outcomes and problems a workspace with no tree begins with. */
export type Template = {
  readonly template: string
  readonly outcomes: NonEmptyArray<{
    readonly title: string
    readonly problems: NonEmptyArray<{ readonly title: string }>
  }>
}

const title = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value !== NONE_OF_THESE, `must not be "${NONE_OF_THESE}"`)
const unique = (titles: readonly string[]) => new Set(titles).size === titles.length

// The judge picks among sibling titles, so a repeated title would make an answer ambiguous.
const problem = z.strictObject({ title })
const outcome = z.strictObject({
  title,
  problems: z
    .tuple([problem], problem)
    .refine((problems) => unique(problems.map((p) => p.title)), 'problem titles must be unique within an outcome'),
})

const templateSchema: z.ZodType<Template> = z
  .strictObject({ template: z.string().trim().min(1), outcomes: z.tuple([outcome], outcome) })
  .refine((t) => unique(t.outcomes.map((o) => o.title)), { message: 'outcome titles must be unique', path: ['outcomes'] })

export function parseTemplate(yaml: string): Parsed<Template> {
  return parseYamlWith(yaml, templateSchema, 'The template')
}
