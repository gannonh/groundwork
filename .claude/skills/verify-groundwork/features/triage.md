# Triage

`/triage` is the queue of placements the judge was unsure about: every placement in the newest pack below its place threshold (0.7 in the seed) that no person has decided. It shows one quote at a time (variant A · Focus of `prototypes/triage/`), the judge's top two branches with their path probabilities, and a `None of these` row. Each decision writes one `triage_decision` row, a label with the judge's answer next to the PM's, and the map, the item page, and the nav count read it at once.

## Sub-features

- `triage-count`: the nav's `Triage` link carries the number of undecided low-confidence placements (44 in the seed). It disappears at 0.
- `triage-card`: a `Placement to review` article with a `NN% confident` pill, the quote with redaction tokens, the account, ARR, and a link to the item, then three rows: `1` the judge's placement, `2` its runner-up, `–` None of these. Rows are buttons. Row 1 accepts, row 2 moves the quote there, and None of these discards.
- `triage-actions`: `Accept · <problem>` (`a`), `Move…` (`m`), and `Discard` (`d`). `j` and `k` (or the arrow keys) skip to the next or previous quote. The toolbar reads `N low-confidence placements under 70%`, and a toast confirms each decision.
- `triage-move`: `m` opens a dialog with a `Filter opportunities` combobox and every problem, the runner-up first under `Suggested · branch 2`, then by outcome. Arrow keys choose, Enter moves, Escape closes.
- `triage-already-decided`: deciding an item another tab already decided writes nothing and says `Already decided, maybe in another tab. Nothing changed.`
- `triage-empty`: `Queue clear`, the five latest decisions (each links to its item), and `Back to opportunities`.
- Effects elsewhere: an accepted quote loses its amber mark on the map. A moved quote counts on its new problem. A discarded quote counts on no opportunity, and its item page row reads `Discarded in triage`.

## How to get to it (user POV)

- Click `Triage` in the top bar.

## Driving it with drive.mjs

Preconditions: the baseline preconditions in the README are met. Each run changes the instance's data, so start a fresh instance (`verify.sh up --id <new>`) to repeat a check from 44.

- **Accept.** `node $S/drive.mjs --name triage-accept goto=/opportunities "click=link/Triage, 44 to review" "expect-text=44 low-confidence placements" snap=before press=a "expect-text=43 low-confidence placements" "expect-eval=document.querySelector('nav a[href=\"/triage\"]').textContent.trim()==='Triage43'" snap=after`.
- **Move with the second guess.** Click row 2: `click=button/<Move to … , NN%>` (read the exact name from `before.aria.yml`), then `expect-text=Moved to`.
- **Keyboard only.** Ten `press=a`/`press=d`/`press=m press=Enter` steps, then count rows: `select action, count(*) from triage_decision group by 1`.
- **Two tabs.** `node $S/drive.mjs --name triage-two-tabs goto=/triage tab=2 goto=/triage press=a "expect-text=Placed in" tab=1 press=a "expect-text=Already decided"`.
- **Narrow.** `--viewport 390x844` with `expect-eval=document.documentElement.scrollWidth<=innerWidth`.
- **Data proof.** `select d.action, ja.question_key, ja.probabilities, jo.title as judge, ho.title as human from triage_decision d join judge_answer ja on ja.id = d.judge_answer_id join opportunity jo on jo.id = d.judge_opportunity_id left join opportunity ho on ho.id = d.opportunity_id order by d.created_at`.

## Gotchas

- The page hides a decided quote before the server answers, then reloads the queue and the nav count. Assert the nav count with `expect-eval`, which retries, not with a one-shot read.
- Keys do nothing until the page hydrates. Wait for `expect-text` of the toolbar before the first `press`.
- The seed writes the pipeline's two place answers per item (`place_outcome`, then `place_problem:<outcome>`), so every seeded item has a runner-up. Items whose answers name a renamed node show only the judge's placement.
