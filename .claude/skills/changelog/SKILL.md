---
name: changelog
description: Populate the [Unreleased] section of CHANGELOG.md with human-readable, user-facing notes derived from extension changes (apps/extension/ + packages/shared/) since the last git tag. Use when the user says "update the changelog", "draft changelog notes", "/changelog", or before a release. Append-only — never invents entries, never touches already-released versions.
---

# Changelog updater (extension-scoped)

You are populating the `## [Unreleased]` section of `/CHANGELOG.md` with notes describing what changed in the **WalletChan extension** since the last release tag.

## Scope (read this carefully)

- **Extension only.** Diff `apps/extension/` and `packages/shared/` only. Ignore `apps/website/`, `apps/indexer/`, `apps/*-indexer/`, `apps/*-bot/`, `apps/contracts/`, `packages/wchan-swap/` *unless* the extension consumes it (in which case the changes show up via `apps/extension/` source anyway — don't double-count).
- **Documentation-only commits do not belong in the changelog.** Skip changes that are solely under `_docs/`, `CLAUDE.md`, `README.md`, or pure comment edits.
- **Never modify already-released sections** (e.g. `## [3.7.0]`). They are immutable history. You only edit `## [Unreleased]`.
- **Append, don't overwrite.** If `## [Unreleased]` already has entries, merge new ones in without duplicating. If it has the placeholder `_Nothing yet._`, replace that placeholder.

## Procedure

1. **Find the last release tag and the current extension version:**

   ```bash
   git describe --tags --abbrev=0
   node -p "require('./apps/extension/package.json').version"
   ```

   The first is the diff base. The second tells you which version the `[Unreleased]` notes will eventually become (informational only — don't write it into the file; `release.sh` promotes `[Unreleased]` automatically).

2. **Gather the extension changes since that tag.** Run these in parallel:

   ```bash
   # Commit subjects (most signal per byte)
   git log <last-tag>..HEAD --pretty=format:'%h %s' -- apps/extension packages/shared

   # Files touched + line counts (shows scope/size)
   git diff <last-tag>..HEAD --stat -- apps/extension packages/shared

   # Full commit bodies for any commit whose subject is vague — re-read them on demand
   git log <last-tag>..HEAD -- apps/extension packages/shared
   ```

   If the stat output is empty, tell the user "No extension changes since `<last-tag>`" and stop — do not write `_Nothing yet._` again, it's already there.

3. **For any commit whose subject doesn't make the user-facing change obvious, read the diff** for the relevant files (`git show <hash> -- apps/extension/...`). Don't guess. A subject like `fix(extension): polish swap UX` tells you nothing on its own — open it.

4. **Classify each change into Keep a Changelog groups.** Use only these, in this order, omitting empty groups:

   - **Added** — new user-facing features or capabilities.
   - **Changed** — behavior changes / refactors users will notice.
   - **Deprecated** — marked for removal.
   - **Removed** — gone.
   - **Fixed** — bug fixes.
   - **Security** — vulnerability fixes, hardening passes, sanitization, validation. Prefix sensitive items only as much as the public commit already did.

   Use the **conventional-commit prefix as a hint, not a rule**:
   - `feat` → usually Added (sometimes Changed)
   - `fix` → Fixed (or Security if it patches a vulnerability)
   - `refactor` / `perf` / `chore` → Changed if user-visible; otherwise drop
   - `polish` / `style` → Changed if user-visible; otherwise drop

5. **Write entries from the user's perspective.** Rules:

   - One bullet per coherent change. Multiple small commits that ship one feature collapse into one bullet.
   - Lead with the user-visible behavior, not the file path or implementation. "Gas tier picker on tx confirmations" — not "wire `MultiTxGasEstimateDisplay` into batch flow."
   - End each bullet with a period. Sentence case.
   - **Mention wallet type only when the change is type-specific** (e.g. "for Private Key and Seed-phrase accounts"). Don't sprinkle it on universal changes.
   - **Use "onchain", not "on-chain"** (project convention).
   - No emoji. No PR numbers, commit hashes, or `@author` attribution — those live in the GitHub release. The changelog is the human story.
   - If a commit is purely internal (build pipeline, lint config, type cleanup with no behavior change, doc-only) **skip it**. Don't pad.

6. **Anchor Fixed / Changed against the *previous release*, not against the last commit.** A bug fix or behavior change only belongs in **Fixed** / **Changed** if the thing being fixed or changed actually shipped to users in the previous tag. Mid-development iteration on a brand-new feature is *part of that feature*, not a separate fix.

   Before you write a Fixed/Changed bullet, ask: **"Did this surface exist in `<last-tag>`?"** Use the tools to check:

   ```bash
   # Does the file the bug lives in exist at the last tag?
   git ls-tree -r <last-tag> --name-only -- apps/extension | grep <file>

   # Was the user-visible feature already there?
   git show <last-tag>:apps/extension/<path> | head
   ```

   Decision tree for each candidate bullet:
   - Feature existed at `<last-tag>` and got polished/fixed/changed → **Fixed** or **Changed**, as appropriate.
   - Feature is brand new in this release (no equivalent surface at `<last-tag>`) → **fold into the Added bullet** for that feature, or drop if it's purely internal iteration. Don't list polish-on-new-feature commits under Fixed/Changed — they confuse users ("fixed *what*? I never saw it broken").
   - Cross-cutting infra change (e.g. a new permission flag, manifest tweak) that exists only because of a new feature → fold into the Added bullet, or drop. It's not a standalone story.

   Example of the trap to avoid: shipping a new "ENS Browsing" feature across 6 commits where one commit was `fix(extension): surface ENS Browsing on Settings main page` — that "fix" is invisible to users because ENS Browsing itself is new in the same release. It belongs in the ENS Browsing Added bullet (or nowhere), not in Fixed.

7. **Read the existing `## [Unreleased]` block** in `CHANGELOG.md` and merge:
   - If it has `_Nothing yet._`, replace that line entirely with your grouped entries.
   - If it already has entries (from a prior `/changelog` run earlier in the same release cycle), insert your new entries into the correct groups, de-duplicating against what's already there. Same-day re-runs are normal — assume the user has been iterating.

8. **Edit only `CHANGELOG.md`** with the result. Use the `Edit` tool with the existing `## [Unreleased]` block as `old_string`. Do not touch any other section, the comparison-link footer, or any other file.

9. **Commit `CHANGELOG.md` on its own.** `release.sh` aborts if the working tree isn't clean, so the changelog edit needs its own commit before the release script runs.

   - Stage only `CHANGELOG.md` — never `git add -A` here; the user may have unrelated work in progress.
   - Commit message: `docs(changelog): populate [Unreleased] for v<NEXT_VERSION>` where `<NEXT_VERSION>` is the version `[Unreleased]` will eventually become. Infer it by bumping the current `apps/extension/package.json` version against the bump type passed as an argument (`patch` / `minor` / `major`). If no bump type was passed, default to `minor` and call it out in the report so the user can amend the message if they intended a different bump.
   - If `git diff --quiet -- CHANGELOG.md` succeeds (no changes to commit), skip this step — the file was already up to date.
   - If the working tree has unrelated dirty paths, the staging step still only adds `CHANGELOG.md`. Mention the other dirty paths in the report so the user knows the release script will still refuse to run.
   - This runs whether or not the user is about to release immediately — committing a draft changelog is fine, the next `/changelog` run will simply amend with new entries.

10. **Report briefly** to the user: how many commits you reviewed, how many bullets you wrote, any commits you intentionally skipped (one-liner per skip with the reason — include polish-on-new-feature folds, so the user can sanity-check the grouping), what version the commit message anchored to, and any unrelated dirty paths blocking a release. Offer to also dump a GitHub-release-flavored version (the same bullets, plus `**Full Changelog**:` compare link) if they want one for the release body.

## Output shape

Inside `## [Unreleased]` your output should look like:

```markdown
## [Unreleased]

### Added

- Bullet describing a new capability.
- Another new capability.

### Fixed

- Bullet describing a bug fix.
```

Groups in Keep a Changelog order. No version header. No date. No compare-link line — `release.sh` handles all of that on tag-cut.

## Anti-patterns to avoid

- ❌ Writing entries for changes outside `apps/extension/` / `packages/shared/` (website / indexer / bot churn).
- ❌ Copying commit subjects verbatim when the subject is jargon-y or vague.
- ❌ Inventing details not present in the diff (don't speculate about *why* if the commit doesn't say).
- ❌ Adding a version header or date — those are inserted by `release.sh` when it promotes `[Unreleased]`.
- ❌ Mentioning Bankr vs PK vs Seed vs Impersonator when the change applies to all.
- ❌ Listing every commit when several collapse into one feature.
- ❌ Editing released version sections to "fix" or "improve" past entries. History is immutable.
- ❌ Listing a polish/fix commit under Fixed/Changed when the surface it touches is brand new in this release — those folds into the feature's Added bullet (see step 6).
