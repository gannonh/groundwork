import { db, pool } from './client.ts'
import { buildSeed } from './seed/build.ts'
import { writeSeed } from './seed/write.ts'

try {
  const rows = buildSeed()
  await writeSeed(db, rows)
  console.log(
    `Seeded ${rows.workspace.name}: ${String(rows.opportunities.length)} opportunities, ${String(rows.accounts.length)} accounts, ${String(rows.items.length)} items, ${String(rows.placements.length)} placements.`,
  )
} finally {
  await pool.end()
}
