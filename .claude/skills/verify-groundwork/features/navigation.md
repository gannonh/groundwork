# App shell navigation

Every page shows a top bar with the Groundwork mark and five section links: Opportunities, Triage, Sources, Accounts, and Packs. Choosing a link moves to that section without a full page reload and highlights it as the current section.

## Sub-features

- `nav-list`: the top bar lists exactly `Opportunities`, `Triage`, `Sources`, `Accounts`, `Packs`, in that order.
- `nav-move`: choosing a link changes the URL to that section's path.
- `nav-current`: exactly one link has `aria-current="page"`, the one for the current section. Opportunities is current only on `/`, not on its child paths.
- `nav-narrow`: at narrow widths the wordmark is hidden visually, stays readable by screen readers, and the links scroll sideways.

## How to get to it (user POV)

- Open any page. The top bar is on every route, including Not Found.
- Choose a link with the mouse.
- Press Tab to move focus onto a link, then press Enter.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.

- **List.** Load the home page. Run `node $S/drive.mjs --name nav-list goto=/ snap=home`. `home.aria.yml` shows `navigation` with the five links in order and their `/url` values `/`, `/triage`, `/sources`, `/accounts`, `/packs`.
- **Move and current.** Click through every section. Run `node $S/drive.mjs --name nav-move --video goto=/ expect-current=Opportunities snap=before click=link/Triage expect-url=/triage expect-current=Triage click=link/Sources expect-url=/sources expect-current=Sources click=link/Accounts expect-url=/accounts expect-current=Accounts click=link/Packs expect-url=/packs expect-current=Packs snap=after click=link/Opportunities expect-url=/ expect-current=Opportunities`. Exit code 0. `after.png` shows Packs highlighted.
- **Only one current.** Use the negative control: run `node $S/drive.mjs --name nav-negative goto=/triage expect-current=Opportunities`. It must exit 1, with a `FAIL expect-current` line in `steps.log`. If it passes, the marker is on more than one link.
- **Keyboard.** Run `node $S/drive.mjs --name nav-keys goto=/ press=Tab expect-focus=Opportunities press=Tab expect-focus=Triage press=Enter expect-url=/triage expect-current=Triage`. Exit code 0. The first Tab lands on Opportunities, because the wordmark is not focusable.
- **Narrow.** Run `node $S/drive.mjs --name nav-narrow --viewport 390x844 goto=/ snap=narrow`. `narrow.png` shows no wordmark text, and `narrow.aria.yml` still contains `text: Groundwork`.
- **Integrated browser.** After `up --host tailscale`, use `preview_click` with `role=navigation >> role=link[name='Triage']`. Then run `preview_evaluate` with `(() => ({ path: location.pathname, current: document.querySelector('nav a[aria-current="page"]')?.textContent }))()`. It returns `{path: "/triage", current: "Triage"}`.

## Gotchas

- `expect-current` searches inside the `navigation` landmark. A plain `getByRole('link', {name: 'Opportunities'})` can match links that later slices add to the page body.
- Navigation is client-side, so `goto` then `click` does not reload the page. To test a reload, use `goto` again (see `section-routes.md`).
- The active style is `bg-line-2`. Check the `aria-current` assertion, not the pixel colour.
- The e2e spec `e2e/shell.spec.ts` covers `nav-list` and `nav-current` on `/` only. It does not replace this recipe.
