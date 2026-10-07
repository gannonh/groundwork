import { expect, test, type Page } from '@playwright/test'
import { expectAccessible } from './axe'

// Runs against `pnpm db:seed` data. Every seeded item has one mention.
const TOP_ID = '0e64ff74-d1e2-8d47-8251-6935c4e2e378'
const DASHBOARD = "Dashboard totals don't match the source system"
const MAP = `/opportunities?pain=40&selected=${TOP_ID}&evidence=mentions`

const sheet = (page: Page) => page.getByRole('dialog')
const detail = (page: Page) => page.getByRole('complementary', { name: 'Opportunity detail' })
const hydrated = (page: Page) =>
  expect(page.getByRole('complementary', { name: 'Ranking and filters' }).getByRole('slider', { name: 'Reach' })).toBeVisible()
const lumen = (scope: ReturnType<Page['getByRole']>) => scope.filter({ hasText: 'Lumen Clinics' }).filter({ hasText: '62% confident' })
const highlighted = (page: Page) => page.getByRole('list', { name: 'Sentences' }).locator('mark')

test('a quote in the evidence list opens its item with the quoted sentences highlighted, and Back returns to the open list', async ({
  page,
}) => {
  await page.goto(MAP)
  await expect(sheet(page).getByRole('figure')).toHaveCount(141)
  const quote = lumen(sheet(page).getByRole('figure'))
  const quoted = await quote.locator('mark').innerText()
  await quote.getByRole('link', { name: /^Open .* · / }).click()

  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?mention=[0-9a-f-]{36}&from=/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review from Aug 25, 2026')
  await expect(highlighted(page)).toHaveText(quoted)
  const mentions = page.getByRole('list', { name: 'Mentions' }).getByRole('listitem')
  await expect(mentions).toHaveCount(1)
  await expect(mentions.first()).toContainText(DASHBOARD)
  await expect(mentions.first()).toContainText('Problem in Trust the numbers in reports')
  await expect(mentions.first()).toContainText('Sentence 1')
  await expect(mentions.first().getByText('62% confident')).toBeVisible()
  await expect(page.getByRole('link', { name: '← Back to the evidence list' })).toBeVisible()
  await expectAccessible(page)

  await page.goBack()
  await expect(page).toHaveURL(MAP)
  await expect(sheet(page).getByRole('figure')).toHaveCount(141)
  await expect(sheet(page).getByRole('figure').filter({ hasText: '% confident' })).toHaveCount(9)
})

test("the item's back link restores the same map view, with its weights and the open list in the URL", async ({ page }) => {
  await page.goto(MAP)
  await lumen(sheet(page).getByRole('figure')).getByRole('link', { name: /^Open / }).click()
  await expect(highlighted(page)).toBeVisible()

  await page.getByRole('link', { name: '← Back to the evidence list' }).click()
  await expect(page).toHaveURL(MAP)
  await expect(sheet(page).getByRole('figure')).toHaveCount(141)
})

test('a quote in the detail opens its item, and the back link returns to the detail with no list open', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  const quote = lumen(detail(page).getByRole('figure'))
  const quoted = await quote.locator('mark').innerText()
  await quote.getByRole('link', { name: /^Open / }).click()
  await expect(highlighted(page)).toHaveText(quoted)

  await expect(page.getByRole('link', { name: '← Back to opportunities' })).toBeVisible()
  await page.getByRole('link', { name: '← Back to opportunities' }).click()
  await expect(page).toHaveURL(/\/opportunities$/)
  await expect(sheet(page)).toHaveCount(0)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
})

test('an item page opened from a quote works from the keyboard', async ({ page }) => {
  await page.goto(MAP)
  const link = lumen(sheet(page).getByRole('figure')).getByRole('link', { name: /^Open / })
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(highlighted(page)).toBeVisible()

  const mention = page.getByRole('list', { name: 'Mentions' }).getByRole('link')
  await mention.focus()
  await expect(mention).toBeFocused()
  await expect(mention).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Enter')
  await expect(highlighted(page)).toBeVisible()

  const back = page.getByRole('link', { name: '← Back to the evidence list' })
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page).getByRole('figure')).toHaveCount(141)
})

test('a missing, malformed, or foreign mention highlights nothing, and a malformed map view shows no back link', async ({
  page,
}) => {
  await page.goto(MAP)
  const href = await lumen(sheet(page).getByRole('figure')).getByRole('link', { name: /^Open / }).getAttribute('href')
  const itemPath = new URL(href ?? '', 'http://x').pathname

  for (const query of ['', '?mention=not-a-uuid&from=oops', '?mention=00000000-0000-0000-0000-000000000000']) {
    await page.goto(itemPath + query)
    await expect(page.getByRole('list', { name: 'Sentences' }).getByRole('listitem')).toHaveCount(1)
    await expect(highlighted(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^← Back/ })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Mentions' }).getByRole('listitem')).toHaveCount(1)
  }
  await expectAccessible(page)

  await page.goto('/items/00000000-0000-0000-0000-000000000000?mention=not-a-uuid')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Item not found')
})

test('at 390 px wide the item page does not scroll sideways and keeps the highlight in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(MAP)
  await lumen(sheet(page).getByRole('figure')).getByRole('link', { name: /^Open / }).click()
  await expect(highlighted(page)).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expectAccessible(page)
})
