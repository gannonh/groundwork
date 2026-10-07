import * as NodeFs from 'node:fs'
import type { Parsed } from '../ingest/csv.ts'
import { fail } from '../ingest/csv.ts'
import { parsePack, type Pack } from '../pack/pack.ts'
import { parseTemplate, type Template } from '../pack/template.ts'

/** Relative to the working directory, which is the repository root for `pnpm dev`, `pnpm start`, and `pnpm worker`. */
export const PACK_FILE = 'packs/product-insights.yaml'
export const TEMPLATE_FILE = 'templates/b2b-saas.yaml'

function read<T>(file: string, parse: (text: string) => Parsed<T>): Parsed<T> {
  let text: string
  try {
    text = NodeFs.readFileSync(file, 'utf8')
  } catch (error) {
    return fail(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = parse(text)
  return parsed.ok ? parsed : fail(`${file}: ${parsed.error}`)
}

export const loadPackFile = (file = PACK_FILE): Parsed<Pack> => read(file, parsePack)
export const loadTemplateFile = (file = TEMPLATE_FILE): Parsed<Template> => read(file, parseTemplate)
