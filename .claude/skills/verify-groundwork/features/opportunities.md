# Opportunity map

The Opportunities screen ranks customer problems as cards on the left, using fixed Balanced weights, and shows the selected problem's evidence on the right. The detail shows its stats, mentions per week, quotes, requested solutions, and top accounts. The URL names the selection, so a reload, a pasted link, or the Back button shows the same card. With no data, the screen shows an empty state instead.

## Sub-features

- `map-list`: `/opportunities` shows 12 cards in this order, with this score, ARR, and trend pill. A title followed by an issue id also shows that linked-issue pill. Review is the amber needs-review count on the card.

  | # | Problem | Score | ARR | Trend | Review |
  | --- | --- | --- | --- | --- | --- |
  | 1 | Dashboard totals don't match the source system | 96 | $2.31M | +36% | 9 |
  | 2 | CSV imports fail silently on malformed rows | 77 | $1.42M | +27% | 6 |
  | 3 | Viewers need a paid seat to see a dashboard (LIN-482) | 75 | $1.88M | +25% | 5 |
  | 4 | Admins can't restrict access by team | 67 | $1.64M | +25% | 2 |
  | 5 | Usage-based bill is unpredictable | 57 | $1.12M | +22% | 7 |
  | 6 | Field mapping must be redone for every import | 52 | $980k | +5% | 2 |
  | 7 | Can't tell when data was last refreshed (LIN-417) | 49 | $1.05M | 0% | 3 |
  | 8 | No way to backfill historical data | 39 | $610k | +22% | 1 |
  | 9 | Exported charts lose formatting in slides | 30 | $540k | -50% | 4 |
  | 10 | SSO setup requires contacting support | 28 | $720k | 0% | none |
  | 11 | No scheduled email digest | 23 | $390k | 0% | 3 |
  | 12 | Timezone handling shifts daily counts | 19 | $420k | -40% | 2 |

- `map-detail`: the detail stats row reads Accounts, ARR, Mentions, Pain. For card 1 it is `44`, `$2.31M`, `141`, `Deal breaker`. For card 4 it is `19`, `$1.64M`, `47`, `Deal breaker`. The sections follow in this order: Mentions per week (12 bars, the last 4 dark, from `Jun 29` to `Week of Sep 14`), What customers said, Requested solutions, Top accounts. Card 1's solutions are `Reconciliation view vs. source` 36, `Show calculation lineage per metric` 29, and `Export raw rows behind a number` 14. Its top accounts are Cobalt Insurance $310k, Halcyon Bank $240k, Orbitly $132k, Lumen Clinics $74k, and Kite Dynamics $52k.
- `map-select`: clicking a card highlights it, shows its detail, and pushes `/opportunities/<id>` onto the history. Back returns to the previous card.
- `map-direct`: opening `/opportunities/<id>` directly selects that card and scrolls it into view. `/` and `/opportunities` redirect to card 1.
- `map-low`: low-confidence quotes have an amber left border and a `NN% confident` pill. Card 1 shows `9 need review` and one flagged quote from Lumen Clinics, `62% confident`.
- `map-unknown`: an unknown id keeps the list and shows `Opportunity not found` in the detail pane.
- `map-empty`: with no workspace, `/opportunities` shows `No opportunities yet` with an `Import a source` link to `/sources`.
- `map-width`: at 1100x800 the page has no horizontal scroll.

Seeded ids are deterministic, so these paths hold on every run:

| # | Path |
| --- | --- |
| 1 | `/opportunities/0e64ff74-d1e2-8d47-8251-6935c4e2e378` |
| 2 | `/opportunities/b2d496f2-f395-891c-b8cb-5091d140af27` |
| 3 | `/opportunities/8ef85c10-bd90-8dd6-9ffb-65b8f237ea96` |
| 4 | `/opportunities/00a0c63a-240b-8116-8c54-73c65e0bf9fa` |
| 5 | `/opportunities/268fd269-10c6-8550-b899-a83f19ea077b` |
| 6 | `/opportunities/a696c372-8c2c-870d-a1ef-598837588a31` |
| 7 | `/opportunities/d3663640-fa75-825a-874b-8cfb0eff0e1e` |
| 8 | `/opportunities/52a8a012-dd8b-8a7e-aa68-76e1f5a12e09` |
| 9 | `/opportunities/f0e6f097-8c4a-87c6-aeb7-b006f5b8ce45` |
| 10 | `/opportunities/b6f18231-8c75-8987-8be8-229734be178b` |
| 11 | `/opportunities/7d5edfd3-3837-8442-8ca1-63c43dc10b64` |
| 12 | `/opportunities/76accd2b-babd-8df2-8ddb-2294e47a7fe7` |

## How to get to it (user POV)

- Choose Opportunities in the top bar, or open `/`.
- Click a card in the ranked list.
- Paste or reload a detail URL.
- Press the browser Back button after choosing cards.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met, including the seed.
- Run `source .verify/instances/<id>/state.env` so that `$URL`, `$DB_NAME`, and `$EVIDENCE_DIR` are set.

- **List and detail.** Run `node $S/drive.mjs --name map-list goto=/opportunities expect-url=/opportunities/0e64ff74-d1e2-8d47-8251-6935c4e2e378 "expect-text=Dashboard totals don't match the source system" expect-text=\$2.31M expect-text=141 snap=map`. Exit code 0. `map.aria.yml` shows the `Ranked problems` region with 12 `listitem` links named by title, in the table's order, and the `Opportunity detail` complementary with the four stats. Compare `map.png` with prototype D in Split layout (`prototypes/opportunity-map/index.html#hybrid`).
- **Select and Back.** Run `node $S/drive.mjs --name map-select --video goto=/opportunities "click=link/Admins can't restrict access by team" expect-url=/opportunities/00a0c63a-240b-8116-8c54-73c65e0bf9fa "expect-text=Team-scoped permissions" snap=after back= expect-url=/opportunities/0e64ff74-d1e2-8d47-8251-6935c4e2e378`. Exit code 0. `after.png` shows card 4 with the accent border and its detail.
- **Direct load.** Run `node $S/drive.mjs --name map-direct goto=/opportunities/7d5edfd3-3837-8442-8ca1-63c43dc10b64 "expect-text=No scheduled email digest" snap=direct`. Exit code 0. `direct.png` shows card 11 scrolled into view with the accent border.
- **Low confidence.** Run `node $S/drive.mjs --name map-low goto=/opportunities "expect-text=9 need review" "expect-text=62% confident" snap=low`. Exit code 0. `low.png` shows the Lumen Clinics quote with the amber left border.
- **Unknown id.** Run `node $S/drive.mjs --name map-unknown goto=/opportunities/00000000-0000-0000-0000-000000000000 "expect-text=Opportunity not found" snap=unknown`. Exit code 0.
- **Width.** Run `node $S/drive.mjs --name map-width --viewport 1100x800 goto=/opportunities snap=narrow`. `narrow.png` shows no horizontal scrollbar. In the integrated browser, `preview_evaluate` with `document.documentElement.scrollWidth <= innerWidth` returns `true`.
- **Empty state.** Only on your own instance: run `docker compose exec -T db psql -U groundwork -d $DB_NAME -c 'delete from workspace'`, then `node $S/drive.mjs --name map-empty goto=/opportunities "expect-text=No opportunities yet" snap=empty`. Exit code 0. Restore the data with `DATABASE_URL=postgres://groundwork:groundwork@localhost:5432/$DB_NAME node src/db/seed.ts`.
- **Data.** Run `docker compose exec -T db psql -U groundwork -d $DB_NAME -c 'select (select count(*) from opportunity) opportunities, (select count(*) from account) accounts, (select count(*) from placement) placements' | tee "$EVIDENCE_DIR/map-data.txt"`. It prints `36 | 277 | 767`.

## Gotchas

- Split cards do not show accounts. The AC's 44 accounts is in card 1's detail, which is selected at `/opportunities`.
- Each card link's accessible name is the problem title. Its score, ARR, trend, and review count are in the link's description. `click=link/<title>` uses the exact title.
- The trend window ends at the newest seeded item, the week of Sep 14 2026, not today. The map reads the same on any date.
- Three trend pills differ from the prototype because the seed's weekly counts must sum to each problem's mentions: SSO setup shows 0% (prototype -3%), the email digest shows 0% (+4%), and timezone handling shows -40% (-46%). The order and every integer score match the prototype.
- Quote highlights cover whole sentences, because a mention is a sentence span. They can be wider than the prototype's `<mark>`.
- Choosing cards and Back never refetch the map. After reseeding, reload the page to see new data.
- `e2e/opportunities.spec.ts` covers `map-list`, `map-select`, `map-direct`, `map-low`, and `map-unknown` at the default Playwright viewport. It does not replace this recipe.
