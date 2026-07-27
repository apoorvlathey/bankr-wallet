# Signature confirmation UI domain

`../SignatureRequestConfirmation.tsx` is the policy-free compatibility facade
used by App and the preview harness.

## Audit map

| File | Responsibility | Effects |
| --- | --- | --- |
| `SignatureRequestConfirmation.tsx` | Resolves the pinned request presentation, clear-signing state, SIWE acknowledgement, and explicit confirm/reject actions. | Chrome messages/tabs, toast, local submit/disclosure state. |
| `SignatureConfirmationScreen.tsx` | Composes `ConfirmationScreen`, shared queue navigation, shared request identity, readable details, Advanced details, and the sticky decision region. | Advanced-detail disclosure/scroll state only. |
| `SignatureDecisionSummary.tsx` | Matches the transaction footer's `Signing with` row and owns the anchored unsafe-SIWE acknowledgement popover. | Account display lookup plus controlled popover/checkbox callbacks. |
| `SignatureMessageData.tsx` | Separates readable personal-message content from exact raw payloads. | Clipboard behavior is delegated to the shared copy control. |
| `signaturePresentation.ts` | Pure decoding, readability classification, signer/method/origin projection, typed-data guards, and plain-language intent. | None. |

`TypedDataDisplay.tsx` owns recursive visible EIP-712 message fields and the
separate technical domain/types/raw projection. `SiweMessageDisplay.tsx` owns
non-duplicated SIWE statement/time/resource fields and validation issues.
Typed-data addresses reuse `shared/LabeledAddressPopover.tsx`.

## Boundaries

- Signer validation, SIWE policy, account pinning, first-action claims, and
  final signature release remain in the background signature domain.
- The renderer forwards the user's explicit decision without creating signing
  policy or changing private-key/seed-phrase/Bankr routing.
- Queue-level Reject all always reaches App's combined-request handler. It must
  not be narrowed to signatures while the counter spans request families.
- Typed-data domain/types, request method, request parameters, and EIP-712
  hashes remain inside Advanced details. Human-readable meaning stays ahead of
  those technical fields; unreadable raw payloads remain visible for review.
