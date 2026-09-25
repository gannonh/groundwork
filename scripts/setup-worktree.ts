/**
 * Readies a fresh worktree: copies `.env`, installs dependencies, starts the
 * shared Postgres container, and applies migrations. Every step is safe to
 * rerun. Plain Node so it runs before `pnpm install`.
 *
 * Kata Code runs it from `t3.json` with `KATACODE_PROJECT_ROOT` set to the
 * main checkout, which is where `.env` is copied from.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

const worktree = NodePath.dirname(import.meta.dirname);
const projectRoot = process.env.KATACODE_PROJECT_ROOT;

const envPath = NodePath.join(worktree, ".env");
if (!NodeFs.existsSync(envPath)) {
  const rootEnv = projectRoot && NodePath.join(projectRoot, ".env");
  const source =
    rootEnv && NodeFs.existsSync(rootEnv) ? rootEnv : NodePath.join(worktree, ".env.example");
  NodeFs.copyFileSync(source, envPath);
  console.log(`Copied ${source} to .env`);
}

function run(command: string): void {
  console.log(`$ ${command}`);
  const result = NodeChildProcess.spawnSync(command, {
    cwd: worktree,
    // Corepack would otherwise wait on a prompt before fetching pinned pnpm.
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("corepack pnpm install --frozen-lockfile");
// The compose project name is fixed, so every worktree shares one database.
run("docker compose up -d --wait db");
run("corepack pnpm db:migrate");
