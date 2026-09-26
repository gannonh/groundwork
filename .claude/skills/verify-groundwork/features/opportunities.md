# Opportunity map

The Opportunities screen has a left rail, a toolbar, and the ranked problem cards. The rail holds four weight sliders (Reach, Revenue, Pain, Momentum), four preset chips (Balanced, Enterprise, Breadth, Heating up), and the Segment, Source, Speaker, and Date filters. The toolbar switches between Ranked and By outcome, and between Stack and Split. In Split, the selected problem's evidence shows on the right: stats, mentions per week, quotes, requested solutions, and top accounts. In Stack, clicking a card expands that evidence inline. Below 1280 px wide the map is always Stack and the Stack/Split toggle is hidden.

The URL is the saved view. Weights, grouping, layout, selection, and filters are search params on `/opportunities`, and values equal to the defaults are left out, so a plain `/opportunities` is Balanced, Ranked, Split, all segments and sources, any speaker, 90d. A reload, a pasted link, or the Back button shows the same view. With no data, the screen shows an empty state instead.

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
- `map-select`: clicking a card highlights it, shows its detail, and pushes `/opportunities?selected=<id>` onto the history. Back returns to the previous card.
- `map-direct`: opening `/opportunities?selected=<id>` directly selects that card and scrolls it into view. `/` redirects to `/opportunities`, which selects card 1 without naming it in the URL.
- `map-low`: low-confidence quotes have an amber left border and a `NN% confident` pill. Card 1 shows `9 need review` and one flagged quote from Lumen Clinics, `62% confident`.
- `map-unknown`: an unknown `selected` id keeps the list and shows `Opportunity not found` in the detail pane.
- `map-preset`: the Enterprise chip sets the sliders to 10, 60, 20, 10, marks the chip pressed, and changes the URL to `/opportunities?reach=10&revenue=60&momentum=10`. The top four become Dashboard totals, Viewers need a paid seat, Admins can't restrict access, CSV imports. Dragging a slider re-ranks on every step and writes the URL when released. Cards slide to their new places unless the OS asks for reduced motion.
- `map-filter`: unticking Mid-market and SMB changes the URL to `/opportunities?segments=%5B%22enterprise%22%5D` and leaves 6 cards. Card 1's detail reads `2`, `$550k`, `2`, `Deal breaker`, with quotes from Cobalt Insurance and Halcyon Bank only. Unticking the last ticked segment or source is refused. Filters refetch the map. Weights, grouping, layout, and selection do not.
- `map-group`: By outcome (`group=outcome`) shows four outcome headers in this order, each with a 12-week sparkline. Cards keep their overall rank number, and their subtitle reads `N accounts · M mentions`. Clicking a header collapses its group.

  | Outcome | Header line |
  | --- | --- |
  | Get customer data in without engineering help | 3 problems · 77 accounts · $3.01M ARR |
  | Trust the numbers in reports | 3 problems · 84 accounts · $3.78M ARR |
  | Control access and spend | 3 problems · 53 accounts · $3.48M ARR |
  | Share findings with stakeholders | 3 problems · 74 accounts · $2.81M ARR |

- `map-keys`: in Split, `j` or ArrowDown selects the next card in display order and `k` or ArrowUp the previous one, skipping collapsed groups, and keeps the card in view. The URL is replaced, not pushed. Keys typed into a control, such as a focused slider, do not move the selection.
- `map-stack`: at 1000x800 the toolbar reads `Click a row to expand`, there is no detail pane, and cards gain an Accounts column. Clicking card 4 expands it inline with its stats and quotes on the left and its trend, solutions, and top accounts on the right. Clicking it again collapses it.
- `map-evidence`: the detail's Accounts, ARR, and Mentions numbers, each solution's count, and each top account's count and ARR open a right-hand sheet listing the quotes behind that number. The URL keeps the problem and the list, as in `/opportunities?evidence=mentions&selected=0e64ff74-d1e2-8d47-8251-6935c4e2e378`, so a reload reopens it. Card 1's Mentions list has 141 quotes, 9 of them flagged; its Accounts list has 44 accounts. The list counts the same filtered evidence as the number: with only Enterprise ticked, card 1's Accounts `2` lists Cobalt Insurance and Halcyon Bank. Closing the sheet, or choosing another card, clears the list from the URL. `j` and `k` do nothing while the sheet is open. Opening or closing a list never refetches the map.
- `map-empty`: with no workspace, `/opportunities` shows `No opportunities yet` with an `Import a source` link to `/sources`.
- `map-width`: at 1280x800 the page is Split, has no horizontal scroll, and card titles wrap to at most three lines.

Seeded ids are deterministic, so these paths hold on every run:

| # | Path |
| --- | --- |
| 1 | `/opportunities?selected=0e64ff74-d1e2-8d47-8251-6935c4e2e378` |
| 2 | `/opportunities?selected=b2d496f2-f395-891c-b8cb-5091d140af27` |
| 3 | `/opportunities?selected=8ef85c10-bd90-8dd6-9ffb-65b8f237ea96` |
| 4 | `/opportunities?selected=00a0c63a-240b-8116-8c54-73c65e0bf9fa` |
| 5 | `/opportunities?selected=268fd269-10c6-8550-b899-a83f19ea077b` |
| 6 | `/opportunities?selected=a696c372-8c2c-870d-a1ef-598837588a31` |
| 7 | `/opportunities?selected=d3663640-fa75-825a-874b-8cfb0eff0e1e` |
| 8 | `/opportunities?selected=52a8a012-dd8b-8a7e-aa68-76e1f5a12e09` |
| 9 | `/opportunities?selected=f0e6f097-8c4a-87c6-aeb7-b006f5b8ce45` |
| 10 | `/opportunities?selected=b6f18231-8c75-8987-8be8-229734be178b` |
| 11 | `/opportunities?selected=7d5edfd3-3837-8442-8ca1-63c43dc10b64` |
| 12 | `/opportunities?selected=76accd2b-babd-8df2-8ddb-2294e47a7fe7` |

## How to get to it (user POV)

- Choose Opportunities in the top bar, or open `/`.
- Click a card in the ranked list.
- Paste or reload a detail URL.
- Press the browser Back button after choosing cards.
- Drag a weight slider or click a preset chip in the rail.
- Tick or untick a filter in the rail.
- Choose By outcome or Stack in the toolbar, or narrow the window below 1280 px.
- Press `j` and `k` in Split.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met, including the seed.
- Run `source .verify/instances/<id>/state.env` so that `$URL`, `$DB_NAME`, and `$EVIDENCE_DIR` are set.

- **List and detail.** Run `node $S/drive.mjs --name map-list goto=/opportunities expect-url=/opportunities "expect-text=Dashboard totals don't match the source system" expect-text=\$2.31M expect-text=141 snap=map`. Exit code 0. `map.aria.yml` shows the `Ranked problems` region with 12 `listitem` links named by title, in the table's order, and the `Opportunity detail` complementary with the four stats. Compare `map.png` with prototype D in Split layout (`prototypes/opportunity-map/index.html#hybrid`).
- **Select and Back.** Run `node $S/drive.mjs --name map-select --video goto=/opportunities "click=link/Admins can't restrict access by team" expect-url=/opportunities?selected=00a0c63a-240b-8116-8c54-73c65e0bf9fa "expect-text=Team-scoped permissions" snap=after back= expect-url=/opportunities`. Exit code 0. `after.png` shows card 4 with the accent border and its detail.
- **Direct load.** Run `node $S/drive.mjs --name map-direct goto=/opportunities?selected=7d5edfd3-3837-8442-8ca1-63c43dc10b64 "expect-text=No scheduled email digest" snap=direct`. Exit code 0. `direct.png` shows card 11 scrolled into view with the accent border.
- **Low confidence.** Run `node $S/drive.mjs --name map-low goto=/opportunities "expect-text=9 need review" "expect-text=62% confident" snap=low`. Exit code 0. `low.png` shows the Lumen Clinics quote with the amber left border.
- **Unknown id.** Run `node $S/drive.mjs --name map-unknown goto=/opportunities?selected=00000000-0000-0000-0000-000000000000 "expect-text=Opportunity not found" snap=unknown`. Exit code 0.
- **Preset.** Run `node $S/drive.mjs --name map-preset --video goto=/opportunities click=button/Enterprise "expect-url=/opportunities?reach=10&revenue=60&momentum=10" snap=enterprise`. Exit code 0. `enterprise.aria.yml` lists Admins can't restrict access by team third and CSV imports fail silently on malformed rows fourth.
- **Filter.** Run `node $S/drive.mjs --name map-filter goto=/opportunities click=checkbox/Mid-market click=checkbox/SMB expect-url=/opportunities?segments=%5B%22enterprise%22%5D expect-text=\$550k snap=enterprise-only`. Exit code 0. `enterprise-only.png` shows 6 cards and card 1's detail with 2 accounts.
- **Group.** Run `node $S/drive.mjs --name map-group goto=/opportunities "click=radio/By outcome" expect-url=/opportunities?group=outcome "expect-text=3 problems · 84 accounts · \$3.78M ARR" snap=grouped`. Exit code 0. Compare `grouped.png` with prototype D's By outcome view.
- **Keys.** Run `node $S/drive.mjs --name map-keys goto=/opportunities press=j press=j expect-url=/opportunities?selected=8ef85c10-bd90-8dd6-9ffb-65b8f237ea96 press=k expect-url=/opportunities?selected=b2d496f2-f395-891c-b8cb-5091d140af27 snap=keys`. Exit code 0.
- **Stack.** Run `node $S/drive.mjs --name map-stack --viewport 1000x800 goto=/opportunities "expect-text=Click a row to expand" "click=link/Admins can't restrict access by team" expect-url=/opportunities?selected=00a0c63a-240b-8116-8c54-73c65e0bf9fa "expect-text=Team-scoped permissions" snap=stack`. Exit code 0. `stack.png` shows card 4 expanded inline in two columns.
- **Evidence.** Run `node $S/drive.mjs --name map-evidence goto=/opportunities "click=link/Show the 141 mentions" "expect-url=/opportunities?evidence=mentions&selected=0e64ff74-d1e2-8d47-8251-6935c4e2e378" "expect-text=141 mentions" snap=evidence press=Escape expect-url=/opportunities?selected=0e64ff74-d1e2-8d47-8251-6935c4e2e378`. Exit code 0. `evidence.png` shows the sheet over the map.
- **Width.** Run `node $S/drive.mjs --name map-width --viewport 1280x800 goto=/opportunities snap=narrow`. `narrow.png` shows no horizontal scrollbar. In the integrated browser, `preview_evaluate` with `document.documentElement.scrollWidth <= innerWidth` returns `true`.
- **Empty state.** Only on your own instance: run `docker compose exec -T db psql -U groundwork -d $DB_NAME -c 'delete from workspace'`, then `node $S/drive.mjs --name map-empty goto=/opportunities "expect-text=No opportunities yet" snap=empty`. Exit code 0. Restore the data with `DATABASE_URL=postgres://groundwork:groundwork@localhost:5432/$DB_NAME node src/db/seed.ts`.
- **Data.** Run `docker compose exec -T db psql -U groundwork -d $DB_NAME -c 'select (select count(*) from opportunity) opportunities, (select count(*) from account) accounts, (select count(*) from placement) placements' | tee "$EVIDENCE_DIR/map-data.txt"`. It prints `36 | 277 | 767`.

## Gotchas

- Split cards do not show accounts. The AC's 44 accounts is in card 1's detail, which is selected at `/opportunities`. Stack cards show an Accounts column.
- A slider thumb gets its accessible name in an effect after hydration. Wait for `slider "Reach"` before pressing keys or clicking rail controls on a fresh load.
- Collapsed groups are not in the URL. A reload opens every group.
- Switching to Stack clears the selection, as in the prototype. Switching back to Split selects card 1 again.
- Each card link's accessible name is the problem title. Its score, ARR, trend, and review count are in the link's description. `click=link/<title>` uses the exact title.
- The trend window ends at the newest seeded item, the week of Sep 14 2026, not today. The map reads the same on any date.
- Three trend pills differ from the prototype because the seed's weekly counts must sum to each problem's mentions: SSO setup shows 0% (prototype -3%), the email digest shows 0% (+4%), and timezone handling shows -40% (-46%). The order and every integer score match the prototype.
- Quote highlights cover whole sentences, because a mention is a sentence span. They can be wider than the prototype's `<mark>`.
- Only filter changes refetch the map. After reseeding, reload the page to see new data.
- `e2e/opportunities.spec.ts` covers `map-list`, `map-select`, `map-direct`, `map-low`, `map-unknown`, `map-preset`, `map-filter`, `map-keys`, `map-stack`, `map-evidence`, a shared URL, and the refetch rule. It does not replace this recipe.
