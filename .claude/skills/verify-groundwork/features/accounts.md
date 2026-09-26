# Accounts

`/accounts` lists the workspace's accounts with their external ID, name, ARR, plan, and segment, and imports more from a CSV. Choosing a file imports it at once, with no mapping step. An import adds new accounts, updates existing ones by Account ID, and links already-imported items whose account column names them.

## Sub-features

- `accounts-list`: a heading `Accounts`, a count such as `277 accounts` on a fresh instance, and one table row per account.
- `accounts-import`: choosing a CSV with `Account ID`, `Name`, `ARR`, and optional `Plan` and `Segment` shows `Importing <file>…`, then a `status` notice `Imported N accounts (C new, U updated).`, plus `Linked K items to their accounts.` when items matched. The table and count refresh.
- `accounts-reimport`: importing the same file again reports every account as updated and none as new.
- `accounts-error`: a file that is not a valid CSV shows an `alert` with the parse error.

## How to get to it (user POV)

- Top bar `Accounts`.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- For the item links, the zendesk import in [sources-new.md](./sources-new.md) has run first.

- **Import.** Run `node $S/drive.mjs --name accounts-import goto=/ click=link/Accounts expect-current=Accounts expect-text="277 accounts" snap=before choose-file="Account CSV|fixtures/exports/accounts-60.csv" expect-text="Imported 60 accounts (60 new, 0 updated)." expect-text="Linked" expect-text="337 accounts" snap=imported`. Exit code 0. After only the zendesk import, the notice ends `Linked 450 items to their accounts.` After both the zendesk and nps imports, it says 750. With no item import first, the notice has no `Linked` sentence and the drive fails at `expect-text=Linked`.
- **Re-import.** Run `node $S/drive.mjs --name accounts-reimport goto=/accounts choose-file="Account CSV|fixtures/exports/accounts-60.csv" expect-text="(0 new, 60 updated)" expect-text="337 accounts" snap=again`. Exit code 0.
- **Data proof.** Save the output of `select count(*) as accounts, (select count(account_id) from item i join source s on s.id = i.source_id where s.name = 'zendesk-500') as linked_items from account where external_id like 'ACC-%'` to `accounts-import/db.txt`. It shows `60 | 450`.

## Gotchas

- The file input's label is the long `Account CSV (Account ID, Name, ARR, and optional Plan and Segment)`. `choose-file` matches a label substring, so `Account CSV` is enough.
- The seed's 277 accounts use other IDs, so the 60 fixture accounts are all new on a fresh instance.
- `nps-300.csv` rows also name `ACC-` accounts, which is why the `Linked` count depends on what was imported before.
