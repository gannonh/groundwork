import * as NodeFs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { OUTCOMES, PROBLEMS } from '../db/seed/prototype.ts'
import { parseTemplate } from './template.ts'

const shipped = NodeFs.readFileSync('templates/b2b-saas.yaml', 'utf8')

describe('parseTemplate', () => {
  test('templates/b2b-saas.yaml holds the outcomes and problems of the demo tree', () => {
    const parsed = parseTemplate(shipped)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.value.outcomes.map((o) => [o.title, o.problems.map((p) => p.title)])).toEqual(
      OUTCOMES.map((o) => [o.title, PROBLEMS.filter((p) => p.outcome === o.key).map((p) => p.title)]),
    )
  })

  test('two problems with one title under an outcome are rejected, since the judge could not tell them apart', () => {
    const parsed = parseTemplate(
      'template: t\noutcomes:\n  - title: A\n    problems:\n      - title: P\n      - title: P\n',
    )
    expect(parsed).toEqual({
      ok: false,
      error: 'The template is invalid. outcomes.0.problems: problem titles must be unique within an outcome',
    })
  })

  test('a problem titled "none" is rejected, since it is the judge\'s way to decline', () => {
    const parsed = parseTemplate('template: t\noutcomes:\n  - title: A\n    problems:\n      - title: none\n')
    expect(parsed.ok).toBe(false)
  })
})
