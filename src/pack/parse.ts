import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { fail, ok, type Parsed } from '../ingest/csv.ts'

/** Parses YAML text and validates it against `schema`. The error names the first few bad fields. */
export function parseYamlWith<T>(text: string, schema: z.ZodType<T>, what: string): Parsed<T> {
  let raw: unknown
  try {
    raw = parseYaml(text)
  } catch (error) {
    return fail(`${what} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return ok(parsed.data)
  const problems = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || '(top level)'}: ${issue.message}`)
  return fail(`${what} is invalid. ${problems.join('; ')}`)
}
