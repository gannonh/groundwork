# Groundwork verification map

This directory lists the user-facing behavior of Groundwork that can be verified. Read this index before driving the app, then follow the matching feature file as the recipe. When a slice adds or changes a screen, update the feature file in the same PR.

## Baseline preconditions

- Run `verify.sh up` and wait for the `ready` line. Use `--host tailscale` only for the Kata Code integrated browser.
- `verify.sh doctor` exits 0 for the instance you are about to drive.
- The instance has its own database, `gw_verify_<id>`, with every migration applied and the seed run. The seed loads prototype D's Acme Analytics workspace, so Opportunities shows 12 ranked problems, Sources lists 5 sources, and Accounts lists 277 accounts. Triage and Packs start empty.
- Drive only an instance that `verify.sh` started in this worktree.

## Driving conventions

- Paths are relative to the instance `URL` in `.verify/instances/<id>/state.env`. Ports come from the range 4100-4199 and change from run to run.
- Target elements by ARIA role and accessible name. Use `choose-file`, `select`, and `click-in-row` for file inputs, Selects, and links inside a table row. The top bar is the only `navigation` landmark. Each screen renders a `main` landmark.
- Give each scenario its own `drive.mjs --name <feature-id>` so its evidence gets its own folder.
- Use default viewport `1440x900` for desktop proof. Use `390x844` for narrow proof: below the `sm` breakpoint the Groundwork wordmark is hidden visually but kept for screen readers.

## Proof and skip reporting

- Record the user action and the resulting state, as `snap` steps before and after the action, or as one video.
- UI proof is an `expect-*` assertion plus a `.png` and a `.aria.yml`.
- API proof is the `curl` command, the response body, and the status code.
- Data proof is the SQL query and its output against the run database, saved as a `.txt` file.
- Check `steps.log` for `pageerror`, `console.error`, and `http 4xx/5xx` lines. Report every one, even when the run passed.
- Report a skipped entry point together with the command you tried. Never report it as verified through another path.

## Feature entry contract

Each feature file starts with an H1 title and a one-paragraph description of what the user sees. Then come four H2 sections, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, and `Gotchas`.

## Features

- [App shell navigation](./navigation.md): the top bar, moving between the five sections, and the active-section marker.
- [Section routes](./section-routes.md): opening each section directly by URL, reloading, the browser back button, and the Not Found page.
- [Opportunity map](./opportunities.md): the ranked problem cards, the selected problem's detail, selection in the URL, and the empty state.
- [Sources list](./sources.md): every source with its item count, and the `New source` button.
- [Import a CSV export](./sources-new.md): choosing a file, the column mapping Selects and preview, date format errors, the import result, and re-uploads.
- [Source detail](./source-detail.md): one source's mapping and its 100 newest items, each opening its item.
- [Item detail](./item-detail.md): one item's date, source, account, author, and redacted, numbered sentences.
- [Accounts](./accounts.md): the account table and the account CSV import that links items to accounts.
- [Health check](./health.md): `GET /api/health` reports whether the server can reach Postgres.

## Not built yet

These PRD features have no screen yet: the opportunity map's weights, filters, outcome grouping, and other URL view state, triage, packs, and Linear sync. The Triage and Packs routes still render an empty `main`. When a slice lands one of them, add a feature file for it here.
