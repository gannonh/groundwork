# 3. Compute every metric from placements

Date: 2026-09-24. Status: accepted.

## Context

Every opportunity shows distinct accounts, ARR, mention count, pain, a 12-week trend, and a ranking score. These numbers change whenever a pipeline run adds placements, a PM triages one, or a filter narrows the accounts. The PRD requires every number to click through to the quotes behind it.

Storing totals on the opportunity row is fast to read. It drifts the first time triage moves a mention and a code path forgets to update the total. It also cannot answer a filtered question, such as enterprise accounts in the last 30 days, without a second code path.

## Decision

- Store facts only: items, sentences, mentions, placements, judge answers, accounts, and triage decisions.
- Compute metrics with pure functions in `src/domain/metrics.ts` from placements joined to items and accounts, after filters apply.
- Rank with a pure `rank(metrics, weights)` in `src/domain/rank.ts`. The UI re-ranks on the client with the same function.

## Consequences

- One code path serves the unfiltered map, every filter, triage updates, and reports.
- Filtered counts and click-through quotes always agree, because they come from the same rows.
- Reads cost more than a stored total. The opportunity map has a render budget, checked in its slice. If it breaks the budget, add a cache keyed by filter and placement version. Do not add stored totals.
