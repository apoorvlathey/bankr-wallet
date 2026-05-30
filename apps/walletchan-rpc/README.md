# WalletChan RPC

Local Ethereum JSON-RPC server for WalletChan approvals.

WalletChan RPC gives scripts, CLIs, and AI agents a standard local RPC endpoint while keeping transaction and signature approval inside the user's connected wallet. Tools send normal Ethereum JSON-RPC to `localhost`; [WalletChan](https://walletchan.com) receives the request over WalletConnect and asks the user to approve it.

> Agent skill: [SKILL.md](https://raw.githubusercontent.com/apoorvlathey/walletchan/master/apps/walletchan-rpc/SKILL.md)

Use it for:

- Giving AI agents wallet access through a local RPC, with every send or signature still requiring user approval
- Foundry, Cast, viem, ethers, shell scripts, or any JSON-RPC client
- User-approved sends, signatures, and ERC-5792 `wallet_sendCalls` batches
- WalletConnect-compatible wallets, including [WalletChan](https://walletchan.com) and many mobile wallets

## Usage

Published package, choose one:

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

From this repo:

```bash
pnpm dev:walletchan-rpc --chain base
```

On first use, the CLI copies the `wc:` URI to your clipboard, then prints a terminal QR code and raw URI.

- WalletChan extension: open More -> WalletConnect and paste.
- Mobile wallets: scan the QR code.

The local RPC and `SKILL.md` endpoint start immediately at `http://127.0.0.1:4209` by default. Wallet requests become available after the wallet session is approved.

## Agent Skill

Agents can fetch the live local skill/manual from the running RPC:

```bash
curl http://127.0.0.1:4209/SKILL.md
```

The live skill includes the current RPC URL, approved account, active chain, and batching state.

## Chains

Named chains are built in:

```bash
walletchan-rpc --chain base
walletchan-rpc --chain base --chain ethereum
walletchan-rpc --chain polygon --port 4210
```

Supported names:

| Name       | Chain ID | Default RPC                       |
| ---------- | -------- | --------------------------------- |
| `base`     | 8453     | `https://mainnet.base.org`        |
| `ethereum` | 1        | `https://eth.llamarpc.com`        |
| `megaeth`  | 4326     | `https://mainnet.megaeth.com/rpc` |
| `polygon`  | 137      | `https://polygon-rpc.com`         |
| `unichain` | 130      | `https://mainnet.unichain.org`    |

Override RPC URLs per selected chain:

```bash
walletchan-rpc --chain base --rpc base=https://mainnet.base.org
walletchan-rpc --chain 84532 --rpc 84532=https://sepolia.base.org
```

## Batching

ERC-5792 batching is enabled by default. The WalletConnect proposal includes:

- `wallet_getCapabilities`
- `wallet_sendCalls`
- `wallet_getCallsStatus`
- `wallet_showCallsStatus`

For wallets that do not support batching:

```bash
walletchan-rpc --chain base --skip-batching
```

## JSON-RPC Behavior

Wallet requests are sent through WalletConnect:

- `eth_sendTransaction`
- `personal_sign`
- `eth_signTypedData_v3`
- `eth_signTypedData_v4`
- ERC-5792 methods, unless `--skip-batching` is set

Read-only and unknown methods are forwarded to the active chain's upstream RPC.

Local methods:

- `eth_accounts`
- `eth_requestAccounts`
- `eth_chainId`
- `net_version`
- `web3_clientVersion`
- `wallet_switchEthereumChain`

Rejected methods:

- `eth_sendRawTransaction`
- `eth_sign`
- `eth_signTransaction`

## Session Lifecycle

WalletConnect sessions persist across CLI restarts by default. If a compatible stored session exists for the same host and port, the CLI reuses it and skips the QR/paste flow.

To discard stored sessions and force a fresh pairing:

```bash
walletchan-rpc --chain base --force-new-session
```

Use `--force-new-session` when switching wallets, changing to a wallet that supports different methods, or intentionally revoking stale local session state.

## Environment

`WALLETCONNECT_PROJECT_ID` is optional. If omitted, the CLI uses WalletChan's default public WalletConnect project ID.

## Foundry

Foundry is optional. WalletChan RPC is a standard JSON-RPC endpoint and is not restricted to Foundry.

For a single call, agents should usually prefer `cast send` because it avoids creating a full Foundry script. Use Foundry's unlocked-account path so it sends `eth_sendTransaction` to the local RPC:

```bash
cast send 0xContractAddress \
  "transfer(address,uint256)" 0xRecipient 1000000000000000000 \
  --rpc-url http://127.0.0.1:4209 \
  --unlocked \
  --from 0xYourConnectedAddress
```

For larger flows that already live in a script, use the same unlocked-account path:

```bash
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:4209 \
  --broadcast \
  --unlocked \
  --sender 0xYourConnectedAddress
```

Do not pass a private key to Foundry for this flow. Signed raw transactions are rejected because they bypass WalletChan approval.
