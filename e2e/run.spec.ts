import { expect, test, type Locator } from '@playwright/test'
import { expectAccessible } from './axe'

const base = process.env.E2E_RUN_BASE_URL
const at = (path: string) => new URL(path, base).href

async function chooseFile(input: Locator, file: Parameters<Locator['setInputFiles']>[0]) {
  await expect(input).toBeEnabled()
  await input.setInputFiles(file)
}

test('a fresh workspace imports zendesk-500, runs it on the recorded judge, and fills the map', async ({ page }) => {
  await page.goto(at('/sources/new'))
  await chooseFile(page.getByLabel('CSV export'), 'fixtures/exports/zendesk-500.csv')
  await page.getByRole('button', { name: 'Import 500 rows' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toHaveText(
    'Imported 500 items. 0 duplicates skipped. Open zendesk-500',
  )

  await page.getByRole('link', { name: 'Open zendesk-500' }).click()
  const panel = page.getByRole('region', { name: 'Run the pipeline' })
  await expect(panel.getByText('Items')).toBeVisible()
  await expect(panel.locator('dd')).toHaveText(['500', 'about 1,700', /^\$0\.0\d\d$/])
  // No run has started, so nothing is queued and the nav has nothing in triage.
  await expect(page.getByRole('navigation').getByRole('link', { name: /^Triage/ })).toHaveText('Triage')
  await expectAccessible(page)

  await panel.getByRole('button', { name: 'Start run' }).click()
  await expect(panel.getByRole('progressbar', { name: 'Run progress' })).toBeVisible()
  await expectAccessible(page)
  // The worker judges about 40 items a second.
  await expect(panel.getByText('Run complete. 500 items judged, 0 failed.')).toBeVisible({ timeout: 60_000 })
  await expect(panel.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '100')
  await expectAccessible(page)

  // The nav counts the placements below the pack's 0.7, and refreshed without a reload.
  await expect(page.getByRole('navigation').getByRole('link', { name: /^Triage/ })).toHaveAccessibleName('Triage, 77 to review')

  await page.getByRole('navigation').getByRole('link', { name: 'Opportunities' }).click()
  await expect(page.getByRole('heading', { level: 2 })).not.toHaveCount(0)
  await expect(page.getByText('SSO setup requires contacting support').first()).toBeVisible()
  await expectAccessible(page)
})
