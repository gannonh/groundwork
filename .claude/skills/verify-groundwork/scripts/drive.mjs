#!/usr/bin/env node
// Drive a Groundwork instance started by verify.sh with headless Chromium and write evidence.
// Usage: drive.mjs [--id ID] [--video] [--viewport 1440x900] [--name NAME] STEP...
// Steps run in order; the first failure snaps `failure` and exits 1:
//   goto=/path             navigate to a path on the instance
//   click=role/Name        click the element with that ARIA role and accessible name
//   click-in-row=Text|Name click the link named Name inside the one table row that contains Text
//   choose-file=Label|path set the file input labelled Label to a file (path relative to the repo root)
//   select=Label|Option    open the Select (combobox) labelled Label and pick Option
//   press=Key              press a key on the focused element (Tab, Enter, /)
//   back=                  press the browser Back button
//   expect-url=/path       assert the current path (and search) equals /path
//   expect-title=Text      assert document.title
//   expect-current=Name    assert Name is the one and only nav link with aria-current="page"
//   expect-text=Text       assert Text is visible on the page
//   expect-text-within=Text|Seconds  like expect-text, but waits up to that many seconds (for a run that takes a while)
//   expect-focus=Name      assert the focused element's accessible name (text or aria-label)
//   expect-eval=JS         assert a JavaScript expression evaluated in the page is truthy
//   snap=label             write label.png and label.aria.yml to the evidence dir
import { readFileSync, mkdirSync, appendFileSync, renameSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim()
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const [, value] = args.splice(i, 2)
  return value
}
const bool = (name) => {
  const i = args.indexOf(name)
  if (i !== -1) args.splice(i, 1)
  return i !== -1
}

const id = flag('--id') ?? readFileSync(join(root, '.verify/current'), 'utf8').trim()
const [width, height] = (flag('--viewport') ?? '1440x900').split('x').map(Number)
const name = flag('--name') ?? 'drive'
const video = bool('--video')
const state = Object.fromEntries(
  readFileSync(join(root, '.verify/instances', id, 'state.env'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const out = join(state.EVIDENCE_DIR, name)
// A rerun replaces the scenario's evidence, so old failures never sit beside a new pass.
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const logFile = join(out, 'steps.log')
const log = (line) => {
  const stamped = `${new Date().toISOString()} ${line}`
  console.log(stamped)
  appendFileSync(logFile, stamped + '\n')
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height },
  ...(video ? { recordVideo: { dir: out, size: { width, height } } } : {}),
})
const page = await context.newPage()
page.on('console', (m) => m.type() === 'error' && log(`console.error ${m.text()}`))
page.on('pageerror', (e) => log(`pageerror ${e.message}`))
page.on('response', (r) => r.status() >= 400 && log(`http ${r.status()} ${r.url()}`))

const snap = async (label) => {
  await page.screenshot({ path: join(out, `${label}.png`), fullPage: true })
  const aria = await page.locator('body').ariaSnapshot()
  appendFileSync(join(out, `${label}.aria.yml`), `# ${page.url()}\n${aria}\n`, { flag: 'w' })
  log(`snap ${label} -> ${join(out, label)}.{png,aria.yml}`)
}

const pair = (arg) => {
  const bar = arg.indexOf('|')
  if (bar === -1) throw new Error(`expected 'first|second', got '${arg}'`)
  return [arg.slice(0, bar), arg.slice(bar + 1)]
}

const steps = {
  goto: (path) => page.goto(new URL(path, state.URL).href, { waitUntil: 'networkidle' }),
  click: (target) => {
    const slash = target.indexOf('/')
    return page.getByRole(target.slice(0, slash), { name: target.slice(slash + 1), exact: true }).click()
  },
  'click-in-row': async (arg) => {
    const [text, link] = pair(arg)
    const rows = page.getByRole('row').filter({ hasText: text })
    try {
      await expect(rows).toHaveCount(1)
    } catch {
      throw new Error(`expected exactly 1 table row containing '${text}', found ${await rows.count()}`)
    }
    await rows.getByRole('link', { name: link, exact: true }).click()
  },
  'choose-file': (arg) => {
    const [label, path] = pair(arg)
    return page.getByLabel(label).setInputFiles(resolve(root, path))
  },
  select: async (arg) => {
    const [label, option] = pair(arg)
    const select = page.getByRole('combobox', { name: label, exact: true })
    await select.click()
    await page.getByRole('option', { name: option, exact: true }).click()
    // While the listbox is open, Radix hides the rest of the page from the accessibility tree.
    await expect(page.getByRole('listbox')).toBeHidden()
    await expect(select).toHaveText(option)
  },
  press: (key) => page.keyboard.press(key),
  back: () => page.goBack(),
  'expect-url': (path) => expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(path),
  'expect-title': (title) => expect(page).toHaveTitle(title),
  'expect-current': (label) => expect(page.getByRole('navigation').locator('a[aria-current="page"]')).toHaveText([label]),
  'expect-text': (text) => expect(page.getByText(text, { exact: false }).first()).toBeVisible(),
  'expect-text-within': (arg) => {
    const [text, seconds] = pair(arg)
    return expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: Number(seconds) * 1000 })
  },
  'expect-focus': (label) =>
    expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim()))
      .toBe(label),
  'expect-eval': (js) => expect.poll(() => page.evaluate(js)).toBeTruthy(),
  snap,
}

log(`run ${id} ${state.MODE} ${state.URL} viewport=${width}x${height} git=${state.GIT_HEAD.slice(0, 7)}`)
let failed = false
for (const step of args) {
  const eq = step.indexOf('=')
  const verb = step.slice(0, eq)
  const arg = step.slice(eq + 1)
  if (eq === -1 || !(verb in steps)) {
    log(`FAIL unknown step '${step}'`)
    failed = true
    break
  }
  try {
    await steps[verb](arg)
    log(`ok   ${step}`)
  } catch (error) {
    log(`FAIL ${step}: ${String(error.message).split('\n')[0]}`)
    await snap('failure').catch(() => {})
    failed = true
    break
  }
}

await context.close()
if (video) {
  const recorded = await page.video()?.path()
  if (recorded) {
    renameSync(recorded, join(out, 'video.webm'))
    log(`video -> ${join(out, 'video.webm')}`)
  }
}
await browser.close()
log(failed ? 'result FAIL' : 'result PASS')
process.exit(failed ? 1 : 0)
