import type { PgBoss } from 'pg-boss'
import type { ItemId, RunId } from '@/domain/types'
import { createBoss, enqueueItems, ensureQueue } from '@/pipeline/queue'

let producer: Promise<PgBoss> | undefined

/**
 * The web server's connection to the job queue. It only adds jobs: the worker does them, and runs the queue's
 * maintenance. Started on first use, and started again after a failed start.
 */
function queue(): Promise<PgBoss> {
  producer ??= (async () => {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const boss = createBoss(url, { supervise: false, schedule: false })
    await boss.start()
    await ensureQueue(boss)
    return boss
  })().catch((error: unknown) => {
    producer = undefined
    throw error
  })
  return producer
}

export async function enqueueRunItems(runId: RunId, itemIds: readonly ItemId[]): Promise<void> {
  await enqueueItems(await queue(), runId, itemIds)
}
