/**
 * Runs Playwright against a throwaway database: creates it next to the
 * `DATABASE_URL` database, migrates and seeds it, points the web server at it,
 * and drops it when the run ends. Extra arguments go to `playwright test`.
 */
import * as NodeChildProcess from 'node:child_process'
import pg from 'pg'

const baseUrl = process.env.DATABASE_URL
if (!baseUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')

const url = new URL(baseUrl)
// Postgres caps identifiers at 63 bytes, so the base name gives up room for
// the suffix. A fixed name per base database lets the next run clean up after
// a run that was killed before its drop.
const database = `${decodeURIComponent(url.pathname.slice(1)).slice(0, 59)}_e2e`
url.pathname = `/${encodeURIComponent(database)}`
const env = { ...process.env, DATABASE_URL: url.toString() }

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

function run(command: string, args: string[]): number {
  return NodeChildProcess.spawnSync(command, args, { env, stdio: 'inherit' }).status ?? 1
}

// Ctrl-C also reaches Playwright. Let it exit so the drop below still runs.
process.on('SIGINT', () => undefined)

const drop = `drop database if exists "${database}" with (force)`
await admin(drop)
await admin(`create database "${database}"`)
console.log(`Created ${database}.`)
let status: number
try {
  status =
    run('node', ['src/db/migrate.ts']) ||
    run('node', ['src/db/seed.ts']) ||
    run('playwright', ['test', ...process.argv.slice(2)])
} finally {
  await admin(drop)
  console.log(`Dropped ${database}.`)
}
process.exit(status)
