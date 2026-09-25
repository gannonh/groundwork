---
name: verify-groundwork
description: Launch an isolated Groundwork instance (TanStack Start web app + Postgres), drive its screens in a real browser the way a product manager would, and capture screenshots, ARIA snapshots, videos, and DB state as proof. Use before a PR leaves draft, when checking a slice's live browser scenarios, when comparing a flow on main and a branch, or whenever a change to Groundwork needs to be shown working rather than just tested.
---

# Verify Groundwork

Groundwork is a web app. The user surface is the browser UI at `/opportunities` (`/` redirects there), `/triage`, `/sources`, `/accounts`, and `/packs`, under a shared top bar. The only API is `GET /api/health`. Everything runs from this worktree against the shared Docker Postgres.

Read `features/README.md` before driving anything. It is the map of what to prove and how.

## Launch

```sh
S=.claude/skills/verify-groundwork/scripts
$S/verify.sh up                        # dev server (Vite), bound to 127.0.0.1
$S/verify.sh up --host tailscale       # bind to the Tailscale IP, for the Kata Code integrated browser
$S/verify.sh up --prod                 # pnpm build, then run .output/server/index.mjs
$S/verify.sh up --id main-s1           # choose the run ID (default: timestamp)
```

What `up` does:

1. Installs deps if `node_modules` is missing. It uses Node 22 from `PATH` or `mise exec node@22`, and pnpm 12 through corepack. The global `pnpm` on this host is too old for the lockfile and fails with `packages field missing or empty`.
2. Starts `docker compose up -d --wait db`. The compose project is `groundwork` in every worktree, so all worktrees share one Postgres container on `127.0.0.1:5432`. `up` never stops it.
3. Creates a fresh database `gw_verify_<id>`, then runs `src/db/migrate.ts` and `src/db/seed.ts` against it. Your run never touches the `groundwork` database that `pnpm dev` uses.
4. Picks the first free port in 4100-4199 and starts the server under `setsid`, so the whole process group can be killed later.
5. Waits up to 60 seconds for `GET /api/health` to return 200. It then prints `ready  id=<id>  mode=<mode>  url=<url>  db=<db>` and the evidence path.

It is ready when that `ready` line prints. If any step fails, `up` rolls back: it kills the server, drops the database, removes the instance dir, and leaves the logs in the evidence dir. You can then retry with the same `--id`. Instance state is in `.verify/instances/<id>/state.env`, along with `setup.log`, `server.log`, and `build.log` (prod only). `.verify/current` holds the last ID started, and every command defaults to it.

Several instances can run side by side, each with its own port and database. For a main-vs-branch comparison (scenario 1 in each Linear issue), create a worktree of `main` and run its own copy of this skill there. Running `up` in this worktree always serves this worktree's code.

Do not drive a server you did not start, such as a `pnpm dev` on port 3000 or a Playwright `webServer`. It uses the developer's database and may be running other code.

## Doctor

```sh
$S/verify.sh doctor [ID]
```

This check is read-only. Run it before driving, and again whenever something looks wrong. It checks:

- The recorded PID is alive and holds the listening port.
- `GET /api/health` returns `{"ok":true} 200`.
- `GET /`, following its redirects, serves `<title>Groundwork</title>`.
- The run database has every migration listed in `drizzle/meta/_journal.json`.
- `HEAD` still matches the commit at launch. In prod mode a mismatch is a FAIL, because the build is stale. In dev mode it is a warning.

The exit code is non-zero on any FAIL. Do not drive a failing instance. Run `down`, then `up` again.

## Drive

### Headless: `drive.mjs` (default, scripted, repeatable)

```sh
node $S/drive.mjs [--id ID] [--name NAME] [--video] [--viewport 1440x900] STEP...
```

It runs the steps in order in headless Chromium and stops at the first failure. On failure it writes `failure.png` and `failure.aria.yml`, then exits 1.

| Step | Meaning |
| --- | --- |
| `goto=/path` | Load a path on the instance and wait for network idle. |
| `click=role/Name` | Click by ARIA role and exact accessible name, for example `click=link/Triage`. |
| `press=Key` | Press a keyboard key, for example `Tab` or `Enter`. |
| `back=` | Press the browser Back button. Headless Chromium ignores `press=Alt+ArrowLeft`. |
| `expect-url=/path` | The pathname plus search equals `/path`. The step retries until it matches or times out. |
| `expect-title=Text` | Assert `document.title`. |
| `expect-current=Name` | `Name` is the only top-bar link with `aria-current="page"`. |
| `expect-text=Text` | Some visible element contains `Text`. |
| `expect-focus=Name` | The focused element's `aria-label`, or else its text, equals `Name`. |
| `expect-eval=JS` | A JavaScript expression evaluated in the page is truthy, for example `expect-eval=document.documentElement.scrollWidth<=innerWidth`. The step retries until it holds or times out. |
| `snap=label` | Write `label.png` (full page) and `label.aria.yml`, whose first line is the URL. |

`steps.log` records every step, plus console errors, page errors, and HTTP responses of 400 or above. Read it: a PASS with a `pageerror` line is not a clean pass. `--video` writes `video.webm` for the whole run. Each run clears its `--name` folder first, so a retry replaces the earlier evidence instead of adding to it.

The first time on a machine, install the browser: `node node_modules/@playwright/test/cli.js install chromium`.

If a flow needs something the steps cannot express, add a step to `drive.mjs` instead of writing a one-off script. Keep the step list above in sync.

### Kata Code integrated browser (when a human watches, or when a PR needs an MP4)

Start with `up --host tailscale`. The integrated browser cannot reach `127.0.0.1` on this host. Load the tools with ToolSearch `select:mcp__t3-code__preview_open,mcp__t3-code__preview_click,mcp__t3-code__preview_evaluate,mcp__t3-code__preview_snapshot,mcp__t3-code__preview_recording_start,mcp__t3-code__preview_recording_stop,mcp__t3-code__preview_status`.

1. Call `preview_open` with `{url: "<URL from state.env>", reuseExistingTab: false}`, and keep the returned `tabId`.
2. Call `preview_recording_start` with that `tabId`. Keep each recording to one action, because a client disconnect loses the recording in progress.
3. Act with `preview_click` and a locator scoped to the top bar, such as `role=navigation >> role=link[name='Triage']`.
4. Read state with `preview_evaluate`, for example `(() => ({ path: location.pathname, current: document.querySelector('nav a[aria-current="page"]')?.textContent }))()`.
5. Call `preview_recording_stop`. It returns an MP4 path under `~/.katacode/userdata/attachments/`.
6. For a screenshot, call `preview_snapshot` with `{includeImage: false, save: true}` and use its `screenshotPath`. The result still includes the whole accessibility tree, so read values with `preview_evaluate` instead of the snapshot text.
7. Copy the MP4 and PNG into `$EVIDENCE_DIR/<name>/`. Files left in `attachments/` or `browser-artifacts/` do not count as evidence.

### API and database

```sh
source .verify/instances/<id>/state.env
curl -s -w ' %{http_code}\n' "$URL/api/health"
docker compose exec -T db psql -U groundwork -d "$DB_NAME" -At -c '<read-only SQL>'
```

## Evidence

Evidence for a run goes to `.verify/evidence/<id>/`. Each `drive.mjs --name NAME` writes to its own subfolder, so give each scenario its own `--name`. `.verify/` is gitignored. Attach to the PR or Linear issue only what the reviewer needs.

Proof standards:

- Use the real user path. Click the top-bar link instead of calling `goto` on the target route. Use `goto` only when the scenario is "a user opens a link or reloads the page".
- Capture the action and the resulting state. Take a `snap` before the action and another after it, or record a video that covers both. A final screenshot alone is not proof.
- Assert the observable state with `expect-*` steps. Do not decide pass or fail from a screenshot.
- When a slice writes data (uploads, placements, triage decisions), also query the run database and save the query and its output as a `.txt` file in the scenario folder. A number on screen is proven only when the rows behind it are shown too.
- Tests use the recorded judge backend. Never point a verification instance at live TypeSafe or LLM credentials unless the Linear issue names a live check. TypeSafe has no sandbox, so a live call costs money.
- A PR that changes a screen needs screenshots and a 30 to 60 second video. `--video` produces WebM, and the integrated browser produces MP4. To convert, run `ffmpeg -i video.webm video.mp4`.
- If a scenario is skipped or cannot be reached, say so, and give the command you tried. Do not count it as verified through a different path.

## Cleanup

```sh
$S/verify.sh down [ID]     # one instance (default: current)
$S/verify.sh down --all    # every instance this worktree started
$S/verify.sh list          # see what is still running
```

`down` sends SIGTERM to the process group recorded at launch, then SIGKILL after 10 seconds. It then drops `gw_verify_<id>`, copies the logs and `state.env` into the evidence dir, and removes `.verify/instances/<id>`. It never kills by process name and never stops the shared Postgres container. Evidence under `.verify/evidence/<id>/` survives. Remove it yourself when it is no longer needed.

Run `down` after every run, including failed attempts, so no ports or databases are left behind. To find databases left by a crashed run, list them with `docker compose exec -T db psql -U groundwork -At -c "select datname from pg_database where datname like 'gw_verify_%'"`.

## Helpers

- `scripts/verify.sh`: `up`, `doctor`, `down`, and `list`, as shown above. Run it from anywhere in the repo.
- `scripts/drive.mjs`: the headless browser driver, as shown above. It resolves `@playwright/test` from the repo's `node_modules`.
