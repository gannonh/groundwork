import { pool } from './client.ts'

try {
  await pool.query('select 1')
  console.log('Nothing to seed yet.')
} finally {
  await pool.end()
}
