---
name: changelog
description: Research extension changes since the last release, keep WalletChan's end-user docs and repository Markdown accurate, and populate CHANGELOG.md [Unreleased] with verified user-facing notes. Use when the user says "update the changelog", "draft changelog notes", "/changelog", "prepare docs for release", or before releasing extension changes. Never invent capabilities or edit released changelog sections.
---

# Changelog and product-docs updater

Maintain three synchronized views of the WalletChan extension:

1. The current implementation.
2. The end-user documentation at `apps/docs/`.
3. The `## [Unreleased]` release story in `CHANGELOG.md`.

The task is complete only when every user-visible extension change is accurately
represented in the docs site and changelog, or when inspection proves that no
documentation change is needed.

## Required reading

Before acting:

1. Read the repository `AGENTS.md`.
2. Read `apps/docs/README.md`.
3. Read [references/docs-site-sync.md](references/docs-site-sync.md) completely.
4. Read `_docs/IMPLEMENTATION.md` when extension logic, message flow, background
   handlers, storage, authentication, signing, or crypto changed.
5. Read `DESIGN.md`, `_docs/WARM_MIDNIGHT.md`, and `_docs/STYLING.md` when a
   changed feature affects visible UI or docs-site presentation.

Current code and tests are the authority. Changelogs, old docs, commit messages,
README files, the Chrome listing, and website copy are discovery sources that
must be verified against the current implementation.

## Scope

- Diff `apps/extension/` and `packages/shared/`.
- Include another package only when the extension directly consumes its changed
  behavior.
- Do not add changelog bullets for docs-only commits, comments, build plumbing,
  refactors, test-only changes, or type cleanup with no user-visible effect.
- Do update docs for additions, behavior changes, removals, settings, prompts,
  states, availability rules, error/recovery paths, and terminology changes.
- Never modify released changelog sections. Only edit `## [Unreleased]`.
- Merge into existing `[Unreleased]` content without duplicating it.

## Workflow

### 1. Establish the release delta

Run:

```bash
git describe --tags --abbrev=0
node -p "require('./apps/extension/package.json').version"
git status --short
```

Use the last tag as the release baseline. Record pre-existing dirty paths so
they are not accidentally overwritten, staged, or committed.

Gather in parallel where possible:

```bash
git log <last-tag>..HEAD --pretty=format:'%h %s' -- apps/extension packages/shared
git diff <last-tag>..HEAD --stat -- apps/extension packages/shared
git diff <last-tag>..HEAD -- apps/extension packages/shared
```

Inspect other directly consumed packages when the extension diff points to
them. If the scoped diff is empty, report that there are no extension changes
since the tag and stop without rewriting placeholders.

### 2. Build a verified feature delta

Do not summarize from commit subjects alone. For every candidate user-facing
change:

1. Inspect its implementation, tests, UI route, state model, and relevant
   feature README.
2. Compare with the last tag to distinguish newly added behavior from a fix or
   change to a previously shipped surface.
3. Trace the capability through every entry point and reachable user-visible
   state using the coverage procedure in `references/docs-site-sync.md`.
4. Record applicability by account, network, browser/platform, authorization
   level, feature gate, and external service.
5. Confirm removed, disabled, preview-only, or unreachable behavior is not
   advertised.

For a broad release, use available subagents for independent read-only
inventories by feature domain and for FAQ/search research. Give each a bounded
scope and require file/line evidence. The lead agent must inspect the relevant
source itself, reconcile conflicts, and own every final claim and edit.

### 3. Synchronize the docs site and Markdown context

Follow `references/docs-site-sync.md`.

- Update or add focused MDX pages under `apps/docs/src/pages/`.
- Update every affected discovery surface: Feature atlas, All settings,
  account behavior, standards, networks, FAQ, troubleshooting, glossary, and
  sidebar navigation as applicable.
- Add descriptive links between related topics. Do not leave an important
  concept explained in only one isolated page.
- Remove stale claims when a feature was removed, renamed, gated, or changed.
- Search repository Markdown for the old and new feature terminology, then
  correct factual contradictions that could mislead future agents or users.
- Preserve current WalletChan positioning, writing, information architecture,
  Warm Midnight docs presentation, real logo, and title conventions.

Do not force a docs edit for a purely internal change. Instead, retain evidence
showing why there is no user-visible documentation delta.

### 4. Draft the changelog

Classify verified user-visible changes using these Keep a Changelog groups, in
this order, omitting empty groups:

1. **Added**
2. **Changed**
3. **Deprecated**
4. **Removed**
5. **Fixed**
6. **Security**

Use conventional-commit prefixes only as hints. Anchor **Fixed** and **Changed**
against the previous release:

```bash
git ls-tree -r <last-tag> --name-only -- apps/extension
git show <last-tag>:apps/extension/<path>
```

- If the surface existed at the tag, classify the shipped fix/change normally.
- If the surface is new in this release, fold its iteration and polish into one
  **Added** bullet.
- Fold supporting infrastructure into the capability it enables.
- Collapse multiple commits that ship one coherent outcome.

Write from the user's perspective:

- Lead with the behavior or outcome, not implementation details.
- Use sentence case and end every bullet with a period.
- Mention account types only when behavior actually differs.
- Use `onchain`, not `on-chain`.
- Do not include emoji, hashes, PR numbers, authors, file paths, or speculative
  rationale.
- Keep security notes public-safe and no more revealing than the source change.

### 5. Merge `## [Unreleased]`

- Replace `_Nothing yet._` when adding the first entries.
- Merge new bullets into existing groups and de-duplicate.
- Do not add a version, date, or comparison link; the release script promotes
  the section.
- Do not alter released history or the comparison-link footer.

### 6. Verify

Run the checks required by `AGENTS.md`, plus:

```bash
pnpm --filter @walletchan/docs audit:markdown
pnpm build:docs
pnpm build:extension
git diff --check
```

Treat dead links, misleading feature availability, stale terminology, and
failed builds as blockers. Confirm Vocs can regenerate search, `.md` routes,
`llms.txt`, `llms-full.txt`, sitemap, metadata, and the docs MCP surface from
the updated content.

Run the targeted tests indicated by the changed feature and every applicable
account path. Run `pnpm test:extension-ui` when extension UI architecture or
user flows changed.

### 7. Commit safely

If docs or repository Markdown changed:

1. Review the complete diff.
2. Stage only the exact documentation files changed by this workflow.
3. Commit them separately with a focused `docs(docs): ...` message.

Then stage only `CHANGELOG.md` and commit:

```text
docs(changelog): populate [Unreleased] for v<NEXT_VERSION>
```

Infer `<NEXT_VERSION>` from the current extension version and the requested
`patch`, `minor`, or `major` bump. Default to `minor` only when no bump was
provided, and report that assumption.

Never stage unrelated dirty paths. If a target file contained pre-existing
user changes, preserve them and do not commit that file without explicit user
approval; report the release blocker instead.

## Report

Briefly report:

- The baseline tag and number of commits reviewed.
- The docs pages/indexes updated and the coverage areas verified.
- The number of changelog bullets written.
- Skipped internal changes and new-feature fixes folded into **Added**.
- Verification results.
- The version used in the changelog commit message.
- Unrelated dirty paths or other release blockers.

Offer a GitHub-release version only if useful: reuse the same bullets and add a
`**Full Changelog**:` comparison link.

## Changelog output shape

```markdown
## [Unreleased]

### Added

- A new user-facing capability.

### Fixed

- A user-visible issue that affected the previous release.
```

## Hard failures

- Inventing a feature from a commit title or old changelog.
- Documenting only the happy path while omitting settings, intermediate states,
  errors, recovery, account differences, or availability gates.
- Treating WalletChan as a Bankr-only or “AI-powered browser wallet” product.
- Leaving Bankr first in account comparisons or presenting optional Bankr
  signing as the default custody model.
- Copying developer jargon into end-user docs.
- Adding process commentary, conformance disclaimers, or conversation residue
  to public docs.
- Adding an unlinked page or changing a route without updating navigation and
  inbound links.
- Listing polish for a brand-new feature as a separate fix.
- Editing released changelog history.
- Committing unrelated user work.
