import { randomUUID } from 'node:crypto'
import { DrizzleQueryError, TransactionRollbackError } from 'drizzle-orm'
import pg from 'pg'
import type { WorkspaceId } from '../domain/types.ts'
import { db, type Db } from './client.ts'
import { workspace } from './schema.ts'

/** Runs `work` in a transaction that is always rolled back, and returns its result. */
export async function rollbackAfter<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  let result: { value: T } | undefined
  try {
    await db.transaction(async (tx) => {
      result = { value: await work(tx) }
      tx.rollback()
    })
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error
  }
  if (!result) throw new Error('the transaction produced no result')
  return result.value
}

/** Runs `work` in a savepoint. Returns the constraint it violated, or null when it succeeds. */
export async function violatedConstraint(tx: Db, work: (savepoint: Db) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.transaction(async (savepoint) => {
      await work(savepoint)
    })
    return null
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    if (cause instanceof pg.DatabaseError && cause.constraint) return cause.constraint
    throw error
  }
}

/** A fresh workspace, so concurrent test files never lock or read each other's rows or the seed's. */
export async function insertWorkspace(tx: Db): Promise<WorkspaceId> {
  const [row] = await tx.insert(workspace).values({ slug: `test-${randomUUID()}`, name: 'Test workspace' }).returning({ id: workspace.id })
  if (!row) throw new Error('the workspace insert returned no row')
  return row.id
}
