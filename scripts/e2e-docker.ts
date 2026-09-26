/**
 * Runs `scripts/e2e.ts` inside the official Playwright image that matches the
 * installed `@playwright/test`, so screenshots render the same here and in CI.
 * Extra arguments go to `playwright test`. Needs Docker with host networking.
 */
import * as NodeChildProcess from 'node:child_process'
import * as NodeModule from 'node:module'
import * as NodeOs from 'node:os'

const { version } = NodeModule.createRequire(import.meta.url)('@playwright/test/package.json') as { version: string }
const cwd = process.cwd()
const { uid, gid } = NodeOs.userInfo()

const status = NodeChildProcess.spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '--network=host',
    // Files it writes, such as new baselines, belong to you rather than root.
    `--user=${String(uid)}:${String(gid)}`,
    '--env=HOME=/tmp',
    '--env=E2E_DOCKER=1',
    '--env=CI',
    '--env=DATABASE_URL',
    `--volume=${cwd}:${cwd}`,
    `--workdir=${cwd}`,
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'node',
    '--env-file-if-exists=.env',
    'scripts/e2e.ts',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
).status
process.exit(status ?? 1)
