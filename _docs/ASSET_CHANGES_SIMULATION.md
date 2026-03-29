# Asset Changes Simulation

Shows users what tokens and native currency will flow in/out before they sign a transaction. Fully decentralized — uses only standard RPC calls, no Alchemy, Tenderly, or any external simulation API.

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Component   │────>│  background.ts   │────>│   txSimulation.ts    │
│  AssetChanges│     │  message router  │     │                      │
│  Display.tsx │<────│                  │<────│  1. createAccessList │
│              │     │  "simulate       │     │  2. eth_call + state │
│  (retry if   │     │   AssetChanges"  │     │     override         │
│   incomplete)│     │                  │     │  3. token metadata   │
│              │     │  "retryToken     │     │  4. USD prices       │
│              │     │   Metadata"      │     │                      │
└─────────────┘     └──────────────────┘     └──────────────────────┘
```

## How the Simulation Works

### The Core Trick: State Override Injection

Standard `eth_call` doesn't return balance changes or logs. Our approach:

1. **Write a Solidity contract** (`TxSimulator.sol`) that checks `balanceOf` before/after executing a call
2. **Never deploy it** — instead, inject its runtime bytecode at the **user's address** via `eth_call` state overrides
3. Since `address(this) == userAddress`, all `balanceOf(address(this))` calls read the user's **real** token balances
4. When the simulator calls `to.call{value}(data)`, the target contract sees `msg.sender == userAddress` — the simulation is faithful

```
eth_call({
  to: userAddress,              // call the user's address
  data: encode(simulate(...)),  // which now has simulator bytecode
  stateOverride: [{
    address: userAddress,
    code: SIMULATOR_BYTECODE,   // inject simulator code
    balance: 100000 ETH,        // ensure enough ETH
  }]
})
```

### Step-by-Step Flow

#### Step 1: Discover Touched Contracts (`eth_createAccessList`)

Standard EIP-2930 RPC call. Returns all contract addresses and storage slots the transaction touches. For a Uniswap swap, this includes the router, pool, input token, output token, WETH, etc.

```typescript
const { accessList } = await client.createAccessList({
  account: userAddress, to, value, data,
});
// accessList = [{ address: "0xRouter...", storageKeys: [...] }, { address: "0xUSDC...", ... }, ...]
```

We extract all unique addresses as "token candidates" — the simulator will try `balanceOf` on each.

#### Step 2: Simulate via State Override (`eth_call`)

The `TxSimulator.sol` contract:

1. Records ETH balance + `balanceOf(address(this))` for each candidate **before**
2. Executes `to.call{value: value}(data)` — the actual transaction
3. Records balances **after**
4. Returns only addresses with non-zero deltas (filtering in Solidity to minimize return data)

Non-token addresses (routers, pools, factories) either revert on `balanceOf` (caught by `_tryBalanceOf`) or return zero delta — both are filtered out automatically.

**Why override balance to 100,000 ETH?** So the call doesn't revert due to insufficient funds. The ETH delta calculation is still correct: `after - before = -(value sent) + (value received back)`. Gas is NOT included (eth_call doesn't consume gas — that's shown separately in the gas estimate).

#### Step 3: Resolve Token Metadata

For each token with a non-zero balance change, we need `name`, `symbol`, `decimals`, `logoUrl`, and `priceUsd`. Three sources, in priority order:

1. **Swap token list** (`getCachedTokenList`) — cached 24h from `walletchan.com/api/swap/token-list`. Has name, symbol, decimals, logoURI for ~1000 popular tokens per chain. Fastest and most reliable.

2. **On-chain multicall** — for tokens not in the list, batch `name()`, `symbol()`, `decimals()` via Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`). Must pass `multicallAddress` explicitly since the viem client is created without a `chain` object.

3. **Known token logos** (`KNOWN_TOKEN_LOGOS`) — hardcoded map for tokens like WCHAN that aren't in the swap token list.

For native currency (ETH/BNB/POL), metadata comes from `CHAIN_REGISTRY` and the chain icon is used as the token logo.

#### Step 4: Fetch USD Prices

- **ERC-20 tokens**: `fetchTokenPrice(chainId, address)` via `walletchan.com/api/swap/token-price` (CoinGecko proxy)
- **Native currency**: `fetchNativePrice(chainId)` from `gasEstimation.ts` (direct CoinGecko, 60s cache)

All price fetches run in parallel with `Promise.all`.

## Rate Limit Handling (Metadata Retry)

The simulation makes 3+ RPC calls in quick succession (alongside gas estimation). If the RPC rate-limits (429), the multicall for metadata may fail while the simulation itself succeeds. Tokens show with raw addresses instead of names.

### Two-Phase Display

**Phase 1** — Show results immediately with whatever metadata is available. The `SimulationResult` includes `metadataComplete: boolean`. If `false`, the UI schedules retries.

**Phase 2** — `AssetChangesDisplay` detects `metadataComplete === false` and calls `retryTokenMetadata` after 2.5 seconds. This function:

1. Retries the token list lookup (may have cached since first attempt)
2. Retries on-chain multicall for tokens still showing address-like symbols
3. Retries price fetches for tokens missing USD values
4. Merges updates into existing results (recomputes formatted amounts if decimals changed)

Up to 3 retries at 2.5s intervals. The UI updates reactively as metadata arrives.

```
[0.0s] Simulation complete → show results (some tokens may show as "0x1234...abcd")
[2.5s] Retry 1 → metadata fetched → UI updates with symbol, name, logo, price
[5.0s] Retry 2 (if still incomplete)
[7.5s] Retry 3 (final attempt)
```

## Files

| File | Purpose |
|------|---------|
| `apps/contracts/src/utils/TxSimulator.sol` | Solidity simulator (never deployed, bytecode-only) |
| `apps/extension/src/chrome/txSimulation.ts` | Background: simulation + metadata + retry logic |
| `apps/extension/src/components/AssetChangesDisplay.tsx` | UI: collapsible card with Send/Receive sections |
| `apps/extension/src/chrome/background.ts` | Message routing: `simulateAssetChanges`, `retryTokenMetadata` |
| `apps/extension/src/components/TransactionConfirmation.tsx` | Integration: mounts `AssetChangesDisplay` between TX info and gas |

## UI Placement

Inside `TransactionConfirmation.tsx`, the asset changes card sits between the transaction info card (origin, from, network, to, value) and the gas estimate:

```
┌─ TRANSACTION REQUEST ────────┐
│ Origin: app.uniswap.org      │
│ From: 0x1234...               │
│ Network: Base                 │
│ To: 0xUniversalRouter...      │
│ Value: 0 ETH                  │
└──────────────────────────────┘

┌─ ASSET CHANGES ──────────────┐  ← NEW
│ SEND                          │
│ 🔴 -1,500.0 USDC      $1,500 │
│ RECEIVE                       │
│ 🔵 +0.75 ETH          $1,495 │
└──────────────────────────────┘

┌─ ESTIMATED GAS FEE ──────────┐
│ 0.000042 ETH (~$0.08)        │
└──────────────────────────────┘
```

- Outflows in `bauhaus.red` with down arrow
- Inflows in `bauhaus.blue` with up arrow
- Each row: token icon (20px) + amount + symbol + name, USD value + address with copy/explorer links
- Collapsible (expanded by default)
- Skipped for contract deployments (no `to` address)
- Hidden entirely if simulation fails (best-effort, non-blocking)

## Batch Transaction Simulation

ERC-5792 batch transactions are self-calls (`from === to = wallet address`), which breaks the normal `simulate()` path — the state override replaces the wallet's code with the simulator, so the self-call hits the simulator instead of the smart account.

`TxSimulator.sol` has a `simulateBatch(BatchCall[] calls, address[] candidates)` function that executes all calls **sequentially in a single `eth_call`**. This preserves state between calls (e.g., approve → swap).

**Flow**: `AssetChangesDisplay` passes `batchCalls` prop → sends `simulateBatchAssetChanges` message → background merges access lists from all calls → encodes `simulateBatch` → single `eth_call` with state override → returns cumulative deltas.

See `_docs/ERC5792.md` → "Simulation & Tenderly" for the full flow.

## Updating the Simulator Contract

If you modify `TxSimulator.sol`:

1. `cd apps/contracts && forge build`
2. Extract **exact** `deployedBytecode.object` from `out/TxSimulator.sol/TxSimulator.json`
3. Update `SIMULATOR_BYTECODE` in `txSimulation.ts`
4. Update `SIMULATOR_ABI` / `BATCH_SIMULATOR_ABI` if the function signature changed

**Critical**: The bytecode must be from the **same compilation run**. Even recompiling the identical source can produce different bytecodes (metadata hash changes), causing `InvalidJump` EVM errors because internal jump offsets differ. Always extract and paste in one step.

## Limitations

- **Contract deployments**: Skipped (no `to` address for `createAccessList`)
- **State changes between simulation and execution**: The simulation is a snapshot — chain state may change before the user confirms. A small disclaimer is shown if the simulated tx reverts.
- **Exotic tokens**: Fee-on-transfer or rebasing tokens may show slightly different amounts than actual execution
- **Chain support**: Requires `eth_createAccessList` (EIP-2930) and `eth_call` state overrides. Supported by all major EVM chains; newer chains (MegaETH) may have limited support — handled gracefully by hiding the section on failure.
- **`extcodesize` checks**: Since the user's address temporarily has code during simulation, contracts that check `extcodesize(msg.sender) == 0` may behave differently. This is rare in modern DeFi.
