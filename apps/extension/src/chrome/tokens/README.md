# Token metadata and discovery audit domain

Stable root paths remain export-only compatibility facades:

- `customTokenStorage.ts`
- `tokenMetadata.ts`
- `tokenLogoConstants.ts`
- `nftMetadata.ts`
- `erc20CandidatePreflight.ts`
- `calldataAddressCandidates.ts`

Focused ownership:

- `types.ts` contains the public custom-token, display metadata, NFT metadata,
  and candidate-preflight contracts.
- `customTokenStorage.ts` exclusively owns the released `customTokens` array
  and its `local:customTokens` read-modify-write lock.
- `tokenMetadata.ts` coordinates the exact onchain → Bungee → custom metadata
  precedence and swap → Bungee → custom → hardcoded logo precedence.
- `tokenLogoConstants.ts` contains packaged canonical logo fallbacks.
- `nftMetadataPolicy.ts` is pure URI expansion, IPFS normalization, bounded
  inline decoding, field limits, and renderer-image sanitization.
- `nftMetadata.ts` alone performs NFT metadata fetches, with public-HTTPS
  validation at every redirect, omitted credentials/referrers, a five-second
  deadline, three-redirect limit, and 256 KiB streamed body ceiling.
- `calldataAddressCandidates.ts` performs pure bounded ABI-word discovery.
- `erc20CandidatePreflight.ts` owns the single Multicall3 filter and its
  bounded ten-minute in-memory ERC-20 metadata cache.

Candidate preflight deliberately fails open to the already bounded simulator
when Multicall3 is unavailable. None of these modules signs or broadcasts.
Remote NFT SVG/HTML never becomes a trusted renderer source.
