# Background transport tests

These tests mirror `src/chrome/background/` and freeze transport behavior:

- exhaustive route audience/classification;
- trusted sender and exact tab/origin/frame forwarding;
- synchronous vs asynchronous Chrome channel lifetime;
- durable rejection/result payloads;
- dependency-injected side effects for auth, onboarding, settings, dapp,
  WalletConnect, watch-asset, chain-prompt, pending signing-request, and
  transaction-status routes.

Domain business logic is tested in its own folder. These tests prove that the
composition root delegates to it without weakening the boundary.
