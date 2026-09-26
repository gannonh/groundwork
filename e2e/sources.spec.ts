import { expect, test } from '@playwright/test'

const ZENDESK = 'fixtures/exports/zendesk-500.csv'
const upload = (page: import('@playwright/test').Page) => page.getByLabel('CSV export')

test.describe.configure({ mode: 'serial' })

test('importing zendesk-500 lists 500 items and shows the jane ticket redacted', async ({ page }) => {
  await page.goto('/sources/new')
  await upload(page).setInputFiles(ZENDESK)
  await expect(page.getByRole('combobox', { name: 'Text column' })).toHaveText('Description')
  await expect(page.getByRole('combobox', { name: 'Date format' })).toHaveText('YYYY-MM-DD')
  await expect(page.getByText('Showing 20 of 500 rows')).toBeVisible()
  await page.getByRole('button', { name: 'Import 500 rows' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toContainText(/Imported (500 items\. 0|0 items\. 500) duplicates skipped\./)

  await page.goto('/sources')
  const row = page.getByRole('row').filter({ hasText: 'zendesk-500' })
  await expect(row.getByRole('link', { name: '500 items' })).toBeVisible()
  await row.getByRole('link', { name: '500 items' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('zendesk-500')

  await page.getByRole('row').filter({ hasText: "Hi, I'm Jane from Acme." }).getByRole('link').click()
  const sentences = page.getByRole('list', { name: 'Sentences' }).getByRole('listitem')
  await expect(sentences).toHaveText([
    "1Hi, I'm Jane from Acme.",
    '2Please email me at [email] or call [phone] about the "Revenue" dashboard.',
    '3Our totals are 8% lower than Salesforce, and my CFO noticed.',
  ])
  await expect(page.locator('body')).not.toContainText('jane@acme.com')
  await expect(page.locator('body')).not.toContainText('555-0100')
})

test('a second upload of the same file is prefilled and skips 500 duplicates', async ({ page }) => {
  await page.goto('/sources/new')
  await upload(page).setInputFiles(ZENDESK)
  await expect(page.getByText('Mapping remembered from zendesk-500.')).toBeVisible()
  await page.getByRole('button', { name: 'Import 500 rows' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toHaveText(
    'Imported 0 items. 500 duplicates skipped. Open zendesk-500',
  )
  await page.goto('/sources')
  await expect(page.getByRole('row').filter({ hasText: 'zendesk-500' })).toContainText('500 items')
})

test('an empty file and a PNG renamed to .csv show an error and create no source', async ({ page }) => {
  await page.goto('/sources/new')
  await upload(page).setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) })
  await expect(page.getByRole('alert')).toHaveText('The file is empty.')
  await upload(page).setInputFiles({
    name: 'logo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]),
  })
  await expect(page.getByRole('alert')).toHaveText('This file is not a text CSV.')
  await expect(page.getByRole('button', { name: /^Import/ })).toHaveCount(0)

  await page.goto('/sources')
  await expect(page.getByRole('row').filter({ hasText: /^(empty|logo)/ })).toHaveCount(0)
})

test('importing accounts-60 lists the accounts with ARR, plan, and segment', async ({ page }) => {
  await page.goto('/accounts')
  await page.getByLabel(/^Account CSV/).setInputFiles('fixtures/exports/accounts-60.csv')
  await expect(page.getByRole('status')).toContainText(/Imported 60 accounts \((60 new, 0|0 new, 60) updated\)\./)
  await expect(page.getByRole('row').filter({ hasText: 'ACC-002' })).toHaveText(
    'ACC-002Brightline Analytics$114,000EnterpriseMid-market',
  )
  await expect(page.getByRole('row').filter({ hasText: /ACC-0\d\d/ })).toHaveCount(60)
})
