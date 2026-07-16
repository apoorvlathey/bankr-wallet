import type {
  AssetChangeRecord,
  AssetTransferRecord,
} from "@/chrome/txHistoryStorage";
import {
  appendTokenSymbol,
  formatTokenBaseUnits,
} from "@/lib/tokenAmountFormat";

export function formatValue(
  value: string | undefined,
  symbol = "ETH",
): string {
  if (!value) return `0 ${symbol}`;
  const formatted = formatTokenBaseUnits(value, 18, true);
  return formatted ? appendTokenSymbol(formatted, symbol) : `0 ${symbol}`;
}

/**
 * Format a positive base-unit amount without collapsing tiny non-zero values.
 */
export function formatTokenAmountWei(
  amountWei: string,
  decimals: number,
): string | null {
  return formatTokenBaseUnits(amountWei, decimals, true);
}

export function formatSignedTokenAmount(
  amountWei: string,
  decimals: number,
  isNegative: boolean,
): string | null {
  const magnitude = formatTokenAmountWei(amountWei, decimals);
  if (magnitude === null) return null;
  return `${isNegative ? "−" : "+"}${magnitude}`;
}

export type TokenChangeDirection = "in" | "out";

export type RenderableErc20Transfer = {
  t: AssetTransferRecord;
  formatted: string;
};

export type Erc20TransferGroup = {
  key: string;
  direction: TokenChangeDirection;
  token: string;
  symbol?: string;
  logoUrl?: string;
  decimals: number;
  totalWei: string;
  totalFormatted: string;
  transfers: RenderableErc20Transfer[];
};

function absBigInt(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed < 0n ? -parsed : parsed;
  } catch {
    return null;
  }
}

/** Group duplicate token/direction transfers while retaining counterparties. */
export function getErc20TransferGroups(
  record: AssetChangeRecord | undefined,
  direction?: TokenChangeDirection,
): Erc20TransferGroup[] {
  if (!record) return [];

  const groups = new Map<
    string,
    Omit<Erc20TransferGroup, "totalWei" | "totalFormatted"> & {
      totalWei: bigint;
    }
  >();

  for (const transfer of record.erc20Transfers) {
    if (direction && transfer.direction !== direction) continue;
    const amount = absBigInt(transfer.amountWei);
    if (amount === null || amount === 0n) continue;

    const decimals = transfer.decimals ?? 18;
    const formatted = formatSignedTokenAmount(
      amount.toString(),
      decimals,
      transfer.direction === "out",
    );
    if (formatted === null) continue;

    const key = `${transfer.direction}-${transfer.token.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalWei += amount;
      existing.transfers.push({ t: transfer, formatted });
      existing.symbol = existing.symbol ?? transfer.symbol;
      existing.logoUrl = existing.logoUrl ?? transfer.logoUrl;
      continue;
    }

    groups.set(key, {
      key,
      direction: transfer.direction,
      token: transfer.token,
      symbol: transfer.symbol,
      logoUrl: transfer.logoUrl,
      decimals,
      totalWei: amount,
      transfers: [{ t: transfer, formatted }],
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const totalWei = group.totalWei.toString();
      const totalFormatted = formatSignedTokenAmount(
        totalWei,
        group.decimals,
        group.direction === "out",
      );
      if (totalFormatted === null) return null;
      return { ...group, totalWei, totalFormatted };
    })
    .filter((group): group is Erc20TransferGroup => group !== null);
}

/** Select the summarized transfer amount used by swap and bridge summaries. */
export function pickAssetChangeAmount(
  record: AssetChangeRecord | undefined,
  direction: TokenChangeDirection,
  symbolHint: string | undefined,
  nativeFallbackIsNative: boolean,
  nativeDecimals: number,
): {
  amountLabel: string;
  amountWei: string;
  decimals: number;
  source: string | "native";
} | null {
  if (!record) return null;
  const hint = symbolHint?.toLowerCase();
  const directionGroups = getErc20TransferGroups(record, direction);
  const symbolMatch = hint
    ? directionGroups.find((group) => group.symbol?.toLowerCase() === hint)
    : undefined;
  const picked = symbolMatch ?? directionGroups[0];
  if (picked) {
    const decimals = picked.decimals ?? 18;
    const label = formatTokenAmountWei(picked.totalWei, decimals);
    if (label !== null) {
      return {
        amountLabel: label,
        amountWei: picked.totalWei,
        decimals,
        source: picked.token,
      };
    }
  }
  if (nativeFallbackIsNative && record.nativeDelta) {
    const label = formatTokenAmountWei(record.nativeDelta, nativeDecimals);
    if (label !== null) {
      return {
        amountLabel: label,
        amountWei: record.nativeDelta,
        decimals: nativeDecimals,
        source: "native",
      };
    }
  }
  return null;
}

export function formatLocalTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
