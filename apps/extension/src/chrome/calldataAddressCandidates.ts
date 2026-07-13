import { getAddress, type Address } from "viem";

/** Keep unknown calldata from creating an unbounded balanceOf probe list. */
export const MAX_CALLDATA_ADDRESS_CANDIDATES = 64;

/**
 * Extract ABI-padded address values from calldata.
 *
 * Solidity ABI encodes an address as a 32-byte word with twelve leading zero
 * bytes. Nested `bytes` payloads (for example Uniswap multicalls) retain those
 * words verbatim, so scanning the full calldata also finds addresses inside
 * inner calls. False positives are harmless: the simulator's bounded
 * `balanceOf(account)` probes discard anything that is not an ERC-20 token.
 */
export function extractCalldataAddressCandidates(
  calldata: `0x${string}`,
  excludedAddresses: readonly string[] = [],
): Address[] {
  const excluded = new Set(excludedAddresses.map((address) => address.toLowerCase()));
  const seen = new Set<string>(excluded);
  const candidates: Address[] = [];
  const hex = calldata.slice(2);
  const paddedAddressPattern = /000000000000000000000000([0-9a-fA-F]{40})/g;

  for (const match of hex.matchAll(paddedAddressPattern)) {
    const raw = `0x${match[1]}`;
    const lower = raw.toLowerCase();
    if (lower === "0x0000000000000000000000000000000000000000" || seen.has(lower)) {
      continue;
    }

    try {
      candidates.push(getAddress(raw));
      seen.add(lower);
    } catch {
      continue;
    }

    if (candidates.length >= MAX_CALLDATA_ADDRESS_CANDIDATES) break;
  }

  return candidates;
}
