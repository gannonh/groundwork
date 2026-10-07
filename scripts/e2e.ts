/**
 * Runs Playwright against three throwaway databases next to the `DATABASE_URL`
 * database: a seeded one for most specs, a migrated but empty one for the
 * map's empty state, and a second empty one where the pipeline run spec imports
 * a source and runs it. Drops all three when the run ends. Extra arguments go to
 * `playwright test`.
 */
import * as NodeChildProcess from 'node:child_process'
import pg from 'pg'

const baseUrl = process.env.DATABASE_URL
if (!baseUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')

// Postgres caps identifiers at 63 bytes, so the base name keeps only as many
// UTF-8 bytes of whole characters as leave room for the suffix. A fixed name
// per base database lets the next run clean up after a run that was killed
// before its drop.
function throwaway(suffix: string): { database: string; url: string } {
  const url = new URL(baseUrl ?? '')
  let base = ''
  for (const char of decodeURIComponent(url.pathname.slice(1))) {
    if (Buffer.byteLength(base + char + suffix) > 63) break
    base += char
  }
  const database = base + suffix
  url.pathname = `/${encodeURIComponent(database)}`
  return { database, url: url.toString() }
}
const seeded = throwaway('_e2e')
const empty = throwaway('_e2e_empty')
const piped = throwaway('_e2e_run')
const env = { ...process.env, DATABASE_URL: seeded.url, E2E_EMPTY_DATABASE_URL: empty.url, E2E_RUN_DATABASE_URL: piped.url }

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

function run(args: string[], databaseUrl = seeded.url): number {
  return (
    NodeChildProcess.spawnSync('node', args, { env: { ...env, DATABASE_URL: databaseUrl }, stdio: 'inherit' })
      .status ?? 1
  )
}

async function dropAll(): Promise<void> {
  for (const { database } of [seeded, empty, piped]) await admin(`drop database if exists "${database}" with (force)`)
}

// Ctrl-C also reaches Playwright. Let it exit so the drop below still runs.
process.on('SIGINT', () => undefined)

await dropAll()
for (const { database } of [seeded, empty, piped]) await admin(`create database "${database}"`)
console.log(`Created ${seeded.database}, ${empty.database}, and ${piped.database}.`)
let status: number
try {
  status =
    run(['src/db/migrate.ts']) ||
    run(['src/db/migrate.ts'], empty.url) ||
    run(['src/db/migrate.ts'], piped.url) ||
    run(['src/db/seed.ts']) ||
    // By path, not `playwright` on PATH, so it also runs outside pnpm in the Playwright image.
    run(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)])
} finally {
  await dropAll()
  console.log(`Dropped ${seeded.database}, ${empty.database}, and ${piped.database}.`)
}
process.exit(status)
