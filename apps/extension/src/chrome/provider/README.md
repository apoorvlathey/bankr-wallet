# External provider validation audit domain

This folder is the effect-free ingress policy shared by the injected provider,
content script, background router, WalletConnect, and ERC-5792 intake.

- `limits.ts` freezes shared byte/character/count ceilings and safe JSON sizing.
- `primitives.ts` validates request ids, EVM addresses, and bounded HTTP URLs.
- `transactionValidation.ts` validates transaction addresses, calldata, chain ids,
  and uint256 quantities before persistence or signing.
- `signatureValidation.ts` validates supported methods, signer position, typed
  data shape, personal-message hex, and payload size.
- `batchValidation.ts` validates every `wallet_sendCalls` call and shared caps.
- `chainBoundary.ts` parses without coercion and enforces the exact content-script
  chain pin for state-changing requests.
- `metadataValidation.ts` validates EIP-3085/EIP-747 prompts, public navigation,
  remote images, and secure RPC configuration without performing I/O.
- `messageValidation.ts` is the fail-closed provider-envelope dispatcher.
- `errors.ts` owns the EIP-1193-compatible error object exposed to pages.
- `contentBridge/` owns the isolated-world page/runtime allowlists, account and
  chain privacy state, request correlation adapters, and reverse event bridge.
- `inpage/` owns the page-world EIP-1193 provider, method routing, correlated
  result delivery, ERC-5792 adapters, EIP-6963, and legacy `window.ethereum`.

No top-level validation module in this directory may access Chrome storage,
fetch, credentials, private keys, signing, or broadcasting. Callers must
validate at their ingress and retain their own final account/origin/effect
authorization checks. That no-effect rule applies to the validation modules;
`contentBridge/` is intentionally the Chrome runtime/storage transport boundary,
while `inpage/` has no `chrome.*` authority at all.
