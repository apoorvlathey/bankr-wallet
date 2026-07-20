# Extension UI Architecture

This document is the source of truth for organizing WalletChan's React
renderer. `_docs/STYLING.md` owns visual tokens and interaction grammar;
`_docs/IMPLEMENTATION.md` owns wallet behavior and message flows. This document
owns component, hook, state, and feature-folder boundaries.

## Goals

- Keep trust-critical wallet screens readable and independently auditable.
- Make feature ownership obvious from a file path.
- Keep rendering separate from storage, Chrome messages, network effects, and
  pure transformations.
- Preserve the public imports and runtime behavior needed by the popup,
  sidepanel, fullscreen routes, preview harness, and browser builds.
- Prevent composition roots from becoming permanent multi-thousand-line files.

## Source layout

```text
apps/extension/src/
├── App.tsx                 # Transitional renderer composition root
├── app/                    # Renderer-wide models and App-owned adapters
│   ├── requestModel.ts
│   ├── initialApprovalRequests.ts # Cold-renderer approval-queue loading gate
│   ├── initialApprovalRoute.ts # Pure hint-to-pinned-request route selection
│   ├── AppBootstrapTransition.tsx # Request-skeleton/bootstrap crossfade shell
│   ├── openOnboarding.ts # Renderer-owned onboarding tab recovery adapter
│   ├── lazyScreens.ts
│   ├── hooks/               # App-owned runtime/effect boundaries
│   ├── home/
│   └── screens/
├── components/
│   ├── README.md           # Root component audit map
│   ├── Activity/           # Feature domain
│   ├── BatchConfirmation/  # ERC-5792 review and confirmation
│   ├── ClearSigning/       # Feature domain
│   ├── Portfolio/Holdings/ # Portfolio loading and holdings presentation
│   ├── Shield/             # Separate Shield/Unshield/Send screens over shared privacy controllers
│   ├── Settings/           # Feature domain
│   ├── Swap/               # Feature domain
│   ├── TransactionConfirmation/ # Single-request review and confirmation
│   ├── TransactionDetails/ # Feature domain
│   ├── Transfer/           # Send form and transfer preparation
│   ├── ui/                 # Domain-free application primitives
│   └── shared/             # Cross-feature wallet presentation
├── hooks/                  # Hooks shared by multiple feature domains
├── pages/                  # Build/page adapters and page-specific routing
└── theme/                  # Tokens, recipes, and visual primitives
```

Migration is incremental. Existing root component imports may remain as small
compatibility facades while their implementations move into named feature
folders. Do not churn every caller merely to make the tree look finished.

`app/home/` owns the public/private presentation-mode model, persisted-mode
adapter, private portfolio composition, and shared balance-visibility adapter.
It may compose feature components but must not own Privacy Pools storage,
proofs, quotes, or transaction policy. `App.tsx` owns only the mode branch and
screen navigation. Public portfolio/account components never receive the
Shielded ETH pseudo-asset; `PrivatePortfolioHome` is the sole home-level owner
of that asset row and its private Activity scope.

## Component-root contract

`src/components/` is an integration boundary, not a general source directory.

- A new feature with multiple files gets a named domain folder and local
  `README.md` audit map.
- New substantial behavior does not go into a flat root component.
- A root compatibility facade may re-export the old default/named exports so
  lazy imports and preview routes survive a move.
- Facades contain no JSX, state, effects, styling, storage, message calls, or
  policy.
- Tiny, genuinely shared one-file presentation may remain flat until it grows.
  Before adding a second concern or companion file, create its domain.

Each feature README records:

1. the public composition root or compatibility facade;
2. every file's single responsibility;
3. effect ownership (Chrome, storage, network, timers, clipboard/navigation);
4. dependency direction; and
5. matching pure tests or preview/runtime QA coverage.

## Feature-domain shape

Use only the folders the feature needs; do not create ceremonial empty layers.

```text
components/FeatureName/
├── README.md
├── FeatureScreen.tsx       # Screen/composition root
├── FeatureSection.tsx      # Focused presentational section
├── hooks/
│   └── useFeatureState.ts  # One coherent state/effect domain
├── model/
│   └── featureModel.ts     # Pure transformations and decisions
└── types.ts                # Shared feature contracts when needed
```

Prefer colocating a hook or model with its only consumer. Promote it to global
`src/hooks/` or `src/lib/` only after multiple unrelated domains use it.

## Responsibility boundaries

### Composition roots

Composition roots choose screens, connect feature state, and pass callbacks.
They do not define a catalog of reusable child components, duplicate formatting
helpers, or absorb unrelated subscriptions.

`App.tsx` is a transitional oversized composition root. Extract one coherent
effect domain or one leaf screen at a time. Do not replace it with a single
`useAppController` containing the same thousands of lines.

### Hooks and controllers

Hooks own one lifecycle or effect domain, for example request storage
reconciliation, viewport detection, quote loading, or receipt polling.

- Hook names start with `use` and hooks contain no JSX.
- Register one stable listener per lifecycle where possible; dispatch events
  into state rather than re-registering on every state change.
- Return the smallest state/action contract the screen needs.
- Do not move background authorization or signing policy into a renderer hook.
- Do not hide unrelated feature state in a generic "controller" object.

### Presentational components

Presentational components receive render-ready data and callbacks. They may own
local interaction state such as disclosure, copied-icon feedback, or controlled
input focus. They do not call Chrome storage, RPC, Bankr, swap, signing, or
transaction handlers.

### Pure models and formatting

Pure modules contain no React, Chakra, Chrome APIs, storage, network calls, DOM
access, or timers. They are the preferred home for ordering, grouping,
formatting, validation projection, and display-state derivation. Cover their
behavior with Node tests under `apps/extension/tests/ui/`.

### Shared layers

- `components/ui/` is domain-free. It accepts renderable content and callbacks
  and never imports wallet feature modules or performs wallet effects.
- `components/shared/` is for wallet-aware presentation reused by multiple
  features. It is not a catch-all for one-off feature children. The shared
  `NetworkSelector` domain owns the renderer-only searchable network browser
  and pure funded-first ordering used by Swap, Send, and homepage filtering;
  each feature retains ownership of its balance data and selection effects.
- `theme/primitives/` owns token-driven visual atoms, not application state.
- `src/hooks/` contains only hooks used across feature domains.

## Dependency direction

```text
App / page adapter
  -> feature screen or controller
    -> feature hook, model, or focused child
      -> shared or domain-free UI primitive
```

Dependencies never point back to `App.tsx` or a page adapter. Features should
not import another feature's internal file. Reuse a stable public component or
move genuinely shared presentation/model code into the appropriate shared
layer. Type-only imports from background record definitions are allowed;
renderer code must not copy security policy from those domains.

## File size and extraction rules

- Keep implementation files below roughly 400 lines.
- Treat 200-300 lines as the normal review range, not a quota.
- Before adding code to a file above 300 lines, identify the extraction seam.
- Existing oversized roots use exact ratcheting budgets. They may shrink but
  may not grow.
- Frozen fixtures and generated registries are the routine exceptions; label
  them explicitly in the size-budget test.
- Do not split by arbitrary line ranges. Extract a component, hook, model,
  adapter, or effect boundary with a name that explains ownership.

Line count is a warning signal, not the architecture itself. A 350-line module
with four effects and five embedded components still needs separation; a
cohesive 420-line declarative registry may justify a documented exception.

## Behavior-neutral migration rules

Structural refactors preserve:

- component props and default/named exports;
- route names, lazy-loading boundaries, and idle preloading;
- request IDs, storage keys, message types, and response shapes;
- pending-request ordering and transaction remount keys;
- effect ordering and first-action-wins behavior;
- popup success-animation lifetime versus sidepanel/fullscreen routing;
- focus, scroll restoration, accessibility labels, themes, and responsive
  frames; and
- Bankr, private-key, seed-phrase, and impersonator behavior.

Do not mix a structural move with a visual redesign or wallet behavior change.
If an audit reveals a bug, characterize and fix it in a separate, clearly
reviewable change.

## Testing and enforcement

`apps/extension/tests/ui/architecture.test.ts` enforces audit maps, pure
compatibility facades, the domain-free `components/ui/` boundary, named pure
models, and one-way App dependencies. `moduleSizeBudget.test.ts` ratchets
oversized renderer files and applies the default ceiling to new implementation
files. Run the architecture tests and pure UI model suite with
`pnpm test:extension-ui`; they are also recursively
discovered by the extension security-test runner and release gate.

Use the lightest test that protects the moved concern:

- Node tests for pure models and formatting;
- TypeScript and ESLint for import/export/hook boundaries;
- preview QA for rendered behavior, overflow, accessibility, theme, and frame
  variants; and
- packaged extension QA for Chrome messaging, popup/sidepanel lifecycle, and
  transaction/signature behavior.

Any UI touching transactions, signatures, or authentication must retain Bankr,
private-key, and seed-phrase coverage. View-only behavior must remain visibly
non-signing where relevant.

## Refactor checklist

1. Confirm the snapshot/recovery commit exists.
2. Read this document, `_docs/STYLING.md`, and the feature README.
3. Identify public exports, callers, effects, and fragile lifecycle behavior.
4. Add or identify characterization coverage for pure decisions.
5. Extract one coherent boundary while keeping the old import facade.
6. Run targeted tests, typecheck, ESLint, and `git diff --check`.
7. Run preview or packaged QA proportional to the affected screen.
8. Lower the source-size ratchet and update the domain audit map.
9. Update `_docs/IMPLEMENTATION.md` only when runtime UI architecture or flow
   changed; do not duplicate styling rules here.
