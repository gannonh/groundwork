# Item detail

`/items/$id` shows one imported item: its date, source, account with ARR, author role, and its numbered sentences. Emails, phone numbers, and card numbers appear as `[email]`, `[phone]`, and `[card]` tokens, because the raw text never leaves the server.

## Sub-features

- `item-header`: breadcrumb `Sources / <source>`, and a heading such as `Ticket from Sep 11, 2026`.
- `item-meta`: Date, Source (a link to `/sources/$id`), Account (name and ARR, or `No account`), and Author (role, or `Not given`).
- `item-sentences`: an ordered list named `Sentences`, one list item per stored sentence, with redaction tokens in place of personal data.
- `item-missing`: an unknown or malformed id shows `Item not found` and a `Back to sources` link.

## How to get to it (user POV)

- On `/sources/$id`, click an item's row.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- The zendesk import in [sources-new.md](./sources-new.md) has run.

- **Redacted sentences.** Run `node $S/drive.mjs --name item-detail goto=/sources click-in-row="zendesk-500|500 items" click-in-row="Jane from Acme|Sep 11, 2026" expect-text="Ticket from Sep 11, 2026" expect-text="Please email me at [email] or call [phone]" snap=item`. Exit code 0. `item.aria.yml` shows `list "Sentences"` with three list items and `definition: No account`.
- **Account appears after an account import.** This needs the [accounts.md](./accounts.md) import. Run `node $S/drive.mjs --name item-account goto=/sources click-in-row="zendesk-500|500 items" click-in-row="Jane from Acme|Sep 11, 2026" expect-text="Driftwood Analytics" snap=item`. Exit code 0. Ticket 1001 belongs to ACC-004, so `item.aria.yml` shows `definition: Driftwood Analytics $384k`.
- **Data proof.** Save the output of `select se.ordinal, se.text from sentence se join item i on i.id = se.item_id where i.body like 'Hi, I''m Jane from Acme%' order by 1` to `item-detail/db.txt`. The stored sentences already carry `[email]` and `[phone]`.
- **Missing.** Run `node $S/drive.mjs --name item-missing goto=/items/not-a-uuid expect-text="Item not found"`. Exit code 0.

## Gotchas

- Item URLs hold a generated UUID that differs per instance. Reach items by clicking, or read the id from the first line of a `.aria.yml` file.
- The Author field shows the role in lower case, such as `executive`.
- The breadcrumb and the Source field are both links named after the source, and the top bar and breadcrumb both have a `Sources` link. `click=link/<name>` fails in strict mode on either pair. Prove the source link with `expect-eval`, or leave the item through the top bar.
