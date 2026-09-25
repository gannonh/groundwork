import { expect, test } from '@playwright/test'

test('/ opens the opportunity map, and the top bar lists every section with Opportunities active', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/)
  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link')).toHaveText(['Opportunities', 'Triage', 'Sources', 'Accounts', 'Packs'])
  await expect(nav.getByRole('link', { name: 'Opportunities' })).toHaveAttribute('aria-current', 'page')
})
