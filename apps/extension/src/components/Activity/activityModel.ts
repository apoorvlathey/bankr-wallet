import type {
  ClearSignedMeta,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";

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

export function formatTimeAgo(timestamp: number, now: number): string {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Format a decimal amount string for the compact activity row. */
export function formatActivityAmount(value: string): string {
  const [integer = "0", decimal = ""] = value.split(".");
  const digits = integer.length;
  if (digits <= 9) {
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const trimmed = decimal.replace(/0+$/, "").slice(0, 6);
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

function getCounterpartyDisplay(meta: ClearSignedMeta): string {
  if (meta.counterpartyLabel) return meta.counterpartyLabel;
  if (meta.counterpartyEns) return meta.counterpartyEns;
  const address = meta.counterparty;
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

function getActivityValue(tx: CompletedTransaction): string | null {
  if (tx.transferMeta) {
    return `−${formatActivityAmount(tx.transferMeta.amount)} ${tx.transferMeta.symbol}`;
  }
  const meta = tx.clearSignedMeta;
  if (!meta || !meta.tokenSymbol) return null;
  if (meta.kind === "erc7730" || meta.isRevoke) return null;
  if (meta.isInfinite) return `Unlimited ${meta.tokenSymbol}`;
  if (!meta.amount) return null;
  const prefix =
    meta.kind === "transfer" || meta.kind === "nativeSend" ? "−" : "";
  return `${prefix}${formatActivityAmount(meta.amount)} ${meta.tokenSymbol}`;
}

function getClearSignedContext(meta: ClearSignedMeta): string | null {
  const counterparty = getCounterpartyDisplay(meta);
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
            ? tx.functionName
            : tx.origin;

  const contextParts: string[] = [];
  const clearSignedContext = tx.clearSignedMeta
    ? getClearSignedContext(tx.clearSignedMeta)
    : null;
  if (clearSignedContext) contextParts.push(clearSignedContext);
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
    value: getActivityValue(tx),
  };
}
