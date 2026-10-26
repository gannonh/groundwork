import { expect, test, type Page } from '@playwright/test'
import { expectAccessible } from './axe'

// Runs against its own `pnpm db:seed` database, whose 44 low-confidence placements fill the queue. The tests share it
// in order, each picking up the queue the last one left.
test.describe.configure({ mode: 'serial' })

const at = (path: string) => new URL(path, process.env.E2E_TRIAGE_BASE_URL).href
const navTriage = (page: Page) => page.getByRole('navigation').getByRole('link', { name: /^Triage/ })
const summary = (page: Page) => page.getByRole('main').locator('h1 + span')
const card = (page: Page) => page.getByRole('article', { name: 'Placement to review' })
const ready = (page: Page) => expect(card(page).getByRole('button', { name: /^Accept: place in / })).toBeEnabled()

test('the queue lists each placement with its top two branches, and Accept takes one off the nav count', async ({ page }) => {
  await page.goto(at('/triage'))
  await ready(page)
  await expect(navTriage(page)).toHaveText('Triage44')
  await expect(summary(page)).toHaveText('44 low-confidence placements under 70%')
  await expect(card(page).getByRole('button', { name: /^(Accept: place in .+|Move to .+|Discard: none of these), \d+%$/ })).toHaveCount(3)
  await expectAccessible(page)

  await card(page).getByRole('button', { name: /^Accept: place in / }).click()
  await expect(navTriage(page)).toHaveText('Triage43')
  await expect(summary(page)).toHaveText('43 low-confidence placements under 70%')
})

test('ten decisions by keyboard alone take ten items off the queue', async ({ page }) => {
  await page.goto(at('/triage'))
  await ready(page)
  for (const key of ['a', 'd', 'a', 'a', 'd', 'a', 'a', 'a', 'd', 'a']) await page.keyboard.press(key)
  await expect(navTriage(page)).toHaveText('Triage33')
  await expect(summary(page)).toHaveText('33 low-confidence placements under 70%')
})

test('Move opens a picker that moves the quote to the chosen problem', async ({ page }) => {
  await page.goto(at('/triage'))
  await ready(page)
  await page.keyboard.press('m')
  const picker = page.getByRole('dialog')
  await expect(picker.getByRole('combobox', { name: 'Filter opportunities' })).toBeFocused()
  await expectAccessible(page)
  await page.keyboard.type('backfill')
  await expect(picker.getByRole('option')).toHaveText(['No way to backfill historical data'])
  await page.keyboard.press('Enter')
  await expect(picker).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('Moved to No way to backfill historical data')
  await expect(navTriage(page)).toHaveText('Triage32')
})

test('a decision already made in another tab is reported, not made twice', async ({ page, context }) => {
  await page.goto(at('/triage'))
  await ready(page)
  const other = await context.newPage()
  await other.goto(at('/triage'))
  await ready(other)
  await other.keyboard.press('a')
  await expect(navTriage(other)).toHaveText('Triage31')

  await page.keyboard.press('a')
  await expect(page.getByRole('status')).toHaveText('Already decided, maybe in another tab. Nothing changed.')
  await expect(navTriage(page)).toHaveText('Triage31')
})

test('an empty queue shows the empty state and hides the nav count', async ({ page }) => {
  await page.goto(at('/triage'))
  await ready(page)
  for (let left = 31; left > 0; left--) {
    await expect(summary(page)).toContainText(`${String(left)} low-confidence placement`)
    await page.keyboard.press('a')
  }
  await expect(page.getByRole('heading', { name: 'Queue clear' })).toBeVisible()
  await expect(navTriage(page)).toHaveText('Triage')
  await expect(page.getByRole('list', { name: 'Latest decisions' }).getByRole('listitem')).toHaveCount(5)
  await expectAccessible(page)
})
