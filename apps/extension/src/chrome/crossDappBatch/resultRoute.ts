import { MAX_BATCH_CALLS } from "../provider/limits";
import type { CrossDappBatch } from "./storage";

const MAX_RESULT_ID_LENGTH = 128;

export interface CrossDappBatchResultRoute {
  transactionIds: string[];
  bundleIds: string[];
}

function isBoundedResultId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_RESULT_ID_LENGTH
  );
}

function uniqueBoundedIds(values: readonly unknown[]): string[] | null {
  if (values.length > MAX_BATCH_CALLS) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isBoundedResultId(value)) return null;
    if (!seen.has(value)) {
      seen.add(value);
      ids.push(value);
    }
  }
  return ids;
}

export function parseCrossDappBatchResultRoute(
  value: unknown,
): CrossDappBatchResultRoute | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !Array.isArray(candidate.transactionIds) ||
    !Array.isArray(candidate.bundleIds)
  ) {
    return null;
  }
  const transactionIds = uniqueBoundedIds(candidate.transactionIds);
  const bundleIds = uniqueBoundedIds(candidate.bundleIds);
  if (!transactionIds || !bundleIds) return null;
  if (transactionIds.length + bundleIds.length > MAX_BATCH_CALLS) return null;
  return { transactionIds, bundleIds };
}

export function createCrossDappBatchResultRoute(
  batch: Pick<CrossDappBatch, "entries">,
): CrossDappBatchResultRoute {
  const route = parseCrossDappBatchResultRoute({
    transactionIds: batch.entries.flatMap((entry) =>
      entry.source?.kind === "wallet_sendCalls" ||
      entry.source?.kind === "walletGenerated"
        ? []
        : [entry.txId],
    ),
    bundleIds: batch.entries.flatMap((entry) =>
      entry.source?.kind === "wallet_sendCalls"
        ? [entry.source.bundleId]
        : [],
    ),
  });
  if (!route) throw new Error("Cross-dapp batch has invalid result routes");
  return route;
}
