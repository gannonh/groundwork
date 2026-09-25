import { eq } from 'drizzle-orm'
import type { Db } from '../client.ts'
import {
  account,
  item,
  judgeAnswer,
  link,
  mention,
  opportunity,
  pack,
  placement,
  sentence,
  source,
  workspace,
} from '../schema.ts'
import type { SeedRows } from './build.ts'

const CHUNK = 500

/**
 * Replaces the seed workspace in one transaction: deleting it cascades to every child row, then everything is
 * inserted again in FK order. Queries run one at a time so this also works inside a caller's transaction.
 */
export async function writeSeed(db: Db, rows: SeedRows): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(workspace).where(eq(workspace.id, rows.workspace.id))
    await tx.insert(workspace).values(rows.workspace)
    await tx.insert(pack).values(rows.pack)
    for (const chunk of chunks(rows.sources)) await tx.insert(source).values(chunk)
    for (const chunk of chunks(rows.accounts)) await tx.insert(account).values(chunk)
    for (const chunk of chunks(rows.opportunities)) await tx.insert(opportunity).values(chunk)
    for (const chunk of chunks(rows.links)) await tx.insert(link).values(chunk)
    for (const chunk of chunks(rows.items)) await tx.insert(item).values(chunk)
    for (const chunk of chunks(rows.sentences)) await tx.insert(sentence).values(chunk)
    for (const chunk of chunks(rows.judgeAnswers)) await tx.insert(judgeAnswer).values(chunk)
    for (const chunk of chunks(rows.mentions)) await tx.insert(mention).values(chunk)
    for (const chunk of chunks(rows.placements)) await tx.insert(placement).values(chunk)
  })
}

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
  return out
}
