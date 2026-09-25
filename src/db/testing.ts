import { DrizzleQueryError, TransactionRollbackError } from 'drizzle-orm'
import pg from 'pg'
import { db, type Db } from './client.ts'

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
