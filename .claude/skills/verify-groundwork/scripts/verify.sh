#!/usr/bin/env bash
# Launch, check, and tear down isolated Groundwork instances for verification.
# Usage: verify.sh up [--prod] [--host local|tailscale] [--id ID]
#        verify.sh doctor [ID]
#        verify.sh down [ID | --all]
#        verify.sh list
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
VERIFY_DIR="$ROOT/.verify"
INSTANCES="$VERIFY_DIR/instances"
EVIDENCE="$VERIFY_DIR/evidence"
DB_USER=groundwork
DB_PASS=groundwork

die() { echo "verify: $*" >&2; exit 1; }

# Absolute path to a Node 22 binary, so setsid can exec it directly.
node22_bin() {
  if [[ $(node -v 2>/dev/null) == v22.* ]]; then command -v node
  elif command -v mise >/dev/null; then mise exec node@22 -- node -e 'console.log(process.execPath)'
  else die "Node 22 not found. Run 'nvm use' or install Node 22."
  fi
}

pnpm12() {
  if [[ $(node -v 2>/dev/null) == v22.* ]]; then COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm "$@"
  else COREPACK_ENABLE_DOWNLOAD_PROMPT=0 mise exec node@22 -- corepack pnpm "$@"
  fi
}

psql_db() { docker compose -f "$ROOT/docker-compose.yml" exec -T db psql -U "$DB_USER" -At "$@"; }

resolve_id() {
  local id=${1:-}
  if [[ -z $id ]]; then
    [[ -f $VERIFY_DIR/current ]] || die "no current instance; pass an ID or run 'up'"
    id=$(cat "$VERIFY_DIR/current")
  fi
  [[ -f $INSTANCES/$id/state.env ]] || die "no instance '$id' under $INSTANCES"
  echo "$id"
}

free_port() {
  for p in $(seq 4100 4199); do
    if ! ss -Hltn "sport = :$p" | grep -q .; then echo "$p"; return; fi
  done
  die "no free port in 4100-4199"
}

# A failed `up` undoes whatever it created, so a broken attempt leaves no process,
# database, or instance dir behind. Logs move to the evidence dir.
UP_INST='' UP_EV='' UP_DB='' UP_PID=''
up_rollback() {
  [[ -n $UP_INST ]] || return 0
  [[ -n $UP_PID ]] && { kill -KILL -- "-$UP_PID" 2>/dev/null || true; }
  [[ -n $UP_DB ]] && { psql_db -d groundwork -c "drop database if exists $UP_DB with (force)" >/dev/null 2>&1 || true; }
  cp "$UP_INST"/*.log "$UP_EV/" 2>/dev/null || true
  rm -rf "$UP_INST"
  [[ -f $VERIFY_DIR/current && $(cat "$VERIFY_DIR/current") == "$(basename "$UP_INST")" ]] && rm -f "$VERIFY_DIR/current"
  echo "verify: up failed; rolled back. Logs: $UP_EV" >&2
}

cmd_up() {
  local mode=dev host_kind=local id
  id=$(date +%Y%m%d-%H%M%S)
  while [[ $# -gt 0 ]]; do
    case $1 in
      --prod) mode=prod ;;
      --host) host_kind=$2; shift ;;
      --id) id=$2; shift ;;
      *) die "unknown flag $1" ;;
    esac
    shift
  done
  [[ $id =~ ^[A-Za-z0-9_-]+$ ]] || die "--id may contain only letters, digits, '-' and '_'"

  local host
  case $host_kind in
    local) host=127.0.0.1 ;;
    tailscale) host=$(tailscale ip -4 | head -1) ;;
    *) die "--host must be local or tailscale" ;;
  esac

  local inst="$INSTANCES/$id" ev="$EVIDENCE/$id"
  [[ -e $inst ]] && die "instance '$id' already exists"
  mkdir -p "$inst" "$ev"
  UP_INST=$inst UP_EV=$ev
  trap up_rollback EXIT

  [[ -d $ROOT/node_modules ]] || (cd "$ROOT" && pnpm12 install --frozen-lockfile)
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait db >/dev/null 2>&1 || die "Postgres did not become healthy (docker compose up -d --wait db)"

  local node
  node=$(node22_bin)
  local db="gw_verify_${id//-/_}"
  local url="postgres://$DB_USER:$DB_PASS@localhost:5432/$db"
  psql_db -d groundwork -c "create database $db" >/dev/null
  UP_DB=$db
  (cd "$ROOT" && DATABASE_URL=$url "$node" src/db/migrate.ts && DATABASE_URL=$url "$node" src/db/seed.ts) >"$inst/setup.log" 2>&1 \
    || { cat "$inst/setup.log" >&2; die "migrate/seed failed"; }

  local port
  port=$(free_port)
  cd "$ROOT"
  if [[ $mode == prod ]]; then
    pnpm12 build >"$inst/build.log" 2>&1 || { tail -30 "$inst/build.log" >&2; die "build failed"; }
    DATABASE_URL=$url PORT=$port HOST=$host setsid "$node" .output/server/index.mjs >"$inst/server.log" 2>&1 &
  else
    DATABASE_URL=$url setsid "$node" node_modules/vite/bin/vite.js dev --port "$port" --strictPort --host "$host" >"$inst/server.log" 2>&1 &
  fi
  local pid=$!
  UP_PID=$pid

  cat >"$inst/state.env" <<EOF
RUN_ID=$id
MODE=$mode
HOST=$host
PORT=$port
URL=http://$host:$port
PID=$pid
DB_NAME=$db
DATABASE_URL=$url
GIT_HEAD=$(git rev-parse HEAD)
GIT_DIRTY=$(git status --porcelain | grep -v '^?? .verify' | grep -c . || true)
STARTED_AT=$(date -Is)
EVIDENCE_DIR=$ev
EOF
  echo "$id" >"$VERIFY_DIR/current"

  for _ in $(seq 1 120); do
    if curl -sf "http://$host:$port/api/health" >/dev/null 2>&1; then
      echo "ready  id=$id  mode=$mode  url=http://$host:$port  db=$db"
      echo "evidence: $ev"
      trap - EXIT
      return
    fi
    kill -0 "$pid" 2>/dev/null || { tail -30 "$inst/server.log" >&2; die "server exited before ready"; }
    sleep 0.5
  done
  tail -30 "$inst/server.log" >&2
  die "server not ready after 60s"
}

cmd_doctor() {
  local id fail=0
  id=$(resolve_id "${1:-}")
  # shellcheck disable=SC1090
  source "$INSTANCES/$id/state.env"
  ok() { echo "ok    $*"; }
  bad() { echo "FAIL  $*"; fail=1; }
  warn() { echo "warn  $*"; }

  echo "instance $RUN_ID ($MODE) at $URL"
  if kill -0 "$PID" 2>/dev/null; then ok "process $PID alive"; else bad "process $PID not running"; fi

  if ss -Hltnp "sport = :$PORT" | grep -q "pid=$PID,"; then ok "port $PORT owned by $PID"
  else bad "port $PORT not held by $PID: $(ss -Hltnp "sport = :$PORT" | head -1)"; fi

  local health
  health=$(curl -s -o /dev/stdout -w ' %{http_code}' "$URL/api/health" 2>/dev/null || true)
  if [[ $health == '{"ok":true} 200' ]]; then ok "GET /api/health -> $health"; else bad "GET /api/health -> '${health:-no answer}'"; fi

  if curl -sL "$URL/" 2>/dev/null | grep -q '<title>Groundwork</title>'; then ok "GET / (following redirects) serves the Groundwork shell"
  else bad "GET / (following redirects) does not serve <title>Groundwork</title>"; fi

  local want got
  want=$(grep -c '"tag"' "$ROOT/drizzle/meta/_journal.json")
  got=$(psql_db -d "$DB_NAME" -c 'select count(*) from drizzle.__drizzle_migrations' 2>/dev/null || echo missing)
  if [[ $got == "$want" ]]; then ok "database $DB_NAME has $got/$want migrations"
  else bad "database $DB_NAME has ${got} of $want migrations; restart the instance"; fi

  if [[ $(git -C "$ROOT" rev-parse HEAD) == "$GIT_HEAD" ]]; then ok "HEAD matches launch (${GIT_HEAD:0:7})"
  elif [[ $MODE == prod ]]; then bad "HEAD moved since launch; the prod build is stale, restart the instance"
  else warn "HEAD moved since launch (${GIT_HEAD:0:7}); dev server reloads source, but restart if server code changed"; fi

  return $fail
}

cmd_down() {
  local ids=()
  if [[ ${1:-} == --all ]]; then
    for d in "$INSTANCES"/*/; do [[ -f $d/state.env ]] && ids+=("$(basename "$d")"); done
  else
    ids=("$(resolve_id "${1:-}")")
  fi
  for id in "${ids[@]}"; do
    (
      # shellcheck disable=SC1090
      source "$INSTANCES/$id/state.env"
      if kill -0 "$PID" 2>/dev/null; then
        kill -TERM -- "-$PID" 2>/dev/null || true
        for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
        kill -KILL -- "-$PID" 2>/dev/null || true
      fi
      psql_db -d groundwork -c "drop database if exists $DB_NAME with (force)" >/dev/null
      mkdir -p "$EVIDENCE_DIR"
      cp "$INSTANCES/$id"/*.log "$INSTANCES/$id/state.env" "$EVIDENCE_DIR/" 2>/dev/null || true
      rm -rf "${INSTANCES:?}/$id"
      echo "down   id=$id  (process group $PID stopped, database $DB_NAME dropped)"
      echo "evidence kept: $EVIDENCE_DIR"
    )
    [[ -f $VERIFY_DIR/current && $(cat "$VERIFY_DIR/current") == "$id" ]] && rm -f "$VERIFY_DIR/current"
  done
  return 0
}

cmd_list() {
  shopt -s nullglob
  for f in "$INSTANCES"/*/state.env; do
    (
      # shellcheck disable=SC1090
      source "$f"
      state=dead; kill -0 "$PID" 2>/dev/null && state=alive
      echo "$RUN_ID  $MODE  $URL  pid=$PID ($state)  db=$DB_NAME"
    )
  done
}

case ${1:-} in
  up) shift; cmd_up "$@" ;;
  doctor) shift; cmd_doctor "$@" ;;
  down) shift; cmd_down "$@" ;;
  list) cmd_list ;;
  *) sed -n '2,6p' "$0" | sed 's/^# //'; exit 2 ;;
esac
