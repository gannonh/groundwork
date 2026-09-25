import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import pg from 'pg'
import { z } from 'zod'
import * as schema from './schema.ts'

const env = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) }).parse(process.env)

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 2000 })

// Idle clients emit 'error' when Postgres goes away; without a listener Node exits the process.
pool.on('error', (error) => {
  console.error('Postgres pool error:', error.message)
})

export const db = drizzle(pool, { schema })

/** The pool-backed database or a transaction. Code that may run inside a transaction runs its queries in sequence. */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>
