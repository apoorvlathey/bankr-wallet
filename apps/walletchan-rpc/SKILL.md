---
name: walletchan-rpc
description: Use when sending Ethereum JSON-RPC, Foundry, or ERC-5792 wallet_sendCalls requests through a local WalletChan RPC server with user wallet approval.
---

# WalletChan RPC

WalletChan RPC is a local JSON-RPC proxy for wallet-approved Ethereum transactions and signatures. A user starts the CLI, approves or reuses a WalletConnect session, and then agents or tools send standard JSON-RPC to the local server.

Package README: https://github.com/apoorvlathey/walletchan/blob/master/apps/walletchan-rpc/README.md

## Package Setup

If WalletChan RPC is not already running, ask the user to start it. For Base mainnet:

```bash
# npm
npx @walletchan/rpc --chain base

# pnpm
pnpm dlx @walletchan/rpc --chain base

# Yarn
yarn dlx @walletchan/rpc --chain base

# Bun
bunx @walletchan/rpc --chain base
```

The CLI starts the local RPC, browser QR page, and `SKILL.md` endpoint immediately, then displays a WalletConnect QR/URI if no reusable session exists. The user must approve the WalletConnect session before wallet send/sign requests can succeed. Stored WalletConnect sessions are reused across CLI restarts by default.

If the user needs to pair or re-pair, show `http://127.0.0.1:4209/qr` by default. It displays a wallet-agnostic QR image and copy button in the browser, and refreshes automatically if a new WalletConnect URI is issued. If the user is on a different port, use that port. `/uri` remains available as a compatibility alias.

Built-in chain aliases and default RPC URLs are copied from WalletChan's extension registry. Common aliases include `ethereum`, `arbitrum`, `base`, `bnb`, `optimism`, `megaeth`, `polygon`, `unichain`, `gnosis`, `monad`, `sonic`, `sei`, `mantle`, `linea`, `berachain`, and `base-sepolia`.

WalletChan RPC is not limited to built-in chain names. For any EVM chain supported by the connected wallet, ask the user to start it with the numeric chain ID and an upstream RPC URL, for example:

```bash
npx @walletchan/rpc --chain 43114 --rpc 43114=https://api.avax.network/ext/bc/C/rpc
```

When the RPC is running, prefer the live local skill because it contains the exact URL, connected account, active chain, and batching state:

```bash
curl -s http://127.0.0.1:4209/SKILL.md
```

The default local RPC URL is `http://127.0.0.1:4209`; the user may choose a different port with `--port`.

## How To Use

Send JSON-RPC over HTTP to the local RPC URL, usually `http://127.0.0.1:4209` or `http://127.0.0.1:4209/rpc`. Any JSON-RPC client can use this endpoint, including JavaScript code, shell scripts, viem, ethers, Foundry, or an AI agent.

Use these wallet methods:

- `eth_sendTransaction`
- `personal_sign`
- `eth_signTypedData_v3`
- `eth_signTypedData_v4`
- `wallet_sendCalls`
- `wallet_getCallsStatus`
- `wallet_showCallsStatus`
- `wallet_getCapabilities`

Read-only JSON-RPC methods may be forwarded to the configured upstream RPC. Local account and chain methods include `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `net_version`, `web3_clientVersion`, and `wallet_switchEthereumChain`.

## Safety Rules

- Use `eth_sendTransaction` for sends. Never use `eth_sendRawTransaction`, `eth_sign`, or `eth_signTransaction`.
- Every send/sign/batch request opens a user approval prompt in the connected wallet.
- If the wallet rejects a request, report the rejection to the user. Do not retry rejected sends automatically.
- Use only an approved account from `eth_accounts` as `from` or Foundry `--sender`.
- If a request targets a different configured chain, include the target `chainId` or call `wallet_switchEthereumChain` first.
- If the needed EVM chain is not configured, ask the user to restart the CLI with `--chain <chainId> --rpc <chainId>=https://...`.
- WalletConnect sessions persist across CLI restarts. Ask the user to restart with `--force-new-session` only when they want a fresh pairing.
- For disconnected sessions, prefer showing the browser QR page (`/qr`) over relying on terminal-rendered or chat-rendered QR images.

## Discovery

```bash
curl -s http://127.0.0.1:4209/health
curl -s http://127.0.0.1:4209/session
curl -s http://127.0.0.1:4209/pairing
curl -s http://127.0.0.1:4209/qr?format=json
curl -s http://127.0.0.1:4209/SKILL.md
```

```bash
curl -s http://127.0.0.1:4209 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_accounts","params":[]}'
```

## wallet_sendCalls

Prefer `wallet_sendCalls` for related write actions that should be reviewed and submitted together. If the connected wallet supports ERC-5792, WalletChan forwards the batch. If it does not, WalletChan RPC sends the calls sequentially as individual `eth_sendTransaction` requests and waits for each transaction receipt before requesting the next confirmation.

Use `wallet_sendCalls` when:

- A later call depends on an earlier call in the same user intent.
- The user asks for several related sends or contract writes, such as sending tokens or ETH to multiple addresses, distributing payments, claiming several rewards, minting several NFTs from the same collection, or doing several same-protocol actions.
- The flow would otherwise require multiple approvals for one task, such as `approve + swap`, `approve + stake`, `approve + deposit`, `approve + bridge`, or `claim + stake`.
- The calls must target one chain and use the same approved `from` account.

For dependent actions such as `approve + swap` or `approve + stake`, set `atomicRequired: true` so ERC-5792 wallets must execute all calls atomically or none of the material effects should land onchain. If the wallet lacks ERC-5792, WalletChan will report `atomic: false` and use receipt-gated sequential fallback instead. Put calls in execution order: approval first, then the action that consumes the approval.

Do not use `wallet_sendCalls` for unrelated actions that the user should consider separately, for cross-chain flows, or as a blind retry after the user rejects a request. If the user query describes one cohesive task with multiple same-chain writes, batch it.

After `wallet_sendCalls`, record the returned bundle ID. WalletChan returns an object with `id`; some wallets may call this `batchId`. Poll `wallet_getCallsStatus` with that ID until status is terminal, or use `wallet_showCallsStatus` to open the bundle's explorer view.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "wallet_sendCalls",
  "params": [
    {
      "version": "2.0.0",
      "chainId": "0x2105",
      "from": "0xYourApprovedAccount",
      "atomicRequired": true,
      "calls": [
        {
          "to": "0xTokenAddress",
          "value": "0x0",
          "data": "0xApproveCalldata"
        },
        {
          "to": "0xSwapOrStakeContract",
          "value": "0x0",
          "data": "0xSwapOrStakeCalldata"
        }
      ]
    }
  ]
}
```

## Optional Foundry Examples

These examples are optional. WalletChan RPC is a standard JSON-RPC endpoint and is not restricted to Foundry.

For a single call, `cast send` is often convenient because it avoids creating a full Foundry script. Use Foundry's unlocked-account path so Foundry sends `eth_sendTransaction` to WalletChan RPC:

```bash
cast send 0xContractAddress \
  "transfer(address,uint256)" 0xRecipient 1000000000000000000 \
  --rpc-url http://127.0.0.1:4209 \
  --unlocked \
  --from 0xYourApprovedAccount
```

For larger flows that already live in a script, use the same unlocked-account path:

```bash
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:4209 \
  --broadcast \
  --unlocked \
  --sender 0xYourApprovedAccount
```

Do not pass a private key for this flow.
