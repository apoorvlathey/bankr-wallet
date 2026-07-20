import type { TokenListEntry } from "./types";

export const MAX_SWAP_TOKEN_LIST_ENTRIES = 2_000;
const ADDRESS = /^(?:0x[a-fA-F0-9]{40}|0x[eE]{40})$/;

export function decodeSwapTokenList(value: unknown): TokenListEntry[] {
  if (!Array.isArray(value)) return [];
  const tokens: TokenListEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (tokens.length >= MAX_SWAP_TOKEN_LIST_ENTRIES) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const token = item as Partial<TokenListEntry>;
    if (
      typeof token.address !== "string" ||
      !ADDRESS.test(token.address) ||
      typeof token.name !== "string" ||
      token.name.length > 128 ||
      typeof token.symbol !== "string" ||
      token.symbol.length > 32 ||
      !Number.isInteger(token.decimals) ||
      (token.decimals as number) < 0 ||
      (token.decimals as number) > 255 ||
      typeof token.logoURI !== "string" ||
      token.logoURI.length > 2_048
    ) continue;
    const key = token.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token as TokenListEntry);
  }
  return tokens;
}
