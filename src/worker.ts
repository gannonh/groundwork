import * as NodeFs from 'node:fs'
import { z } from 'zod'
import { db, pool } from './db/client.ts'
import { createRecordedJudge, parseRecording } from './judge/backends/recorded.ts'
import type { Judge } from './judge/types.ts'
import type { Pack } from './pack/pack.ts'
import { createBoss, enqueueItems, ensureQueue, ITEM_QUEUE, parseItemJob } from './pipeline/queue.ts'
import { loadRunContext, processItem, unfinishedRuns } from './pipeline/run.ts'

const env = z
  .object({
    DATABASE_URL: z.string(),
    // The recorded backend is the only one so far. KAT-3467 adds jev and llm.
    JUDGE_BACKEND: z.literal('recorded').default('recorded'),
    JUDGE_FIXTURE: z.string().default('fixtures/judge/zendesk-500.jsonl'),
    // Makes a recorded run take the time a live one would, for checks that interrupt a run.
    RECORDED_JUDGE_DELAY_MS: z.coerce.number().int().min(0).default(0),
  })
  .parse(process.env)

const recording = parseRecording(NodeFs.readFileSync(env.JUDGE_FIXTURE, 'utf8'))
const judgeFor = (pack: Pack): Judge =>
  createRecordedJudge(recording, { packVersion: pack.version, model: pack.judge, delayMs: env.RECORDED_JUDGE_DELAY_MS })

// The monitor expires the jobs of a killed worker so they return to the queue, so short intervals shorten the wait after a restart.
const boss = createBoss(env.DATABASE_URL, { superviseIntervalSeconds: 5, monitorIntervalSeconds: 5 })
await boss.start()
await ensureQueue(boss)
for (const { runId, itemIds } of await unfinishedRuns(db)) {
  await enqueueItems(boss, runId, itemIds)
  console.log(`Queued the ${String(itemIds.length)} unfinished items of run ${runId}.`)
}

// One job per handler call: pg-boss starts a job's expiry clock when it fetches the job, so a batch would expire its
// later jobs while the earlier ones ran, and one thrown error would fail the whole batch. localConcurrency gives the parallelism.
await boss.work(ITEM_QUEUE, { batchSize: 1, localConcurrency: 4, pollingIntervalSeconds: 0.5, includeMetadata: true }, async ([job]) => {
  if (!job) return
  const { runId, itemId } = parseItemJob(job.data)
  const context = await loadRunContext(db, runId)
  if (!context) return
  const outcome = await processItem(db, context, judgeFor(context.pack), itemId, job.retryCount < job.retryLimit)
  if (outcome.kind === 'failed') console.log(`Item ${itemId} failed: ${outcome.message}`)
  else console.log(`Item ${itemId} ${outcome.kind}`)
})
console.log(`Worker ready: judging with the ${env.JUDGE_BACKEND} backend from ${env.JUDGE_FIXTURE}.`)

let stopping = false
async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  await boss.stop({ graceful: true, timeout: 10_000 })
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
