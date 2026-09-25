import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { pool } from './client.ts'

async function appliedMigrationCount(): Promise<number> {
  const table = await pool.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  )
  if (!table.rows[0]?.exists) return 0
  const result = await pool.query<{ count: number }>('select count(*)::int as count from drizzle.__drizzle_migrations')
  return result.rows[0]?.count ?? 0
}

try {
  const before = await appliedMigrationCount()
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' })
  const applied = (await appliedMigrationCount()) - before
  console.log(
    applied === 0 ? 'No pending migrations.' : `Applied ${String(applied)} migration${applied === 1 ? '' : 's'}.`,
  )
} finally {
  await pool.end()
}
