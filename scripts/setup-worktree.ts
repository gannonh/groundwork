/**
 * Readies a fresh worktree: copies `.env`, installs dependencies, gives the
 * worktree its own database in the shared Postgres container, applies
 * migrations, and seeds the demo workspace. Every step is safe to rerun.
 * Plain Node so it runs before `pnpm install`.
 *
 * Kata Code runs it from `t3.json` with `KATACODE_PROJECT_ROOT` set to the
 * main checkout, which is where `.env` is copied from.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

const worktree = NodePath.dirname(import.meta.dirname);

const wantedNode = NodeFs.readFileSync(NodePath.join(worktree, ".nvmrc"), "utf8").trim();
const runningNode = process.versions.node;
if (runningNode.split(".")[0] !== wantedNode.split(".")[0]) {
  console.error(
    `This worktree needs Node ${wantedNode} (from .nvmrc), but Node ${runningNode} is running.\n` +
      "Run `mise install` in this directory, or use a version manager that reads .nvmrc, then rerun this script.",
  );
  process.exit(1);
}

const projectRoot = process.env.KATACODE_PROJECT_ROOT;

// One database per worktree keeps each branch's migration history apart and
// lets worktrees set up concurrently. Postgres caps identifiers at 63 bytes.
const database = `groundwork_${NodePath.basename(worktree)}`
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, "_")
  .slice(0, 63);
const databaseUrl = `postgres://groundwork:groundwork@localhost:5432/${database}`;

const envPath = NodePath.join(worktree, ".env");
if (!NodeFs.existsSync(envPath)) {
  const rootEnv = projectRoot && NodePath.join(projectRoot, ".env");
  const source =
    rootEnv && NodeFs.existsSync(rootEnv) ? rootEnv : NodePath.join(worktree, ".env.example");
  NodeFs.copyFileSync(source, envPath);
  console.log(`Copied ${source} to .env`);
}
// Always point at the local database, so a remote DATABASE_URL copied from
// the main checkout is never migrated.
const env = NodeFs.readFileSync(envPath, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "" && !/^\s*DATABASE_URL\s*=/.test(line));
NodeFs.writeFileSync(envPath, [...env, `DATABASE_URL=${databaseUrl}`, ""].join("\n"));
console.log(`Set DATABASE_URL to ${databaseUrl}`);

// A corepack pnpm shim prompts before downloading an uncached pinned version, which hangs this non-interactive hook.
const childEnv = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" };

function run(command: string): void {
  console.log(`$ ${command}`);
  const result = NodeChildProcess.spawnSync(command, {
    cwd: worktree,
    env: childEnv,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const psql = "docker compose exec -T db psql -U groundwork -d groundwork -tAc";

run("pnpm install --frozen-lockfile");
run("docker compose up -d --wait db");
const exists = NodeChildProcess.execSync(
  `${psql} "select 1 from pg_database where datname = '${database}'"`,
  { cwd: worktree, env: childEnv, encoding: "utf8" },
);
if (exists.trim() !== "1") run(`${psql} "create database ${database}"`);
run("pnpm db:migrate");
// The seed replaces the demo workspace, so a rerun leaves one copy.
run("pnpm db:seed");
