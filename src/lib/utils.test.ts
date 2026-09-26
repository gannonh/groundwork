import * as NodeFs from 'node:fs'
import * as NodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { cn, TYPE_SCALE } from './utils'

const appCss = NodeFs.readFileSync(NodePath.join(import.meta.dirname, '../styles/app.css'), 'utf8')

describe('cn', () => {
  it('knows every type scale step in app.css', () => {
    expect([...appCss.matchAll(/--text-([a-z]+):/g)].map((m) => m[1])).toEqual([...TYPE_SCALE])
  })

  it('lets a scale size replace a component size and keep its color', () => {
    expect(cn('text-sm text-muted-foreground', 'text-meta')).toBe('text-muted-foreground text-meta')
    expect(cn('text-sm text-muted-foreground', 'text-meta text-ink-3')).toBe('text-meta text-ink-3')
  })
})
