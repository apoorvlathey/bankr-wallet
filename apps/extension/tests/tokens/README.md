# Token domain tests

- `architecture.test.ts` pins every stable root export identity, forbids
  effects in facades/pure policy, and ratchets focused module sizes.
- `customTokenStorage.test.ts` pins the `customTokens` array shape, lowercase
  identity, per-chain deduplication, whole-array updates, and serialized adds.
- `tokenMetadata.test.ts` pins source precedence, custom-image privacy, cache
  key usage, and invalid-address short-circuiting.
- `nftMetadataPolicy.test.ts` pins ERC-1155 template expansion, IPFS mapping,
  metadata field bounds, image candidate order, and raster-only inline data.

Existing `tests/network/nftMetadataBoundary.test.ts` and
`tests/transactions/{calldataAddressCandidates,erc20CandidatePreflight}.test.ts`
remain the effect-boundary regression suites.
