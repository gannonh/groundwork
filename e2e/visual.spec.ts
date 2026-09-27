import { expect, test, type Page } from '@playwright/test'

// Baselines come from the Playwright image that `pnpm e2e:docker` runs, and a host browser renders fonts differently.
// CI always compares, so a CI job that skips the image fails on the diff rather than skipping.
test.skip(!process.env.E2E_DOCKER && !process.env.CI, 'Screenshots compare only in the Playwright image: pnpm e2e:docker')
test.use({ viewport: { width: 1440, height: 900 } })

const cards = (page: Page) => page.getByRole('region', { name: 'Ranked problems' }).getByRole('listitem')
const detail = (page: Page) => page.getByRole('complementary', { name: 'Opportunity detail' })
const hydrated = (page: Page) =>
  expect(page.getByRole('complementary', { name: 'Ranking and filters' }).getByRole('slider', { name: 'Reach' })).toBeVisible()

// The pointer stays where the last click landed, so park it off the map to keep hover styles out of the image.
const parkPointer = (page: Page) => page.mouse.move(0, 0)

test('the map with card 1 selected', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText("Dashboard totals don't match the source system")
  await expect(page).toHaveScreenshot('card-1-selected.png')
})

test('the map with card 4 selected', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await cards(page).nth(3).click()
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText("Admins can't restrict access by team")
  await parkPointer(page)
  await expect(page).toHaveScreenshot('card-4-selected.png')
})

test('the evidence sheet open on Mentions', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await detail(page).getByRole('definition').nth(2).getByRole('link').first().click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '141 mentions' })).toBeVisible()
  await parkPointer(page)
  await expect(page).toHaveScreenshot('evidence-mentions.png')
})

test('the empty map', async ({ page }) => {
  // The second web server in playwright.config.ts serves the migrated but unseeded database.
  await page.goto(new URL('/opportunities', process.env.E2E_EMPTY_BASE_URL).href)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No opportunities yet')
  await expect(page).toHaveScreenshot('empty.png')
})
