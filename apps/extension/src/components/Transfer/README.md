# Transfer UI audit map

`TokenTransfer.tsx` is the Send-screen composition root. The historical
`components/TokenTransfer.tsx` module is a policy-free compatibility facade so
existing direct and lazy imports retain the same default-export contract.

## Responsibilities

- `TokenTransfer.tsx` composes the screen, pickers, validation gates, and sticky
  actions. It does not fetch balances or publish transactions directly.
- `TokenSelectionSection.tsx` renders the chain/token card and adaptive balance.
- `RecipientSection.tsx` renders address resolution, copy/explorer actions, and
  the contract-recipient acknowledgement.
- `AmountSection.tsx` renders amount mode, MAX, conversion, and the sound-aware
  percentage slider.
- `CalldataSection.tsx` renders native calldata, deployment mode, and decoding.
- `TransferNotices.tsx` renders sponsorship eligibility/status and view-only
  notices.
- `NetworkPicker.tsx` adapts Send's catalog balances and selection callback to
  the shared `NetworkSelector`; `RecipientPicker.tsx` owns recipient-only
  search/rendering. The Contacts group mounts shared `AddressContactList`, so
  Send and More expose the same identity row, edit/delete dialogs, and sortable
  controls rather than maintaining Send-specific contact UI. Search results
  remain selection/edit/delete only until the filter is cleared.
  Send enables the shared group's Add action and keeps the group visible when
  empty, making the name-service-aware contact editor reachable from the picker.
- `AdaptiveBalance.tsx` owns responsive balance measurement and formatting.
- `formatting.ts` contains pure display formatting/account labels; `types.ts`
  contains the public component contract.
- `model/sendEntry.ts` keeps Send entry semantics explicit: the homepage
  shortcut starts on Ethereum ETH, while an Assets-row entry preserves the
  clicked token and chain.
- The public Send token picker never receives Shielded ETH. Private Assets owns
  that identity and exposes only Shield, Unshield, and Privacy Pools Activity.
- `model/recipientSuggestions.ts` owns deterministic wallet/contact matching,
  cached-public-name matching, relevance ranking, and stored-order tie breaking
  for the recipient combobox. Suggestion rows reuse the shared safe avatar and
  blockie fallback used by the full contact picker.

## Hooks and effects

- `hooks/useTransferCatalog.ts` owns portfolio/catalog loading, selected-token
  balance and price fallbacks, custom-token lookup, and chain/token selection.
- `hooks/useTransferRecipient.ts` owns recipient resolution, contract detection,
  and recipient search. Public contact name/avatar projection is delegated to
  shared `useAddressContactIdentities` so Send and Address Book stay identical.
  It also exposes the complete saved contact order and trusted mutation
  callbacks to the shared picker list; excluded wallet-address contacts retain
  their slots when the visible Send subset is reordered.
  Exact local contact or wallet addresses bypass reverse resolution and retain
  their known label/avatar synchronously; contract-recipient detection remains
  independent and still runs for the resolved raw address.
- `hooks/useTransferPreparation.ts` owns amount/calldata state and pure transfer
  preparation, including slider sound semantics and deployment preconditions.
- `hooks/useNativeMaxAmount.ts` reuses trusted-wallet gas estimation to reserve
  a chain-specific native fee before MAX/100%; `model/nativeMaxAmount.ts` owns
  the exact bigint subtraction and conservative fee-tier policy.
- `hooks/useSponsoredTransfer.ts` owns premium eligibility, durable ERC-3009
  recovery checks, intent IDs, acknowledgement, and sponsored submission.
- `model/sponsoredTransferPolicy.ts` owns the temporary Base-USDC sponsorship
  feature gate. It is currently disabled, so Base USDC uses normal ERC-20
  transaction intake for Bankr, private-key, and seed-phrase accounts.
- `hooks/useTransferSubmission.ts` owns the normal pending-transaction message
  and selects between Bankr-sponsored and normal confirmation intake. Signing
  remains in the background transaction domains for Bankr, private-key, and
  seed-phrase accounts.

## Dependency direction

The compatibility facade points to the composition root. The root depends on
sections and hooks; sections depend only on shared UI primitives and pure
types/helpers. Hooks may depend on renderer-safe portfolio/RPC/message facades,
but never on sections. No file in this folder stores secrets or signs locally.

## Change rules

- Keep visual sections and effect-owning hooks separate; do not grow the root
  into a page-sized component or replace it with one all-purpose hook.
- Keep files below roughly 400 lines and split by a named user-facing or effect
  responsibility before they approach that limit.
- Preserve native/ERC-20 calldata construction, sponsored Base USDC recovery,
  normal `initiateTransfer` intake, recipient safety gates, and all wallet-type
  paths when moving code.
- Copy actions use inline Copy/Check feedback and every displayed address keeps
  its explorer action.

Pure amount/account-label behavior is covered by
`tests/ui/transferFormatting.test.ts`; durable sponsored recovery is covered by
`tests/sponsoredTransfers/sponsoredTransferReconciliation.test.ts`. Normal
Bankr/private-key/seed-phrase signing continues through the transaction suites
and `qa:extension:signing`.
