import { formatUnits, type Address } from "viem";

import { getPreflightTokenMetadata } from "../erc20CandidatePreflight";
import { KNOWN_TOKEN_LOGOS } from "../tokenLogoConstants";
import type { NativeCurrencyMetadata } from "./nativeCurrency";
import type { AssetChange, RawNftReceived } from "./types";

/** Format a numeric amount using the wallet's established preview rules. */
export function formatAmount(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  if (value < 0.000001) return "<0.000001";
  return parseFloat(value.toPrecision(6)).toString();
}

export function buildPreflightTokenChanges(
  chainId: number,
  tokens: Address[],
  deltas: bigint[],
): AssetChange[] | null {
  const metadata = tokens.map((token) =>
    getPreflightTokenMetadata(chainId, token),
  );
  if (metadata.some((entry) => entry === null)) return null;

  return tokens.map((token, index) => {
    const tokenMetadata = metadata[index]!;
    const delta = deltas[index];
    const abs = delta < 0n ? -delta : delta;
    const amount = parseFloat(formatUnits(abs, tokenMetadata.decimals));
    return {
      address: token,
      symbol: tokenMetadata.symbol,
      name: tokenMetadata.name,
      decimals: tokenMetadata.decimals,
      logoUrl: KNOWN_TOKEN_LOGOS[token.toLowerCase()] || undefined,
      rawDelta: delta.toString(),
      formattedAmount: formatAmount(amount),
      valueUsd: null,
      direction: delta > 0n ? "in" : "out",
    };
  });
}

export function buildNativeChange(
  delta: bigint,
  native: NativeCurrencyMetadata,
  priceUsd: number | null,
): AssetChange | null {
  if (delta === 0n) return null;
  const abs = delta < 0n ? -delta : delta;
  const amount = parseFloat(formatUnits(abs, native.decimals));
  return {
    address: "native",
    symbol: native.symbol,
    name: native.name,
    decimals: native.decimals,
    logoUrl: native.icon,
    rawDelta: delta.toString(),
    formattedAmount: formatAmount(amount),
    valueUsd: priceUsd !== null ? amount * priceUsd : null,
    direction: delta > 0n ? "in" : "out",
  };
}

export function buildUnpricedNativeChange(
  delta: bigint,
  native: NativeCurrencyMetadata,
): AssetChange | null {
  return buildNativeChange(delta, native, null);
}

export function normalizeRawNftsReceived(
  entries: readonly {
    token: Address;
    tokenId: bigint;
    amount: bigint;
    standard: number | bigint;
    tokenUriRaw?: `0x${string}`;
  }[],
): RawNftReceived[] {
  return entries.map((entry) => ({
    token: entry.token,
    tokenId: entry.tokenId,
    amount: entry.amount,
    standard: Number(entry.standard),
    tokenUriRaw: entry.tokenUriRaw ?? "0x",
  }));
}
