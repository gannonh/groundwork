import * as NodeFs from 'node:fs'
import { z } from 'zod'
import { db, pool } from './db/client.ts'
import { createRecordedJudge, parseRecording } from './judge/backends/recorded.ts'
import type { Judge } from './judge/types.ts'
import type { Pack } from './pack/pack.ts'
import type { RunId } from './domain/types.ts'
import { createBoss, ensureQueue, ITEM_QUEUE, parseItemJob } from './pipeline/queue.ts'
import { loadRunContext, processItem, type RunContext } from './pipeline/run.ts'

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

const boss = createBoss(env.DATABASE_URL)
await boss.start()
await ensureQueue(boss)

await boss.work(ITEM_QUEUE, { batchSize: 10, localConcurrency: 2, pollingIntervalSeconds: 0.5 }, async (jobs) => {
  const contexts = new Map<RunId, RunContext | null>()
  for (const job of jobs) {
    const { runId, itemId } = parseItemJob(job.data)
    if (!contexts.has(runId)) contexts.set(runId, await loadRunContext(db, runId))
    const context = contexts.get(runId)
    if (!context) continue
    const outcome = await processItem(db, context, judgeFor(context.pack), itemId)
    if (outcome.kind === 'failed') console.log(`Item ${itemId} failed: ${outcome.message}`)
    else console.log(`Item ${itemId} ${outcome.kind}`)
  }
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
