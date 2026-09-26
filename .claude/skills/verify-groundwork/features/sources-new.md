# Import a CSV export

At `/sources/new` a product manager chooses a CSV export, checks a guessed column mapping against a 20-row preview, and imports it. Each row becomes an item whose text is split into redacted, numbered sentences. A second upload with the same header reuses the saved mapping and skips rows it already has.

## Sub-features

- `import-preview`: choosing a file parses it in the browser and shows six Selects (Text column, Date column, Date format, Account column, Author column, Item kind), the button `Import N rows`, and a preview captioned `Showing 20 of N rows`.
- `import-mapping`: changing a Select changes the mapping that the import uses. Item kind defaults to Ticket.
- `import-bad-date`: dates that do not match the chosen format fail the whole import with an `alert` such as `170 dates don't match MM/DD/YYYY (rows 2, 3, 6, and 167 more).` Nothing is written.
- `import-done`: a successful import shows a `status` notice `Imported N items. M duplicates skipped.` with a link `Open <file name without .csv>`.
- `import-reupload`: choosing a file whose header matches an earlier source shows `Mapping remembered from <source>.`, and importing it again reports every row as a duplicate.

## How to get to it (user POV)

- Top bar `Sources`, then the `New source` button.
- On an empty workspace, the `Import a CSV export` link on `/sources`.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- The fixtures exist in `fixtures/exports/`. Run `pnpm fixtures:generate` if they do not.

- **Import a ticket export.** Run `node $S/drive.mjs --name import-zendesk goto=/ click=link/Sources click=link/"New source" expect-url=/sources/new choose-file="CSV export|fixtures/exports/zendesk-500.csv" expect-text="Showing 20 of 500 rows" snap=preview click=button/"Import 500 rows" expect-text="Imported 500 items. 0 duplicates skipped." snap=imported`. Exit code 0. `preview.aria.yml` shows `combobox "Text column": Description` and `combobox "Account column": Organization ID`.
- **Pick a date format and item kind.** `nps-300.csv` uses DD/MM/YYYY dates. Run `node $S/drive.mjs --name import-nps goto=/sources click=link/"New source" choose-file="CSV export|fixtures/exports/nps-300.csv" select="Date format|MM/DD/YYYY" select="Item kind|Survey response" click=button/"Import 300 rows" expect-text="170 dates don't match MM/DD/YYYY" snap=bad-format select="Date format|DD/MM/YYYY" click=button/"Import 300 rows" expect-text="Imported 300 items" click=link/"Open nps-300" expect-text="Survey response · 300 items" snap=source`. Exit code 0.
- **Re-upload.** Run `node $S/drive.mjs --name import-again goto=/sources/new choose-file="CSV export|fixtures/exports/zendesk-500.csv" expect-text="Mapping remembered from zendesk-500." click=button/"Import 500 rows" expect-text="Imported 0 items. 500 duplicates skipped." snap=again`. Exit code 0.
- **Data proof.** Save the output of this query to `import-zendesk/db.txt`: `select s.name, s.item_kind, count(i.id) as items from source s join item i on i.source_id = s.id where s.name in ('zendesk-500', 'nps-300') group by 1, 2 order by 1`. It shows `nps-300 | survey_response | 300` and `zendesk-500 | ticket | 500`.

## Gotchas

- `choose-file` takes the file input's label (`CSV export`) and a path relative to the repo root. The browser parses the file before any request, so a parse error such as a missing header shows as an `alert` without a network call.
- The `select` step waits for the listbox to close and the trigger to show the option. Snapping while a Select is open captures only the listbox, because Radix hides the rest of the page from the accessibility tree.
- The mapping guess already fits `zendesk-500.csv`, so a `select` there changes nothing. Use `nps-300.csv` to prove a pick takes effect.
- A source is named after its file without `.csv`. The seed's own sources (`Zendesk`, `NPS`, `Gong`, `G2`, `Interviews`) are separate from imported ones.
- The instance database is fresh per `up`. Run the re-upload recipe only after the first import in the same instance.
