# WalletChan docs-site synchronization contract

Use this contract for every user-visible extension release delta. The goal is
not merely to mention a feature. Make every supported action, setting, state,
limitation, and recovery path findable and understandable without exposing
unnecessary implementation detail.

## Contents

- [Authority and discovery](#authority-and-discovery)
- [Coverage procedure](#coverage-procedure)
- [Account coverage and product framing](#account-coverage-and-product-framing)
- [Information architecture](#information-architecture)
- [Writing style](#writing-style)
- [Search, FAQ, and agent retrieval](#search-faq-and-agent-retrieval)
- [Visual and brand constraints](#visual-and-brand-constraints)
- [Repository-wide stale-context sweep](#repository-wide-stale-context-sweep)
- [Completion checklist](#completion-checklist)

## Authority and discovery

Use sources in this order:

1. Current production-reachable code and feature gates.
2. Current tests, UI previews used for genuine product QA, and state models.
3. Current manifest, network registries, settings definitions, and package
   configuration.
4. `README.md`, the Chrome Web Store listing, website talking points, and
   current design/implementation docs.
5. Changelogs and old Markdown as leads only.

Verify old claims against code. Do not revive removed, disabled, experimental,
preview-only, or unreachable behavior. When sources disagree, follow current
behavior and update stale Markdown.

## Coverage procedure

Build an internal coverage ledger for each added, changed, or removed
capability. Do not create a public process document.

Trace depth-first when one flow has many states. Trace breadth-first when a
change affects several screens or account types. Cover:

1. **Discovery and entry points**
   - Onboarding, Home, header menu, More, Settings, account management, dapp
     request, Activity, notification, and deep-link entry points.
   - Visibility conditions, disabled states, prerequisite copy, and empty
     states.
2. **Every user action**
   - Buttons, menus, toggles, searches, filters, selectors, editable fields,
     confirmations, rejections, cancellation, retry, copy, reveal, export,
     reset, hide/show, add/remove, and follow-up actions.
3. **Lifecycle states**
   - Initial, loading, unavailable, ready, validation error, warning,
     confirmation, pending, signing, submitting, processing, partially
     complete, successful, failed, rejected, cancelled, expired, refunded,
     dropped/replaced, and recoverable states where applicable.
4. **Behavioral differences**
   - Account type, active network, browser/platform, dapp origin/session,
     authorization factor, master versus agent session, feature gate, service
     availability, and prior configuration.
   - Distinguish whether a control is visible, whether the selected account is
     eligible, whether it can authorize/sign, and whether the operation can
     actually execute.
5. **Security and recovery**
   - What authority the action grants, what cannot be reversed, secrets the
     user must protect, recovery prerequisites, and the safest next step after
     failure.
6. **Persistence and history**
   - Defaults, migration or fallback behavior, what is stored, where the result
     appears later, how status is refreshed, and any clear/reset/remove control
     exposed to the user.

Inspect nested components and alternate branches; do not stop after reading the
top-level screen. Search exact UI labels and message types to find all paths.

## Account coverage and product framing

Use this user-facing order unless the context requires a narrower comparison:

1. Private-key account
2. Seed-phrase account
3. Ledger hardware account
4. View-only account
5. Safe multisig account
6. Bankr account

Keep Bankr last in account tables and broad account navigation. Describe it as
optional remote signing through Bankr. Bankr chat is one wallet feature.

Do not frame WalletChan as only a Bankr wallet or as an “AI-powered browser
wallet.” Use the current positioning:

> WalletChan is an Ethereum and EVM browser wallet with clear request review,
> multiple custody and signing models, dapp connectivity, asset movement,
> security, privacy, and smart-account features.

Distinguish account identity from authorization:

- Private-key and seed accounts sign locally.
- Ledger signs on connected hardware.
- View-only cannot sign; any explicit local-fork impersonation path remains
  unsigned and narrowly configured.
- Safe actions use proposals, owner approvals, threshold, nonce, and an
  eligible executor.
- Bankr signs remotely where its service supports the action.

For transaction, signature, authentication, or authority changes, explicitly
verify all applicable account paths. Do not assume one signing path represents
another.

## Information architecture

Prefer updating an existing focused page over adding a near-duplicate. Create a
new page only when the topic needs its own durable search destination.

For every material change, inspect these discovery surfaces and update the
ones affected:

- `overview/feature-atlas.mdx` for product breadth.
- `settings/all-settings.mdx` for every preference, action, status, and access
  requirement.
- `reference/account-behavior.mdx` for account differences.
- `reference/standards.mdx` for supported Ethereum standards.
- `overview/networks.mdx` for built-in networks and network-scoped support.
- `help/faq.mdx` for natural-language questions.
- `help/troubleshooting.mdx` for failure symptoms and recovery.
- `reference/glossary.mdx` for terms users may not know.
- `vocs.config.ts` for sidebar placement and route changes.

Keep **Start here** and **Help & reference** expanded by default. Keep all other
sidebar categories collapsed by default.

Cross-link at the point where a related concept is mentioned. Use descriptive
link text that tells the user what they will learn. Add reciprocal or hub links
when they materially improve discovery. Avoid orphan pages.

Link every listed Ethereum standard to `https://eip.tools/eip/<number>`.

## Writing style

Write for the person trying to complete or understand a wallet action:

- Lead with the answer, behavior, prerequisite, or next action.
- Use plain language, short paragraphs, descriptive headings, and exact UI
  labels in bold.
- Prefer second person and active voice.
- Explain what happens before, during, and after an action.
- State limitations directly and offer the nearest supported alternative.
- Define necessary wallet terms once and link to the deeper explanation.
- Keep technical identifiers only when users see or search for them, such as
  EIP numbers, RPC, nonce, calldata, transaction hash, or derivation path.
- Use `onchain`, `dapp`, `web3`, `private key`, and `seed phrase` consistently.
- Be candid about custody, signing authority, irreversible actions, fees,
  service dependencies, and recovery.
- Do not use emoji, hype, vague superlatives, keyword stuffing, or unsupported
  safety claims.
- Do not repeat the same explanation across several pages; summarize and link.

Remove author-facing and process-facing commentary. Public pages must not say
things such as:

- “This is a user-oriented index.”
- “This is not a developer conformance claim.”
- “This page/list/table documents…”
- “These docs are organized…”
- “Each entry links to a guide…”
- Anything that refers to a private conversation, prompt, research process,
  coverage exercise, or why the documentation was written.

The concise homepage section explaining that the site is available to people
and AI agents is intentional product functionality: search, `.md` routes,
`llms.txt`, `llms-full.txt`, and the docs MCP endpoint. Do not expand it into
generic prose about documentation philosophy.

## Search, FAQ, and agent retrieval

Give every page:

- A unique, specific frontmatter `title`.
- A concise `description` using the terms a user would search.
- One clear H1 and task/state-oriented H2/H3 headings.
- Self-contained answers near the relevant heading.
- Descriptive internal links to prerequisites and adjacent tasks.

Use question headings for genuine user questions, especially “how,” “why,”
“can I,” “what happens,” “is it safe,” “where,” and “what if” phrasing.

When a release adds a capability that answers a common crypto-wallet problem,
research current user query phrasing and add only relevant, code-supported FAQ
or troubleshooting answers. Prefer primary sources for technical standards.
Never imply support merely because people search for it.

Vocs publishes keyword search, Markdown page variants, `llms.txt`,
`llms-full.txt`, sitemap, canonical metadata, JSON-LD, and a docs MCP endpoint.
Write clear semantic Markdown so those generated surfaces remain useful; do not
hand-edit generated outputs.

Preserve these metadata conventions:

- Site title: `WalletChan Docs - Web3 Wallet`.
- Per-guide suffix: `· WalletChan`.
- Visible header lockup: WalletChan + `DOCS`.

## Visual and brand constraints

The docs site uses Warm Midnight only:

- Near-black graphite surfaces, off-white text, financial blue for navigation
  and focus, restrained WalletChan amber.
- The real WalletChan pixel mascot from the repository.
- Anton only for the uppercase WalletChan wordmark; Inter for prose and
  JetBrains Mono for technical values.
- No Bauhaus theme, fabricated logo, generic web3 gradient, or decorative
  visual change unrelated to comprehension.

Preserve accessibility, visible focus, semantic Markdown, readable tables,
mobile navigation, and reduced-motion behavior.

## Repository-wide stale-context sweep

Search all Markdown after documenting the feature:

```bash
rg -n -i '<old term>|<feature name>|<changed UI label>' \
  --glob '*.md' --glob '*.mdx' .
```

Correct factual contradictions in root files, `_docs/`, extension feature
READMEs, store-listing material, and website documentation. Keep technical docs
technical; update only the product facts, availability, terminology, and
positioning needed to prevent future agents or users from learning obsolete
behavior.

Pay special attention to:

- Bankr-first or “AI-powered browser wallet” framing.
- Removed feature names and obsolete UI routes.
- Old account-count claims that omit Ledger, view-only, or Safe.
- Settings whose defaults, labels, or access rules changed.
- Network and account availability claims.
- Changelog claims that describe an earlier version but are being reused as
  current behavior. Released changelog history remains immutable.

## Completion checklist

- Every changed user-facing action and state is covered.
- All account/network/platform differences are accurate.
- Removed and preview-only behavior is not advertised.
- Feature atlas and relevant reference indexes are synchronized.
- Settings include every new or changed control.
- FAQs and troubleshooting cover real user questions and failures.
- Related topics are linked in both useful directions.
- Search titles/descriptions are unique and direct.
- Public prose contains no prompt residue or meta commentary.
- Repository Markdown no longer contradicts current behavior.
- Markdown audit, docs build, extension build, and diff check pass.
