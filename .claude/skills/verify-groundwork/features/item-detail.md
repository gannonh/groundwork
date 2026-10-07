# Item detail

`/items/$id` shows one imported item: its date, source, account with ARR, author role, its mentions, and its numbered sentences. When the PM arrives from a quote on the opportunity map, the quote's sentences are highlighted and a back link returns to the same map view. Emails, phone numbers, and card numbers appear as `[email]`, `[phone]`, and `[card]` tokens, because the raw text never leaves the server.

## Sub-features

- `item-header`: breadcrumb `Sources / <source>`, and a heading such as `Ticket from Sep 11, 2026`.
- `item-meta`: Date, Source (a link to `/sources/$id`), Account (name and ARR, or `No account`), and Author (role, or `Not given`).
- `item-sentences`: an ordered list named `Sentences`, one list item per stored sentence, with redaction tokens in place of personal data.
- `item-mentions`: a list named `Mentions`, one row per mention of the item in the workspace's newest pack, ordered by first sentence. Each row shows the opportunity title, `Problem in <outcome>` or `Solution in <problem>`, `Sentence N` or `Sentences N–M`, and the confidence. A placement below the pack's place threshold (0.7 in the seed) gets an amber left border and an amber `NN% confident` pill. A mention with no placement reads `Not placed yet`. An item with no mentions reads `No mentions in this item yet.`
- `item-highlight`: `?mention=<id>` marks that mention's sentences in the `Sentences` list and marks its row in `Mentions`. Clicking another row moves the highlight. A malformed, unknown, or other item's mention id highlights nothing.
- `item-back`: `?from=<map view as JSON>` shows a first link, `← Back to the evidence list` when the view had a list open and `← Back to opportunities` otherwise. It opens the same `/opportunities` view. A malformed `from` shows no link.
- `item-missing`: an unknown or malformed id shows `Item not found` and a `Back to sources` link.

## How to get to it (user POV)

- On `/sources/$id`, click an item's row.
- On `/opportunities`, click the source label (`Zendesk ticket · Sep 11`) under any quote, in the detail or in an evidence list.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- The zendesk import in [sources-new.md](./sources-new.md) has run.

- **Redacted sentences.** Run `node $S/drive.mjs --name item-detail goto=/sources click-in-row="zendesk-500|500 items" click-in-row="Jane from Acme|Sep 11, 2026" expect-text="Ticket from Sep 11, 2026" expect-text="Please email me at [email] or call [phone]" snap=item`. Exit code 0. `item.aria.yml` shows `list "Sentences"` with three list items and `definition: No account`.
- **Account appears after an account import.** This needs the [accounts.md](./accounts.md) import. Run `node $S/drive.mjs --name item-account goto=/sources click-in-row="zendesk-500|500 items" click-in-row="Jane from Acme|Sep 11, 2026" expect-text="Driftwood Analytics" snap=item`. Exit code 0. Ticket 1001 belongs to ACC-004, so `item.aria.yml` shows `definition: Driftwood Analytics $384k`.
- **Data proof.** Save the output of `select se.ordinal, se.text from sentence se join item i on i.id = se.item_id where i.body like 'Hi, I''m Jane from Acme%' order by 1` to `item-detail/db.txt`. The stored sentences already carry `[email]` and `[phone]`.
- **From a quote.** Run `node $S/drive.mjs --name item-quote goto=/opportunities "click=link/Show the 141 mentions" "expect-text=141 mentions" "click-in-figure=Totals are different depending|Open G2 review · Aug 25" "expect-text=Review from Aug 25, 2026" "expect-eval=[...document.querySelectorAll('ol[aria-label=Sentences] mark')].map(m=>m.textContent).join()==='Totals are different depending on which page you look at?'" snap=item back= "expect-url=/opportunities?evidence=mentions&selected=0e64ff74-d1e2-8d47-8251-6935c4e2e378" snap=back`. Exit code 0. `item.png` shows the Lumen Clinics item with the `62% confident` pill and the highlighted sentence. `back.png` shows the evidence list still open.
- **Missing.** Run `node $S/drive.mjs --name item-missing goto=/items/not-a-uuid expect-text="Item not found"`. Exit code 0.

## Gotchas

- The seed gives every item one mention of one sentence, so `Mentions` has one row. Insert a second mention with SQL against the run database to see the highlight move.
- Seeded `from` values and URL key order can differ from the map's. Compare search params as a sorted list, not as a string.

- Item URLs hold a generated UUID that differs per instance. Reach items by clicking, or read the id from the first line of a `.aria.yml` file.
- The Author field shows the role in lower case, such as `executive`.
- The breadcrumb and the Source field are both links named after the source, and the top bar and breadcrumb both have a `Sources` link. `click=link/<name>` fails in strict mode on either pair. Prove the source link with `expect-eval`, or leave the item through the top bar.
