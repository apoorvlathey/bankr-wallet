# Clear Signing (ERC-7730)

The extension renders a human-readable view of transactions and EIP-712 signatures whenever an [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) descriptor is available for the target contract. The raw decoded view (`CalldataDecoder` / `TypedDataDisplay`) stays in the DOM, collapsed underneath the clear-signed card as **"Show raw details"**, so users can always inspect the underlying calldata.

## Source of descriptors

Descriptors come from the public registry at [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). **Nothing is bundled** in the extension. The website acts as a thin proxy + cache:

- `walletchan.com/api/clearsigning/descriptor?chainId=…&address=0x…&kind=calldata|eip712` → descriptor JSON, or 404.
- The proxy maintains an in-memory `(chainId, address) → registry-path` index, rebuilt from the GitHub Trees API every 6 hours. A committed snapshot (`apps/website/data/clearsigning-index.json`) is the fallback when GitHub is unreachable.
- Regenerate the snapshot with `pnpm tsx apps/website/scripts/snapshot-clearsigning-index.ts`.

## Resolution flow

```
Confirmation surface
  └─ <ClearSigningView kind=calldata|eip712 …/>
       └─ useClearSigningDescriptor(chainId, address)
            └─ message: GET_CLEAR_SIGNING_DESCRIPTOR
                 └─ clearSigningHandlers.ts (background)
                      ├─ chrome.storage.local cache  cs:desc:<chainId>:<address>
                      │    (TTL 7d hits, 1d misses)
                      └─ walletchan.com/api/clearsigning/descriptor
```

Two lookup keys, same descriptor file:

- **Calldata**: `(chainId, to)` → match `display.formats[signature]` whose 4-byte selector equals `calldata[0..4]`.
- **EIP-712**: `(chainId, domain.verifyingContract)` → match `display.formats[encodedTypeString]` whose encoded type string equals the typed-data's primaryType expansion.

The registry uses **full canonical signatures** (e.g. `"exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params)"`) as keys, not 4-byte selectors. The extension computes the selector from the signature at match time.

## Supported field formats (v1)

| Format         | Behaviour                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------ |
| `raw`          | Render verbatim (address copy / numeric monospace based on type).                          |
| `addressName`  | Resolve ENS / eth.sh / chain explorer label, fall back to truncated address + copy.        |
| `tokenAmount`  | Look up token at `params.tokenPath`, format with decimals + symbol from the token list.    |
| `amount`       | Native coin amount with chain symbol.                                                      |
| `date`         | Convert timestamp / blockheight (per `params.encoding`) to local date string.              |
| `unit`         | Apply `params.decimals` + `params.base` (`%`, `s`, …) + optional `params.prefix`.          |
| `nftName`      | _Out of scope for v1, falls back to `raw`._                                                |
| `duration`     | _Out of scope for v1, falls back to `raw`._                                                |
| `enum`         | _Out of scope for v1, falls back to `raw`._                                                |
| `calldata`     | _Out of scope for v1, falls back to `raw`._                                                |

Unknown / unsupported formats fall through to `raw`, which always renders something safe.

## Path resolution

Paths inside `fields[].path` use dot notation, array indexing, and byte slicing:

| Path syntax            | Meaning                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `params.amountIn`      | `params` field → `amountIn` field                                |
| `path.[0]`             | First element of an array.                                       |
| `path.[-1]`            | Last element of an array.                                        |
| `details.[]`           | Iterate every element; subsequent `fields[]` apply per element.  |
| `params.path.[0:20]`   | Slice the first 20 bytes of a `bytes` value (token-in address).  |
| `params.path.[-20:]`   | Slice the last 20 bytes (token-out address).                     |

## Tx-confirmation surfaces wired

| Surface                                                | Insertion                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `TransactionConfirmation.tsx` (single dapp tx)         | Above `CalldataDecoder`, passes `defaultCollapsed` down.    |
| `BatchTransactionConfirmation.tsx` (ERC-5792 batch)    | One `ClearSigningView` per call inside the per-call card.   |
| `CrossDappBatchConfirmation.tsx` (user-assembled)      | Inherits via the wrapped `BatchTransactionConfirmation`.    |
| `SignatureRequestConfirmation.tsx` (EIP-712 typed)     | Above `TypedDataDisplay`; raw struct collapses on hit.      |

`personal_sign` / `eth_sign` are intentionally out of scope — they have no contract context, so clear signing doesn't apply.

## Privacy

A descriptor fetch reveals `(chainId, contract address)` to the walletchan.com proxy. Users who don't want this can opt out under **Settings → Privacy → "Use clear-signing descriptors"** (default ON). When OFF, the background handler short-circuits before any network or storage access.

## Adding a new descriptor

We don't host our own registry. To get a new contract covered:

1. Author a descriptor following the [ERC-7730 spec](https://github.com/ethereum/clear-signing-erc7730-registry/tree/master/specs).
2. Submit a PR to [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).
3. Once merged, regenerate our snapshot (`pnpm tsx apps/website/scripts/snapshot-clearsigning-index.ts`) and ship a website redeploy. No extension release required.

## Storage keys

Documented in `_docs/STORAGE.md`:

- `cs:desc:<chainId>:<address>` — descriptor cache entry (hit or miss).
- `cs:enabled` — boolean opt-out flag (default `true`).

## Threat model

Descriptors are public, non-authoritative metadata. A malicious or buggy descriptor could mislabel a transaction. Mitigations:

- Raw decoder always remains accessible underneath ("Show raw details").
- Asset Changes simulation (`AssetChangesDisplay`) is unaffected by descriptors — it runs onchain and shows the ground-truth balance deltas.
- The opt-out toggle lets paranoid users disable clear signing entirely.
- The registry has automated CI (schema + ABI consistency + deployment verification) and maintainer review; we trust this for v1.

A future iteration may add per-descriptor attestation checks (ERC-8021), but that's out of scope today.
