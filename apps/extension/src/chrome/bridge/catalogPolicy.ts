import type { BungeeToken } from "@walletchan/shared/bungee";

export const MAX_BRIDGE_TOKEN_LIST_ENTRIES = 2_000;
const ADDRESS = /^(?:0x[a-fA-F0-9]{40}|0x[eE]{40})$/;

export function decodeBridgeTokenList(value: unknown): BungeeToken[] {
  if (!Array.isArray(value)) return [];
  const tokens: BungeeToken[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (tokens.length >= MAX_BRIDGE_TOKEN_LIST_ENTRIES) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const token = item as Partial<BungeeToken>;
    if (
      typeof token.address !== "string" ||
      !ADDRESS.test(token.address) ||
      (token.name !== undefined &&
        (typeof token.name !== "string" || token.name.length > 128)) ||
      (token.symbol !== undefined &&
        (typeof token.symbol !== "string" || token.symbol.length > 32)) ||
      (token.decimals !== undefined &&
        (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255)) ||
      (token.icon !== undefined &&
        (typeof token.icon !== "string" || token.icon.length > 2_048)) ||
      (token.logoURI !== undefined &&
        (typeof token.logoURI !== "string" || token.logoURI.length > 2_048))
    ) continue;
    const key = token.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token as BungeeToken);
  }
  return tokens;
}
