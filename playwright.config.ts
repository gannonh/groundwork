import { defineConfig, devices } from '@playwright/test'

// `pnpm e2e` points each server at its own throwaway database, so a server already listening would test the wrong one.
// `node` rather than `pnpm start`, because the Playwright image that `pnpm e2e:docker` runs in has no pnpm.
// Each server binds port 0, so runs in other worktrees never collide. Picking a free port here instead would race,
// because a port free when checked can be taken before the server binds it. Playwright waits for the server's
// "Listening on" line and exports the named group, upper-cased, as an env var that workers see when they load this
// config. The trailing `\s` stops a partial stdout chunk from matching a truncated port.
const server = { command: 'node .output/server/index.mjs', reuseExistingServer: false }
const databaseOf = (url: string | undefined): Record<string, string> => (url ? { DATABASE_URL: url } : {})

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.E2E_BASE_URL },
  // Tighter than the default 0.2, which lets a swap between two similar-brightness hues, such as indigo to teal on
  // --primary, pass unseen. Not 0: Chromium antialiases rounded corners a shade differently in about 1 run in 50.
  expect: { toHaveScreenshot: { threshold: 0.05 } },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    { ...server, env: { PORT: '0' }, wait: { stdout: /Listening on: (?<e2e_base_url>http:\/\/\S+)\s/ } },
    {
      ...server,
      env: { PORT: '0', ...databaseOf(process.env.E2E_EMPTY_DATABASE_URL) },
      wait: { stdout: /Listening on: (?<e2e_empty_base_url>http:\/\/\S+)\s/ },
    },
    // The run spec's own app and the worker that does its jobs, on a database no other spec reads.
    {
      ...server,
      env: { PORT: '0', ...databaseOf(process.env.E2E_RUN_DATABASE_URL) },
      wait: { stdout: /Listening on: (?<e2e_run_base_url>http:\/\/\S+)\s/ },
    },
    {
      command: 'node src/worker.ts',
      reuseExistingServer: false,
      env: databaseOf(process.env.E2E_RUN_DATABASE_URL),
      wait: { stdout: /Worker ready/ },
    },
  ],
})
