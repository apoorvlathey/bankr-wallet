import { formatUnits } from "viem";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { formatUsd } from "@/lib/currencyFormatUtils";
import {
  displayPermissionOrigin,
  formatApprovalRevocationMethods,
  permissionTitle,
} from "@/lib/erc7715PermissionDisplay";
import {
  getErc7715PermissionAmount,
  getErc7715PermissionAmountPerSecond,
  getErc7715PermissionExpiry,
  getErc7715PermissionPeriodDuration,
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import type { Erc7715PermissionAsset } from "./useErc7715PermissionAsset";

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
const MINUTE_SECONDS = 60;
const YEAR_SECONDS = 365 * DAY_SECONDS;

export interface PermissionPresentation {
  origin: string;
  originHostname: string | null;
  originInitials: string;
  title: string;
  description: string;
  permissionTypeLabel: string;
  isRevocation: boolean;
  limitLabel: string;
  assetLabel: string;
  amountLabel: string;
  fiatEstimate?: string;
  exposureMeta: string;
}

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function frequencyLabel(seconds: number | null): string {
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
      return seconds ? `${seconds} seconds` : "period";
  }
}

function durationUnit(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

export function formatPermissionExpiry(
  expiry: number | null,
  nowSeconds: number,
): string {
  if (expiry === null) return "No expiration";

  const remaining = Math.floor(expiry - nowSeconds);
  if (remaining <= 0) return "Expired";
  if (remaining < MINUTE_SECONDS) {
    return `Expires in ${durationUnit(remaining, "second")}`;
  }
  if (remaining < HOUR_SECONDS) {
    return `Expires in ${durationUnit(Math.floor(remaining / MINUTE_SECONDS), "minute")}`;
  }
  if (remaining < DAY_SECONDS) {
    return `Expires in ${durationUnit(Math.floor(remaining / HOUR_SECONDS), "hour")}`;
  }
  if (remaining < YEAR_SECONDS) {
    return `Expires in ${durationUnit(Math.floor(remaining / DAY_SECONDS), "day")}`;
  }
  return `Expires in ${durationUnit(Math.floor(remaining / YEAR_SECONDS), "year")}`;
}

function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname || null;
  } catch {
    return origin === "WalletConnect" ? origin : null;
  }
}

function initials(value: string): string {
  return (
    value
      .split(/[.\s-]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function intent(type: string): { title: string; description: string } {
  if (type === "token-approval-revocation") {
    return {
      title: "Allow approval cleanup",
      description:
        "This delegate can revoke only the approval methods listed below without asking each time.",
    };
  }
  if (type.endsWith("-periodic")) {
    return {
      title: "Allow recurring spending",
      description:
        "This delegate can spend from your account each period without asking each time, within the limits below.",
    };
  }
  if (type.endsWith("-stream")) {
    return {
      title: "Allow continuous spending",
      description:
        "This delegate can continuously access funds without asking each time, within the rate and total limits below.",
    };
  }
  return {
    title: "Allow delegated spending",
    description:
      "This delegate can spend from your account without asking each time, up to the limit below.",
  };
}

export function canGrantErc7715Permission(accountType?: string): boolean {
  return accountType === "privateKey" || accountType === "seedPhrase";
}

export function permissionDatePickerError(
  error: string | null,
  field: "start" | "expiration",
): string | null {
  if (error !== "Expiration must be after start time") return error;
  return field === "start"
    ? "Start time must be before expiration"
    : error;
}

export function buildPermissionPresentation({
  permissionRequest,
  editedRequest,
  asset,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  asset: Erc7715PermissionAsset;
  nowSeconds?: number;
}): PermissionPresentation {
  const type = permissionRequest.permissionType;
  const isRevocation = isErc7715TokenApprovalRevocationPermissionType(type);
  const isPeriodic = isErc7715PeriodicPermissionType(type);
  const isStream = isErc7715StreamPermissionType(type);
  const displayOrigin = displayPermissionOrigin(permissionRequest);
  const hostname = originHostname(displayOrigin);
  const expiry = getErc7715PermissionExpiry(editedRequest);
  const expiryMeta = formatPermissionExpiry(expiry, nowSeconds);
  const rawAmount = isRevocation
    ? 0n
    : isStream
      ? getErc7715PermissionAmountPerSecond(editedRequest) * BigInt(DAY_SECONDS)
      : getErc7715PermissionAmount(editedRequest);
  const amount = isRevocation
    ? formatApprovalRevocationMethods(editedRequest.permission.data)
    : typeof asset.decimals === "number"
      ? `${compactDecimal(formatUnits(rawAmount, asset.decimals))} ${asset.symbol}`
      : `${rawAmount.toString()} base units`;
  const cadence = isPeriodic
    ? ` per ${frequencyLabel(getErc7715PermissionPeriodDuration(editedRequest))}`
    : isStream
      ? " per day"
      : "";
  const formattedAmount =
    !isRevocation && typeof asset.decimals === "number"
      ? Number(formatUnits(rawAmount, asset.decimals))
      : 0;
  const fiatEstimate =
    Number.isFinite(formattedAmount) && formattedAmount > 0 && asset.priceUsd > 0
      ? `~${formatUsd(formattedAmount * asset.priceUsd)}`
      : undefined;
  const copy = intent(type);

  return {
    origin: displayOrigin,
    originHostname: hostname,
    originInitials: initials(hostname || displayOrigin),
    title: copy.title,
    description: copy.description,
    permissionTypeLabel: permissionTitle(type),
    isRevocation,
    limitLabel: isRevocation
      ? "Approval scope"
      : isPeriodic
        ? "Recurring limit"
        : isStream
          ? "Daily availability"
          : "Spending limit",
    assetLabel: isRevocation ? "Approval methods" : asset.symbol,
    amountLabel: `${amount}${cadence}`,
    fiatEstimate,
    exposureMeta: expiryMeta,
  };
}
