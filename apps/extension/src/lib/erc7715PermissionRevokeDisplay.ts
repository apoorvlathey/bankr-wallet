import { formatUnits } from "viem";

import type { Erc7715PermissionRevokeMeta } from "@/chrome/requests/pendingTxStorage";
import {
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
} from "@/lib/erc7715PermissionEditing";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function frequencyLabel(seconds: number | undefined): string | null {
  switch (seconds) {
    case 60 * 60:
      return "hour";
    case 24 * 60 * 60:
      return "day";
    case 7 * 24 * 60 * 60:
      return "week";
    case 14 * 24 * 60 * 60:
      return "2 weeks";
    case 30 * 24 * 60 * 60:
      return "month";
    case 365 * 24 * 60 * 60:
      return "year";
    default:
      return seconds ? `${seconds}s` : null;
  }
}

export function formatErc7715RevokeAmount({
  meta,
  metadata,
  nativeSymbol,
  isNative,
}: {
  meta: Erc7715PermissionRevokeMeta;
  metadata: TokenDisplayMetadata | null;
  nativeSymbol: string;
  isNative: boolean;
}): string | null {
  if (!meta.amount) return null;

  try {
    const raw = BigInt(meta.amount);
    const decimals = isNative ? 18 : metadata?.decimals;
    const symbol = isNative ? nativeSymbol : metadata?.symbol || "tokens";
    if (typeof decimals !== "number") return `${raw.toString()} base units`;

    const amount = `${compactDecimal(formatUnits(raw, decimals))} ${symbol}`;
    const shouldShowFrequency =
      isErc7715PeriodicPermissionType(meta.permissionType || "") ||
      isErc7715StreamPermissionType(meta.permissionType || "");
    if (!shouldShowFrequency) return amount;

    const frequency = frequencyLabel(meta.periodDuration);
    return frequency ? `${amount} / ${frequency}` : amount;
  } catch {
    return null;
  }
}
