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
- **Native currency**: `fetchNativePrice(chainId)` from `gasEstimation.ts`, which now routes through the shared background `coingeckoService.ts` (batched markets fetch + persisted cache)

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

## NFT Support (ERC-721 + ERC-1155)

NFTs are detected and rendered separately from ERC-20 token changes — they use a count (not a `formatUnits` result) and show the specific tokenId + image preview where possible.

### Why NFTs need special handling

ERC-721 implements `balanceOf(address) returns (uint256)` (the count of NFTs owned), so the existing `_tryBalanceOf` path picks up `+1`/`-1` deltas. But ERC-721 has no `decimals()`, so the multicall fallback would set `decimals = 18` and `formatUnits(1n, 18)` rendered as `<0.000001` — the original bug. ERC-1155's `balanceOf(address, uint256)` requires a tokenId arg and just reverts under `_tryBalanceOf`, so it never even appeared.

### How we capture NFTs now

1. **Detection** — `detectNftStandards()` runs `supportsInterface(0x80ac58cd)` (ERC-721) and `supportsInterface(0xd9b67a26)` (ERC-1155) for every unknown candidate via a single Multicall3 call. Tokens already in the swap token list are skipped (they're guaranteed ERC-20s).

2. **Receiver-hook capture (incoming NFTs)** — `TxSimulator.sol` implements `onERC721Received`, `onERC1155Received`, `onERC1155BatchReceived`, plus `supportsInterface` for the receiver interfaces. When the simulated call uses `safeTransferFrom` / `_safeMint`, those callbacks fire on the user's address (because the simulator bytecode is injected there), and each `(token, tokenId, amount, standard)` tuple is appended to a storage-backed `NftReceived[]`.

3. **ERC-721 Enumerable fallback (`_enumerateNewErc721Tokens`)** — Some collections call plain `_mint` instead of `_safeMint` so the receiver hook never fires. After the inner call, for each candidate with a positive `balanceOf` delta the simulator walks `tokenOfOwnerByIndex(this, idx)` for indices `[balanceBefore, balanceAfter)` and pushes any tokenIds not already captured by the hook. Bounded to 50 iterations per collection (so a runaway ERC-20 with a colossal delta can't loop forever) and breaks immediately when the contract isn't Enumerable (the staticcall just reverts). Catches Uniswap V3's NonfungiblePositionManager.

4. **`nextTokenId()` fallback (`_enumerateViaNextTokenId`)** — Counter-based ERC-721s like **Uniswap V4 PositionManager** have neither receiver hook nor Enumerable. They expose `nextTokenId() returns (uint256)`, an incrementing counter advanced on every `_mint`. Before the inner call we snapshot `nextTokenId()` for every candidate (returning a sentinel for contracts that don't expose it). After the call, for each candidate with positive ERC-721 delta and an advanced counter, we walk `[nextBefore, nextAfter)` calling `ownerOf(id)` and push every id currently owned by the user. This catches contracts that mint via `_mint` AND don't implement Enumerable. Same 50-iteration cap.

5. **In-simulator tokenURI capture (`_captureTokenUris`)** — After the call finishes and all NFT entries are populated (via hook + Enumerable + nextTokenId paths), the simulator staticcalls `tokenURI(id)` (ERC-721) or `uri(id)` (ERC-1155) for every entry and stores the **raw return bytes** in the `NftReceived.tokenUriRaw` field. This is critical for state-dependent on-chain metadata (Uniswap V3/V4 position SVGs render the current pool tick + price range — querying `tokenURI` *after* `eth_call` returns would give the pre-tx state because the chain doesn't actually change). TS decodes the raw bytes via `decodeAbiParameters([{type:"string"}], raw)`.

6. **URI resolution** — `enrichReceivedNfts()` decodes each `tokenUriRaw` into a string and feeds it to `resolveNftMetadata()`, which handles:
   - `data:application/json;base64,...` and `data:application/json,...` (synchronous)
   - `data:image/...` (returned directly)
   - `ipfs://...` (rewritten to `https://ipfs.io/ipfs/`)
   - `https://...` / `http://...` (5-second timeout, `referrerPolicy: "no-referrer"`, `credentials: "omit"`)
   - JSON metadata fields: `image`, `image_url`, `imageUrl`, `image_data`, `animation_url` (first non-empty wins)
   - Inline SVG markup → wrapped as `data:image/svg+xml;utf8,...`

7. **Outgoing NFTs / non-safe transfers** — These don't trigger the receiver callbacks. We fall back to the `balanceOf` delta and show `±N` for the collection without specific tokenIds (the `NftAssetInfo.tokenId` field is `null`). For incoming non-safe mints we still get tokenIds via the Enumerable fallback (step 3) or `nextTokenId()` fallback (step 4).

8. **Two-phase metadata + retry** — Initial simulation returns immediately with `metadataLoading: true` for any NFT whose IPFS/HTTPS fetch hasn't completed yet. The retry loop in `AssetChangesDisplay` then calls `retryTokenMetadata`, which uses the **already-captured `tokenUri` string** (stored on the `AssetChange.nft` entry) — it does NOT re-query the contract, because the post-tx state is no longer available. NFT entries are excluded from the ERC-20 decimals/price retry path entirely.

### Sandboxed image rendering

NFT images render inside an iframe with `sandbox=""` (a unique opaque origin — no `allow-scripts`, no `allow-same-origin`, no DOM access to the parent). Even if a contract returns an SVG with embedded `<script>` tags or external resources, scripts cannot reach the extension's privileged context. The image src is also gated by `isSafeImageUrl()` (only `https://`, `http://`, `data:image/`), HTML-escaped via `htmlEscape()` before injection into `srcDoc`, and `<meta name="referrer" content="no-referrer">` suppresses the referrer header.

### NFT-specific limitations

- **Outgoing tokenId tracking** — We only know "user lost N from this collection" via the `balanceOf` delta. The specific tokenIds aren't recoverable without log access.
- **ERC-1155 outgoing** — Single-arg `balanceOf` reverts and no callback fires for outgoing transfers, so ERC-1155 sends are invisible. (ERC-1155 *receives* via `_safeMint` / `safeTransferFrom` work fine.)
- **Non-Enumerable + non-`nextTokenId` + non-safe-mint ERC-721s** — If a contract uses plain `_mint`, doesn't implement ERC-721 Enumerable, AND doesn't expose `nextTokenId()`, none of the three discovery paths work. We see the count delta but not the tokenId, so the row shows `±N` without an image. Most production ERC-721 contracts (Uniswap V3, Uniswap V4, OpenSea collections, ERC721A, etc.) hit at least one of these paths.
- **Slow IPFS gateways** — `ipfs.io` is best-effort with a 5s timeout. Users will see the placeholder until the retry loop resolves the metadata (or all 3 retries are exhausted).
- **Enumerable ordering assumption** — The fallback assumes ERC-721 Enumerable appends new tokens to the end of the owner's list (the OpenZeppelin/standard behavior). For collections that insert in the middle or reorder, the recovered tokenIds may be wrong. Standard implementations are safe.

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
