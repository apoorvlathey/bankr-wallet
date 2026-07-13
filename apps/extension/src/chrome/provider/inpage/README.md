# Inpage EIP-1193 provider

This folder is the page-world WalletChan provider built as `inpage.js`.

- `provider.ts` owns only EIP-1193 state/events and delegates requests.
- `requestRouter.ts` maps methods to account/chain, signing, ERC-5792,
  delegated-permission, transaction, or bounded RPC adapters.
- `pendingRequests.ts` is the sole request/result correlation registry.
- `resultPolicy.ts` is the exact content-to-page message allowlist/source gate.
- `resultRouter.ts` resolves callbacks and emits account/chain events.
- `announcement.ts` owns EIP-6963 discovery and legacy `window.ethereum`.
- `rpcBridge.ts` retains the safe-method gate before content-script RPC proxying.
- `bootstrap.ts` fixes global discovery/listener initialization order.

The page receives no extension RPC URL or wallet-internal broadcast. All
state-changing methods cross the content bridge, where the connected origin and
attested chain are revalidated before persistence or signing.
