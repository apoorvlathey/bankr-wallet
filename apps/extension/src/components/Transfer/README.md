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
- `NetworkPicker.tsx` and `RecipientPicker.tsx` own picker-only search/rendering.
- `AdaptiveBalance.tsx` owns responsive balance measurement and formatting.
- `formatting.ts` contains pure display formatting/account labels; `types.ts`
  contains the public component contract.

## Hooks and effects

- `hooks/useTransferCatalog.ts` owns portfolio/catalog loading, selected-token
  balance and price fallbacks, custom-token lookup, and chain/token selection.
- `hooks/useTransferRecipient.ts` owns recipient resolution, contract detection,
  and WalletChan-account recipient search/identity data.
- `hooks/useTransferPreparation.ts` owns amount/calldata state and pure transfer
  preparation, including slider sound semantics and deployment preconditions.
- `hooks/useSponsoredTransfer.ts` owns premium eligibility, durable ERC-3009
  recovery checks, intent IDs, acknowledgement, and sponsored submission.
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
