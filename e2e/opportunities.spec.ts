import { expect, test, type Page } from '@playwright/test'

// Runs against `pnpm db:seed` data: prototype D's 12 problems.
const list = (page: Page) => page.getByRole('region', { name: 'Ranked problems' })
const cards = (page: Page) => list(page).getByRole('listitem')
const titles = (page: Page) => list(page).getByRole('listitem').getByRole('link').evaluateAll(titleTexts)
const detail = (page: Page) => page.getByRole('complementary', { name: 'Opportunity detail' })
const rail = (page: Page) => page.getByRole('complementary', { name: 'Ranking and filters' })
const SELECTED_URL = /\/opportunities\?selected=[0-9a-f-]{36}$/

const DASHBOARD = "Dashboard totals don't match the source system"
const TOP_ID = '0e64ff74-d1e2-8d47-8251-6935c4e2e378'
const CSV = 'CSV imports fail silently on malformed rows'
const ADMINS = "Admins can't restrict access by team"

const hydrated = (page: Page) => expect(rail(page).getByRole('slider', { name: 'Reach' })).toBeVisible()

function titleTexts(links: Element[]): string[] {
  return links.map((link) => {
    const id = link.getAttribute('aria-labelledby')
    return (id && document.getElementById(id)?.textContent) ?? ''
  })
}

test('/opportunities ranks 12 problems and details the top one', async ({ page }) => {
  await page.goto('/opportunities')
  await expect(page).toHaveURL(/\/opportunities$/)
  await expect(cards(page)).toHaveCount(12)
  await expect(cards(page).first()).toContainText(DASHBOARD)
  await expect(cards(page).first().getByRole('link')).toHaveAttribute('aria-current', 'page')

  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
  await expect(detail(page).getByRole('term')).toHaveText(['Accounts', 'ARR', 'Mentions', 'Pain'])
  await expect(detail(page).getByRole('definition')).toHaveText(['44', '$2.31M', '141', 'Deal breaker'])
})

test('clicking a card shows its detail and changes the URL, and Back returns to the previous card', async ({
  page,
}) => {
  await page.goto('/opportunities')
  await expect(cards(page)).toHaveCount(12)

  await cards(page).nth(3).click()
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(ADMINS)
  await expect(page).toHaveURL(SELECTED_URL)
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
  await expect(page).toHaveURL(/\/opportunities$/)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
})

test('opening a detail URL directly selects its card', async ({ page }) => {
  await page.goto('/opportunities')
  const href = await cards(page).nth(10).getByRole('link').getAttribute('href')
  expect(href).toMatch(SELECTED_URL)

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
  await page.goto('/opportunities?selected=00000000-0000-0000-0000-000000000000')
  await expect(cards(page)).toHaveCount(12)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText('Opportunity not found')
})

test('the Enterprise preset moves Admins above CSV', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  expect((await titles(page)).slice(0, 4)).toEqual([
    DASHBOARD,
    CSV,
    'Viewers need a paid seat to see a dashboard',
    ADMINS,
  ])

  await rail(page).getByRole('button', { name: 'Enterprise' }).click()
  await expect(page).toHaveURL(/\/opportunities\?reach=10&revenue=60&momentum=10$/)
  await expect(rail(page).getByRole('button', { name: 'Enterprise' })).toHaveAttribute('aria-pressed', 'true')
  await expect(rail(page).getByRole('slider', { name: 'Revenue' })).toHaveAttribute('aria-valuenow', '60')
  await expect.poll(async () => (await titles(page)).slice(0, 4)).toEqual([
    DASHBOARD,
    'Viewers need a paid seat to see a dashboard',
    ADMINS,
    CSV,
  ])
})

test('unticking Mid-market and SMB counts only the enterprise accounts', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  const segment = rail(page).getByRole('group', { name: 'Segment' })
  await segment.getByRole('checkbox', { name: 'Mid-market' }).click()
  await segment.getByRole('checkbox', { name: 'SMB' }).click()
  await expect(segment.getByRole('checkbox', { name: 'Enterprise' })).toBeChecked()

  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
  await expect(detail(page).getByRole('definition')).toHaveText(['2', '$550k', '2', 'Deal breaker'])
  await expect(detail(page).getByRole('figure').locator('figcaption b')).toHaveText([
    'Cobalt Insurance',
    'Halcyon Bank',
  ])

  await segment.getByRole('checkbox', { name: 'Enterprise' }).click()
  await expect(segment.getByRole('checkbox', { name: 'Enterprise' })).toBeChecked()
})

test('a shared URL with weights, grouping, and a filter restores the same view in a new page', async ({
  page,
  context,
}) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await rail(page).getByRole('button', { name: 'Heating up' }).click()
  await page.getByRole('radio', { name: 'By outcome' }).click()
  await rail(page).getByRole('group', { name: 'Segment' }).getByRole('checkbox', { name: 'SMB' }).click()
  await expect(page.getByRole('button', { name: /^Control access and spend/ })).toBeVisible()
  await expect(detail(page).getByRole('definition').first()).not.toHaveText('44')
  const order = await titles(page)
  const url = page.url()
  expect(url).toContain('group=outcome')
  expect(url).toContain('momentum=50')
  expect(url).toContain('segments=')

  const shared = await context.newPage()
  await shared.goto(url)
  await expect(shared.getByRole('radio', { name: 'By outcome' })).toHaveAttribute('aria-checked', 'true')
  await expect(rail(shared).getByRole('button', { name: 'Heating up' })).toHaveAttribute('aria-pressed', 'true')
  await expect(rail(shared).getByRole('checkbox', { name: 'SMB' })).not.toBeChecked()
  expect(await titles(shared)).toEqual(order)
})

test('j and k move the selection and keep it in view', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await expect(cards(page).first().getByRole('link')).toHaveAttribute('aria-current', 'page')

  await page.keyboard.press('j')
  await expect(cards(page).nth(1).getByRole('link')).toHaveAttribute('aria-current', 'page')
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(CSV)
  await page.keyboard.press('k')
  await expect(cards(page).first().getByRole('link')).toHaveAttribute('aria-current', 'page')

  for (let i = 0; i < 11; i++) await page.keyboard.press(i % 2 ? 'ArrowDown' : 'j')
  await expect(cards(page).last().getByRole('link')).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).last()).toBeInViewport({ ratio: 1 })
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText('Timezone handling shifts daily counts')
})

test('keys typed into a control do not move the selection', async ({ page }) => {
  await page.goto('/opportunities')
  const reach = rail(page).getByRole('slider', { name: 'Reach' })
  await reach.focus()
  await page.keyboard.press('j')
  await page.keyboard.press('ArrowDown')
  await expect(reach).toHaveAttribute('aria-valuenow', '29')
  await expect(page).toHaveURL(/\/opportunities\?reach=29$/)
  await expect(cards(page).first().getByRole('link')).toHaveAttribute('aria-current', 'page')
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
})

test('at 1000 px wide the map stacks, and clicking a card expands it inline', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto('/opportunities')
  await hydrated(page)
  await expect(page.getByText('Click a row to expand')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Detail layout' })).toHaveCount(0)
  await expect(detail(page)).toHaveCount(0)
  await expect(cards(page).first().getByRole('link').first()).toHaveAttribute('aria-expanded', 'false')

  const admins = cards(page).nth(3)
  await admins.getByRole('link').first().click()
  await expect(admins.getByRole('link').first()).toHaveAttribute('aria-expanded', 'true')
  await expect(page).toHaveURL(SELECTED_URL)
  await expect(admins.getByRole('definition')).toHaveText(['19', '$1.64M', '47', 'Deal breaker'])
  await expect(admins.getByRole('heading', { level: 3 })).toHaveText([
    'What customers said',
    'Mentions per week',
    'Requested solutions',
    'Top accounts',
  ])

  await admins.getByRole('link').first().click()
  await expect(admins.getByRole('link').first()).toHaveAttribute('aria-expanded', 'false')
  await expect(admins.getByRole('definition')).toHaveCount(0)
})

test('only a filter change refetches the map', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  await expect(cards(page)).toHaveCount(12)
  const fetches: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) fetches.push(request.url())
  })

  await rail(page).getByRole('button', { name: 'Breadth' }).click()
  await page.getByRole('radio', { name: 'By outcome' }).click()
  await page.getByRole('radio', { name: 'Stack' }).click()
  await cards(page).nth(2).getByRole('link').first().click()
  await expect(cards(page).nth(2).getByRole('link').first()).toHaveAttribute('aria-expanded', 'true')
  expect(fetches).toEqual([])

  await rail(page).getByRole('radio', { name: '30d' }).click()
  await expect.poll(() => fetches.length).toBe(1)
})

const evidence = (page: Page) => page.getByRole('dialog')
const stat = (page: Page, label: string) =>
  detail(page).getByRole('definition').nth(['Accounts', 'ARR', 'Mentions'].indexOf(label)).getByRole('link').first()

test("clicking a detail number lists the evidence behind it, and the URL reopens the list", async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)

  await stat(page, 'Mentions').click()
  await expect(evidence(page).getByRole('heading', { name: '141 mentions' })).toBeVisible()
  await expect(evidence(page)).toContainText("Dashboard totals don't match the source system")
  await expect(evidence(page).getByRole('figure')).toHaveCount(141)
  await expect(evidence(page).getByRole('figure').filter({ hasText: '% confident' })).toHaveCount(9)
  expect(new URL(page.url()).searchParams.get('evidence')).toBe('mentions')
  expect(new URL(page.url()).searchParams.get('selected')).toBe(TOP_ID)

  await page.reload()
  await expect(evidence(page).getByRole('figure')).toHaveCount(141)
  await expect(evidence(page).getByRole('figure').filter({ hasText: '% confident' })).toHaveCount(9)

  await evidence(page).getByRole('button', { name: 'Close' }).click()
  await expect(evidence(page)).toHaveCount(0)
  await expect(page).toHaveURL(`/opportunities?selected=${TOP_ID}`)
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(DASHBOARD)
})

test('the Accounts stat lists 44 accounts, and a solution count lists only that solution', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
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
  await hydrated(page)
  await detail(page).getByRole('link', { name: "Show the quotes behind Kite Dynamics's $52k ARR" }).click()
  await expect(evidence(page).getByRole('heading', { level: 2 })).toHaveText('Kite Dynamics · 4 mentions')
  await expect(evidence(page).getByRole('figure')).toHaveCount(4)
  expect(new URL(page.url()).searchParams.get('evidence')).toBe('account')
})

test('with only Enterprise ticked, the Accounts number lists the 2 enterprise accounts', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  const segment = rail(page).getByRole('group', { name: 'Segment' })
  await segment.getByRole('checkbox', { name: 'Mid-market' }).click()
  await segment.getByRole('checkbox', { name: 'SMB' }).click()
  await expect(detail(page).getByRole('definition').first()).toHaveText('2')

  await stat(page, 'Accounts').click()
  await expect(evidence(page).getByRole('heading', { level: 2 })).toHaveText('2 accounts · $550k ARR')
  await expect(evidence(page).getByRole('region')).toHaveCount(2)
  await expect(evidence(page).getByRole('region').first()).toHaveAccessibleName('Cobalt Insurance')
  await expect(evidence(page).getByRole('region').nth(1)).toHaveAccessibleName('Halcyon Bank')
})

test('opening and closing evidence lists fetches only the lists, and j does nothing while one is open', async ({ page }) => {
  await page.goto('/opportunities')
  await hydrated(page)
  const fetches: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) fetches.push(request.url())
  })

  await stat(page, 'Mentions').click()
  await expect(evidence(page).getByRole('figure')).toHaveCount(141)
  await page.keyboard.press('Escape')
  await expect(evidence(page)).toHaveCount(0)
  await stat(page, 'Accounts').click()
  await expect(evidence(page).getByRole('region')).toHaveCount(44)
  await page.keyboard.press('j')
  await expect(evidence(page).getByRole('region')).toHaveCount(44)
  expect(new URL(page.url()).searchParams.get('selected')).toBe(TOP_ID)
  expect(fetches).toHaveLength(2)
})
