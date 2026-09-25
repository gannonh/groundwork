# Health check

`GET /api/health` tells an operator or load balancer whether the server is up and can reach Postgres. It is the only server route. `verify.sh up` and `doctor` also use it to check readiness.

## Sub-features

- `health-ok`: with the database reachable, it returns `200`, `{"ok":true}`, and `Cache-Control: no-store`.
- `health-down`: with the database unreachable, it returns `503` and `{"ok":false}`, and the server keeps running.

## How to get to it (user POV)

- An HTTP GET on `<URL>/api/health`, from `curl` or from a browser address bar.

## Driving it with drive.mjs

Preconditions:

- The baseline preconditions in the README are met.
- Run `source .verify/instances/<id>/state.env` so that `$URL`, `$PID`, and `$DB_NAME` are set.

- **Healthy.** Run `curl -si "$URL/api/health" | tee "$EVIDENCE_DIR/health-ok.txt"`. The status line is `200`, the headers include `cache-control: no-store`, and the body is `{"ok":true}`.
- **Browser view.** Run `node $S/drive.mjs --name health goto=/api/health expect-text='"ok":true' snap=health`. Exit code 0.
- **Database down.** Only with a disposable instance: stop this instance's database connections with `docker compose exec -T db psql -U groundwork -d groundwork -c "alter database $DB_NAME allow_connections false; select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB_NAME'"`. Then run `curl -si "$URL/api/health"`, which returns `503` and `{"ok":false}`, and run `kill -0 $PID`, which succeeds because the server is still running. Afterwards restore with `alter database $DB_NAME allow_connections true` and confirm `health-ok` again. Never stop the shared `db` container to test this, because other worktrees use it.

## Gotchas

- `allow_connections false` blocks only new connections. The pool keeps the connections it already has open, so the recipe also terminates those backends. Without that step, health keeps answering 200.
- Postgres refuses the connection straight away, so the 503 comes back in milliseconds. A 503 that takes about 2 seconds means the pool hit its `connectionTimeoutMillis` instead: the host is unreachable, which is a different failure.
- `e2e/health.spec.ts` covers only `health-ok`, against `pnpm start` on port 3000.
