# Groundwork

Groundwork turns customer conversations into a ranked map of customer problems, with verbatim quotes and revenue attached, and syncs the results into Linear. It is for product managers at B2B software companies.

- Product spec: `docs/product/prd.md`.
- Visual spec: variant D in `prototypes/opportunity-map/index.html`. Open it with `open "prototypes/opportunity-map/index.html#hybrid"`.
- Decisions: `docs/adr/`. Read the relevant ADR before changing what it decided.
- Work: the Linear project **Groundwork** in the Kata-sh team (issues KAT-3462 to KAT-3470), milestone **Gate 1: Evidence map from real exports**.

## Stack

TanStack Start on Vite, strict TypeScript, Postgres 18 with pgvector, Drizzle ORM, pg-boss for background jobs, Tailwind with shadcn/ui, Vitest, and Playwright. pnpm on Node 22 LTS.

The app does not exist yet. The scaffold slice adds the commands and the layout to this section. Keep both current as slices land.

## Rules for the code

- Compute every number the UI shows (accounts, ARR, mentions, pain, trend, score) from stored placements with pure functions in `src/domain/`. Never store a count or a total on an opportunity.
- Every number on screen clicks through to the quotes and source items behind it.
- The judge answers narrow questions. Code counts, joins, ranks, schedules, and handles every number and date. An LLM writes only text a person reads, such as opportunity names, summaries, and issue bodies.
- Redact emails, phone numbers, and card numbers before any text leaves the server. Judge and LLM calls read redacted sentences, never the raw item.
- Every judge answer stores its backend, model version, and pack version. Pin model versions such as `jev-1.13.0`. Never send `jev-latest`.
- Parse external data where it enters: uploads, pack YAML, judge responses, Linear responses. Trust typed data inside.
- Pipeline jobs are idempotent per item and pack version. A rerun converges to the same placements.
- The opportunity map keeps its view state (weights, filters, grouping, layout, selection) in typed URL search params. The URL is the saved view.
- Low-confidence placements go to triage, and the UI marks them wherever they affect a number.

## Design rules

- Prototype D is the visual spec. Match its density, card style, and tokens.
- Use shadcn/ui for standard controls. Restyle them through the theme variables in `src/styles/app.css`, not per-component overrides.
- Rank cards, score bars, sparklines, trend bars, and quotes are custom components.
- Design a new screen as a throwaway prototype first. Build three variants behind one switcher under `prototypes/<screen>/`, get Gannon's pick, then cut slices.

## Verifying work

- Tests alone do not prove a slice. Before a PR leaves draft, run the app, drive the changed screen in a browser, and screenshot the result.
- Unit tests call the code the way its users do and assert literal expected values.
- Live TypeSafe and LLM calls cost money, and TypeSafe has no sandbox. Tests use the recorded judge backend. Make live calls only in named live checks.
- Live browser checks per PR: 10 scenarios when the slice changes a screen, 4 when it does not. Scenario 1 runs the same flow on `main` and on the branch. Each Linear issue lists its scenarios.
- A PR that changes a screen carries screenshots and a 30 to 60 second video for Human Review.

## How agent skills fit

The dev lifecycle (imported below from `docs/process/lifecycle.md`) decides ticket status and when to merge. pstack skills decide how the work gets done inside a status. Do not run the autopilot or orchestrate playbooks unless Gannon asks for them.

## Dev lifecycle

@docs/process/lifecycle.md

<!-- pstack:models:begin -->
# pstack model configuration

Provider-qualified per-role choices. Read the installed pstack provider-dispatch reference before dispatching a configured role. Every documented role remains present. `inherit-parent` and `auto` use the parent model natively and still count as one panel lane.

feature, refactoring: claude:opus@high
bug-fix: claude:opus@high
perf-issue: claude:opus@high
hillclimb: claude:opus@low
judgment and prose: claude:opus@high
hardest tasks: claude:opus@xhigh
how explorer: claude:opus@high
how explainer: claude:opus@high
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: claude:fable@medium, claude:opus@xhigh, codex:gpt-6-sol@medium, cursor:grok-4.7@xhigh
arena cross-judge pool: claude:fable@medium, claude:opus@xhigh, codex:gpt-6-sol@medium, cursor:grok-4.7@xhigh
swarm workers: claude:opus@high
architect runners: claude:fable@medium, claude:opus@xhigh, codex:gpt-6-sol@medium, cursor:grok-4.7@xhigh
interrogate reviewers: claude:fable@medium, claude:opus@xhigh, codex:gpt-6-sol@medium, cursor:grok-4.7@xhigh
<!-- pstack:models:end -->
