import { expect, test } from '@playwright/test'

test('GET /api/health answers ok through the server', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})
