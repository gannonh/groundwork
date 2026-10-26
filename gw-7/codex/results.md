# GW-7 independent agent review

Reviewed PR #31 at `d5fd62f7ef57630e8b52116ba21ab9949e9a9292` on 2026-10-26 UTC. Main baseline: `2697e02`. No code changes were needed. No unresolved review threads were listed by Punchlist, so no thread replies were required. CI `check` passes; CodeRabbit's skipped status is not a review.

I ran `mise exec node@24 -- node scripts/setup-worktree.ts`, then the verify-groundwork skill's `verify.sh up --prod` and `doctor` for fresh branch and main instances. Both used separate databases, cleared to an empty workspace before importing `fixtures/exports/zendesk-500.csv` through Sources. Each instance had its own recorded-judge worker. All browser checks used the skill's `drive.mjs`, on the PR head after the builder's final push. The builder's earlier results were not counted.

| Check | Result and observation |
| --- | --- |
| 1. Recorded 500-item import on main and branch | PASS. Both completed with 441 placements, 77 below threshold. Main nav and branch nav showed 77; branch Triage showed 77 low-confidence placements. |
| 2. Accept first item | PASS. Clicked Accept: nav 77 → 76, Field mapping needs-review 7 → 6, mentions stayed 36. Before/after map and queue assertions and screenshots recorded. |
| 3. Move to another problem | PASS. Clicked the second guess. Nav 76 → 75. The target evidence sheet showed 47 mentions and contained the moved mention `01a17593-3470-7a33-a876-787df2fc3de0`; the label names Dashboard totals as judge and Can't tell when data was last refreshed as human. |
| 4. Discard | PASS. Nav 75 → 74, quote left the queue, Field mapping mentions 36 → 35. Item page showed Discarded in triage. Stored human opportunity is null, yielding no effective opportunity. |
| 5. Ten keyboard decisions | PASS. Used a, d, j, m, Enter, with no mouse decisions. Label count increased from 3 to 13; nav 74 → 64. Move picker received keyboard focus. |
| 6. Query labels | PASS. All 13 decisions joined to judge answers and carried valid human answers: 8 accept, 2 move, 3 discard. Saved query output includes judge question, value, probabilities, backend and model. |
| 7. Rerun same pack | PASS. Deleted 500 pipeline_run_item completion records in the isolated branch DB to force every item through the worker again. All 500 were judged again. The 13 labels retained digest `8fc07d8909b97cf02ba4ce5dcd0828dd`; placements stayed 441, answers 4,312, queue 64. |
| 8. Empty queue | PASS. After the remaining checks and perf decisions, accepted the last 30 items. Queue clear rendered and nav text became Triage without a count. Final DB: 77 unique decisions, 0 queued. |
| 9. Same item in two tabs | PASS. Both loaded the same item. One accepted; the stale tab reported Already decided, maybe in another tab. Nothing changed. Nav 64 → 63 and only one new label (14 total). |
| 10. 390×844 | PASS. No horizontal document overflow. Both Accept and Discard bounding rectangles fit in the viewport. Screenshot inspected. |

Performance on local production builds: Accept click to updated nav count p50 18.0 ms, p95 34.1 ms, max 38.7 ms (30 samples, MutationObserver on nav). `/opportunities` full server-response p50 10.7 ms branch versus 11.1 ms main (40 alternating samples each after warmup), ratio 0.958. Both budgets pass; these are local measurements.

Targeted domain/server/place tests: 17/17 pass. `git diff --check origin/main...HEAD` passes. Fresh browser step logs contain no page errors, console errors, or HTTP 4xx/5xx. Both instance doctor checks passed at their launched commits.

Harness retries: main's first `verify.sh up --id codex-main --prod` failed because a symlinked node_modules directory was rejected by pnpm. Replaced the symlink with a normal frozen-lockfile install and relaunched successfully. The first shell-generated empty-queue invocation passed literal backslashes to `expect-text` and failed before any decisions; reran with correctly quoted argument strings and all assertions passed. Neither failure was caused by product code. No live checks were skipped.

Fresh evidence:

- [DB queries and outputs](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/db-proof.txt)
- [Performance measurements](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/perf.txt)
- [40-second walkthrough](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/triage-flow.mp4)

![Before accept: 36 mentions, 7 need review](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/map-before.png)
![After accept: 36 mentions, 6 need review](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/map-after.png)
![Before moving the second guess](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/move-before.png)
![Moved quote in target evidence](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/target-after.png)
![Empty queue](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/empty.png)
![390×844](https://github.com/gannonh/groundwork/raw/assets/gw-7/gw-7/codex/narrow.png)
