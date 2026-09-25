# Groundwork

Groundwork turns customer conversations into a ranked map of customer problems, with verbatim quotes and revenue attached, and syncs the results into Linear. It is for product managers at B2B software companies.

- Product spec: `docs/product/prd.md`.
- Visual spec: variant D in `prototypes/opportunity-map/index.html`. Open it with `open "prototypes/opportunity-map/index.html#hybrid"`.
- Decisions: `docs/adr/`. Read the relevant ADR before changing what it decided.
- Work: the Linear project **Groundwork** in the Kata-sh team (issues KAT-3462 to KAT-3470), milestone **Gate 1: Evidence map from real exports**.

## Stack

TanStack Start on Vite, strict TypeScript, Postgres 18 with pgvector, Drizzle ORM, pg-boss for background jobs, Tailwind with shadcn/ui, Vitest, and Playwright. pnpm on Node 24 LTS.

Keep the setup, scripts, and layout below current as slices land.

### Setup

```sh
nvm use
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

The app serves on http://localhost:3000.

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on port 3000. |
| `pnpm build` | Production build into `.output/`. |
| `pnpm start` | Runs the production build on port 3000. |
| `pnpm lint` | ESLint with typescript-eslint and react-hooks. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Vitest unit tests. Needs the database. |
| `pnpm e2e` | Playwright against `pnpm start`. Run `pnpm build` first. |
| `pnpm db:generate` | Generates a Drizzle migration into `drizzle/`. |
| `pnpm db:migrate` | Applies pending migrations. |
| `pnpm db:seed` | Replaces the Acme Analytics demo workspace with prototype D's data. Safe to rerun. |

`dev`, `start`, `test`, `db:migrate`, and `db:seed` read `.env` when it exists.

### Layout

- `src/routes/`: file routes. `src/routes/api/` holds server routes.
- `src/components/`: custom components. `src/components/opportunities/` holds the opportunity map's cards, detail, and trend bars. `src/components/ui/` holds shadcn/ui components from the CLI; do not hand-edit them.
- `src/domain/`: pure domain code: branded types, `computeMetrics`, `rank`, quote selection, and sentence splitting. No database or React imports.
- `src/server/`: server-only screen loaders (`*.server.ts`) that query the database and build view models for a route's server function.
- `src/db/`: Postgres pool, Drizzle schema, and the migrate and seed scripts. `src/db/seed/` builds prototype D's demo workspace. `src/db/` and `src/domain/` use relative `.ts` imports and erasable TypeScript only, because `node src/db/seed.ts` runs them without a bundler.
- `src/styles/`: `app.css`, the Tailwind theme and prototype tokens.
- `drizzle/`: generated SQL migrations.
- `e2e/`: Playwright specs.
- `scripts/`: dev tooling. `setup-worktree.ts` readies a new worktree with its own database; a local, gitignored `t3.json` runs it when Kata Code creates one.
- `docs/`: product spec, ADRs, and process docs.
- `prototypes/`: throwaway design prototypes.
- `.github/workflows/`: CI.

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

## How agent skills fit

The dev lifecycle (imported below from `docs/process/lifecycle.md`) decides ticket status and when to merge. pstack skills decide how the work gets done inside a status. Do not run the autopilot or orchestrate playbooks unless Gannon asks for them.

## Dev lifecycle

@docs/process/lifecycle.md

<!-- begin global rules -->
## Subagent delegation

- Delegate independent, bounded tasks when parallel work can save time or improve quality. Follow configured role assignments and give each agent the context, scope, and expected result. Keep dependent work sequential and avoid overlapping edits.
- Keep agent messages readable, with proper spacing. Review and integrate delegated results, then verify the combined outcome before reporting completion.

## Verifying work

- Tests alone do not prove a slice. Before a PR leaves draft, run the app, drive the changed screen in a browser, and record or screenshot the result.
- Unit tests call the code the way its users do and assert literal expected values.
- Live TypeSafe and LLM calls cost money, and TypeSafe has no sandbox. Tests use the recorded judge backend. Make live calls only in named live checks.
- Live browser checks per PR: 10 scenarios when the slice changes a screen, 4 when it does not. Scenario 1 runs the same flow on `main` and on the branch. Each Linear issue lists its scenarios.
- A PR that changes a screen carries screenshots and a 30 to 60 second video for Human Review.
<!-- end global rules -->

<!-- begin integrated browser rules -->
## Integrated browser (Kata Code)

NOTE: this section only applies when running in the Kata Code environment.

The integrated browser is the Kata Code preview browser. Agents reach it through the `t3-code` MCP server, whose tools are named `mcp__t3-code__preview_*`. The tools are deferred. Load them with ToolSearch before the first call, for example `select:mcp__t3-code__preview_open,mcp__t3-code__preview_navigate,mcp__t3-code__preview_snapshot,mcp__t3-code__preview_click,mcp__t3-code__preview_evaluate,mcp__t3-code__preview_recording_start,mcp__t3-code__preview_recording_stop`.

- `preview_open` opens a tab and returns a `tabId`. Pass `reuseExistingTab: false` for a second tab. Pass `tabId` to every later call.
- `preview_navigate`, `preview_click`, `preview_press`, `preview_type`, `preview_wait_for`, `preview_evaluate`, `preview_resize`, and `preview_scroll` drive the page.
- `preview_snapshot` returns page text, the accessibility tree, and a screenshot. Pass `includeImage: false` and `save: true`, then read `screenshotPath` from the result. Full snapshots are often too large to read inline. Use `preview_evaluate` for targeted reads.
- `preview_recording_start` and `preview_recording_stop` record one tab. The stop call returns an MP4 path under `~/.katacode/userdata/attachments/`. Convert it with ffmpeg if a script expects another format.
- `preview_status` reports whether a tab is still usable.

### Reaching a local server

The browser runs on the Kata Code client, which can be a different machine from the agent's host. It cannot load `localhost` or `127.0.0.1` on the agent's host, and the `environment-port` navigation target currently fails. Reach local servers over Tailscale:

1. Get the host's Tailscale address with `tailscale ip -4`. Do not hardcode it.
2. Bind the server the browser loads to that address, for example `vite --host "$(tailscale ip -4)" --port <port>`. Do not bind to `0.0.0.0`.
3. Open `http://<tailscale-ip>:<port>` in the integrated browser.
4. If the app checks the `Origin` or `Host` header, add `http://<tailscale-ip>:<port>` to its allowed origins or hosts for the run. Keep backend services the page reaches through the dev server's proxy bound to `127.0.0.1`.
5. Stop the Tailscale-bound server when the run ends.

### Known limits

- `about:blank` is refused. To leave a page, navigate to a neutral public URL.
- Playwright role locators may not match canvas elements. Get the element's position with `preview_evaluate` and click with `x` and `y`.
- The client can disconnect mid-run and lose a recording in progress. Keep each recording to one action and stop it right after. If `preview_status` reports `available: false`, open a new tab and repeat the step.
<!-- end integrated browser rules -->

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
