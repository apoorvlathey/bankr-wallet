# Clear Signing UI

This feature turns a matched ERC-7730 descriptor into the human-readable card
shown by transaction and signature confirmation surfaces. Keep descriptor
resolution, recursive layout, and value-specific effects separate so each can
be audited without walking one large component.

## Public boundary

- `ClearSigningView.tsx` is the only public component entry. It preserves the
  named `ClearSigningView` and `ClearSigningViewProps` exports used by callers.
- `types.ts` owns the public discriminated props and internal matched-state and
  recursive-component types.
- `constants.ts` owns the recursion cap shared by nested renderers.

Callers should import from `ClearSigningView.tsx`; files below this folder are
feature internals.

## Audit map

| Area | File | Single responsibility | Effects |
| --- | --- | --- | --- |
| Resolution | `hooks/useClearSigningDescriptor.ts` | Wait for screen entry, resolve/verify/match a descriptor, decode and format fields, publish `onResolved` | Descriptor/cache reads through clear-signing libraries; no rendering |
| Composition | `renderers/FieldRow.tsx` | Choose grouped, nested, empty, or ordinary field layout | None |
| Value dispatch | `renderers/RenderedValueView.tsx` | Route each `RenderedValue` kind to its focused renderer | None directly |
| Nested calls | `renderers/NestedCalldata.tsx` | Enforce the depth cap, recursively render matching inner calls, and show the raw fallback | Recursive descriptor resolution |
| Raw calldata | `renderers/InlineCalldataRow.tsx` | Perform the two-phase local/ABI decode used by an expanded nested fallback | ABI lookup through `decodeRecursive` |
| Addresses | `renderers/AddressInline.tsx` | Resolve wallet/ENS/eth.sh identity and render copy/explorer actions | `getAccounts` message, ENS/eth.sh reads, clipboard/window actions |
| Token amounts | `renderers/TokenAmountInline.tsx` | Resolve native/ERC-20 metadata and price, then render amount/logo/USD | CoinGecko messages and token metadata reads |
| Token contract disclosure | `renderers/TokenContractPopover.tsx` | Reveal an ERC-20 contract address and copy/explorer actions from the token identity hover/focus target | Clipboard and explorer actions |
| Token ticker | `renderers/TokenTickerInline.tsx` | Resolve and render an ERC-20 ticker or address fallback | Token metadata reads |
| Gwei name | `renderers/GweiNameInline.tsx` | Resolve and render a Gwei name or deterministic token fallback | Bounded RPC resolution |
| Pure formatting | `formatters/valueFormatters.ts` | Format units, unlimited sentinels, USD values, durations, and timestamps | None |

## Dependency direction

`ClearSigningView` composes the descriptor hook and `FieldRow`. Field/value
renderers may depend on pure formatters and shared extension libraries, but the
hook and formatters never import renderers. The recursive component is passed
into `FieldRow` explicitly; do not import the public view from a renderer and
create a module cycle.

Keep rendering and resolution behavior neutral when splitting this domain:

- `onResolved` fires only after resolution reaches the same terminal branch.
- `hideLoadingSkeleton` stays quiet while resolution is pending.
- `hideHeader` lets a parent-owned action heading suppress only the duplicated
  intent/owner row while preserving every formatted field.
- nested calldata stops after `MAX_NESTED_DEPTH` and falls back to raw rows.
- storage/runtime messages remain inside the focused effect-owning renderer or
  descriptor hook listed above.
