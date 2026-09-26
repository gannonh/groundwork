import { defineConfig, devices } from '@playwright/test'

// `pnpm e2e` points each server at its own throwaway database, so a server already on the port would test the wrong one.
// `node` rather than `pnpm start`, because the Playwright image that `pnpm e2e:docker` runs in has no pnpm.
const server = { command: 'node .output/server/index.mjs', reuseExistingServer: false }

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000' },
  // Tighter than the default 0.2, which lets a swap between two similar-brightness hues, such as indigo to teal on
  // --primary, pass unseen. Not 0: Chromium antialiases rounded corners a shade differently in about 1 run in 50.
  expect: { toHaveScreenshot: { threshold: 0.05 } },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    { ...server, url: 'http://localhost:3000' },
    {
      ...server,
      url: 'http://localhost:3001',
      env: { PORT: '3001', ...(process.env.E2E_EMPTY_DATABASE_URL && { DATABASE_URL: process.env.E2E_EMPTY_DATABASE_URL }) },
    },
  ],
})
