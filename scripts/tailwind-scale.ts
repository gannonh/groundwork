import * as NodeFs from 'node:fs'
import * as NodePath from 'node:path'
import { parseArgs } from 'node:util'

// A one-off font size or spacing value, such as text-[13px] or -mt-[3px]. eslint.config.js lints with the same pattern.
export const ONE_OFF_SCALE_VALUE =
  /(?<![\w-])(-?)(text|[pm][xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-\[(\d[^\]\s]*)\]/g

// Prototype D sizes a half pixel apart from a scale step. Each is drawn at the named step instead.
const MERGED_FONT_SIZES: Readonly<Record<string, number>> = { '10.5': 10, '11.5': 12, '13.5': 13 }

const ROOT = NodePath.join(import.meta.dirname, '..')
const APP_CSS = NodePath.join(ROOT, 'src/styles/app.css')
const DEFAULT_PATHS = ['src']
const SKIP = NodePath.join(ROOT, 'src/components/ui')

function readTypeScale(): Map<number, string> {
  const css = NodeFs.readFileSync(APP_CSS, 'utf8')
  const scale = new Map<number, string>()
  for (const [, name = '', px] of css.matchAll(/--text-([a-z]+):\s*(\d+(?:\.\d+)?)px;/g)) {
    scale.set(Number(px), `text-${name}`)
  }
  return scale
}

function readSpacingPx(): number {
  const match = /--spacing:\s*([\d.]+)rem;/.exec(NodeFs.readFileSync(APP_CSS, 'utf8'))
  if (!match?.[1]) throw new Error(`no --spacing in ${APP_CSS}`)
  return Number(match[1]) * 16
}

function replacementFor(prop: string, value: string, typeScale: Map<number, string>, stepPx: number) {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value)?.[1]
  if (px === undefined) return undefined
  if (prop === 'text') {
    return typeScale.get(MERGED_FONT_SIZES[px] ?? Number(px))
  }
  const steps = Number(px) / stepPx
  return Number.isInteger(steps * 4) ? `${prop}-${String(steps)}` : undefined
}

function files(path: string): string[] {
  const abs = NodePath.resolve(ROOT, path)
  if (abs === SKIP) return []
  if (NodeFs.statSync(abs).isDirectory()) {
    return NodeFs.readdirSync(abs).flatMap((entry) => files(NodePath.join(abs, entry)))
  }
  return /\.(tsx?|css)$/.test(abs) ? [abs] : []
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { check: { type: 'boolean', default: false } },
  })
  const typeScale = readTypeScale()
  const stepPx = readSpacingPx()
  let rewritten = 0
  const unmapped: string[] = []

  for (const file of (positionals.length ? positionals : DEFAULT_PATHS).flatMap(files)) {
    const source = NodeFs.readFileSync(file, 'utf8')
    const next = source.replace(ONE_OFF_SCALE_VALUE, (token, neg: string, prop: string, value: string) => {
      const scaled = replacementFor(prop, value, typeScale, stepPx)
      if (scaled === undefined) {
        unmapped.push(`${NodePath.relative(ROOT, file)}: ${token}`)
        return token
      }
      rewritten++
      console.log(`${NodePath.relative(ROOT, file)}: ${token} -> ${neg}${scaled}`)
      return `${neg}${scaled}`
    })
    if (!values.check && next !== source) NodeFs.writeFileSync(file, next)
  }

  for (const line of unmapped) console.error(`no scale step: ${line}`)
  console.log(`${String(rewritten)} ${values.check ? 'to rewrite' : 'rewritten'}, ${String(unmapped.length)} without a scale step`)
  if (values.check && rewritten + unmapped.length > 0) process.exit(1)
}

if (import.meta.main) main()
