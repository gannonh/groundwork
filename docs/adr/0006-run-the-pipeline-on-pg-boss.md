# 6. Run the pipeline as one pg-boss job per item

Date: 2026-10-07. Status: accepted.

## Context

KAT-3466 runs imported items through detect, quote, and place on the recorded judge. A run must survive the worker being killed, never judge an item twice when started twice, and show live progress. ADR 0004 fixes the judge contract. This ADR fixes how runs execute.

## Decision

- One run per source and pack version (`pipeline_run`). Starting it again queues only the items without a result and moves `started_at` forward, so the items imported since join the run.
- One pg-boss job per item, on an `exclusive` queue with the singleton key `<run>:<item>`, so one item has at most one queued or active job. A job that outlives its worker returns to the queue after 30 seconds.
- A worker judges an item with no database transaction open, then stores the item's answers, mention, placement, and `pipeline_run_item` row in one transaction. Every insert ignores a conflict, so a rerun, or two workers that race, converge on the same rows. An item with a `pipeline_run_item` row is skipped.
- A `JudgeError`, such as a missing recorded answer, is final for that item: the item gets a `failed` row naming it, and the job completes. Any other error is thrown and the queue retries.
- Run progress is derived from `pipeline_run_item` rows and the source's item count by `describeRun`, a pure function. A run holds no counter.
- Placement confidence is the probability of the whole path, P(outcome) times P(problem given outcome), over a beam of two outcomes with a "none" option at each level. Triage is every placement below the pack's `place_confidence`, derived when read and never stored.
- A recorded answer is keyed by a hash of the pack version, the redacted state, and the question's identity (key, type, instructions, and options, with a Choice's options sorted). A key that is not recorded fails the item.

## Consequences

- Killing the worker loses at most the jobs in flight, which return to the queue and finish on restart.
- The worker and the web server are two processes. A run started with no worker running waits.
- Items import with the source's own item count as the run's total, so a reimport into a finished source shows its new items as ready to run.
- One mention per item for now. A pack that asks for several mentions per item needs its own question to count them.
