import pg from 'pg'
import { z } from 'zod'

const env = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) }).parse(process.env)

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 2000 })

// Idle clients emit 'error' when Postgres goes away; without a listener Node exits the process.
pool.on('error', (error) => {
  console.error('Postgres pool error:', error.message)
})
