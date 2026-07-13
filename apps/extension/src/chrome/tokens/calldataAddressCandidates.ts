import { getAddress, type Address } from "viem";

/** Keep unknown calldata from creating an unbounded balanceOf probe list. */
export const MAX_CALLDATA_ADDRESS_CANDIDATES = 64;

/** Extract unique ABI-padded addresses, including words in nested bytes. */
export function extractCalldataAddressCandidates(
  calldata: `0x${string}`,
  excludedAddresses: readonly string[] = [],
): Address[] {
  const excluded = new Set(
    excludedAddresses.map((address) => address.toLowerCase()),
  );
  const seen = new Set<string>(excluded);
  const candidates: Address[] = [];
  const hex = calldata.slice(2);
  const paddedAddressPattern =
    /000000000000000000000000([0-9a-fA-F]{40})/g;

  for (const match of hex.matchAll(paddedAddressPattern)) {
    const raw = `0x${match[1]}`;
    const lower = raw.toLowerCase();
    if (
      lower === "0x0000000000000000000000000000000000000000" ||
      seen.has(lower)
    ) {
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
