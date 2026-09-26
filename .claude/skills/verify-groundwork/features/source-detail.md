# Source detail

`/sources/$id` shows one source: its name, item kind, item count, creation date, the column mapping it was imported with, and its 100 newest items. Each row shows the item's date, account, author role, and redacted first sentence, and the whole row opens the item.

## Sub-features

- `source-header`: heading with the source name and a line such as `Ticket · 500 items · Created Sep 26, 2026`.
- `source-mapping`: a term list of Text, Date (with format), Account, and Author columns. Seeded sources have no mapping and skip it.
- `source-items`: up to 100 rows, newest first, and the caption `Showing 100 of 500 items, newest first.` Items without a linked account show `No account`.
- `source-missing`: an unknown or malformed id shows `Source not found` and a `Back to sources` link.

## How to get to it (user POV)

- On `/sources`, click a source's name or item count.
- After an import on `/sources/new`, click `Open <source>`.
- On `/items/$id`, click the source in the breadcrumb or the Source field.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- The zendesk import in [sources-new.md](./sources-new.md) has run.

- **Open and read.** Run `node $S/drive.mjs --name source-detail goto=/sources click-in-row="zendesk-500|500 items" expect-text="Ticket · 500 items" expect-text="Created at (YYYY-MM-DD)" expect-text="Showing 100 of 500 items, newest first." snap=detail`. Exit code 0.
- **Open an item.** Run `node $S/drive.mjs --name source-item goto=/sources click-in-row="zendesk-500|500 items" click-in-row="Jane from Acme|Sep 11, 2026" expect-text="Ticket from Sep 11, 2026" snap=item`. Exit code 0.
- **Missing.** Run `node $S/drive.mjs --name source-missing goto=/sources/not-a-uuid expect-text="Source not found" click=link/"Back to sources" expect-url=/sources`. Exit code 0.

## Gotchas

- The item link's accessible name is the formatted date, such as `Sep 11, 2026`, and many rows share a date. Pick the row by its first sentence and then the date: `click-in-row="Jane from Acme|Sep 11, 2026"`.
- Only the 100 newest items render. An older item, such as one from June, is not in the table.
- Rows show `No account` until [accounts.md](./accounts.md) imports `accounts-60.csv`. After that, 450 of the 500 zendesk items show an account name.
