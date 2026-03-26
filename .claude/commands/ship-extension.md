Ship extension changes by creating a branch, committing, creating a PR on origin, and merging to master.

## Instructions

1. Run `git status` and `git diff --stat` to see what changed.
2. Create a new branch from the current state with a descriptive name (e.g. `feat/...`, `fix/...`, `refactor/...`).
3. Stage only the relevant changed files and commit with `--no-gpg-sign` and a clear commit message.
4. Push the branch to `origin` with `-u`.
5. Create a PR on `origin` (repo: `apoorvlathey/walletchan`) targeting `master` using `gh pr create`. Use a concise title and a body with a Summary section.
6. Merge the PR using `gh pr merge --merge`.
7. Checkout `master` and pull the latest.

## Rules
- Always use `--no-gpg-sign` for commits.
- Always create PRs on `origin` (`apoorvlathey/walletchan`), never on upstream.
- Always target `master` as the base branch.
- If the user provides a description via $ARGUMENTS, use it for the branch name and commit message.
