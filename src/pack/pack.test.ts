import * as NodeFs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { PACK_DEFINITION } from '../db/seed/prototype.ts'
import { parsePack } from './pack.ts'

const shipped = NodeFs.readFileSync('packs/product-insights.yaml', 'utf8')

describe('parsePack', () => {
  test('packs/product-insights.yaml parses to the pack the seed stores', () => {
    const parsed = parsePack(shipped)
    expect(parsed).toEqual({ ok: true, value: PACK_DEFINITION })
  })

  test('a question of an unknown type is rejected with the types that exist', () => {
    const parsed = parsePack(shipped.replace('type: score', 'type: ranking'))
    expect(parsed).toEqual({
      ok: false,
      error: 'The pack is invalid. item_questions.pain.type: must have a type of noul, score, or choice',
    })
  })

  test('a model that is not pinned is rejected', () => {
    const parsed = parsePack(shipped.replace('jev-1.13.0', 'jev-latest'))
    expect(parsed).toEqual({
      ok: false,
      error: 'The pack is invalid. judge: must pin a model version such as jev-1.13.0, never "latest"',
    })
  })

  test('a question the pipeline does not read, and a missing one, are both named', () => {
    const extra = parsePack(shipped.replace('thresholds:', '  sentiment:\n    type: noul\n    instructions: x\nthresholds:'))
    expect(extra).toEqual({ ok: false, error: 'The pack is invalid. item_questions: sentiment is not a question this pipeline reads' })
    const missing = parsePack(shipped.replace(/ {2}workaround:\n.*\n.*\n/, ''))
    expect(missing).toEqual({ ok: false, error: 'The pack is invalid. item_questions: workaround must be a noul question' })
  })

  test('a threshold outside (0, 1) is rejected', () => {
    const parsed = parsePack(shipped.replace('place_confidence: 0.7', 'place_confidence: 1.2'))
    expect(parsed.ok).toBe(false)
  })

  test('text that is not YAML is rejected', () => {
    expect(parsePack('pack: [unclosed')).toMatchObject({ ok: false })
  })
})
