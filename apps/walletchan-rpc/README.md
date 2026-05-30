# WalletChan RPC

Local Ethereum JSON-RPC server for WalletChan approvals.

WalletChan RPC gives scripts, CLIs, and AI agents a standard local RPC endpoint while keeping transaction and signature approval inside the user's connected wallet. Tools send normal Ethereum JSON-RPC to `localhost`; [WalletChan](https://walletchan.com) receives the request over WalletConnect and asks the user to approve it.

> Agent skill: [SKILL.md](https://raw.githubusercontent.com/apoorvlathey/walletchan/master/apps/walletchan-rpc/SKILL.md)

Use it for:

- Giving AI agents wallet access through a local RPC, with every send or signature still requiring user approval
- Foundry, Cast, viem, ethers, shell scripts, or any JSON-RPC client
- User-approved sends, signatures, and ERC-5792 `wallet_sendCalls` batches
- Any EVM chain when you provide its numeric chain ID and upstream RPC URL
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

WalletChan RPC is not limited to the chains in this table. It can expose any EVM chain that the connected wallet supports when you provide a numeric chain ID and upstream RPC URL.

Built-in names and default RPC URLs are copied from WalletChan's extension registry:

```bash
walletchan-rpc --chain base
walletchan-rpc --chain base --chain arbitrum
walletchan-rpc --chain optimism --port 4210
```

Mainnet aliases:

| Name             | Chain ID | Default RPC                            |
| ---------------- | -------- | -------------------------------------- |
| `ethereum`       | 1        | `https://eth.drpc.org`                 |
| `arbitrum`       | 42161    | `https://arb1.arbitrum.io/rpc`         |
| `base`           | 8453     | `https://base.drpc.org`                |
| `bnb`            | 56       | `https://bsc-dataseed.binance.org`     |
| `optimism`       | 10       | `https://mainnet.optimism.io`          |
| `megaeth`        | 4326     | `https://mainnet.megaeth.com/rpc`      |
| `polygon`        | 137      | `https://polygon.drpc.org`             |
| `unichain`       | 130      | `https://mainnet.unichain.org`         |
| `gnosis`         | 100      | `https://gnosis.drpc.org`              |
| `monad`          | 143      | `https://monad.drpc.org`               |
| `sonic`          | 146      | `https://sonic.drpc.org`               |
| `intuition`      | 1155     | `https://rpc.intuition.systems`        |
| `sei`            | 1329     | `https://sei.drpc.org`                 |
| `ronin`          | 2020     | `https://ronin.drpc.org`               |
| `citrea`         | 4114     | `https://rpc.citrea.xyz`               |
| `tempo`          | 4217     | `https://tempo.drpc.org`               |
| `mantle`         | 5000     | `https://mantle.drpc.org`              |
| `arbitrum-nova` | 42170    | `https://arbitrum-nova.drpc.org`       |
| `celo`           | 42220    | `https://celo.drpc.org`                |
| `ink`            | 57073    | `https://ink.drpc.org`                 |
| `linea`          | 59144    | `https://linea.drpc.org`               |
| `berachain`      | 80094    | `https://berachain.drpc.org`           |
| `katana`         | 747474   | `https://katana.drpc.org`              |

Testnet aliases:

| Name                 | Chain ID | Default RPC                                      |
| -------------------- | -------- | ------------------------------------------------ |
| `bnb-testnet`        | 97       | `https://data-seed-prebsc-1-s1.bnbchain.org:8545` |
| `unichain-sepolia`   | 1301     | `https://sepolia.unichain.org`                   |
| `sei-testnet`        | 1328     | `https://evm-rpc-testnet.sei-apis.com`           |
| `mantle-sepolia`     | 5003     | `https://rpc.sepolia.mantle.xyz`                 |
| `citrea-testnet`     | 5115     | `https://rpc.testnet.citrea.xyz`                 |
| `megaeth-testnet`    | 6343     | `https://carrot.megaeth.com/rpc`                 |
| `monad-testnet`      | 10143    | `https://testnet-rpc.monad.xyz`                  |
| `gnosis-chiado`      | 10200    | `https://rpc.chiadochain.net`                    |
| `intuition-testnet`  | 13579    | `https://testnet.rpc.intuition.systems`          |
| `sonic-testnet`      | 14601    | `https://rpc.testnet.soniclabs.com`              |
| `tempo-testnet`      | 42431    | `https://rpc.moderato.tempo.xyz`                 |
| `linea-sepolia`      | 59141    | `https://rpc.sepolia.linea.build`                |
| `polygon-amoy`       | 80002    | `https://rpc-amoy.polygon.technology`            |
| `berachain-bepolia`  | 80069    | `https://bepolia.rpc.berachain.com`              |
| `base-sepolia`       | 84532    | `https://sepolia.base.org`                       |
| `ronin-saigon`       | 202601   | `https://saigon-testnet.roninchain.com/rpc`      |
| `arbitrum-sepolia`   | 421614   | `https://sepolia-rollup.arbitrum.io/rpc`         |
| `hoodi`              | 560048   | `https://rpc.hoodi.ethpandaops.io`               |
| `katana-bokuto`      | 737373   | `https://rpc.bokuto.katanarpc.com`               |
| `ink-sepolia`        | 763373   | `https://rpc-gel-sepolia.inkonchain.com`         |
| `celo-sepolia`       | 11142220 | `https://forno.celo-sepolia.celo-testnet.org`    |
| `sepolia`            | 11155111 | `https://11155111.rpc.thirdweb.com`              |
| `optimism-sepolia`   | 11155420 | `https://sepolia.optimism.io`                    |

For any other EVM chain, use its numeric chain ID and provide an RPC URL:

```bash
walletchan-rpc --chain base --rpc base=https://mainnet.base.org
walletchan-rpc --chain 43114 --rpc 43114=https://api.avax.network/ext/bc/C/rpc
```

Repeat `--chain` to expose multiple chains. Requests can target a configured chain with `wallet_switchEthereumChain` or by including a `chainId` where the method supports it.

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
