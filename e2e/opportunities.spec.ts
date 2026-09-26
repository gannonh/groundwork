import { expect, test, type Page } from '@playwright/test'

// Runs against `pnpm db:seed` data: prototype D's 12 problems.
const cards = (page: Page) => page.getByRole('region', { name: 'Ranked problems' }).getByRole('listitem')
const detail = (page: Page) => page.getByRole('complementary', { name: 'Opportunity detail' })
const OPPORTUNITY_URL = /\/opportunities\/[0-9a-f-]{36}$/

test('/opportunities ranks 12 problems and details the top one', async ({ page }) => {
  await page.goto('/opportunities')
  await expect(page).toHaveURL(OPPORTUNITY_URL)
  await expect(cards(page)).toHaveCount(12)
  await expect(cards(page).first()).toContainText("Dashboard totals don't match the source system")
  await expect(cards(page).first().getByRole('link')).toHaveAttribute('aria-current', 'page')

  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(
    "Dashboard totals don't match the source system",
  )
  await expect(detail(page).getByRole('term')).toHaveText(['Accounts', 'ARR', 'Mentions', 'Pain'])
  await expect(detail(page).getByRole('definition')).toHaveText(['44', '$2.31M', '141', 'Deal breaker'])
})

test('clicking a card shows its detail and changes the URL, and Back returns to the previous card', async ({
  page,
}) => {
  await page.goto('/opportunities')
  await expect(page).toHaveURL(OPPORTUNITY_URL)
  const top = page.url()

  await cards(page).nth(3).click()
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText("Admins can't restrict access by team")
  await expect(page).toHaveURL(OPPORTUNITY_URL)
  expect(page.url()).not.toBe(top)
  await expect(cards(page).nth(3).getByRole('link')).toHaveAttribute('aria-current', 'page')
  await expect(detail(page).getByRole('definition')).toHaveText(['19', '$1.64M', '47', 'Deal breaker'])
  await expect(detail(page).getByRole('heading', { level: 3 })).toHaveText([
    'Mentions per week',
    'What customers said',
    'Requested solutions',
    'Top accounts',
  ])
  await expect(detail(page).getByRole('img', { name: /^Mentions per week/ })).toBeVisible()
  await expect(detail(page).getByRole('figure').first()).toContainText('Halcyon Bank')
  await expect(detail(page)).toContainText('Team-scoped permissions')

  await page.goBack()
  await expect(page).toHaveURL(top)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(
    "Dashboard totals don't match the source system",
  )
})

test('opening a detail URL directly selects its card', async ({ page }) => {
  await page.goto('/opportunities')
  const href = await cards(page).nth(10).getByRole('link').getAttribute('href')
  expect(href).toMatch(OPPORTUNITY_URL)

  await page.goto(href ?? '')
  await expect(cards(page).nth(10).getByRole('link')).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).nth(10)).toBeInViewport()
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText('No scheduled email digest')
})

test('a low-confidence quote shows the amber border and its confidence', async ({ page }) => {
  await page.goto('/opportunities')
  await expect(detail(page).getByText('9 need review')).toBeVisible()
  const flagged = detail(page).getByRole('figure').filter({ hasText: '62% confident' })
  await expect(flagged).toHaveCount(1)
  await expect(flagged).toContainText('Lumen Clinics')
  await expect(flagged).toHaveCSS('border-left-color', 'rgb(252, 211, 77)')
  const confident = detail(page).getByRole('figure').filter({ hasText: 'Cobalt Insurance' })
  await expect(confident).toHaveCSS('border-left-color', 'rgb(231, 229, 228)')
})

test('an unknown opportunity id shows a not-found pane beside the list', async ({ page }) => {
  await page.goto('/opportunities/00000000-0000-0000-0000-000000000000')
  await expect(cards(page)).toHaveCount(12)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText('Opportunity not found')
})

const evidence = (page: Page) => page.getByRole('dialog')
const stat = (page: Page, label: string) =>
  detail(page).getByRole('definition').nth(['Accounts', 'ARR', 'Mentions'].indexOf(label)).getByRole('link')

test("clicking a detail number lists the evidence behind it, and the URL reopens the list", async ({ page }) => {
  await page.goto('/opportunities')
  await expect(page).toHaveURL(OPPORTUNITY_URL)
  const detailUrl = page.url()

  await stat(page, 'Mentions').click()
  await expect(evidence(page).getByRole('heading', { name: '141 mentions' })).toBeVisible()
  await expect(evidence(page)).toContainText("Dashboard totals don't match the source system")
  await expect(evidence(page).getByRole('figure')).toHaveCount(141)
  await expect(evidence(page).getByRole('figure').filter({ hasText: '% confident' })).toHaveCount(9)
  expect(new URL(page.url()).searchParams.get('evidence')).toBe('mentions')

  await page.reload()
  await expect(evidence(page).getByRole('figure')).toHaveCount(141)
  await expect(evidence(page).getByRole('figure').filter({ hasText: '% confident' })).toHaveCount(9)

  await evidence(page).getByRole('button', { name: 'Close' }).click()
  await expect(evidence(page)).toHaveCount(0)
  await expect(page).toHaveURL(detailUrl)
})

test('the Accounts stat lists 44 accounts, and a solution count lists only that solution', async ({ page }) => {
  await page.goto('/opportunities')
  await stat(page, 'Accounts').click()
  await expect(evidence(page).getByRole('heading', { level: 2 })).toHaveText('44 accounts · $2.31M ARR')
  await expect(evidence(page).getByRole('region')).toHaveCount(44)
  await expect(evidence(page).getByRole('region').first()).toHaveAccessibleName('Cobalt Insurance')
  await page.keyboard.press('Escape')
  await expect(evidence(page)).toHaveCount(0)

  await detail(page).getByRole('link', { name: 'Show the 36 mentions of Reconciliation view vs. source' }).click()
  await expect(evidence(page).getByRole('heading', { level: 2 })).toHaveText(
    'Reconciliation view vs. source · 36 mentions',
  )
  await expect(evidence(page).getByRole('figure')).toHaveCount(36)
  expect(new URL(page.url()).searchParams.get('evidence')).toBe('solution')
})

test("a top account's ARR lists that account's quotes", async ({ page }) => {
  await page.goto('/opportunities')
  await detail(page).getByRole('link', { name: "Show the quotes behind Kite Dynamics's $52k ARR" }).click()
  await expect(evidence(page).getByRole('heading', { level: 2 })).toHaveText('Kite Dynamics · 4 mentions')
  await expect(evidence(page).getByRole('figure')).toHaveCount(4)
  expect(new URL(page.url()).searchParams.get('evidence')).toBe('account')
})
