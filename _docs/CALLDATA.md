# Calldata Decoder — Rich Decoded Params UI

## Overview

The calldata decoder shows decoded transaction calldata in the `TransactionConfirmation` view. It uses a local decoder (ported from swiss-knife) to recursively decode calldata, then renders each parameter with type-specific interactive components (ENS/Basename/WNS/GNS/Mega resolution for addresses, unit conversion for uints, collapsible nested calldata for bytes, etc.).

## Architecture

```
CalldataDecoder.tsx          ← Top-level component (tabs, loading, copy)
  └── renderParams.tsx       ← Routes Arg → type-specific component
        ├── AddressParam     ← ENS/Basename/WNS/GNS/Mega resolution, avatars, labels, explorer link
        ├── UintParam        ← Unit conversion dropdown, format toggle
        ├── IntParam         ← Unit conversion dropdown (signed)
        ├── BoolParam        ← Green/red colored display
        ├── StringParam      ← JSON prettification, base64/SVG detection, URL fetching
        ├── BytesParam       ← Collapsible, nested decoded calldata, decimal/text tabs
        ├── TupleParam       ← Recursive rendering of tuple members
        └── ArrayParam       ← Collapsible array with item count
```

### Data Flow

```
calldata (hex string)
  → decodeRecursive() from lib/decoder/index.ts
  → DecodeRecursiveResult { functionName, signature, args: Arg[] }
  → renderParams() maps each Arg to its type-specific component via baseType
```

The decoder works directly with the `Arg[]` from `DecodeRecursiveResult` — there is no intermediate transform step. Each `Arg` has:

```typescript
type Arg = {
  name: string;      // Parameter name from ABI
  baseType: string;  // "uint256", "address", "bytes", "tuple", "array", etc.
  type: string;      // Full Solidity type string
  rawValue: any;     // Original undecoded value
  value: DecodeParamTypesResult;  // Decoded value (string | DecodeBytesParamResult | DecodeTupleParamResult | DecodeArrayParamResult)
};
```

## File Reference

### Core Files

| File | Purpose |
|------|---------|
| `components/CalldataDecoder.tsx` | Top-level decoder component with Raw/Decoded tabs, two-phase decoding, copy-as-JSON |
| `components/renderParams.tsx` | Routes `Arg` to correct param component based on `baseType`; renders param row with name + type label |
| `components/CopyButton.tsx` | Shared copy-to-clipboard button (extracted for reuse across param components) |
| `lib/convertUtils.ts` | Unit conversion (Wei/ETH/Gwei/10^6/Unix Time/Bps/%/Days/Hours/Minutes), formatting, base64/JSON/SVG detection |
| `lib/decoder/index.ts` | Recursive calldata decoder (ABI lookup, selector lookup, Safe MultiSend, ERC-7821, Uniswap paths) |
| `lib/decoder/types.ts` | Type definitions: `Arg`, `DecodeRecursiveResult`, `DecodeBytesParamResult`, etc. |

### Parameter Components (`components/decodedParams/`)

| Component | baseType match | Features |
|-----------|---------------|----------|
| `AddressParam` | `address`, bytes that pass `isAddress()` | ENS/Basename/WNS/GNS/Mega reverse resolution via `ensUtils.ts`, avatar display, eth.sh labels API, name/address toggle button, copy + explorer link |
| `UintParam` | `uint*` | Custom unit dropdown (Wei/ETH/Gwei/10^6/Unix Time/Bps↔%/Minutes/Hours/Days), format toggle (comma-separated + compact notation), tooltip with raw value |
| `IntParam` | `int*` | Same unit dropdown as UintParam (signed values) |
| `BoolParam` | `bool` | Green (`bauhaus.green`) for true, red (`bauhaus.red`) for false |
| `StringParam` | `string`, default fallback | JSON detection + RichJsonTable, base64 decoding, SVG inline rendering, URL/IPFS content fetching, tabbed Rich/Raw JSON/Image/Raw SVG views |
| `BytesParam` | `bytes*` (non-address) | Collapsible with chevron, tabs: Decoded (nested calldata tree via recursive `renderParams`), Decimal (`hexToBigInt`), Text (`hexToString`). Shows function name in collapsed state when decoded. |
| `TupleParam` | `tuple` | Renders each tuple member recursively via `renderParams` |
| `ArrayParam` | `array` | Collapsible with item count summary, renders each element via `renderParams` |

### Existing Utilities Reused

| Utility | File | Used By |
|---------|------|---------|
| `resolveAddressToName`, `getNameAvatar` | `lib/ensUtils.ts` | AddressParam |
| `getChainConfig(chainId).explorer` | `constants/chainConfig.ts` | AddressParam |
| `useBauhausToast` | `hooks/useBauhausToast.tsx` | CopyButton |
| `ShapesLoader` | `components/Chat/ShapesLoader.tsx` | CalldataDecoder (loading indicator in tab) |
| `formatEther`, `formatUnits`, `isAddress`, `hexToBigInt`, `hexToString` | viem | Various param components |

## CalldataDecoder UX Behavior

### Tab Behavior

- **Default tab**: Raw — shows calldata immediately without waiting for decoding
- **Two-phase decoding**: On mount, Phase 1 runs a fast local decode (no network). The ShapesLoader spinner appears only during Phase 1. Once local decode succeeds, the spinner disappears and the Decoded tab is shown instantly. Phase 2 (ABI fetch via Sourcify) runs silently in the background and updates the UI only if it finds better results (param names or a different function name).
- **Auto-switch**: When local decoding succeeds, auto-switches to the Decoded tab
- **Always clickable**: Both tabs are always clickable. If user clicks Decoded while loading, they see skeleton loaders. If decoding failed, they see "Could not decode calldata"
- **Copy behavior**: On Decoded tab, copies full decoded JSON (function name + args). On Raw tab, copies raw calldata hex

### Two-Phase Decoding

**Phase 1 — Instant local decode** (no network):
`CalldataDecoder` calls `decodeRecursive({ calldata })` without `address`/`chainId`, which skips ABI fetching and goes straight to selector-based local strategies. This is near-instant.

**Phase 2 — Background ABI fetch** (silent):
If Phase 1 succeeds, `decodeRecursive({ calldata, address, chainId })` runs in the background. The ABI is fetched from Sourcify. The UI only updates if the ABI result is better:
- Different function name (ABI found a more accurate match)
- Same function but ABI has real param names (e.g., `_to`, `amount` vs unnamed)

If Phase 1 fails entirely, Phase 2 runs with a loading skeleton (same as old behavior).

### Decoding Strategies (in order)

The decoder in `lib/decoder/index.ts` tries these strategies:

1. **ABI from contract address** — fetches ABI via Sourcify v2 API (`fetchContractAbi`), decodes with it
2. **ERC-7821 Execute** — checks for `0xe9ae5c53` selector
3. **4byte/Sourcify selector lookup** — looks up function signature by selector
4. **Safe MultiSend** — parses packed multi-send transaction bytes
5. **Uniswap path** — decodes `(address, uint24, address)` path format
6. **ABI-encoded data guessing** — `@openchainxyz/abi-guesser`
7. **Universal Router commands** — maps command bytes to names
8. **Function fragment guessing** — `@openchainxyz/abi-guesser` fragment mode
9. **UTF-8 text** — attempts `hexToString` with printability check

### ABI Fetching (Sourcify v2)

`lib/decoder/fetchAbi.ts` uses the Sourcify v2 API — no API keys required, supports 180+ chains.

```
GET https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=abi,compilation.name,proxyResolution
```

- Returns parsed ABI directly (no JSON string parsing needed)
- Proxy detection is built-in via `proxyResolution` field (supports EIP-1967, Gnosis Safe, Diamond, etc.)
- When a proxy is detected, a second request fetches the implementation's ABI

### Recursive Decoding

`bytes` parameters are recursively decoded — the decoder calls `decodeRecursive` on the bytes value with incremented `_depth`. This produces a tree structure where nested calldata (e.g., multicall inner calls, Safe MultiSend transactions) is fully decoded and rendered as collapsible sub-trees.

## Type Routing Logic (`renderParamTypes`)

```
baseType starts with "uint"  → UintParam
baseType starts with "int"   → IntParam
baseType === "address"        → AddressParam
baseType === "bool"           → BoolParam
baseType includes "bytes"     → isAddress(value) ? AddressParam : BytesParam
baseType === "tuple"          → TupleParam
baseType === "array"          → ArrayParam
default (string, etc.)        → StringParam
```

Note: `bytes` values that pass viem's `isAddress()` check are rendered as `AddressParam` instead of `BytesParam`.

## Portal Rendering (UintParam / IntParam)

The unit conversion dropdown menus in `UintParam` and `IntParam` are rendered via Chakra `<Portal>` to prevent clipping by parent overflow containers (modals, scrollable areas):

- Dropdown menu uses `position="fixed"` with coordinates computed via `getBoundingClientRect()` on button click
- Auto-closes on outside click (`mousedown` listener) or scroll (position would be stale)
- This pattern ensures dropdowns remain visible even inside `TxDetailModal` or other constrained containers

## Styling Conventions

All param components follow the extension's Bauhaus design system:

- **Borders**: 1px solid gray.300 for low-key controls (toggle buttons, dropdowns), 1.5-2px solid bauhaus.black for content containers
- **No border-radius**: All elements use `borderRadius={0}`
- **Colors**: Blue (`bauhaus.blue`) for addresses, gold (`#B8860B`) for numbers, green/red for booleans, black for text
- **Typography**: Mono font for values, uppercase labels, bold weights
- **Toggle buttons**: Low-key style (1px gray border, no shadow, border darkens on hover)
- **Custom dropdowns**: Positioned absolute popover with bauhaus.black highlight for selected item, 2px offset shadow
- **Nesting**: Left border (2px solid bauhaus.black) with padding for visual tree hierarchy
- **Collapsibles**: ChevronDown/ChevronRight icons for expand/collapse
- **Tight icon spacing**: Copy + explorer link buttons grouped in `HStack spacing={0}`

## Unit Conversion Options

The `convertUtils.ts` module provides these conversion options for uint/int params:

| Option | Conversion |
|--------|-----------|
| Wei | Raw value (no conversion) |
| ETH | `formatEther(value)` (÷ 10^18) |
| Gwei | `formatUnits(value, 9)` (÷ 10^9) |
| 10^6 | `formatUnits(value, 6)` (÷ 10^6, for USDC-like tokens) |
| Unix Time | `new Date(value * 1000).toUTCString()` |
| Bps ↔ % | `(value / 100).toFixed(2)%` |
| Minutes | `(value / 60).toFixed(2) min` |
| Hours | `(value / 3600).toFixed(2) hrs` |
| Days | `(value / 86400).toFixed(2) days` |

The **Format** toggle adds comma separation and compact notation (K/M/B/T) to numeric values.
