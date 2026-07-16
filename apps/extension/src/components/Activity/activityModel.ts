import type {
  ClearSignedMeta,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import { VIEM_CHAINS } from "@/constants/chainRegistry";
import {
  formatActivityAddress,
  getLiveActivityAddressLabel,
} from "./activityIdentityModel";

export interface ActivityDateGroup {
  label: string;
  txs: CompletedTransaction[];
}

export interface ActivityStatusModel {
  isForceInclusion: boolean;
  isForcePendingL1: boolean;
  isForcePendingL2: boolean;
  isBridge: boolean;
  bridgeCode: number | undefined;
  bridgeFulfilled: boolean;
  bridgeRefunded: boolean;
  bridgeFailedTerminal: boolean;
  isBridgePendingDest: boolean;
}

export interface ActivityPresentation {
  originHostname: string | null;
  intent: string;
  context: string;
  value: string | null;
  compactValue: string | null;
}

/** Group transactions by date label. */
export function groupActivityByDate(
  txs: CompletedTransaction[],
  today: Date,
): ActivityDateGroup[] {
  const groups: Map<string, CompletedTransaction[]> = new Map();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(yesterday);

  for (const tx of txs) {
    const date = new Date(tx.createdAt);
    const key = toDateKey(date);
    let label: string;
    if (key === todayKey) label = "Today";
    else if (key === yesterdayKey) label = "Yesterday";
    else label = formatDate(date);

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(tx);
  }

  return Array.from(groups.entries()).map(([label, groupedTxs]) => ({
    label,
    txs: groupedTxs,
  }));
}

export function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

export function formatActivityFunctionName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\b[A-Z][a-z]+\b/g, (word) => word.toLowerCase());
  if (!normalized) return "Contract interaction";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatTimeAgo(timestamp: number, now: number): string {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(value: number): string {
  return String(value)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)])
    .join("");
}

/** Format a decimal amount string for the Activity row. */
export function formatActivityAmount(
  value: string,
  compactTiny = false,
): string {
  const [integer = "0", decimal = ""] = value.split(".");
  const digits = integer.length;
  if (digits <= 9) {
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const significantDecimal = decimal.replace(/0+$/, "");
    const firstNonZero = significantDecimal.search(/[1-9]/);
    if (integer === "0" && firstNonZero >= 6) {
      const coefficient = significantDecimal
        .slice(firstNonZero, firstNonZero + 4)
        .replace(/0+$/, "");
      if (compactTiny) {
        return `0.0${toSubscript(firstNonZero)}${coefficient}`;
      }
      return `0.${"0".repeat(firstNonZero)}${coefficient}`;
    }
    const trimmed = significantDecimal.slice(0, 6).replace(/0+$/, "");
    return trimmed ? `${formatted}.${trimmed}` : formatted;
  }
  if (digits <= 12) {
    const intBig = BigInt(integer);
    const scaled = (intBig * 100n) / 1_000_000_000n;
    const whole = scaled / 100n;
    const fraction = scaled % 100n;
    return `${whole}.${fraction.toString().padStart(2, "0")}B`;
  }
  const first = integer[0];
  const next = integer.slice(1, 3).padEnd(2, "0");
  return `${first}.${next}e${digits - 1}`;
}

function toExactBaseUnits(value: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  return (
    BigInt(integer) * scale +
    BigInt((fraction || "0").padEnd(decimals, "0"))
  );
}

function getActivityTokenDecimals(
  tx: CompletedTransaction,
  meta: ClearSignedMeta | undefined,
): number | undefined {
  if (meta?.tokenDecimals !== undefined) return meta.tokenDecimals;

  if (meta?.tokenAddress) {
    const tokenAddress = meta.tokenAddress.toLowerCase();
    const transfer = tx.assetChanges?.erc20Transfers.find(
      (entry) => entry.token === tokenAddress,
    );
    if (transfer?.decimals !== undefined) return transfer.decimals;
  }

  if (meta?.kind === "nativeSend") {
    return VIEM_CHAINS[tx.chainId]?.nativeCurrency.decimals;
  }

  if (tx.transferMeta) {
    const native = VIEM_CHAINS[tx.chainId]?.nativeCurrency;
    if (native?.symbol === tx.transferMeta.symbol) return native.decimals;
  }

  return undefined;
}

function formatActivityValueLabel(
  amount: string,
  symbol: string,
  prefix: string,
  decimals: number | undefined,
  compactTiny: boolean,
): string {
  if (decimals === 18) {
    const baseUnits = toExactBaseUnits(amount, decimals);
    if (baseUnits !== null && baseUnits >= 1n && baseUnits <= 99_999n) {
      const formattedBaseUnits = baseUnits
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return `${prefix}${formattedBaseUnits} wei`;
    }
  }
  return `${prefix}${formatActivityAmount(amount, compactTiny)} ${symbol}`;
}

function getCounterpartyDisplay(
  meta: ClearSignedMeta,
  addressLabels?: ReadonlyMap<string, string>,
): string {
  if (meta.counterparty) {
    const liveLabel = getLiveActivityAddressLabel(
      meta.counterparty,
      addressLabels,
    );
    if (liveLabel) return liveLabel;
  }
  if (meta.counterpartyLabel) return meta.counterpartyLabel;
  if (meta.counterpartyEns) return meta.counterpartyEns;
  const address = meta.counterparty;
  if (!address) return "";
  return formatActivityAddress(address);
}

function getClearSignedIntent(meta: ClearSignedMeta): string {
  if (meta.kind === "approve") {
    if (meta.isRevoke) {
      return ["Revoke", meta.tokenSymbol, "approval"]
        .filter(Boolean)
        .join(" ");
    }
    return ["Approve", meta.tokenSymbol].filter(Boolean).join(" ");
  }
  if (meta.kind === "transfer" || meta.kind === "nativeSend") {
    return ["Send", meta.tokenSymbol].filter(Boolean).join(" ");
  }
  return meta.intent || meta.contractName || "Contract interaction";
}

function getActivityValue(
  tx: CompletedTransaction,
  compactTiny: boolean,
): string | null {
  if (tx.transferMeta) {
    return formatActivityValueLabel(
      tx.transferMeta.amount,
      tx.transferMeta.symbol,
      "−",
      getActivityTokenDecimals(tx, tx.clearSignedMeta),
      compactTiny,
    );
  }
  const meta = tx.clearSignedMeta;
  if (!meta || !meta.tokenSymbol) return null;
  if (meta.kind === "erc7730" || meta.isRevoke) return null;
  if (meta.isInfinite) return `Unlimited ${meta.tokenSymbol}`;
  if (!meta.amount) return null;
  const prefix =
    meta.kind === "transfer" || meta.kind === "nativeSend" ? "−" : "";
  return formatActivityValueLabel(
    meta.amount,
    meta.tokenSymbol,
    prefix,
    getActivityTokenDecimals(tx, meta),
    compactTiny,
  );
}

function getClearSignedContext(
  meta: ClearSignedMeta,
  addressLabels?: ReadonlyMap<string, string>,
): string | null {
  const counterparty = getCounterpartyDisplay(meta, addressLabels);
  if (!counterparty) return null;
  if (meta.kind === "approve") {
    return meta.isRevoke
      ? `Approval from ${counterparty}`
      : `Spending limit for ${counterparty}`;
  }
  if (meta.kind === "transfer" || meta.kind === "nativeSend") {
    return `To ${counterparty}`;
  }
  return meta.contractName && meta.contractName !== meta.intent
    ? meta.contractName
    : counterparty;
}

export function getInternalSendSymbol(
  tx: CompletedTransaction,
): string | null {
  if (tx.transferMeta?.symbol) return tx.transferMeta.symbol;
  if (!tx.origin.startsWith("Send ")) return null;
  const symbol = tx.origin.slice(5).trim();
  return symbol || null;
}

export function getActivityStatusModel(
  tx: CompletedTransaction,
): ActivityStatusModel {
  const isForceInclusion = !!tx.forceInclusionMeta;
  const isForcePendingL2 =
    tx.status === "pending" &&
    isForceInclusion &&
    !tx.forceInclusionMeta!.l2Confirmed;
  const isForcePendingL1 = tx.status === "processing" && isForceInclusion;
  const isBridge = !!tx.bridge;
  const bridgeCode = tx.bridge?.bungeeStatusCode;
  const bridgeFulfilled = bridgeCode === 3 || bridgeCode === 4;
  const bridgeRefunded = bridgeCode === 7;
  const bridgeFailedTerminal = bridgeCode === 5 || bridgeCode === 6;
  const isBridgePendingDest =
    isBridge &&
    tx.status === "success" &&
    !bridgeFulfilled &&
    !bridgeRefunded &&
    !bridgeFailedTerminal;

  return {
    isForceInclusion,
    isForcePendingL1,
    isForcePendingL2,
    isBridge,
    bridgeCode,
    bridgeFulfilled,
    bridgeRefunded,
    bridgeFailedTerminal,
    isBridgePendingDest,
  };
}

export function getActivityPresentation(
  tx: CompletedTransaction,
  addressLabels?: ReadonlyMap<string, string>,
): ActivityPresentation {
  const originHostname = getOriginHostname(tx.origin);
  const arrow = " → ";
  const arrowIndex = tx.origin.indexOf(arrow);
  let bridgeIntent: string | null = null;

  if (tx.bridge) {
    if (arrowIndex !== -1) {
      bridgeIntent = `${tx.origin.slice(0, arrowIndex)} → ${tx.origin.slice(arrowIndex + arrow.length)}`;
    } else if (tx.swapMeta?.sellTokenSymbol && tx.bridge.destinationChainName) {
      bridgeIntent = `Bridge ${tx.swapMeta.sellTokenSymbol.toUpperCase()} → ${tx.bridge.destinationChainName}`;
    } else if (tx.bridge.destinationChainName) {
      bridgeIntent = `Bridge → ${tx.bridge.destinationChainName}`;
    }
  }

  const intent = tx.clearSignedMeta
    ? getClearSignedIntent(tx.clearSignedMeta)
    : tx.transferMeta
      ? `Send ${tx.transferMeta.symbol}`
      : bridgeIntent
        ? bridgeIntent
        : tx.swapMeta
          ? `Swap ${tx.swapMeta.sellTokenSymbol} → ${tx.swapMeta.buyTokenSymbol}`
          : originHostname && tx.functionName
            ? formatActivityFunctionName(tx.functionName)
            : tx.origin;

  const contextParts: string[] = [];
  const clearSignedContext = tx.clearSignedMeta
    ? getClearSignedContext(tx.clearSignedMeta, addressLabels)
    : null;
  if (clearSignedContext) contextParts.push(clearSignedContext);
  if (!clearSignedContext && tx.transferMeta?.recipient) {
    const recipient =
      getLiveActivityAddressLabel(tx.transferMeta.recipient, addressLabels) ??
      formatActivityAddress(tx.transferMeta.recipient);
    contextParts.push(`To ${recipient}`);
  }
  if (originHostname) contextParts.push(originHostname);
  if (!originHostname && tx.functionName && tx.functionName !== intent) {
    contextParts.push(tx.functionName);
  }
  if (contextParts.length === 0 && tx.chainName) {
    contextParts.push(tx.chainName);
  }

  return {
    originHostname,
    intent,
    context: contextParts.join(" · "),
    value: getActivityValue(tx, false),
    compactValue: getActivityValue(tx, true),
  };
}
