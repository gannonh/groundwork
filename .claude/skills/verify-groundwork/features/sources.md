# Sources list

`/sources` lists every source in the workspace with its item kind, item count, and creation date, and offers a `New source` button. The seed loads five sources, so the list is never empty on a fresh instance.

## Sub-features

- `sources-list`: a heading `Sources`, a count such as `5 sources`, and one table row per source. The name and the item count both link to `/sources/$id`.
- `sources-new-link`: the `New source` link opens `/sources/new`.
- `sources-empty`: with no sources, the page says `No sources yet.` and links `Import a CSV export`. The seed makes this state unreachable on a verification instance.

## How to get to it (user POV)

- Top bar `Sources`.
- The `Sources` breadcrumb on `/sources/new`, `/sources/$id`, and `/items/$id`.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.

- **List.** Run `node $S/drive.mjs --name sources-list goto=/ click=link/Sources expect-current=Sources expect-text="5 sources" snap=list`. Exit code 0. `list.aria.yml` has rows for `G2`, `Gong`, `Interviews`, `NPS`, and `Zendesk`.
- **Open a source by its count.** Run `node $S/drive.mjs --name sources-open goto=/sources click-in-row="Gong|105 items" expect-text="Call · 105 items" snap=gong`. Exit code 0.
- **After an import.** Each import in [sources-new.md](./sources-new.md) adds a row, so the count reads `6 sources` after the zendesk import, and `click-in-row="zendesk-500|500 items"` opens it.

## Gotchas

- `click-in-row` matches row text case-insensitively as a substring, and fails if more than one row matches. `Zendesk` alone matches both the seed's `Zendesk` row and an imported `zendesk-500` row, so use `zendesk-500` or the seed's full row text.
- The item count is a link, so `click-in-row=<row>|<N items>` is the way to reach the number's evidence, as the map's rule "every number clicks through" asks.
