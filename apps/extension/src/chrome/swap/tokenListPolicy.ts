import { WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import type { TokenListEntry } from "./types";

const EXTRA_TOKENS_PER_CHAIN: Record<number, TokenListEntry[]> = {
  8453: [
    {
      address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
      name: "WalletChan",
      symbol: "WCHAN",
      decimals: 18,
      logoURI: WALLETCHAN_ICON_URL,
    },
  ],
};

/** Pinned entries win by address and are prepended before upstream entries. */
export function mergePinnedTokens(
  chainId: number,
  apiTokens: TokenListEntry[],
): TokenListEntry[] {
  const pinned = EXTRA_TOKENS_PER_CHAIN[chainId];
  if (!pinned || pinned.length === 0) return apiTokens;
  const seen = new Set<string>();
  const merged: TokenListEntry[] = [];
  for (const token of pinned) {
    merged.push(token);
    seen.add(token.address.toLowerCase());
  }
  for (const token of apiTokens) {
    if (seen.has(token.address.toLowerCase())) continue;
    merged.push(token);
  }
  return merged;
}
