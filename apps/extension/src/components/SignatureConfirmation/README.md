# Signature confirmation UI audit map

- `SignatureConfirmationScreen.tsx` composes the decision screen.
- Supporting modules in this folder are signature-review presentation only.

Signer validation, SIWE policy, account pinning, and final signature release
remain in the background signature domain. The renderer displays that state and
forwards the user's explicit decision without creating parallel policy.
