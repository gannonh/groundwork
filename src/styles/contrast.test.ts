import * as NodeFs from 'node:fs'
import * as NodePath from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = NodeFs.readFileSync(NodePath.join(import.meta.dirname, 'app.css'), 'utf8')

const tokens = new Map(
  [...appCss.matchAll(/--(?:color-)?([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1]!, m[2]!]),
)

const SURFACE = /^(background|card|popover|secondary|muted|accent|line-2|mark|[a-z]+-soft)$/

function token(name: string): string {
  const hex = tokens.get(name)
  if (!hex) throw new Error(`app.css has no hex token named ${name}`)
  return hex
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter! + 0.05) / (darker! + 0.05)
}

const surfaces = [...tokens.keys()].filter((name) => SURFACE.test(name))

describe('ink contrast in app.css', () => {
  it('checks every surface token', () => {
    expect(surfaces).toEqual([
      'background',
      'card',
      'popover',
      'secondary',
      'muted',
      'accent',
      'line-2',
      'primary-soft',
      'up-soft',
      'down-soft',
      'warn-soft',
      'mark',
    ])
  })

  it.each(['ink-2', 'ink-3'])('%s measures at least 4.5:1 on every surface', (ink) => {
    const failing = surfaces
      .map((surface) => ({ surface, ratio: Number(contrast(token(ink), token(surface)).toFixed(2)) }))
      .filter(({ ratio }) => ratio < 4.5)
    expect(failing).toEqual([])
  })

  it('measures ink-3 at 4.63:1 on the tightest surface', () => {
    const tightest = Math.min(...surfaces.map((surface) => contrast(token('ink-3'), token(surface))))
    expect(tightest.toFixed(2)).toBe('4.63')
  })

  it('keeps the three ink levels visibly apart', () => {
    expect(contrast(token('foreground'), token('ink-2')).toFixed(2)).toBe('2.05')
    expect(contrast(token('ink-2'), token('ink-3')).toFixed(2)).toBe('1.64')
  })

  it('keeps the shadcn muted foreground on ink-2', () => {
    expect(token('muted-foreground')).toBe(token('ink-2'))
  })
})
