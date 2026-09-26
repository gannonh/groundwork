import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    // `pnpm e2e` points the server at its own database, so a server already on the port would test the wrong one.
    reuseExistingServer: false,
    // pnpm starts the server in its own process group, so the default SIGKILL orphans it and Playwright hangs on its open pipe.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
