import { updateBundleStatus } from "./bundleStatusStorage";
import {
  clearCrossDappBatch,
  getCrossDappBatch,
  setCrossDappBatch,
  type CrossDappBatch,
  type CrossDappBatchEntry,
} from "./crossDappBatchStorage";
import { normalizeDappOrigin } from "./dappPermissionStorage";
import { BUNDLE_STATUS } from "./erc5792Types";
import {
  capturePendingRequestAuthorizationCommitSnapshot,
  pendingRequestLifecycleErrors,
  pendingRequestMatchesInjectedOrigin,
  validatePendingRequestAuthorization,
  type PendingRequestLifecycleContext,
} from "./pendingRequestLifecycle";
import { runPendingRequestResolution } from "./pendingRequestResolution";

const CROSS_BATCH_REQUEST_ID = "active";

function sourceKey(entry: CrossDappBatchEntry): string {
  return entry.source?.kind === "wallet_sendCalls"
    ? `batch:${entry.source.bundleId}`
    : `tx:${entry.txId}`;
}

function lifecycleKind(entry: CrossDappBatchEntry) {
  return entry.source?.kind === "wallet_sendCalls"
    ? ("batchTransaction" as const)
    : ("transaction" as const);
}

function lifecycleContext(
  entry: CrossDappBatchEntry,
  batchAccountType?: CrossDappBatch["accountType"],
): PendingRequestLifecycleContext {
  return {
    id:
      entry.source?.kind === "wallet_sendCalls"
        ? entry.source.bundleId
        : entry.txId,
    origin: entry.origin,
    tabId: entry.tabId,
    frameId: entry.frameId,
    senderOrigin: entry.senderOrigin,
    walletConnect: entry.walletConnect,
    trustedInternal: entry.trustedInternal,
    accountType: entry.accountType ?? batchAccountType,
    bankrCredentialTag: entry.bankrCredentialTag,
  };
}

async function writeTransactionFailure(
  entry: CrossDappBatchEntry,
  error: string,
  code: number,
): Promise<void> {
  const { writeResultToStorage } = await import("./txHandlers");
  await writeResultToStorage(`txResult:${entry.txId}`, {
    success: false,
    error,
    code,
  });
}

async function persistRemainingBatch(
  batch: CrossDappBatch,
  removedSourceKeys: ReadonlySet<string>,
): Promise<CrossDappBatchEntry[]> {
  const remaining = batch.entries.filter(
    (entry) => !removedSourceKeys.has(sourceKey(entry)),
  );
  if (remaining.length === 0) {
    await clearCrossDappBatch();
  } else {
    await setCrossDappBatch({ ...batch, entries: remaining });
  }
  return remaining;
}

async function terminalizeSourceGroups(
  batch: CrossDappBatch,
  removedSourceKeys: ReadonlySet<string>,
  error: string,
  code: number,
): Promise<{ transactions: number; bundles: number; removedEntries: number }> {
  if (removedSourceKeys.size === 0) {
    return { transactions: 0, bundles: 0, removedEntries: 0 };
  }

  const removed = batch.entries.filter((entry) =>
    removedSourceKeys.has(sourceKey(entry)),
  );

  // Remove durable pending batch state before publishing any terminal result.
  // If a worker interruption occurs between the two, the operation may need UI
  // recovery but can never later broadcast after already telling a dapp it was
  // rejected.
  await persistRemainingBatch(batch, removedSourceKeys);

  let transactions = 0;
  let bundles = 0;
  const written = new Set<string>();
  for (const entry of removed) {
    const key = sourceKey(entry);
    if (written.has(key)) continue;
    written.add(key);
    if (entry.source?.kind === "wallet_sendCalls") {
      bundles += 1;
      await updateBundleStatus(entry.source.bundleId, {
        status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
        error,
        completedAt: Date.now(),
      });
    } else {
      transactions += 1;
      await writeTransactionFailure(entry, error, code);
    }
  }

  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});
  return { transactions, bundles, removedEntries: removed.length };
}

export interface CrossDappBatchCancellationSummary {
  transactions: number;
  bundles: number;
  removedEntries: number;
}

export type CrossDappBatchAuthorizationCommitResult =
  | { authorized: true }
  | {
      authorized: false;
      error: string;
      terminalize: () => Promise<void>;
    };

export type CrossDappBatchAuthorizationResult =
  | { authorized: false; error: string }
  | {
      authorized: true;
      /** Invoke synchronously with no await immediately before submit. */
      commit: () => CrossDappBatchAuthorizationCommitResult;
    };

const EMPTY_SUMMARY: CrossDappBatchCancellationSummary = {
  transactions: 0,
  bundles: 0,
  removedEntries: 0,
};

export function cancelCrossDappBatchForDappOrigin(
  rawOrigin: string,
): Promise<CrossDappBatchCancellationSummary> {
  const origin = normalizeDappOrigin(rawOrigin);
  if (!origin) return Promise.resolve(EMPTY_SUMMARY);
  return runPendingRequestResolution({
    family: "crossDappBatch",
    requestId: CROSS_BATCH_REQUEST_ID,
    action: "expire",
    conflictResult: () => EMPTY_SUMMARY,
    resolve: async () => {
      const batch = await getCrossDappBatch();
      if (!batch) return EMPTY_SUMMARY;
      const keys = new Set(
        batch.entries
          .filter((entry) =>
            pendingRequestMatchesInjectedOrigin(
              lifecycleContext(entry),
              origin,
            ),
          )
          .map(sourceKey),
      );
      return terminalizeSourceGroups(
        batch,
        keys,
        pendingRequestLifecycleErrors.authorizationRevoked,
        4100,
      );
    },
  });
}

function walletConnectTopicFromOrigin(origin: string): string | null {
  return origin.startsWith("walletconnect:")
    ? origin.slice("walletconnect:".length) || null
    : null;
}

export function cancelCrossDappBatchForWalletConnectTopic(
  topic: string,
): Promise<CrossDappBatchCancellationSummary> {
  if (!topic) return Promise.resolve(EMPTY_SUMMARY);
  return runPendingRequestResolution({
    family: "crossDappBatch",
    requestId: CROSS_BATCH_REQUEST_ID,
    action: "expire",
    conflictResult: () => EMPTY_SUMMARY,
    resolve: async () => {
      const batch = await getCrossDappBatch();
      if (!batch) return EMPTY_SUMMARY;
      const keys = new Set(
        batch.entries
          .filter(
            (entry) =>
              entry.walletConnect?.topic === topic ||
              walletConnectTopicFromOrigin(entry.origin) === topic,
          )
          .map(sourceKey),
      );
      return terminalizeSourceGroups(
        batch,
        keys,
        pendingRequestLifecycleErrors.walletConnectSessionEnded,
        4100,
      );
    },
  });
}

/**
 * Revalidate every distinct source after all recoverable preparation and
 * remove only unauthorized source groups. Old entries without explicit
 * injected/WC provenance (and without trustedInternal) fail closed.
 */
export async function enforceCrossDappBatchAuthorizationAtConfirmation(
  batch: CrossDappBatch,
): Promise<CrossDappBatchAuthorizationResult> {
  const sources = new Map<string, CrossDappBatchEntry>();
  for (const entry of batch.entries) {
    const key = sourceKey(entry);
    if (!sources.has(key)) sources.set(key, entry);
  }

  // Capture every transport epoch before any source performs async tab,
  // permission, or WalletConnect session reads. A final synchronous commit
  // below then proves none of the earlier source checks went stale while a
  // later source was still awaiting.
  const sourceSnapshots = await Promise.all(
    [...sources].map(async ([key, entry]) => ({
      key,
      error:
        entry.walletConnect?.topic || entry.origin.startsWith("walletconnect:")
          ? pendingRequestLifecycleErrors.walletConnectSessionEnded
          : pendingRequestLifecycleErrors.authorizationRevoked,
      snapshot: await capturePendingRequestAuthorizationCommitSnapshot(
        lifecycleContext(entry, batch.accountType),
      ),
    })),
  );

  const unauthorized = new Set<string>();
  let firstError = "Cross-dapp batch authorization is no longer active";

  const validations = await Promise.all(
    [...sources].map(async ([key, entry]) => ({
      key,
      validation: await validatePendingRequestAuthorization(
        lifecycleKind(entry),
        lifecycleContext(entry, batch.accountType),
      ),
    })),
  );
  for (const { key, validation } of validations) {
    if (!validation.authorized) {
      unauthorized.add(key);
      firstError = validation.error;
    }
  }

  if (unauthorized.size > 0) {
    await terminalizeSourceGroups(batch, unauthorized, firstError, 4100);
    return { authorized: false, error: firstError };
  }

  return {
    authorized: true,
    commit: () => {
      const stale = sourceSnapshots.filter(
        ({ snapshot }) => !snapshot.isCurrent(),
      );
      if (stale.length === 0) return { authorized: true };
      const staleKeys = new Set(stale.map(({ key }) => key));
      const error = stale[0].error;
      return {
        authorized: false,
        error,
        terminalize: async () => {
          await terminalizeSourceGroups(batch, staleKeys, error, 4100);
        },
      };
    },
  };
}
