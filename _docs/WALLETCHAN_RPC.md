# WalletChan RPC Implementation

## Overview

`apps/walletchan-rpc` is a local Ethereum JSON-RPC server that forwards wallet-mutating requests to a WalletConnect session. Its purpose is to let tools such as Foundry, viem, ethers, scripts, and AI agents talk to `http://127.0.0.1:4209` while every transaction or signature is still approved by the user in WalletChan.

The RPC process never holds private keys. It owns only a WalletConnect client session and upstream RPC configuration. WalletChan extension remains the signer and approval UI.

Default runtime:

- Local HTTP JSON-RPC: `http://127.0.0.1:4209`
- Skill/manual endpoint: `http://127.0.0.1:4209/SKILL.md`
- Health endpoint: `http://127.0.0.1:4209/health`
- Session endpoint: `http://127.0.0.1:4209/session`
- Default exposed chain: provided by CLI, commonly `--chain base`
- WalletConnect project ID: env override or built-in public default

## Source Map

| File | Responsibility |
|---|---|
| `apps/walletchan-rpc/src/index.ts` | CLI entrypoint, process lifecycle, WalletConnect pairing UX, server startup |
| `apps/walletchan-rpc/src/cli.ts` | CLI parsing, env fallbacks, defaults, validation |
| `apps/walletchan-rpc/src/chains.ts` | Built-in chain aliases, chain ID parsing, upstream RPC resolution |
| `apps/walletchan-rpc/src/walletConnect.ts` | WalletConnect core/sign-client setup, pairing, session restore, request forwarding |
| `apps/walletchan-rpc/src/rpcServer.ts` | Hono HTTP server, JSON-RPC batch handling, health/session/SKILL routes |
| `apps/walletchan-rpc/src/rpcHandler.ts` | JSON-RPC method router and validation |
| `apps/walletchan-rpc/src/upstream.ts` | Read-only and unknown method forwarding to upstream RPC |
| `apps/walletchan-rpc/src/rpcTypes.ts` | JSON-RPC response/error helpers |
| `apps/walletchan-rpc/src/skill.ts` | Runtime `SKILL.md` content with current URL/account/chain context |
| `apps/walletchan-rpc/src/logger.ts` | CLI log/spinner formatting |
| `apps/walletchan-rpc/src/clipboard.ts` | Best-effort WalletConnect URI clipboard copy |

## Runtime Flow

1. `index.ts` parses CLI args through `parseCli()`.
2. Runtime chains are resolved from `--chain` and `--rpc <chain=url>` in `chains.ts`.
3. A `WalletConnectBridge` is created with the selected chains, WalletConnect project ID, batching mode, request timeout, and host/port.
4. `startRpcServer()` starts the local HTTP server immediately. This lets `/health`, `/session`, `/pairing`, and `/SKILL.md` work while pairing is in progress.
5. `wallet.init()` creates a WalletConnect `SignClient` with metadata:
   - name: `WalletChan RPC`
   - URL: the local RPC URL
   - icon: WalletChan hosted icon URL
6. If a compatible stored session exists, it is reused.
7. If no session is available, the process creates a WalletConnect proposal, prints the `wc:` URI, renders a terminal QR code, and tries to copy the URI to the clipboard.
8. The user pairs from WalletChan: `More -> WalletConnect -> paste`.
9. Once approved, the RPC can serve accounts, transactions, signatures, and ERC-5792 batches.

On `SIGINT` or `SIGTERM`, the HTTP server is closed and the in-memory WalletConnect session handle is cleared. Stored sessions remain available for later reuse unless `--force-new-session` is used.

## WalletConnect Session Model

`WalletConnectBridge` requests the `eip155` namespace for every configured chain.

Base methods:

- `eth_sendTransaction`
- `personal_sign`
- `eth_signTypedData_v3`
- `eth_signTypedData_v4`

Batch methods, unless `--skip-batching` is set:

- `wallet_getCapabilities`
- `wallet_sendCalls`
- `wallet_getCallsStatus`
- `wallet_showCallsStatus`

Events:

- `chainChanged`
- `accountsChanged`

Session storage is scoped by host and port using a WalletConnect storage prefix and temp-directory database path. This prevents different local RPC ports from accidentally sharing incompatible sessions. `--force-new-session` disconnects stored sessions and pairings before proposing a fresh session.

After approval, `validateSession()` ensures:

- every requested chain is approved
- every requested method is approved
- at least one EVM account is present

If the wallet does not support ERC-5792, rerun with `--skip-batching`.

At runtime, `connected` means the bridge has a non-expired WalletConnect session with at least one approved EVM account. If the wallet deletes the session, expires it, sends an empty `accountsChanged` event, or updates the session to zero EVM accounts, the bridge clears the in-memory session.

When `walletchan-rpc` is running in an interactive terminal, a lost session prints a disconnect error and waits for the user to press Enter before generating a new WalletConnect URI. This avoids surprising the user with a new QR/pairing URI every time a wallet is intentionally disconnected. Non-interactive callers, including MCP-managed child processes, should call `/pairing` to create a fresh URI without restarting the RPC process.

Wallet-mutating JSON-RPC requests fail with code `4900` when the WalletConnect session is disconnected:

```json
{
  "code": 4900,
  "message": "WalletConnect session is disconnected. Pair WalletChan again using /pairing or WalletChan MCP get_pairing_uri.",
  "data": {
    "code": "walletconnect_disconnected",
    "needsPairing": true
  }
}
```

Higher-level callers such as WalletChan MCP use that signal to return `status: "needs_pairing"` and, when possible, a fresh pairing URI.

## JSON-RPC Behavior

Local methods handled directly:

| Method | Behavior |
|---|---|
| `eth_accounts` | Returns approved WalletConnect EVM accounts |
| `eth_requestAccounts` | Same as `eth_accounts`; pairing happens out-of-band in the CLI |
| `eth_chainId` | Returns active chain ID as hex |
| `net_version` | Returns active chain ID as decimal string |
| `web3_clientVersion` | Returns `WalletChanRPC/0.1.0` |
| `wallet_switchEthereumChain` | Switches the process-local active chain to a configured chain |

WalletConnect-forwarded approval methods:

| Method | Notes |
|---|---|
| `eth_sendTransaction` | Validates `from` against approved accounts, resolves optional tx `chainId`, forwards for user approval |
| `personal_sign` | Forwards on the active chain |
| `eth_signTypedData_v3` | Uses EIP-712 domain `chainId` when provided |
| `eth_signTypedData_v4` | Uses EIP-712 domain `chainId` when provided |
| `wallet_getCapabilities` | Forwards to WalletChan, using requested chain IDs when present |
| `wallet_sendCalls` | Requires configured `chainId`; stores bundle ID to chain mapping |
| `wallet_getCallsStatus` | Routes status polling to the original bundle chain when known |
| `wallet_showCallsStatus` | Same bundle-chain routing as status polling |

`personal_sign` should use standard WalletConnect/EIP-1193 params: `[message, address]`. Do not pass a protocol wrapper such as `{ "message": "..." }` as the message. Higher-level callers such as WalletChan MCP unwrap remote-MCP SIWE envelopes before calling `walletchan-rpc`, so the RPC can remain wallet-agnostic and forward the same request shape any WalletConnect wallet expects.

Read-only or unknown methods are forwarded to the current active chain's upstream RPC by `upstream.ts`.

Rejected methods:

- `eth_sendRawTransaction`: rejected because it bypasses WalletChan approval
- `eth_sign`: rejected as unsafe
- `eth_signTransaction`: rejected because it creates signed transactions outside the approval flow

## ERC-5792 Batch Routing

When `wallet_sendCalls` is received:

1. `rpcHandler.ts` validates that batching is enabled.
2. It requires params to include a configured `chainId`.
3. The original request is forwarded to WalletChan via WalletConnect.
4. The returned bundle ID is recorded in `context.bundleChains`.
5. Later `wallet_getCallsStatus` and `wallet_showCallsStatus` requests use that map to select the original chain instead of whichever chain is currently active.

WalletChan extension owns the actual batch execution. For extension-side batch behavior, see `_docs/ERC5792.md`.

## Chain Configuration

`--chain <name-or-id>` is repeatable. Built-in aliases and default RPC URLs live in `chains.ts` and are copied from the extension registry. Numeric chain IDs are also supported if an upstream URL is provided:

```bash
walletchan-rpc --chain 43114 --rpc 43114=https://api.avax.network/ext/bc/C/rpc
```

`wallet_switchEthereumChain` only switches among chains configured at process start. It does not add new chains at runtime.

## HTTP Routes

| Route | Method | Purpose |
|---|---|---|
| `/` | `POST` | JSON-RPC endpoint |
| `/rpc` | `POST` | JSON-RPC endpoint alias |
| `/health` | `GET` | Machine-readable status for MCP management |
| `/session` | `GET` | Connected session metadata and active chain |
| `/pairing` | `GET` | Returns a fresh WalletConnect URI when no valid session is connected |
| `/SKILL.md` | `GET` | Agent-facing runtime guide |
| `/skill.md` | `GET` | Case-insensitive convenience alias |

JSON-RPC batch arrays are supported. Empty JSON-RPC batches return `-32600`. Notifications return HTTP `204` when no response is required.

`/health` includes `accounts`; an empty array with `connected: false` means the process is running but needs a fresh WalletConnect pairing.

## Security Properties

- No private keys are stored or loaded by `walletchan-rpc`.
- Wallet-mutating methods go through WalletConnect and require wallet approval.
- Raw transaction submission is blocked.
- Unsafe legacy signing methods are blocked.
- Upstream RPC URLs are used only for read/unknown forwarding.
- WalletConnect session reuse is explicit and can be reset with `--force-new-session`.
- Request timeout defaults to at least 300 seconds because WalletConnect approvals can take user time.

## Testing Checklist

For RPC-only changes:

1. Build: `pnpm build:walletchan-rpc`
2. Start: `pnpm dev:walletchan-rpc --chain base --force-new-session`
3. Pair in WalletChan with the printed `wc:` URI.
4. Check `curl http://127.0.0.1:4209/health`.
5. Check `eth_accounts` with `cast rpc --rpc-url http://127.0.0.1:4209 eth_accounts`.
6. Test `wallet_switchEthereumChain` if chain routing changed.
7. Test a small `eth_sendTransaction`, a `personal_sign`, and an EIP-712 signature.
8. Test `wallet_sendCalls` if ERC-5792 behavior changed.

If a change affects extension transaction/signature handling through WalletConnect, test all WalletChan account types:

- Bankr API accounts (`impersonator`)
- Private key accounts (`privateKey`)
- Seed phrase accounts (`seedPhrase`)
