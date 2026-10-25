Build the issue.

1. Ready the worktree with `mise exec node@24 -- node scripts/setup-worktree.ts`: it writes `.env` from `.env.example`, installs dependencies and gives the worktree its own database. Then implement what the issue describes, with tests, and run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
2. Commit your work on the issue's branch and push it: `git push -u origin <branch>`.
3. Open a draft pull request from the issue's branch against the default branch: `gh pr create --draft --repo <owner>/<name> --base <default branch> --head <branch> --title "<short summary> (<issue id>)" --body "<what changed and why>"`. The title ends with the issue id in parentheses.
4. Run the issue's live checks with `.claude/skills/verify-groundwork/` (read its `SKILL.md` and `features/README.md` first). Save the screenshots and video they produce, and attach each file to the issue with `attach_proof`: its `path`, a `title` that says what it shows, and its `kind` (`image`, `video` or `report`). An issue labeled `ui` changes a screen: attach a screenshot of each state the change makes as `image`, and one 30 to 60 second video of the flow as `video`.
5. When the work is complete and the checks you can run pass, mark the pull request ready for review with `gh pr ready`, then call `request_transition` with `to` set to `agent_review`. If Punchlist refuses, fix what the refusal names and request again.
6. Post a short comment on the issue with `comment`: what you changed and the pull request's URL.

Do not merge the pull request.
