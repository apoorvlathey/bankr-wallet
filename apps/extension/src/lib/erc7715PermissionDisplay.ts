import { formatUnits } from "viem";

import type { Erc7715PermissionGrant } from "@/chrome/pendingErc7715PermissionStorage";
import {
  isErc7715NativePermissionType,
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import { enabledApprovalRevocationMethods } from "@/lib/erc7715ApprovalRevocation";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function permissionTitle(type: string): string {
  switch (type) {
    case "native-token-allowance":
      return "Native allowance";
    case "native-token-periodic":
      return "Native periodic";
    case "native-token-stream":
      return "Native stream";
    case "erc20-token-allowance":
      return "ERC-20 allowance";
    case "erc20-token-periodic":
      return "ERC-20 periodic";
    case "erc20-token-stream":
      return "ERC-20 stream";
    case "token-approval-revocation":
      return "Token approval revocation";
    default:
      return type;
  }
}

export function tokenAddressFromGrant(
  grant: Erc7715PermissionGrant,
): string | null {
  const tokenAddress = grant.request.permission.data.tokenAddress;
  return typeof tokenAddress === "string" ? tokenAddress : null;
}

export function metadataKey(chainId: number, tokenAddress: string): string {
  return `${chainId}:${tokenAddress.toLowerCase()}`;
}

function amountFieldForGrant(grant: Erc7715PermissionGrant): string {
  if (isErc7715StreamPermissionType(grant.permissionType)) {
    return "amountPerSecond";
  }
  return isErc7715PeriodicPermissionType(grant.permissionType)
    ? "periodAmount"
    : "allowanceAmount";
}

function parseHexAmount(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function numberFromPermissionValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed = value.startsWith("0x")
      ? Number(BigInt(value))
      : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function frequencyLabel(value: unknown): string | null {
  const seconds = numberFromPermissionValue(value);
  if (seconds === null) return null;

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
      return `${seconds}s`;
  }
}

function amountPerDay(rawAmountPerSecond: bigint): bigint {
  return rawAmountPerSecond * 86400n;
}

export function formatDateTime(seconds: number | null): string {
  if (seconds === null) return "No expiry";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}

export function formatApprovalRevocationMethods(
  data: Record<string, unknown>,
): string {
  const methods = enabledApprovalRevocationMethods(data);
  if (methods.length === 0) return "No revocation methods";
  return methods.map((method) => method.label).join(", ");
}

export function formatGrantAmount(
  grant: Erc7715PermissionGrant,
  metadata: TokenDisplayMetadata | null | undefined,
  nativeSymbol: string,
): string {
  if (isErc7715TokenApprovalRevocationPermissionType(grant.permissionType)) {
    return formatApprovalRevocationMethods(grant.request.permission.data);
  }

  const raw = parseHexAmount(
    grant.request.permission.data[amountFieldForGrant(grant)],
  );
  if (raw === null) return "Unknown amount";

  const isNative = isErc7715NativePermissionType(grant.permissionType);
  const decimals = isNative ? 18 : metadata?.decimals;
  const symbol = isNative ? nativeSymbol : metadata?.symbol || "tokens";
  if (typeof decimals !== "number") {
    return `${raw.toString()} base units`;
  }

  const displayRaw = isErc7715StreamPermissionType(grant.permissionType)
    ? amountPerDay(raw)
    : raw;
  const amount = `${compactDecimal(formatUnits(displayRaw, decimals))} ${symbol}`;
  if (isErc7715StreamPermissionType(grant.permissionType)) {
    return `${amount} / day`;
  }
  if (!isErc7715PeriodicPermissionType(grant.permissionType)) return amount;

  const period = frequencyLabel(grant.request.permission.data.periodDuration);
  return period ? `${amount} / ${period}` : amount;
}

export function groupGrantsByOrigin(
  grants: Erc7715PermissionGrant[],
): [string, Erc7715PermissionGrant[]][] {
  const groups = new Map<string, Erc7715PermissionGrant[]>();
  for (const grant of grants) {
    const origin = displayGrantOrigin(grant);
    const group = groups.get(origin) || [];
    group.push(grant);
    groups.set(origin, group);
  }

  return Array.from(groups.entries()).map(([origin, items]) => [
    origin,
    items.sort((a, b) => b.createdAt - a.createdAt),
  ]);
}

export function displayGrantOrigin(grant: Erc7715PermissionGrant): string {
  if (grant.origin.startsWith("walletconnect:")) {
    return grant.senderOrigin || "WalletConnect";
  }
  return grant.senderOrigin || grant.origin;
}

export function displayPermissionOrigin({
  origin,
  senderOrigin,
}: {
  origin: string;
  senderOrigin?: string;
}): string {
  if (origin.startsWith("walletconnect:")) {
    return senderOrigin || "WalletConnect";
  }
  return senderOrigin || origin;
}
