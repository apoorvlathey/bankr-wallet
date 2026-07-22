# Extension UI component map

The renderer is organized by feature domain. The `components/` root is an
integration boundary, not the default home for new implementations.

## Root contract

- New multi-file features belong in a named folder with a local `README.md`.
- Existing root imports may be preserved with a small compatibility facade
  while their implementation moves into a feature folder.
- A facade may re-export a component or type, but it must not own state,
  effects, styling, storage access, message calls, or business rules.
- Screen/composition roots coordinate feature hooks and presentational
  components. They should not accumulate reusable child components or pure
  formatting/model logic inline.
- Feature-specific hooks, types, models, and child components stay with their
  feature. `src/hooks/` is reserved for hooks shared by multiple domains.
- Implementation files should stay below roughly 400 lines, with 200-300 lines
  preferred for normal review. Transitional roots have ratcheting test budgets
  and may not grow.

## Shared layers

- `ui/` contains domain-free mobile application primitives. It must not import
  wallet feature modules or call Chrome, storage, signing, or network APIs.
- `shared/` contains reusable wallet-aware presentation that is genuinely used
  by multiple features. `shared/NetworkSelector/` owns the single searchable,
  balance-ordered network browser reused by Swap, Send, and portfolio filters.
- `theme/primitives/` contains token-driven visual atoms. It is separate from
  application and wallet feature behavior.

## Feature domains

- `Activity/` owns transaction-history list presentation.
- `AccountPicker/` owns the shared searchable and reorderable account browser;
  public-home selection and Settings management remain explicit parent modes.
- `AssetChanges/` owns simulation lifecycle, retry projection, asset rows, and
  sanitized NFT preview presentation.
- `BatchConfirmation/` owns ERC-5792 batch review, editing, and decisions.
- `Chat/` owns the Bankr conversation screens and message presentation.
- `ClearSigning/` owns descriptor loading and clear-signing renderers.
- `Erc7715PermissionConfirmation/` owns delegated-execution permission review and decisions.
- `Portfolio/Holdings/` owns portfolio hydration, display transforms, and asset rows.
- `Settings/` owns settings navigation and configuration screens.
- `Shield/` owns the balance-first private-balance screen, status-only automatic
  recovery initialization, active-profile Shield review/activity, aggregate balance,
  private Unshield, and original-depositor public-withdrawal presentation. All
  custody, proving, RPC, signing, and submission effects remain in background
  domains.
- `SignatureConfirmation/` owns signature-decision screen composition.
- `Swap/` owns swap/bridge selection, quoting, review, and execution UI.
- `TransactionConfirmation/` owns single-transaction review and decisions.
- `TransactionDetails/` owns Activity detail modal/screen presentation.
- `Transfer/` owns transfer preparation, recipient safety, and send intake.
- `WatchAssetConfirmation/` owns EIP-747 review screens.
- `decodedParams/` owns recursive decoded-calldata value renderers.

Other flat feature families are transitional. Move them behind a named domain
facade before adding substantial behavior.

`accountRemovalModel.ts` is the pure copy and seed-group impact model consumed
by the transitional Account Settings root. It has no renderer or wallet effects.

## Dependency direction

```text
App / page adapter
  -> feature screen or controller
    -> feature hook / model / child presentation
      -> shared or ui primitive
```

Dependencies do not point back toward `App.tsx` or page adapters. Pure model
modules do not import React, Chakra, Chrome APIs, storage, or network clients.
Behavior-neutral moves preserve props, exports, lazy-loading boundaries,
message shapes, effect ordering, and Bankr/private-key/seed-phrase behavior.
