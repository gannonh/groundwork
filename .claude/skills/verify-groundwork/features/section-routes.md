# Section routes

Each section has its own URL. A user can bookmark it, reload it, or paste it, and the same section opens with the top bar marking it. An unknown URL shows a Not Found page and still shows the top bar.

## Sub-features

- `route-direct`: loading `/`, `/triage`, `/sources`, `/accounts`, or `/packs` directly renders the shell, a `main` landmark, and the matching current link.
- `route-back`: the browser Back button returns to the previous section, and the current marker follows.
- `route-404`: an unknown path returns HTTP 404 and renders `Not Found` below the top bar.

## How to get to it (user POV)

- Type or paste a URL into the address bar.
- Reload the page.
- Press the browser Back button.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.

- **Direct load.** Open each section fresh. Run `node $S/drive.mjs --name route-direct goto=/sources expect-current=Sources snap=sources goto=/accounts expect-current=Accounts goto=/packs expect-current=Packs goto=/triage expect-current=Triage`. Exit code 0. `sources.aria.yml` ends with `- main`.
- **Server render.** Run `curl -s "$URL/packs" | grep -o '<title>Groundwork</title>'`. It prints the title, which proves the server renders the page itself, not only the client.
- **Back.** Run `node $S/drive.mjs --name route-back goto=/ click=link/Triage expect-url=/triage back= expect-url=/ expect-current=Opportunities`. Exit code 0.
- **Not found.** Run `node $S/drive.mjs --name route-404 goto=/nope expect-text="Not Found" snap=notfound`. Exit code 0. `steps.log` contains `http 404 <URL>/nope` and a matching `console.error Failed to load resource` line. Both are expected here and count as the proof of the 404. `notfound.aria.yml` shows the navigation followed by `paragraph: Not Found`.

## Gotchas

- Every section currently renders an empty `main`, so a blank screen below the top bar is expected until slices land. Use `expect-text` to prove content once a screen has any.
- On the first request, the dev server compiles routes, which can take several seconds. `goto` waits for network idle, so do not add sleeps.
- `press=Alt+ArrowLeft` does nothing in headless Chromium. Use the `back=` step for the Back button.
- No link goes to `/nope`. Reaching it with `goto` is a correct test of a user typing the URL.
