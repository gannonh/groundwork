# 1. Build the app on TanStack Start

Date: 2026-09-24. Status: accepted.

## Context

Groundwork is a logged-in tool. It needs no SEO and no static marketing pages. Its main screen, the opportunity map, keeps its whole view in the URL: ranking weights, filters, grouping, layout, and the selected opportunity. That URL is also the saved view a PM shares. The app must self-host with Docker Compose next to a background worker, and the worker shares domain code with the web app.

We weighed three options.

- **Next.js.** It has the largest ecosystem. It reads search params as untyped strings, and changing them triggers a server render unless the page works around it. Its main strengths, server rendering and static pages, do little for a logged-in tool. Self-hosting outside Vercel takes more setup.
- **Vite single-page app with TanStack Router and a separate Hono API.** It is simple and well understood. It means two deployables and a hand-written client for every endpoint.
- **TanStack Start.** It is built on Vite and TanStack Router. Search params are typed and validated with a schema. Server functions give typed calls from the UI with one deployable. Server routes still serve external callers such as the Linear OAuth callback.

## Decision

Use TanStack Start. Validate map state with `validateSearch` and a zod schema.

## Consequences

- The URL-as-view rule in `CLAUDE.md` is enforced by types, not by convention.
- One deployable plus one worker entry point that share `src/domain/`.
- Start is younger than Next and has fewer examples. The scaffold slice confirms the current stable version and a working Docker build. If Start blocks us, the fallback is Vite with TanStack Router and a Hono API. Domain, database, and pipeline code does not change in that fallback.
