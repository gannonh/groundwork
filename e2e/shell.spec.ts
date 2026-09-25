import { expect, test } from '@playwright/test'

test('the top bar lists every section and marks Opportunities active on /', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link')).toHaveText(['Opportunities', 'Triage', 'Sources', 'Accounts', 'Packs'])
  await expect(nav.getByRole('link', { name: 'Opportunities' })).toHaveAttribute('aria-current', 'page')
})
