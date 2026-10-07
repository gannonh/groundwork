import { PgBoss, type ConstructorOptions } from 'pg-boss'
import { z } from 'zod'
import type { ItemId, RunId } from '../domain/types.ts'

/** One job per item of a run. */
export const ITEM_QUEUE = 'pipeline-item'

const itemJob = z.strictObject({ runId: z.guid(), itemId: z.guid() })
export type ItemJob = { readonly runId: RunId; readonly itemId: ItemId }

/** Parses the payload of a job that came out of the queue. */
export function parseItemJob(data: unknown): ItemJob {
  return itemJob.parse(data) as ItemJob
}

export function createBoss(connectionString: string, options: ConstructorOptions = {}): PgBoss {
  const boss = new PgBoss({ connectionString, ...options })
  // Without a listener Node exits on the queue's connection errors.
  boss.on('error', (error) => {
    console.error('pg-boss error:', error.message)
  })
  return boss
}

/**
 * Creates the queue if it does not exist. `exclusive` with a singleton key per item allows one queued or active job
 * per item, so starting a run twice queues nothing twice. A job that outlives its worker returns to the queue after
 * 30 seconds, and the item is skipped if it finished first.
 */
export async function ensureQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(ITEM_QUEUE, {
    policy: 'exclusive',
    expireInSeconds: 30,
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    deleteAfterSeconds: 3600,
  })
}

const INSERT_CHUNK = 1000

export async function enqueueItems(boss: PgBoss, runId: RunId, itemIds: readonly ItemId[]): Promise<void> {
  for (let i = 0; i < itemIds.length; i += INSERT_CHUNK) {
    await boss.insert(
      ITEM_QUEUE,
      itemIds.slice(i, i + INSERT_CHUNK).map((itemId) => ({ data: { runId, itemId }, singletonKey: `${runId}:${itemId}` })),
    )
  }
}
