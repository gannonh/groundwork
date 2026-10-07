import { expect, test } from '@playwright/test'
import { expectAccessible } from './axe'

test('/ opens the opportunity map, and the top bar lists every section with Opportunities active', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/opportunities$/)
  const nav = page.getByRole('navigation')
  // The seeded workspace has placements below the threshold, so Triage carries their count.
  await expect(nav.getByRole('link')).toHaveText(['Opportunities', /^Triage\d+$/, 'Sources', 'Accounts', 'Packs'])
  await expect(nav.getByRole('link', { name: 'Opportunities' })).toHaveAttribute('aria-current', 'page')
})

for (const section of ['Triage', 'Sources', 'Accounts', 'Packs']) {
  test(`the ${section} section passes WCAG 2.2 AA checks`, async ({ page }) => {
    await page.goto(`/${section.toLowerCase()}`)
    await expect(page.getByRole('navigation').getByRole('link', { name: section })).toHaveAttribute('aria-current', 'page')
    await expectAccessible(page)
  })
}
